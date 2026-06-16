import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/theme-toggle';
import { getOrCreateTenantForUser } from '@/lib/auth/tenant';
import { decrypt } from '@/lib/crypto';
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

  // Se já está totalmente configurado, pré-carrega as opções para
  // permitir edição direta.
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
      // se a key falhar (revogada, alterada) tratamos como não-ligado abaixo
    }
  }

  return (
    <main className="min-h-screen">
      <header className="flex justify-between items-center p-6 border-b">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xl font-bold">
            Inbox Faturas
          </Link>
          <nav className="text-sm text-muted-foreground flex gap-4">
            <Link href="/inbox" className="hover:text-foreground">
              Inbox
            </Link>
            <span className="text-foreground font-medium">Settings</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton />
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

        <TenantForm
          initial={{
            nome: tenant.nome,
            emailInbound: tenant.emailInbound,
          }}
        />

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
    </main>
  );
}
