import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface DadosFaturaExtraidos {
  cliente_nome: string | null;
  cliente_nif: string | null;
  cliente_email: string | null;
  cliente_morada: string | null;
  items: Array<{
    descricao: string;
    quantidade: number;
    preco_unitario: number;
    iva_percentagem: number;
  }>;
  subtotal: number | null;
  iva_valor: number | null;
  total: number | null;
  iban: string | null;
  prazo_pagamento: string | null;
  observacoes: string | null;
  confianca_extracao: 'alta' | 'media' | 'baixa';
  notas_extracao: string;
}

const TOOL_SCHEMA = {
  name: 'extrair_dados_fatura',
  description: 'Extrai dados estruturados de um email com pedido de emissão de fatura.',
  input_schema: {
    type: 'object' as const,
    properties: {
      cliente_nome: {
        type: ['string', 'null'],
        description: 'Nome do cliente ou empresa a quem se emite a fatura. Null se não conseguires identificar.',
      },
      cliente_nif: {
        type: ['string', 'null'],
        description: 'NIF/Contribuinte do cliente (9 dígitos em Portugal). Apenas dígitos, sem espaços ou prefixos.',
      },
      cliente_email: {
        type: ['string', 'null'],
        description: 'Email de faturação do cliente, se mencionado.',
      },
      cliente_morada: {
        type: ['string', 'null'],
        description: 'Morada de faturação do cliente, se mencionada.',
      },
      items: {
        type: 'array',
        description: 'Lista de items/linhas da fatura.',
        items: {
          type: 'object',
          properties: {
            descricao: { type: 'string' },
            quantidade: { type: 'number' },
            preco_unitario: { type: 'number' },
            iva_percentagem: { 
              type: 'number',
              description: 'Taxa de IVA aplicável (23, 13, 6, ou 0). Em Portugal o default é 23%.',
            },
          },
          required: ['descricao', 'quantidade', 'preco_unitario', 'iva_percentagem'],
        },
      },
      subtotal: {
        type: ['number', 'null'],
        description: 'Subtotal sem IVA. Calcula se não vier explícito.',
      },
      iva_valor: {
        type: ['number', 'null'],
        description: 'Valor total de IVA. Calcula se não vier explícito.',
      },
      total: {
        type: ['number', 'null'],
        description: 'Total final com IVA. Calcula se não vier explícito.',
      },
      iban: {
        type: ['string', 'null'],
        description: 'IBAN para pagamento, se mencionado no email. Formato PT50XXXXXXXXXXXXXXXXXXXXX.',
      },
      prazo_pagamento: {
        type: ['string', 'null'],
        description: 'Prazo de pagamento (ex: "30 dias", "pronto pagamento", "15 dias").',
      },
      observacoes: {
        type: ['string', 'null'],
        description: 'Notas adicionais relevantes para a fatura.',
      },
      confianca_extracao: {
        type: 'string',
        enum: ['alta', 'media', 'baixa'],
        description: 'O teu nível de confiança na extração. Alta se todos os campos críticos estão claros, baixa se faltaram dados importantes ou inferiste muito.',
      },
      notas_extracao: {
        type: 'string',
        description: 'Notas curtas sobre o que assumiste, dúvidas, ou ambiguidades. Em português.',
      },
    },
    required: ['items', 'confianca_extracao', 'notas_extracao'],
  },
};

const SYSTEM_PROMPT = `És um assistente especializado em extrair dados de emails portugueses para emissão de faturas.

CONTEXTO: O utilizador é uma empresa portuguesa que recebe pedidos de fatura por email dos seus clientes. O teu trabalho é ler o email e extrair os dados estruturados para gerar a fatura.

REGRAS IMPORTANTES:
1. Português europeu (pt-PT), não português do Brasil. Termos como "fatura" (não "nota fiscal"), "NIF" (não "CPF/CNPJ"), "IVA" (não "ICMS").
2. NIF português tem sempre 9 dígitos. Se vires algo como "PT500123456" ou "NIF 500 123 456", o NIF é "500123456".
3. IVA padrão em Portugal é 23%. Taxas reduzidas: 13% (intermédia), 6% (reduzida), 0% (isento). Se não for mencionado, assume 23%.
4. Valores em euros. "1.500€" ou "1500,00" ou "mil e quinhentos euros" → 1500.
5. IBAN português começa por PT50 seguido de 21 dígitos.
6. Se um item não tem quantidade explícita, assume 1.
7. Calcula subtotal, iva_valor e total mesmo que não venham explícitos no email — usa os items.
8. Se um campo crítico (cliente_nome, valor total, descrição do serviço) está ambíguo ou em falta, marca confianca_extracao como "baixa" e explica em notas_extracao.
9. NUNCA inventes NIFs, IBANs ou valores. Se não vier, deixa null.
10. Em notas_extracao, sê breve e útil — diz o que assumiste ou o que falta. Ex: "Assumi IVA 23% (não especificado). Faltou IBAN."

HISTÓRICO DO CLIENTE: Se o email te chegar com um bloco "HISTÓRICO" (faturas anteriores deste mesmo cliente já confirmadas pelo humano), usa-o como fonte de verdade para:
- Morada, NIF, email do cliente (se forem consistentes no histórico, usa-os mesmo que não venham neste email)
- IVA típico para os items deste cliente (ex: se sempre teve IVA 6%, mantém)
- Prazo de pagamento e IBAN preferidos
- Padrão de descrições e estrutura típica das linhas
O histórico reflete o que o humano confirmou anteriormente — esses valores ganham contra a tua interpretação direta do email atual em caso de conflito.

OBJETIVO: Maximizar a precisão para reduzir trabalho de revisão humana. O humano vai aprovar, mas o teu trabalho é deixar o draft o mais correto possível.`;

export interface PdfAttachment {
  name: string;
  base64: string;
}

/** Limites de PDFs passados ao Claude (cobrir 95% dos pedidos sem explodir custos). */
export const PDF_LIMITS = {
  maxBytes: 5 * 1024 * 1024, // 5 MB
  maxCount: 3,
};

/**
 * Snapshot compacto de uma fatura anterior do mesmo cliente,
 * usado como exemplo para o Claude aprender padrões consistentes.
 */
export interface HistoricoExemplo {
  cliente_nome: string | null;
  cliente_nif: string | null;
  cliente_email: string | null;
  cliente_morada: string | null;
  items: Array<{ descricao: string; iva_percentagem: number }>;
  prazo_pagamento: string | null;
  iban: string | null;
}

export async function extrairDadosFatura(
  subject: string,
  bodyText: string,
  fromEmail: string,
  pdfs: PdfAttachment[] = [],
  historico: HistoricoExemplo[] = [],
): Promise<{ dados: DadosFaturaExtraidos; rawResponse: any }> {
  const pdfBlocks = pdfs.slice(0, PDF_LIMITS.maxCount).map((pdf) => ({
    type: 'document' as const,
    source: {
      type: 'base64' as const,
      media_type: 'application/pdf' as const,
      data: pdf.base64,
    },
    title: pdf.name,
  }));

  const historicoBlock =
    historico.length > 0
      ? `

**HISTÓRICO DESTE CLIENTE** (${historico.length} fatura(s) anterior(es) confirmada(s) pelo humano — usa como referência):
${JSON.stringify(historico, null, 2)}
`
      : '';

  const textBlock = {
    type: 'text' as const,
    text: `Extrai os dados deste email${
      pdfBlocks.length > 0
        ? ` e dos ${pdfBlocks.length} PDF(s) em anexo (orçamento/proforma/contrato)`
        : ''
    }:

**De:** ${fromEmail}
**Assunto:** ${subject}

**Corpo:**
${bodyText}
${historicoBlock}
${
  pdfBlocks.length > 0
    ? 'Quando os PDFs e o corpo do email tiverem informação diferente, prefere os PDFs (geralmente são o documento oficial). Combina informação dos vários PDFs se relevante.'
    : ''
}`,
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'extrair_dados_fatura' },
    messages: [
      { role: 'user', content: [...pdfBlocks, textBlock] },
    ],
  });

  // Encontra o tool_use block na resposta
  const toolUse = response.content.find(
    (block) => block.type === 'tool_use'
  );

  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude não retornou tool_use válido');
  }

  return {
    dados: toolUse.input as DadosFaturaExtraidos,
    rawResponse: response,
  };
}