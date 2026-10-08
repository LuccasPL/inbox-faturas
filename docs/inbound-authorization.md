# Autorizacao administrativa da rececao

Aplicar `drizzle/0010_inbound_authorization.sql` no Neon antes de publicar esta etapa. O SQL nao autoriza contas existentes nem altera os enderecos atuais.

Antes de autorizar, confirmar fora da aplicacao a identidade da empresa, a conta Clerk correta e o controlo do endereco/Postmark. Receber um email num endereco nao e prova de propriedade. Nao autorizar todos os tenants em massa.

Consultar apenas os dados necessarios para identificar a conta:

```sql
SELECT id, clerk_user_id, nome, email_inbound,
       email_inbound_authorized_address, email_inbound_authorized_at
FROM tenants
ORDER BY created_at;
```

Substituir os tres valores abaixo pelo UUID da empresa, o ID Clerk confirmado e o endereco autorizado. O operador, e nao o utilizador da aplicacao, atribui o endereco. A unicidade existente impede atribuir o mesmo endereco a duas empresas.

```sql
UPDATE tenants
SET email_inbound = lower('endereco-verificado@empresa.pt'),
    email_inbound_authorized_address = lower('endereco-verificado@empresa.pt'),
    email_inbound_authorized_at = now()
WHERE id = 'UUID-DA-EMPRESA'
  AND clerk_user_id = 'ID-CLERK-CONFIRMADO'
RETURNING id, nome, email_inbound, email_inbound_authorized_at;
```

Confirmar que foi devolvida exatamente uma empresa. Para a conta atual, autorizar antes de publicar preserva a rececao. Fazer um email de teste pelo Postmark depois: autorizacao administrativa nao comprova entrega, credenciais do webhook, IA nem validacao do remetente outbound no Postmark.

Para revogar, manter o endereco reservado e remover apenas a autorizacao:

```sql
UPDATE tenants
SET email_inbound_authorized_address = NULL,
    email_inbound_authorized_at = NULL
WHERE id = 'UUID-DA-EMPRESA'
  AND clerk_user_id = 'ID-CLERK-CONFIRMADO';
```

Sem uma autorizacao correspondente ao endereco atual, o webhook devolve 503 antes de guardar/processar o email e o envio de proformas fica bloqueado. A repeticao de entrega depende do Postmark e tem um prazo limitado; isto nao substitui uma fila duravel. Alterar apenas `email_inbound` invalida a autorizacao anterior. Downloads autenticados e documentos existentes nao sao eliminados por uma revogacao.

Nao colocar API keys, passwords ou dados de clientes nestes comandos nem em issues publicas. O acesso administrativo ao Neon deve ser restrito.
