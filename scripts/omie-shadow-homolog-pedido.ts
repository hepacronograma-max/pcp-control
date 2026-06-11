/**
 * Homologação shadow Entrega 1.6 — casamento por pedido (somente leitura Omie + plan).
 * Não altera OMIE_INTEGRATION_MODE nem escreve no banco (modo shadow).
 *
 * Uso:
 *   npx tsx scripts/omie-shadow-homolog-pedido.ts --numero=260268
 *   npx tsx scripts/omie-shadow-homolog-pedido.ts --codigo=6925370521
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { OmieClient } from "../src/lib/omie/client";
import {
  isOrderClosedForOmieAdds,
  planItemSync,
  type PcpItemRow,
} from "../src/lib/omie/incremental-sync";
import { mapOmiePedidoToPcp } from "../src/lib/omie/mapper";
import { getOmieCompanyId } from "../src/lib/omie/sync-service";

function arg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

async function main() {
  const numero = arg("numero");
  const codigoArg = arg("codigo");
  if (!numero && !codigoArg) {
    console.error("Informe --numero=260268 ou --codigo=6925370521");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  const client = new OmieClient();
  client.assertConfigured();
  const companyId = getOmieCompanyId();

  let omieCodigo = codigoArg ? Number(codigoArg) : undefined;
  let orderNumber = numero;

  if (!omieCodigo) {
    const { data: link } = await supabase
      .from("omie_order_links")
      .select("omie_codigo_pedido, omie_numero_pedido, pcp_order_id")
      .eq("omie_numero_pedido", numero!)
      .maybeSingle();
    if (link?.omie_codigo_pedido) {
      omieCodigo = link.omie_codigo_pedido as number;
      orderNumber = String(link.omie_numero_pedido ?? numero);
    }
  }

  if (!omieCodigo) {
    console.error("omie_codigo_pedido não encontrado — use --codigo= ou vincule omie_order_links");
    process.exit(1);
  }

  const full = await client.consultarPedido(omieCodigo);
  const draft = mapOmiePedidoToPcp(full, companyId);
  orderNumber = orderNumber ?? draft.orderNumber;

  let pcpOrderId: string | null = null;
  const { data: linkByCodigo } = await supabase
    .from("omie_order_links")
    .select("pcp_order_id")
    .eq("omie_codigo_pedido", omieCodigo)
    .maybeSingle();
  pcpOrderId = (linkByCodigo?.pcp_order_id as string | null) ?? null;

  if (!pcpOrderId && orderNumber) {
    const { data: ord } = await supabase
      .from("orders")
      .select("id")
      .eq("order_number", orderNumber)
      .maybeSingle();
    pcpOrderId = (ord?.id as string) ?? null;
    if (pcpOrderId && !linkByCodigo?.pcp_order_id) {
      console.warn(
        `[aviso] omie_order_links.pcp_order_id NULL — usando pedido PCP ${pcpOrderId} por order_number (sync real exige vínculo)`
      );
    }
  }

  let existingItems: PcpItemRow[] = [];
  let orderStatus: string | null = null;
  if (pcpOrderId) {
    const { data: items, error } = await supabase
      .from("order_items")
      .select(
        "id, order_id, description, quantity, product_code, omie_codigo_item, omie_sync_flag, line_id, production_start, production_end, status, completed_at, almox_supplied_at"
      )
      .eq("order_id", pcpOrderId);
    if (error) throw new Error(error.message);
    existingItems = (items ?? []) as PcpItemRow[];

    const { data: orderRow } = await supabase
      .from("orders")
      .select("status")
      .eq("id", pcpOrderId)
      .maybeSingle();
    orderStatus = (orderRow?.status as string) ?? null;
  } else {
    console.warn("[aviso] Nenhum pedido PCP encontrado — plano sem linhas PCP");
  }

  const orderClosed = isOrderClosedForOmieAdds(orderStatus, existingItems);
  const plan = planItemSync(existingItems, draft.items, "shadow", {
    orderClosed,
    orderNumber,
  });

  console.log("\n=== Homologação shadow Entrega 1.6 ===");
  console.log({
    omie_codigo_pedido: omieCodigo,
    order_number: orderNumber,
    pcp_order_id: pcpOrderId,
    order_closed: orderClosed,
    itens_omie: draft.items.length,
    itens_pcp: existingItems.length,
  });
  console.log("\n--- Resumo casamento ---");
  console.log(JSON.stringify(plan.stats, null, 2));
  console.log("\n--- Primeiros 5 shadow logs ---");
  for (const log of plan.shadowLogs.slice(0, 5)) {
    console.log(log);
  }
  if (plan.shadowLogs.length > 5) {
    console.log(`... +${plan.shadowLogs.length - 5} logs`);
  }

  const ok =
    plan.stats.itens_adicionados === 0 &&
    plan.stats.itens_marcados_removido_no_omie === 0 &&
    plan.stats.itens_qty_atualizados === 0 &&
    plan.stats.casados_fallback_identico +
      plan.stats.casados_fallback_ordem +
      plan.stats.casados_chave_forte ===
      14 &&
    plan.stats.omie_codigo_item_preenchidos === 14;
  console.log("\n--- Critérios 260268 ---");
  console.log(
    `itens_adicionados=0: ${plan.stats.itens_adicionados === 0 ? "OK" : "FALHOU"}`
  );
  console.log(
    `removido_no_omie=0: ${plan.stats.itens_marcados_removido_no_omie === 0 ? "OK" : "FALHOU"}`
  );
  console.log(
    `omie_codigo_item_preenchidos=14: ${plan.stats.omie_codigo_item_preenchidos === 14 ? "OK" : "FALHOU"}`
  );
  console.log(
    `casamento 14: ${plan.stats.casados_fallback_identico + plan.stats.casados_fallback_ordem + plan.stats.casados_chave_forte === 14 ? "OK" : "FALHOU"} (${plan.stats.casados_fallback_identico} idêntico + ${plan.stats.casados_fallback_ordem} ordem)`
  );
  console.log(
    `itens_qty_atualizados=0: ${plan.stats.itens_qty_atualizados === 0 ? "OK" : "FALHOU"}`
  );
  console.log(
    `itens_qty_divergentes_alertados>=13: ${plan.stats.itens_qty_divergentes_alertados >= 13 ? "OK" : "FALHOU"} (${plan.stats.itens_qty_divergentes_alertados})`
  );
  console.log(`\nResultado geral → ${ok ? "OK" : "FALHOU"}`);
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
