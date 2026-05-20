# Backup semanal automático (Windows + Supabase)

Este guia configura um **backup local semanal** dos dados do PCP Control (Supabase em produção), na sua máquina, sem depender do plano pago do Supabase.

---

## OneDrive (automático, recomendado)

Se o **OneDrive** estiver instalado e logado no Windows, o backup vai para:

`OneDrive\Backups\PCP-Control\`

O cliente do OneDrive **sincroniza sozinho** para a nuvem — não precisa API, senha extra nem script de upload. Basta manter o OneDrive aberto (ícone na bandeja).

Para forçar outra pasta, use no `.env.local`:

```env
PCP_BACKUP_DIR=D:\MinhaPasta\Backups\PCP-Control
```

Para **não** usar OneDrive e ficar só no disco local:

```env
PCP_BACKUP_ONEDRIVE=0
```

---

## O que é salvo

Cada execução cria uma pasta em:

`OneDrive\Backups\PCP-Control\AAAA-MM-DD_HHMMSS\`  
(ou `%USERPROFILE%\Backups\PCP-Control\` se o OneDrive não existir)

Conteúdo:

| Arquivo | Conteúdo |
|---------|----------|
| `companies.json`, `orders.json`, `order_items.json`, … | Todas as tabelas principais do app |
| `auth-users.json` | Lista de usuários (e-mail, metadados) — **sem senhas** |
| `manifest.json` | Resumo (quantidades, data, avisos) |
| `supabase-dump.sql` | *(opcional)* dump SQL completo, se `DATABASE_URL` e `pg_dump` estiverem configurados |
| `..\logs\backup-*.log` | Log de cada execução |

Cada execução cria uma **pasta nova** com data e hora — **não sobrescreve** backups anteriores (`orders.json` de um dia não substitui o de outro).

Por padrão **nenhuma pasta antiga é apagada**. Só se você definir `PCP_BACKUP_KEEP_WEEKS=12` (por exemplo) o script remove as mais velhas além desse número.

Também é gerado um **ZIP** da pasta mais recente (`...zip`).

---

## Pré-requisitos

1. **Node.js** instalado (`node -v` no PowerShell).
2. Arquivo **`pcp-control\.env.local`** com:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`  
   (a mesma chave que já usa nos scripts de manutenção)

3. *(Recomendado)* Copie o projeto para um caminho **fixo** (ex.: `C:\PCP\pcp-control`). O Agendador usa o caminho atual do projeto.

4. *(Opcional, backup SQL completo)* No `.env.local`:
   - `DATABASE_URL=postgresql://...` (Supabase → Settings → Database → Connection string)
   - Instale o cliente PostgreSQL e deixe `pg_dump` no PATH.

---

## Passo 1 — Testar manualmente

No PowerShell, na pasta `pcp-control`:

```powershell
cd "C:\Users\Helder\Desktop\hd projetos\Programas\Cronograma\pcp-control"
npm run backup:weekly
```

Ou:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-weekly-backup.ps1
```

Confira se apareceu a pasta em `OneDrive\Backups\PCP-Control\` (Explorer → OneDrive) e se o ícone do OneDrive mostra sincronização concluída.

---

## Passo 2 — Agendar (automático toda semana)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup-task.ps1
```

Padrão: **todo domingo às 03:00**.

Personalizar:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup-task.ps1 -Day Monday -Time "22:30"
```

Abrir o Agendador: `Win + R` → `taskschd.msc` → tarefa **"PCP Control - Backup Semanal"**.

**Importante:** o PC precisa estar ligado no horário agendado (ou usar “Iniciar assim que possível” nas propriedades da tarefa).

---

## Variáveis opcionais (.env.local)

```env
# Pasta dos backups (padrão: %USERPROFILE%\Backups\PCP-Control)
PCP_BACKUP_DIR=D:\Backups\PCP-Control

# Quantas pastas semanais manter (padrão: 12)
PCP_BACKUP_KEEP_WEEKS=16

# Dump SQL completo (opcional)
DATABASE_URL=postgresql://postgres.[ref]:[senha]@...
```

---

## Restaurar dados

- **Pedidos / linhas / feriados:** use `import-backup-to-supabase.js` com o JSON exportado (formato legado) ou scripts sob medida a partir dos arquivos por tabela.
- **Usuários:** `auth-users.json` não traz senha; recrie no Supabase Auth (ex.: `scripts/create-admin-user.js`).
- **SQL completo:** só com `supabase-dump.sql` + `psql` em banco de **teste** (nunca sobrescreva produção sem planejar).

Para restauração pontual no Supabase Free, o backup local é a principal rede de segurança.

---

## Cópia extra

Com OneDrive como destino, os arquivos já ficam na nuvem da sua conta Microsoft. Opcional: copie também para HD externo.

Não é necessário integração com API da Microsoft — salvar dentro da pasta OneDrive é suficiente.

---

## Solução de problemas

| Problema | Ação |
|----------|------|
| `SUPABASE_SERVICE_ROLE_KEY` ausente | Preencha `.env.local` na pasta do projeto |
| Tarefa não roda | Verifique `logs\backup-*.log`; teste o `.ps1` manualmente |
| `pg_dump não encontrado` | Normal se não instalou PostgreSQL; o JSON já é o backup principal |
| PC desligado no domingo | Mude o horário ou ligue o PC antes; ou use “Executar assim que possível” na tarefa |

---

## Comandos úteis

```powershell
# Backup agora
npm run backup:weekly

# Remover tarefa agendada
Unregister-ScheduledTask -TaskName "PCP Control - Backup Semanal" -Confirm:$false

# Ver último backup
Get-Content "$env:USERPROFILE\Backups\PCP-Control\latest.txt"
```
