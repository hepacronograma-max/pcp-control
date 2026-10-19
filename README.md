# PCP Control — HEPA Filtros

Sistema de **Planejamento e Controle de Produção** da HEPA Filtros: pedidos,
programação por linha (Gantt), almoxarifado/abastecimento, compras, controle
de qualidade, etiquetas, certificados, embalagem, expedição e faturamento,
com integração ao **Omie ERP**.

Desenvolvido e mantido por **HD Projetos & Soluções em HVAC**.

- Produção: https://pcp-control.vercel.app
- Repositório: `hepacronograma-max/pcp-control` (branch principal `master`)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind |
| Banco / Login | Supabase (Postgres + Auth + Storage), RLS por usuário logado |
| Hospedagem | Vercel (preview automático em cada PR) |
| E-mails do sistema | SMTP Gmail (`hepacronograma@gmail.com`) configurado no Supabase Auth |
| ERP | Omie (importação de pedidos e compras) |

## Rodar no computador

```bash
npm install
cp .env.example .env.local   # preencha as chaves (nunca commitar .env*)
npm run dev                  # http://localhost:3000
```

Verificações antes de abrir PR:

```bash
npm run lint      # checagem de tipos (tsc)
npm run build
npm run test:omie && npm run test:packaging && npm run test:etiqueta
```

## Estrutura

```
src/
  app/(auth)/        login, esqueci-senha, redefinir-senha
  app/(dashboard)/   telas do sistema (pedidos, linha, compras, expedição…)
  app/api/           rotas do servidor (validam sessão e papel do usuário)
  components/        componentes de tela
  lib/               regras de negócio (omie, motor-vazao, certificado, packaging…)
  middleware.ts      exige login em todas as páginas, exceto as de acesso
supabase/
  migrations/        mudanças de banco versionadas (AAAAMMDD_descricao.sql)
  legacy/            SQL histórico — NÃO reexecutar (ver README da pasta)
scripts/             backup diário/semanal, restore, utilitários Omie
tests/               testes automatizados (node --test via tsx)
docs/                documentação (comece por docs/INDICE-DOCUMENTACAO.md)
```

## Regras de trabalho

1. Nada vai direto para `master`: branch `feat/…` ou `fix/…` → PR → preview da Vercel → teste → merge.
2. Commits no padrão Conventional Commits (`feat(auth): …`, `fix(omie): …`).
3. Mudança de banco = arquivo novo em `supabase/migrations/` + execução no SQL Editor.
4. Policies RLS sempre com `TO authenticated`.
5. Segredos só em `.env.local` (local) e nas variáveis da Vercel. Nunca no código.

## Segurança (resumo)

- Login exclusivamente pelo Supabase Auth; cadastro público **desligado** (usuários são criados em Configurações → Usuários).
- Recuperação de senha por e-mail (`/esqueci-senha`) e envio de link pelo gestor.
- Política de senha: mínimo 8 caracteres, com letras e números.
- RLS ativo em todas as tabelas; `profiles` protegido contra troca de papel pelo navegador.
- Detalhes e pendências: `docs/SEGURANCA-PRODUCAO.md`.

## Documentação

Veja [docs/INDICE-DOCUMENTACAO.md](docs/INDICE-DOCUMENTACAO.md).
