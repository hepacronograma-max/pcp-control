# Índice da documentação — PCP Control

Comece pelo [README do projeto](../README.md).

## Operação (use estes primeiro)

| Documento | Conteúdo |
|-----------|----------|
| [DEPLOY.md](./DEPLOY.md) | Roteiro de deploy em produção sem perder dados |
| [SEGURANCA-PRODUCAO.md](./SEGURANCA-PRODUCAO.md) | Vercel, `CLEANUP_SECRET`, chaves Supabase |
| [AUDITORIA.md](./AUDITORIA.md) | Trilha `audit_log` |
| [BACKUP-RESTORE.md](./BACKUP-RESTORE.md) | Arquitetura de backup 3-2-1, restore, Telegram, GitHub Release |
| [BACKUP-SEMANAL-WINDOWS.md](./BACKUP-SEMANAL-WINDOWS.md) | Backup automático → OneDrive |
| [COMO-RODAR-MIGRATIONS.md](./COMO-RODAR-MIGRATIONS.md) | Como aplicar SQL de `supabase/migrations/` |
| [OMIE-IMPORT.md](./OMIE-IMPORT.md) | Integração Omie |
| [ALMOXARIFADO.md](./ALMOXARIFADO.md) | Módulo almoxarifado |
| [SEGURANCA-ADMIN-API-AUDIT.md](./SEGURANCA-ADMIN-API-AUDIT.md) | Auditoria das rotas administrativas |

## Planejamento

| Documento | Conteúdo |
|-----------|----------|
| [plano-mestre-hepa/README.md](./plano-mestre-hepa/README.md) | Plano mestre HEPA OS (7 fases) |

## Banco de dados

| Pasta | Conteúdo |
|-------|----------|
| [`../supabase/migrations/`](../supabase/migrations/) | Migrations versionadas (fonte da verdade daqui pra frente) |
| [`../supabase/legacy/`](../supabase/legacy/) | SQL histórico — **não reexecutar** |
| [`perf/`](./perf/) | Índices de performance (histórico) |

## Arquivo (histórico, só referência)

Relatórios e guias antigos ficam em [`arquivo/`](./arquivo/): auditorias de
persistência, migração do localStorage para o Supabase, versões antigas dos
guias de deploy e backup local.

## Scripts

Pasta `../scripts/` — backup, restore, cleanup, utilitários Omie e testes de
segurança. Os comandos principais estão em `package.json` (`npm run backup:daily`,
`npm run restore:dry`, etc.).
