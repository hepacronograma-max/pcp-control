# Importação Omie → PCP (Fase 3 — Entrega 1)

Substitui a importação manual de PDF por leitura automática da API Omie (etapa **Ordem de Fabricação**, código **20**).

**Somente leitura no Omie** nesta entrega — nenhuma alteração de etapa ou pedido.

## Fluxo

```
Omie (etapa 20 — Ordem de Fabricação)
        │
        ▼
Botão em /admin/omie (gestor autenticado)
  POST /api/admin/omie
        │
        ▼
importarPedidosDaFabricacao()
        │
        ├─ shadow → omie_order_links (shadow_detected), log, SEM orders
        │
        └─ active → orders + order_items + omie_order_links (synced)
```

## Shadow vs Active

| Modo | Variável | Comportamento |
|------|----------|---------------|
| **shadow** (padrão) | `OMIE_INTEGRATION_MODE=shadow` | Registra o que importaria; não cria `orders` |
| **active** | `OMIE_INTEGRATION_MODE=active` | Cria pedidos no PCP como o PDF hoje |

## Mapeamento (igual ao import-pdf)

| Omie | PCP |
|------|-----|
| `numero_pedido` (com `/N`) | `orders.order_number` |
| nome cliente | `orders.client_name` |
| `data_previsao` | `orders.delivery_deadline` |
| — | `orders.status` = `imported` |
| — | `orders.company_id` = `OMIE_CODIGO_EMPRESA_HEPA` |
| item descrição | `order_items.description` |
| item quantidade | `order_items.quantity` |
| item código | `order_items.product_code` |
| — | `order_items.line_id` = **NULL** (manual depois) |

Chave de idempotência: `omie_order_links.omie_codigo_pedido` (único).

Pedidos `260161/1` e `260161/2` são **diferentes** (sufixo no `numero_pedido`).

## Etapas Omie (operação 11 — HEPA)

| Código | Nome | Esta entrega |
|--------|------|--------------|
| 20 | Ordem de Fabricação | **Importa** |
| 80 | Produção em andamento | Entrega 2 |
| 50 | Faturar | Entrega 2 |

## Backfill inicial

Marca pedidos já na etapa 20 sem importar histórico para o PCP:

```powershell
node scripts/omie-backfill-inicial.js          # dry-run
node scripts/omie-backfill-inicial.js --apply  # grava backfill_skipped
```

## Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `OMIE_APP_KEY` | Sim | API Omie |
| `OMIE_APP_SECRET` | Sim | API Omie |
| `OMIE_CODIGO_EMPRESA_HEPA` | Sim | UUID `company_id` da HEPA no PCP |
| `OMIE_INTEGRATION_MODE` | Não | `shadow` (default) ou `active` |
| `OMIE_ETAPA_FABRICACAO` | Não | Default `20` |

## Vercel (Production)

1. Settings → Environment Variables: variáveis acima
2. Aplicar migration `supabase/migrations/20260604_omie_import.sql` no SQL Editor
3. Rodar backfill antes de ativar `active`
4. Validar em **shadow** pelo painel `/admin/omie`
5. Só então `OMIE_INTEGRATION_MODE=active` + redeploy
6. Importar pedidos pelo botão em `/admin/omie` quando necessário

## Painel admin

`/admin/omie` — modo atual, última importação, métricas, tabela de vínculos, botão **Importar pedidos do Omie** (sob demanda; não há cron automático).

## Migration

`supabase/migrations/20260604_omie_import.sql` — tabelas `omie_order_links`, `sync_locks`.

## Teste shadow local

```powershell
# .env com credenciais Omie + OMIE_CODIGO_EMPRESA_HEPA
npm run lint
node -e "require('./scripts/omie-descobrir-etapas.js')"  # opcional: etapas
# POST autenticado como gestor em /admin/omie (botão Importar)
```
