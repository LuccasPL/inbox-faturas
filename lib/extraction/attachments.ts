import { PDF_LIMITS, type PdfAttachment } from './extract-fatura';

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
    if (!att.Content) continue;
    if ((att.ContentLength ?? 0) > PDF_LIMITS.maxBytes) continue;

    result.push({
      name: att.Name ?? 'document.pdf',
      base64: att.Content,
    });
  }

  return result;
}
