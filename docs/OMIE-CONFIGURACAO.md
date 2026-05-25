# Omie — Configuração passo a passo

## 1. Credenciais Omie (você no portal Omie)

1. https://app.omie.com.br → Configurações → API  
2. Gerar **App Key** e **App Secret**  
3. Confirmar com Leonardo/Edmo a **etapa** que libera o PCP (ex.: `60`)  
4. Anotar CNPJ / código do cliente principal  

## 2. Variáveis no `.env.local` (dev) e Vercel (prod)

```env
OMIE_APP_KEY=
OMIE_APP_SECRET=
OMIE_WEBHOOK_SECRET=          # npm run security:secrets
OMIE_ETAPA_PCP=60
OMIE_INTEGRATION_MODE=shadow
OMIE_DEFAULT_COMPANY_ID=      # UUID da empresa no PCP (opcional se só há 1)
CRON_SECRET=                  # npm run security:secrets
```

**Sempre iniciar em `shadow` por 1 semana.**

## 3. Migration Supabase

SQL Editor → colar `supabase/migrations/20260522_omie_integration.sql` → Run.

Confere tabelas: `omie_order_links`, `omie_webhook_events`, `line_routing_rules`.

## 4. Webhook no Omie

| Campo | Valor |
|-------|--------|
| URL | `https://pcp-control.vercel.app/api/webhooks/omie` |
| Evento | `pedido.etapa_alterada` (ou equivalente no painel Omie) |
| Secret | mesmo valor de `OMIE_WEBHOOK_SECRET` |
| Header assinatura | `X-Omie-Signature` (HMAC-SHA256 do body) |

## 5. Cron Vercel

Arquivo `vercel.json` já define poll a cada 15 min.  
Na Vercel, plano precisa suportar **Cron Jobs** e variável `CRON_SECRET` configurada.

Ver [CRON-VERCEL.md](./CRON-VERCEL.md).

## 6. Regras de linha (`line_routing_rules`)

Seed padrão na migration (HF-FFP, HF-BSF, etc.).  
Ajuste no Supabase Table Editor ou SQL — prioridade menor = avaliada primeiro.

Fallback no código: **ALMOXARIFADO**.

## 7. Validação shadow (1 semana)

1. `OMIE_INTEGRATION_MODE=shadow`  
2. Criar/mover pedidos no Omie para a etapa configurada  
3. Abrir `/admin/omie` — eventos `processed`, links em shadow nos logs  
4. Conferir mapeamento de linhas com a equipe  
5. Só então: `OMIE_INTEGRATION_MODE=active` + redeploy  

## 8. Testes locais

```powershell
npm run test          # mapper
npm run build
```
