# Verificação: Banco de Dados Correto

## ✅ Garantias do sistema

### 1. Banco único
- **Um único Supabase** é usado em todo o app
- Todas as variáveis apontam para o mesmo projeto: `NEXT_PUBLIC_SUPABASE_URL`

### 2. Conexões
| Uso | Variáveis | Onde |
|-----|-----------|------|
| Leitura/escrita no navegador | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Páginas (pedidos, linhas, config) |
| APIs (service role) | `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | company-data, effective-company, import-backup, import-pdf |
| Import no build | `NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | `import-backup-to-supabase.js` |

### 3. Empresa correta (perfil local)
- `effective-company` retorna a empresa que **tem pedidos** no banco
- `company-data` busca pedidos e linhas dessa empresa
- Criação/edição usa `effectiveCompanyId` → sempre salva na empresa certa

### 4. Onde conferir

**Vercel (produção):**
- Settings → Environment Variables
- Confirme que `NEXT_PUBLIC_SUPABASE_URL` é a URL do seu projeto (ex: `https://kmlhjhaimfverxwdiwhn.supabase.co`)
- Confirme que `SUPABASE_SERVICE_ROLE_KEY` é a service role do **mesmo** projeto

**Supabase:**
- Project Settings → API
- A URL e as keys devem ser as mesmas usadas na Vercel

**Local (.env.local):**
- Mesmas variáveis do Supabase de produção
- Assim, local e produção usam o mesmo banco

---

## Checklist rápido

- [ ] Vercel tem as 3 variáveis (URL, ANON_KEY, SERVICE_ROLE_KEY)
- [ ] URL na Vercel = URL no Supabase Dashboard
- [ ] RLS aplicado no Supabase (execute `supabase-rls-policies.sql` se ainda não fez)
- [ ] Backup importado (build ou "Restaurar do repositório" em Configurações)
