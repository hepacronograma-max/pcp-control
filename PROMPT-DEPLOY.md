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

---

# Prompt para ATUALIZAR o sistema na nuvem (já está no ar)

Copie o texto abaixo e cole no ChatGPT:

---

Meu sistema PCP Control já está na nuvem (Vercel + Supabase + GitHub). Preciso atualizar com as novas funcionalidades que desenvolvi localmente.

## SITUAÇÃO ATUAL:
- Repositório GitHub: https://github.com/hepacronograma-max/pcp-control
- O código já foi atualizado e enviado para o GitHub (git push feito)
- Branch: master
- Deploy está na Vercel conectado ao GitHub

## O QUE FOI ATUALIZADO NESTA VERSÃO:
1. **Login local melhorado** - suporte a múltiplos usuários locais (localStorage)
2. **Dashboard do operador** - operadores agora veem "Meus Itens" com KPIs das suas linhas (total de itens, aguardando, programados, concluídos, itens atrasados, resumo por linha com barra de progresso, tabela dos próximos itens a produzir)
3. **Correção de modo local/Supabase** - o sistema agora detecta corretamente se o usuário é local mesmo quando o Supabase está configurado (corrigido bug de tela piscando/redirect loop para operadores)
4. **Gestão de usuários** - admin pode editar e excluir usuários, senha visível no modo admin
5. **Import PDF TOTVS** - extração correta de campos, remoção de unidades (UN, PÇ) da descrição
6. **Apagar linha de produção** - novo botão para deletar linhas
7. **Zerar base de pedidos** - botão em Configurações para limpar pedidos mantendo config
8. **Permissões** - operador não vê Pedidos nem Configurações no menu

## O QUE PRECISO:
1. Verificar se a Vercel fez o deploy automático após o push (normalmente faz)
2. Se não fez, como forçar um redeploy
3. Como verificar se o deploy está funcionando corretamente
4. Se precisar atualizar algo no banco Supabase (tabelas, RLS, etc.)

## VARIÁVEIS DE AMBIENTE NA VERCEL (já configuradas):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Me ajude a confirmar que a atualização está no ar e funcionando.

---
