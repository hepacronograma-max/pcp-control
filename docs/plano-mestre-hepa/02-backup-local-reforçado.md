# Fase 2 — Backup local reforçado (Supabase Free)

**Objetivo:** Rede de segurança de dados **sem** Supabase Pro/PITR.

## Status já concluído

- [x] `scripts/weekly-backup-supabase.js`
- [x] `scripts/run-weekly-backup.ps1`
- [x] Tarefa Windows `PCP Control - Backup Semanal` (domingos 03:00)
- [x] Destino: `OneDrive\Backups\PCP-Control\`
- [x] Doc: `pcp-control/docs/BACKUP-SEMANAL-WINDOWS.md`

## Parte A — Manual (você, ~20 min)

1. Confirmar no Agendador de Tarefas que a tarefa está **Pronta** e com histórico após domingo.
2. (Opcional) Supabase → Settings → Database → copiar **Connection string** para `.env.local` como `DATABASE_URL` — habilita `pg_dump` no backup.
3. **Teste de restore (obrigatório 1×):**
   - Copiar pasta `2026-05-20_*` para ambiente de teste ou usar `scripts/restore-production-lines-from-backup.js` conforme doc.
   - Anotar tempo e se todos os JSON batem com contagens esperadas.

## Parte B — Prompt para o Cursor

```
Contexto: pcp-control. Fase 2 plano-mestre-hepa. NÃO apagar backups existentes no OneDrive.

Melhorar backup sem perder dados:

1) scripts/weekly-backup-supabase.js
- Se DATABASE_URL existir: rodar pg_dump para backup.sql.gz na pasta datada
- Escrever manifest.json com contagens por tabela + versão do script + git commit (se disponível)
- Parâmetro PCP_BACKUP_KEEP_WEEKS=8: apagar só pastas mais antigas que N semanas (nunca apagar latest.txt)

2) scripts/verify-backup.ps1 (novo)
- Recebe caminho de uma pasta de backup
- Valida manifest + existência de orders.json, order_items.json
- Exit 0/1 para automação

3) docs/BACKUP-SEMANAL-WINDOWS.md
- Seção "Teste de restauração" passo a passo
- Seção "Antes de migration SQL em produção"

4) package.json: "backup:verify": "powershell ... verify-backup.ps1"

Não remover backup-pcp.json da máquina do usuário (gitignored).
```

---

## Critério de pronto ✅

| Item | Verificação |
|------|-------------|
| Backup manual | `npm run backup:weekly` → pasta nova em OneDrive |
| manifest | Arquivo com contagens presente |
| verify | `npm run backup:verify` na última pasta → OK |
| Restore | Teste documentado (você confirma) |

## Próxima fase

[03-integracao-omie-pcp.md](./03-integracao-omie-pcp.md)
