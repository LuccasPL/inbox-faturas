import { AppShell } from '@/components/app-shell';

export default function Loading() {
  return (
    <AppShell
      active="inbox"
      title="A carregar pedido..."
      description="Estamos a buscar o email e o draft."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)]">
        <PanelSkeleton lines={6} withList />
        <PanelSkeleton lines={9} />
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

function PanelSkeleton({
  lines,
  withList,
}: {
  lines: number;
  withList?: boolean;
}) {
  return (
    <section className="rounded-lg border bg-background">
      <div className="border-b px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="mt-3 h-6 w-72 max-w-full" />
      </div>

      <div className="space-y-3 p-5">
        {Array.from({ length: lines }).map((_, i) => {
          const widths = ['w-1/2', 'w-3/4', 'w-2/3', 'w-full'];
          return (
            <Skeleton key={i} className={`h-4 ${widths[i % widths.length]}`} />
          );
        })}

        {withList && (
          <div className="mt-4 space-y-2 rounded-lg border p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
