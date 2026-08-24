-- Campos do motor de vazão/pressão no item (sincroniza etiqueta ↔ certificado).
-- NÃO aplicar automaticamente — rode no SQL Editor do Supabase.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS motor_espessura_papel_mm integer NULL,
  ADD COLUMN IF NOT EXISTS motor_material text NULL,
  ADD COLUMN IF NOT EXISTS motor_tem_coroa boolean NULL,
  ADD COLUMN IF NOT EXISTS motor_num_elementos integer NULL,
  ADD COLUMN IF NOT EXISTS motor_vazao integer NULL,
  ADD COLUMN IF NOT EXISTS motor_dpi integer NULL,
  ADD COLUMN IF NOT EXISTS motor_dpf integer NULL;

COMMENT ON COLUMN order_items.motor_espessura_papel_mm IS 'Espessura do papel (mm) escolhida no motor de vazão';
COMMENT ON COLUMN order_items.motor_material IS 'Material fino: celulosico | fibra_vidro';
COMMENT ON COLUMN order_items.motor_tem_coroa IS 'Fino com coroa (FPP) ou sem (IRP)';
COMMENT ON COLUMN order_items.motor_num_elementos IS 'Nº cunhas/bolsas quando não vem no código';
COMMENT ON COLUMN order_items.motor_vazao IS 'Cache vazão m³/h calculada pelo motor';
COMMENT ON COLUMN order_items.motor_dpi IS 'Cache ΔPi (Pa)';
COMMENT ON COLUMN order_items.motor_dpf IS 'Cache ΔPf (Pa)';
