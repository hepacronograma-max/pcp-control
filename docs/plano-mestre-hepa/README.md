# Plano Mestre HEPA OS — Guia para o Cursor

Pacote de execução em **7 fases**, uma por vez. Não pule ordem: cada fase prepara a seguinte.

## Leitura obrigatória (15 min)

1. Este arquivo (3 min)
2. [00-PLANO-MESTRE.md](./00-PLANO-MESTRE.md) (12 min)

## Arquivos de execução

| Fase | Arquivo | Status no PCP (mai/2026) |
|------|---------|---------------------------|
| 1 | [01-seguranca-final.md](./01-seguranca-final.md) | Parcial — ver checklist |
| 2 | [02-backup-local-reforçado.md](./02-backup-local-reforçado.md) | Feito (tarefa Windows + OneDrive) |
| 3 | [03-integracao-omie-pcp.md](./03-integracao-omie-pcp.md) | Não iniciado |
| 4 | [04-performance-pcp.md](./04-performance-pcp.md) | Parcial (CQ + polls) |
| 5 | [05-portal-hepa-os.md](./05-portal-hepa-os.md) | Não iniciado |
| 6 | [06-engenharia-produto.md](./06-engenharia-produto.md) | Não iniciado |
| 7 | [07-template-microservico.md](./07-template-microservico.md) | Não iniciado |

## Como usar no Cursor

1. Abra **só um** arquivo `0X-....md` por sessão.
2. Copie a seção **「Prompt para o Cursor」** inteira para o chat (modo Agent).
3. Faça as partes **manuais** antes ou depois, conforme o arquivo indica.
4. Só avance quando o **Critério de pronto** estiver ✅.
5. Em decisões de arquitetura (tabelas de auditoria, contrato Omie), revise com Claude **antes** do Cursor implementar triggers/webhooks em massa.

## Decisões já tomadas (não reabrir)

| Tema | Decisão |
|------|---------|
| HEPA OS | Microserviços + portal (máscara); PCP é o primeiro módulo |
| Omie → PCP | Híbrido: webhook + polling 15 min; modo **shadow** 1 semana |
| Supabase | **Free** por agora; backup local reforçado (não Pro/PITR ainda) |
| Credenciais Omie | Conta existe; API keys ainda não criadas |

## Repositório atual

- App: `pcp-control/` (Next.js + Supabase + Vercel)
- Produção: `https://pcp-control.vercel.app`
- Docs técnicos: `pcp-control/docs/`
