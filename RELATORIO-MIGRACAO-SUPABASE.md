# Relatório: Migração para Supabase como Única Fonte de Verdade

**Data:** 19/03/2025  
**Objetivo:** Garantir que o app não dependa mais do navegador (localStorage) para armazenar pedidos, itens e cronograma. Supabase passa a ser a única fonte de verdade para dados operacionais.

---

## 1. O que estava local (antes)

| Dado | Chave localStorage | Onde era usado |
|------|-------------------|----------------|
| Pedidos + itens | `pcp-local-orders` | dashboard, pedidos, linha/[id], importar, configuracoes/linhas |
| Linhas de produção | `pcp-local-lines` | dashboard-shell, linha/[id], configuracoes/linhas, configuracoes/usuarios |
| Empresa | `pcp-local-company` | dashboard-shell, importar, configuracoes/empresa |
| Feriados | `pcp-local-holidays` | configuracoes/feriados |
| Perfil (auth) | `pcp-local-profile` | use-user, login, logout |
| Usuários | `pcp-local-users` | local-users, configuracoes/usuarios |

**Lógica anterior:** `isLocal` era `true` quando:
- Supabase não configurado, OU
- `profile.company_id === "local-company"`, OU
- `profile.id === "local-admin"` ou começava com `"local-"`

Nesses casos, **todos** os CRUD de pedidos, itens, linhas e programação iam para localStorage.

---

## 2. O que foi alterado

### 2.1 Nova lógica de modo

- **`isLocal`** agora significa **apenas** `!supabase` (Supabase não configurado).
- Quando Supabase existe, **sempre** usa o banco para dados operacionais.
- Perfil "local" (admin@local) com Supabase configurado: usa o hook `useEffectiveCompanyId` para obter a primeira empresa do banco e trabalhar com ela.

### 2.2 Hook `useEffectiveCompanyId`

- **Arquivo:** `src/lib/hooks/use-effective-company.ts`
- Quando `profile.company_id === "local-company"` e Supabase existe, busca a primeira empresa em `companies` e retorna seu `id`.
- Permite que usuários com auth local (admin@local) usem os dados já importados no Supabase.

### 2.3 Arquivos modificados

| Arquivo | Alterações |
|---------|------------|
| `src/lib/hooks/use-effective-company.ts` | **Novo** – hook para company_id efetivo |
| `src/app/(dashboard)/pedidos/page.tsx` | Remove branches localStorage; usa effectiveCompanyId; Supabase sempre |
| `src/app/(dashboard)/linha/[id]/page.tsx` | Remove branches localStorage; usa effectiveCompanyId |
| `src/app/(dashboard)/dashboard/page.tsx` | Remove branches localStorage; usa effectiveCompanyId; carrega orders com items |
| `src/app/(dashboard)/configuracoes/linhas/page.tsx` | Remove loadLocalLines/saveLocalLines; usa effectiveCompanyId |
| `src/app/(dashboard)/configuracoes/feriados/page.tsx` | Remove loadLocalHolidays/saveLocalHolidays; usa effectiveCompanyId |
| `src/app/(dashboard)/configuracoes/empresa/page.tsx` | Remove loadLocalCompany/saveLocalCompany; usa effectiveCompanyId |
| `src/app/(dashboard)/configuracoes/page.tsx` | "Zerar pedidos" agora deleta no Supabase (por company_id) |
| `src/app/(dashboard)/importar/page.tsx` | Remove importOnePdfLocal; envia company_id para API; API salva no Supabase |
| `src/components/layout/dashboard-shell.tsx` | Remove branches localStorage; usa effectiveCompanyId; contagem de itens via Supabase |
| `src/app/api/import-pdf/route.ts` | Quando local auth + Supabase: salva no banco (admin client); aceita company_id no form; ou busca primeira empresa |

### 2.4 O que permanece no localStorage

- **`pcp-local-profile`** – perfil do usuário logado (auth local)
- **`pcp-local-profile`** criado no login local (admin@local)
- **Cookie `pcp-local-auth`** – usado pelo middleware para auth local

Esses são usados apenas para **autenticação** em ambiente local, não para dados operacionais.

---

## 3. Como testar

### 3.1 Pré-requisitos

- Supabase configurado (`.env` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- Backup já importado (empresa, linhas, pedidos, itens no Supabase)

### 3.2 Teste 1: Criar pedido em um navegador

1. Abra o app no **Chrome** (ou Edge).
2. Faça login com admin@local / 123456 (ou acesse `/login.html`).
3. Vá em **Pedidos** → **Novo Pedido**.
4. Crie um pedido com número, cliente e itens.
5. Salve.

### 3.3 Teste 2: Ver em outro navegador

1. Abra o app no **Edge** (ou outro navegador).
2. Faça login com admin@local / 123456.
3. Vá em **Pedidos**.
4. **Confirme:** o pedido criado no Chrome aparece.

### 3.4 Teste 3: Ver em outro PC

1. Em outro computador na mesma rede, acesse o app (ex.: `http://IP-DO-SERVIDOR:3000`).
2. Faça login com admin@local / 123456.
3. Vá em **Pedidos**.
4. **Confirme:** o pedido criado no primeiro PC aparece.

### 3.5 Teste 4: Programação

1. Em **Pedidos**, aloque um item a uma linha.
2. Vá em **Linha de Produção** (nome da linha).
3. Defina datas de início e fim para o item.
4. Marque como concluído.

5. Em outro navegador ou PC:
   - Abra a mesma linha.
   - **Confirme:** as datas e o status aparecem corretamente.

### 3.6 Teste 5: Importar PDF

1. Em **Importar PDFs**, envie um PDF de pedido.
2. **Confirme:** pedido aparece em **Pedidos**.
3. Em outro navegador ou PC:
   - **Confirme:** o pedido importado aparece.

### 3.7 Teste 6: Zerar pedidos

1. Em **Configurações** → **Zerar base de pedidos**.
2. Confirme a ação.
3. **Confirme:** todos os pedidos e itens são removidos do Supabase.
4. Em outro navegador ou PC:
   - **Confirme:** a lista de pedidos está vazia.

---

## 4. Resumo

| Antes | Depois |
|-------|--------|
| Pedidos, itens, linhas, programação em localStorage | Tudo no Supabase |
| Dados diferentes por navegador/PC | Dados iguais em qualquer lugar |
| `isLocal` = perfil local ou sem Supabase | `isLocal` = apenas sem Supabase |
| Importar PDF salvava no localStorage | Importar PDF salva no Supabase |
| Zerar pedidos = `removeItem("pcp-local-orders")` | Zerar pedidos = DELETE no Supabase |

**localStorage** continua sendo usado apenas para:
- `pcp-local-profile` (auth local)
- Preferências de interface (se houver)

---

## 5. Observações

- **Operadores locais:** usuários com `profile.id` começando com `local-` e sem `operator_lines` no Supabase usam `getOperatorLineIdsForLocalUser` (pcp-local-users). As linhas retornadas precisam existir no Supabase para que os dados apareçam.
- **Sem Supabase:** se `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` não estiverem configurados, o app mostra mensagem de aviso e não carrega dados operacionais.
