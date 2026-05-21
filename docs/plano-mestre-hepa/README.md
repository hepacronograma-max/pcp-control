# Pacote Plano Mestre HEPA OS

**Para Helder Gesteira — HD Projetos & Soluções em HVAC**

---

## O que tem aqui

| Arquivo | O que é | Quando ler |
|---|---|---|
| [00-PLANO-MESTRE.md](./00-PLANO-MESTRE.md) | Visão geral + arquitetura + roadmap | **Leia primeiro, na íntegra** |
| [01-seguranca-final.md](./01-seguranca-final.md) | Fase 1: rotação chaves + audit log | Para executar agora |
| [02-backup-reforcado.md](./02-backup-reforcado.md) | Fase 2: backup diário/semanal + Telegram | Depois da Fase 1 |
| [03-integracao-omie.md](./03-integracao-omie.md) | Fase 3: pedidos automáticos do Omie | Depois da Fase 2 |
| [04-performance.md](./04-performance.md) | Fase 4: paginação + índices | Depois da Fase 3 |
| [05-portal-hepa-os.md](./05-portal-hepa-os.md) | Fase 5: portal unificado + SSO | Depois da Fase 4 |
| [06-modulo-engenharia.md](./06-modulo-engenharia.md) | Fase 6: primeiro módulo novo | Depois da Fase 5 |
| [07-template-novos-modulos.md](./07-template-novos-modulos.md) | Fase 7: template para Compras, etc. | Depois da Fase 6 |

### Status no PCP (atualizado no repo)

| Fase | Status |
|------|--------|
| 1 | Parcial — segurança OK; falta auditoria + rotação keys + branch protection |
| 2 | Parcial — backup semanal OneDrive OK; falta diário opcional, Telegram, verify |
| 3 | Não iniciado |
| 4 | Parcial — CQ lazy + polls |
| 5–7 | Não iniciado |

---

## Como usar

1. **Hoje:** abre o [00-PLANO-MESTRE.md](./00-PLANO-MESTRE.md), lê do começo ao fim (15 min de leitura)
2. **Amanhã:** começa pela Fase 1 — abre o [01-seguranca-final.md](./01-seguranca-final.md), faz a Parte A (rotação de chaves), depois cola o **Prompt para o Cursor** no Agent
3. **Cada fase:** segue o critério de "pronto" antes de avançar
4. **Quando precisar de mim (Claude):** revisão de tabelas de auditoria, Omie live, SSO do portal
5. **Cursor (Agent):** implementar a partir dos prompts de cada `0X-....md`

---

## Cronograma realista

| Fase | Duração ativa | Espera/validação |
|---|---|---|
| 1 | 1 dia | — |
| 2 | 0.5 dia | 1 semana rodando |
| 3 | 3-5 dias | 1 semana em modo shadow |
| 4 | 2 dias | — |
| 5 | 3-5 dias | 1-2 semanas em uso |
| 6 | 5-7 dias | — |
| 7 | 1 dia | — |

**Total ativo:** ~3 semanas de trabalho efetivo  
**Calendário:** 6-8 semanas considerando validações

---

## Regras de ouro

**Não negociáveis:**

- Nunca commitar `.env` ou chaves
- Nunca deletar dados sem backup pré-operação
- Sempre dry-run antes de destruição
- Audit log em todas as tabelas críticas
- Cada módulo independente (banco e deploy)
- Comunicação entre módulos só via API REST

---

## Contato Claude vs Cursor

| Claude | Cursor |
|--------|--------|
| Decisões de produção / arquitetura | Código a partir dos prompts do pacote |
| Revisão antes de deploy sensível | Correção de tipo/sintaxe, refatoração, testes |
| Erro de segurança ou dados | Fases 1–7 com spec clara |

---

## Repositório

- App: `pcp-control/` → https://pcp-control.vercel.app
- Plano: `pcp-control/docs/plano-mestre-hepa/`
- Docs operacionais: `pcp-control/docs/INDICE-DOCUMENTACAO.md`

---

Esse plano reflete a arquitetura de microserviços + portal HEPA, Omie após segurança, Supabase Free com backup reforçado, e o que já foi implementado no PCP Control. Se algo não fizer sentido, ajuste o markdown e commit — plano guia, não amarra.
