import { auth, currentUser } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tenants } from '@/lib/db/schema';

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
