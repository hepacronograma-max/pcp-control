# Fase 3 — Integração Omie ↔ PCP Control

**Objetivo:** Pedido criado no Omie aparece no PCP **sem importar PDF**, com modo shadow e depois live.

## Pré-requisitos

- Fase 1 ✅ (auditoria ajuda a rastrear imports)
- Fase 2 ✅ (backup antes de ligar live)
- Credenciais Omie API criadas (manual abaixo)

## Parte A — Manual (você, ~45 min)

### A1. Criar credenciais Omie

1. Login Omie → Configurações → Integrações → API / Web Services.
2. Gerar **App Key** e **App Secret** (anotar em gerenciador de senhas).
3. Vercel → variáveis (Production):
   - `OMIE_APP_KEY`
   - `OMIE_APP_SECRET`
   - `OMIE_WEBHOOK_SECRET` (string aleatória que você define)
   - `OMIE_SYNC_MODE=shadow` (depois `live`)

### A2. Mapear empresa

- Definir qual `company_id` SMSV no Supabase corresponde à empresa Omie.
- Guardar em `company_settings` ou nova tabela `integration_omie` (Cursor cria).

---

## Parte B — Prompt para o Cursor

```
Contexto: pcp-control + plano-mestre-hepa Fase 3. NÃO apagar pedidos existentes. Idempotência obrigatória.

Implementar integração Omie → PCP:

1) Schema (migration)
- integration_omie_config (company_id, app_key ref, last_poll_at, sync_mode shadow|live)
- omie_orders_staging (id, company_id, omie_pedido_id unique, payload jsonb, status pending|promoted|error, created_at)
- orders.omie_pedido_id nullable unique per company_id (se coluna não existir, ADD COLUMN)

2) API POST /api/integrations/omie/webhook
- Validar OMIE_WEBHOOK_SECRET (header ou HMAC conforme doc Omie)
- Gravar em omie_orders_staging
- Se sync_mode=live e validação OK: chamar promoteOrder(stagingId)
- Sempre idempotente por omie_pedido_id

3) Job polling (Vercel Cron ou script scripts/omie-poll.js)
- A cada 15 min (documentar cron vercel.json): ListarPedidos alterados desde last_poll_at
- Mesmo pipeline staging
- npm run omie:poll para teste local

4) promoteOrder()
- Mapear campos Omie → orders + order_items (código produto, qty, prazo, cliente)
- Não duplicar se omie_pedido_id já existe
- Log em audit_log (Fase 1)

5) UI /configuracoes/integracoes
- Status shadow/live, último sync, botão "Promover pendentes" (admin)
- Lista staging últimos 20 para conferência

6) Modo shadow (default)
- OMIE_SYNC_MODE=shadow: só staging, zero INSERT em orders

7) docs/INTEGRACAO-OMIE.md
- Fluxo shadow → live, rollback, campos mapeados

Testes: mock payload JSON; teste idempotência 2× mesmo pedido = 1 order.

Não commitar secrets. Atualizar .env.example apenas com nomes das variáveis.
```

---

## Critério de pronto ✅

| Fase | Verificação |
|------|-------------|
| Shadow 7 dias | Staging recebe pedidos; **zero** novos `orders` duplicados |
| Live | 1 pedido teste Omie → aparece no PCP em < 5 min |
| Polling | Desligar webhook simulado; polling recupera em 15 min |
| Idempotência | Reenviar mesmo webhook → sem duplicata |

## Quando chamar Claude

- Antes de `sync_mode=live`: revisar mapeamento de campos com 1 PDF/pedido real Omie.

## Próxima fase

[04-performance-pcp.md](./04-performance-pcp.md)
