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
import { FileText, Receipt } from 'lucide-react';
import { atualizarEmissao } from './actions';

type Via = 'moloni' | 'pdf_proforma';

interface Props {
  initial: {
    via: Via;
    empresaNif: string | null;
    empresaMorada: string | null;
    empresaIban: string | null;
  };
}

export function EmissaoForm({ initial }: Props) {
  const [via, setVia] = useState<Via>(initial.via);
  const [nif, setNif] = useState(initial.empresaNif ?? '');
  const [morada, setMorada] = useState(initial.empresaMorada ?? '');
  const [iban, setIban] = useState(initial.empresaIban ?? '');
  const [pending, startTransition] = useTransition();

  function onSave() {
    startTransition(async () => {
      const res = await atualizarEmissao({
        via,
        empresaNif: nif || null,
        empresaMorada: morada || null,
        empresaIban: iban || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Modo de emissão atualizado');
    });
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Emissão</CardTitle>
        <CardDescription>
          Como queres emitir o documento depois da revisão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <OptionTile
            icon={<Receipt className="size-4" />}
            label="Moloni"
            description="Fatura certificada AT, criada no ERP."
            selected={via === 'moloni'}
            onClick={() => setVia('moloni')}
            disabled={pending}
          />
          <OptionTile
            icon={<FileText className="size-4" />}
            label="Proforma PDF"
            description="Documento não fiscal gerado pela app, com envio ao cliente."
            selected={via === 'pdf_proforma'}
            onClick={() => setVia('pdf_proforma')}
            disabled={pending}
          />
        </div>

        {via === 'pdf_proforma' && (
          <div className="space-y-4 rounded-lg border bg-muted/25 p-4">
            <div>
              <div className="text-sm font-medium">Dados do emitente</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Aparecem no topo do PDF. No Moloni vêm da configuração da
                empresa, aqui temos de os manter no tenant.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                NIF e morada são obrigatórios para emitir. IBAN é opcional, mas
                tem de ser válido se for preenchido.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="empresa-nif">NIF</Label>
              <Input
                id="empresa-nif"
                value={nif}
                onChange={(e) => setNif(e.target.value)}
                placeholder="500000000"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empresa-morada">Morada</Label>
              <Input
                id="empresa-morada"
                value={morada}
                onChange={(e) => setMorada(e.target.value)}
                placeholder="Rua, código postal, cidade"
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empresa-iban">IBAN (para pagamento)</Label>
              <Input
                id="empresa-iban"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="PT50 0002 0123 1234 5678 9015 4"
                disabled={pending}
              />
            </div>
          </div>
        )}

        <div className="pt-2">
          <Button onClick={onSave} disabled={pending}>
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OptionTile({
  icon,
  label,
  description,
  selected,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        selected
          ? 'flex items-start gap-3 rounded-lg border-2 border-primary bg-primary/5 p-4 text-left transition-colors'
          : 'flex items-start gap-3 rounded-lg border-2 border-transparent bg-muted/30 p-4 text-left transition-colors hover:bg-muted/50'
      }
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </div>
      </div>
    </button>
  );
}
