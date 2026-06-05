'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  reclassificarComoFatura,
  reclassificarComoIgnorado,
} from './triagem-actions';

export function ReclassificarButton({
  emailId,
  action,
}: {
  emailId: string;
  action: 'parafatura' | 'paraignorado';
}) {
  const [isPending, startTransition] = useTransition();

  const handle = () => {
    startTransition(async () => {
      try {
        if (action === 'parafatura') {
          await reclassificarComoFatura(emailId);
          toast.success('Email reclassificado. A processar...');
        } else {
          await reclassificarComoIgnorado(emailId);
          toast.success('Email marcado como ignorado');
        }
      } catch (error) {
        toast.error('Erro ao reclassificar');
      }
    });
  };

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handle}
      disabled={isPending}
    >
      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {action === 'parafatura' ? 'É pedido de fatura' : 'Não é pedido de fatura'}
    </Button>
  );
}