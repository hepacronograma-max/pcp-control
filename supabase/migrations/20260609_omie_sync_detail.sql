-- Detalhe legível do alerta Omie (divergência / remoção) exibido na tela /pedidos
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS omie_sync_detail TEXT;
