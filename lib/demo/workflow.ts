import { calculateTotals, type InvoiceItem } from '@/lib/faturas/totals';

export type DemoMode = 'pdf_proforma' | 'moloni';

// Public, fictional data only: this module is intentionally safe for the browser.
export const demoRequest = {
  client: 'Atelier Horizonte',
  email: 'compras@atelier.example',
  recipient: 'pedidos@empresa.example',
  nif: '999999990',
  subject: 'Pedido de documento — consultoria de setembro',
  items: [
    { descricao: 'Consultoria de gestão', quantidade: 10, preco_unitario: 120, iva_percentagem: 23 },
    { descricao: 'Preparação do relatório', quantidade: 1, preco_unitario: 300, iva_percentagem: 23 },
  ] satisfies InvoiceItem[],
};

export const demoTotals = calculateTotals(demoRequest.items);

export const demoSteps = [
  { title: 'Receber', heading: 'Tudo começa com um email.', description: 'O cliente envia o pedido e os dados de faturação para o endereço da sua empresa.', detail: 'O email original fica disponível durante a revisão.' },
  { title: 'Separar', heading: 'Um pedido, não mais ruído.', description: 'A triagem identifica o pedido. A extração prepara o cliente, as linhas e o IVA num rascunho.', detail: 'Uma classificação incerta segue para revisão humana.' },
  { title: 'Rever', heading: 'A última palavra é sua.', description: 'Compare o email com os dados extraídos. Confirme os valores e ajuste o prazo de pagamento neste exemplo.', detail: 'A aprovação não acontece automaticamente.' },
  { title: 'Emitir', heading: 'Escolha a saída do documento.', description: 'Depois da revisão, emita uma proforma em PDF ou crie um documento no Moloni ON, conforme a configuração.', detail: 'O modo de emissão é definido nas definições da empresa.' },
  { title: 'Entregar', heading: 'Do pedido ao documento.', description: 'O resultado fica associado ao pedido. A proforma pode ser enviada por email ou partilhada por ligação.', detail: 'Uma proforma não substitui uma fatura certificada.' },
] as const;

export function moveDemoStep(current: number, direction: -1 | 1) {
  return (current + direction + demoSteps.length) % demoSteps.length;
}
