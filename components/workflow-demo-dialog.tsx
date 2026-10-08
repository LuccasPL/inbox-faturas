'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { PlayCircle, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
const WorkflowDemo = dynamic(() => import('@/components/workflow-demo').then(module => module.WorkflowDemo), {
  loading: () => <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground" role="status">A carregar demonstração...</div>,
});

export function WorkflowDemoDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={compact ? 'shell-demo-button shell-demo-button--compact' : 'shell-demo-button'} title="Ver um pedido na prática" aria-label="Ver um pedido na prática">
          <PlayCircle className="size-4 shrink-0" />{!compact && <span>Ver exemplo prático</span>}
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto rounded-lg p-0 sm:max-w-[1100px]">
        <DialogHeader className="sticky top-0 z-10 border-b bg-popover px-5 py-5 pr-12">
          <DialogTitle>Um pedido na prática</DialogTitle>
          <DialogDescription>Do email à entrega, com dados fictícios e sem alterar a sua conta.</DialogDescription>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute top-3 right-3" title="Fechar demonstração" aria-label="Fechar demonstração"><X className="size-4" /></Button>
          </DialogClose>
        </DialogHeader>
        {open && <WorkflowDemo embedded />}
      </DialogContent>
    </Dialog>
  );
}
