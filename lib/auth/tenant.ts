import { auth, currentUser } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants, emails, faturasDraft } from '@/lib/db/schema';

/**
 * Obtém (ou cria) o tenant do utilizador Clerk autenticado.
 *
 * Cria com um emailInbound placeholder na primeira chamada — o utilizador
 * vai poder editar isto mais tarde no /settings.
 */
export async function getOrCreateTenantForUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Não autenticado');
  }

  const [existing] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.clerkUserId, userId))
    .limit(1);

  if (existing) return existing;

  // Não existe: criar com defaults baseados no perfil Clerk
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const nome =
    user?.firstName ||
    user?.username ||
    email?.split('@')[0] ||
    'Sem nome';

  // emailInbound placeholder; user pode editar depois.
  // Curto + único = parte do userId + sufixo do domínio do email (ou .invalid)
  const shortId = userId.replace(/^user_/, '').slice(0, 12).toLowerCase();
  const placeholderInbound = `${shortId}@pending.invalid`;

  const [created] = await db
    .insert(tenants)
    .values({
      nome,
      emailInbound: placeholderInbound,
      clerkUserId: userId,
    })
    .returning();

  return created;
}

/**
 * Versão "read-only": devolve o tenant atual ou null. Não cria nada.
 */
export async function getTenantForUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.clerkUserId, userId))
    .limit(1);

  return tenant ?? null;
}

/**
 * Lança 'Não autorizado' se o user não está autenticado ou não tem tenant.
 * Usar em server actions onde queremos falhar cedo.
 */
export async function requireTenant() {
  const tenant = await getTenantForUser();
  if (!tenant) {
    throw new Error('Não autorizado');
  }
  return tenant;
}

/**
 * Verifica que o email pertence ao tenant do user atual.
 * Devolve { email, tenant } ou throws.
 */
export async function requireEmailOwnership(emailId: string) {
  const tenant = await requireTenant();
  const [email] = await db
    .select()
    .from(emails)
    .where(and(eq(emails.id, emailId), eq(emails.tenantId, tenant.id)))
    .limit(1);
  if (!email) throw new Error('Não autorizado');
  return { email, tenant };
}

/**
 * Verifica que o draft pertence ao tenant do user atual.
 * Devolve { draft, tenant } ou throws.
 */
export async function requireDraftOwnership(draftId: string) {
  const tenant = await requireTenant();
  const [draft] = await db
    .select()
    .from(faturasDraft)
    .where(
      and(eq(faturasDraft.id, draftId), eq(faturasDraft.tenantId, tenant.id)),
    )
    .limit(1);
  if (!draft) throw new Error('Não autorizado');
  return { draft, tenant };
}
