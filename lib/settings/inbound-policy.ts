export interface InboundAuthorization {
  emailInbound: string;
  emailInboundAuthorizedAddress: string | null;
  emailInboundAuthorizedAt: Date | null;
}

export function isRealInboundAddress(address: string): boolean {
  return typeof address === 'string' && address.length <= 254 &&
    address === address.trim().toLowerCase() &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) && !address.endsWith('.invalid');
}

export function isInboundAuthorized(tenant: InboundAuthorization): boolean {
  return isRealInboundAddress(tenant.emailInbound) &&
    tenant.emailInboundAuthorizedAddress === tenant.emailInbound &&
    tenant.emailInboundAuthorizedAt instanceof Date &&
    Number.isFinite(tenant.emailInboundAuthorizedAt.getTime());
}
