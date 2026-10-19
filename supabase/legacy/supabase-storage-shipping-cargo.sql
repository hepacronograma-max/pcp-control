-- Bucket público para foto da carga (expedição).
-- Opcional: a API tenta criar o bucket sozinha. Use este script se o upload falhar.

INSERT INTO storage.buckets (id, name, public)
SELECT 'shipping-cargo', 'shipping-cargo', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'shipping-cargo');

DROP POLICY IF EXISTS "shipping_cargo_public_read" ON storage.objects;
CREATE POLICY "shipping_cargo_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'shipping-cargo');
