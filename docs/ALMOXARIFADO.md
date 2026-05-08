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

O `GET /api/line-data` (login local), ao carregar uma linha que é almox (nome com “almox”, flag `is_almoxarifado`, ou UUID igual ao resolvido pela empresa), **reconcilia no servidor antes** de devolver os itens — não depende mais só de um POST extra no navegador.

Opcional: `POST /api/order-items/reconcile-almox` com `lineId` continua disponível para forçar reconciliação.

**Obs.:** Quem salvar programação **só pelo cliente Supabase no browser** (sem cookie local / sem API) não passa por essa lógica; o fluxo recomendado é login local em produção, que já usa a API.

### Sincronização automática Produção ↔ Almox (painel lista agregada)

Na tabela **real** (linha de chão), quando `production_end` é preenchido pela API (`POST /api/order-items/update`, `program`) ou pela ação **`complete`**:

- O sistema atualiza `almox_supplied_at` (timestamptz alinhado à data do fim) e marca `almox_supplied_auto = true` quando a migração existir (`supabase-add-columns.sql`).
- `almox_supplied_by` só é gravado quando o ID é um UUID válido em `auth.users` (ex.: perfil Supabase).

**Listagem Almox («Em aberto» / período)** só inclui itens com `production_start` no intervalo, `production_end IS NULL`, `almox_supplied_at IS NULL`. Itens com produção já finalizada **somem das listagens** (o vínculo fica apenas nos registros brutos por SQL/relatórios).

Quem marca **manualmente** o ✓ antes do fim do chão aparece na aba **«Finalizados»** até a produção encerrar; `almox_supplied_auto = false`. Se **apagar** o `production_end`, o Almox só **reverte** data de abastecimento automático (se `almox_supplied_auto`); uma marcação manual permanece até ser alterada pela equipe/API.

## Banco

Execute `supabase-add-columns.sql` para garantir `is_almoxarifado` em `production_lines` se ainda não existir **e** a coluna `almox_supplied_auto` em `order_items`.

