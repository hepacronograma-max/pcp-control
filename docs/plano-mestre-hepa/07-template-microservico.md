# Fase 7 — Template microserviço HEPA

**Objetivo:** Documento + script para clonar Compras, Comercial, Faturamento sem reinventar.

## Entregável

- `templates/hepa-microservice/` ou `docs/TEMPLATE-MICROSERVICO.md` + checklist
- Padrões extraídos de `pcp-control` + `engenharia-produto`

## Parte B — Prompt para o Cursor

```
Contexto: Fase 7 final plano-mestre-hepa.

Criar template reutilizável:

1) docs/TEMPLATE-MICROSERVICO.md
- Estrutura pastas
- Variáveis env obrigatórias
- Supabase: projeto novo vs schema
- Auth compartilhado com portal
- RLS padrão company_id
- Lista APIs obrigatórias: /api/health, /api/me
- Backup script cópia de weekly-backup-supabase.js
- security:smoke adaptado
- Omie: quando usar integração vs módulo próprio

2) scripts/create-hepa-module.ps1
- Parâmetro -ModuleName compras|comercial|faturamento
- Copia template, renomeia package.json, gera .env.example

3) Atualizar 00-PLANO-MESTRE.md com links e "pós Fase 7"

Não criar os 3 módulos completos — só template.
```

---

## Critério de pronto ✅

- [ ] Rodar script cria pasta `compras-hepa/` válida
- [ ] Checklist 1 página para novo módulo
- [ ] README plano-mestre atualizado

## Fim do plano mestre

Manutenção contínua:

| Frequência | Ação |
|------------|------|
| Semanal | Backup + `security:smoke` |
| Cada deploy | `npm run build` |
| Mensal | Revisar audit_log tamanho |
| Ao contratar Omie live | 7 dias shadow |
