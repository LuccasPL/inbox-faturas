export const TIMEOUTS = {
  triage: 15_000,
  extraction: 60_000,
  moloni: 15_000,
  postmark: 15_000,
  requestBody: 10_000,
} as const;

export const RATE_LIMITS = {
  ai: { name: 'ai', limit: 10, windowSeconds: 600 },
  inbound: { name: 'inbound', limit: 30, windowSeconds: 60 },
  emailWorker: { name: 'email-worker', limit: 30, windowSeconds: 60 },
  emission: { name: 'emission', limit: 10, windowSeconds: 60 },
  send: { name: 'send', limit: 5, windowSeconds: 60 },
  sendDraft: { name: 'send-draft', limit: 1, windowSeconds: 30 },
  moloniSetup: { name: 'moloni-setup', limit: 20, windowSeconds: 60 },
  mutation: { name: 'mutation', limit: 60, windowSeconds: 60 },
  pdf: { name: 'pdf', limit: 30, windowSeconds: 60 },
  export: { name: 'export', limit: 5, windowSeconds: 60 },
  attachment: { name: 'attachment', limit: 60, windowSeconds: 60 },
} as const;

export interface RateLimitPolicy {
  name: string;
  limit: number;
  windowSeconds: number;
}
