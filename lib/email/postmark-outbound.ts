/**
 * Envia email via Postmark outbound.
 *
 * Configuração: cria/usa um Outbound Stream no Postmark e coloca o
 * "Server API Token" em POSTMARK_OUTBOUND_TOKEN. Confirma também o
 * domínio do remetente (Sender Signature ou Domain).
 *
 * Doc: https://postmarkapp.com/developer/api/email-api
 */

const POSTMARK_API = 'https://api.postmarkapp.com/email';

export class PostmarkOutboundError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'PostmarkOutboundError';
  }
}

export interface SendEmailInput {
  /** Remetente verificado no Postmark (Sender Signature ou alias do domínio). */
  from: string;
  /** Destinatário. */
  to: string;
  /** Resposta opcional. Útil para o cliente responder ao tenant. */
  replyTo?: string;
  subject: string;
  /** Corpo HTML. */
  htmlBody: string;
  /** Corpo de texto. Quando não passado, é gerado a partir do HTML. */
  textBody?: string;
  /** PDF a anexar. Conteúdo já em base64 (sem prefixo data:). */
  pdfAttachment?: {
    filename: string;
    base64: string;
  };
  /** Stream do Postmark a usar. Default 'outbound'. */
  messageStream?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ messageId: string }> {
  const token = process.env.POSTMARK_OUTBOUND_TOKEN;
  if (!token) {
    throw new PostmarkOutboundError(
      'POSTMARK_OUTBOUND_TOKEN não configurado',
    );
  }

  const body: Record<string, unknown> = {
    From: input.from,
    To: input.to,
    Subject: input.subject,
    HtmlBody: input.htmlBody,
    TextBody: input.textBody ?? stripHtml(input.htmlBody),
    MessageStream: input.messageStream ?? 'outbound',
  };

  if (input.replyTo) {
    body.ReplyTo = input.replyTo;
  }

  if (input.pdfAttachment) {
    body.Attachments = [
      {
        Name: input.pdfAttachment.filename,
        Content: input.pdfAttachment.base64,
        ContentType: 'application/pdf',
      },
    ];
  }

  const res = await fetch(POSTMARK_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    MessageID?: string;
    ErrorCode?: number;
    Message?: string;
  };

  if (!res.ok || (json.ErrorCode && json.ErrorCode !== 0)) {
    throw new PostmarkOutboundError(
      json.Message ?? `Falha Postmark (HTTP ${res.status})`,
      json.ErrorCode,
      res.status,
    );
  }

  if (!json.MessageID) {
    throw new PostmarkOutboundError('Postmark não devolveu MessageID');
  }

  return { messageId: json.MessageID };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h\d|br|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
