# Auditoria nativa — PCP Control

## O que registra

Alterações (INSERT / UPDATE / DELETE) nas tabelas:

| Tabela | Observação |
|--------|------------|
| `orders` | Pedidos de venda |
| `order_items` | Itens; `company_id` resolvido via pedido |
| `purchase_orders` | Pedidos de compras |
| `profiles` | Só quando `role` ou `company_id` mudam |
| `production_lines` | Linhas de produção |
| `companies` | UPDATE e DELETE |
| `cq_registros` | Ocorrências CQ |

**Não auditado (por design):** `tasks`, `subtasks`, `holidays`, `user_preferences` — volume ou baixo risco; podem entrar na Fase 2 se necessário.

## Aplicar em produção (uma vez)

1. **Backup** antes: `npm run backup:weekly`
2. Supabase → **SQL Editor** → colar o arquivo:
   `supabase/migrations/20260520_audit_log.sql`
3. Run → confirmar sem erro
4. Teste: atualizar um pedido no app → `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 5;`

## Quem vê o log

- **RLS:** apenas `manager` e `super_admin` da **mesma** `company_id`
- **UI:** Configurações → [Auditoria](/configuracoes/auditoria)
- **API:** `GET /api/audit-log?limit=100`

Operadores e PCP **não** veem a trilha (por política).

## Campos

| Campo | Descrição |
|-------|-----------|
| `user_id` | `auth.uid()` na sessão do PostgREST |
| `user_email` | E-mail do JWT |
| `old_data` / `new_data` | Snapshot JSON da linha |

Alterações via **service role** (scripts/admin) podem ter `user_id` nulo — normal para jobs automatizados.

## Retenção

Sugestão: apagar logs com mais de **90 dias** (mensal):

```sql
-- scripts/sql/purge-audit-log-older-than.sql
DELETE FROM audit_log WHERE created_at < now() - interval '90 days';
```

Sempre rodar após backup semanal.

## Volume

Se `audit_log` crescer rápido (> 100k linhas/mês), revisar com Claude:

- Reduzir tabelas com trigger
- Gravar só diff em UPDATE (evolução futura)
- Particionar por mês

## Troubleshooting

| Problema | Causa provável |
|----------|----------------|
| Nenhum log ao editar pedido | Migration não aplicada ou edição via service role sem sessão |
| Erro ao aplicar SQL | Tabela ausente (`purchase_orders` etc.) — rodar migrations Compras/CQ antes |
| Gestor não vê logs | `profiles.company_id` diferente do `audit_log.company_id` |
