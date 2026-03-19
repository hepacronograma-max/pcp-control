/**
 * PCP Control - Importação de Backup para Supabase
 *
 * Uso: npm run import-backup
 *
 * Requisitos:
 * - Arquivo backup-pcp.json na raiz do projeto
 * - Arquivo .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 */

require("dotenv").config();
require("dotenv").config({ path: require("path").join(process.cwd(), ".env.local"), override: true });

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const PROJECT_ROOT = process.cwd();
const BACKUP_FILE = process.argv[2]
  ? path.resolve(PROJECT_ROOT, process.argv[2])
  : path.join(PROJECT_ROOT, "backup-pcp.json");

function isConnectionError(err) {
  const msg = (err && err.message) || String(err);
  return (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("network")
  );
}

function parseJson(val) {
  if (!val) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return val;
}

function loadBackup() {
  const raw = fs.readFileSync(BACKUP_FILE, "utf-8");
  const data = JSON.parse(raw);

  let orders = data.orders ?? parseJson(data["pcp-local-orders"]);
  let lines = data.lines ?? parseJson(data["pcp-local-lines"]);
  const company = data.company ?? parseJson(data["pcp-local-company"]);
  const holidays = data.holidays ?? parseJson(data["pcp-local-holidays"]);

  return {
    orders: Array.isArray(orders) ? orders : [],
    lines: Array.isArray(lines) ? lines : [],
    company: company && typeof company === "object" ? company : null,
    holidays: Array.isArray(holidays) ? holidays : [],
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(str) {
  return str && typeof str === "string" && UUID_REGEX.test(str);
}
function genUuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function buildIdMaps(lines, companyId) {
  const lineIdMap = {};
  const companyIdResolved = isValidUuid(companyId) ? companyId : genUuid();
  if (companyId === "local-company" || !isValidUuid(companyId)) {
    lineIdMap["local-company"] = companyIdResolved;
  }
  for (const l of lines) {
    if (!isValidUuid(l.id)) {
      lineIdMap[l.id] = genUuid();
    }
  }
  return { lineIdMap, companyIdResolved };
}

function mapCompanyId(id, targetId) {
  if (targetId && (id === "local-company" || !id)) return targetId;
  return id || "local-company";
}

async function run() {
  const supabaseUrl = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
    .find((u) => u && u.startsWith("http"));
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const targetCompanyId = process.env.TARGET_COMPANY_ID || null;

  if (!supabaseUrl || !supabaseKey) {
    console.error("");
    console.error("❌ ERRO: Variáveis de ambiente obrigatórias não encontradas.");
    console.error("");
    console.error("   Edite o arquivo .env na raiz do projeto e preencha:");
    console.error("   SUPABASE_URL=https://seu-projeto.supabase.co");
    console.error("   SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key");
    console.error("");
    process.exit(1);
  }

  const urlIsPlaceholder = !supabaseUrl || supabaseUrl === "COLE_AQUI_SUA_URL";
  const keyIsPlaceholder = !supabaseKey || supabaseKey === "COLE_AQUI_SUA_SERVICE_ROLE_KEY";
  if (urlIsPlaceholder || keyIsPlaceholder) {
    console.error("");
    console.error("❌ ERRO: Credenciais não configuradas.");
    console.error("");
    console.error("   Edite o arquivo .env e substitua os valores placeholder");
    console.error("   pelas suas credenciais do Supabase.");
    console.error("");
    process.exit(1);
  }

  console.log("");
  console.log("📦 PCP Control - Importação de Backup");
  console.log("======================================");
  console.log("   URL Supabase:", supabaseUrl);
  console.log("   Service Role Key:", supabaseKey ? "✓ carregada" : "✗ ausente");
  console.log("");

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("   Testando conexão com Supabase...");
  try {
    const { error } = await supabase.from("companies").select("id").limit(1);
    if (error) throw error;
    console.log("   ✓ Conexão OK");
  } catch (err) {
    if (isConnectionError(err)) {
      console.error("");
      console.error("❌ Falha de conexão com Supabase – verifique URL ou internet.");
      console.error("");
      console.error("   - Confirme se a URL está correta no .env");
      console.error("   - Verifique sua conexão com a internet");
      console.error("   - Se usar VPN/proxy, tente desativar temporariamente");
      console.error("");
    } else {
      console.error("");
      console.error("❌ Erro ao testar conexão:", err.message);
      console.error("");
    }
    process.exit(1);
  }
  console.log("");

  if (!fs.existsSync(BACKUP_FILE)) {
    console.error("❌ ERRO: Arquivo de backup não encontrado.");
    console.error("   Esperado:", BACKUP_FILE);
    console.error("");
    process.exit(1);
  }
  const { orders, lines, company, holidays } = loadBackup();

  const rawCompanyId = targetCompanyId
    || orders[0]?.company_id
    || lines[0]?.company_id
    || "local-company";

  const { lineIdMap, companyIdResolved } = buildIdMaps(lines, rawCompanyId);
  const companyId = targetCompanyId || (isValidUuid(rawCompanyId) ? rawCompanyId : companyIdResolved);

  const resolveLineId = (id) => (id && lineIdMap[id]) || id;
  const resolveCompanyId = (id) => ((!id || id === "local-company") ? companyId : id);

  console.log("");
  console.log("📦 PCP Control - Importação de Backup");
  console.log("======================================");
  console.log("   Arquivo:", BACKUP_FILE);
  console.log("   Pedidos:", orders.length);
  console.log("   Itens:", orders.reduce((s, o) => s + (o.items?.length || 0), 0));
  console.log("   Linhas:", lines.length);
  console.log("   Feriados:", holidays.length);
  console.log("   Company ID:", companyId);
  console.log("");

  let ordersInserted = 0;
  let itemsInserted = 0;
  let linesInserted = 0;
  let holidaysInserted = 0;
  let hasError = false;

  if (company && !targetCompanyId) {
    console.log("1. Empresa");
    const companyData = {
      id: companyId,
      name: company.name || "Empresa Local",
    };
    const { error } = await supabase.from("companies").upsert(companyData, { onConflict: "id" });
    if (error) {
      console.error("   ❌ Erro:", isConnectionError(error) ? "Falha de conexão com Supabase – verifique URL ou internet." : error.message);
      hasError = true;
    } else {
      console.log("   ✅ Empresa criada/atualizada");
    }
    console.log("");
  }

  if (lines.length) {
    console.log("2. Linhas de produção");
    const linesToInsert = lines.map((l) => ({
      id: resolveLineId(l.id) || l.id,
      company_id: resolveCompanyId(l.company_id),
      name: l.name,
    }));
    const { error } = await supabase.from("production_lines").upsert(linesToInsert, { onConflict: "id" });
    if (error) {
      console.error("   ❌ Erro:", isConnectionError(error) ? "Falha de conexão com Supabase – verifique URL ou internet." : error.message);
      hasError = true;
    } else {
      linesInserted = linesToInsert.length;
      console.log("   ✅", linesInserted, "linhas inseridas");
    }
    console.log("");
  }

  if (orders.length) {
    console.log("3. Pedidos");
    const ordersToInsert = orders.map((o) => ({
      id: isValidUuid(o.id) ? o.id : genUuid(),
      company_id: resolveCompanyId(o.company_id),
      order_number: String(o.order_number || "").slice(0, 50),
      client_name: String(o.client_name || "").slice(0, 255),
      status: o.status || "imported",
    }));
    const { error } = await supabase.from("orders").upsert(ordersToInsert, { onConflict: "id" });
    if (error) {
      console.error("   ❌ Erro:", isConnectionError(error) ? "Falha de conexão com Supabase – verifique URL ou internet." : error.message);
      hasError = true;
    } else {
      ordersInserted = ordersToInsert.length;
      console.log("   ✅", ordersInserted, "pedidos inseridos");
    }
    console.log("");

    const orderIdMap = {};
    orders.forEach((o, i) => {
      if (o.id !== ordersToInsert[i].id) orderIdMap[o.id] = ordersToInsert[i].id;
    });
    const allItems = orders.flatMap((o) =>
      (o.items || []).map((it) => ({
        ...it,
        order_id: orderIdMap[o.id] || o.id,
        line_id: it.line_id ? (resolveLineId(String(it.line_id)) ?? null) : null,
      }))
    );
    if (allItems.length) {
      console.log("4. Itens dos pedidos");
      const itemsToInsert = allItems.map((it) => ({
        id: isValidUuid(it.id) ? it.id : genUuid(),
        order_id: it.order_id,
        description: (it.description || "").slice(0, 500),
        quantity: Math.max(1, Number(it.quantity) || 1),
      }));
      const { error } = await supabase.from("order_items").upsert(itemsToInsert, { onConflict: "id" });
      if (error) {
        console.error("   ❌ Erro:", isConnectionError(error) ? "Falha de conexão com Supabase – verifique URL ou internet." : error.message);
        hasError = true;
      } else {
        itemsInserted = itemsToInsert.length;
        console.log("   ✅", itemsInserted, "itens inseridos");
      }
    }
    console.log("");
  }

  if (holidays.length) {
    console.log("5. Feriados");
    const holidaysToInsert = holidays.map((h) => ({
      id: isValidUuid(h.id) ? h.id : genUuid(),
      company_id: resolveCompanyId(h.company_id),
      date: h.date,
      description: h.description || "",
      is_recurring: h.is_recurring ?? true,
      created_at: h.created_at || new Date().toISOString(),
    }));
    const { error } = await supabase.from("holidays").upsert(holidaysToInsert, { onConflict: "id" });
    if (error) {
      console.error("   ❌ Erro:", isConnectionError(error) ? "Falha de conexão com Supabase – verifique URL ou internet." : error.message);
      hasError = true;
    } else {
      holidaysInserted = holidaysToInsert.length;
      console.log("   ✅", holidaysInserted, "feriados inseridos");
    }
    console.log("");
  }

  console.log("======================================");
  if (hasError) {
    console.log("⚠️  Importação concluída com erros.");
  } else {
    console.log("✅ Importação finalizada com sucesso.");
    console.log("");
    console.log("   Resumo:");
    console.log("   - Pedidos:", ordersInserted);
    console.log("   - Itens:", itemsInserted);
    console.log("   - Linhas:", linesInserted);
    console.log("   - Feriados:", holidaysInserted);
  }
  console.log("");
}

run().catch((err) => {
  console.error("");
  if (isConnectionError(err)) {
    console.error("❌ Falha de conexão com Supabase – verifique URL ou internet.");
  } else {
    console.error("❌ Erro fatal:", err.message);
  }
  console.error("");
  process.exit(1);
});
