-- Vários cargos por usuário (ex.: Compras + Faturamento).
-- Execute no SQL Editor do Supabase.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS extra_roles text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN profiles.extra_roles IS
  'Cargos adicionais além de profiles.role. Ex.: {faturamento} com role=compras.';
