/*
  Consolidar Almoxarifado duplicado, repontar order_items / operator_lines e padronizar sort_order.

  Ambiente: Supabase SQL Editor. Teste em projeto de staging primeiro.
  Documentação rápida: scripts/sql/production-lines-consolidate-almox-sort.sql

  Após COMMIT:
    SELECT id, company_id, name, is_almoxarifado, sort_order
    FROM production_lines
    ORDER BY company_id, sort_order NULLS LAST, name;

  Diagnóstico prévio (opcional):
    SELECT line_id, COUNT(*) AS qty
    FROM order_items
    WHERE line_id IN (SELECT id FROM production_lines WHERE trim(name) = 'Almoxarifado')
    GROUP BY line_id;

  Limite uma empresa no script: edição nos WHERE marcados OPTIONAL em comentários.
*/

BEGIN;

-- =============================================================================
-- 1) Canonical "Almoxarifado" por empresa + duplicados a remover
-- =============================================================================
CREATE TEMP TABLE _almox_canonical ON COMMIT DROP AS
SELECT DISTINCT ON (pl.company_id)
  pl.id AS canonical_id,
  pl.company_id
FROM production_lines pl
WHERE trim(pl.name) = 'Almoxarifado'
  /* OPTIONAL empresa: AND pl.company_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'::uuid */
ORDER BY
  pl.company_id,
  COALESCE(pl.is_almoxarifado::int, 0) DESC,
  CASE WHEN COALESCE(pl.sort_order, 0) = 6 THEN 1 ELSE 0 END DESC,
  COALESCE(pl.sort_order, 0) DESC,
  pl.id ASC;

CREATE TEMP TABLE _almox_dup ON COMMIT DROP AS
SELECT pl.id AS dup_id, c.canonical_id
FROM production_lines pl
INNER JOIN _almox_canonical c ON c.company_id = pl.company_id
WHERE trim(pl.name) = 'Almoxarifado'
  AND pl.id <> c.canonical_id;

-- Diagnóstico (rode SELECT antes em session sem BEGIN se quiser):
-- SELECT * FROM _almox_canonical;
-- SELECT * FROM _almox_dup;

-- -----------------------------------------------------------------------------
-- Ordem obrigatória: order_items → operator_lines cleanup → DELETE lines
-- -----------------------------------------------------------------------------

UPDATE order_items oi
SET line_id = d.canonical_id
FROM _almox_dup d
WHERE oi.line_id = d.dup_id;

DELETE FROM operator_lines ol
USING _almox_dup d
WHERE ol.line_id = d.dup_id
  AND EXISTS (
    SELECT 1
    FROM operator_lines k
    WHERE k.user_id = ol.user_id
      AND k.line_id = d.canonical_id
  );

UPDATE operator_lines ol
SET line_id = d.canonical_id
FROM _almox_dup d
WHERE ol.line_id = d.dup_id;

DELETE FROM production_lines pl
USING _almox_dup d
WHERE pl.id = d.dup_id;

UPDATE production_lines p
SET is_almoxarifado = true
WHERE p.id IN (SELECT canonical_id FROM _almox_canonical);

-- ============================================================================
-- 2) sort_order esperado pela UI do menu lateral (nome exato ou ajustar)
-- ============================================================================
UPDATE production_lines SET sort_order = 1 WHERE name = 'CARTONADO GP/PL';
UPDATE production_lines SET sort_order = 2 WHERE name = 'ABSOLUTO / FINO';
UPDATE production_lines SET sort_order = 3 WHERE name = 'MULTIBOLSA';
UPDATE production_lines SET sort_order = 4 WHERE name = 'EQUIPAMENTOS';
UPDATE production_lines SET sort_order = 5 WHERE name = 'LOGISTICA';
UPDATE production_lines
SET sort_order = 6,
    is_almoxarifado = true
WHERE trim(name) = 'Almoxarifado';


COMMIT;

-- ---------- Verificação (execute manualmente após COMMIT): ----------
-- SELECT id, company_id, name, is_almoxarifado, sort_order FROM production_lines
-- ORDER BY company_id, sort_order NULLS LAST, name;
