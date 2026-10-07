# Seguranca operacional

## Antes de publicar

1. Executar `drizzle/0008_security_limits.sql` no Neon, usando a mesma role de `DATABASE_URL`.
2. Confirmar `POSTMARK_WEBHOOK_USER` e `POSTMARK_WEBHOOK_PASSWORD` na aplicacao e no webhook Postmark. Sao obrigatorios tambem em desenvolvimento.
3. Publicar o codigo depois do SQL. Sem a tabela de limites, as operacoes protegidas recusam pedidos; sem as novas colunas, as consultas a emails falham.
4. Os timeouts definidos na role aplicam-se a novas sessoes PostgreSQL. Confirmar na ligacao da aplicacao com `SHOW statement_timeout` e `SHOW lock_timeout`; sessoes ja existentes do pooler podem precisar de ser renovadas.

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

Links publicos usam tokens de 32 caracteres base64url, sem indexacao e sem enviar o token no Referer. Regenerar o link invalida o token antigo. Os CSV neutralizam formulas em campos textuais recebidos de clientes.

## Validacao e proximas etapas

A auditoria inicial identificou 24 alertas nas dependencias de producao, incluindo 2 criticos. O Next.js foi atualizado de 16.2.7 para 16.4.0; shadcn passou a dependencia de desenvolvimento, e foram aplicadas atualizacoes compativeis dos pacotes afetados. Em 2026-10-07, `npm audit --omit=dev` terminou com 0 alertas. A auditoria completa ainda apresenta 13 alertas de desenvolvimento (9 altos e 4 moderados), nas cadeias de braces/fast-glob e esbuild/drizzle-kit. Nao aplicar `npm audit fix --force`: as sugestoes atuais fazem downgrades incompatíveis de ferramentas.

`npm test` usa PostgreSQL isolado em memoria (PGlite) e um servidor HTTP local. Nao le `.env.local`, nao liga ao Neon e nao chama providers reais. Os testes cobrem timeouts antes/depois dos headers, tamanho real do body, base64, autenticacao, quotas, falha fechada e reserva de processamento. PGlite serializa as queries; validar contencao entre varias ligacoes numa base de staging antes de aumentar a carga.

Proximas prioridades: regras de firewall/rate limit na plataforma antes de chegar ao Next.js; fila duravel para extracao; reconciliacao de emissao/envio incertos; validacao completa de dados financeiros e saidas da IA; logs sem dados pessoais e alertas de abuso; CSP compativel com Clerk; expiracao de links publicos. Os limites da aplicacao nao protegem contra ataques volumetricos nem limitam as consultas de pagina publica com tokens inexistentes.

Limpeza opcional dos contadores expirados ha mais de um dia: `DELETE FROM security_rate_limits WHERE expires_at < now() - interval '1 day';`. Nunca apagar contadores ainda ativos.

Referencias: [Postmark inbound e retries](https://postmarkapp.com/developer/webhooks/inbound-webhook), [timeouts PostgreSQL](https://www.postgresql.org/docs/current/runtime-config-client.html), [SDK Anthropic](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript), [correcao critica Next.js para Windows](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36).
