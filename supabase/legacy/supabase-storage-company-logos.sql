-- Bucket público para logos da empresa (erro "Bucket not found" no upload).
-- Execute no SQL Editor do Supabase.

INSERT INTO storage.buckets (id, name, public)
SELECT 'company-logos', 'company-logos', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'company-logos');

-- Leitura pública (URL do logo no navegador)
DROP POLICY IF EXISTS "company_logos_public_read" ON storage.objects;
CREATE POLICY "company_logos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');
