/**
 * Backfill inicial: marca pedidos já na etapa Fabricação (20) no Omie sem criar orders no PCP.
 *
 * Uso:
 *   node scripts/omie-backfill-inicial.js          # dry-run
 *   node scripts/omie-backfill-inicial.js --apply  # grava omie_order_links
 *
 * Somente leitura no Omie (ListarPedidos + ConsultarPedido opcional).
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PEDIDO_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
const MIN_MS = 1000;
let lastAt = 0;

function env(name, fallback) {
  const v = process.env[name]?.trim();
  return v || fallback;
}

function assertCreds() {
  if (!process.env.OMIE_APP_KEY?.trim() || !process.env.OMIE_APP_SECRET?.trim()) {
    throw new Error("OMIE_APP_KEY e OMIE_APP_SECRET obrigatórios no .env");
  }
}

async function throttle() {
  const e = Date.now() - lastAt;
  if (e < MIN_MS) await new Promise((r) => setTimeout(r, MIN_MS - e));
  lastAt = Date.now();
}

async function omieCall(call, param) {
  assertCreds();
  await throttle();
  const res = await fetch(PEDIDO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key: process.env.OMIE_APP_KEY.trim(),
      app_secret: process.env.OMIE_APP_SECRET.trim(),
      param: [param],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (json.faultstring) throw new Error(json.faultstring);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json;
}

async function listarTodosEtapa(etapa) {
  const all = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const res = await omieCall("ListarPedidos", {
      pagina,
      registros_por_pagina: 50,
      apenas_importado_api: "N",
      etapa,
    });
    const lista = res.pedido_venda_produto ?? [];
    for (const p of lista) {
      const cab = p.cabecalho ?? p;
      all.push({
        codigo: cab.codigo_pedido ?? p.codigo_pedido,
        numero: cab.numero_pedido ?? p.numero_pedido,
        etapa: cab.etapa ?? p.etapa ?? etapa,
      });
    }
    totalPaginas = res.total_de_paginas ?? pagina;
    pagina += 1;
    if (!lista.length) break;
  }
  return all.filter((x) => x.codigo);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const etapa = env("OMIE_ETAPA_FABRICACAO", "20");

  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios");
  }
  const supabase = createClient(url, key);

  console.log(`Modo: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Etapa Omie: ${etapa}`);

  const pedidos = await listarTodosEtapa(etapa);
  console.log(`Pedidos na etapa ${etapa}: ${pedidos.length}`);

  let marcados = 0;
  let skipped = 0;
  let erros = 0;

  for (const p of pedidos) {
    const { data: existing } = await supabase
      .from("omie_order_links")
      .select("id")
      .eq("omie_codigo_pedido", p.codigo)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    if (apply) {
      const { error } = await supabase.from("omie_order_links").insert({
        pcp_order_id: null,
        omie_codigo_pedido: p.codigo,
        omie_numero_pedido: p.numero ? String(p.numero) : null,
        omie_etapa: String(p.etapa),
        sync_status: "backfill_skipped",
        omie_payload_original: { backfill: true },
      });
      if (error) {
        console.error(`Erro codigo ${p.codigo}:`, error.message);
        erros += 1;
      } else {
        marcados += 1;
      }
    } else {
      console.log(`  [dry-run] marcar backfill_skipped: ${p.codigo} numero=${p.numero ?? "?"}`);
      marcados += 1;
    }
  }

  console.log("\n--- Relatório ---");
  console.log(`Total etapa ${etapa}: ${pedidos.length}`);
  console.log(`Marcados (novos): ${marcados}`);
  console.log(`Já existiam: ${skipped}`);
  console.log(`Erros: ${erros}`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
