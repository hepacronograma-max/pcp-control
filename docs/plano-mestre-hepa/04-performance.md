# Fase 4 — Performance do PCP Control

**Objetivo:** Interface rápida com carga SMSV e preparada para ~10× pedidos.

## Já feito (baseline)

- CQList: contagem leve + detalhe ao abrir
- DashboardShell: polls 60s + pausa aba oculta
- Doc: `docs/PARECER-PERFORMANCE-E-ARQUIVOS.md`

## Parte A — Manual

1. Abrir Pedidos e Linha com DevTools → Network: anotar tamanho de `/api/company-data` e `/api/line-data`.
2. Meta: primeira carga < 3s em rede normal.

---

## Parte B — Prompt para o Cursor

```
Contexto: pcp-control Fase 4. NÃO remover funcionalidades. NÃO apagar dados.

Performance (ordem de implementação):

1) Pedidos paginados
- Novo GET /api/orders?page=1&tab=open|finished&limit=50
- Retornar orders + items embed; total count
- pedidos/page.tsx: usar nova API; infinite scroll ou paginação
- Manter company-data?lite=1 no shell

2) line-data
- Paginação por tab (default limit 100) fora do Almox
- line-table: carregar mais ao scroll

3) CQ batch
- GET /api/cq/registros/batch?target_ids=id1,id2&target_type=order_item
- CQList: no mount só count; ao abrir sheet usa batch se disponível

4) Sidebar badges agregados
- GET /api/sidebar-badges?companyId=
- Retorna { unprogrammedByLine, tasksPending, lineAttention }
- dashboard-shell: um poll 60s substitui 3 endpoints

5) Middleware
- Excluir /api/* do matcher pesado OU cache curto de sessão
- Documentar tradeoff em docs/PERFORMANCE.md

6) Supabase índices (migration)
- orders(company_id, status, delivery_deadline)
- order_items(order_id), order_items(line_id, status)
- cq_registros(target_type, target_id)

7) Bundle
- next/dynamic nos dashboards com recharts
- Lazy TasksKanban route

Atualizar PARECER-PERFORMANCE com "Feito Fase 4".
Rodar npm run build. Não quebrar testes security:smoke.
```

---

## Critério de pronto ✅

| Métrica | Alvo |
|---------|------|
| `/api/company-data` em Pedidos | Não usado para lista completa |
| Pedidos 104 itens | < 3s TTFB percebido |
| Polls shell | 1 request / 60s (badges) |
| Build | `npm run build` OK |

## Próxima fase

[05-portal-hepa-os.md](./05-portal-hepa-os.md)
