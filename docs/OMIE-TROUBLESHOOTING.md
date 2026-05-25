# Omie — Troubleshooting

## Webhook retorna 401

- `OMIE_WEBHOOK_SECRET` na Vercel ≠ secret no Omie  
- Body alterado por proxy (testar com curl e HMAC manual)  
- Header: `X-Omie-Signature: sha256=<hex>`

## Webhook 503

- `OMIE_WEBHOOK_SECRET` não definido na Vercel

## Eventos `failed` no painel

1. Abrir mensagem em `omie_webhook_events.error_message`  
2. Conferir `OMIE_APP_KEY` / `OMIE_APP_SECRET`  
3. Botão **Reprocessar** em `/admin/omie`  
4. Logs Vercel → Functions → `/api/webhooks/omie`

## Polling 409 (lock)

Outro poll ainda rodando (cron + botão manual). Aguardar 10 min ou apagar lock expirado em `sync_locks`.

## Polling 401

`CRON_SECRET` incorreto ou header ausente: `X-Cron-Secret: <valor>`.

## Pedido duplicado no PCP

- Não deve ocorrer: `omie_codigo_pedido` é UNIQUE  
- Se ocorrer, verificar se alguém criou pedido manual com mesmo `order_number`  
- Marcar link como `manual_override` no SQL para bloquear sync

## Linha errada no item

1. Editar `line_routing_rules` (prefixo/contains do código HF-*)  
2. Reprocessar evento ou forçar poll  
3. Itens já criados: realocar manualmente na linha (PCP não sobrescreve itens sem update explícito)

## Modo shadow mas pedido apareceu

- `OMIE_INTEGRATION_MODE` deve ser exatamente `active` para gravar  
- Verificar redeploy após mudança de env  

## Omie rate limit

Cliente já espera 1 req/s e retry em 429/5xx. Se persistir, reduzir frequência do poll manual.

## Migration não aplicada

Erro `relation omie_order_links does not exist` → rodar SQL `20260522_omie_integration.sql` no projeto Supabase correto (HEPA).
