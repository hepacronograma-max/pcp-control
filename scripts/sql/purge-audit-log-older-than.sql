-- Remove registros de auditoria com mais de N dias (padrão 90).
-- Executar manualmente no SQL Editor após backup.
-- Ajuste o intervalo se precisar de retenção maior.

DELETE FROM audit_log
WHERE created_at < now() - interval '90 days';

-- Ver volume restante:
-- SELECT count(*), min(created_at), max(created_at) FROM audit_log;
