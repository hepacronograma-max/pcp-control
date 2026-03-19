# RELATÓRIO DE AUDITORIA — Persistência Local vs Supabase

**Projeto:** PCP Control  
**Data:** 19/03/2025  
**Objetivo:** Identificar persistência local indevida e mapear fluxo de dados operacionais  
**Regra:** Nenhuma alteração foi feita no código — apenas auditoria e diagnóstico.

---

## RESUMO EXECUTIVO

### Problema principal identificado

O aplicativo possui **dois modos de operação** que coexistem:

1. **Modo Supabase** — quando `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` estão configurados e o usuário está autenticado via Supabase Auth.
2. **Modo Local** — quando Supabase não está configurado **ou** quando o perfil do usuário tem `company_id === "local-company"` ou `id === "local-admin"` ou `id.startsWith("local-")`.

**No modo local, todos os dados operacionais críticos são persistidos exclusivamente em `localStorage` do navegador.** Isso explica perfeitamente os sintomas observados:

- **Edge vs Chrome com dados diferentes** → `localStorage` é isolado por navegador (cada um tem seu próprio armazenamento).
- **Outro PC aparece vazio** → `localStorage` é isolado por máquina e por origem.
- **Risco de dados presos no navegador** → Confirmado. Pedidos, itens, linhas, empresa, feriados e usuários podem existir apenas no dispositivo do usuário.

### Causa raiz

A lógica de detecção de modo local está em múltiplos arquivos:

```javascript
const isLocal =
  !supabase ||
  profile?.company_id === "local-company" ||
  profile?.id === "local-admin" ||
  profile?.id?.startsWith("local-");
```

Quando `isLocal === true`, **nenhuma operação CRUD vai ao Supabase**. Tudo é lido e gravado em `localStorage`.

### Cenários que ativam o modo local

1. **Variáveis de ambiente ausentes ou inválidas** — `createClient()` retorna `null` → modo local.
2. **Login com admin@local / 123456** — define perfil com `company_id: "local-company"` e `id: "local-admin"` → modo local.
3. **Login com usuário cadastrado localmente** — perfil com `id` começando em `local-` → modo local.
4. **Acesso em localhost com cookie `pcp-local-auth=1`** — `use-user.ts` prioriza perfil do `localStorage` mesmo que Supabase exista.

---

## A. MAPEAMENTO DE PERSISTÊNCIA LOCAL

### Chaves utilizadas no localStorage

| Chave | Dados | Crítico? | Arquivos |
|-------|-------|----------|----------|
| `pcp-local-orders` | Pedidos + itens (ordens completas) | **SIM** | dashboard-shell, pedidos, linha/[id], importar, configuracoes/linhas, configuracoes |
| `pcp-local-lines` | Linhas de produção | **SIM** | dashboard-shell, linha/[id], configuracoes/linhas, configuracoes/usuarios |
| `pcp-local-company` | Dados da empresa (nome, logo, orders_path) | **SIM** | dashboard-shell, importar, configuracoes/empresa |
| `pcp-local-profile` | Perfil do usuário logado | **SIM** (autenticação) | use-user, login.html, dashboard-shell (remove no logout) |
| `pcp-local-users` | Usuários locais (PCP, operadores) | **SIM** | local-users.ts, login.html, configuracoes/usuarios |
| `pcp-local-holidays` | Feriados | **SIM** | configuracoes/feriados |

### Detalhamento por arquivo e função

#### 1. `src/components/layout/dashboard-shell.tsx`

| Função/Contexto | Trecho | Dados | Crítico? |
|----------------|--------|-------|----------|
| useEffect (loadData) | `window.localStorage.getItem("pcp-local-company")` | Empresa | SIM |
| useEffect (loadData) | `window.localStorage.getItem("pcp-local-lines")` | Linhas | SIM |
| useEffect (loadData) | `window.localStorage.setItem("pcp-local-lines", ...)` | Linhas (adiciona almoxarifado) | SIM |
| useEffect (loadData) | `window.localStorage.getItem("pcp-local-orders")` | Pedidos (contagem) | SIM |
| useEffect (refreshCounts) | `window.localStorage.getItem("pcp-local-orders")` | Pedidos | SIM |
| handleLogout | `window.localStorage.removeItem("pcp-local-profile")` | Perfil | SIM |

#### 2. `src/app/(dashboard)/pedidos/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| updateOrdersState | `window.localStorage.setItem("pcp-local-orders", ...)` | Pedidos + itens | SIM |
| loadData (useEffect) | `window.localStorage.getItem("pcp-local-orders")` | Pedidos | SIM |
| loadData (useEffect) | `window.localStorage.getItem("pcp-local-lines")` | Linhas | SIM |

#### 3. `src/app/(dashboard)/linha/[id]/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| checkAccessAndLoad | `window.localStorage.getItem("pcp-local-lines")` | Linhas | SIM |
| checkAccessAndLoad | `window.localStorage.getItem("pcp-local-orders")` | Pedidos | SIM |
| handleChangeDate | `window.localStorage.setItem("pcp-local-orders", ...)` | Programação (production_start/end) | SIM |
| handleChangeNotes | `window.localStorage.setItem("pcp-local-orders", ...)` | Notas de itens | SIM |
| handleComplete | `window.localStorage.setItem("pcp-local-orders", ...)` | Status completed | SIM |
| handleSupply | `window.localStorage.setItem("pcp-local-orders", ...)` | supplied_at (almoxarifado) | SIM |

#### 4. `src/app/(dashboard)/dashboard/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| loadData | `window.localStorage.getItem("pcp-local-orders")` | Pedidos | SIM |
| loadData | `window.localStorage.getItem("pcp-local-lines")` | Linhas | SIM |

#### 5. `src/app/(dashboard)/importar/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| importOnePdfLocal | `window.localStorage.getItem("pcp-local-orders")` | Pedidos existentes | SIM |
| importOnePdfLocal | `window.localStorage.setItem("pcp-local-orders", ...)` | Novo pedido importado | SIM |
| processOnePdf | `window.localStorage.getItem("pcp-local-company")` | Pasta matriz | SIM |

#### 6. `src/app/(dashboard)/configuracoes/linhas/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| loadLocalLines | `window.localStorage.getItem(LOCAL_LINES_KEY)` | Linhas | SIM |
| saveLocalLines | `window.localStorage.setItem(LOCAL_LINES_KEY, ...)` | Linhas | SIM |
| handleDelete | `window.localStorage.setItem("pcp-local-orders", ...)` | Atualiza line_id dos itens | SIM |

#### 7. `src/app/(dashboard)/configuracoes/empresa/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| loadLocalCompany | `window.localStorage.getItem(LOCAL_COMPANY_KEY)` | Empresa | SIM |
| saveLocalCompany | `window.localStorage.setItem(LOCAL_COMPANY_KEY, ...)` | Empresa | SIM |

#### 8. `src/app/(dashboard)/configuracoes/feriados/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| loadLocalHolidays | `window.localStorage.getItem(LOCAL_HOLIDAYS_KEY)` | Feriados | SIM |
| saveLocalHolidays | `window.localStorage.setItem(LOCAL_HOLIDAYS_KEY, ...)` | Feriados | SIM |

#### 9. `src/app/(dashboard)/configuracoes/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| handleClearOrders | `window.localStorage.removeItem("pcp-local-orders")` | Remove pedidos | SIM |

#### 10. `src/app/(dashboard)/configuracoes/usuarios/page.tsx`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| loadLocalLines | `window.localStorage.getItem(LOCAL_LINES_KEY)` | Linhas | SIM |

#### 11. `src/lib/local-users.ts`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| getLocalUsers | `window.localStorage.getItem(LOCAL_USERS_KEY)` | Usuários | SIM |
| setLocalUsers | `window.localStorage.setItem(LOCAL_USERS_KEY, ...)` | Usuários | SIM |

#### 12. `src/lib/hooks/use-user.ts`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| getProfile | `window.localStorage.getItem("pcp-local-profile")` | Perfil | SIM |
| getProfile | `window.localStorage.setItem("pcp-local-profile", ...)` | Perfil padrão | SIM |

#### 13. `public/login.html`

| Função | Trecho | Dados | Crítico? |
|--------|--------|-------|----------|
| findLocalUser | `localStorage.getItem('pcp-local-users')` | Usuários | SIM |
| setLocalProfile | `localStorage.setItem('pcp-local-profile', ...)` | Perfil | SIM |

### O que NÃO foi encontrado

- **sessionStorage** — não utilizado
- **IndexedDB** — não utilizado (o pacote `idb` aparece no lock como dependência transitiva, mas não é usado no código)
- **Zustand persist / Redux persist** — não utilizado
- **PWA cache de dados** — o `sw.js` é placeholder, não faz cache de dados
- **caches.open / service worker de dados** — não utilizado

---

## B. MAPEAMENTO DE CRUD REAL

### Pedidos

| Operação | Arquivo | Função | Modo Local | Modo Supabase |
|----------|---------|--------|-----------|---------------|
| **Criar** | pedidos/page.tsx | handleCreateOrder | localStorage | Supabase `orders` + `order_items` |
| **Ler** | pedidos/page.tsx | loadData | localStorage | Supabase `orders` + `order_items` |
| **Editar** | pedidos/page.tsx | handleUpdateOrder, handleUpdateOrderPcpDate, handleUpdateItemLine, handleUpdateItemQuantity | localStorage | Supabase |
| **Excluir** | pedidos/page.tsx | handleDeleteOrder | localStorage | Supabase |
| **Finalizar** | pedidos/page.tsx | handleFinishOrder | localStorage | Supabase |

### Itens

| Operação | Arquivo | Função | Modo Local | Modo Supabase |
|----------|---------|--------|-----------|---------------|
| **Alterar datas** | linha/[id]/page.tsx | handleChangeDate | localStorage | Supabase `order_items` |
| **Alterar notas** | linha/[id]/page.tsx | handleChangeNotes | localStorage | Supabase |
| **Concluir** | linha/[id]/page.tsx | handleComplete | localStorage | Supabase |
| **Fornecer (almox)** | linha/[id]/page.tsx | handleSupply | localStorage | Supabase |

### Linhas de produção

| Operação | Arquivo | Função | Modo Local | Modo Supabase |
|----------|---------|--------|-----------|---------------|
| **Criar** | configuracoes/linhas | handleCreateLine | localStorage | Supabase `production_lines` |
| **Editar** | configuracoes/linhas | handleRename, handleToggleActive, handleReorder | localStorage | Supabase |
| **Excluir** | configuracoes/linhas | handleDelete | localStorage + atualiza orders | Supabase |

### Programação de produção (cronograma)

A programação é representada pelos campos `production_start`, `production_end` e `status` nos itens. No modo local, tudo fica em `pcp-local-orders` (itens aninhados nos pedidos).

### Importação de PDF

| Operação | Arquivo | Modo Local | Modo Supabase |
|----------|---------|-----------|---------------|
| **Importar** | importar/page.tsx + api/import-pdf | API retorna dados → cliente salva em localStorage | API insere em Supabase |

A API `import-pdf` decide o destino com base em:
- `isLocalhost && hasLocalAuth` → retorna dados para o cliente salvar no localStorage
- `hasSupabase` e usuário autenticado → insere no Supabase

### Comportamento otimista

No modo Supabase, as funções fazem update otimista: atualizam o estado React imediatamente após a chamada ao Supabase, mas **não validam retorno de erro de forma consistente**. Em alguns casos, o `updateOrdersState` é chamado mesmo quando a operação Supabase pode ter falhado.

---

## C. MAPEAMENTO DE INTEGRAÇÃO COM SUPABASE

### Cliente Supabase

- **Arquivo:** `src/lib/supabase/client.ts`
- **Variáveis:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Comportamento:** Se URL ou KEY forem inválidos/ausentes, retorna `null` (não lança erro).

### Server Supabase

- **Arquivo:** `src/lib/supabase/server.ts`
- **Uso:** `createServerSupabaseClient()` — usado em `dashboard.ts` (queries do dashboard) e `import-pdf/route.ts`.

### Tabelas utilizadas

- `orders`
- `order_items`
- `production_lines`
- `companies`
- `profiles`
- `operator_lines`
- `holidays`

### Tratamento de erro

- Em geral, erros do Supabase são tratados com `if (error) throw error` ou `toast.error()`.
- **Problema:** Em várias operações, o estado React é atualizado antes de confirmar sucesso. Se a rede falhar após o `await supabase...`, o usuário pode ver dados que não foram persistidos.

### Dependência do retorno do banco

- As telas **assumem sucesso** na maioria dos casos. Não há refetch automático após falha para reverter o estado otimista.

---

## D. MAPEAMENTO DE CACHE E BUILD

### PWA e Service Worker

- **next-pwa** está configurado em `next.config.js`.
- **sw.js** em `public/` é um placeholder mínimo (apenas `skipWaiting` e `clients.claim`).
- **PWA desabilitado em desenvolvimento:** `disable: process.env.NODE_ENV === 'development'`.
- **Conclusão:** O service worker não faz cache de dados operacionais. O cache é de assets estáticos (Next.js + PWA). **Não explica** dados diferentes entre Edge e Chrome.

### Build

- Não há evidência de builds antigos servindo dados diferentes.
- O problema é **localStorage por origem/navegador**, não cache de build.

---

## E. MAPEAMENTO DE AUTENTICAÇÃO E RLS

### Fluxo de autenticação

1. **Login local (admin@local / 123456):** `login.html` define `pcp-local-profile` no localStorage e redireciona para `/entrar`, que seta cookie `pcp-local-auth=1`.
2. **Login com usuário local:** `findLocalUser` busca em `pcp-local-users`, define `pcp-local-profile` e redireciona para `/entrar`.
3. **Login Supabase:** `login.html` chama `/api/auth/local-login` — mas essa rota **só aceita admin@local/123456** e seta cookie local. Para Supabase Auth real, haveria outra rota (não mapeada nesta auditoria para login com email/senha do Supabase).

### Middleware

- Se Supabase não configurado **e** `hasLocalAuth` → permite acesso.
- Se `hasLocalAuth` → bypass da verificação Supabase Auth.
- Se Supabase configurado e usuário não autenticado → redireciona para login.

### RLS

- Não foi auditado o schema do Supabase. Assume-se que RLS pode restringir dados por `company_id` ou `user_id`.

### Sessão por navegador

- **Cookies** são por navegador (Edge ≠ Chrome).
- **localStorage** é por origem e por navegador.
- Se o usuário loga no Edge com admin@local, o Edge tem `pcp-local-auth` e `pcp-local-*` no localStorage.
- Se abre no Chrome sem ter logado, não tem cookie nem localStorage → pode ser redirecionado ao login ou ver tela vazia dependendo do fluxo.

---

## F. LISTA DE OPERAÇÕES QUE NÃO VÃO AO SUPABASE (quando isLocal)

| Operação | Quando ocorre |
|----------|----------------|
| Criar pedido | isLocal |
| Editar pedido | isLocal |
| Excluir pedido | isLocal |
| Finalizar pedido | isLocal |
| Atribuir linha a item | isLocal |
| Alterar quantidade do item | isLocal |
| Alterar prazo PCP | isLocal |
| Programar datas (production_start/end) | isLocal |
| Concluir item | isLocal |
| Fornecer item (almox) | isLocal |
| Alterar notas do item | isLocal |
| Criar/editar/excluir linhas | isLocal |
| Criar/editar/excluir feriados | isLocal |
| Salvar dados da empresa | isLocal |
| Criar/editar usuários locais | Sempre local (local-users.ts) |
| Importar PDF (quando API retorna savedToSupabase: false) | isLocal ou API em localhost+hasLocalAuth |

---

## G. RISCOS IMEDIATOS

1. **Perda total de dados** — Limpar dados do navegador, trocar de máquina ou de navegador implica perda de pedidos, itens, programação, linhas, empresa, feriados e usuários.
2. **Inconsistência entre dispositivos** — Dados criados em um navegador não aparecem em outro.
3. **Impossibilidade de auditoria** — Não há histórico centralizado; tudo fica na máquina do usuário.
4. **Botão "Zerar pedidos"** — Em `configuracoes/page.tsx` remove `pcp-local-orders` sem confirmação de backup.
5. **Logout** — Remove `pcp-local-profile` e cookie; os demais dados permanecem no localStorage (pedidos, linhas, etc.), mas sem perfil o usuário pode não conseguir acessar.

---

## H. ESTRATÉGIA SEGURA DE BACKUP

### Onde estão os dados locais

Exclusivamente em **localStorage**, nas chaves listadas na seção A.

### Método de exportação

1. Abrir o app no navegador onde os dados existem.
2. Abrir DevTools (F12) → aba **Application** (Chrome) ou **Storage** (Edge).
3. Em **Local Storage** → selecionar a origem do app (ex: `http://localhost:3000` ou a URL de produção).
4. Copiar manualmente o valor de cada chave `pcp-local-*` ou usar o script de backup (ver seção seguinte).

### Script de backup (a ser criado na Fase 2)

Um script que rode no console do navegador e exporte todas as chaves relevantes em um JSON estruturado, permitindo salvar em arquivo.

---

## I. ESTRATÉGIA DE CORREÇÃO COM MENOR RISCO

1. **Não alterar nada** até concluir backup dos dados existentes nos navegadores dos usuários.
2. **Criar script de exportação** e instruir usuários a executá-lo em cada navegador onde há dados.
3. **Garantir Supabase configurado** em produção com variáveis corretas.
4. **Remover ou restringir o modo local** em produção — ou mantê-lo apenas para desenvolvimento/demo explícito.
5. **Migrar dados exportados** para o Supabase antes de desativar o modo local.
6. **Corrigir leitura inicial** — sempre priorizar Supabase quando configurado.
7. **Corrigir gravação** — toda operação CRUD operacional deve ir ao Supabase quando o cliente existir.
8. **Manter localStorage apenas para** preferências de UI (tema, aba selecionada, etc.), nunca para dados operacionais.

---

## J. CONCLUSÃO

O aplicativo foi projetado para funcionar em dois modos: **com Supabase** (produção) e **sem Supabase** (local/demo). O modo local usa `localStorage` para todos os dados operacionais. Os sintomas descritos (Edge ≠ Chrome, outro PC vazio) são **exatamente** o comportamento esperado quando o app está rodando em modo local.

A prioridade é:
1. Confirmar se a produção está com Supabase configurado e se os usuários estão autenticados via Supabase (e não via admin@local).
2. Fazer backup de todos os dados que possam estar apenas no localStorage.
3. Migrar a arquitetura para que Supabase seja a única fonte de verdade em produção, e o modo local seja claramente isolado (ex.: apenas em localhost ou com flag explícita).

---

*Relatório gerado em 19/03/2025. Nenhuma alteração foi feita no código.*
