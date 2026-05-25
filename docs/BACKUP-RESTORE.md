# Backup e restore — PCP Control (Fase 2)

Supabase **Free** (sem PITR). Estratégia **3-2-1**: 3 cópias, 2 mídias, 1 offsite.

| Camada | Onde | Frequência | Script |
|--------|------|------------|--------|
| 1 — Local | `%USERPROFILE%\Backups\PCP-Control\daily\` | Diária 22h | `daily-backup-supabase.js` |
| 2 — OneDrive | `OneDrive\Backups\PCP-Control\` | Semanal (dom 03h) + espelho diário | `weekly-backup-supabase.js` |
| 3 — GitHub Release | Repo privado `pcp-control-backups` | Semanal (manual/agendado) | `upload-backup-to-github.js` |

**Regra:** scripts de backup só **leem** o Supabase. Restore exige confirmação explícita.

---

## Variáveis de ambiente (`.env.local`)

Obrigatórias para backup/restore:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Opcionais:

```env
# Pastas
PCP_BACKUP_DIR=C:\Users\Helder\OneDrive\Backups\PCP-Control
PCP_DAILY_BACKUP_DIR=C:\Users\Helder\Backups\PCP-Control\daily
PCP_BACKUP_ONEDRIVE=0
PCP_BACKUP_KEEP_WEEKS=8
PCP_DAILY_BACKUP_KEEP_DAYS=30

# Telegram
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# GitHub Releases (repo separado, privado)
GITHUB_BACKUP_TOKEN=ghp_...
GITHUB_BACKUP_REPO=hepacronograma-max/pcp-control-backups
BACKUP_ENCRYPTION_PASSWORD=...

# pg_dump opcional (backup semanal)
DATABASE_URL=postgresql://...
```

---

## Comandos npm

| Comando | Função |
|---------|--------|
| `npm run backup:daily` | Backup incremental diário |
| `npm run backup:weekly` | Backup completo semanal |
| `npm run backup:validate` | Valida último backup (`latest.txt`) |
| `npm run backup:upload` | ZIP cifrado → GitHub Release |
| `npm run restore:dry` | Simula restore (não grava) |
| `npm run restore:apply` | Upsert no Supabase (exige confirmação) |

---

## Acessar cada camada

### Camada 1 — Diário (local)

```
C:\Users\Helder\Backups\PCP-Control\daily\YYYY-MM-DD\
  manifest.json
  orders.json
  order_items.json
  ...
```

- `manifest.json`: SHA256, contagens, watermark incremental
- Rotação: últimos **30 dias** (`PCP_DAILY_BACKUP_KEEP_DAYS`)
- Log: `scripts/logs/daily-backup-YYYY-MM-DD.log`

### Camada 2 — Semanal (OneDrive)

```
OneDrive\Backups\PCP-Control\2026-05-21_111119_976\
```

- `latest.txt` aponta para a pasta mais recente
- Tarefa Windows: **PCP Control - Backup Semanal** (domingos 03:00)
- Doc legada: [BACKUP-SEMANAL-WINDOWS.md](./BACKUP-SEMANAL-WINDOWS.md)

### Camada 3 — GitHub Release

- Repo **privado** `pcp-control-backups` (sem código da app)
- Tag: `backup-YYYY-MM-DD`
- ZIP com senha (`BACKUP_ENCRYPTION_PASSWORD`)

---

## Validar um backup

```powershell
cd "C:\Users\Helder\Desktop\hd projetos\Programas\Cronograma\pcp-control"
npm run backup:validate
```

Com pasta específica:

```powershell
npm run backup:validate -- "C:\Users\Helder\OneDrive\Backups\PCP-Control\2026-05-21_111119_976"
```

O relatório mostra ✓/✗ para: JSON parseável, SHA256, contagens, vínculo `order_items` → `orders`.

---

## Restaurar (passo a passo)

1. **Escolha a pasta** do backup semanal (completo) ou reconstrua a partir de diários.
2. **Valide:**
   ```powershell
   npm run backup:validate -- "--backup-path=C:\caminho\pasta"
   ```
3. **Simule (dry-run):**
   ```powershell
   npm run restore:dry -- "--backup-path=C:\caminho\pasta"
   ```
   Compare contagens banco vs backup no console.
4. **Aplique (cuidado):**
   ```powershell
   npm run restore:apply -- "--backup-path=C:\caminho\pasta"
   ```
   Digite exatamente: `CONFIRMO RESTAURAR`

Restore faz **upsert por `id`** — não apaga registros extras no banco.

Tabelas padrão: `companies`, `production_lines`, `holidays`, `orders`, `order_items`, `profiles`, `user_preferences`, `cq_registros`.

---

## Agendar backup diário (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-daily-backup-task.ps1
```

Teste manual:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-daily-backup.ps1
```

---

## Telegram

1. @BotFather → `/newbot` → guarde o token
2. @userinfobot → `chat_id`
3. `.env.local`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

Mensagens automáticas ao fim de backup diário/semanal e em falhas.

---

## GitHub Release (backup offsite)

1. Criar repo privado `pcp-control-backups`
2. PAT classic com scope `repo`
3. `.env.local`: `GITHUB_BACKUP_TOKEN`, `GITHUB_BACKUP_REPO`, `BACKUP_ENCRYPTION_PASSWORD`
4. Após backup semanal: `npm run backup:upload`

---

## Plano de teste de restore mensal

| Semana | Ação |
|--------|------|
| 1 | `backup:validate` na última pasta semanal |
| 2 | `restore:dry` e anotar diferenças de contagem |
| 3 | Restore em projeto Supabase **de teste** (clone) com `--apply` |
| 4 | Documentar tempo total e problemas |

Antes de **qualquer migration SQL em produção**, rode `backup:weekly` + `backup:validate`.

---

## Critério de pronto (Fase 2)

- [ ] Tarefa **Backup Diário** 22h registrada
- [ ] Tarefa **Backup Semanal** domingo 03h ativa
- [ ] `backup:validate` OK na última pasta
- [ ] Telegram recebe mensagem de sucesso (se configurado)
- [ ] `backup:upload` testado 1× (repo privado)
- [ ] `restore:dry` executado sem surpresas

Próxima fase: [plano-mestre-hepa/03-integracao-omie.md](./plano-mestre-hepa/03-integracao-omie.md)
