import { AppShell } from '@/components/app-shell';

export default function Loading() {
  return <AppShell active="settings" title="Definições" description="A carregar configuração...">
    <div role="status" aria-label="A carregar configuração" className="space-y-6">
      <div aria-hidden className="h-64 animate-pulse rounded-lg bg-muted" />
      <div className="grid gap-6 xl:grid-cols-2" aria-hidden>
        <div className="h-80 animate-pulse rounded-lg bg-muted" /><div className="h-80 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  </AppShell>;
}
