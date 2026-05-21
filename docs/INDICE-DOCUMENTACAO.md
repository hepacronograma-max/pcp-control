# Índice da documentação — PCP Control

## Plano mestre (7 fases — Cursor)

| Documento | Conteúdo |
|-----------|----------|
| [./plano-mestre-hepa/README.md](./plano-mestre-hepa/README.md) | Índice do plano HEPA OS + 7 prompts para colar no Cursor |

## Operacional (use estes primeiro)

| Documento | Conteúdo |
|-----------|----------|
| [SEGURANCA-PRODUCAO.md](./SEGURANCA-PRODUCAO.md) | Vercel, `CLEANUP_SECRET`, chaves Supabase |
| [AUDITORIA.md](./AUDITORIA.md) | Trilha audit_log + migration SQL |
| [BACKUP-SEMANAL-WINDOWS.md](./BACKUP-SEMANAL-WINDOWS.md) | Backup automático → OneDrive |
| [PARECER-PERFORMANCE-E-ARQUIVOS.md](./PARECER-PERFORMANCE-E-ARQUIVOS.md) | Velocidade e arquivos do projeto |
| [ALMOXARIFADO.md](./ALMOXARIFADO.md) | Módulo almoxarifado |
| [RELATORIO-TRABALHO-REALIZADO.md](./RELATORIO-TRABALHO-REALIZADO.md) | Histórico recente de mudanças |

## Raiz do repositório (deploy / migração)

| Documento | Nota |
|-----------|------|
| `DEPLOY-PRODUCAO.md` | Deploy principal |
| `DEPLOY.md` / `DEPLOY-UNICO.md` | Variantes / histórico |
| `OTIMIZACAO-SUPABASE.md` | Performance no banco |
| `VERIFICACAO-BANCO.md` | Checagens de schema |
| `BACKUP-DADOS-LOCAIS.md` | Backup localStorage (legado) |
| `RELATORIO-*.md` | Auditorias antigas — referência |

## Scripts

Pasta `scripts/` — backup, cleanup, restore, testes de segurança. Ver comentários em cada arquivo.
