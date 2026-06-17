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
    <AppShell active="inbox" title="Inbox" description="A carregar pedidos...">
      <div className="space-y-6">
        {/* Tabs skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Pedidos por rever</CardTitle>
            <CardDescription>
              A carregar drafts pendentes e extrações em curso.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y border-t">
              {Array.from({ length: 5 }).map((_, i) => (
                <RowSkeleton key={i} />
              ))}
            </div>
          </CardContent>
        </Card>
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

function RowSkeleton() {
  return (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3.5 w-72 max-w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
      </div>
      <Skeleton className="h-5 w-20 shrink-0" />
    </div>
  );
}
