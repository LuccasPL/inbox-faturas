'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { eliminarEmail } from '@/app/inbox/triagem-actions';

export function EliminarButton({ emailId }: { emailId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const ok = confirm(
      'Eliminar permanentemente este email e o draft associado? Esta acção não pode ser desfeita.',
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        await eliminarEmail(emailId);
        toast.success('Email eliminado');
        router.push('/inbox');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao eliminar');
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending}
      className="text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4 mr-2" />
      )}
      {pending ? 'A eliminar...' : 'Eliminar'}
    </Button>
  );
}
