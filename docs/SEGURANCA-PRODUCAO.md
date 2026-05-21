# Segurança em produção — PCP Control

## Ações obrigatórias na Vercel (você, após deploy)

1. **Rotacionar chaves no Supabase** (Settings → API): `service_role` e `anon`.
2. Atualizar na Vercel (Production):
   - `SUPABASE_SERVICE_ROLE_KEY` (nova)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nova)
3. Criar **`CLEANUP_SECRET`** (string longa aleatória, 32+ caracteres).
4. **Não** definir: `NEXT_PUBLIC_PCP_ALLOW_LOCAL_AUTH`, `PCP_ALLOW_LOCAL_AUTH`.
5. **Redeploy** Production.
6. Testar login e lista de pedidos.

### Teste do cleanup após configurar secret

```powershell
# Deve retornar 401 ou 503
curl.exe -i -X POST "https://pcp-control.vercel.app/api/cleanup?dry_run=1" -H "Content-Type: application/json" -d "{}"

# Deve retornar 200
curl.exe -i -X POST "https://pcp-control.vercel.app/api/cleanup?dry_run=1" `
  -H "Content-Type: application/json" `
  -H "x-cleanup-key: SEU_CLEANUP_SECRET" `
  -d "{}"
```

## Desenvolvimento local (.env.local)

```env
PCP_LOCAL_DEV_EMAIL=admin@local
PCP_LOCAL_DEV_PASSWORD=sua-senha-forte-local
CLEANUP_SECRET=outro-secret-so-para-dev
```

Nunca use `123456` em produção. Credenciais fixas foram removidas do código.

## O que o código faz agora

| Item | Comportamento |
|------|----------------|
| `/api/cleanup` | Exige `CLEANUP_SECRET` no servidor; header `x-cleanup-key` obrigatório |
| Login local | Só `localhost`; credenciais só via `PCP_LOCAL_DEV_*` no servidor |
| Cookie `pcp-local-auth` | `httpOnly`; ignorado em produção (`VERCEL_ENV=production`) |
| `pcp-local-auth` em APIs | Só válido se `allowLocalAuth()` (não em Vercel prod) |
| `/api/effective-company` | Exige sessão Supabase ou dev local |
| `public/backup-inicial.json` | Removido do repositório |

## Branch protection (GitHub)

Recomendado em `master`:

- Require pull request before merging
- Require status check: Vercel build
- Do not allow bypassing

## Scripts destrutivos

Scripts em `scripts/` usam `SUPABASE_SERVICE_ROLE_KEY`. Rodar só na sua máquina, nunca em CI público.

## Testes automatizados (local)

```powershell
cd pcp-control
npm run security:smoke          # valida produção (padrão: pcp-control.vercel.app)
npm run security:secrets        # gera CLEANUP_SECRET em secrets/ (gitignored)
npm run backup:weekly           # backup Supabase → OneDrive
```

## Última verificação (Fase 1 — automática)

| Data | Comando | Resultado |
|------|---------|-----------|
| 2026-05-20 | `npm run security:smoke` | **10/10** em produção |
| | cleanup sem header | **401** (secret configurado) |
| | local-login | **403** |
| | debug-operator | **404** |
| | Rotas admin | Ver `docs/SEGURANCA-ADMIN-API-AUDIT.md` |

## Auditoria nativa (Fase 1)

- Migration: `supabase/migrations/20260520_audit_log.sql` — **aplicar manualmente** no Supabase SQL Editor (após backup).
- Doc: `docs/AUDITORIA.md`
- UI: `/configuracoes/auditoria` (manager / super_admin)

### Pendente manual (você)

- [ ] Rotacionar chaves Supabase + Vercel (se ainda não fez)
- [ ] Branch protection no GitHub
- [ ] Executar migration `20260520_audit_log.sql` em produção
