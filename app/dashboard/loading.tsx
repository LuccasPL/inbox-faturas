import { AppShell } from '@/components/app-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function Loading() {
  return (
    <AppShell
      active="dashboard"
      title="Visão geral"
      description="A carregar métricas…"
    >
      <div className="space-y-6">
        <div className="workspace-kpis">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="workspace-kpi"
              aria-hidden
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="size-7 shrink-0 rounded-md" />
              </div>
              <Skeleton className="mt-4 h-8 w-24" />
              <Skeleton className="mt-2 h-3 w-32 max-w-full" />
            </div>
          ))}
        </div>

        <Card className="workspace-panel">
          <CardHeader>
            <CardTitle>Pedidos por dia</CardTitle>
            <CardDescription>Últimos 30 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="workspace-panel">
            <CardHeader>
              <CardTitle>Top clientes</CardTitle>
              <CardDescription>Por valor faturado.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-1.5 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="workspace-panel">
            <CardHeader>
              <CardTitle>Confiança da extração</CardTitle>
              <CardDescription>Distribuição.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      aria-hidden
    />
  );
}
