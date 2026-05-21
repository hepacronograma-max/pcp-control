# 00 — Plano Mestre HEPA OS + PCP Control

## Visão (o que você definiu)

```
                 PORTAL HEPA OS (fachada / SSO / menu)
                /    |    |    |    |    \
               /     |    |    |    |     \
            PCP    ENG   COMP  COM   FAT   Integrações
             |      |     |     |     |        |
          Supabase  ...   ...   ...   ...     Omie (1º plug)
```

- **Cada módulo** = app Next.js (ou similar) + banco/deploy **independentes**.
- **Portal** = experiência única; se Compras cair, PCP continua.
- **1º integração externa:** Omie → PCP (pedido nasce no Omie, aparece no PCP **sem importar PDF**).
- **Crescimento:** Engenharia (BOM / DNA do filtro), depois Compras, Comercial, Faturamento — sempre pelo **mesmo padrão** (Fase 7).

## Escopo “resolver totalmente”

| Incluído | Fora deste pacote (futuro) |
|----------|---------------------------|
| Segurança produção, auditoria, backup | Supabase Pro / PITR |
| Performance até escala SMSV + ~10× pedidos | BI / data warehouse |
| Omie automático (shadow → live) | TOTVS direto (manter PDF onde precisar) |
| Base multi-tenant real no PCP | Módulos Comercial/Faturamento completos |
| Portal mínimo + roteamento | App mobile nativo |
| Template do 2º microserviço (Engenharia) | |

## Ordem das 7 fases (crítica)

```
1 Segurança + auditoria nativa
        ↓  (sem vazamento nem “quem fez o quê” cego)
2 Backup local reforçado
        ↓  (Free tier: sua rede de segurança de dados)
3 Omie ↔ PCP (shadow → produção)
        ↓  (primeiro contrato entre sistemas)
4 Performance PCP
        ↓  (rápido antes de portal e mais usuários)
5 Portal HEPA OS (máscara)
        ↓  (login único + links para módulos)
6 Engenharia de Produto (2º app)
        ↓  (prova o modelo multi-app)
7 Template microserviço
        ↓  (Compras, Comercial, Faturamento no mesmo molde)
```

### Por que esta ordem

| # | Razão |
|---|--------|
| 1 | Evoluir sem auditoria em multi-tenant = irresponsável |
| 2 | Free tier sem PITR → backup semanal não basta sozinho |
| 3 | Omie errado cria pedidos duplicados/lixo no banco |
| 4 | Portal + sistema lento = sensação de produto quebrado |
| 5 | Portal antes de performance multiplica chamadas |
| 6 | Engenharia valida arquitetura antes de clonar 3× |
| 7 | Sem template, cada módulo vira débito técnico |

## Estado atual (baseline mai/2026)

### Já feito no PCP Control

- Endurecimento: `/api/cleanup` com `CLEANUP_SECRET`, login local bloqueado em prod, cookie httpOnly
- Backup semanal: script + tarefa Windows → OneDrive
- Performance inicial: CQ lazy-load, polls 60s + aba oculta
- Docs: `docs/SEGURANCA-PRODUCAO.md`, `docs/PARECER-PERFORMANCE-E-ARQUIVOS.md`
- Testes: `npm run security:smoke`

### Pendente (entra nas Fases 1–4)

- Rotação `anon` + `service_role` Supabase (se ainda não feita)
- Branch protection GitHub
- **Auditoria nativa** (triggers + tabela `audit_log`)
- Omie API keys + webhook/polling
- Paginação Pedidos / `line-data`
- Multi-tenant real (`company_id` em todas as políticas e rotas admin)
- Portal HEPA OS

## Multi-tenant (definição para o plano)

Hoje o PCP usa `company_id` em várias tabelas, mas rotas com **service role** ignoram RLS. Multi-tenant **real** significa:

1. Todo acesso de leitura/escrita passa por sessão do usuário **ou** job com escopo explícito `company_id`.
2. Nenhuma API pública usa admin sem `CLEANUP_SECRET`-style guard.
3. Portal propaga `company_id` / tenant no JWT ou cookie de sessão.
4. Omie: um `omie_app_key` (ou empresa Omie) mapeado para um `company_id` no PCP.

## Integração Omie (decisão técnica)

| Modo | Comportamento |
|------|----------------|
| **Shadow (semana 1)** | Webhook/polling grava em `omie_orders_staging`; **não** cria `orders` |
| **Live** | Após validação manual, promove staging → `orders` + `order_items` |
| **Polling** | A cada 15 min, reconcilia pedidos que o webhook perdeu |
| **Idempotência** | Chave `omie_pedido_id` + `company_id` única |

Credenciais: criar em Omie → Integrações → API (você ainda não tem keys).

## Supabase Free — estratégia de dados

| Camada | O quê |
|--------|--------|
| Semanal | `npm run backup:weekly` → OneDrive (já agendado) |
| Pré-deploy | Backup manual antes de migration |
| Retenção | Manter N pastas (`PCP_BACKUP_KEEP_WEEKS`) |
| pg_dump | Opcional: `DATABASE_URL` no `.env.local` para dump SQL |
| Pro (futuro) | Quando > ~500 pedidos ativos ou equipe > 5 usuários simultâneos |

## Critério global de “problema resolvido”

- [ ] Produção segura (smoke 10/10 + keys rotacionadas + auditoria ativa)
- [ ] Backup restaurável testado 1×
- [ ] Pedido Omie aparece no PCP sem PDF (modo live, 0 duplicatas em 7 dias)
- [ ] Pedidos/Linha abrem em < 3s com carga SMSV
- [ ] Portal abre PCP (e placeholder Engenharia) com mesmo login
- [ ] Template documentado para o 3º módulo

## Quando chamar Claude (não só Cursor)

| Momento | Por quê |
|---------|---------|
| Antes dos triggers da Fase 1 | Lista de tabelas auditadas |
| Antes de ativar Omie live | Revisar mapeamento campos Omie → schema PCP |
| Antes do Portal SSO | Escolha Auth0 vs Supabase Auth compartilhado vs cookie federado |
| Após Fase 4 | Validar métricas de performance reais |

## Próximo passo

Abra **[01-seguranca-final.md](./01-seguranca-final.md)** e execute a Fase 1 (mesmo que parte já esteja feita — use o checklist).
