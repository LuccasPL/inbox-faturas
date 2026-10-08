BEGIN;

CREATE TABLE IF NOT EXISTS email_processing_jobs (
  email_id uuid PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'retry', 'failed', 'completed', 'cancelled')),
  mode text NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'reprocess', 'force')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  token uuid,
  last_error_code text,
  requested_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'running' AND token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'running' AND token IS NULL AND lease_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS email_processing_jobs_due_idx ON email_processing_jobs(status, available_at);

CREATE TABLE IF NOT EXISTS email_processing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  kind text NOT NULL CHECK (kind IN ('queued', 'started', 'retry', 'failed', 'completed', 'cancelled')),
  attempt integer NOT NULL CHECK (attempt BETWEEN 0 AND 3),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_processing_events_history_idx ON email_processing_events(tenant_id, email_id, created_at);

-- Recupera apenas emails interrompidos, sem reabrir documentos protegidos.
-- A reserva anterior continua a ser respeitada pelo worker.
INSERT INTO email_processing_jobs(email_id, tenant_id, available_at)
SELECT e.id, e.tenant_id, now()
FROM emails e
WHERE e.tenant_id IS NOT NULL AND e.status IN ('received', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM faturas_draft d WHERE d.email_id = e.id
      AND (d.tenant_id IS DISTINCT FROM e.tenant_id OR d.moloni_document_id IS NOT NULL
        OR d.proforma_numero IS NOT NULL OR d.status IN
          ('aprovado', 'emitida', 'rascunho_moloni', 'emissao_em_curso', 'emitida_proforma'))
  )
ON CONFLICT (email_id) DO NOTHING;

COMMIT;
