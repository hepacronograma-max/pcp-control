/**
 * Executa a API de limpeza do Supabase.
 * Uso: node scripts/run-cleanup.js [--dry-run]
 *
 * Requer: servidor rodando (npm run dev) ou URL base em CLEANUP_BASE_URL
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(process.cwd(), ".env.local"),
  override: true,
});

const baseUrl = process.env.CLEANUP_BASE_URL || "http://localhost:3000";
const dryRun = process.argv.includes("--dry-run");
const secret = process.env.CLEANUP_SECRET;

async function run() {
  const url = `${baseUrl}/api/cleanup${dryRun ? "?dry_run=1" : ""}`;
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["X-Cleanup-Key"] = secret;

  console.log(dryRun ? "Modo simulação (dry-run)..." : "Executando limpeza...");
  const res = await fetch(url, { method: "POST", headers });
  const data = await res.json();

  if (!res.ok) {
    console.error("Erro:", data.error || res.statusText);
    process.exit(1);
  }

  console.log("Resultado:", data.report?.length ? data.report.join("\n") : "Nada a limpar.");
  console.log("Registros removidos:", data.deleted_count ?? 0);
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
