import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emails } from '@/lib/db/schema';

export type N8nEventName =
  | 'draft.approved'
  | 'draft.rejected'
  | 'invoice.emitted'
  | 'invoice.draft_created'
  | 'proforma.emitted'
  | 'proforma.sent';

interface TenantSnapshot {
  id: string;
  nome: string;
  emailInbound: string;
  emissaoVia?: string | null;
}

interface DraftSnapshot {
  id: string;
  emailId?: string | null;
  status: string | null;
  clienteNome: string | null;
  clienteNif: string | null;
  clienteEmail: string | null;
  clienteMorada: string | null;
  items: unknown;
  subtotal: string | null;
  ivaValor: string | null;
  total: string | null;
  iban: string | null;
  prazoPagamento: string | null;
  observacoes: string | null;
  confiancaExtracao?: string | null;
  createdAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  emittedAt?: Date | null;
  emittedVia?: string | null;
  moloniDocumentId?: number | null;
  proformaNumero?: number | null;
  proformaSentAt?: Date | null;
  proformaSentTo?: string | null;
  emitError?: string | null;
}

interface TriggerN8nEventInput {
  event: N8nEventName;
  occurredAt?: Date | string | null;
  tenant: TenantSnapshot;
  draft: DraftSnapshot;
  review?: {
    by: string | null;
  };
  emission?: {
    via: 'moloni' | 'pdf_proforma';
    finalized?: boolean;
    documentId?: number | null;
    documentNumber?: number | null;
    proformaNumero?: number | null;
    sentTo?: string | null;
  };
}

export async function triggerN8nEvent(
  input: TriggerN8nEventInput,
): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL?.trim();
  if (!webhookUrl || webhookUrl === 'vais-preencher-depois') {
    return;
  }

  const email = input.draft.emailId
    ? await loadEmailSnapshot(input.draft.emailId)
    : null;

  const payload = {
    source: 'inbox-faturas',
    event: input.event,
    occurredAt: normalizeDate(input.occurredAt) ?? new Date().toISOString(),
    tenant: {
      id: input.tenant.id,
      nome: input.tenant.nome,
      emailInbound: input.tenant.emailInbound,
      emissaoVia: input.tenant.emissaoVia ?? null,
    },
    email: email
      ? {
          id: email.id,
          fromEmail: email.fromEmail,
          toEmail: email.toEmail,
          subject: email.subject,
          createdAt: normalizeDate(email.createdAt),
          inboxUrl: buildInboxUrl(email.id),
        }
      : null,
    draft: {
      ...input.draft,
      createdAt: normalizeDate(input.draft.createdAt),
      reviewedAt: normalizeDate(input.draft.reviewedAt),
      emittedAt: normalizeDate(input.draft.emittedAt),
      proformaSentAt: normalizeDate(input.draft.proformaSentAt),
    },
    review: input.review ?? null,
    emission: input.emission ?? null,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-inbox-faturas-event': input.event,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 240);
      throw new Error(
        `N8N webhook respondeu ${res.status}${body ? `: ${body}` : ''}`,
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadEmailSnapshot(emailId: string) {
  const [email] = await db
    .select({
      id: emails.id,
      fromEmail: emails.fromEmail,
      toEmail: emails.toEmail,
      subject: emails.subject,
      createdAt: emails.createdAt,
    })
    .from(emails)
    .where(eq(emails.id, emailId))
    .limit(1);

  return email ?? null;
}

function buildInboxUrl(emailId: string): string | null {
  const raw =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  if (!raw) return null;

  const base = raw.startsWith('http') ? raw : `https://${raw}`;
  return `${base.replace(/\/$/, '')}/inbox/${emailId}`;
}

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}
