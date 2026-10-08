-- Aplicar antes da publicacao. CREATE INDEX pode aguardar escritas concorrentes;
-- executar numa janela de baixa atividade e rever em bases de grande volume.
CREATE INDEX IF NOT EXISTS emails_tenant_created_idx ON emails(tenant_id, created_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS emails_tenant_sender_idx ON emails(tenant_id, lower(from_email));
CREATE INDEX IF NOT EXISTS drafts_tenant_email_latest_idx ON faturas_draft(tenant_id, email_id, created_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS drafts_tenant_status_idx ON faturas_draft(tenant_id, status);
