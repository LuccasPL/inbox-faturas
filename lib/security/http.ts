export class ExternalRequestError extends Error {
  constructor(message: string, public readonly outcomeUnknown: boolean) {
    super(message);
    this.name = 'ExternalRequestError';
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  options: { service: string; timeoutMs: number },
): Promise<{ response: Response; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    // Keep the deadline active while consuming the response body too.
    const data = (await response.json()) as T;
    return { response, data };
  } catch {
    throw new ExternalRequestError(
      controller.signal.aborted
        ? `${options.service}: tempo limite excedido. O resultado da operação pode ter sido aceite pelo serviço.`
        : `${options.service}: não foi possível confirmar a resposta do serviço.`,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
