'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ProcessingRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let checks = 0;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (++checks > 12) { clearInterval(timer); return; }
      router.refresh();
    }, 15_000);
    return () => clearInterval(timer);
  }, [active, router]);
  return active ? <Button variant="outline" size="sm" onClick={() => router.refresh()}>
    <RefreshCw className="size-4" aria-hidden />Atualizar estado
  </Button> : null;
}
