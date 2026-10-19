# Parecer — Performance e arquivos do PCP Control

Data: maio/2026 · Empresa de referência: SMSV (~104 pedidos, ~249 itens)

## Resumo executivo

| Área | Situação | Prioridade |
|------|----------|------------|
| **Segurança / cleanup** | OK (`CLEANUP_SECRET` ativo) | — |
| **Velocidade percebida** | Aceitável para o volume atual; gargalos aparecem em **tabelas grandes** e **polls em background** | Média |
| **Banco (Supabase)** | Principal limitador em escala; APIs carregam conjuntos inteiros | Alta (futuro) |
| **Arquivos no repo** | Projeto pequeno (~2 MB sem `node_modules`); **nenhum dado de produção** deve ser apagado do disco sem backup | — |

---

## O que já foi otimizado nesta rodada

1. **CQ por linha** — deixou de carregar lista completa no mount; só conta leve para o badge; lista completa ao abrir o painel.
2. **Menu lateral (DashboardShell)** — polls de badges/contagens: 30s → **60s** e **pausam com aba em segundo plano**.
3. **Dependências** — `express` / `cors` / `multer` movidos para `devDependencies` (só `local-pdf-server.js`).

---

## Gargalos de performance (por impacto)

### 1. Crítico — N+1 de CQ (mitigado parcialmente)

Cada linha da tabela montava `CQList` e buscava `cq_registros` inteiro.  
**Agora:** contagem leve no mount + detalhe só ao abrir.  
**Próximo passo:** API batch `GET /api/cq/registros?target_ids=...` por página.

### 2. Crítico — `/api/company-data` modo completo em Pedidos

`pedidos/page.tsx` busca **todos** pedidos + itens aninhados de uma vez. Com SMSV ainda é rápido; com milhares de pedidos ficará lento.

| Quick win | Refactor |
|-----------|----------|
| Cache no cliente após primeiro load | Paginação por aba (`open` / `finished`) + colunas mínimas |
| Índices Supabase em `orders.company_id` | RPC `get_orders_page` |

### 3. Alto — Polls e middleware

- Shell fazia 3 polls a cada 30s + `auth.getUser()` no middleware em quase todas as rotas.
- **Mitigado:** polls 60s + pausa se aba oculta.
- **Futuro:** um endpoint `/api/sidebar-badges` ou excluir `/api/*` do middleware pesado.

### 4. Alto — `/api/line-data` sem limite (linhas de produção)

Almox já tem paginação; linhas normais carregam todos os itens da linha.

### 5. Médio — Dashboard e APIs de contagem

`line-pending-count` e `tasks/pending-count` leem muitas linhas para um número no menu. Trocar por `COUNT` no SQL ou view materializada.

### 6. Médio — Bundle (Recharts, Kanban, PWA)

Gráficos e `@dnd-kit` pesam o primeiro carregamento. Usar `next/dynamic` nas rotas de dashboard/atividades.

---

## Varredura de arquivos (sem perder dados)

### Manter (dados ou operação)

| Item | Motivo |
|------|--------|
| `backup-pcp.json` (raiz, gitignored) | Backup local legado — **não apagar** sem copiar para OneDrive |
| `C:\Users\Helder\OneDrive\Backups\PCP-Control\` | Backups semanais oficiais |
| `secrets/` (gitignored) | `CLEANUP_SECRET` e instruções Vercel |
| `public/login.html` | Redirect legado → `/login` (links antigos) |
| Scripts em `scripts/` | Backup, cleanup, restore — operação |

### Documentação duplicada (não apagar — só organizar)

Vários `.md` na raiz repetem tema de deploy/backup. **Nenhum contém dados de pedidos.**  
Índice: `docs/INDICE-DOCUMENTACAO.md`.

| Canônico | Legado / histórico |
|----------|-------------------|
| `docs/SEGURANCA-PRODUCAO.md` | — |
| `docs/BACKUP-SEMANAL-WINDOWS.md` | `BACKUP-DADOS-LOCAIS.md`, `CHECKLIST-BACKUP-MANUAL.md` |
| `DEPLOY-PRODUCAO.md` | `DEPLOY.md`, `DEPLOY-UNICO.md`, `PROMPT-DEPLOY.md` |
| `OTIMIZACAO-SUPABASE.md` | `RELATORIO-MIGRACAO-SUPABASE.md` |

**Recomendação:** não deletar relatórios antigos; arquivar mentalmente como histórico. Se quiser limpar o repo no Git, mover para `docs/arquivo/` em um PR dedicado (sem tocar em JSON de backup).

### Removidos com segurança (já feito antes)

- `public/backup-inicial.json` — dados sensíveis; backup real está no OneDrive.

### Dependências não usadas no runtime Next

- `express`, `cors`, `multer` → só `local-pdf-server.js` (dev).
- `next-pwa` com `disable: true` — avaliar remoção futura do pacote.

---

## Comandos úteis

```powershell
npm run security:smoke    # testes de segurança em produção
npm run backup:weekly     # backup Supabase → OneDrive
npm run inventory:repo    # inventário de tamanhos/arquivos
npm run build             # validar build
```

---

## Roadmap sugerido (sem risco de perda de dados)

| Fase | Esforço | Ganho |
|------|---------|-------|
| A | Feito | CQ lazy + polls mais leves |
| B | 1–2 dias | Paginação em Pedidos + `line-data` |
| C | 2–3 dias | Endpoint agregado de badges + menos middleware |
| D | 3–5 dias | SQL views / índices Supabase + bundle `dynamic` |

---

## Conclusão

Para o volume atual (SMSV), o sistema deve sentir-se **mais leve** após as mudanças de CQ e polls. O maior ganho futuro está em **não carregar todos os pedidos de uma vez** e em **contagens SQL** em vez de varrer tabelas no Node. Nenhuma limpeza de arquivo com dados foi feita automaticamente — backups e `backup-pcp.json` permanecem protegidos.
