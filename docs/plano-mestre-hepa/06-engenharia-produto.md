# Fase 6 — Engenharia de Produto (2º microserviço)

**Objetivo:** Validar arquitetura multi-app com módulo focado em BOM / DNA do filtro.

## Escopo MVP

- App `engenharia-produto/` (Next + Supabase **projeto separado** ou schema separado)
- Entidades: `products`, `bom_lines`, `dna_specs` (código filtro, dimensões, material)
- Leitura opcional de `product_code` já usado no PCP (`order_items.product_code`)
- **Sem** escrita no banco PCP na v1 (evitar acoplamento)

## Parte B — Prompt para o Cursor

```
Contexto: Fase 6 plano-mestre-hepa. Novo repo pasta engenharia-produto/ ao lado de pcp-control.

1) Scaffold Next.js 16 + Supabase + Tailwind (mesmo visual HEPA: #1B4F72)
2) Tabelas: products (code unique), bom_headers, bom_lines (qty, component_code)
3) CRUD UI simples: lista produtos, editar BOM
4) API read-only GET /api/products/by-code/:code para futuro uso PCP
5) Link no portal HEPA (Fase 5) ativo
6) docs/ENGENHARIA-MVP.md

Não duplicar orders/pedidos aqui. Não apagar dados PCP.
```

---

## Critério de pronto ✅

- [ ] App deployável Vercel
- [ ] 1 produto exemplo com BOM 3 linhas
- [ ] Portal abre Engenharia
- [ ] PCP continua independente

## Próxima fase

[07-template-microservico.md](./07-template-microservico.md)
