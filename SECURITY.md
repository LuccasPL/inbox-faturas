# Seguranca operacional

## Antes de publicar

1. Executar `drizzle/0008_security_limits.sql` no Neon, usando a mesma role de `DATABASE_URL`.
2. Confirmar `POSTMARK_WEBHOOK_USER` e `POSTMARK_WEBHOOK_PASSWORD` na aplicacao e no webhook Postmark. Sao obrigatorios tambem em desenvolvimento.
3. Publicar o codigo depois do SQL. Sem a tabela de limites, as operacoes protegidas recusam pedidos; sem as novas colunas, as consultas a emails falham.
4. Os timeouts definidos na role aplicam-se a novas sessoes PostgreSQL. Confirmar na ligacao da aplicacao com `SHOW statement_timeout` e `SHOW lock_timeout`; sessoes ja existentes do pooler podem precisar de ser renovadas.
5. Para a partilha com validade, executar `drizzle/0009_proforma_share_expiry.sql` antes do novo codigo. Os links existentes recebem 7 dias na primeira execucao; repetir o SQL nao prolonga a validade. Sem esta coluna, as consultas a drafts falham.

Nao ha novas variaveis de ambiente obrigatorias nem servicos de rate limit adicionais.

## Limites atuais

As politicas vivem em `lib/security/policies.ts`. Os contadores sao atomicos no PostgreSQL e partilhados por todas as instancias. A janela comeca no primeiro pedido; o excesso devolve HTTP 429 com `Retry-After` nas APIs e uma mensagem nas Server Actions. A indisponibilidade do contador devolve 503 ou recusa a acao.

| Operacao | Limite por empresa |
| --- | --- |
| Triagem/extracao automatica e reprocessamento manual | 10 processamentos / 10 minutos |
| Rececao de webhook | 30 pedidos / minuto |
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

A IA usa `maxRetries: 0`. Moloni e Postmark outbound nao fazem retries automaticos. O webhook permite 120 segundos na plataforma; este valor nao substitui uma fila de processamento. O pool local tem no maximo 5 ligacoes por instancia.

O webhook aceita JSON ate 4 MiB, ate 20 anexos e 3 MiB de conteudo descodificado no total. Verifica os bytes recebidos mesmo sem `Content-Length`, valida tipos e recalcula o tamanho dos anexos a partir do base64. Limites mais baixos da plataforma continuam a aplicar-se. Server Actions aceitam ate 256 KiB. O texto enviado para extracao e limitado a 50.000 caracteres.

## Concorrencia e resultado incerto

Cada processamento de email tem uma reserva de 5 minutos e um token. Entregas repetidas durante essa reserva devolvem 503, permitindo ao Postmark tentar novamente; um worker antigo nao pode substituir o draft do worker seguinte. Documentos aprovados ou emitidos nao podem ser substituidos por extracao nem marcados como ignorados.

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

O workflow `.github/workflows/ci.yml` usa configuracao ficticia, sem secrets do repositorio ou deploy, com `contents: read` e checkout sem persistir credenciais. As actions oficiais estao fixadas a SHAs completos, conforme a [orientacao de seguranca do GitHub](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions). O CI verifica lint, testes, build e ausencia dos valores privados ficticios nos ficheiros do frontend. Os testes aplicam os dez SQL numa base PGlite nova e confirmam colunas, idempotencia e cascade; nao executam alteracoes no Neon.

Ativar a obrigatoriedade do check CI nas regras de protecao da branch principal exige configuracao no GitHub; criar o workflow nao impede por si so um merge nem um deploy direto da plataforma. Na plataforma de deploy, garantir que a publicacao respeita esses checks.

## Validacao e proximas etapas

A auditoria inicial identificou 24 alertas nas dependencias de producao, incluindo 2 criticos. O Next.js foi atualizado de 16.2.7 para 16.4.0; shadcn passou a dependencia de desenvolvimento, e foram aplicadas atualizacoes compativeis dos pacotes afetados. Em 2026-10-07, `npm audit --omit=dev` terminou com 0 alertas. A auditoria completa ainda apresenta 13 alertas de desenvolvimento (9 altos e 4 moderados), nas cadeias de braces/fast-glob e esbuild/drizzle-kit. Nao aplicar `npm audit fix --force`: as sugestoes atuais fazem downgrades incompatíveis de ferramentas.

`npm test` usa PostgreSQL isolado em memoria (PGlite) e um servidor HTTP local. Nao le `.env.local`, nao liga ao Neon e nao chama providers reais. Os testes cobrem timeouts antes/depois dos headers, tamanho real do body, base64, autenticacao, quotas, falha fechada e reserva de processamento. PGlite serializa as queries; validar contencao entre varias ligacoes numa base de staging antes de aumentar a carga.

Proximas prioridades: regras de firewall/rate limit na plataforma antes de chegar ao Next.js; fila duravel para extracao; reconciliacao de emissao/envio incertos; regras fiscais especificas de cada ERP; logs sem dados pessoais e alertas de abuso; CSP compativel com Clerk; politica de retencao e recuperacao de backups. Os limites da aplicacao nao protegem contra ataques volumetricos nem limitam as consultas de pagina publica com tokens inexistentes.

Limpeza opcional dos contadores expirados ha mais de um dia: `DELETE FROM security_rate_limits WHERE expires_at < now() - interval '1 day';`. Nunca apagar contadores ainda ativos.

Referencias: [Postmark inbound e retries](https://postmarkapp.com/developer/webhooks/inbound-webhook), [timeouts PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-client.html), [SDK Anthropic](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript), [correcao critica Next.js para Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36).
