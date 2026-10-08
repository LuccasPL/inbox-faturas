import { AppShell } from '@/components/app-shell';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { MoloniForm } from './moloni-form';
import { TenantForm } from './tenant-form';
import { EmissaoForm } from './emissao-form';
import { NotificationsForm } from './notifications-form';
import { isInboundAuthorized } from '@/lib/settings/inbound-policy';
import { settingsReadiness } from '@/lib/settings/environment';
import { ConfigurationStatus } from './configuration-status';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const tenant = await getOrCreateTenantForUser();
  const readiness = settingsReadiness(tenant);

  return (
    <AppShell
      active="settings"
      title="Definições"
      description="Dados da empresa, receção de pedidos e modo de emissão."
    >
      <div className="space-y-6">
      <ConfigurationStatus items={readiness} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
        <div className="min-w-0 space-y-6">
          <TenantForm
            initial={{
              nome: tenant.nome,
              emailInbound: tenant.emailInbound,
              inboundAuthorized: isInboundAuthorized(tenant),
            }}
          />

          <NotificationsForm
            initial={{
              enabled: tenant.notifEnabled,
              email: tenant.notifEmail,
            }}
          />

          <EmissaoForm
            initial={{
              via: (tenant.emissaoVia === 'pdf_proforma'
                ? 'pdf_proforma'
                : 'moloni') as 'moloni' | 'pdf_proforma',
              empresaNif: tenant.empresaNif,
              empresaMorada: tenant.empresaMorada,
              empresaIban: tenant.empresaIban,
            }}
          />

        </div>

        <MoloniForm
          initial={{
            isConnected: !!tenant.moloniApiKeyEnc,
            optional: tenant.emissaoVia === 'pdf_proforma',
            companyId: tenant.moloniCompanyId,
            defaultDocType: tenant.moloniDefaultDocType,
            defaultDocSetId: tenant.moloniDefaultDocSetId,
            fallbackProductId: tenant.moloniFallbackProductId,
            taxId23: tenant.moloniTaxId23,
            taxId13: tenant.moloniTaxId13,
            taxId6: tenant.moloniTaxId6,
            taxId0: tenant.moloniTaxId0,
            options: null,
            companies: null,
          }}
        />
      </div>
      </div>
    </AppShell>
  );
}
