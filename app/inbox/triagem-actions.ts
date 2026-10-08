'use server';

import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';
import { requireEmailOwnership } from '@/lib/auth/tenant';
import { RATE_LIMITS } from '@/lib/security/policies';
import { requireActionRateLimit, actionRateLimitError } from '@/lib/security/rate-limit';
import { ignoreEmail, deleteEmailSafely, EmailDeletionError } from '@/lib/extraction/processing';
import { enqueueOwnedEmail, EmailQueueError } from '@/lib/extraction/queue';
import { scheduleEmailProcessing } from '@/lib/extraction/schedule';

async function requestProcessing(emailId: string, mode: 'reprocess' | 'force') {
  try {
    const { email, tenant } = await requireEmailOwnership(emailId);
    await requireActionRateLimit(tenant.id, RATE_LIMITS.mutation);
    const { userId } = await auth();
    await enqueueOwnedEmail(email.id, tenant.id, mode, userId);
    scheduleEmailProcessing({ emailId: email.id, tenantId: tenant.id });
    revalidatePath('/inbox');
    revalidatePath(`/inbox/${email.id}`);
  } catch (error) {
    if (error instanceof EmailQueueError) throw new Error(error.message);
    throw new Error('Não foi possível agendar o processamento. Tenta novamente mais tarde.');
  }
}

export async function reclassificarComoFatura(emailId: string) {
  await requestProcessing(emailId, 'force');
}

export async function reprocessarEmail(emailId: string) {
  await requestProcessing(emailId, 'reprocess');
}

export async function eliminarEmail(emailId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { email, tenant } = await requireEmailOwnership(emailId);
    const limitError = await actionRateLimitError(tenant.id, RATE_LIMITS.mutation);
    if (limitError) return { ok: false, error: limitError };
    await deleteEmailSafely(email.id, tenant.id);
    revalidatePath('/inbox');
    return { ok: true };
  } catch (error) {
    if (error instanceof EmailDeletionError) return { ok: false, error: error.message };
    console.error('[email] Não foi possível eliminar o email.');
    return { ok: false, error: 'Não foi possível eliminar o email. Tenta novamente mais tarde.' };
  }
}

export async function reclassificarComoIgnorado(emailId: string) {
  const { email } = await requireEmailOwnership(emailId);
  await requireActionRateLimit(email.tenantId!, RATE_LIMITS.mutation);
  const { userId } = await auth();
  await ignoreEmail({ emailId: email.id, tenantId: email.tenantId!, reviewedBy: userId });
  revalidatePath('/inbox');
  revalidatePath(`/inbox/${email.id}`);
}
