# Fase 5 — Portal HEPA OS (máscara)

**Objetivo:** Login único e menu que aponta para módulos independentes (PCP hoje; Engenharia placeholder).

## Arquitetura

```
portal.hepa.local (ou subpath /portal)
  → SSO Supabase compartilhado (mesmo projeto Auth ou organização)
  → Cards: PCP Control | Engenharia (em breve) | Compras | ...
  → cada card = URL do app deploy separado
```

## Parte A — Manual

1. Decidir URLs:
   - PCP: `pcp-control.vercel.app` (atual)
   - Portal: novo projeto Vercel `hepa-portal` (recomendado) **ou** rota `/portal` no PCP (mais simples, menos isolamento)
2. Para isolamento real: **projeto separado** `hepa-portal/` na pasta `Cronograma/`.

---

## Parte B — Prompt para o Cursor

```
Contexto: Cronograma/plano-mestre-hepa Fase 5. Criar app portal separado sem quebrar pcp-control.

1) Novo projeto Next.js hepa-portal/ (minimal)
- Login Supabase (mesmas NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)
- Após login: dashboard com cards módulos
- Card PCP → link externo pcp-control.vercel.app (passar session: usar magic link ou shared cookie domain se mesmo domínio pai — documentar limitação *.vercel.app)

2) Multi-tenant no portal
- Ler profile.company_id; mostrar nome empresa
- Guard tenant em localStorage para apps filhos (query ?companyId= só se seguro)

3) pcp-control: rota /api/auth/session-handoff (opcional)
- Token curto 60s para portal redirecionar usuário já logado

4) docs/PORTAL-HEPA-OS.md
- Diagrama módulos, variáveis env, como adicionar 3º app

5) Placeholder Engenharia card disabled "Em construção"

Não mover código PCP para portal. Portal só fachada.
```

---

## Critério de pronto ✅

| Item | OK? |
|------|-----|
| Login portal | Mesmo usuário Supabase do PCP |
| Abrir PCP | Sem pedir senha de novo (ou 1 clique) |
| PCP isolado | Deploy independente continua funcionando |
| Falha portal | PCP URL direta ainda funciona |

## Próxima fase

[06-modulo-engenharia.md](./06-modulo-engenharia.md)
