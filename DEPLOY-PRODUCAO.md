# Deploy para Produção - PCP Control

## Pré-requisitos (confirmar antes)

### 1. Build OK
```bash
npm run build
```
✓ Build concluído com sucesso.

### 2. Variáveis de ambiente na Vercel

No painel da Vercel → Projeto → Settings → Environment Variables, confirme:

| Variável | Obrigatória | Uso |
|----------|-------------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto Supabase (ex: https://xxx.supabase.co) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave anônima (pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Chave service role (API, import-pdf, cleanup) |

**Importante:** Use o **mesmo** Supabase onde o backup foi importado.

### 3. Supabase de produção

- O projeto Supabase usado na importação (`npm run import-backup`) deve ser o mesmo configurado na Vercel.
- Confira no Supabase Dashboard → Project Settings → API: a URL e as keys devem bater com as variáveis da Vercel.

---

## Deploy

1. **Commit e push:**
   ```bash
   git add .
   git commit -m "feat: Supabase como fonte única, otimizações e limpeza"
   git push origin master
   ```

2. **Vercel:** Se o projeto está conectado ao GitHub, o deploy é automático após o push.

3. **URL:** A URL de produção está no painel da Vercel (ex: `https://pcp-control.vercel.app` ou domínio customizado).

---

## Checklist de validação em produção

- [ ] **Login:** Acessar a URL e fazer login (admin@local / 123456 ou usuário Supabase)
- [ ] **Dashboard:** Ver pedidos e métricas carregando do Supabase
- [ ] **Pedidos:** Lista de pedidos aparece (dados do backup importado)
- [ ] **Criar pedido:** Novo pedido é salvo e aparece ao recarregar
- [ ] **Linhas:** Linhas de produção aparecem no menu lateral
- [ ] **Linha de produção:** Abrir uma linha e ver itens programados
- [ ] **Outro navegador/PC:** Abrir em outro dispositivo e confirmar que os mesmos dados aparecem
- [ ] **Importar PDF:** Enviar um PDF e confirmar que o pedido é criado no Supabase
