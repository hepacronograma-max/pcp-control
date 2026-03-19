# Otimização de Dados no Supabase

## 1. Evitar duplicatas

- **Pedidos:** Verificação antes de criar (company_id + order_number). Se já existe, exibe alerta.
- **Feriados:** Ao carregar feriados nacionais, ignora datas já cadastradas no ano.
- **Constraints SQL:** Execute `supabase-constraints.sql` no SQL Editor do Supabase para unique em (company_id, order_number) e (company_id, date).

## 2. Tipos corretos

| Campo | Tipo | Tratamento |
|-------|------|------------|
| quantity | integer ≥ 1 | `toQuantity()` |
| sort_order | integer ≥ 0 | `toSortOrder()` |
| delivery_deadline, pcp_deadline, production_start, production_end | date (YYYY-MM-DD) | `toDateOnly()` |
| is_recurring | boolean | `toBoolean()` |

## 3. Limite de tamanho

| Campo | Limite |
|-------|--------|
| order_number | 50 chars |
| client_name | 255 chars |
| description (item) | 500 chars |
| notes (item) | 2000 chars |
| name (linha) | 255 chars |
| description (feriado) | 255 chars |

## 4. Dados normalizados

- Orders e order_items continuam em tabelas separadas (sem JSON em colunas).
- Apenas campos necessários são enviados em cada insert/update.

## 5. Limpeza automática

**API:** `POST /api/cleanup`

- Remove itens órfãos (order_id inexistente)
- Remove feriados duplicados (mesmo company_id + date)
- Remove pedidos vazios (status imported, >90 dias, sem itens)

**Uso:**
```bash
# Simular (não deleta)
npm run cleanup:dry

# Executar (com servidor rodando)
npm run cleanup
```

**Proteção:** Defina `CLEANUP_SECRET` no `.env` e envie no header `X-Cleanup-Key` ao chamar a API.

**Cron:** Configure um cron job para chamar a API periodicamente (ex.: semanalmente).
