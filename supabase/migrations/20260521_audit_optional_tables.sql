-- OPCIONAL — só rode se quiser auditar feriados (ver docs/FASE-1-TABELAS-AUDITORIA.md)
-- Requer 20260520_audit_log.sql já aplicada.

DROP TRIGGER IF EXISTS trg_audit_holidays ON holidays;
CREATE TRIGGER trg_audit_holidays
  AFTER INSERT OR UPDATE OR DELETE ON holidays
  FOR EACH ROW EXECUTE FUNCTION pcp_audit_log_row();
