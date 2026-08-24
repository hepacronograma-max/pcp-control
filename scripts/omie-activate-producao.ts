/**
 * Ativação Omie em produção (one-shot):
 * 1. Vincula pcp_order_id no omie_order_links (pedido 260268)
 * 2. Roda importarPedidosDaFabricacao em OMIE_INTEGRATION_MODE=active
 *
 * Uso: npx tsx scripts/omie-activate-producao.ts
 * Requer .env.local com Supabase + Omie.
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local"), override: true });

process.env.OMIE_INTEGRATION_MODE = "active";

import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { importarPedidosDaFabricacao } from "../src/lib/omie/sync-service";

const OMIE_CODIGO_PEDIDO = 6925370521;
const ORDER_NUMBER = "260268";

async function main() {
  const supabase = createSupabaseAdminClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, company_id")
    .eq("order_number", ORDER_NUMBER)
    .maybeSingle();

  if (orderErr) throw new Error(orderErr.message);
  if (!order?.id) {
    throw new Error(`Pedido PCP ${ORDER_NUMBER} não encontrado`);
  }

  const { data: linkBefore } = await supabase
    .from("omie_order_links")
    .select("id, pcp_order_id, sync_status, omie_numero_pedido")
    .eq("omie_codigo_pedido", OMIE_CODIGO_PEDIDO)
    .maybeSingle();

  if (!linkBefore?.id) {
    throw new Error(
      `omie_order_links sem registro para omie_codigo_pedido=${OMIE_CODIGO_PEDIDO} — rode shadow/backfill antes`
    );
  }

  const { error: linkUpErr } = await supabase
    .from("omie_order_links")
    .update({
      pcp_order_id: order.id,
      sync_status: "synced",
      omie_numero_pedido: linkBefore.omie_numero_pedido ?? ORDER_NUMBER,
    })
    .eq("id", linkBefore.id);

  if (linkUpErr) throw new Error(`vínculo: ${linkUpErr.message}`);

  console.info("[activate] Vínculo OK:", {
    omie_codigo_pedido: OMIE_CODIGO_PEDIDO,
    pcp_order_id: order.id,
    order_number: ORDER_NUMBER,
    link_id: linkBefore.id,
    antes_pcp_order_id: linkBefore.pcp_order_id,
  });

  console.info("[activate] Iniciando importação Omie (active)...");
  const report = await importarPedidosDaFabricacao();

  console.info("[activate] Relatório:", JSON.stringify(report, null, 2));

  const { data: linkAfter } = await supabase
    .from("omie_order_links")
    .select("pcp_order_id, sync_status, last_synced_at")
    .eq("omie_codigo_pedido", OMIE_CODIGO_PEDIDO)
    .maybeSingle();

  console.info("[activate] Link pós-import:", linkAfter);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
