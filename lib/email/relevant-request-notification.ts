import { sendEmail } from './postmark-outbound';

interface NotificationInput {
  tenant: {
    nome: string;
    emailInbound: string;
    notifEnabled: boolean;
    notifEmail: string | null;
  };
  email: {
    id: string;
    fromEmail: string;
    subject: string | null;
  };
  triagem: {
    isFaturaRequest: string | null;
    confianca: string | null;
    motivo: string | null;
  };
  draft?: {
    clienteNome: string | null;
    total: string | null;
    confiancaExtracao: string | null;
  } | null;
  extractionFailed?: boolean;
}

export async function notifyRelevantInboundEmail(
  input: NotificationInput,
): Promise<void> {
  if (
    !input.tenant.notifEnabled ||
    !input.tenant.notifEmail ||
    input.tenant.emailInbound.endsWith('@pending.invalid')
  ) {
    return;
  }

  const inboxUrl = buildInboxUrl(input.email.id);
  const statusLabel = input.extractionFailed
    ? 'Extração falhou'
    : input.draft
      ? 'Draft criado'
      : 'Pedido relevante recebido';
  const triagemLabel = formatConfidence(input.triagem.confianca);
  const extractionLabel = input.draft
    ? formatConfidence(input.draft.confiancaExtracao)
    : null;
  const total =
    input.draft?.total && !Number.isNaN(Number(input.draft.total))
      ? new Intl.NumberFormat('pt-PT', {
          style: 'currency',
          currency: 'EUR',
        }).format(Number(input.draft.total))
      : null;

  await sendEmail({
    from: input.tenant.emailInbound,
    to: input.tenant.notifEmail,
    replyTo: input.tenant.emailInbound,
    subject: input.extractionFailed
      ? `Novo pedido com falha de extração — ${input.tenant.nome}`
      : `Novo pedido para revisão — ${input.tenant.nome}`,
    htmlBody: renderHtml({
      tenantNome: input.tenant.nome,
      statusLabel,
      fromEmail: input.email.fromEmail,
      subject: input.email.subject,
      clienteNome: input.draft?.clienteNome ?? null,
      total,
      triagemLabel,
      extractionLabel,
      motivo: input.triagem.motivo,
      inboxUrl,
    }),
    textBody: renderText({
      tenantNome: input.tenant.nome,
      statusLabel,
      fromEmail: input.email.fromEmail,
      subject: input.email.subject,
      clienteNome: input.draft?.clienteNome ?? null,
      total,
      triagemLabel,
      extractionLabel,
      motivo: input.triagem.motivo,
      inboxUrl,
    }),
  });
}

function renderHtml(input: {
  tenantNome: string;
  statusLabel: string;
  fromEmail: string;
  subject: string | null;
  clienteNome: string | null;
  total: string | null;
  triagemLabel: string;
  extractionLabel: string | null;
  motivo: string | null;
  inboxUrl: string | null;
}): string {
  const rows = [
    ['Estado', input.statusLabel],
    ['Remetente', input.fromEmail],
    ['Assunto', input.subject || 'Sem assunto'],
    ['Cliente', input.clienteNome || 'Por confirmar'],
    ['Triagem', input.triagemLabel],
    ['Extração', input.extractionLabel],
    ['Total', input.total],
    ['Motivo', input.motivo],
  ].filter(([, value]) => Boolean(value)) as Array<[string, string]>;

  return `<!doctype html>
<html lang="pt">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111827;line-height:1.55;padding:24px;max-width:640px;margin:auto;">
  <p style="margin:0 0 16px;">Entrou um novo pedido relevante no tenant <strong>${escapeHtml(input.tenantNome)}</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
    ${rows
      .map(
        ([label, value]) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;width:148px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>`,
      )
      .join('')}
  </table>
  ${
    input.inboxUrl
      ? `<p style="margin:0 0 20px;"><a href="${escapeHtml(input.inboxUrl)}" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#111827;color:#ffffff;text-decoration:none;">Abrir no inbox</a></p>`
      : ''
  }
  <p style="margin:0;color:#6b7280;font-size:12px;">Este alerta foi enviado automaticamente pelo Inbox Faturas.</p>
</body>
</html>`;
}

function renderText(input: {
  tenantNome: string;
  statusLabel: string;
  fromEmail: string;
  subject: string | null;
  clienteNome: string | null;
  total: string | null;
  triagemLabel: string;
  extractionLabel: string | null;
  motivo: string | null;
  inboxUrl: string | null;
}): string {
  const lines = [
    `Entrou um novo pedido relevante no tenant ${input.tenantNome}.`,
    '',
    `Estado: ${input.statusLabel}`,
    `Remetente: ${input.fromEmail}`,
    `Assunto: ${input.subject || 'Sem assunto'}`,
    `Cliente: ${input.clienteNome || 'Por confirmar'}`,
    `Triagem: ${input.triagemLabel}`,
    input.extractionLabel ? `Extração: ${input.extractionLabel}` : null,
    input.total ? `Total: ${input.total}` : null,
    input.motivo ? `Motivo: ${input.motivo}` : null,
    input.inboxUrl ? `Abrir no inbox: ${input.inboxUrl}` : null,
  ].filter(Boolean);

  return lines.join('\n');
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

function formatConfidence(value: string | null): string {
  switch (value) {
    case 'alta':
      return 'Alta';
    case 'media':
      return 'Média';
    case 'baixa':
      return 'Baixa';
    case 'sim':
      return 'Sim';
    case 'nao':
      return 'Não';
    case 'incerto':
      return 'Incerto';
    default:
      return 'N/D';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
