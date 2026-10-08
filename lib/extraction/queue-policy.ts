export const MAX_PROCESSING_ATTEMPTS = 3;
export const PROCESSING_LEASE_SECONDS = 300;
export const BUSY_EMAIL_STATUSES = ['queued', 'retry_wait', 'processing'];

export function isEmailBusy(status: string | null): boolean {
  return BUSY_EMAIL_STATUSES.includes(status ?? '');
}

export function processingRetrySeconds(attempt: number): number {
  return attempt <= 1 ? 60 : 300;
}

export const PROCESSING_REASONS: Record<string, string> = {
  interrupted: 'A execução foi interrompida.',
  temporary: 'O serviço de extração está temporariamente indisponível.',
  invalid_response: 'A resposta da IA precisa de nova análise.',
  configuration: 'A configuração da IA precisa de atenção.',
  authorization: 'A autorização do endereço de receção precisa de atenção.',
  quota: 'A aguardar disponibilidade dentro do limite de processamento.',
  protected: 'O documento já está protegido contra reprocessamento.',
};
