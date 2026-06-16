import type { MoloniEnvelope } from './types';

const MOLONI_ENDPOINT = 'https://api.molonion.pt/v1';

/**
 * Erro lançado quando a API Moloni devolve `errors[]` não vazio
 * ou quando o HTTP falha.
 */
export class MoloniApiError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: { field: string; msg: string }[] = [],
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'MoloniApiError';
  }
}

interface GraphQLResponse<T> {
  data?: Record<string, MoloniEnvelope<T>>;
  errors?: { message: string }[];
}

/**
 * Faz um POST GraphQL ao Moloni ON e devolve o `data` do envelope da operação top-level.
 *
 * @param apiKey API key (ou access token OAuth) do tenant
 * @param query string GraphQL
 * @param variables variáveis da operação
 * @param topField nome da query/mutation top-level (ex: 'me', 'invoiceCreate')
 */
export async function moloniRequest<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
  topField: string,
): Promise<T> {
  const res = await fetch(MOLONI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new MoloniApiError(
      `Moloni HTTP ${res.status}: ${text.slice(0, 200)}`,
      [],
      res.status,
    );
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  // erros GraphQL (parse/auth/etc.) — antes do envelope da operação
  if (json.errors && json.errors.length > 0) {
    throw new MoloniApiError(
      `Moloni GraphQL: ${json.errors.map((e) => e.message).join('; ')}`,
    );
  }

  const envelope = json.data?.[topField];
  if (!envelope) {
    throw new MoloniApiError(`Resposta Moloni sem campo "${topField}"`);
  }

  if (envelope.errors && envelope.errors.length > 0) {
    const summary = envelope.errors
      .map((e) => `${e.field}: ${e.msg}`)
      .join('; ');
    throw new MoloniApiError(
      `Moloni validação: ${summary}`,
      envelope.errors,
    );
  }

  if (envelope.data === null || envelope.data === undefined) {
    throw new MoloniApiError(`Moloni devolveu data=null em "${topField}"`);
  }

  return envelope.data;
}
