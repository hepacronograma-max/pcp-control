# Prompt para colar no ChatGPT – Deploy PCP Control na nuvem (gratuito)

Copie o texto abaixo e cole no ChatGPT para ser guiado passo a passo:

---

Preciso de ajuda para colocar meu sistema PCP Control (Planejamento e Controle de Produção) na nuvem de forma gratuita. É um app Next.js que usa Supabase e Vercel.

**IMPORTANTE:** Não posso usar nenhuma ferramenta com cobrança recorrente. O projeto deve funcionar 100% no plano gratuito.

## CONTEXTO DO PROJETO:
- App Next.js com autenticação e banco de dados
- Usa Supabase (auth, PostgreSQL, storage para logos)
- Já tem API de importação de PDF em /api/import-pdf
- Suporta PDFs Omie e TOTVS – extração por parser (sem IA, sem APIs pagas)
- Tabelas: companies, profiles, production_lines, operator_lines, orders, order_items, holidays

## O QUE QUERO:

### 1. FASE 1 - SUPABASE
- Criar conta e projeto no Supabase (plano Free)
- Criar todas as tabelas necessárias no banco
- Configurar primeiro usuário admin e empresa
- Me dar o SQL completo para rodar no SQL Editor
- Explicar onde pegar: Project URL, anon key, service_role key

### 2. FASE 2 - VERCEL
- Usar plano Vercel Hobby (100 GB de banda)
- Configurar deploy do projeto Next.js
- Variáveis de ambiente necessárias:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
- **NÃO** precisa de ANTHROPIC_API_KEY (o projeto não usa mais)

### 3. FASE 3 - TESTE
- Como validar o login e a importação de PDF após o deploy

Me guie passo a passo, de forma clara e em português. Se eu tiver dúvida em algum passo, posso perguntar e você detalha.

---
