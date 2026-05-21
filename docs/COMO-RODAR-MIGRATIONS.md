# Como rodar migrations SQL no Supabase (PCP Control)

## Regra de ouro

1. **Backup antes:** `npm run backup:weekly`
2. Use **Chrome** (conta HEPA), não Edge com outro perfil Supabase
3. Projeto = o de `NEXT_PUBLIC_SUPABASE_URL` no `.env.local`
4. Cole o SQL no **SQL Editor** e revise antes de **Run**

## Passo a passo

### 1. Abrir o editor

- Automático: `npm run fase1:setup` (copia SQL + abre Chrome)
- Manual: https://supabase.com/dashboard → projeto PCP → **SQL Editor** → New query

### 2. Migration de auditoria (Fase 1)

Arquivo: `supabase/migrations/20260520_audit_log.sql`

- Cria tabela `audit_log`, funções e triggers nas tabelas críticas
- Idempotente (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`)

### 3. Executar

1. Cole o conteúdo completo do arquivo
2. **Run**
3. Confirme mensagem de sucesso (sem erro vermelho)

### 4. Validar

```sql
-- Tabela existe
SELECT count(*) AS total FROM audit_log;

-- Triggers (exemplo)
SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_audit_%';
```

No app: edite um pedido → rode de novo:

```sql
SELECT table_name, action, user_email, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 10;
```

### 5. Opcional — feriados

Se aprovado: `supabase/migrations/20260521_audit_optional_tables.sql`

## Alternativa automática (dev)

Com uma destas variáveis no `.env.local`:

- `SUPABASE_ACCESS_TOKEN` (PAT em supabase.com/dashboard/account/tokens)
- `DATABASE_URL` (connection string PostgreSQL)

```powershell
npm run db:apply-audit
```

## Não usar

- `production_orders` — não existe; a tabela é **`orders`**
- Segunda migration que recria `audit_log` com outro layout (conflito)

## Após migration

- Deploy Vercel se mudou só SQL: não obrigatório
- UI: `/admin/audit` (gestores)
- Retenção: `scripts/sql/purge-audit-log-older-than.sql` (após backup, > 90 dias)
