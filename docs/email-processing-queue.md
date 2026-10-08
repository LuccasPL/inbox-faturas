# Fila de processamento de emails

## O que muda

A rececao confirma HTTP 200 apenas depois de guardar o email e a tarefa na mesma transacao. A IA corre depois da resposta, via `after` do Next.js. Este arranque e uma tentativa imediata, nao uma garantia de execucao: a tarefa permanece no PostgreSQL se a plataforma interromper a funcao.

Um agendador independente chama `/api/internal/email-worker` para recuperar uma tarefa disponivel por chamada. GET e POST sao aceites, sem body. O endpoint exige `Authorization: Bearer <EMAIL_WORKER_SECRET>`, nao aceita chaves no URL e nao devolve IDs, documentos ou dados de clientes. HTTP 200 com `scheduled: true` significa que a execucao foi agendada, nao que a extracao terminou.

## Preparacao antes de publicar

1. Fazer backup e executar `drizzle/0011_email_processing_queue.sql` no Neon.
2. Executar `drizzle/0012_navigation_indexes.sql` numa janela de baixa atividade. CREATE INDEX pode aguardar escritas; rever a estrategia numa base grande.
3. Gerar uma chave exclusiva de 32 bytes (64 caracteres hexadecimais) com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` no terminal privado.
4. Configurar `EMAIL_WORKER_SECRET` na Vercel e no ambiente local. Nunca usar `NEXT_PUBLIC_`, nao reutilizar `APP_ENC_KEY`, nao colocar a chave no Git, URL, screenshots ou nesta documentacao.
5. Confirmar que Fluid Compute esta ativo e que a plataforma suporta `maxDuration = 120`. `after` partilha o tempo total da funcao; nao e um processo permanente.
6. Preparar o agendador para a origem HTTPS de producao, publicar o codigo e ativar/testar o agendamento. So considerar a recuperacao ativa depois do teste descrito abaixo.

Sem uma chave valida, a rececao devolve 503 antes de gravar, permitindo as tentativas limitadas do Postmark. As paginas que leem a fila exigem o SQL antes do codigo novo. Os SQL nao autorizam enderecos nem alteram documentos aprovados/emitidos.

## Vercel Hobby

O cron nativo do plano Hobby so permite execucao diaria; nao configurar um cron por minuto em `vercel.json`, pois impede o deploy. Para esta fase pode usar um agendador HTTPS externo, por exemplo cron-job.org, que documenta plano gratuito, headers personalizados e POST. O operador deve avaliar o fornecedor: ele tera acesso apenas a chave de acionamento, mas pode iniciar consumo de processamento sujeito as quotas.

Configuracao de exemplo:

- URL: `https://<dominio-de-producao>/api/internal/email-worker`.
- Metodo: POST, sem corpo.
- Header: `Authorization`, valor `Bearer <chave-privada-configurada-na-Vercel>`.
- Intervalo inicial: 5 minutos; ajustar apos observar volume e limites, sem ultrapassar a capacidade da plataforma.
- Ativar notificacao de falhas do agendador, proteger a conta e nao seguir redirecionamentos para outras origens.

Nao enviar credenciais Clerk, Neon, Postmark, Anthropic ou Moloni para o agendador. O endpoint responde rapidamente; a IA corre depois. Um agendador indisponivel ou desativado deixa as tarefas guardadas mas nao as recupera automaticamente. Um HTTP 200 nao substitui monitorizar estados na inbox. As quotas e custos da Vercel/Neon/IA continuam a aplicar-se; nao ha promessa de execucao pontual ou de operacao sem custos em qualquer volume.

## Estados e limites

- `queued`: aguarda processamento; `running`: tem reserva de 5 minutos.
- `retry`: nova tentativa disponivel apos 1 minuto ou 5 minutos, respeitando o agendamento.
- `failed`: precisa de atencao, sem repeticao automatica; `completed`/`cancelled`: tarefa terminada.
- Maximo de 3 tentativas por ciclo, incluindo interrupcoes. Adiamentos por quota nao consomem tentativa de IA.
- Quota de IA partilhada entre rececao e reprocessamento: 10 processamentos por empresa em 10 minutos. Endpoint de recuperacao: 30 chamadas por minuto no total.
- Um worker com reserva expirada ou substituida nao publica resultados. A escrita do draft, o estado do email e a conclusao da tarefa sao atomicos.
- Reprocessamento manual agenda um novo ciclo apenas para emails sem documentos protegidos; nunca repete emissao ERP ou envio de email.
- Alteracoes, aprovacao, emissao, ignorar e eliminacao ficam bloqueadas enquanto o email esta em fila/processamento. O ultimo draft valido e preservado em caso de falha.
- A autorizacao do endereco e revista antes do processamento. Revogacoes posteriores podem ocorrer quando uma operacao ja esta em curso.

A migracao recupera apenas emails antigos `received`/`processing` sem documentos protegidos; nao reabre automaticamente todas as extracoes falhadas. Reservas antigas ainda ativas sao respeitadas.

O historico mostra os ultimos 20 eventos de processamento. Guarda estado, tentativa, data e codigo controlado, nao respostas brutas de providers, corpos ou chaves. Nao e um registo fiscal imutavel nem auditoria completa das alteracoes. Eliminar um email permitido remove tambem a tarefa e os eventos por cascade; backups e retencao continuam a exigir uma politica propria.

## Teste apos publicacao

1. Enviar um pedido ficticio ao endereco autorizado e confirmar que aparece em fila e depois para revisao, sem emitir nem enviar documentos reais.
2. Confirmar que uma chamada sem o header correto ao worker devolve 401.
3. Usar a funcao de teste do agendador e verificar HTTP 200. Confirmar no detalhe o inicio/conclusao da tarefa; testar tambem uma tarefa pendente sem visitas ao site.
4. Numa base de staging, simular interrupcao e verificar recuperacao apos 5 minutos, sem duplicar drafts nem alterar documentos protegidos.
5. Confirmar timeouts, quotas, isolamento entre empresas e alertas do agendador. PGlite nao substitui testes de contencao com varias ligacoes PostgreSQL.

## Referencias

- [Vercel: limites dos cron jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- [Vercel: duracao e Fluid Compute](https://vercel.com/docs/functions/configuring-functions/duration).
- [Next.js: after](https://nextjs.org/docs/app/api-reference/functions/after).
- [cron-job.org: intervalos, metodos e headers](https://cron-job.org/en/faq/).
