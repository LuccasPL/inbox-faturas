export const PRIORITY_REVIEW_HOURS = 48;
export const PRIORITY_SHARE_HOURS = 72;
export const PRIORITY_EXPIRED_DAYS = 7;

export const INBOX_PRIORITIES = [
  { id: 'emissao-incerta', tab: 'por-rever', title: 'Emissões em curso ou incertas', filterLabel: 'Emissão em curso',
    description: 'Não repita uma emissão sem confirmar o resultado.', tone: 'amber', icon: 'emission', unit: 'pedido' },
  { id: 'falha-extracao', tab: 'por-rever', title: 'Extrações falhadas', filterLabel: 'Extração falhada',
    description: 'Pedidos sem rascunho após uma extração falhada.', tone: 'rose', icon: 'extraction', unit: 'pedido' },
  { id: 'falha-emissao', tab: 'por-rever', title: 'Falhas de emissão', filterLabel: 'Emissão falhada',
    description: 'Emissões com falha registada para verificar.', tone: 'rose', icon: 'failure', unit: 'pedido' },
  { id: 'revisao-antiga', tab: 'por-rever', title: 'Revisão há 48 horas', filterLabel: 'Revisão antiga (48 h)',
    description: 'Pedidos recebidos há pelo menos 48 h, ainda por rever e fora do processamento ativo.', tone: 'amber', icon: 'review', unit: 'pedido' },
  { id: 'link-a-expirar', tab: 'concluidas', title: 'Links a expirar', filterLabel: 'Link a expirar (72 h)',
    description: 'Partilhas ativas que terminam nas próximas 72 h.', tone: 'sky', icon: 'link', unit: 'proforma' },
  { id: 'link-expirado', tab: 'concluidas', title: 'Links expirados recentemente', filterLabel: 'Link expirado (7 dias)',
    description: 'Validade terminada nos últimos 7 dias; renove apenas se ainda necessário.', tone: 'neutral', icon: 'expired', unit: 'proforma' },
] as const;

export type InboxPriority = typeof INBOX_PRIORITIES[number]['id'];
export type PriorityCount = typeof INBOX_PRIORITIES[number] & { count: number };
