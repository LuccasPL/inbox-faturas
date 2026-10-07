export interface ResultadoTriagem {
  is_fatura_request: 'sim' | 'nao' | 'incerto';
  motivo: string;
  confianca: 'alta' | 'media' | 'baixa';
}

export class TriagemValidationError extends Error {
  constructor() {
    super('A triagem devolveu dados inválidos. É necessária uma nova revisão.');
    this.name = 'TriagemValidationError';
  }
}

export function parseTriagemResult(input: unknown): ResultadoTriagem {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TriagemValidationError();
  }
  const data = input as Record<string, unknown>;
  const decision = data.is_fatura_request;
  const confidence = data.confianca;
  if ((decision !== 'sim' && decision !== 'nao' && decision !== 'incerto') ||
    (confidence !== 'alta' && confidence !== 'media' && confidence !== 'baixa') ||
    typeof data.motivo !== 'string' || !data.motivo.trim() || data.motivo.length > 500 ||
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(data.motivo)) {
    throw new TriagemValidationError();
  }
  // Only a confident negative decision can remove a request from the review inbox.
  if (decision === 'nao' && confidence !== 'alta') {
    return { is_fatura_request: 'incerto', confianca: confidence,
      motivo: `Confiança insuficiente para ignorar automaticamente. ${data.motivo.trim()}`.slice(0, 500) };
  }
  return { is_fatura_request: decision, confianca: confidence, motivo: data.motivo.trim() };
}
