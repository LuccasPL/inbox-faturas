import { isValidNifPt } from '@/lib/validation/nif-pt';
import { isValidIbanPt } from '@/lib/validation/iban-pt';
import { isInboundAuthorized, isRealInboundAddress, type InboundAuthorization } from './inbound-policy';

export type ReadinessState = 'missing' | 'configured' | 'optional' | 'disabled';
export interface ReadinessItem { id: string; label: string; state: ReadinessState; value: string; detail: string }
export interface SettingsEnvironment { inboundAuth: boolean; ai: boolean; outbound: boolean; encryption: boolean }
export interface SettingsTenant extends InboundAuthorization {
  nome: string; emissaoVia: string | null; empresaNif: string | null; empresaMorada: string | null; empresaIban: string | null;
  moloniApiKeyEnc: string | null; moloniCompanyId: number | null; moloniDefaultDocType: number | null;
  moloniDefaultDocSetId: number | null; moloniFallbackProductId: number | null; moloniTaxId23: number | null;
  notifEnabled: boolean; notifEmail: string | null;
}

export function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function hasMoloniSetup(tenant: Pick<SettingsTenant, 'moloniApiKeyEnc' | 'moloniCompanyId' | 'moloniDefaultDocType' | 'moloniDefaultDocSetId' | 'moloniFallbackProductId' | 'moloniTaxId23'>): boolean {
  return !!tenant.moloniApiKeyEnc && isPositiveId(tenant.moloniCompanyId) && tenant.moloniDefaultDocType === 1 &&
    isPositiveId(tenant.moloniDefaultDocSetId) && isPositiveId(tenant.moloniFallbackProductId) && isPositiveId(tenant.moloniTaxId23);
}

export function buildSettingsReadiness(tenant: SettingsTenant, env: SettingsEnvironment): ReadinessItem[] {
  const pdf = tenant.emissaoVia === 'pdf_proforma';
  const authorized = isInboundAuthorized(tenant);
  const profile = !!tenant.nome.trim() && isRealInboundAddress(tenant.emailInbound) &&
    !!tenant.empresaNif && isValidNifPt(tenant.empresaNif) && !!tenant.empresaMorada?.trim() &&
    (!tenant.empresaIban || isValidIbanPt(tenant.empresaIban));
  const moloni = hasMoloniSetup(tenant) && env.encryption;
  const notificationsReady = !!tenant.notifEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tenant.notifEmail) && env.outbound && authorized;
  return [
    { id: 'inbound', label: 'Endereço de receção', state: authorized ? 'configured' : 'missing',
      value: authorized ? 'Autorizado' : isRealInboundAddress(tenant.emailInbound) ? 'Por autorizar' : 'Por atribuir',
      detail: authorized ? 'Associação administrativa confirmada; a entrega Postmark ainda exige um email de teste.' : 'A receção fica bloqueada até à autorização deste endereço para a empresa.' },
    { id: 'webhook', label: 'Autenticação Postmark', state: env.inboundAuth ? 'configured' : 'missing',
      value: env.inboundAuth ? 'Configurada' : 'Por configurar', detail: 'Presença das credenciais no servidor; não confirma a configuração do webhook no Postmark.' },
    { id: 'ai', label: 'Triagem e extração', state: env.ai ? 'configured' : 'missing',
      value: env.ai ? 'Chave configurada' : 'Por configurar', detail: 'A validade da chave e o acesso ao serviço ainda não foram testados neste diagnóstico.' },
    { id: 'pdf', label: 'Perfil de proforma', state: !pdf ? 'optional' : profile ? 'configured' : 'missing',
      value: !pdf ? 'Opcional neste modo' : profile ? 'Dados preenchidos' : 'Incompleto',
      detail: 'Nome, endereço, NIF, morada e IBAN opcional; não comprova a identidade fiscal da empresa.' },
    { id: 'moloni', label: 'Moloni ON', state: pdf ? 'optional' : moloni ? 'configured' : 'missing',
      value: pdf ? 'Opcional neste modo' : moloni ? 'Configuração preenchida' : 'Incompleto',
      detail: pdf ? 'As proformas PDF não dependem de uma conta ou chave Moloni.' : 'Requer chave legível, empresa, Fatura, série, produto e IVA 23%. Outras taxas dependem das linhas do documento.' },
    { id: 'outbound', label: 'Envio de proformas', state: !env.outbound ? 'optional' : authorized ? 'configured' : 'missing',
      value: !env.outbound ? 'Download disponível' : authorized ? 'Token configurado' : 'Remetente por autorizar',
      detail: 'O envio exige também um remetente aceite no Postmark. A presença do token não comprova essa validação.' },
    { id: 'notifications', label: 'Alertas internos', state: !tenant.notifEnabled ? 'disabled' : notificationsReady ? 'configured' : 'missing',
      value: !tenant.notifEnabled ? 'Desligados' : notificationsReady ? 'Configurados' : 'Incompletos',
      detail: 'Quando ativos, dependem de destinatário, token de envio e remetente autorizado.' },
  ];
}
