export const homeSections = [
  { id: 'na-pratica', label: 'Na prática' },
  { id: 'entrega', label: 'Entrega' },
  { id: 'comecar', label: 'Começar' },
  { id: 'duvidas', label: 'Dúvidas' },
] as const;

export const deliveryComparison = [
  {
    id: 'documento', label: 'O documento',
    pdf: 'Proforma em PDF, com numeração da empresa. Não substitui uma fatura certificada.',
    moloni: 'Rascunho ou documento final na conta Moloni ON, conforme a ação de emissão escolhida.',
  },
  {
    id: 'configuracao', label: 'O que configurar',
    pdf: 'Dados do emitente, NIF e morada. O IBAN é opcional.',
    moloni: 'Conta Moloni ON, empresa, tipo de documento, série, produto de referência e mapa de IVA.',
  },
  {
    id: 'resultado', label: 'O que fica disponível',
    pdf: 'Download do PDF, ligação pública e envio por email, quando o serviço de envio está configurado.',
    moloni: 'Número e estado do documento associados ao pedido. O PDF depende do que o ERP devolver.',
  },
  {
    id: 'erp', label: 'Ligação ao ERP',
    pdf: 'Não é necessária. Pode gerar proformas sem conta Moloni e sem n8n.',
    moloni: 'Obrigatória nesta via. A aplicação utiliza a integração Moloni ON.',
  },
  {
    id: 'teste', label: 'Antes de utilizar',
    pdf: 'Confirme a receção de emails e os dados da empresa com um primeiro pedido de teste.',
    moloni: 'A integração precisa de ser configurada e validada numa conta de teste antes de emitir documentos reais.',
  },
] as const;

export const setupSteps = [
  { id: 'empresa', title: 'Dados da empresa', description: 'Nome, NIF e morada do emitente para o documento. O IBAN é opcional e é verificado quando preenchido.' },
  { id: 'email', title: 'Endereço de receção', description: 'Associe à empresa um endereço já ligado ao serviço de receção de emails da aplicação.' },
  { id: 'entrega', title: 'Via de entrega', description: 'Escolha PDF de proforma para trabalhar sem ERP, ou configure a conta Moloni ON antes de emitir nessa via.' },
] as const;

export const reviewHighlights = [
  { id: 'historico', icon: 'history', title: 'Histórico por cliente', description: 'Dados e documentos confirmados anteriormente ajudam a dar contexto ao novo pedido.' },
  { id: 'validacao', icon: 'validation', title: 'Dados e totais verificados', description: 'NIF e IBAN são verificados quando preenchidos. Os totais são recalculados a partir das linhas; estas verificações não confirmam a identidade do cliente.' },
  { id: 'alertas', icon: 'alerts', title: 'Diferenças que merecem atenção', description: 'Alterações de NIF, IBAN ou email e valores fora do padrão podem ser sinalizados. São alertas de apoio à revisão, não uma conclusão sobre o pedido.' },
  { id: 'acesso', icon: 'access', title: 'Acesso por empresa', description: 'A área de trabalho exige autenticação e separa os dados por empresa. As credenciais Moloni são guardadas encriptadas no servidor.' },
] as const;

export const homeQuestions = [
  {
    id: 'automatico', question: 'A IA emite documentos automaticamente?',
    answer: 'Não. A IA faz a triagem e prepara um rascunho. A aprovação e a emissão exigem uma ação explícita sua. A confiança da extração não substitui a revisão dos dados.',
  },
  {
    id: 'corrigir', question: 'Posso corrigir os dados extraídos?',
    answer: 'Sim. Antes de aprovar ou emitir, pode corrigir o cliente, as linhas, o IVA, o prazo e as observações. Documentos aprovados, concluídos ou em emissão ficam protegidos contra alterações.',
  },
  {
    id: 'incompleto', question: 'E se faltar informação ou a extração falhar?',
    answer: 'O pedido fica para revisão. Rascunhos incompletos podem ser corrigidos, mas os dados obrigatórios têm de estar preenchidos antes de aprovar ou emitir. Se a extração falhar, o pedido pode ser reprocessado quando não existe um documento protegido.',
  },
  {
    id: 'integracoes', question: 'Preciso de Moloni ou de n8n para começar?',
    answer: 'Não para trabalhar com proformas em PDF. Moloni ON só é necessário para emitir nessa integração; n8n é opcional. A receção de emails e o processamento por IA continuam a precisar dos respetivos serviços configurados na aplicação.',
  },
  {
    id: 'rececao', question: 'Como chegam os pedidos à inbox?',
    answer: 'Os pedidos chegam a um endereço associado à empresa e ao serviço de receção de emails da aplicação. Essa ligação precisa de estar ativa: guardar um endereço nas definições não liga automaticamente uma caixa Gmail ou Outlook.',
  },
  {
    id: 'enviar', question: 'Como entrego uma proforma ao cliente?',
    answer: 'Pode descarregar o PDF ou partilhar uma ligação pública válida por 1, 7 ou 30 dias. Pode renovar ou revogar essa ligação na proforma. O envio pela aplicação requer o serviço de emails de saída configurado. Quem tiver a ligação pública pode aceder ao documento durante a validade, por isso partilhe-a apenas com o destinatário certo. Revogar não remove PDFs já descarregados.',
  },
] as const;
