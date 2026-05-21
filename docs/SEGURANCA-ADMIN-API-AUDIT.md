# Rotas com service role (admin) — revisão Fase 1

Todas devem exigir sessão Supabase **ou** cookie local dev (não produção), exceto cleanup.

| Rota | Auth |
|------|------|
| `/api/cleanup` | `CLEANUP_SECRET` + header `x-cleanup-key` |
| `/api/company-data` | Sessão ou local dev |
| `/api/line-data` | Sessão ou local dev |
| `/api/comercial-orders` | Sessão |
| `/api/purchase-orders` | Sessão ou local dev |
| `/api/import-backup` | Sessão ou local dev |
| `/api/import-pdf` | Sessão ou local dev |
| `/api/import-purchase-pdf` | Sessão ou local dev |
| `/api/order-items/*` | Sessão ou local dev |
| `/api/production-lines` | Sessão ou local dev |
| `/api/company-settings` | Sessão ou local dev |
| `/api/company-logo` | Sessão ou local dev |
| `/api/user-preferences` | Sessão ou local dev |
| `/api/effective-company` | Sessão ou local dev |
| `/api/compras-dashboard` | Sessão ou local dev |
| `/api/users` | Sessão ou local dev |
| `/api/audit-log` | Sessão + `viewSettings` (RLS audit_log) |

Middleware redireciona APIs não listadas na allowlist para login se sem sessão.
