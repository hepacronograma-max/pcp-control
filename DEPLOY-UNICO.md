# Deploy único em produção — PCP Control (sem perder dados)

Este documento consolida **o que fazer uma vez** para subir a versão atual para a rede, com **mínimo risco** de perda de dados ou de quebrar o que já funciona.

---

## Ideias importantes

| O quê | Onde fica |
|--------|------------|
| Código (Next.js) | Git → Vercel / servidor |
| Dados (pedidos, perfis, linhas, compras, etc.) | **Supabase** — não vão com o `git push` |

- **Só o que mexe em dados** são os scripts SQL que **você executa** no painel (ou `ADD COLUMN` / `IF NOT EXISTS`). O deploy da app **não apaga** tabelas.
- Para não alterar comportamento: em produção, **não** volte a importar `backup-inicial.json` por cima de uma base que já tem dados reais.
- Papel `logistica` e PCP leitura em Compras são **lógica da app**; no Supabase, `profiles.role` em **texto** aceita o valor `logistica` sem migration extra. Só precisa ajuste manual se existir **CHECK** ou **enum** em `role` (aí inclua o literal `logistica`).

---

## Passo 0 — Backup (recomendado antes de qualquer SQL novo)

1. Supabase → **Project Settings** → **Database** → use **Backups** (plano pago) ou, no mínimo, exporte tabelas críticas.
2. Anote a hora do backup / commit atual para, em último caso, **restaurar** ou fazer **rollback** só da app (ver fim do doc).

Nada disso apaga nada: é cópia de segurança.

---

## Passo 1 — SQL no Supabase (só scripts que ainda **não** foram executados)

Execute no **SQL Editor** do **mesmo** projeto que a produção usa. Todos abaixo são, em geral, **aditivos** (criam tabela/coluna se faltar).

Execute **nesta ordem** e **pule** o que o painel disser que já existe (ou confirme com “Success” / sem erro de duplicar):

1. `supabase-add-columns.sql` — colunas em `orders`, `order_items`, `profiles`, etc. (se a base já veio antiga, pode já estar aplicado).
2. `supabase-purchase-orders.sql` — tabelas de pedidos de compra e links.
3. `supabase-purchase-order-lines.sql` — linhas do PC e FK nos links.
4. `supabase-purchase-orders-compras-fields.sql` — `follow_up_date`, `compras_observation` em `purchase_orders`.
5. Outros, **só se o projeto ainda não tiver** e a doc interna pedir: `supabase-user-preferences.sql`, `supabase-storage-company-logos.sql`, `supabase-rls-policies.sql`, `supabase-constraints.sql` (índices únicos, etc.).

**Não execute** em produção scripts de teste com `TRUNCATE`, `DELETE` em massa ou `DROP` sem ter certeza.

Se `profiles.role` tiver **CHECK** listando roles, aloque **uma linha** no script ou no editor para permitir `logistica` (o app já envia esse texto).

---

## Passo 2 — Variáveis de ambiente (Vercel ou servidor)

Confirme **iguais** às do ambiente que já funciona (dev/staging), apontando para o **Supabase de produção**:

| Variável | Obrigatória |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim |

Não commite `.env` no repositório.

---

## Passo 3 — Build local (validação)

Na pasta `pcp-control`:

```bash
npm ci
npm run build
```

Se o build falhar, **não** faça o deploy; corrija antes. Isso **não** altera dados no Supabase.

---

## Passo 4 — Git: um commit / um push

```bash
git add .
git status
git commit -m "chore: deploy produção — permissões, compras, logística, dashboards"
git push origin main
```

(Use a branch que o repositório usa: `main` ou `master`.)

O deploy na Vercel (se estiver ligada ao Git) dispara sozinho após o push.

---

## Passo 5 — Pós-deploy (smoke test)

- [ ] Login
- [ ] **Dashboard** (`/dashboard`) — comercial, compras, PCP, manager
- [ ] **Pedidos** (quem tem permissão)
- [ ] **Compras** — criar/alterar **só** com perfil Compras/gestão; PCP vê leitura
- [ ] **Linha de produção** — operador e logística só nas linhas de `operator_lines`
- [ ] Criar utilizador com perfil **Logística** e linhas, se forem usar

Se algo estiver errado **só no front**, na Vercel: **Redeploy** de um commit **anterior** (rollback de app, dados intactos no Supabase).

Se algo estiver errado **por script SQL** (raro com só `ADD COLUMN`/`IF NOT EXISTS`): use o backup do Passo 0 **só em último caso** e com apoio da doc Supabase de restore.

---

## O que **não** fazer (protege dados e o que já funciona)

- Não rodar `npm run import-backup` / import que **substitui** pedidos de uma base de produção já em uso.
- Não fazer `DROP TABLE`, `TRUNCATE` em produção sem plano e backup.
- Não trocar as variáveis de ambiente para outro projeto Supabase sem migração coordenada de dados.

---

## Resumo

1. **Backup** Supabase (recomendado).  
2. **SQL** em ordem, só o que faltar, sem comandos destrutivos.  
3. **Variáveis** corretas.  
4. **`npm run build`** OK.  
5. **Push** → deploy.  
6. **Teste** rápido nas áreas acima.

Assim o deploy é **um pacote** (código + checklist SQL), e os dados permanecem no Supabase, mudando só o que os scripts adicionam de forma idempotente.
