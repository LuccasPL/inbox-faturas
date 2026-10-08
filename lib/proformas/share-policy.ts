import { DraftValidationError } from '@/lib/validation/draft';

export const SHARE_DURATIONS = [1, 7, 30] as const;
export type ShareDuration = typeof SHARE_DURATIONS[number];
export type ShareOptions = { regenerate?: boolean; days?: ShareDuration; expectedToken?: string | null };
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export function formatShareDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', day: '2-digit', month: 'short',
    year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function parseShareOptions(value: unknown): ShareOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DraftValidationError('Opções de partilha inválidas.');
  }
  const options = value as Record<string, unknown>;
  if (Object.keys(options).some(key => !['regenerate', 'days', 'expectedToken'].includes(key)) ||
      (options.regenerate !== undefined && typeof options.regenerate !== 'boolean') ||
      (options.days !== undefined && !SHARE_DURATIONS.includes(options.days as ShareDuration)) ||
      (options.expectedToken !== undefined && options.expectedToken !== null &&
        (typeof options.expectedToken !== 'string' || !SHARE_TOKEN_RE.test(options.expectedToken)))) {
    throw new DraftValidationError('Opções de partilha inválidas.');
  }
  return { regenerate: options.regenerate ?? false, days: options.days ?? 7,
    ...('expectedToken' in options ? { expectedToken: options.expectedToken } : {}) } as ShareOptions;
}

export function shareState(hasToken: boolean, expiresAt: string | Date | null, now: number): 'inactive' | 'active' | 'expired' {
  if (!hasToken) return 'inactive';
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expiry) && expiry > now ? 'active' : 'expired';
}
