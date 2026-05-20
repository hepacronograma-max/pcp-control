/**
 * Remove pedidos da SMSV sem nenhum item com "FILTRO" na descrição
 * e remove explicitamente o pedido 260261 (Juliana).
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
  override: true,
});

const { createClient } = require("@supabase/supabase-js");

const COMPANY_ID = "5d10a119-bfca-48f8-a5e2-8ae063c17920";
const JULIANA_ORDER_NUMBER = "260261";
const FILTRO_RE = /filtro/i;
const DRY_RUN = process.argv.includes("--dry-run");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: orders, error: oErr } = await supabase
    .from("orders")
    .select("id, order_number, client_name")
    .eq("company_id", COMPANY_ID);
  if (oErr) throw oErr;

  const orderIds = orders.map((o) => o.id);
  const items = [];
  for (let i = 0; i < orderIds.length; i += 40) {
    const { data, error } = await supabase
      .from("order_items")
      .select("id, order_id, description")
      .in("order_id", orderIds.slice(i, i + 40));
    if (error) throw error;
    items.push(...(data ?? []));
  }

  const orderHasFiltro = new Set();
  for (const it of items) {
    if (FILTRO_RE.test(it.description ?? "")) orderHasFiltro.add(it.order_id);
  }

  const toDelete = orders.filter(
    (o) =>
      o.order_number === JULIANA_ORDER_NUMBER || !orderHasFiltro.has(o.id)
  );
  const deleteOrderIds = toDelete.map((o) => o.id);
  const deleteItemIds = items
    .filter((it) => deleteOrderIds.includes(it.order_id))
    .map((it) => it.id);

  console.log(DRY_RUN ? "=== DRY-RUN ===" : "=== DELETE ===");
  console.log("Pedidos a apagar:", deleteOrderIds.length);
  for (const o of toDelete) {
    console.log(" ", o.order_number, "-", (o.client_name ?? "").slice(0, 50));
  }
  console.log("Itens vinculados:", deleteItemIds.length);

  if (DRY_RUN) return;

  if (deleteItemIds.length) {
    for (let i = 0; i < deleteItemIds.length; i += 100) {
      const chunk = deleteItemIds.slice(i, i + 100);
      await supabase
        .from("purchase_order_item_links")
        .delete()
        .in("order_item_id", chunk);
    }
  }

  for (let i = 0; i < deleteOrderIds.length; i += 40) {
    const chunk = deleteOrderIds.slice(i, i + 40);
    await supabase
      .from("cq_registros")
      .delete()
      .eq("target_type", "order")
      .in("target_id", chunk);
    await supabase
      .from("cq_registros")
      .delete()
      .eq("target_type", "order_item")
      .in(
        "target_id",
        deleteItemIds.filter((id) => {
          const it = items.find((x) => x.id === id);
          return it && chunk.includes(it.order_id);
        })
      );
  }

  if (deleteItemIds.length) {
    for (let i = 0; i < deleteItemIds.length; i += 200) {
      const { error } = await supabase
        .from("order_items")
        .delete()
        .in("id", deleteItemIds.slice(i, i + 200));
      if (error) throw error;
    }
  }

  for (let i = 0; i < deleteOrderIds.length; i += 100) {
    const { error } = await supabase
      .from("orders")
      .delete()
      .in("id", deleteOrderIds.slice(i, i + 100));
    if (error) throw error;
  }

  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("company_id", COMPANY_ID);
  console.log("\nConcluído. Pedidos restantes na SMSV:", count);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
