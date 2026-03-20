# Linha Almoxarifado

## O que o app faz hoje

- Ao carregar o painel (com login local + Supabase), a API tenta garantir **uma linha chamada “Almoxarifado”** por empresa, com `is_almoxarifado = true` (se a coluna existir).
- Ela recebe `sort_order` **antes** das demais linhas (valor menor que a menor `sort_order` existente), para aparecer no topo do menu e servir como referência de “abastecimento”.

## Abastecimento no dia do início da produção (implementado)

Quando alguém grava a programação na API (`POST /api/order-items/update`, ação `program`) para um item em uma linha **que não é almoxarifado**:

1. Só cria/atualiza espelho se existirem **início e fim** de produção (`production_start` e `production_end`). Com só uma das datas, o espelho é **removido** (datas limpas) se já existir.
2. A linha de destino é a do **menu Almoxarifado** que o cliente envia em `target_almox_line_id` (derivada de `allLines` na tela da linha). Se não vier, cai no fallback: primeira linha com `is_almoxarifado` ou nome contendo “almox”.
3. Cria ou atualiza um **item espelho** nessa linha, no **mesmo pedido**, com:
   - `production_start` e `production_end` no almox = **o mesmo dia** do `production_start` da linha de produção (abastecer no dia em que a linha começa);
   - `status` = `scheduled`;
   - descrição `Abast.: …` e `notes` com `almox-src:<uuid-do-item-origem>` para idempotência.
4. Se **início ou fim** forem removidos, o espelho no almox tem as datas limpas e volta para `waiting`.

Itens que já estão **na** linha almoxarifado não disparam espelho (evita loop).

### Reconciliação ao abrir o Almoxarifado

Ao entrar na página da linha **Almoxarifado** (com login local), o app chama `POST /api/order-items/reconcile-almox` com o `lineId` da URL e cria/atualiza espelhos **nessa** linha para itens nas outras linhas que já tenham **início e fim** programados.

**Obs.:** Quem salvar programação **só pelo cliente Supabase no browser** (sem cookie local / sem API) não passa por essa lógica; o fluxo recomendado é login local em produção, que já usa a API.

## Banco

Execute `supabase-add-columns.sql` para garantir `is_almoxarifado` em `production_lines` se ainda não existir.
