import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { emails, tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';
import { triarEmail, ResultadoTriagem } from '@/lib/extraction/triagem-email';
import { extractPdfAttachments } from '@/lib/extraction/attachments';
import { buscarHistoricoCliente } from '@/lib/extraction/historico-cliente';
import { verifyPostmarkAuth } from '@/lib/auth/postmark';
import { notifyRelevantInboundEmail } from '@/lib/email/relevant-request-notification';
import { replaceDraftForEmail } from '@/lib/drafts/persist-extraction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostmarkInboundPayload {
  MessageID?: string;
  MessageId?: string;
  OriginalRecipient?: string;
  To?: string;
  From?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Date?: string;
  MailboxHash?: string | null;
  Attachments?: unknown;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verifica Basic Auth antes de qualquer processamento (inclui parse do body)
  const auth = verifyPostmarkAuth(req);
  if (!auth.ok) {
    console.warn('[postmark] webhook rejeitado:', auth.reason);
    return new NextResponse('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="postmark-webhook"' },
    });
  }

  try {
    const payload = (await req.json()) as PostmarkInboundPayload;
    const fromEmail = (payload.From || '').trim();

    const toEmail = (payload.OriginalRecipient || payload.To || '').toLowerCase();

    if (!toEmail) {
      return NextResponse.json({ ok: false, error: 'no recipient' }, { status: 400 });
    }
    if (!fromEmail) {
      return NextResponse.json({ ok: false, error: 'no sender' }, { status: 400 });
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.emailInbound, toEmail))
      .limit(1);

    if (!tenant) {
      return NextResponse.json({ ok: false, error: 'tenant not found', toEmail });
    }

    const providerEventKey = buildProviderEventKey(tenant.id, payload, toEmail);

    // 1. Guarda o email de forma idempotente
    const [insertedEmail] = await db
      .insert(emails)
      .values({
        tenantId: tenant.id,
        fromEmail,
        toEmail,
        subject: payload.Subject || null,
        bodyText: payload.TextBody || null,
        bodyHtml: payload.HtmlBody || null,
        rawPayload: payload,
        attachments: payload.Attachments || [],
        status: 'received',
        providerEventKey,
      })
      .onConflictDoNothing({ target: emails.providerEventKey })
      .returning();

    let novoEmail = insertedEmail;
    const shouldNotify = !!insertedEmail;

    if (!novoEmail) {
      const [existingEmail] = await db
        .select()
        .from(emails)
        .where(eq(emails.providerEventKey, providerEventKey))
        .limit(1);

      if (!existingEmail) {
        return NextResponse.json(
          { ok: false, error: 'duplicate lookup failed' },
          { status: 500 },
        );
      }

      if (
        existingEmail.status &&
        !['received', 'processing'].includes(existingEmail.status)
      ) {
        console.log('[postmark] evento duplicado ignorado:', existingEmail.id);
        return NextResponse.json({
          ok: true,
          id: existingEmail.id,
          duplicate: true,
        });
      }

      novoEmail = existingEmail;
      console.log('[postmark] retomar evento existente:', novoEmail.id);
    } else {
      console.log('Email guardado:', novoEmail.id);
    }

    // 2. Triagem rápida (com tipo explícito)
    let triagem: ResultadoTriagem;
    try {
      triagem = await triarEmail(
        payload.Subject || '',
        payload.TextBody || '',
        fromEmail
      );

      console.log('Triagem:', triagem.is_fatura_request, '-', triagem.motivo);

      await db
        .update(emails)
        .set({
          isFaturaRequest: triagem.is_fatura_request,
          triagemMotivo: triagem.motivo,
          triagemConfianca: triagem.confianca,
        })
        .where(eq(emails.id, novoEmail.id));
    } catch (triagemError) {
      console.error('Erro na triagem:', triagemError);
      triagem = {
        is_fatura_request: 'incerto',
        motivo: 'Triagem falhou',
        confianca: 'baixa',
      };
    }

    // 3. Se não é pedido de fatura, para aqui
    if (triagem.is_fatura_request === 'nao') {
      await db
        .update(emails)
        .set({ status: 'ignored' })
        .where(eq(emails.id, novoEmail.id));
      
      console.log('Email ignorado (não é pedido de fatura)');
      return NextResponse.json({ ok: true, id: novoEmail.id, ignored: true });
    }

    // 4. Extração detalhada
    try {
      await db
        .update(emails)
        .set({ status: 'processing' })
        .where(eq(emails.id, novoEmail.id));

      const pdfs = extractPdfAttachments(payload.Attachments);
      if (pdfs.length > 0) {
        console.log(`Extração: a usar ${pdfs.length} PDF(s)`);
      }

      const historico = await buscarHistoricoCliente({
        tenantId: tenant.id,
        fromEmail,
      });
      if (historico.length > 0) {
        console.log(`Extração: a usar ${historico.length} fatura(s) do histórico`);
      }

      const { dados, rawResponse } = await extrairDadosFatura(
        payload.Subject || '',
        payload.TextBody || '',
        fromEmail,
        pdfs,
        historico,
      );

      console.log('Extração concluída. Confiança:', dados.confianca_extracao);

      await replaceDraftForEmail({
        emailId: novoEmail.id,
        tenantId: tenant.id,
        dados,
        rawResponse,
      });

      await db
        .update(emails)
        .set({ status: 'extracted' })
        .where(eq(emails.id, novoEmail.id));

      if (shouldNotify) {
        await notifyRelevantInboundEmail({
          tenant,
          email: {
            id: novoEmail.id,
            fromEmail: novoEmail.fromEmail,
            subject: novoEmail.subject,
          },
          triagem: {
            isFaturaRequest: triagem.is_fatura_request,
            confianca: triagem.confianca,
            motivo: triagem.motivo,
          },
          draft: {
            clienteNome: dados.cliente_nome,
            total: dados.total?.toString() ?? null,
            confiancaExtracao: dados.confianca_extracao,
          },
        }).catch((notificationError) => {
          console.warn('Falha ao enviar alerta interno:', notificationError);
        });
      }

    } catch (extractError) {
      console.error('Erro na extração:', extractError);
      await db
        .update(emails)
        .set({ status: 'extraction_failed' })
        .where(eq(emails.id, novoEmail.id));

      if (shouldNotify) {
        await notifyRelevantInboundEmail({
          tenant,
          email: {
            id: novoEmail.id,
            fromEmail: novoEmail.fromEmail,
            subject: novoEmail.subject,
          },
          triagem: {
            isFaturaRequest: triagem.is_fatura_request,
            confianca: triagem.confianca,
            motivo: triagem.motivo,
          },
          extractionFailed: true,
        }).catch((notificationError) => {
          console.warn('Falha ao enviar alerta interno:', notificationError);
        });
      }
    }

    return NextResponse.json({ ok: true, id: novoEmail.id });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, message: 'Webhook Postmark ativo' });
}

function buildProviderEventKey(
  tenantId: string,
  payload: PostmarkInboundPayload,
  toEmail: string,
): string {
  const messageId = (payload.MessageID || payload.MessageId || '').trim();
  if (messageId) {
    return `postmark:${tenantId}:${messageId.toLowerCase()}`;
  }

  const fallback = JSON.stringify({
    from: payload.From || '',
    to: toEmail,
    subject: payload.Subject || '',
    textBody: payload.TextBody || '',
    date: payload.Date || '',
    mailboxHash: payload.MailboxHash || '',
    attachments: Array.isArray(payload.Attachments)
      ? payload.Attachments.map((att) => {
          const item = att as {
            Name?: string;
            ContentLength?: number;
            ContentType?: string;
          };
          return [
            item.Name || '',
            item.ContentLength || 0,
            item.ContentType || '',
          ];
        })
      : [],
  });

  return `postmark:${tenantId}:sha256:${createHash('sha256').update(fallback).digest('hex')}`;
}
