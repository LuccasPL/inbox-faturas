'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { reprocessarEmail } from '@/app/inbox/triagem-actions';

export function ReprocessarButton({ emailId }: { emailId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = confirm(
      'Reprocessar este email? A triagem e extração vão correr de novo e o draft atual será substituído.',
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        await reprocessarEmail(emailId);
        toast.success('Email reprocessado');
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Erro ao reprocessar',
        );
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4 mr-2" />
      )}
      {pending ? 'A reprocessar...' : 'Reprocessar'}
    </Button>
  );
}
