'use client';

import { useState, useTransition } from 'react';
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
import { Save, ShieldCheck } from 'lucide-react';
import { isRealInboundAddress } from '@/lib/settings/inbound-policy';
import { atualizarTenant } from './actions';

interface Props {
  initial: {
    nome: string;
    emailInbound: string;
    inboundAuthorized: boolean;
  };
}

export function TenantForm({ initial }: Props) {
  const [nome, setNome] = useState(initial.nome);
  const [pending, startTransition] = useTransition();

  const dirty = nome.trim() !== initial.nome;

  function onSave() {
    startTransition(async () => {
      const res = await atualizarTenant({ nome });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Dados da empresa atualizados');
    });
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Empresa</CardTitle>
        <CardDescription>
          Identidade da empresa e endereço de receção atribuído.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nome">Nome</Label>
          <Input
            id="nome"
            maxLength={160}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={pending}
            placeholder="Ex: Luccas Dev, Lda."
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>Endereço de receção</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden className="size-3.5" />{initial.inboundAuthorized ? 'Autorizado' : 'Por autorizar'}</span>
          </div>
          <p className="break-all border-b py-2 text-sm font-medium">{isRealInboundAddress(initial.emailInbound) ? initial.emailInbound : 'Por atribuir'}</p>
          <p className="text-xs text-muted-foreground">
            A atribuição e a alteração deste endereço dependem de autorização administrativa.
          </p>
        </div>

        <div className="pt-2">
          <Button onClick={onSave} disabled={!dirty || pending}>
            <Save aria-hidden /> Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
