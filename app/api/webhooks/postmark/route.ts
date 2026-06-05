import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emails, tenants, faturasDraft } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extrairDadosFatura } from '@/lib/extraction/extract-fatura';

export async function POST(req: NextRequest) {
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
        status: 'processing',
      })
      .returning();

    console.log('Email guardado:', novoEmail.id);

    // 2. Extrai dados (em background, mas com await para já testarmos sincronamente)
    try {
      const { dados, rawResponse } = await extrairDadosFatura(
        payload.Subject || '',
        payload.TextBody || '',
        payload.From || ''
      );

      console.log('Extração concluída. Confiança:', dados.confianca_extracao);

      // 3. Guarda o draft
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

      // 4. Atualiza status do email
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

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Webhook Postmark ativo' });
}