import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emails, tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    console.log('Email recebido do Postmark:', {
      from: payload.From,
      to: payload.OriginalRecipient || payload.To,
      subject: payload.Subject,
    });

    // Postmark envia o destinatário em OriginalRecipient (ou To)
    const toEmail = (payload.OriginalRecipient || payload.To || '').toLowerCase();
    
    if (!toEmail) {
      console.error('Email sem destinatário no payload');
      return NextResponse.json({ ok: false, error: 'no recipient' }, { status: 400 });
    }
    
    // Procura o tenant pelo email_inbound
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.emailInbound, toEmail))
      .limit(1);
    
    if (!tenant) {
      console.error('Tenant não encontrado para:', toEmail);
      // Retorna 200 mesmo assim, senão o Postmark vai tentar reenviar repetidamente
      return NextResponse.json({ ok: false, error: 'tenant not found', toEmail });
    }
    
    // Guarda o email na BD
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
      })
      .returning();
    
    console.log('Email guardado com ID:', novoEmail.id);
    
    return NextResponse.json({ ok: true, id: novoEmail.id });
  } catch (error) {
    console.error('Erro no webhook do Postmark:', error);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}