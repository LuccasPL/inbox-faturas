import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { emails } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';
import { triarEmail, ResultadoTriagem } from '@/lib/extraction/triagem-email';
import { extractPdfAttachments } from '@/lib/extraction/attachments';
import { buscarHistoricoCliente } from '@/lib/extraction/historico-cliente';
import { verifyPostmarkAuth } from '@/lib/auth/postmark';
import { notifyRelevantInboundEmail } from '@/lib/email/relevant-request-notification';
import { normalizeEmailAddress } from '@/lib/email/address';
import { replaceDraftForEmail } from '@/lib/drafts/persist-extraction';
import { MAX_INBOUND_BYTES, validateInboundPayload, type PostmarkInboundPayload } from '@/lib/email/postmark-inbound';
import { readJsonBody, RequestBodyError } from '@/lib/security/request-body';
import { RATE_LIMITS, TIMEOUTS } from '@/lib/security/policies';
import { rateLimitResponse } from '@/lib/security/rate-limit';
import { claimEmailProcessing, finishEmailProcessing } from '@/lib/extraction/processing';
import { findAuthorizedInboundTenant } from '@/lib/settings/company';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
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
    const payload = validateInboundPayload(await readJsonBody(req, MAX_INBOUND_BYTES, TIMEOUTS.requestBody));
    const fromEmail = normalizeEmailAddress(payload.From || '');
    const toEmail = normalizeEmailAddress(
      payload.OriginalRecipient || payload.To || '',
    );

    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(toEmail)) {
      return NextResponse.json({ ok: false, error: 'no recipient' }, { status: 400 });
    }
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(fromEmail)) {
      return NextResponse.json({ ok: false, error: 'no sender' }, { status: 400 });
    }

    const tenant = await findAuthorizedInboundTenant(toEmail);

    if (!tenant) {
      return NextResponse.json({ ok: false, error: 'recipient unavailable' }, {
        status: 503, headers: { 'Retry-After': '60' },
      });
    }

    const providerEventKey = buildProviderEventKey(tenant.id, payload, toEmail);

    const inboundLimit = await rateLimitResponse(tenant.id, RATE_LIMITS.inbound);
    if (inboundLimit) return inboundLimit;

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
      console.log('[postmark] evento existente:', novoEmail.id);
    } else {
      console.log('Email guardado:', novoEmail.id);
    }

    const processingToken = await claimEmailProcessing(novoEmail.id, tenant.id);
    if (!processingToken) {
      return NextResponse.json({ ok: false, error: 'processing in progress' }, {
        status: 503, headers: { 'Retry-After': '60' },
      });
    }
    const aiLimit = await rateLimitResponse(tenant.id, RATE_LIMITS.ai);
    if (aiLimit) {
      await finishEmailProcessing(novoEmail.id, processingToken, 'received');
      return aiLimit;
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
        .where(and(eq(emails.id, novoEmail.id), eq(emails.processingToken, processingToken)));
    } catch (triagemError) {
      console.error('Erro na triagem:', triagemError);
      triagem = {
        is_fatura_request: 'incerto',
        motivo: 'Triagem falhou',
        confianca: 'baixa',
      };
      await db.update(emails).set({
        isFaturaRequest: triagem.is_fatura_request,
        triagemMotivo: triagem.motivo,
        triagemConfianca: triagem.confianca,
      }).where(and(eq(emails.id, novoEmail.id), eq(emails.processingToken, processingToken)));
    }

    // 3. Se não é pedido de fatura, para aqui
    if (triagem.is_fatura_request === 'nao') {
      await finishEmailProcessing(novoEmail.id, processingToken, 'ignored');
      
      console.log('Email ignorado (não é pedido de fatura)');
      return NextResponse.json({ ok: true, id: novoEmail.id, ignored: true });
    }

    // 4. Extração detalhada
    try {
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
        processingToken,
        dados,
        rawResponse,
      });

      await finishEmailProcessing(novoEmail.id, processingToken, 'extracted');

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
      await finishEmailProcessing(novoEmail.id, processingToken, 'extraction_failed');

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
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
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
