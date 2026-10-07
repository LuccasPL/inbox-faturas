export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

export async function readJsonBody(request: Request, maxBytes: number, timeoutMs: number): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestBodyError('Content-Type deve ser application/json', 415);
  }
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new RequestBodyError('Pedido demasiado grande', 413);
  }
  if (!request.body) throw new RequestBodyError('Corpo vazio', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, timeoutMs);
  try {
    while (true) {
      const chunk = await reader.read();
      if (timedOut) throw new RequestBodyError('Tempo limite a receber o pedido', 408);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyError('Pedido demasiado grande', 413);
      }
      chunks.push(chunk.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    } catch {
      throw new RequestBodyError('JSON inválido', 400);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
