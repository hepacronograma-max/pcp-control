/**
 * Remove registros com created_at >= 19/05/2026 15:00 (America/Sao_Paulo).
 * Uso: node scripts/run-delete-after-cutoff.js [--dry-run]
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
  override: true,
});

const { createClient } = require("@supabase/supabase-js");

const CUTOFF_ISO = "2026-05-19T18:00:00.000Z"; // 19/05/2026 15:00 BRT (UTC-3)
const DRY_RUN = process.argv.includes("--dry-run");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchIds(table, filterFn) {
  const pageSize = 1000;
  let from = 0;
  const ids = [];
  for (;;) {
    let q = supabase.from(table).select("id").range(from, from + pageSize - 1);
    q = filterFn(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    ids.push(...data.map((r) => r.id));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

async function countWhere(table, filterFn) {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  q = filterFn(q);
  const { count, error } = await q;
  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return { table, count: 0, skip: true };
    }
    throw new Error(`${table}: ${error.message}`);
  }
  return { table, count: count ?? 0, skip: false };
}

async function deleteByIds(table, ids, label) {
  if (!ids.length) {
    console.log(`  ${label}: 0`);
    return 0;
  }
  if (DRY_RUN) {
    console.log(`  ${label}: ${ids.length} (dry-run)`);
    return ids.length;
  }
  let deleted = 0;
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error } = await supabase.from(table).delete().in("id", slice);
    if (error) throw new Error(`${table} delete: ${error.message}`);
    deleted += slice.length;
  }
  console.log(`  ${label}: ${deleted} apagados`);
  return deleted;
}

async function main() {
  console.log(DRY_RUN ? "=== DRY-RUN (preview) ===" : "=== DELETE (produção) ===");
  console.log(`Corte: 19/05/2026 15:00 Brasília (${CUTOFF_ISO} UTC)\n`);

  const orderIds = await fetchIds("orders", (q) =>
    q.gte("created_at", CUTOFF_ISO)
  );
  // order_items em produção não tem created_at — remove todos os itens dos pedidos novos
  const itemIds = [];
  if (orderIds.length) {
    for (let i = 0; i < orderIds.length; i += 50) {
      const chunk = orderIds.slice(i, i + 50);
      const { data, error } = await supabase
        .from("order_items")
        .select("id")
        .in("order_id", chunk);
      if (error) throw new Error(`order_items by order: ${error.message}`);
      for (const row of data ?? []) itemIds.push(row.id);
    }
  }

  const poIds = await fetchIds("purchase_orders", (q) =>
    q.gte("created_at", CUTOFF_ISO)
  );

  console.log("Alvos principais:");
  console.log(`  orders: ${orderIds.length}`);
  console.log(`  order_items: ${itemIds.length}`);
  console.log(`  purchase_orders: ${poIds.length}\n`);

  const previewTables = [
    "cq_registros",
    "cq_categorias",
    "purchase_order_item_links",
    "purchase_order_lines",
    "departments",
    "profiles",
  ];
  console.log("Contagem created_at >= corte:");
  for (const t of previewTables) {
    const r = await countWhere(t, (q) => q.gte("created_at", CUTOFF_ISO));
    if (!r.skip) console.log(`  ${r.table}: ${r.count}`);
  }

  if (DRY_RUN) {
    console.log("\nDry-run concluído. Rode sem --dry-run para apagar.");
    return;
  }

  console.log("\nApagando…");

  // CQ registros
  const cqIds = new Set();
  const { data: cqByDate } = await supabase
    .from("cq_registros")
    .select("id")
    .gte("created_at", CUTOFF_ISO);
  for (const r of cqByDate ?? []) cqIds.add(r.id);
  for (const [type, ids] of [
    ["order", orderIds],
    ["order_item", itemIds],
    ["purchase_order", poIds],
  ]) {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      if (!chunk.length) continue;
      const { data } = await supabase
        .from("cq_registros")
        .select("id")
        .eq("target_type", type)
        .in("target_id", chunk);
      for (const r of data ?? []) cqIds.add(r.id);
    }
  }
  await deleteByIds("cq_registros", [...cqIds], "cq_registros");

  const cqCatIds = await fetchIds("cq_categorias", (q) =>
    q.gte("created_at", CUTOFF_ISO)
  );
  await deleteByIds("cq_categorias", cqCatIds, "cq_categorias");

  // Purchase links
  const linkIds = new Set();
  const { data: linksByDate } = await supabase
    .from("purchase_order_item_links")
    .select("id")
    .gte("created_at", CUTOFF_ISO);
  for (const r of linksByDate ?? []) linkIds.add(r.id);
  for (let i = 0; i < poIds.length; i += 50) {
    const chunk = poIds.slice(i, i + 50);
    if (!chunk.length) continue;
    const { data } = await supabase
      .from("purchase_order_item_links")
      .select("id")
      .in("purchase_order_id", chunk);
    for (const r of data ?? []) linkIds.add(r.id);
  }
  for (let i = 0; i < itemIds.length; i += 50) {
    const chunk = itemIds.slice(i, i + 50);
    if (!chunk.length) continue;
    const { data } = await supabase
      .from("purchase_order_item_links")
      .select("id")
      .in("order_item_id", chunk);
    for (const r of data ?? []) linkIds.add(r.id);
  }
  await deleteByIds(
    "purchase_order_item_links",
    [...linkIds],
    "purchase_order_item_links"
  );

  const polIds = new Set();
  const { data: polByDate } = await supabase
    .from("purchase_order_lines")
    .select("id")
    .gte("created_at", CUTOFF_ISO);
  for (const r of polByDate ?? []) polIds.add(r.id);
  for (let i = 0; i < poIds.length; i += 50) {
    const chunk = poIds.slice(i, i + 50);
    if (!chunk.length) continue;
    const { data } = await supabase
      .from("purchase_order_lines")
      .select("id")
      .in("purchase_order_id", chunk);
    for (const r of data ?? []) polIds.add(r.id);
  }
  await deleteByIds("purchase_order_lines", [...polIds], "purchase_order_lines");
  await deleteByIds("purchase_orders", poIds, "purchase_orders");

  // Tasks (só se a tabela existir e tiver created_at)
  try {
    const taskIds = await fetchIds("tasks", (q) => q.gte("created_at", CUTOFF_ISO));
    if (taskIds.length) {
      for (const [table, col] of [
        ["task_history", "task_id"],
        ["task_comments", "task_id"],
        ["subtasks", "task_id"],
      ]) {
        const ids = new Set();
        for (let i = 0; i < taskIds.length; i += 50) {
          const chunk = taskIds.slice(i, i + 50);
          const { data, error } = await supabase
            .from(table)
            .select("id")
            .in(col, chunk);
          if (error) break;
          for (const r of data ?? []) ids.add(r.id);
        }
        await deleteByIds(table, [...ids], table);
      }
      await deleteByIds("tasks", taskIds, "tasks");
    }
  } catch (e) {
    console.log("  tasks: ignorado (" + e.message + ")");
  }

  await deleteByIds("order_items", itemIds, "order_items");
  await deleteByIds("orders", orderIds, "orders");

  for (const table of ["departments", "profiles"]) {
    try {
      const ids = await fetchIds(table, (q) => q.gte("created_at", CUTOFF_ISO));
      await deleteByIds(table, ids, table);
    } catch (e) {
      console.log(`  ${table}: ignorado (${e.message})`);
    }
  }

  console.log("\nConcluído.");
  console.log(
    "Perfis: se criou usuários no Auth, remova manualmente em Authentication → Users."
  );
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
