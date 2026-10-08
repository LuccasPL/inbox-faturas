import 'server-only';
import { after } from 'next/server';

export function scheduleEmailProcessing(scope?: { emailId: string; tenantId: string }) {
  // Best-effort kickoff only. The database job survives a platform interruption.
  try {
    after(async () => {
      try {
        const { runEmailQueue } = await import('./worker');
        await runEmailQueue(scope);
      } catch {
        console.warn('[email-worker] Recuperação necessária; tarefa conservada na fila.');
      }
    });
  } catch {
    console.warn('[email-worker] Arranque adiado; tarefa conservada na fila.');
  }
}
