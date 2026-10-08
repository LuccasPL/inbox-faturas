import 'server-only';
import { decrypt } from '@/lib/crypto';
import { hasEmailWorkerSecret } from '@/lib/auth/email-worker';
import { buildSettingsReadiness, type SettingsEnvironment, type SettingsTenant } from './readiness';

export function settingsEnvironment(): SettingsEnvironment {
  return {
    inboundAuth: !!process.env.POSTMARK_WEBHOOK_USER?.trim() && !!process.env.POSTMARK_WEBHOOK_PASSWORD?.trim(),
    ai: !!process.env.ANTHROPIC_API_KEY?.trim(),
    outbound: !!process.env.POSTMARK_OUTBOUND_TOKEN?.trim(),
    encryption: /^[a-f0-9]{64}$/i.test(process.env.APP_ENC_KEY ?? ''),
    worker: hasEmailWorkerSecret(),
  };
}

export function settingsReadiness(tenant: SettingsTenant) {
  const env = settingsEnvironment();
  if (tenant.moloniApiKeyEnc) {
    try { env.encryption = !!decrypt(tenant.moloniApiKeyEnc).trim() && env.encryption; }
    catch { env.encryption = false; }
  }
  return buildSettingsReadiness(tenant, env);
}
