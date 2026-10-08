import { Clock3, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { PROCESSING_REASONS } from '@/lib/extraction/queue-policy';
import type { loadProcessingDetails } from '@/lib/extraction/queue-queries';
import { formatFullDate } from '@/lib/format/time';

type ProcessingDetails = Awaited<ReturnType<typeof loadProcessingDetails>>;
const titles: Record<string, string> = {
  queued: 'Em fila', running: 'A processar', retry: 'Nova tentativa agendada',
  failed: 'Precisa de atenção', completed: 'Processamento concluído', cancelled: 'Processamento cancelado',
};
const eventTitles: Record<string, string> = {
  queued: 'Pedido colocado na fila', started: 'Tentativa iniciada', retry: 'Nova tentativa agendada',
  failed: 'Processamento precisa de atenção', completed: 'Processamento concluído', cancelled: 'Processamento cancelado',
};

export function ProcessingStatus({ details }: { details: ProcessingDetails }) {
  const { job, events } = details;
  if (!job) return null;
  const Icon = job.status === 'running' ? Loader2 : job.status === 'failed' ? AlertCircle
    : job.status === 'completed' ? CheckCircle2 : Clock3;
  return <section className="mb-5 border-y py-4" aria-label="Processamento do email">
    <div className="flex items-start gap-3">
      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${job.status === 'running' ? 'animate-spin' : ''} ${job.status === 'failed' ? 'text-destructive' : 'text-primary'}`} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-medium">{titles[job.status] ?? 'Processamento'}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {job.attempts} de 3 tentativas{job.reason && PROCESSING_REASONS[job.reason] ? ` · ${PROCESSING_REASONS[job.reason]}` : ''}
        </p>
        {job.status === 'retry' && <p className="mt-1 text-xs text-muted-foreground">
          Disponível a partir de <time dateTime={job.availableAt.toISOString()}>{formatFullDate(job.availableAt)}</time>
        </p>}
        {events.length > 0 && <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium">Histórico de processamento</summary>
          <ol className="mt-3 space-y-2 border-l pl-3">
            {events.map(event => <li key={event.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
              <span>{eventTitles[event.kind] ?? 'Atualização'}{event.attempt > 0 ? ` · tentativa ${event.attempt}` : ''}</span>
              <time className="text-muted-foreground" dateTime={event.at.toISOString()}>{formatFullDate(event.at)}</time>
            </li>)}
          </ol>
        </details>}
      </div>
    </div>
  </section>;
}
