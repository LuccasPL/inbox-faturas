'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { atualizarTenant } from './actions';

interface Props {
  initial: {
    nome: string;
    emailInbound: string;
  };
}

export function TenantForm({ initial }: Props) {
  const [nome, setNome] = useState(initial.nome);
  const [emailInbound, setEmailInbound] = useState(initial.emailInbound);
  const [pending, startTransition] = useTransition();

  const dirty =
    nome.trim() !== initial.nome ||
    emailInbound.trim().toLowerCase() !== initial.emailInbound.toLowerCase();

  function onSave() {
    startTransition(async () => {
      const res = await atualizarTenant({ nome, emailInbound });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Tenant atualizado');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={pending}
            placeholder="Ex: Luccas Dev, Lda."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="emailInbound">Email inbound (Postmark)</Label>
          <Input
            id="emailInbound"
            value={emailInbound}
            onChange={(e) => setEmailInbound(e.target.value)}
            disabled={pending}
            placeholder="ex: faturas@dominio.pt"
          />
          <p className="text-xs text-muted-foreground">
            O endereço que recebe os emails dos teus clientes (configurado no
            Postmark Inbound Stream).
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
