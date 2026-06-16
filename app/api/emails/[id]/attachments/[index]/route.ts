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

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; index: string }> },
): Promise<Response> {
  const { id, index } = await context.params;

  let email;
  try {
    ({ email } = await requireEmailOwnership(id));
  } catch {
    return new NextResponse('Não autorizado', { status: 401 });
  }

  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0) {
    return new NextResponse('Índice inválido', { status: 400 });
  }

  const attachments = email.attachments as PostmarkAttachment[] | null;
  const attachment = attachments?.[idx];
  if (!attachment || !attachment.Content) {
    return new NextResponse('Anexo não encontrado', { status: 404 });
  }

  const buffer = Buffer.from(attachment.Content, 'base64');
  const filename = attachment.Name ?? `attachment-${idx}`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': attachment.ContentType ?? 'application/octet-stream',
      'Content-Length': buffer.length.toString(),
      // inline = abre no browser; download via attribute do <a>
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}
