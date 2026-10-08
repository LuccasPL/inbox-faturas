import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleAlert, Clock3, FileWarning, Link as LinkIcon, ShieldAlert, Unlink } from 'lucide-react';
import { inboxHref, parseInboxFilters } from '@/lib/inbox/filters';
import type { PriorityCount } from '@/lib/inbox/priorities';

const icons = { emission: ShieldAlert, extraction: FileWarning, failure: CircleAlert, review: Clock3, link: LinkIcon, expired: Unlink };

export function DashboardPriorities({ groups }: { groups: PriorityCount[] }) {
  const active = groups.filter(group => group.count > 0);
  return (
    <section className="workspace-priorities" aria-labelledby="dashboard-priorities-title">
      <div className="workspace-priorities-heading">
        <h2 id="dashboard-priorities-title">Prioridades</h2>
        <span>{active.length.toLocaleString('pt-PT')} {active.length === 1 ? 'grupo sinalizado' : 'grupos sinalizados'}</span>
      </div>
      {active.length === 0 ? (
        <div className="workspace-priorities-empty"><CheckCircle2 aria-hidden className="size-4 text-primary" /><p>Sem prioridades sinalizadas.</p></div>
      ) : (
        <ul className="workspace-priority-list">
          {active.map(group => {
            const Icon = icons[group.icon];
            const href = inboxHref(parseInboxFilters({ tab: group.tab, priority: group.id }));
            return (
              <li key={group.id}>
                <Link href={href} prefetch={false} className={`workspace-priority-row workspace-priority--${group.tone}`}>
                  <span className="workspace-priority-icon"><Icon aria-hidden className="size-4" /></span>
                  <div className="workspace-priority-copy"><h3>{group.title}</h3><p>{group.description}</p></div>
                  <span className="workspace-priority-count"><strong>{group.count.toLocaleString('pt-PT')}</strong><span>{group.unit}{group.count === 1 ? '' : 's'}</span></span>
                  <ArrowRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
