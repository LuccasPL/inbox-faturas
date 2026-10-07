import { PDF_LIMITS, type PdfAttachment } from './extract-fatura';
import { base64ByteLength } from '@/lib/security/base64';

/**
 * Shape do attachment como o Postmark envia no webhook.
 */
interface PostmarkAttachment {
  Name?: string;
  Content?: string; // base64
  ContentType?: string;
  ContentLength?: number;
}

/**
 * Extrai os PDFs utilizáveis de um array de attachments do Postmark,
 * aplicando os limites de tamanho e contagem.
 */
export function extractPdfAttachments(
  attachments: unknown,
): PdfAttachment[] {
  if (!Array.isArray(attachments)) return [];

  const result: PdfAttachment[] = [];

  for (const att of attachments as PostmarkAttachment[]) {
    if (result.length >= PDF_LIMITS.maxCount) break;
    if (att?.ContentType !== 'application/pdf') continue;
    if (typeof att.Content !== 'string' || !att.Content) continue;
    if (att.Content.length > Math.ceil(PDF_LIMITS.maxBytes / 3) * 4) continue;
    const actualBytes = base64ByteLength(att.Content);
    if (actualBytes === null || actualBytes > PDF_LIMITS.maxBytes) continue;
    if (Buffer.from(att.Content.slice(0, 8), 'base64').toString('ascii').slice(0, 5) !== '%PDF-') continue;

    result.push({
      name: att.Name ?? 'document.pdf',
      base64: att.Content,
    });
  }

  return result;
}
