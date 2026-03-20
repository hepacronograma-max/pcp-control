# Publicar o PCP Control na internet

## 1. Variáveis de ambiente (no servidor / Vercel)

Copie do seu `.env.local` (não commite secrets):

| Variável | Obrigatória |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim (APIs que gravam com service role) |

Opcionais (importação PDF / DB direto), se você já usa localmente:

- `SUPABASE_ACCESS_TOKEN` ou `DATABASE_URL`

## 2. Build em produção

- **`npm run build`** — só gera o Next.js (use na Vercel/CI).
- **`npm run build:with-backup-import`** — build + import do `public/backup-inicial.json` no Supabase (só para ambiente de teste/restore manual).

Na hospedagem, **não** use import automático em todo deploy.

## 3. Opção A — Vercel (recomendado para Next.js)

1. Crie conta em [vercel.com](https://vercel.com) e instale o app GitHub/GitLab se o projeto estiver em um repositório.
2. **Import Project** → escolha o repo → **Root Directory**: `pcp-control` (se o monorepo tiver a pasta pai `Cronograma`).
3. **Framework Preset**: Next.js. Comando de build: `npm run build` (padrão).
4. Em **Settings → Environment Variables**, adicione as três variáveis `NEXT_PUBLIC_*` e `SUPABASE_SERVICE_ROLE_KEY`.
5. **Deploy**.

Depois configure em Supabase **Authentication → URL Configuration** o **Site URL** e redirects para o domínio da Vercel (ex.: `https://seu-projeto.vercel.app`).

## 4. Opção B — Servidor próprio (Node)

Na máquina ou VPS:

```bash
cd pcp-control
npm ci
npm run build
# definir as mesmas variáveis de ambiente do .env.local
NODE_ENV=production npm run start
```

Por padrão o Next escuta na porta **3000** — use nginx/Caddy como proxy reverso e HTTPS.

## 5. Antes de subir o código

```bash
git add .
git commit -m "feat: ajustes linha/pedidos e deploy"
git push origin master
```

(Use a branch que o seu remoto usa, ex. `main`.)
