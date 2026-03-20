# Linha Almoxarifado

## O que o app faz hoje

- Ao carregar o painel (com login local + Supabase), a API tenta garantir **uma linha chamada “Almoxarifado”** por empresa, com `is_almoxarifado = true` (se a coluna existir).
- Ela recebe `sort_order` **antes** das demais linhas (valor menor que a menor `sort_order` existente), para aparecer no topo do menu e servir como referência de “abastecimento”.

## Abastecimento no dia do início da produção (implementado)

Quando alguém grava a programação na API (`POST /api/order-items/update`, ação `program`) para um item em uma linha **que não é almoxarifado**:

1. O sistema localiza a linha de **Almoxarifado** da empresa (`is_almoxarifado` ou nome contendo “almox”).
2. Cria ou atualiza um **item espelho** nessa linha, no **mesmo pedido**, com:
   - `production_start` e `production_end` = **o mesmo dia** do `production_start` da linha de produção;
   - `status` = `scheduled`;
   - descrição `Abast.: …` e `notes` com `almox-src:<uuid-do-item-origem>` para idempotência.
3. Se o início da produção for **removido** (data vazia), o espelho no almox tem as datas limpas e volta para `waiting`.

Itens que já estão **na** linha almoxarifado não disparam espelho (evita loop).

### Reconciliação ao abrir o Almoxarifado

Ao entrar na página da linha **Almoxarifado** (com login local), o app chama `POST /api/order-items/reconcile-almox` e cria/atualiza espelhos para **todos** os itens já programados nas outras linhas — útil se a programação foi feita antes do sync existir ou se houve falha silenciosa.

**Obs.:** Quem salvar programação **só pelo cliente Supabase no browser** (sem cookie local / sem API) não passa por essa lógica; o fluxo recomendado é login local em produção, que já usa a API.

## Banco

Execute `supabase-add-columns.sql` para garantir `is_almoxarifado` em `production_lines` se ainda não existir.
