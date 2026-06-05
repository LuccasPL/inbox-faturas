import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface ResultadoTriagem {
  is_fatura_request: 'sim' | 'nao' | 'incerto';
  motivo: string;
  confianca: 'alta' | 'media' | 'baixa';
}

const TRIAGEM_SCHEMA = {
  name: 'classificar_email',
  description: 'Classifica se um email é um pedido para emissão de fatura.',
  input_schema: {
    type: 'object' as const,
    properties: {
      is_fatura_request: {
        type: 'string',
        enum: ['sim', 'nao', 'incerto'],
        description: 'Sim se claramente um pedido de emissão de fatura. Não se claramente outra coisa (notificações, marketing, OTPs, pessoal). Incerto quando ambíguo.',
      },
      motivo: {
        type: 'string',
        description: 'Justificação curta em português, 1 frase. Ex: "Pedido claro com dados de cliente e valores" ou "Email de notificação de login".',
      },
      confianca: {
        type: 'string',
        enum: ['alta', 'media', 'baixa'],
      },
    },
    required: ['is_fatura_request', 'motivo', 'confianca'],
  },
};

const TRIAGEM_SYSTEM_PROMPT = `És um classificador de emails para uma empresa portuguesa.

OBJETIVO: Decidir se um email é um pedido de emissão de fatura, ou outra coisa qualquer.

SIM (é pedido de fatura):
- Cliente pede para emitir fatura com dados específicos
- Email com pedido explícito tipo "por favor emita fatura", "preciso de fatura para"
- Pode ter NIF, valores, descrição de serviços/produtos
- Mesmo informal, se a intenção é clara

NÃO (não é pedido de fatura):
- Códigos OTP, verificação de login, "your verification code is..."
- Newsletters, marketing
- Notificações de plataformas (Stripe, GitHub, Linkedin, etc.)
- Resposta a outros assuntos
- Spam óbvio
- Confirmações de reservas, encomendas
- Suporte técnico

INCERTO (raros casos):
- Email muito vago, mas com palavras-chave de faturação
- Pode ser pedido de orçamento (que é parecido mas não é pedido de fatura)

REGRAS:
- Seja conservador: na dúvida, classifica como "incerto" para o humano decidir
- Português europeu (PT-PT)
- A maioria dos emails de notificação têm padrões claros (no-reply@, notifications@, accounts.dev, etc.) — fica atento aos remetentes`;

export async function triarEmail(
  subject: string,
  bodyText: string,
  fromEmail: string
): Promise<ResultadoTriagem> {
  const userMessage = `Classifica este email:

**De:** ${fromEmail}
**Assunto:** ${subject}

**Corpo (primeiros 1500 caracteres):**
${(bodyText || '').slice(0, 1500)}`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: TRIAGEM_SYSTEM_PROMPT,
    tools: [TRIAGEM_SCHEMA],
    tool_choice: { type: 'tool', name: 'classificar_email' },
    messages: [
      { role: 'user', content: userMessage },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === 'tool_use'
  );

  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Triagem não retornou tool_use válido');
  }

  return toolUse.input as ResultadoTriagem;
}