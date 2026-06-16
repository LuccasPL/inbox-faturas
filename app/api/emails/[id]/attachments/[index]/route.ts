import { NextResponse } from 'next/server';
import { requireEmailOwnership } from '@/lib/auth/tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PostmarkAttachment {
  Name?: string;
  Content?: string;
  ContentType?: string;
  ContentLength?: number;
}

const INLINE_CONTENT_TYPES = new Set(['application/pdf']);

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; index: string }> },
): Promise<Response> {
  const { id, index } = await context.params;

  let email;
  try {
    ({ email } = await requireEmailOwnership(id));
  } catch {
    return new NextResponse('Nao autorizado', { status: 401 });
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return new NextResponse('Indice invalido', { status: 400 });
  }

  const attachments = email.attachments as PostmarkAttachment[] | null;
  const attachment = attachments?.[idx];
  if (!attachment?.Content) {
    return new NextResponse('Anexo nao encontrado', { status: 404 });
  }

  const buffer = Buffer.from(attachment.Content, 'base64');
  const filename = sanitizeFilename(attachment.Name ?? `attachment-${idx}`);
  const contentType = normalizeContentType(attachment.ContentType);
  const disposition = INLINE_CONTENT_TYPES.has(contentType)
    ? 'inline'
    : 'attachment';

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  });
}

function normalizeContentType(value: string | undefined): string {
  if (!value) return 'application/octet-stream';
  const lower = value.toLowerCase().split(';')[0]?.trim();
  if (!lower) return 'application/octet-stream';
  if (INLINE_CONTENT_TYPES.has(lower)) return lower;
  return 'application/octet-stream';
}

function sanitizeFilename(value: string): string {
  const cleaned = value.replace(/[\r\n"\\]/g, '_').trim();
  return cleaned || 'attachment';
}
