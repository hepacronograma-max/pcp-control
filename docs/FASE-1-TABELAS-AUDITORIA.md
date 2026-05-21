# Fase 1 — Tabelas com auditoria (Tarefa 2)

## Nomes corretos no schema PCP Control

| Nome no prompt | Tabela real no Supabase |
|----------------|-------------------------|
| `production_orders` | **`orders`** (pedidos de venda) |
| `order_items` | **`order_items`** |
| `production_lines` | **`production_lines`** |
| `profiles (users)` | **`profiles`** |
| `companies` | **`companies`** |

## Lista final aprovada para triggers

### Obrigatórias (já em `20260520_audit_log.sql`)

| Tabela | Motivo |
|--------|--------|
| `orders` | Pedidos de venda — núcleo do PCP |
| `order_items` | Itens, prazos, linha, status |
| `purchase_orders` | Pedidos de compras |
| `profiles` | Mudança de `role` / `company_id` (UPDATE filtrado no trigger) |
| `production_lines` | Linhas de produção |
| `companies` | UPDATE/DELETE da empresa |
| `cq_registros` | Ocorrências de qualidade |

### Opcionais (migration separada `20260521_audit_optional_tables.sql`)

| Tabela | Motivo | Recomendação |
|--------|--------|--------------|
| `user_preferences` | Baixo risco; muitas escritas pequenas | **Não** auditar por agora |
| `holidays` | Poucas alterações por ano | **Opcional** — incluir se quiser trilha de feriados |

### Não auditar (volume / ruído)

- `tasks`, `subtasks`, `task_comments`, `task_history`
- `cq_categorias` (config estática)
- `departments`, `operator_lines`
- Tabelas de staging / backup

## Schema `audit_log` em uso

Use **`supabase/migrations/20260520_audit_log.sql`** (não criar tabela paralela com outro layout).

Campos: `action`, `user_id`, `user_email`, `company_id`, `created_at`, `old_data`, `new_data`.
