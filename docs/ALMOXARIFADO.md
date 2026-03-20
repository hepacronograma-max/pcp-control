# Linha Almoxarifado

## O que o app faz hoje

- Ao carregar o painel (com login local + Supabase), a API tenta garantir **uma linha chamada “Almoxarifado”** por empresa, com `is_almoxarifado = true` (se a coluna existir).
- Ela recebe `sort_order` **antes** das demais linhas (valor menor que a menor `sort_order` existente), para aparecer no topo do menu e servir como referência de “abastecimento”.

## Sequência automática de datas (regra de negócio)

Você descreveu o fluxo desejado:

1. Cada **linha de produção** tem data de **início** programada.
2. O **almoxarifado** deve receber, **em sequência**, janelas que **antecipam** esses inícios, para abastecer as linhas na ordem certa.

Isso **ainda não está automatizado** no código, porque depende de decisões:

- Há **um item por pedido** na linha Almoxarifado ou vários (um por linha de destino)?
- Quantos **dias/horas** antes de cada `production_start` o almox deve “cortar” ou separar material?
- Feriados e **pc_delivery_date** entram na conta?

Próximo passo sugerido: definir essas regras e então implementar no `POST /api/order-items/update` (ação `program`) ou num job ao salvar o Gantt: após atualizar `production_start` nos itens **não**-almox, recalcular e gravar `production_start` / `production_end` nos itens da linha Almoxarifado do **mesmo pedido**.

## Banco

Execute `supabase-add-columns.sql` para garantir `is_almoxarifado` em `production_lines` se ainda não existir.
