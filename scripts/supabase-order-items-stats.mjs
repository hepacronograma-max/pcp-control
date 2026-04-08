/**
 * Uso: node scripts/supabase-order-items-stats.mjs
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou ANON) no .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { count: totalItems, error: e1 } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true });
  if (e1) throw e1;

  const { count: withLine, error: e2 } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .not("line_id", "is", null);
  if (e2) throw e2;

  console.log("1) Total de registros em order_items:", totalItems ?? 0);
  console.log(
    "2) order_items com line_id preenchido (não null):",
    withLine ?? 0
  );

  const { data: profiles, error: e3 } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .or("full_name.ilike.%Constante%,email.ilike.%constante%");
  if (e3) throw e3;

  console.log("\n3) Perfis que batem com 'Constante' (nome/email):");
  if (!profiles?.length) {
    console.log("   (nenhum — tente ajustar o filtro no script)");
  } else {
    for (const p of profiles) {
      console.log(
        `   id=${p.id} | full_name=${p.full_name} | email=${p.email}`
      );
    }
  }

  const userId = profiles?.[0]?.id;
  if (!userId) {
    console.log(
      "\n4) Sem user_id do Constante — não há operator_lines para listar."
    );
    return;
  }

  const { data: opLines, error: e4 } = await supabase
    .from("operator_lines")
    .select("line_id")
    .eq("user_id", userId);
  if (e4) throw e4;

  const lineIds = [...new Set((opLines ?? []).map((r) => r.line_id))];
  console.log(
    "\n3b) IDs de linha em operator_lines para o primeiro perfil Constante:",
    lineIds.length ? lineIds.join(", ") : "(nenhum)"
  );

  if (lineIds.length === 0) {
    console.log(
      "\n4) Não há linhas em operator_lines — não há order_items a cruzar por linha."
    );
    return;
  }

  const { data: matching, error: e5 } = await supabase
    .from("order_items")
    .select("id, line_id, status, order_id")
    .in("line_id", lineIds)
    .limit(20);
  if (e5) throw e5;

  const { count: matchCount, error: e6 } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .in("line_id", lineIds);
  if (e6) throw e6;

  console.log(
    "\n4) order_items com line_id IN (linhas do operador Constante):",
    matchCount ?? 0,
    "registro(s)"
  );
  if (matching?.length) {
    console.log("   Amostra (até 20):");
    for (const row of matching) {
      console.log(
        `   item ${row.id} | line_id=${row.line_id} | status=${row.status} | order_id=${row.order_id}`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
