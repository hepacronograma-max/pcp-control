# Auditoria nativa — PCP Control

## O que é o `audit_log`

Registro automático de **INSERT**, **UPDATE** e **DELETE** em tabelas críticas. Cada linha guarda:

| Campo | Significado |
|-------|-------------|
| `table_name` | Tabela alterada |
| `record_id` | ID do registro |
| `action` | `INSERT` \| `UPDATE` \| `DELETE` |
| `old_data` / `new_data` | JSON antes/depois |
| `user_id` / `user_email` | Quem alterou (sessão Supabase) |
| `company_id` | Empresa (multi-tenant) |
| `created_at` | Quando |

Migration: `supabase/migrations/20260520_audit_log.sql`  
Como aplicar: `docs/COMO-RODAR-MIGRATIONS.md`  
Tabelas: `docs/FASE-1-TABELAS-AUDITORIA.md`

## Como ler o histórico de uma tabela

### No app

**Configurações → Auditoria** ou `/admin/audit`

- Filtros: tabela, operação, e-mail, datas
- Paginação (50 por página)
- Diff visual em UPDATE
- Exportar CSV da página atual

### No SQL Editor

```sql
SELECT created_at, action, user_email, record_id, old_data, new_data
FROM audit_log
WHERE table_name = 'orders'
  AND company_id = 'SEU_COMPANY_UUID'
ORDER BY created_at DESC
LIMIT 50;
```

## Como reverter uma mudança (usando `old_data`)

A auditoria **não desfaz** sozinha. Use `old_data` como referência:

1. Localize o evento UPDATE/DELETE em `audit_log`.
2. Copie o JSON de `old_data`.
3. Monte um `UPDATE` manual na tabela original (teste em staging primeiro).
4. Exemplo conceitual:

```sql
-- Exemplo: restaurar campo notes de um pedido (ajuste colunas reais)
UPDATE orders
SET notes = (old_row->>'notes')
FROM (
  SELECT old_data AS old_row
  FROM audit_log
  WHERE id = 'UUID_DO_EVENTO_AUDIT'
) x
WHERE orders.id = 'UUID_DO_PEDIDO';
```

Para DELETE, só é possível **re-INSERT** se você ainda tiver o `old_data` completo.

Sempre: **backup antes** (`npm run backup:weekly`).

## Exportar para análise externa

- Botão **Exportar CSV** em `/admin/audit`
- Ou SQL:

```sql
COPY (
  SELECT * FROM audit_log
  WHERE created_at >= now() - interval '7 days'
) TO STDOUT WITH CSV HEADER;
```

(No Supabase use resultado da query → Download CSV.)

## Quem vê o log

- **RLS:** `manager` e `super_admin` da mesma `company_id`
- Não existe role `admin` no PCP — use `super_admin` / `manager`

## Retenção

Apagar registros com mais de 90 dias (após backup):

`scripts/sql/purge-audit-log-older-than.sql`

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Página vazia / erro tabela | Rodar `20260520_audit_log.sql` |
| Sem `user_email` | Alteração via service role (scripts) |
| Muitos logs | Reduzir tabelas com trigger; ver FASE-1-TABELAS |
