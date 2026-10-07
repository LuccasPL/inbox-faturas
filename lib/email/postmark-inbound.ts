import { base64ByteLength } from '@/lib/security/base64';
import { RequestBodyError } from '@/lib/security/request-body';

export const MAX_INBOUND_BYTES = 4 * 1024 * 1024;

export interface PostmarkInboundPayload {
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
  Attachments?: Array<{ Name: string; Content: string; ContentType: string; ContentLength: number }>;
}

export function validateInboundPayload(value: unknown): PostmarkInboundPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestBodyError('Payload inválido', 400);
  }
  const payload = value as Record<string, unknown>;
  const limits: Record<string, number> = {
    MessageID: 200, MessageId: 200, OriginalRecipient: 512, To: 2048,
    From: 512, Subject: 1000, TextBody: 200_000, HtmlBody: 500_000,
    Date: 100, MailboxHash: 200,
  };
  for (const [field, limit] of Object.entries(limits)) {
    const item = payload[field];
    if (item != null && (typeof item !== 'string' || item.length > limit)) {
      throw new RequestBodyError(`Campo inválido: ${field}`, 400);
    }
  }
  if (payload.Attachments != null) {
    if (!Array.isArray(payload.Attachments) || payload.Attachments.length > 20) {
      throw new RequestBodyError('Lista de anexos inválida', 400);
    }
    let totalBytes = 0;
    for (const attachment of payload.Attachments) {
      if (!attachment || typeof attachment !== 'object') {
        throw new RequestBodyError('Anexo inválido', 400);
      }
      const { Name, Content, ContentType } = attachment;
      if (typeof Name !== 'string' || Name.length > 255 || typeof ContentType !== 'string' || ContentType.length > 100) {
        throw new RequestBodyError('Metadados do anexo inválidos', 400);
      }
      const bytes = base64ByteLength(Content);
      if (bytes === null) throw new RequestBodyError('Conteúdo do anexo inválido', 400);
      totalBytes += bytes;
      if (totalBytes > 3 * 1024 * 1024) throw new RequestBodyError('Anexos demasiado grandes', 413);
      attachment.ContentLength = bytes;
    }
  }
  return payload as PostmarkInboundPayload;
}
