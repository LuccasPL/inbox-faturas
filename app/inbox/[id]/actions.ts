'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { faturasDraft, emails } from '@/lib/db/schema';
import { decrypt } from '@/lib/crypto';
import * as moloni from '@/lib/moloni/api';
import { MoloniApiError } from '@/lib/moloni/client';
import {
  mapDraftToInvoice,
  type DraftItem,
  type SupportedIvaRate,
} from '@/lib/moloni/map-draft-to-invoice';
import { requireDraftOwnership } from '@/lib/auth/tenant';
import { isValidNifPt } from '@/lib/validation/nif-pt';

interface DraftEditavel {
  clienteNome: string | null;
  clienteNif: string | null;
  clienteEmail: string | null;
  clienteMorada: string | null;
  items: Array<{
    descricao: string;
    quantidade: number;
    preco_unitario: number;
    iva_percentagem: number;
  }>;
  subtotal: number | null;
  ivaValor: number | null;
  total: number | null;
  iban: string | null;
  prazoPagamento: string | null;
  observacoes: string | null;
}

type DraftUpdate = Partial<typeof faturasDraft.$inferInsert>;

const EDITABLE_STATUSES = new Set(['pendente_revisao', 'falha_emissao']);
const BLOCKING_EMISSION_STATUSES = [
  'emitida',
  'rascunho_moloni',
  'emissao_em_curso',
  'emitida_proforma',
] as const;

function assertDraftEditable(status: string | null): void {
  if (status && !EDITABLE_STATUSES.has(status)) {
    throw new Error('Este draft já está concluído e não pode ser editado.');
  }
}

function buildDraftUpdate(dados: Partial<DraftEditavel>): DraftUpdate {
  const updateData: DraftUpdate = {};

  if (dados.clienteNome !== undefined) updateData.clienteNome = dados.clienteNome;
  if (dados.clienteNif !== undefined) updateData.clienteNif = dados.clienteNif;
  if (dados.clienteEmail !== undefined) updateData.clienteEmail = dados.clienteEmail;
  if (dados.clienteMorada !== undefined) updateData.clienteMorada = dados.clienteMorada;
  if (dados.items !== undefined) updateData.items = dados.items;
  if (dados.iban !== undefined) updateData.iban = dados.iban;
  if (dados.prazoPagamento !== undefined) {
    updateData.prazoPagamento = dados.prazoPagamento;
  }
  if (dados.observacoes !== undefined) updateData.observacoes = dados.observacoes;
  if (dados.subtotal !== undefined) {
    updateData.subtotal = dados.subtotal?.toString() ?? null;
  }
  if (dados.ivaValor !== undefined) {
    updateData.ivaValor = dados.ivaValor?.toString() ?? null;
  }
  if (dados.total !== undefined) {
    updateData.total = dados.total?.toString() ?? null;
  }

  return updateData;
}

export async function atualizarDraft(
  draftId: string,
  dados: Partial<DraftEditavel>,
) {
  const { draft } = await requireDraftOwnership(draftId);
  assertDraftEditable(draft.status);

  await db
    .update(faturasDraft)
    .set(buildDraftUpdate(dados))
    .where(eq(faturasDraft.id, draftId));

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${draft.emailId}`);
}

export async function aprovarDraft(draftId: string) {
  const { draft } = await requireDraftOwnership(draftId);
  const { userId } = await auth();

  assertDraftEditable(draft.status);

  const dadosFinais = {
    cliente_nome: draft.clienteNome,
    cliente_nif: draft.clienteNif,
    cliente_email: draft.clienteEmail,
    cliente_morada: draft.clienteMorada,
    items: draft.items,
    subtotal: draft.subtotal,
    iva_valor: draft.ivaValor,
    total: draft.total,
    iban: draft.iban,
    prazo_pagamento: draft.prazoPagamento,
    observacoes: draft.observacoes,
  };

  await db
    .update(faturasDraft)
    .set({
      status: 'aprovado',
      reviewedAt: new Date(),
      reviewedBy: userId,
      dadosFinais,
    })
    .where(eq(faturasDraft.id, draftId));

  if (draft.emailId) {
    await db
      .update(emails)
      .set({ status: 'approved' })
      .where(eq(emails.id, draft.emailId));
  }

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${draft.emailId}`);
}

export async function rejeitarDraft(draftId: string) {
  const { draft } = await requireDraftOwnership(draftId);
  const { userId } = await auth();

  assertDraftEditable(draft.status);

  await db
    .update(faturasDraft)
    .set({
      status: 'rejeitado',
      reviewedAt: new Date(),
      reviewedBy: userId,
    })
    .where(eq(faturasDraft.id, draftId));

  if (draft.emailId) {
    await db
      .update(emails)
      .set({ status: 'rejected' })
      .where(eq(emails.id, draft.emailId));
  }

  revalidatePath('/inbox');
  revalidatePath(`/inbox/${draft.emailId}`);
}

export interface EmitirResult {
  ok: boolean;
  error?: string;
  documentId?: number;
  documentNumber?: number;
  /** Nº de proforma quando a estratégia foi 'pdf_proforma' */
  proformaNumero?: number;
}

export async function emitirFatura(
  draftId: string,
  opts: { finalize: boolean },
): Promise<EmitirResult> {
  const ownership = await requireDraftOwnership(draftId).catch(
    (err: unknown) => err as Error,
  );
  if (ownership instanceof Error) {
    return { ok: false, error: ownership.message };
  }

  const { draft, tenant } = ownership;

  if (draft.moloniDocumentId) {
    return {
      ok: false,
      error:
        'Este draft já tem documento Moloni associado. Abre o Moloni para editar/finalizar esse documento; a app não vai criar outro.',
    };
  }

  if (
    draft.status &&
    BLOCKING_EMISSION_STATUSES.includes(
      draft.status as (typeof BLOCKING_EMISSION_STATUSES)[number],
    )
  ) {
    return { ok: false, error: 'Este draft já foi emitido.' };
  }

  if (!draft.clienteNome) {
    return { ok: false, error: 'Cliente sem nome' };
  }

  if (draft.clienteNif && !isValidNifPt(draft.clienteNif)) {
    return {
      ok: false,
      error: 'NIF do cliente inválido. Corrige antes de emitir.',
    };
  }

  const items = (draft.items as DraftItem[] | null) ?? [];
  if (items.length === 0) {
    return { ok: false, error: 'Draft sem itens' };
  }

  // -------------------------- Estratégia "PDF proforma" --------------------
  if (tenant.emissaoVia === 'pdf_proforma') {
    return emitirComoProforma({ draftId, tenant, draft });
  }

  // -------------------------- Estratégia Moloni ----------------------------
  if (
    !tenant.moloniApiKeyEnc ||
    !tenant.moloniCompanyId ||
    !tenant.moloniDefaultDocSetId ||
    !tenant.moloniFallbackProductId
  ) {
    return {
      ok: false,
      error: 'Moloni não configurado - vai a /settings',
    };
  }

  if (tenant.moloniDefaultDocType && tenant.moloniDefaultDocType !== 1) {
    return {
      ok: false,
      error: 'Neste momento a app só suporta emissão de Fatura no Moloni.',
    };
  }

  if (!tenant.moloniTaxId23) {
    return {
      ok: false,
      error:
        'Mapa de IVA incompleto. Define pelo menos o tax para 23% em /settings.',
    };
  }
  const taxIdsByRate = buildTaxIdsByRate(tenant);
  const ratesUsadas = new Set(
    items.map((it) => Math.round(it.iva_percentagem ?? 23) as SupportedIvaRate),
  );
  for (const rate of ratesUsadas) {
    if (!taxIdsByRate[rate]) {
      return {
        ok: false,
        error: `Taxa IVA ${rate}% sem mapeamento. Vai a /settings e escolhe o tax Moloni para ${rate}%.`,
      };
    }
  }

  const [locked] = await db
    .update(faturasDraft)
    .set({ status: 'emissao_em_curso', emitError: null })
    .where(
      and(
        eq(faturasDraft.id, draftId),
        eq(faturasDraft.tenantId, tenant.id),
        isNull(faturasDraft.moloniDocumentId),
      ),
    )
    .returning({ id: faturasDraft.id });

  if (!locked) {
    return {
      ok: false,
      error: 'Este draft já está a ser emitido ou já tem documento Moloni.',
    };
  }

  try {
    const apiKey = decrypt(tenant.moloniApiKeyEnc);

    const customer = await moloni.findOrCreateCustomer(
      apiKey,
      tenant.moloniCompanyId,
      {
        nif: draft.clienteNif,
        nome: draft.clienteNome,
        email: draft.clienteEmail,
        morada: draft.clienteMorada,
      },
    );

    const payload = mapDraftToInvoice(
      {
        items,
        observacoes: draft.observacoes,
        prazoPagamento: draft.prazoPagamento,
      },
      customer.customerId,
      {
        documentSetId: tenant.moloniDefaultDocSetId,
        fallbackProductId: tenant.moloniFallbackProductId,
        taxIdsByRate,
      },
      { finalize: opts.finalize },
    );

    const created = await moloni.invoiceCreate(
      apiKey,
      tenant.moloniCompanyId,
      payload,
    );

    await db
      .update(faturasDraft)
      .set({
        moloniDocumentId: created.documentId,
        emittedAt: new Date(),
        emitError: null,
        status: opts.finalize ? 'emitida' : 'rascunho_moloni',
      })
      .where(eq(faturasDraft.id, draftId));

    if (draft.emailId) {
      await db
        .update(emails)
        .set({ status: opts.finalize ? 'emitted' : 'draft_moloni' })
        .where(eq(emails.id, draft.emailId));
    }

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);

    return {
      ok: true,
      documentId: created.documentId,
      documentNumber: created.number,
    };
  } catch (err) {
    const msg =
      err instanceof MoloniApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Erro desconhecido';

    await db
      .update(faturasDraft)
      .set({ emitError: msg, status: 'falha_emissao' })
      .where(eq(faturasDraft.id, draftId));

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);
    return { ok: false, error: msg };
  }
}

/* -------------------------------------------------------------------------- */
/*  Estratégia: PDF proforma                                                  */
/* -------------------------------------------------------------------------- */

async function emitirComoProforma({
  draftId,
  tenant,
  draft,
}: {
  draftId: string;
  tenant: {
    id: string;
    nome: string;
    empresaNif: string | null;
    empresaMorada: string | null;
    empresaIban: string | null;
  };
  draft: { emailId: string | null };
}): Promise<EmitirResult> {
  try {
    const numero = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`proforma:${tenant.id}`}))`,
      );

      const [locked] = await tx
        .update(faturasDraft)
        .set({ status: 'emissao_em_curso', emitError: null })
        .where(
          and(
            eq(faturasDraft.id, draftId),
            eq(faturasDraft.tenantId, tenant.id),
            isNull(faturasDraft.moloniDocumentId),
            isNull(faturasDraft.proformaNumero),
            sql`coalesce(${faturasDraft.status}, '') not in (${sql.join(
              BLOCKING_EMISSION_STATUSES.map((status) => sql`${status}`),
              sql`, `,
            )})`,
          ),
        )
        .returning({ id: faturasDraft.id });

      if (!locked) {
        return null;
      }

      const [maxRow] = await tx
        .select({
          max: sql<number>`coalesce(max(${faturasDraft.proformaNumero}), 0)`,
        })
        .from(faturasDraft)
        .where(eq(faturasDraft.tenantId, tenant.id));

      const nextNumero = (maxRow?.max ?? 0) + 1;

      await tx
        .update(faturasDraft)
        .set({
          proformaNumero: nextNumero,
          emittedAt: new Date(),
          emittedVia: 'pdf_proforma',
          emitError: null,
          status: 'emitida_proforma',
        })
        .where(eq(faturasDraft.id, draftId));

      if (draft.emailId) {
        await tx
          .update(emails)
          .set({ status: 'emitted_proforma' })
          .where(eq(emails.id, draft.emailId));
      }

      return nextNumero;
    });

    if (!numero) {
      return {
        ok: false,
        error: 'Este draft já está a ser emitido ou já foi emitido.',
      };
    }

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);

    return {
      ok: true,
      proformaNumero: numero,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Erro desconhecido na proforma';
    await db
      .update(faturasDraft)
      .set({ emitError: msg, status: 'falha_emissao' })
      .where(eq(faturasDraft.id, draftId));
    return { ok: false, error: msg };
  }
}

/* -------------------------------------------------------------------------- */
/*  Envio da proforma ao cliente                                              */
/* -------------------------------------------------------------------------- */

export interface EnviarProformaResult {
  ok: boolean;
  error?: string;
  sentTo?: string;
}

export async function enviarProforma(
  draftId: string,
  /** Override opcional do email para envio (senão usa draft.clienteEmail). */
  overrideTo?: string,
): Promise<EnviarProformaResult> {
  const ownership = await requireDraftOwnership(draftId).catch(
    (err: unknown) => err as Error,
  );
  if (ownership instanceof Error) {
    return { ok: false, error: ownership.message };
  }
  const { draft, tenant } = ownership;

  if (draft.status !== 'emitida_proforma' || !draft.proformaNumero) {
    return {
      ok: false,
      error: 'Só posso enviar proforma de drafts já emitidos como proforma.',
    };
  }

  const to = (overrideTo ?? draft.clienteEmail ?? '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return {
      ok: false,
      error: 'Cliente sem email válido. Preenche o email antes de enviar.',
    };
  }

  if (!tenant.emailInbound || tenant.emailInbound.endsWith('@pending.invalid')) {
    return {
      ok: false,
      error:
        'Sem endereço de remetente configurado. Define email inbound em /settings.',
    };
  }

  try {
    const { renderProformaPdf } = await import('@/lib/emission/pdf-proforma');
    const { sendEmail, PostmarkOutboundError } = await import(
      '@/lib/email/postmark-outbound'
    );

    const items =
      (draft.items as Array<{
        descricao: string;
        quantidade: number;
        preco_unitario: number;
        iva_percentagem: number;
      }> | null) ?? [];

    const buffer = await renderProformaPdf({
      numero: draft.proformaNumero,
      data: draft.emittedAt ?? new Date(),
      emitente: {
        nome: tenant.nome,
        nif: tenant.empresaNif,
        morada: tenant.empresaMorada,
        email: tenant.emailInbound,
        iban: tenant.empresaIban,
      },
      cliente: {
        nome: draft.clienteNome ?? 'Cliente',
        nif: draft.clienteNif,
        email: draft.clienteEmail,
        morada: draft.clienteMorada,
      },
      items,
      observacoes: draft.observacoes,
      prazoPagamento: draft.prazoPagamento,
    });

    const numFormatado = String(draft.proformaNumero).padStart(6, '0');
    const subject = `Proforma ${numFormatado} — ${tenant.nome}`;
    const totalEur = draft.total
      ? new Intl.NumberFormat('pt-PT', {
          style: 'currency',
          currency: 'EUR',
        }).format(parseFloat(draft.total))
      : null;

    const html = renderProformaEmailHtml({
      tenantNome: tenant.nome,
      clienteNome: draft.clienteNome ?? '',
      numero: numFormatado,
      totalEur,
    });

    try {
      await sendEmail({
        from: tenant.emailInbound,
        to,
        replyTo: tenant.emailInbound,
        subject,
        htmlBody: html,
        pdfAttachment: {
          filename: `proforma-${numFormatado}.pdf`,
          base64: buffer.toString('base64'),
        },
      });
    } catch (err) {
      const msg =
        err instanceof PostmarkOutboundError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Erro desconhecido';
      return { ok: false, error: `Envio falhou: ${msg}` };
    }

    await db
      .update(faturasDraft)
      .set({
        proformaSentAt: new Date(),
        proformaSentTo: to,
      })
      .where(eq(faturasDraft.id, draftId));

    revalidatePath(`/inbox/${draft.emailId}`);
    return { ok: true, sentTo: to };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro inesperado',
    };
  }
}

function renderProformaEmailHtml(input: {
  tenantNome: string;
  clienteNome: string;
  numero: string;
  totalEur: string | null;
}): string {
  const saudacao = input.clienteNome
    ? `Olá ${escapeHtml(input.clienteNome)},`
    : 'Olá,';
  return `<!doctype html>
<html lang="pt">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#1f2937; line-height:1.55; padding:24px; max-width:560px; margin:auto;">
  <p>${saudacao}</p>
  <p>Em anexo segue a proforma <strong>n.º ${escapeHtml(input.numero)}</strong>${input.totalEur ? ` no valor de <strong>${escapeHtml(input.totalEur)}</strong>` : ''}, conforme o pedido recebido.</p>
  <p>Para qualquer ajuste, responde a este email. A fatura legal será emitida após confirmação.</p>
  <p>Obrigado,<br>${escapeHtml(input.tenantNome)}</p>
  <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0">
  <p style="font-size:12px; color:#9ca3af;">Documento proforma — sem valor fiscal.</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Constrói o mapa taxa → taxId a partir das colunas guardadas no tenant.
 * Cada empresa Moloni tem os seus próprios IDs (configurados em /settings).
 */
function buildTaxIdsByRate(tenant: {
  moloniTaxId23: number | null;
  moloniTaxId13: number | null;
  moloniTaxId6: number | null;
  moloniTaxId0: number | null;
}): Partial<Record<SupportedIvaRate, number>> {
  const map: Partial<Record<SupportedIvaRate, number>> = {};
  if (tenant.moloniTaxId23) map[23] = tenant.moloniTaxId23;
  if (tenant.moloniTaxId13) map[13] = tenant.moloniTaxId13;
  if (tenant.moloniTaxId6) map[6] = tenant.moloniTaxId6;
  if (tenant.moloniTaxId0) map[0] = tenant.moloniTaxId0;
  return map;
}
