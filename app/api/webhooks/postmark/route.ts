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
      console.error('Tenant não encontrado para:', toEmail);
      return NextResponse.json({ ok: false, error: 'tenant not found', toEmail });
    }
    
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
    console.error('Erro no webhook:', error);
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 });
  }
}

// Endpoint GET simples para testares no browser
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Webhook Postmark ativo' });
}