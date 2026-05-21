# Fase 1 — Segurança final + auditoria nativa

**Objetivo:** Produção sem rotas perigosas abertas e trilha de auditoria no Postgres antes de Omie e multi-tenant.

## Status já concluído (não refazer)

- [x] `CLEANUP_SECRET` na Vercel + teste 401/200
- [x] Login local bloqueado em produção
- [x] `backup-inicial.json` removido do repo
- [x] `npm run security:smoke`

## Parte A — Manual (você, ~30 min)

### A1. Rotacionar chaves Supabase (se ainda não fez)

1. Supabase → Project → Settings → API → **Reset** `anon` e `service_role`.
2. Vercel → Environment Variables → atualizar `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Redeploy Production.
4. Testar login + lista de pedidos.

### A2. Branch protection (GitHub)

1. Repo `hepacronograma-max/pcp-control` → Settings → Branches.
2. Regra em `master`: require PR, require status check (Vercel), no bypass.

### A3. Revisar com Claude (antes do Cursor criar triggers)

Envie esta lista e peça validação:

**Tabelas candidatas a auditoria (escrita):**

- `orders`, `order_items`
- `purchase_orders`, `purchase_order_lines`
- `profiles` (role, company_id)
- `production_lines`, `companies`, `company_settings`
- `cq_registros`, `tasks`, `subtasks`
- `holidays`, `user_preferences`

**Não auditar (alto volume / ruído):** sessões, logs de leitura, tabelas de staging futuras com retenção curta.

---

## Parte B — Prompt para o Cursor

```
Contexto: projeto pcp-control em c:\Users\Helder\Desktop\hd projetos\Programas\Cronograma\pcp-control.
Fase 1 do plano-mestre-hepa. NÃO apagar dados. Commits em português.

Tarefas:

1) CHECKLIST segurança
- Rodar npm run security:smoke e documentar resultado em docs/SEGURANCA-PRODUCAO.md (seção "Última verificação").
- Confirmar que nenhuma rota usa createSupabaseAdminClient sem checagem de sessão (exceto /api/cleanup com x-cleanup-key).

2) AUDITORIA NATIVA Supabase
- Criar migration SQL: supabase/migrations/YYYYMMDD_audit_log.sql
  - Tabela audit_log: id, company_id, table_name, record_id, action (INSERT|UPDATE|DELETE), old_data jsonb, new_data jsonb, user_id uuid, user_email text, created_at timestamptz default now()
  - Índices: (company_id, created_at), (table_name, record_id)
  - RLS: SELECT só para roles manager/super_admin da mesma company_id
- Triggers AFTER INSERT/UPDATE/DELETE nas tabelas: orders, order_items, purchase_orders, profiles (apenas updates de role/company_id), production_lines, cq_registros
- Trigger deve preencher user_id via auth.uid() quando disponível; senão null + user_email do JWT
- Função security definer com cuidado (search_path fixo)

3) UI mínima (opcional nesta fase)
- Página /configuracoes/auditoria somente super_admin/manager: lista últimos 100 eventos da company

4) Documentar em docs/AUDITORIA.md como consultar e retenção (sugestão: job mensal apagar > 90 dias — só script, não cron obrigatório)

Critério de pronto: migration aplicável sem erro; smoke 10/10; doc AUDITORIA.md criada.
Não rotacionar chaves Supabase (isso é manual do usuário).
```

---

## Critério de pronto ✅

| Item | Verificação |
|------|-------------|
| Smoke test | `npm run security:smoke` → 10/10 |
| Cleanup | Sem header → 401; com key → 200 dry_run |
| audit_log | Tabela existe; INSERT em `orders` gera 1 linha |
| RLS auditoria | Operador não vê log de outra empresa |
| Git | Migration + docs commitados |

## Quando me chamar (Claude)

- **Antes** de aplicar migration em produção: revisar lista de tabelas com triggers.
- **Depois** do deploy: validar que volume de log não explodiu em 24h.

## Próxima fase

[02-backup-local-reforçado.md](./02-backup-local-reforçado.md) — reforçar se algo faltar; senão marcar ✅ e ir para Fase 3.
