# Seguranca operacional

## Antes de publicar

1. Executar `drizzle/0008_security_limits.sql` no Neon, usando a mesma role de `DATABASE_URL`.
2. Confirmar `POSTMARK_WEBHOOK_USER` e `POSTMARK_WEBHOOK_PASSWORD` na aplicacao e no webhook Postmark. Sao obrigatorios tambem em desenvolvimento.
3. Publicar o codigo depois do SQL. Sem a tabela de limites, as operacoes protegidas recusam pedidos; sem as novas colunas, as consultas a emails falham.
4. Os timeouts definidos na role aplicam-se a novas sessoes PostgreSQL. Confirmar na ligacao da aplicacao com `SHOW statement_timeout` e `SHOW lock_timeout`; sessoes ja existentes do pooler podem precisar de ser renovadas.
5. Para a partilha com validade, executar `drizzle/0009_proforma_share_expiry.sql` antes do novo codigo. Os links existentes recebem 7 dias na primeira execucao; repetir o SQL nao prolonga a validade. Sem esta coluna, as consultas a drafts falham.
6. Para a configuracao segura, executar `drizzle/0010_inbound_authorization.sql` e autorizar cada endereco confirmado antes de publicar. Nao ha aprovacao automatica de tenants antigos. Seguir `docs/inbound-authorization.md`; sem autorizacao, rececao e envio ficam bloqueados.
7. Aplicar `0011_email_processing_queue.sql` e `0012_navigation_indexes.sql`, configurar `EMAIL_WORKER_SECRET`, confirmar Fluid Compute e testar o agendador externo antes de considerar a recuperacao ativa. Ver `docs/email-processing-queue.md`.

A fila requer `EMAIL_WORKER_SECRET` privado e agendador externo no plano Vercel Hobby. Os contadores continuam no PostgreSQL, sem novo servico de rate limit.

## Limites atuais

As politicas vivem em `lib/security/policies.ts`. Os contadores sao atomicos no PostgreSQL e partilhados por todas as instancias. A janela comeca no primeiro pedido; o excesso devolve HTTP 429 com `Retry-After` nas APIs e uma mensagem nas Server Actions. A indisponibilidade do contador devolve 503 ou recusa a acao.

| Operacao | Limite por empresa |
| --- | --- |
| Triagem/extracao automatica e reprocessamento manual | 10 processamentos / 10 minutos |
| Rececao de webhook | 30 pedidos / minuto |
| Acionamento do worker, total global autenticado | 30 pedidos / minuto |
| Emissao | 10 pedidos / minuto |
| Envio de proforma, incluindo envio automatico | 5 pedidos / minuto |
| Reenvio do mesmo draft | 1 tentativa / 30 segundos |
| Configuracao Moloni que chama a API | 20 pedidos / minuto |
| Alteracoes e revisao | 60 pedidos / minuto |
| PDF publico e autenticado, em conjunto | 30 pedidos / minuto |
| Exportacao CSV | 5 pedidos / minuto |
| Download de anexos | 60 pedidos / minuto |

Os limites contam tentativas, incluindo falhas. Um pedido bloqueado nao prolonga a janela. O limite por empresa evita confiar num IP enviado pelo cliente. PDF publico e autenticado partilham a quota da empresa para limitar o custo de renderizacao.

| Chamada | Timeout |
| --- | --- |
| IA: triagem | 15 segundos |
| IA: extracao | 60 segundos |
| Moloni e Postmark outbound, incluindo leitura da resposta | 15 segundos |
| n8n, quando configurado | 4 segundos |
| Rececao do corpo do webhook | 10 segundos |
| Ligacao ao PostgreSQL | 10 segundos |
| Query PostgreSQL, apos aplicar o SQL | 15 segundos |
| Espera por lock, apos aplicar o SQL | 5 segundos |

A IA usa `maxRetries: 0` no SDK; a fila controla ate 3 tentativas e intervalos crescentes. Moloni e Postmark outbound nao fazem retries automaticos. `after` partilha a duracao maxima de 120 segundos da funcao e nao substitui o agendador de recuperacao. O pool local tem no maximo 5 ligacoes por instancia.

O webhook aceita JSON ate 4 MiB, ate 20 anexos e 3 MiB de conteudo descodificado no total. Verifica os bytes recebidos mesmo sem `Content-Length`, valida tipos e recalcula o tamanho dos anexos a partir do base64. Limites mais baixos da plataforma continuam a aplicar-se. Server Actions aceitam ate 256 KiB. O texto enviado para extracao e limitado a 50.000 caracteres.

## Concorrencia e resultado incerto

Cada processamento tem reserva de 5 minutos e token. A rececao confirma depois de guardar email e tarefa na mesma transacao; duplicados persistidos nao reiniciam tarefas falhadas ou concluidas. Um worker expirado/substituido nao pode publicar resultados; draft, estado do email e conclusao da tarefa sao gravados atomicamente. As tentativas da fila sao limitadas a 3 por ciclo; interrupcoes contam, adiamentos de quota nao consomem tentativa IA. Documentos protegidos nao podem ser reprocessados e emails em fila/espera/execucao recusam alteracoes, emissao e eliminacao.

O endpoint interno autentica Bearer antes de consultar o banco, com comparacao de hashes em tempo constante e configuracao obrigatoria de 64 caracteres hexadecimais. Nunca recebe segredos no URL nem devolve dados de tenants, tokens de reserva ou payloads. O agendador externo deve receber apenas esta chave exclusiva e limitada a acionar tarefas existentes. Proteger a conta, avaliar o fornecedor e rodar esta chave se exposta, sem rodar APP_ENC_KEY. Logs da fila usam codigos controlados; os eventos sao historico operacional, nao auditoria fiscal imutavel. `after` e best-effort; sem agendador ativo a recuperacao nao e autonoma.

Se a emissao Moloni foi iniciada mas a resposta nao permite confirmar o resultado, o draft fica bloqueado em `emissao_em_curso` com uma mensagem para verificar o Moloni. Nao voltar a emitir sem confirmar se foi criado um documento e reconciliar o ID. O envio Postmark com resposta incerta pede verificacao antes de reenviar; a app nao garante exactly-once de email quando o provider nao confirma a resposta.

Links publicos usam tokens de 32 caracteres base64url, com 192 bits aleatorios, sem indexacao e sem enviar o token no Referer. A validade e de 1, 7 ou 30 dias, 7 por defeito. Copiar nao prolonga o prazo. Regenerar invalida o token antigo e reinicia a primeira abertura; revogar remove o token e o prazo. Pagina publica e PDF usam a mesma consulta e recusam tokens sem prazo ou expirados segundo o relogio PostgreSQL. Operacoes de partilha verificam autenticacao, empresa e proforma emitida, com quota de alteracoes e lock transacional; o token esperado recusa alteracoes de separadores desatualizados. A revogacao nao remove copias descarregadas nem interrompe respostas ja iniciadas. Os CSV neutralizam formulas em campos textuais recebidos de clientes.

## Fronteira servidor e validacao financeira

Base de dados, criptografia, autenticacao e providers usam `import 'server-only'`. O build recusa imports desses modulos em componentes de cliente. As Server Actions continuam autenticadas e verificam a empresa do utilizador; `server-only` nao substitui autorizacao nem protege valores passados explicitamente como props.

Os drafts aceitam apenas campos editaveis, texto limitado e ate 100 linhas. Quantidades e precos devem ser numeros finitos, nao negativos, com ate 4 e 6 casas decimais, respetivamente; IVA entre 0 e 100 com ate 2 casas decimais. O total nao pode exceder o `numeric(10,2)` existente. Campos de estado, IDs e credenciais nao sao editaveis. Totais enviados por separadores antigos do navegador sao ignorados quando chegam com as linhas; pedidos para alterar apenas totais sao recusados.

Os totais sao recalculados no servidor com decimal.js. Na versao 2, subtotal e IVA sao somados antes do arredondamento agregado a duas casas decimais (half-up); o total e a soma desses dois valores arredondados. A regra e comum ao editor, pagina publica, email e PDF. `dados_finais.calculo_versao = 2` identifica novas revisoes/emissoes. Proformas anteriores, sem esse marcador, conservam o calculo original do PDF para nao alterar montantes ja emitidos. Esta regra da proforma nao substitui a validacao fiscal nem as regras de arredondamento do ERP.

A saida da extracao por IA e validada antes de persistir. Divergencias de pelo menos dois centimos entre os totais fornecidos pela IA e as linhas baixam a confianca e ficam assinaladas nas notas. O input original da IA permanece no registo interno, nao nos formularios de cliente. Rascunhos incompletos continuam editaveis, mas aprovacao/emissao exigem nome, linhas descritas e quantidades positivas; NIF, email e IBAN sao verificados quando presentes. Moloni nao arredonda taxas nao suportadas para uma taxa suportada.

Edicao e revisao usam transacoes com bloqueio do email e do draft, respeitando a ordem usada pela extracao. A aprovacao guarda o snapshot final e atualiza o email na mesma transacao. Documentos concluidos/emissao em curso e emails em processamento recusam alteracoes. A reserva de emissao compara a versao lida com os campos atuais, recusando um snapshot desatualizado.

Erros inesperados de configuracao, revisao, emissao e envio nao devolvem queries nem mensagens brutas de providers ao navegador. A UI apresenta apenas mensagens controladas e conserva as linhas anteriores se uma alteracao for recusada.

Depois de `npm run build`, executar `npm run check:client:secrets`. O verificador le os valores locais apenas para procurar correspondencias nos ficheiros de `.next/static`; mostra contagens, nunca os valores. Nao e uma garantia absoluta: cobre os valores disponiveis nesse ambiente/build, nao respostas dinamicas nem segredos desconhecidos. Sem valores disponiveis, recusa declarar a verificacao completa. Nao colocar chaves privadas em variaveis `NEXT_PUBLIC_*` nem em `next.config.env`.

Esta etapa nao exige novo SQL nem novas variaveis de ambiente. `npm test` usa a condicao `react-server` para poder testar modulos marcados como exclusivos do servidor; um teste separado confirma que os modulos de credenciais recusam carregar fora desse ambiente.

## Triagem e preservacao do historico

A resposta da triagem aceita apenas decisoes `sim`, `nao` ou `incerto`, confianca `alta`, `media` ou `baixa` e motivo nao vazio de ate 500 caracteres. Respostas com tipos, valores ou tool names inesperados sao recusadas. Classificacoes `nao` com confianca media/baixa passam a `incerto` e continuam para revisao; apenas negativas de alta confianca seguem a via de ignorar automaticamente. Estes pedidos incertos podem consumir uma extracao adicional de IA, sujeita aos limites existentes.

A eliminacao de emails e transacional e verifica novamente a empresa autenticada, o estado do email e todos os drafts associados. O lock segue a mesma ordem da extracao e revisao. Documentos aprovados, emitidos, rascunhos Moloni, emissoes em curso ou IDs de documento ja atribuidos bloqueiam a eliminacao, mesmo que o estado do email esteja desatualizado. Associacoes inconsistentes entre empresas tambem recusam a operacao. Spam e drafts nao concluidos continuam removiveis. Isto preserva o historico da aplicacao, mas nao substitui backups nem uma politica de retencao.

`.env.example` contem apenas nomes e opcoes publicas. `.env.local` e os restantes ficheiros privados continuam ignorados pelo Git.

O workflow `.github/workflows/ci.yml` usa configuracao ficticia, sem secrets do repositorio ou deploy, com `contents: read` e checkout sem persistir credenciais. As actions oficiais estao fixadas a SHAs completos, conforme a [orientacao de seguranca do GitHub](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions). O CI verifica lint, testes, build e ausencia dos valores privados ficticios nos ficheiros do frontend. Os testes aplicam os treze SQL numa base PGlite nova e confirmam colunas, idempotencia e cascade; nao executam alteracoes no Neon.

Ativar a obrigatoriedade do check CI nas regras de protecao da branch principal exige configuracao no GitHub; criar o workflow nao impede por si so um merge nem um deploy direto da plataforma. Na plataforma de deploy, garantir que a publicacao respeita esses checks.

## Prioridades operacionais

Dashboard e filtros de prioridade partilham as mesmas condicoes SQL, com o tenant autenticado e um unico ultimo draft pertencente a essa empresa por email. As consultas agregadas nao devolvem tokens de partilha, credenciais, corpos de emails, anexos ou respostas brutas da IA. A lista de proformas pode incluir a data de validade, mas nunca o token publico. Os parametros de prioridade aceitam apenas os grupos conhecidos e compativeis com o separador; o retorno ao detalhe continua a recusar origens externas e parametros nao autorizados.

Revisao antiga usa 48 horas desde a rececao, excluindo processamento ativo, falhas ja classificadas e documentos concluidos. Partilhas a expirar usam 72 horas; expiradas, as ultimas 168 horas. Os prazos sao comparados com o relogio PostgreSQL, convertendo os timestamps de rececao UTC sem zona para uma comparacao consistente. Prioridades nao executam operacoes nem retries automaticos. Os resultados podem mudar com novas mensagens ou com o tempo; nao constituem uma garantia de que todos os dados estejam corretos ou de que todos os servicos estejam configurados.

Esta etapa nao acrescenta SQL, providers ou variaveis de ambiente. Continua a exigir as migracoes anteriores, incluindo `0009`.

## Autorizacao e diagnostico de configuracao

O utilizador autenticado pode mudar o nome da empresa, mas nao atribuir ou autorizar o endereco inbound. Mesmo pedidos diretos de clientes antigos recusam alteracoes do endereco; campos adicionais de autorizacao nunca sao persistidos pelo formulario. A atribuicao e a aprovacao sao operacoes administrativas no Neon, apos confirmar identidade, conta Clerk e controlo do endereco fora da aplicacao. Acesso administrativo a base deve ser restrito. Esta etapa escolhe provisionamento manual, nao prova automatica de propriedade.

O webhook exige coincidencia entre destinatario, endereco atual e endereco autorizado, com data administrativa presente. Sem correspondencia, devolve 503 com Retry-After antes de persistir o payload ou chamar IA. O corpo da resposta nao revela se a conta existe. Mudar apenas o endereco ou revogar a autorizacao impede futuras resolucoes. A repeticao depende do prazo do Postmark; nao ha garantia de recuperar emails depois desse prazo. Operacoes que ja obtiveram a autorizacao podem estar em curso quando ocorre uma revogacao. Downloads autenticados, documentos e historico existentes nao sao apagados.

Diagnosticos e checklist usam a mesma logica e devolvem apenas estados/mensagens controladas. Presenca de credenciais nao significa validade, entrega de emails ou disponibilidade do provider. Moloni e opcional em PDF. Abrir settings nao chama providers. A verificacao explicita Moloni exige autenticacao e a quota moloniSetup; faz apenas queries, valida acesso a empresa e recusa declarar sucesso se chave/empresa tiverem mudado durante o pedido. Retorna apenas campos publicos necessarios, sem o perfil pessoal completo ou dados privados inesperados.

Selecionar uma empresa e guardar defaults valida permissao/opcoes no servidor e compara chave/empresa atuais antes de persistir. Mudar chave ou empresa remove defaults anteriores. IDs devem ser inteiros positivos compativeis com PostgreSQL; serie/produto devem constar das opcoes carregadas, e taxas devem corresponder ao mapa. Isto nao substitui testes fiscais ponta a ponta numa conta Moloni ON nem valida todos os produtos fora da pagina carregada.

Nenhuma nova variavel de ambiente ou chave e adicionada. Os testes aplicam os treze SQL e usam apenas dados ficticios, PostgreSQL isolado e respostas de providers simuladas.

## Validacao e proximas etapas

A auditoria inicial identificou 24 alertas nas dependencias de producao, incluindo 2 criticos. O Next.js foi atualizado de 16.2.7 para 16.4.0; shadcn passou a dependencia de desenvolvimento, e foram aplicadas atualizacoes compativeis dos pacotes afetados. Em 2026-10-07, `npm audit --omit=dev` terminou com 0 alertas. A auditoria completa ainda apresenta 13 alertas de desenvolvimento (9 altos e 4 moderados), nas cadeias de braces/fast-glob e esbuild/drizzle-kit. Nao aplicar `npm audit fix --force`: as sugestoes atuais fazem downgrades incompatíveis de ferramentas.

`npm test` usa PostgreSQL isolado em memoria (PGlite) e um servidor HTTP local. Nao le `.env.local`, nao liga ao Neon e nao chama providers reais. Os testes cobrem timeouts antes/depois dos headers, tamanho real do body, base64, autenticacao, quotas, falha fechada e reserva de processamento. PGlite serializa as queries; validar contencao entre varias ligacoes numa base de staging antes de aumentar a carga.

Proximas prioridades: regras de firewall/rate limit na plataforma antes de chegar ao Next.js; monitorizacao da fila e testes de contencao em staging; reconciliacao de emissao/envio incertos; regras fiscais especificas de cada ERP; logs sem dados pessoais e alertas de abuso; CSP compativel com Clerk; politica de retencao e recuperacao de backups. Os limites da aplicacao nao protegem contra ataques volumetricos nem limitam as consultas de pagina publica com tokens inexistentes.

Limpeza opcional dos contadores expirados ha mais de um dia: `DELETE FROM security_rate_limits WHERE expires_at < now() - interval '1 day';`. Nunca apagar contadores ainda ativos.

Referencias: [Postmark inbound e retries](https://postmarkapp.com/developer/webhooks/inbound-webhook), [timeouts PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-client.html), [SDK Anthropic](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript), [correcao critica Next.js para Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36).
