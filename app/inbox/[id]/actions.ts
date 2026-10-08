'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { faturasDraft, emails } from '@/lib/db/schema';
import { decrypt } from '@/lib/crypto';
import * as moloni from '@/lib/moloni/api';
import { MoloniApiError, safeMoloniError } from '@/lib/moloni/client';
import {
  mapDraftToInvoice,
  type SupportedIvaRate,
} from '@/lib/moloni/map-draft-to-invoice';
import { triggerN8nEvent } from '@/lib/automation/n8n';
import { requireDraftOwnership } from '@/lib/auth/tenant';
import { isValidIbanPt } from '@/lib/validation/iban-pt';
import { isValidNifPt } from '@/lib/validation/nif-pt';
import { ExternalRequestError } from '@/lib/security/http';
import { RATE_LIMITS } from '@/lib/security/policies';
import { actionRateLimitError } from '@/lib/security/rate-limit';

import { mutateOwnedDraft, normalizedFinancials, finalDraftData, emissionSnapshotCondition } from '@/lib/drafts/mutations';
import { DraftValidationError, validateDraftForReview, type DraftPatch, type DraftActionResult } from '@/lib/validation/draft';
import { calculateDocumentTotals, calculationVersion } from '@/lib/faturas/totals';
import { changeProformaShare } from '@/lib/proformas/sharing';
import type { ShareOptions } from '@/lib/proformas/share-policy';
import { isInboundAuthorized, isRealInboundAddress } from '@/lib/settings/inbound-policy';
import { isEmailBusy } from '@/lib/extraction/queue-policy';

const EDITABLE_STATUSES = ['pendente_revisao', 'falha_emissao'] as const;
const EDITABLE_STATUS_SET = new Set<string>(EDITABLE_STATUSES);
const BLOCKING_EMISSION_STATUSES = ['emitida', 'rascunho_moloni', 'emissao_em_curso', 'emitida_proforma'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertDraftEmittable(status: string | null): void {
  if (!EDITABLE_STATUS_SET.has(status ?? 'pendente_revisao')) {
    throw new DraftValidationError('Este draft já está concluído e não pode ser emitido.');
  }
}

function draftActionError(error: unknown): string {
  if (error instanceof DraftValidationError) return error.message;
  console.error('[draft] Não foi possível concluir a operação.');
  return 'Não foi possível concluir a operação. Tenta novamente mais tarde.';
}

function getProformaSetupError(tenant: {
  emailInbound: string;
  empresaNif: string | null;
  empresaMorada: string | null;
  empresaIban: string | null;
}): string | null {
  if (!isRealInboundAddress(tenant.emailInbound)) {
    return 'Configuração incompleta para proforma: o endereço da empresa requer atribuição administrativa.';
  }
  if (!tenant.empresaNif) {
    return 'Configuração incompleta para proforma: define o NIF da empresa em /settings.';
  }
  if (!isValidNifPt(tenant.empresaNif)) {
    return 'Configuração incompleta para proforma: o NIF da empresa em /settings é inválido.';
  }
  if (!tenant.empresaMorada?.trim()) {
    return 'Configuração incompleta para proforma: define a morada da empresa em /settings.';
  }
  if (tenant.empresaIban && !isValidIbanPt(tenant.empresaIban)) {
    return 'Configuração incompleta para proforma: o IBAN da empresa em /settings é inválido.';
  }
  return null;
}

export async function atualizarDraft(draftId: string, dados: DraftPatch): Promise<DraftActionResult> {
  try {
    const { tenant } = await requireDraftOwnership(draftId);
    const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.mutation);
    if (limitError) return { ok: false, error: limitError };
    const draft = await mutateOwnedDraft(draftId, tenant.id, { kind: 'edit', data: dados });
    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: draftActionError(error) };
  }
}

async function reviewDraft(draftId: string, kind: 'approve' | 'reject'): Promise<DraftActionResult> {
  try {
    const { tenant } = await requireDraftOwnership(draftId);
    const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.mutation);
    if (limitError) return { ok: false, error: limitError };
    const { userId } = await auth();
    const draft = await mutateOwnedDraft(draftId, tenant.id, { kind, userId });
    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);
    await triggerN8nEvent({
      event: kind === 'approve' ? 'draft.approved' : 'draft.rejected',
      occurredAt: draft.reviewedAt!, tenant, draft, review: { by: userId },
    }).catch(() => console.warn('[n8n] Falha ao enviar evento de revisão.'));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: draftActionError(error) };
  }
}

export async function aprovarDraft(draftId: string): Promise<DraftActionResult> {
  return reviewDraft(draftId, 'approve');
}

export async function rejeitarDraft(draftId: string): Promise<DraftActionResult> {
  return reviewDraft(draftId, 'reject');
}

export interface EmitirResult {
  ok: boolean;
  error?: string;
  documentId?: number;
  documentNumber?: number;
  /** Nº de proforma quando a estratégia foi 'pdf_proforma' */
  proformaNumero?: number;
  sentTo?: string;
  warning?: string;
}

export async function emitirFatura(
  draftId: string,
  opts: { finalize: boolean },
): Promise<EmitirResult> {
  const ownership = await requireDraftOwnership(draftId).catch(
    (err: unknown) => err as Error,
  );
  if (ownership instanceof Error) {
    return { ok: false, error: draftActionError(ownership) };
  }

  const { tenant } = ownership;
  let draft = ownership.draft;
  const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.emission);
  if (limitError) return { ok: false, error: limitError };
  const { userId } = await auth();

  try {
    assertDraftEmittable(draft.status);
    if (!opts || typeof opts.finalize !== 'boolean') throw new DraftValidationError('Opção de emissão inválida.');
    draft = { ...draft, ...normalizedFinancials(validateDraftForReview(draft)) };
  } catch (err) {
    return {
      ok: false,
      error: draftActionError(err),
    };
  }

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

  const items = validateDraftForReview(draft);
  if (items.length === 0) {
    return { ok: false, error: 'Draft sem itens' };
  }
  const reviewedAt = new Date();
  const dadosFinais = finalDraftData(draft);
  draft = { ...draft, dadosFinais };

  // -------------------------- Estratégia "PDF proforma" --------------------
  if (tenant.emissaoVia === 'pdf_proforma') {
    const proformaSetupError = getProformaSetupError(tenant);
    if (proformaSetupError) {
      return { ok: false, error: proformaSetupError };
    }

    return emitirComoProforma({
      draftId,
      tenant,
      draft,
      sourceDraft: ownership.draft,
      review: {
        reviewedAt,
        reviewedBy: userId ?? null,
        dadosFinais,
      },
    });
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
    items.map((it) => it.iva_percentagem as SupportedIvaRate),
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
    .set({
      status: 'emissao_em_curso',
      emitError: null,
      ...normalizedFinancials(items),
      reviewedAt,
      reviewedBy: userId ?? null,
      dadosFinais,
    })
    .where(
      and(
        eq(faturasDraft.id, draftId),
        eq(faturasDraft.tenantId, tenant.id),
        emissionSnapshotCondition(ownership.draft),
        isNull(faturasDraft.moloniDocumentId),
        sql`coalesce(${faturasDraft.status}, 'pendente_revisao') in (${sql.join(
          EDITABLE_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ id: faturasDraft.id });

  if (!locked) {
    return {
      ok: false,
      error: 'O draft foi alterado ou já está em emissão. Atualiza a página antes de continuar.',
    };
  }

  let invoiceRequestStarted = false;
  try {
    const apiKey = decrypt(tenant.moloniApiKeyEnc);

    const customer = await moloni.findOrCreateCustomer(
      apiKey,
      tenant.moloniCompanyId,
      {
        nif: draft.clienteNif,
        nome: draft.clienteNome!,
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

    invoiceRequestStarted = true;
    const created = await moloni.invoiceCreate(
      apiKey,
      tenant.moloniCompanyId,
      payload,
    );
    const emittedAt = new Date();

    await db
      .update(faturasDraft)
      .set({
        moloniDocumentId: created.documentId,
        emittedAt,
        emittedVia: 'moloni',
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

    await triggerN8nEvent({
      event: opts.finalize ? 'invoice.emitted' : 'invoice.draft_created',
      occurredAt: emittedAt,
      tenant,
      draft: {
        ...draft,
        status: opts.finalize ? 'emitida' : 'rascunho_moloni',
        emittedAt,
        emittedVia: 'moloni',
        moloniDocumentId: created.documentId,
      },
      emission: {
        via: 'moloni',
        finalized: opts.finalize,
        documentId: created.documentId,
        documentNumber: created.number,
      },
    }).catch((err) => {
      console.warn('Falha ao enviar evento N8N (moloni):', err);
    });

    return {
      ok: true,
      documentId: created.documentId,
      documentNumber: created.number,
    };
  } catch (err) {
    const outcomeUnknown = invoiceRequestStarted && (
      !(err instanceof MoloniApiError) || err.outcomeUnknown
    );
    const msg =
      err instanceof MoloniApiError
        ? safeMoloniError(err)
        : 'Não foi possível concluir a emissão. Tenta novamente mais tarde.';

    await db
      .update(faturasDraft)
      .set({
        emitError: outcomeUnknown
          ? `Resultado da emissão não confirmado. Verifica no Moloni antes de tentar novamente. ${msg}`
          : msg,
        status: outcomeUnknown ? 'emissao_em_curso' : 'falha_emissao',
      })
      .where(eq(faturasDraft.id, draftId));

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);
    return { ok: false, error: outcomeUnknown ? 'Resultado da emissão não confirmado. Verifica no Moloni para evitar uma fatura duplicada.' : msg };
  }
}

/* -------------------------------------------------------------------------- */
/*  Estratégia: PDF proforma                                                  */
/* -------------------------------------------------------------------------- */

async function emitirComoProforma({
  draftId,
  tenant,
  draft,
  sourceDraft,
  review,
}: {
  draftId: string;
  tenant: {
    id: string;
    nome: string;
    emailInbound: string;
    emailInboundAuthorizedAddress: string | null;
    emailInboundAuthorizedAt: Date | null;
    emissaoVia: string | null;
    empresaNif: string | null;
    empresaMorada: string | null;
    empresaIban: string | null;
  };
  draft: typeof faturasDraft.$inferSelect;
  sourceDraft: typeof faturasDraft.$inferSelect;
  review: {
    reviewedAt: Date;
    reviewedBy: string | null;
    dadosFinais: Record<string, unknown>;
  };
}): Promise<EmitirResult> {
  try {
    const emittedAt = new Date();
    const numero = await db.transaction(async (tx) => {
      if (draft.emailId) {
        const [email] = await tx.select({ status: emails.status }).from(emails)
          .where(and(eq(emails.id, draft.emailId), eq(emails.tenantId, tenant.id))).for('update');
        if (!email || isEmailBusy(email.status)) return null;
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`proforma:${tenant.id}`}))`,
      );

      const [locked] = await tx
        .update(faturasDraft)
        .set({
          status: 'emissao_em_curso',
          emitError: null,
          ...normalizedFinancials(validateDraftForReview(draft)),
          reviewedAt: review.reviewedAt,
          reviewedBy: review.reviewedBy,
          dadosFinais: review.dadosFinais,
        })
        .where(
          and(
            eq(faturasDraft.id, draftId),
            eq(faturasDraft.tenantId, tenant.id),
            emissionSnapshotCondition(sourceDraft),
            isNull(faturasDraft.moloniDocumentId),
            isNull(faturasDraft.proformaNumero),
            sql`coalesce(${faturasDraft.status}, 'pendente_revisao') in (${sql.join(
              EDITABLE_STATUSES.map((status) => sql`${status}`),
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
          emittedAt,
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
        error: 'O draft foi alterado ou já está em emissão. Atualiza a página antes de continuar.',
      };
    }

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);

    await triggerN8nEvent({
      event: 'proforma.emitted',
      occurredAt: emittedAt,
      tenant,
      draft: {
        ...draft,
        status: 'emitida_proforma',
        emittedAt,
        emittedVia: 'pdf_proforma',
        proformaNumero: numero,
      },
      emission: {
        via: 'pdf_proforma',
        proformaNumero: numero,
      },
    }).catch((err) => {
      console.warn('Falha ao enviar evento N8N (proforma.emitted):', err);
    });

    const emittedDraft = {
      ...draft,
      dadosFinais: review.dadosFinais,
      status: 'emitida_proforma',
      emittedAt,
      emittedVia: 'pdf_proforma',
      proformaNumero: numero,
    } satisfies typeof faturasDraft.$inferSelect;

    const autoSend = await sendProformaToClient({
      draftId,
      draft: emittedDraft,
      tenant,
    });

    if (autoSend.ok) {
      return {
        ok: true,
        proformaNumero: numero,
        sentTo: autoSend.sentTo,
      };
    }

    return {
      ok: true,
      proformaNumero: numero,
      warning: `Proforma emitida, mas não enviada: ${autoSend.error}`,
    };
  } catch (err) {
    const msg = draftActionError(err);
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

export interface GerarLinkProformaResult {
  ok: boolean;
  error?: string;
  url?: string;
  token?: string;
  expiresAt?: string;
}

/**
 * Cria (ou devolve) um token público para a proforma deste draft.
 * O cliente pode usar este link para ver e descarregar o PDF sem login.
 *
 * Copiar um link ativo conserva o prazo. Renovar cria outro token.
 */
export async function gerarLinkProforma(
  draftId: string,
  options: ShareOptions = {},
): Promise<GerarLinkProformaResult> {
  try {
    const { tenant } = await requireDraftOwnership(draftId);
    const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.mutation);
    if (limitError) return { ok: false, error: limitError };
    const share = await changeProformaShare(draftId, tenant.id, 'get', options);
    if (!share.token || !share.expiresAt) throw new Error('Share unavailable');
    revalidatePath(`/inbox/${share.emailId}`);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://www.inbox-faturas.pt';
    return { ok: true, url: `${base.replace(/\/$/, '')}/p/${share.token}`, token: share.token,
      expiresAt: share.expiresAt.toISOString() };
  } catch (error) {
    return { ok: false, error: draftActionError(error) };
  }
}

export async function revogarLinkProforma(draftId: string, expectedToken: string | null): Promise<DraftActionResult> {
  try {
    const { tenant } = await requireDraftOwnership(draftId);
    const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.mutation);
    if (limitError) return { ok: false, error: limitError };
    const share = await changeProformaShare(draftId, tenant.id, 'revoke', { expectedToken });
    revalidatePath(`/inbox/${share.emailId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: draftActionError(error) };
  }
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
    return { ok: false, error: draftActionError(ownership) };
  }
  const { draft, tenant } = ownership;

  if (draft.status !== 'emitida_proforma' || !draft.proformaNumero) {
    return {
      ok: false,
      error: 'Só posso enviar proforma de drafts já emitidos como proforma.',
    };
  }

  const result = await sendProformaToClient({
    draftId,
    draft,
    tenant,
    overrideTo,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, sentTo: result.sentTo };
}

async function sendProformaToClient(input: {
  draftId: string;
  draft: typeof faturasDraft.$inferSelect;
  tenant: {
    id: string;
    nome: string;
    emailInbound: string;
    emailInboundAuthorizedAddress: string | null;
    emailInboundAuthorizedAt: Date | null;
    emissaoVia: string | null;
    empresaNif: string | null;
    empresaMorada: string | null;
    empresaIban: string | null;
  };
  overrideTo?: string;
}): Promise<EnviarProformaResult> {
  const { draftId, draft, tenant, overrideTo } = input;
  if (!draft.proformaNumero) {
    return {
      ok: false,
      error: 'Proforma ainda sem número atribuído.',
    };
  }

  const to = (overrideTo ?? draft.clienteEmail ?? '').trim();
  if (!to || !EMAIL_RE.test(to)) {
    return {
      ok: false,
      error: 'Cliente sem email válido. Preenche o email antes de enviar.',
    };
  }

  if (!isInboundAuthorized(tenant)) {
    return {
      ok: false,
      error:
        'O endereço de remetente requer autorização administrativa. Confirma o estado nas definições.',
    };
  }

  const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.send);
  if (limitError) return { ok: false, error: limitError };
  const draftLimitError = await actionRateLimitError(`${tenant.id}:${draftId}`, RATE_LIMITS.sendDraft);
  if (draftLimitError) return { ok: false, error: draftLimitError };

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
      calculoVersao: calculationVersion(draft.dadosFinais),
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
    const totalEur = new Intl.NumberFormat('pt-PT', {
          style: 'currency',
          currency: 'EUR',
        }).format(calculateDocumentTotals(items, calculationVersion(draft.dadosFinais)).total);

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
      if (err instanceof ExternalRequestError) {
        return { ok: false, error: 'Envio não confirmado. Verifica no Postmark se o email foi aceite antes de reenviar.' };
      }
      const msg =
        err instanceof PostmarkOutboundError
          ? 'O Postmark recusou o envio. Confirma o remetente, o destinatário e a configuração.'
          : 'Não foi possível concluir o envio. Tenta novamente mais tarde.';
      return { ok: false, error: `Envio falhou: ${msg}` };
    }

    const proformaSentAt = new Date();
    await db
      .update(faturasDraft)
      .set({
        proformaSentAt,
        proformaSentTo: to,
      })
      .where(eq(faturasDraft.id, draftId));

    revalidatePath('/inbox');
    revalidatePath(`/inbox/${draft.emailId}`);

    await triggerN8nEvent({
      event: 'proforma.sent',
      occurredAt: proformaSentAt,
      tenant,
      draft: {
        ...draft,
        proformaSentAt,
        proformaSentTo: to,
      },
      emission: {
        via: 'pdf_proforma',
        proformaNumero: draft.proformaNumero,
        sentTo: to,
      },
    }).catch((err) => {
      console.warn('Falha ao enviar evento N8N (proforma.sent):', err);
    });

    return { ok: true, sentTo: to };
  } catch (err) {
    return {
      ok: false,
      error: draftActionError(err),
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
