import { AppShell } from '@/components/app-shell';
import { decrypt } from '@/lib/crypto';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import * as moloni from '@/lib/moloni/api';
import { MoloniForm } from './moloni-form';
import { TenantForm } from './tenant-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const tenant = await getOrCreateTenantForUser();

  const isConnected = !!tenant.moloniApiKeyEnc;
  const hasFullSetup =
    isConnected &&
    !!tenant.moloniCompanyId &&
    !!tenant.moloniDefaultDocType &&
    !!tenant.moloniDefaultDocSetId &&
    !!tenant.moloniFallbackProductId;

  let initialOptions = null;
  const initialCompanies = null;
  if (hasFullSetup && tenant.moloniCompanyId) {
    try {
      const apiKey = decrypt(tenant.moloniApiKeyEnc!);
      const [types, sets, prods] = await Promise.all([
        moloni.documentTypes(apiKey, tenant.moloniCompanyId),
        moloni.documentSetsForDocument(
          apiKey,
          tenant.moloniCompanyId,
          tenant.moloniDefaultDocType!,
        ),
        moloni.products(apiKey, tenant.moloniCompanyId),
      ]);
      initialOptions = {
        documentTypes: types,
        documentSets: sets,
        products: prods,
      };
    } catch {
      initialOptions = null;
    }
  }

  return (
    <AppShell
      active="settings"
      title="Settings"
      description="Tenant, email inbound e ligação ao ERP."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="space-y-6">
          <TenantForm
            initial={{
              nome: tenant.nome,
              emailInbound: tenant.emailInbound,
            }}
          />

          <section className="rounded-lg border bg-background p-5">
            <div className="text-sm font-medium">Estado da configuração</div>
            <div className="mt-4 grid gap-3 text-sm">
              <StatusLine
                label="Email inbound"
                value={
                  tenant.emailInbound.endsWith('@pending.invalid')
                    ? 'Pendente'
                    : tenant.emailInbound
                }
                ok={!tenant.emailInbound.endsWith('@pending.invalid')}
              />
              <StatusLine
                label="Moloni"
                value={hasFullSetup ? 'Configurado' : 'Incompleto'}
                ok={hasFullSetup}
              />
              <StatusLine
                label="API key"
                value={isConnected ? 'Guardada' : 'Por ligar'}
                ok={isConnected}
              />
            </div>
          </section>
        </div>

        <MoloniForm
          initial={{
            isConnected,
            companyId: tenant.moloniCompanyId,
            defaultDocType: tenant.moloniDefaultDocType,
            defaultDocSetId: tenant.moloniDefaultDocSetId,
            fallbackProductId: tenant.moloniFallbackProductId,
            options: initialOptions,
            companies: initialCompanies,
          }}
        />
      </div>
    </AppShell>
  );
}

function StatusLine({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/35 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={ok ? 'font-medium' : 'font-medium text-amber-700'}>
        {value}
      </span>
    </div>
  );
}
