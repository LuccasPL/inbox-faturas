import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emails, tenants, faturasDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';
import { triarEmail, ResultadoTriagem } from '@/lib/extraction/triagem-email';
import { extractPdfAttachments } from '@/lib/extraction/attachments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const payload = await req.json();
    
    const toEmail = (payload.OriginalRecipient || payload.To || '').toLowerCase();
    
    if (!toEmail) {
      return NextResponse.json({ ok: false, error: 'no recipient' }, { status: 400 });
    }
    
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.emailInbound, toEmail))
      .limit(1);
    
    if (!tenant) {
      return NextResponse.json({ ok: false, error: 'tenant not found', toEmail });
    }
    
    // 1. Guarda o email
    const [novoEmail] = await db
      .insert(emails)
      .values({
        tenantId: tenant.id,
        fromEmail: payload.From,
        toEmail: toEmail,
        subject: payload.Subject || null,
        bodyText: payload.TextBody || null,
        bodyHtml: payload.HtmlBody || null,
        rawPayload: payload,
        attachments: payload.Attachments || [],
        status: 'received',
      })
      .returning();

    console.log('Email guardado:', novoEmail.id);

    // 2. Triagem rápida (com tipo explícito)
    let triagem: ResultadoTriagem;
    try {
      triagem = await triarEmail(
        payload.Subject || '',
        payload.TextBody || '',
        payload.From || ''
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

      const { dados, rawResponse } = await extrairDadosFatura(
        payload.Subject || '',
        payload.TextBody || '',
        payload.From || '',
        pdfs,
      );

      console.log('Extração concluída. Confiança:', dados.confianca_extracao);

      await db.insert(faturasDraft).values({
        emailId: novoEmail.id,
        tenantId: tenant.id,
        clienteNome: dados.cliente_nome,
        clienteNif: dados.cliente_nif,
        clienteEmail: dados.cliente_email,
        clienteMorada: dados.cliente_morada,
        items: dados.items,
        subtotal: dados.subtotal?.toString(),
        ivaValor: dados.iva_valor?.toString(),
        total: dados.total?.toString(),
        iban: dados.iban,
        prazoPagamento: dados.prazo_pagamento,
        observacoes: dados.observacoes,
        confiancaExtracao: dados.confianca_extracao,
        rawIaResponse: rawResponse,
      });

      await db
        .update(emails)
        .set({ status: 'extracted' })
        .where(eq(emails.id, novoEmail.id));

    } catch (extractError) {
      console.error('Erro na extração:', extractError);
      await db
        .update(emails)
        .set({ status: 'extraction_failed' })
        .where(eq(emails.id, novoEmail.id));
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