/**
 * Restaura production_lines da SMSV a partir de backup_production_lines_20260507.
 * Remove linhas atuais da mesma empresa e repõe as do backup.
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
  override: true,
});

const { createClient } = require("@supabase/supabase-js");

const COMPANY_ID = "5d10a119-bfca-48f8-a5e2-8ae063c17920";
const BACKUP_TABLE = "backup_production_lines_20260507";
const DRY_RUN = process.argv.includes("--dry-run");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("Faltam variáveis Supabase no .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(DRY_RUN ? "=== DRY-RUN ===" : "=== RESTORE production_lines ===");
  console.log("Empresa:", COMPANY_ID);
  console.log("Backup:", BACKUP_TABLE, "\n");

  const { data: backupRows, error: bErr } = await supabase
    .from(BACKUP_TABLE)
    .select("*")
    .eq("company_id", COMPANY_ID)
    .order("sort_order", { ascending: true });
  if (bErr) throw new Error(bErr.message);
  if (!backupRows?.length) {
    console.error("Nenhuma linha no backup para esta empresa.");
    process.exit(1);
  }

  const { data: liveRows, error: lErr } = await supabase
    .from("production_lines")
    .select("id, name")
    .eq("company_id", COMPANY_ID);
  if (lErr) throw new Error(lErr.message);

  const liveIds = (liveRows ?? []).map((r) => r.id);
  const backupIds = backupRows.map((r) => r.id);
  const toRemove = liveIds.filter((id) => !backupIds.includes(id));

  console.log("Linhas atuais (serão removidas):");
  for (const r of liveRows ?? []) {
    if (toRemove.includes(r.id)) console.log("  -", r.name, r.id);
  }
  console.log("\nLinhas do backup (serão aplicadas):");
  for (const r of backupRows) console.log("  +", r.name, r.sort_order);

  if (DRY_RUN) {
    console.log("\nDry-run OK. Rode sem --dry-run para aplicar.");
    return;
  }

  if (toRemove.length) {
    const { data: orderIds } = await supabase
      .from("orders")
      .select("id")
      .eq("company_id", COMPANY_ID);
    const oids = (orderIds ?? []).map((o) => o.id);

    if (oids.length) {
      for (let i = 0; i < oids.length; i += 50) {
        const chunk = oids.slice(i, i + 50);
        const { error: upErr } = await supabase
          .from("order_items")
          .update({ line_id: null })
          .in("order_id", chunk)
          .in("line_id", toRemove);
        if (upErr) throw new Error("order_items line_id null: " + upErr.message);
      }
      console.log("Itens com linha antiga: line_id limpo (pedidos SMSV).");
    }

    for (let i = 0; i < toRemove.length; i += 50) {
      const chunk = toRemove.slice(i, i + 50);
      await supabase.from("operator_lines").delete().in("line_id", chunk);
    }

    const { error: delErr } = await supabase
      .from("production_lines")
      .delete()
      .in("id", toRemove);
    if (delErr) throw new Error("delete production_lines: " + delErr.message);
    console.log("Removidas", toRemove.length, "linhas atuais.");
  }

  const { error: upsErr } = await supabase
    .from("production_lines")
    .upsert(backupRows, { onConflict: "id" });
  if (upsErr) throw new Error("upsert production_lines: " + upsErr.message);

  console.log("Inseridas/atualizadas", backupRows.length, "linhas do backup.");
  const { data: final } = await supabase
    .from("production_lines")
    .select("name, sort_order, is_almoxarifado")
    .eq("company_id", COMPANY_ID)
    .order("sort_order");
  console.log("\nEstado final:");
  for (const r of final ?? []) {
    console.log(" ", r.sort_order, r.name, r.is_almoxarifado ? "(almox)" : "");
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
