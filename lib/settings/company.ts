import 'server-only';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';
import { isInboundAuthorized, isRealInboundAddress } from './inbound-policy';

export class SettingsValidationError extends Error {}

export async function saveTenantProfile(tenantId: string, input: { nome: string; emailInbound?: string }): Promise<void> {
  if (!input || typeof input.nome !== 'string' || !input.nome.trim() || input.nome.trim().length > 160) {
    throw new SettingsValidationError('Nome obrigatório, com até 160 caracteres.');
  }
  await db.transaction(async tx => {
    const [tenant] = await tx.select({ emailInbound: tenants.emailInbound }).from(tenants)
      .where(eq(tenants.id, tenantId)).for('update');
    if (!tenant) throw new SettingsValidationError('Empresa indisponível. Atualiza a página.');
    // Older clients may submit the address, but never receive authority to change it.
    if (input.emailInbound !== undefined && (typeof input.emailInbound !== 'string' ||
      input.emailInbound.trim().toLowerCase() !== tenant.emailInbound)) {
      throw new SettingsValidationError('O endereço de receção requer autorização administrativa.');
    }
    await tx.update(tenants).set({ nome: input.nome.trim() }).where(eq(tenants.id, tenantId));
  });
}

export async function findAuthorizedInboundTenant(address: string) {
  if (!isRealInboundAddress(address)) return null;
  const [tenant] = await db.select().from(tenants).where(and(
    eq(tenants.emailInbound, address), eq(tenants.emailInboundAuthorizedAddress, address),
    isNotNull(tenants.emailInboundAuthorizedAt),
  )).limit(1);
  return tenant && isInboundAuthorized(tenant) ? tenant : null;
}
