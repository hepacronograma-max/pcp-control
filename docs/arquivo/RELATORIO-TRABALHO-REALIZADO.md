# Relatório de trabalho — PCP Control

**Projeto:** PCP Control (Next.js + Supabase + Vercel)  
**Repositório:** `https://github.com/hepacronograma-max/pcp-control`  
**Produção:** `https://pcp-control.vercel.app`  
**Empresa principal em uso:** SMSV (`company_id` conhecido no banco)  
**Data deste relatório:** maio/2026  

Documento para **segunda opinião**: descreve o que foi pedido, o que foi feito, decisões tomadas, riscos e o que ficou pendente.

---

## 1. Contexto inicial

- Aplicação de **controle de produção e planejamento (PCP)** com pedidos, itens, linhas de produção, comercial, compras, CQ, tarefas, etc.
- Dados em **Supabase** (plano Free); front hospedado na **Vercel** com deploy automático no push em `master`.
- Pasta `Cronograma/` no desktop **não é** repositório git; o git está em `pcp-control/`.
- Houve preocupação com alterações indesejadas (login local de desenvolvimento, menu diferente, dados “sumindo”) após pushes e uso do sistema.

---

## 2. Cronologia do que foi pedido e executado

### 2.1 Entendimento e operação do sistema

| Pedido | O que foi feito |
|--------|-----------------|
| Entender o sistema antes de novas implantações | Mapeamento de módulos (pedidos, linhas, CQ, Tasks, compras, etc.) e fluxo Supabase/Vercel. |
| Subir localmente | `npm run dev` em `pcp-control`. |
| Push de commits locais | Push de ~7 commits para `origin/master` (sem intenção de deploy na hora, mas Vercel deployou automaticamente). |

### 2.2 Segurança — login local em produção

**Problema:** Em produção aparecia fluxo de “Administrador Local” (`admin@local` / `123456`, cookie `pcp-local-auth`, rotas `/entrar`, `/api/auth/local-login`), diferente do login Supabase real.

**Solução (commit `7151339`, já em produção):**

- `src/lib/allow-local-auth.ts` — login local só em desenvolvimento.
- `middleware.ts`, `login-form.tsx`, `entrar/route.ts`, `local-login/route.ts` — bloqueio em produção.

**Efeito:** Em `pcp-control.vercel.app` só login via Supabase (e-mail/senha reais).

### 2.3 Restauração de dados “de ontem” (19/05 após 15h)

**Pedido:** Voltar dados ao estado de 19/05 após 15h.

**Limitação importante:** Supabase **Free não oferece** restore pontual (backup PITR) como plano pago. Não há “voltar ontem de manhã” nativo.

**O que foi feito:**

- Script SQL: `scripts/sql/delete-inserts-after-cutoff.sql`
- Executor: `scripts/run-delete-after-cutoff.js` (corte por `created_at`)
- Execução removeu pouco: 1 PC, 1 link, 1 profile; **0 pedidos** com `created_at` após o corte (dados não tinham sido criados nesse critério ou já estavam misturados).

**Conclusão para segunda opinião:** Restauração temporal completa **não é viável** no Free; alternativa é backup manual (JSON/SQL) ou upgrade de plano.

### 2.4 Acesso de usuários

| Ação | Detalhe |
|------|---------|
| Revogar todos os acessos | `scripts/revoke-all-access.js` — remove `auth.users`, desativa `profiles`, limpa vínculos. |
| Novo administrador | `scripts/create-admin-user.js` — usuário `helder@hdindustrial.ind.br` (manager), via variáveis `PCP_ADMIN_EMAIL` / `PCP_ADMIN_PASSWORD` (não commitadas). |

**Estado relatado:** 1 usuário Auth ativo + profile SMSV.

### 2.5 Linhas de produção (SMSV)

**Pedido:** Restaurar linhas conforme backup de 07/05.

**Execução:** `scripts/restore-production-lines-from-backup.js`

- Leu tabela `backup_production_lines_20260507` no Supabase.
- Removeu linhas atuais da SMSV (CORTE, COSTURA, BORDADO, etc.).
- Inseriu 6 linhas do backup: Almoxarifado, CARTONADO GP/PL, ABSOLUTO/FINO, MULTIBOLSA, LOGISTICA, EQUIPAMENTOS.

**Ajuste de menu (sort_order):**

- LOGISTICA → `sort_order` 5 (menu Logística)
- EQUIPAMENTOS → `sort_order` 4 (menu Produção)
- Lógica em `src/lib/utils/nav-line-groups.ts` (1–4 produção, 5–6 logística)

**Observação:** Tabela `production_lines` **sem** `updated_at` — não há auditoria de “quem alterou” no banco.

### 2.6 Limpeza de pedidos

**Pedido implícito/contexto:** Remover pedido teste e manter só pedidos com itens “FILTRO”.

**Script:** `scripts/delete-orders-without-filtro.js`

- Removeu pedido **260261** (Juliana, obs. “TESTE DE LABEL” 19/05).
- Removeu todos os pedidos **sem** item com “FILTRO” na descrição.
- Resultado: **118 → 104 pedidos** na SMSV.

**Risco para segunda opinião:** Operação **destrutiva** e irreversível sem backup prévio. Foi feita com service role; não há “lixeira” no app.

### 2.7 Semáforo de cores na lista de pedidos (prazos)

**Problema relatado (exemplos):**

- Pedido **260353**: atrasado (PCP 19/05) mas linha **verde**.
- Pedido **260393**: vendas 18/05, hoje 20/05 — deveria ser **vermelho**, aparecia amarelo.
- Regra desejada: **vermelho** = atrasado; **amarelo** = vence hoje; **verde** = no prazo; **prazo de vendas** manda (se vendas passou, vermelho mesmo com produção menor).

**Causa:** Lógica antiga em `getOrderDeadlineTrafficLight` comparava prazos **entre si** (PCP vs vendas vs produção), **sem usar a data de hoje**. A correção existia só localmente até o deploy.

**Correção (commit `066d535`, deploy Vercel):**

Arquivos:

- `src/lib/utils/date.ts` — `deadlineDayStatus`, comparação `YYYY-MM-DD` em calendário local.
- `src/lib/utils/order-aggregates.ts` — `getOrderDeadlineTrafficLight` e `getOrderPrincipalStatus` (vendas/PCP vencidos → atrasado).
- `src/components/pedidos/order-row.tsx` — tooltips atualizados.
- `src/components/comercial/comercial-orders-view.tsx` — mesma lógica na aba Comercial.

**Regra atual:**

| Cor | Condição |
|-----|----------|
| Vermelho | Vendas, PCP ou produção **já passou** (vendas vencido tem prioridade conceitual) |
| Amarelo | Algum prazo **é hoje** |
| Verde | Todos **no futuro** |
| Branco | Falta prazo ou pedido finalizado |

**Validação pós-deploy:** Ctrl+F5 em `/pedidos`; deploy leva alguns minutos após push.

### 2.8 Backup semanal na máquina local

**Pedido:** Backup automático semanal no PC; depois interesse em OneDrive.

**Criado (maioria ainda só no disco local do projeto, ver seção 4):**

| Arquivo | Função |
|---------|--------|
| `scripts/weekly-backup-supabase.js` | Exporta tabelas Supabase → JSON + opcional `pg_dump` |
| `scripts/lib/resolve-backup-dir.js` | Destino: OneDrive se existir, senão `%USERPROFILE%\Backups\PCP-Control` |
| `scripts/run-weekly-backup.ps1` | Wrapper com log + ZIP |
| `scripts/register-weekly-backup-task.ps1` | Registra tarefa no Agendador do Windows |
| `docs/BACKUP-SEMANAL-WINDOWS.md` | Guia em português |
| `npm run backup:weekly` | Atalho no `package.json` |

**Teste manual realizado (20/05/2026 ~16:58):**

- Pasta: `C:\Users\Helder\Backups\PCP-Control\2026-05-20_165806\`
- Conteúdo: 104 pedidos, 249 itens, linhas, CQ, compras, 1 usuário auth, etc.

**Política de não sobrescrever (ajuste posterior):**

- Cada execução = **pasta nova** com data + hora + milissegundos.
- **Não apaga** backups antigos por padrão (`PCP_BACKUP_KEEP_WEEKS=0`).
- `latest.txt` só indica o último; não substitui pastas anteriores.
- `LEIAME.txt` na pasta base explica a estrutura.

**Pendente pelo usuário:**

- Registrar tarefa agendada (`register-weekly-backup-task.ps1`).
- Rodar novo backup para popular `OneDrive\Backups\PCP-Control` (primeiro backup foi antes do destino OneDrive padrão).
- OneDrive: sincronização é automática **se** a pasta destino estiver dentro do OneDrive.

**Requisitos:** `.env.local` com `SUPABASE_SERVICE_ROLE_KEY`; Node no PATH.

**Opcional:** `DATABASE_URL` + `pg_dump` para `supabase-dump.sql` completo.

---

## 3. Scripts de manutenção criados (referência)

| Script | Uso | Destrutivo? |
|--------|-----|-------------|
| `run-delete-after-cutoff.js` | Apaga registros após data de corte | Sim |
| `revoke-all-access.js` | Remove todos usuários Auth | Sim |
| `create-admin-user.js` | Cria/atualiza admin | Não (cria usuário) |
| `restore-production-lines-from-backup.js` | Restaura linhas da tabela backup | Sim (substitui linhas SMSV) |
| `delete-orders-without-filtro.js` | Remove pedidos sem FILTRO + 260261 | Sim |
| `weekly-backup-supabase.js` | Export JSON | Não (só leitura Supabase) |

Todos usam **service role** — poder total no banco. Devem rodar só em ambiente controlado.

---

## 4. Git / deploy — o que está no GitHub vs só local

### No GitHub (`master`, após pushes)

- Segurança login local (`7151339`)
- Integrações CQ/Tasks/Almox/Nav (commits anteriores)
- **Correção semáforo prazos** (`066d535`) → Vercel deploy automático

### Alterado localmente, **ainda não commitado** (verificar com `git status`)

- Scripts de backup semanal (`weekly-backup-supabase.js`, `.ps1`, `docs/BACKUP-SEMANAL-WINDOWS.md`, etc.)
- Ajustes “não sobrescrever backup” e OneDrive
- Possivelmente `.env.example` (variáveis de backup)
- Scripts: `delete-orders-without-filtro.js`, `restore-production-lines-from-backup.js` (se nunca commitados)

**Recomendação para segunda opinião:** Decidir se scripts de manutenção entram no repo (sem secrets) ou ficam só na máquina do administrador.

---

## 5. Estado aproximado do banco (após as operações)

| Item | Valor aproximado |
|------|------------------|
| Pedidos SMSV | 104 (somente com itens contendo “FILTRO” na descrição) |
| Linhas SMSV | 6 (do backup 07/05 + sort_order ajustado) |
| Auth | 1 usuário admin configurado |
| Tabelas backup no Supabase | Ex.: `backup_production_lines_20260507`, `backup_cq_20260507_*` |
| Plano Supabase | Free — sem PITR/restore pontual |

---

## 6. Riscos e pontos para segunda opinião

1. **Scripts destrutivos** rodados com service role (pedidos, linhas, usuários). Sem backup antes = sem volta fácil no Free.
2. **Filtro “FILTRO”** reduziu pedidos de 118 para 104 — confirmar se regra de negócio está correta permanentemente.
3. **Restore 19/05** não foi possível de forma automática; depende de backups locais futuros.
4. **Login local** bloqueado em prod — correto para segurança; dev local ainda pode usar se `allow-local-auth` permitir em `NODE_ENV=development`.
5. **Cores dos prazos** dependem de datas em `orders` + maior `production_end` dos itens; se um item tiver data antiga não visível na coluna, linha pode ficar vermelha com prazos “bons” na UI — vale validar pedido a pedido se houver dúvida.
6. **Backup automático** ainda não agendado no Windows; só 1 backup manual na pasta local antiga.
7. **Secrets:** `.env.local` no `.gitignore` — nunca commitar `SUPABASE_SERVICE_ROLE_KEY` nem senhas admin.
8. **Deploy Vercel** a cada push em `master` — qualquer commit em master vai para produção.

---

## 7. O que ficou pendente (responsabilidade do usuário)

- [ ] Agendar backup semanal (`register-weekly-backup-task.ps1`)
- [ ] Rodar `npm run backup:weekly` e confirmar pasta no OneDrive
- [ ] Validar cores em `/pedidos` após deploy (`066d535`)
- [ ] Decidir commit dos scripts de backup/manutenção no GitHub
- [ ] Política de retenção de backups (disco vai enchendo se `PCP_BACKUP_KEEP_WEEKS=0` para sempre)
- [ ] Considerar plano pago Supabase ou backup SQL se RPO/RTO forem críticos

---

## 8. Comandos úteis (reprodução)

```powershell
cd "C:\Users\Helder\Desktop\hd projetos\Programas\Cronograma\pcp-control"

# Backup agora
npm run backup:weekly

# Agendar domingo 03:00
powershell -ExecutionPolicy Bypass -File scripts\register-weekly-backup-task.ps1

# Ver último backup
Get-Content "$env:USERPROFILE\OneDrive\Backups\PCP-Control\latest.txt"
# ou pasta local antiga:
Get-Content "$env:USERPROFILE\Backups\PCP-Control\latest.txt"

# Status git
git log -5 --oneline
git status
```

---

## 9. Resumo em uma frase

Foi reforçada a **segurança** do login, **reorganizados** dados (linhas, pedidos, usuários) com scripts administrativos, **corrigida** a lógica visual de **prazos** na lista de pedidos e **implementado** (localmente) um **backup semanal** em pastas datadas sem sobrescrever anteriores; restauração pontual no Supabase Free **não** está disponível, e parte dos scripts de backup **ainda não** está no repositório remoto.

---

*Documento gerado para revisão externa. Ajuste datas/números se houver divergência com o estado atual do banco ou do git.*
