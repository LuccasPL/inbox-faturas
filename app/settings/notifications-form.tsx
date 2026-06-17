'use client';

import { useState, useTransition } from 'react';
import { BellRing, Mail } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { atualizarNotificacoes } from './actions';

interface Props {
  initial: {
    enabled: boolean;
    email: string | null;
  };
}

export function NotificationsForm({ initial }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [email, setEmail] = useState(initial.email ?? '');
  const [pending, startTransition] = useTransition();

  const normalizedInitialEmail = (initial.email ?? '').trim().toLowerCase();
  const normalizedEmail = email.trim().toLowerCase();
  const dirty =
    enabled !== initial.enabled || normalizedEmail !== normalizedInitialEmail;

  function onSave() {
    startTransition(async () => {
      const res = await atualizarNotificacoes({
        enabled,
        email: normalizedEmail || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Alertas atualizados');
    });
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Alertas internos</CardTitle>
        <CardDescription>
          Notifica a equipa quando entra um pedido novo para revisão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={pending}
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BellRing className="size-4" />
              <span>Enviar alerta por email</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              O aviso sai quando um email relevante entra no inbox e é criado
              para revisão.
            </p>
          </div>
        </label>

        <div className="space-y-2">
          <Label htmlFor="notifEmail">Email de destino</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="notifEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="operacoes@empresa.pt"
              className="pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Pode ser o teu email ou uma caixa partilhada da operação.
          </p>
        </div>

        <div className="pt-2">
          <Button onClick={onSave} disabled={!dirty || pending}>
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
