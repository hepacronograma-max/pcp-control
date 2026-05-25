# Integração Omie ↔ PCP Control

## Objetivo

Pedidos aprovados no Omie entram no PCP (`orders` + `order_items`) de forma automática, com trilha em `audit_log` e painel de monitoramento.

## Arquitetura híbrida

```
[Omie — etapa OMIE_ETAPA_PCP]
        │
        ├─► Webhook POST /api/webhooks/omie  (tempo real, HMAC)
        │
        └─► Cron GET /api/cron/omie-poll   (a cada 15 min, CRON_SECRET)
                    │
                    ▼
            sync-service (shadow | active)
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  omie_webhook_events      omie_order_links
  (idempotência)           (vínculo Omie ↔ PCP)
```

## Tabelas (migration `20260522_omie_integration.sql`)

| Tabela | Função |
|--------|--------|
| `line_routing_rules` | Código/descrição produto → linha de produção |
| `omie_order_links` | `omie_codigo_pedido` ↔ `orders.id` |
| `omie_webhook_events` | Eventos recebidos + status |
| `sync_locks` | Lock do polling |
| `omie_sync_state` | Último relatório de poll |

## Modos

| `OMIE_INTEGRATION_MODE` | Comportamento |
|-------------------------|---------------|
| `shadow` (padrão) | Processa e loga; **não grava** pedidos no PCP |
| `active` | Cria/atualiza pedidos de verdade |

## API Omie usada

- `https://app.omie.com.br/api/v1/produtos/pedido/` — `ListarPedidos`, `ConsultarPedido`
- `https://app.omie.com.br/api/v1/geral/clientes/` — nome do cliente

## Painel

`/admin/omie` — gestores (`manager` / `super_admin`)

## Documentos relacionados

- [OMIE-CONFIGURACAO.md](./OMIE-CONFIGURACAO.md)
- [OMIE-TROUBLESHOOTING.md](./OMIE-TROUBLESHOOTING.md)
- [CRON-VERCEL.md](./CRON-VERCEL.md)
