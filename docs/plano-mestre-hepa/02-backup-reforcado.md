# Fase 2 — Backup reforçado (Supabase Free)

**Objetivo:** Rede de segurança de dados **sem** Supabase Pro/PITR — backup semanal + opção diária + alerta Telegram.

## Status já concluído

- [x] `scripts/weekly-backup-supabase.js`
- [x] `scripts/run-weekly-backup.ps1`
- [x] Tarefa Windows `PCP Control - Backup Semanal` (domingos 03:00)
- [x] Destino: `OneDrive\Backups\PCP-Control\`
- [x] Doc: `pcp-control/docs/BACKUP-SEMANAL-WINDOWS.md`

## Parte A — Manual (você, ~20 min)

1. Confirmar no Agendador de Tarefas que a tarefa **PCP Control - Backup Semanal** está **Pronta**.
2. (Opcional) Criar bot Telegram (@BotFather) → guardar `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` no `.env.local` (não commitar).
3. (Opcional) Supabase → Database → **Connection string** em `.env.local` como `DATABASE_URL` (habilita `pg_dump`).
4. **Teste de restore (obrigatório 1×):**
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

5) Backup diário (opcional, leve)
- scripts/run-daily-backup.ps1: copia só manifest + orders + order_items para subpasta daily/ (rápido)
- Tarefa Windows separada 02:00 dias úteis OU rodar manualmente

6) Telegram
- Ao fim de weekly-backup-supabase.js: se TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID, POST mensagem curta (OK + pasta + contagens orders/items)
- Em falha: mensagem com erro

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
| Telegram | Mensagem recebida após backup semanal (se configurado) |

## Próxima fase

[03-integracao-omie.md](./03-integracao-omie.md)
