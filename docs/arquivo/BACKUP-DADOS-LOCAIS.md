# Backup e Recuperação dos Dados Locais — PCP Control

**Fase 2 — Preservação de dados no navegador**  
**Data:** 19/03/2025  
**Objetivo:** Exportar dados do localStorage sem alterar a aplicação.

---

## BLOCO A — MAPEAMENTO DOS DADOS LOCAIS

### 1. Chave: `pcp-local-orders`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **Estrutura** | `Array` de objetos | Sim | Lista de pedidos com itens aninhados |
| **Relação** | Cada pedido contém `items: OrderItem[]` | — | Itens embutidos no pedido |

**Campos do pedido (Order):**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| id | string | Sim | Identificador único (UUID ou gerado) |
| company_id | string | Sim | ID da empresa (ex: "local-company") |
| order_number | string | Sim | Número do pedido |
| client_name | string | Sim | Nome do cliente |
| delivery_deadline | string \| null | Sim | Prazo de entrega (YYYY-MM-DD) |
| pcp_deadline | string \| null | Sim | Prazo PCP |
| production_deadline | string \| null | Sim | Prazo de produção (derivado dos itens) |
| status | string | Sim | imported, planning, in_production, ready, finished, delayed |
| pdf_path | string \| null | Não | Caminho do PDF |
| folder_path | string \| null | Não | Pasta do pedido |
| notes | string \| null | Não | Observações |
| created_at | string | Sim | ISO 8601 |
| updated_at | string | Sim | ISO 8601 |
| finished_at | string \| null | Sim | Data de finalização |
| created_by | string \| null | Não | ID do usuário criador |
| **items** | OrderItem[] | Sim | Itens do pedido (programação embutida) |

**Campos do item (OrderItem) — dentro de `order.items`:**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| id | string | Sim | Identificador único |
| order_id | string | Sim | Referência ao pedido |
| item_number | number | Sim | Número do item |
| description | string | Sim | Descrição |
| quantity | number | Sim | Quantidade |
| line_id | string \| null | Sim | Linha de produção |
| pcp_deadline | string \| null | Sim | Prazo PCP |
| production_start | string \| null | **Sim** | Início da programação |
| production_end | string \| null | **Sim** | Fim da programação |
| status | string | Sim | waiting, scheduled, completed, delayed |
| completed_at | string \| null | Não | Data de conclusão |
| completed_by | string \| null | Não | Quem concluiu |
| notes | string \| null | Não | Observações |
| supplied_at | string \| null | Não | Data de fornecimento (almoxarifado) |
| created_at | string | Sim | ISO 8601 |
| updated_at | string | Sim | ISO 8601 |

**Relações:** `order_id` → pedido pai; `line_id` → linha em `pcp-local-lines`.

---

### 2. Chave: `pcp-local-lines`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **Estrutura** | `Array` de objetos | Sim | Linhas de produção |

**Campos (ProductionLine):**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| id | string | Sim | Identificador único |
| company_id | string | Sim | ID da empresa |
| name | string | Sim | Nome da linha |
| is_active | boolean | Sim | Se está ativa |
| is_almoxarifado | boolean | Não | Se é almoxarifado |
| sort_order | number | Sim | Ordem de exibição |
| created_at | string | Sim | ISO 8601 |
| updated_at | string | Sim | ISO 8601 |

**Relações:** Referenciada por `order_items.line_id` e `users.line_ids`.

---

### 3. Chave: `pcp-local-company`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **Estrutura** | `Object` | Sim | Dados da empresa (formulário) |

**Campos (CompanyForm — estrutura simplificada):**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| name | string | Sim | Nome da empresa |
| orders_path | string | Não | Pasta matriz para PDFs |
| logo_url | string \| null | Não | URL do logo ou Data URL (base64) |

**Nota:** Não contém `id` — o ID da empresa em modo local é fixo: `local-company`. O profile referencia esse ID.

---

### 4. Chave: `pcp-local-profile`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **Estrutura** | `Object` | Sim | Perfil do usuário logado |

**Campos (Profile):**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| id | string | Sim | local-admin ou local-{timestamp}-{random} |
| company_id | string \| null | Sim | local-company ou ID da empresa |
| full_name | string | Sim | Nome completo |
| email | string | Sim | Email |
| role | string | Sim | super_admin, manager, pcp, operator |
| is_active | boolean | Sim | Se está ativo |
| created_at | string | Sim | ISO 8601 |
| updated_at | string | Sim | ISO 8601 |

---

### 5. Chave: `pcp-local-users`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **Estrutura** | `Array` de objetos | Sim | Usuários locais (inclui senha) |

**Campos (LocalUser = Profile + extras):**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| id | string | Sim | local-{timestamp}-{random} |
| company_id | string | Sim | ID da empresa |
| full_name | string | Sim | Nome completo |
| email | string | Sim | Email |
| password | string | **Sim** | Senha em texto plano |
| role | string | Sim | pcp ou operator |
| is_active | boolean | Sim | Se está ativo |
| created_at | string | Sim | ISO 8601 |
| updated_at | string | Sim | ISO 8601 |
| line_ids | string[] | Sim | IDs das linhas (operadores) |

**Relações:** `line_ids` → referência a `pcp-local-lines`.

---

### 6. Chave: `pcp-local-holidays`

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| **Estrutura** | `Array` de objetos | Sim | Feriados |

**Campos (Holiday):**

| Campo | Tipo | Crítico | Descrição |
|-------|------|---------|-----------|
| id | string | Sim | UUID ou holiday-{timestamp} |
| company_id | string | Sim | ID da empresa |
| date | string | Sim | YYYY-MM-DD |
| description | string | Sim | Descrição |
| is_recurring | boolean | Sim | Se é anual |
| created_at | string | Sim | ISO 8601 |

---

### Diagrama de relações

```
profile.company_id ──► company (id fixo: local-company)
     │
     └── users[].company_id ──► mesma empresa

orders[].company_id ──► local-company
orders[].items[].line_id ──► lines[].id
users[].line_ids[] ──► lines[].id
holidays[].company_id ──► local-company
```

---

## BLOCO B — SCRIPT DE EXPORTAÇÃO

O script `export-local-data.js` deve ser executado no **Console do navegador** (F12 → Console) enquanto a aplicação está aberta na mesma aba/origem.

**Estrutura do JSON exportado:**

```json
{
  "exportedAt": "2025-03-19T12:00:00.000Z",
  "origin": "http://localhost:3000",
  "version": "1.0",
  "orders": [...],
  "lines": [...],
  "company": {...},
  "profile": {...},
  "users": [...],
  "holidays": [...],
  "_validation": {
    "ordersCount": 10,
    "itemsCount": 45,
    "itemsWithProgramacao": 12,
    "linesCount": 3,
    "usersCount": 2,
    "holidaysCount": 8,
    "warnings": [],
    "errors": []
  }
}
```

**Uso:** Copie o conteúdo de `export-local-data.js` e cole no Console. O script irá:
1. Ler todas as chaves
2. Validar os dados
3. Exibir resumo no console
4. Oferecer download do arquivo JSON

---

## BLOCO C — VALIDAÇÃO DO BACKUP

A rotina de validação verifica:

| Verificação | Descrição |
|-------------|-----------|
| Quantidade de pedidos | Total de objetos em `orders` |
| Quantidade de itens | Soma de `order.items.length` |
| Quantidade de linhas | Total em `lines` |
| Quantidade de usuários | Total em `users` |
| Quantidade de feriados | Total em `holidays` |
| Campos obrigatórios | Pedido: id, company_id, order_number, client_name, status; Item: id, order_id, description, quantity |
| Estrutura inconsistente | Itens sem order_id válido, line_id sem linha correspondente |
| Programação embutida | Itens com production_start, production_end, status scheduled/completed |

**Saída esperada no console:**
- Resumo numérico
- Lista de avisos (ex.: campo ausente)
- Lista de erros (ex.: referência quebrada)

---

## BLOCO D — PREPARAÇÃO PARA MIGRAÇÃO FUTURA

### Tabelas Supabase que receberão os dados

| Tabela | Origem local | Observação |
|-------|--------------|------------|
| companies | pcp-local-company | Criar registro com id fixo ou UUID; company_id em orders/users/holidays |
| production_lines | pcp-local-lines | Inserir com company_id da empresa criada |
| orders | pcp-local-orders | Separar pedido dos itens |
| order_items | pcp-local-orders[].items | Inserir com order_id do pedido criado |
| profiles | pcp-local-users + pcp-local-profile | Senha: usar Supabase Auth ou hash |
| operator_lines | pcp-local-users[].line_ids | Tabela de junção user_id ↔ line_id |
| holidays | pcp-local-holidays | Inserir com company_id |

### Ordem de importação (dependências)

1. **companies** — primeiro (orders, lines, users, holidays dependem)
2. **production_lines** — segundo (order_items.line_id, operator_lines.line_id)
3. **orders** — terceiro (order_items.order_id)
4. **order_items** — quarto (depende de orders e production_lines)
5. **profiles** — criar usuários no Supabase Auth; tabela profiles preenchida pelo trigger ou manualmente
6. **operator_lines** — após profiles e production_lines
7. **holidays** — após companies

### Tratamento de IDs locais

| Entidade | ID local | Estratégia na migração |
|----------|----------|------------------------|
| Pedido | UUID/crypto.randomUUID | Manter ou gerar novo UUID no Supabase |
| Item | UUID | Manter order_id referenciando o pedido migrado |
| Linha | UUID ou line-{timestamp} | Manter ou gerar novo; atualizar line_id nos itens |
| Usuário | local-{timestamp}-{random} | Criar no Supabase Auth; mapear id antigo → id novo |
| Feriado | UUID ou holiday-{timestamp} | Gerar novo no Supabase |
| Empresa | local-company | Criar company no Supabase; usar id retornado |

### Evitar duplicação

- **Pedidos:** Verificar por `company_id` + `order_number` antes de inserir.
- **Linhas:** Verificar por `company_id` + `name`.
- **Feriados:** Verificar por `company_id` + `date`.
- **Usuários:** Verificar por `email` na tabela de autenticação.

### Campos sensíveis

- **password** em users: não migrar em texto plano. Criar usuário no Supabase Auth com senha definida ou fluxo de redefinição.

---

## INSTRUÇÕES DE USO

### Para o usuário final (checklist simplificado)

1. Abra o PCP Control no navegador onde você costuma usar o sistema.
2. Faça login normalmente (admin@local ou seu usuário).
3. Pressione **F12** para abrir as ferramentas do desenvolvedor.
4. Clique na aba **Console**.
5. Abra o arquivo `export-local-data.js` em um editor de texto.
6. Copie **todo** o conteúdo do arquivo (Ctrl+A, Ctrl+C).
7. Cole no Console do navegador (Ctrl+V).
8. Pressione **Enter**.
9. Aguarde a mensagem de sucesso e o download do arquivo.
10. Guarde o arquivo em local seguro (ex.: pasta de backup, pendrive).
11. Repita em **cada navegador** onde você usa o sistema (Edge, Chrome, etc.).

### Para desenvolvedores

- Em desenvolvimento, você pode acessar `window.__pcpExportLocalData()` se o utilitário de debug estiver ativo.
- O script pode ser carregado como bookmarklet ou salvo e executado via Console.

---

## ARQUIVOS DESTA FASE

| Arquivo | Descrição |
|---------|-----------|
| `BACKUP-DADOS-LOCAIS.md` | Este documento — mapeamento, instruções e plano de migração |
| `export-local-data.js` | Script para executar no Console do navegador |
| `import-backup-to-supabase.js` | Script Node.js para importar o backup no Supabase |
| `CHECKLIST-BACKUP-MANUAL.md` | Checklist passo a passo para o usuário final |
| `src/lib/utils/backup-debug.ts` | Utilitário de debug (uso programático em desenvolvimento) |

### Importar backup no Supabase

1. Configure as variáveis no início de `import-backup-to-supabase.js` ou use:
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (variáveis de ambiente)
   - `TARGET_COMPANY_ID` (opcional) — ID da empresa no Supabase se o backup usa "local-company"
2. Coloque o arquivo de backup (ex: `pcp-backup-2025-03-19.json`) na pasta do projeto
3. Execute: `node import-backup-to-supabase.js backup.json` ou `npm run import-backup`

---

*Documento gerado na Fase 2. Nenhuma alteração na lógica principal da aplicação.*
