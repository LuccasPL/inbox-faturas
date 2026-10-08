# Inbox Faturas

SaaS para transformar pedidos recebidos por email em drafts de faturação, com extração por IA e revisão humana antes da aprovação ou emissão.

O projeto está em desenvolvimento ativo e orientado ao mercado português. A aplicação oferece duas vias de entrega: integração com **Moloni ON** ou **PDF de proforma**, permitindo trabalhar sem depender de uma integração ERP disponível desde o primeiro dia.

> A proforma gerada pela aplicação não é apresentada como fatura fiscal certificada. A integração Moloni ON está implementada, mas precisa de validação ponta a ponta numa conta de teste antes de ser usada para emissão real.

## Fluxo de trabalho

```text
Email recebido no Postmark
  -> Webhook autenticado e idempotente
  -> Triagem por IA: pedido, não-pedido ou incerto
  -> Extração do email e de anexos PDF
  -> Draft validado, com totais recalculados
  -> Revisão humana e alertas de anomalias
  -> Aprovação ou emissão
  -> Moloni ON / PDF de proforma
  -> Envio e partilha, quando configurados
```

Uma classificação negativa com confiança média ou baixa segue para revisão. Conteúdo ambíguo não autoriza emissão automática. A aplicação só emite através de uma ação explícita do utilizador autenticado.

## O que já está implementado

| Área | Funcionalidades |
| --- | --- |
| Inbox | Receção de emails, triagem, pesquisa, filtros por estado/data/prioridade, paginação, revisão e reprocessamento controlado |
| Extração | Dados do cliente, linhas, IVA, prazos e observações; leitura de PDFs e referência ao histórico confirmado |
| Revisão | Edição dos campos e linhas, validação de NIF/IBAN, aprovação, rejeição e timeline |
| Anomalias | Alterações de NIF, IBAN ou email, valores fora do padrão, clientes novos de alto valor e linhas diferentes do histórico |
| Entrega | Criação de rascunho ou fatura no Moloni ON; alternativa PDF de proforma |
| Proformas | Numeração por empresa, download, envio por email, links públicos com validade, renovação/revogação e primeira abertura |
| Operação | Dashboard com prioridades acionáveis, histórico de clientes, exportação CSV e notificações internas opcionais |
| Experiência | Interface responsiva com temas claro/escuro; demonstração interativa de um pedido na página inicial e dentro da aplicação |
| Segurança | Autenticação Clerk, isolamento por empresa, credenciais encriptadas, quotas, timeouts e proteção contra alterações concorrentes |

Documentos aprovados, emitidos ou em emissão não podem ser reextraídos, editados ou apagados através da limpeza de emails. Rascunhos incompletos continuam editáveis, mas não podem ser aprovados ou emitidos sem os dados obrigatórios.

### Pesquisa e organização da inbox

A inbox permite pesquisar por cliente, remetente, email do cliente, assunto ou NIF. Os filtros de estado respeitam o grupo selecionado; as datas aplicam-se à receção do email, incluindo o dia final e usando o calendário de Lisboa.

Cada página mostra até 25 registos, com ordenação estável. Os números dos grupos representam os totais da empresa, sem o antigo limite de 50; a paginação mostra a quantidade de resultados que corresponde aos filtros. Pesquisa, datas e página ficam no URL e são preservadas no regresso do detalhe. Mudar de grupo mantém pesquisa/datas e reinicia o estado e a página.

As consultas e contagens são executadas no servidor e isoladas por empresa. A listagem não carrega corpos de emails, anexos ou respostas brutas da IA. A opção **CSV completo** continua a exportar todos os documentos concluídos, independentemente dos filtros da lista. Esta melhoria não requer novas variáveis de ambiente ou alterações SQL.

### Prioridades operacionais

O dashboard destaca emissões em curso ou com resultado incerto, extrações falhadas sem rascunho, falhas de emissão, pedidos recebidos há pelo menos **48 horas** ainda por rever, links que expiram nas próximas **72 horas** e links expirados nos últimos **7 dias**. Os últimos dois grupos exigem uma proforma emitida com um token e uma data de validade; links revogados, sem prazo ou expirados há mais tempo não entram nestes avisos.

Cada grupo abre a inbox com a prioridade aplicada. O filtro combina com pesquisa, estado e datas, mantém paginação e é preservado no regresso do detalhe. Trocar de grupo reinicia prioridade, estado e página, mantendo pesquisa/datas. Pedidos antigos aparecem do mais antigo para o mais recente; links a expirar, do prazo mais próximo para o mais distante; links expirados, do mais recente para o mais antigo. Nas listas de partilha, a data de validade aparece na hora de Lisboa.

Dashboard e inbox usam o mesmo último rascunho da empresa por email e a mesma definição de «Por rever». As prioridades são mutuamente exclusivas por pedido e usam o relógio PostgreSQL com janelas de horas decorridas, não dias de calendário. O painel é apenas de leitura: não reprocessa emails, não emite documentos, não renova links nem chama providers. Uma emissão incerta continua a exigir confirmação antes de qualquer nova tentativa.

Esta etapa não requer novos SQL nem variáveis de ambiente; utiliza o esquema existente, incluindo `0009_proforma_share_expiry.sql`. Os testes usam dados fictícios numa base isolada, sem ligar ao Neon.

### Demonstração interativa

O carrossel da página inicial acompanha um pedido fictício em cinco etapas: receção, triagem, revisão, emissão e entrega. Permite comparar PDF de proforma e Moloni ON, ajustar o prazo, simular a aprovação e o envio, e navegar por teclado ou deslize. A reprodução é opcional e pausa ao interagir com o exemplo.

Na aplicação, o botão **Ver exemplo prático** abre a mesma demonstração sem sair da página. Todos os dados são fictícios: nenhuma conta é alterada, nenhum serviço externo é chamado pela demonstração e nenhum documento ou email real é emitido.

A página inicial inclui uma comparação entre PDF de proforma e Moloni ON, os três pontos de preparação da empresa, contexto sobre a revisão e perguntas frequentes expansíveis. O conteúdo distingue proforma de fatura fiscal, explicita as dependências de receção/envio de emails e a necessidade de validar a integração Moloni ON antes da emissão real. Estas secções são públicas e estáticas; não leem credenciais nem executam operações de faturação.

### Partilha de proformas

No detalhe de uma proforma emitida, pode criar um link público válido por **1, 7 ou 30 dias** (7 por defeito). Copiar um link ativo conserva o token e a data de fim; para mudar o prazo, renovar o link. A renovação invalida o anterior e reinicia o registo da primeira abertura. Revogar retira o acesso público, sem alterar o documento emitido nem o download autenticado.

A página pública e o PDF verificam o mesmo prazo no servidor. Links expirados, revogados ou inválidos devolvem indisponível, sem expor o documento. Um separador desatualizado não pode substituir ou revogar uma partilha renovada noutro separador. Quem possuir um link ativo pode aceder ao documento; revogar não apaga PDFs já descarregados nem interrompe respostas que já estavam em curso.

**Antes de publicar esta etapa**, executar [0009_proforma_share_expiry.sql](drizzle/0009_proforma_share_expiry.sql) no Neon. Na primeira aplicação, os links existentes recebem mais 7 dias a partir da execução do SQL; repetir o ficheiro não prolonga esse prazo. Não são necessárias novas variáveis de ambiente.

## Stack

- Next.js 16.4, App Router e React 19.2.
- TypeScript, Tailwind CSS 4, componentes shadcn/Radix e Lucide.
- PostgreSQL/Neon, Drizzle ORM e postgres.js.
- Clerk para autenticação e associação do utilizador à empresa.
- Anthropic: Haiku para triagem e Sonnet para extração.
- Postmark para receção e envio de emails.
- React PDF para proformas e decimal.js para os cálculos.
- Node Test Runner e PGlite para testes isolados.

## Desenvolvimento local

### 1. Preparar o projeto

Ambiente de referência: **Node.js 24** e npm. É necessário PostgreSQL para utilizar a aplicação; os testes não precisam de uma base externa.

```bash
git clone https://github.com/LuccasPL/inbox-faturas.git
cd inbox-faturas
npm ci
```

Na primeira instalação, criar `.env.local` a partir de [.env.example](.env.example). Em PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Não executar essa cópia sobre uma configuração já preenchida. Nunca guardar credenciais reais no README, no código ou no Git.

### 2. Configurar o ambiente

| Variável | Utilização | Obrigatoriedade |
| --- | --- | --- |
| `DATABASE_URL` | Ligação PostgreSQL, incluindo credenciais e SSL necessários | Aplicação |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Chave pública da instância Clerk | Autenticação |
| `CLERK_SECRET_KEY` | Chave privada Clerk, apenas no servidor | Autenticação |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Rota local de entrada; usar `/sign-in` | Autenticação |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Rota local de registo; usar `/sign-up` | Autenticação |
| `ANTHROPIC_API_KEY` | Triagem e extração por IA | Processamento de emails |
| `POSTMARK_WEBHOOK_USER` | Utilizador de Basic Auth do webhook | Receção de emails |
| `POSTMARK_WEBHOOK_PASSWORD` | Palavra-passe de Basic Auth do webhook | Receção de emails |
| `APP_ENC_KEY` | Encriptação das credenciais Moloni guardadas na base | Ao ligar Moloni ON |
| `POSTMARK_OUTBOUND_TOKEN` | Envio de proformas e notificações internas | Apenas para envio |
| `APP_BASE_URL` | Origem da aplicação usada em notificações e automações | Recomendada; URL real em produção |
| `NEXT_PUBLIC_APP_URL` | Origem usada na geração de links públicos | Recomendada; URL real em produção |
| `N8N_WEBHOOK_URL` | Destino dos eventos de automação | Opcional |

Usar a mesma origem em `APP_BASE_URL` e `NEXT_PUBLIC_APP_URL`, por exemplo `http://localhost:3000` em desenvolvimento e a origem HTTPS publicada em produção.

`NEXT_PUBLIC_*` é público. Só a chave **publishable** do Clerk, URLs e opções públicas devem usar esse prefixo. Nunca o usar em chaves Anthropic, Postmark, Moloni, `DATABASE_URL` ou `APP_ENC_KEY`.

Para gerar uma chave de encriptação nova:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guardar o resultado apenas no ambiente privado. Se já existem credenciais Moloni encriptadas, manter a chave atual: substituí-la sem reencriptar os dados impede a leitura dessas credenciais.

### 3. Preparar a base de dados

O fluxo atual é executar os ficheiros SQL **diretamente no Neon**, por ordem, numa base nova:

| Ordem | Ficheiro | Objetivo |
| --- | --- | --- |
| 1 | [0000_add_moloni_fields.sql](drizzle/0000_add_moloni_fields.sql) | Tabelas iniciais e campos Moloni |
| 2 | [0001_add_clerk_user_id.sql](drizzle/0001_add_clerk_user_id.sql) | Associação ao utilizador Clerk |
| 3 | [0002_add_moloni_tax_ids.sql](drizzle/0002_add_moloni_tax_ids.sql) | Mapa de IVA por empresa |
| 4 | [0003_add_pdf_proforma.sql](drizzle/0003_add_pdf_proforma.sql) | Estratégia PDF e numeração |
| 5 | [0004_add_proforma_sent_tracking.sql](drizzle/0004_add_proforma_sent_tracking.sql) | Registo de envio |
| 6 | [0005_add_tenant_notifications.sql](drizzle/0005_add_tenant_notifications.sql) | Notificações internas |
| 7 | [0006_add_email_provider_event_key.sql](drizzle/0006_add_email_provider_event_key.sql) | Idempotência de receção |
| 8 | [0007_add_proforma_share_link.sql](drizzle/0007_add_proforma_share_link.sql) | Links públicos |
| 9 | [0008_security_limits.sql](drizzle/0008_security_limits.sql) | Contadores, reservas de processamento e timeouts |
| 10 | [0009_proforma_share_expiry.sql](drizzle/0009_proforma_share_expiry.sql) | Validade dos links públicos e prazo inicial dos links existentes |

Numa base existente, aplicar apenas os SQL ainda em falta e confirmar o esquema. Os timeouts de `0008` devem ser configurados na mesma role de `DATABASE_URL` e aplicam-se a novas sessões. Detalhes em [SECURITY.md](SECURITY.md).

Não usar `drizzle-kit migrate` como substituto desta sequência: o journal atual só regista `0000` e `0001`, não todos os SQL mantidos manualmente. Não usar `drizzle-kit push` em produção sem rever o plano de alterações e ter backup.

### 4. Arrancar

```bash
npm run dev
```

Abrir [localhost:3000](http://localhost:3000), criar uma conta e entrar em `/settings`. Se essa porta já estiver ocupada:

```bash
npm run dev -- --port 3001
```

Atualizar também as URLs do ambiente para a porta escolhida. O Postmark precisa de um destino acessível para entregar webhooks; `localhost` não é um destino público.

## Configuração da operação

### Receção de emails

Configurar o inbound do Postmark para enviar para:

```text
https://<origem-da-aplicacao>/api/webhooks/postmark
```

Configurar a autenticação Basic com os mesmos valores privados de `POSTMARK_WEBHOOK_USER` e `POSTMARK_WEBHOOK_PASSWORD`. É obrigatória também em desenvolvimento. Em `/settings`, associar à empresa o email inbound real correspondente ao destinatário dos pedidos. A correspondência é feita por destinatário, não por uma empresa fixa no código.

O `GET` do webhook confirma apenas que a rota responde; não verifica credenciais, base de dados ou providers. Para validar o fluxo, usar um email de teste através do Postmark e acompanhar o resultado na inbox.

### Trabalhar sem Moloni ou n8n

Escolher **PDF de proforma** em `/settings` e preencher nome, email inbound real, NIF e morada da empresa. O IBAN é opcional, mas é validado quando preenchido.

- Sem Moloni: continuar a rever pedidos e gerar proformas; não é necessário preencher IDs de IVA.
- Sem Postmark outbound: o PDF continua disponível para download; o envio automático pode mostrar um aviso de configuração em falta.
- Sem n8n: deixar `N8N_WEBHOOK_URL` vazio. O fluxo principal continua a funcionar.

### Moloni ON

A integração deste repositório usa **Moloni ON, via GraphQL**. Não deve ser confundida com a API REST do Moloni clássico.

Ligar a conta em `/settings`, escolher a empresa, o tipo de documento suportado (Fatura), a série, o produto fallback e os IDs de IVA dessa empresa. A API key é guardada encriptada no servidor.

`MOLONI_TAX_ID_23`, `MOLONI_TAX_ID_13`, `MOLONI_TAX_ID_6` e `MOLONI_TAX_ID_0` **não são variáveis usadas pelo código atual**. O mapa de taxas é configurado por empresa na interface e guardado na base de dados.

Se uma emissão tiver resultado incerto, o documento fica bloqueado para evitar duplicados. Confirmar no Moloni se foi criado antes de qualquer reconciliação ou nova tentativa.

## Verificação e publicação

```bash
npm run lint
npm test
npm run build
npm run check:client:secrets
npm audit --omit=dev
```

Os testes usam PostgreSQL em memória, dados fictícios e mocks locais. Não leem `.env.local`, não contactam o Neon e não emitem documentos nem enviam emails reais. Incluem validação financeira, reservas de processamento, quotas, permissões, proteção de documentos e aplicação dos SQL numa base nova.

O verificador do frontend procura os valores de segredos disponíveis nesse ambiente em `.next/static`, sem os mostrar. É uma verificação complementar, não uma garantia absoluta contra todas as formas de exposição.

O workflow [CI](.github/workflows/ci.yml) executa análise estática, testes, build e verificação do frontend em pushes para `main` e pull requests. Usa apenas configuração fictícia, sem secrets de produção, sem ligação ao Neon e sem publicar a aplicação. As ações estão fixadas a commits imutáveis, com permissões de leitura. A proteção de `main` e a obrigatoriedade do check precisam de ser ativadas nas regras do repositório.

Antes de publicar a aplicação:

1. Garantir backup e aplicar os SQL ainda em falta antes do código que os utiliza.
2. Configurar as variáveis privadas na plataforma, sem as incluir no repositório.
3. Confirmar a instância Clerk e as origens/rotas de autenticação do ambiente.
4. Configurar o webhook Postmark com autenticação e destinatário corretos.
5. Testar receção, revisão, download e envio num ambiente de teste.
6. Validar a integração Moloni ON com uma conta real de teste antes de emissão fiscal.

O servidor de produção pode ser arrancado, após o build, com `npm start`. O runtime precisa de Node.js; os endpoints PDF não usam Edge Runtime.

## Organização do código

```text
app/                 Páginas, Server Actions e endpoints
components/          Interface e componentes partilhados
lib/auth/            Autenticação e verificação de pertença à empresa
lib/db/              Ligação e esquema PostgreSQL
lib/extraction/      Triagem, extração, anexos e reservas de processamento
lib/drafts/          Persistência e revisão transacional
lib/validation/      Regras de dados, NIF, IBAN e respostas da IA
lib/security/        Quotas, timeouts, limites de body e CSV seguro
lib/faturas/         Cálculos e compatibilidade de documentos anteriores
lib/emission/        Geração de proformas PDF
lib/proformas/       Validade, acesso público e gestão de partilhas
lib/moloni/          Integração Moloni ON
lib/email/           Postmark e notificações
lib/automation/      Eventos opcionais para n8n
drizzle/             SQL mantidos manualmente
scripts/             Verificações locais
tests/               Testes isolados
.github/workflows/   Verificações automáticas no GitHub
```

## Limites atuais e próximas etapas

- O processamento por IA ainda corre no pedido do webhook; falta uma fila durável para volumes maiores e recuperação após falhas da plataforma.
- A reconciliação de emissões/envios com resultado incerto ainda requer confirmação no provider.
- Os limites por empresa não substituem firewall/WAF nem proteção contra ataques volumétricos.
- Os links públicos funcionam como credenciais de acesso ao documento, com validade e revogação. Não protegem PDFs já descarregados nem substituem limites/WAF antes das consultas de tokens inexistentes.
- PGlite verifica a lógica e os SQL; testes de contenção entre várias ligações PostgreSQL e testes browser ponta a ponta continuam necessários em staging.
- A proteção contra apagar documentos concluídos não substitui backups nem uma política de retenção de dados.
- A configuração atual associa um utilizador Clerk a uma empresa; permissões e equipas com vários membros ainda não estão implementadas.

Consultar [SECURITY.md](SECURITY.md) para limites, timeouts, cuidados de publicação e riscos ainda em aberto. Vulnerabilidades e credenciais não devem ser colocadas em issues públicas.
