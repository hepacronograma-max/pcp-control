/**
 * Teste pontual (descartável): verifica se numero_pedido preserva sufixo /N.
 * Somente leitura: ListarPedidos + ConsultarPedido.
 *
 * Uso:
 *   node scripts/omie-testar-numero.js --buscar
 *   node scripts/omie-testar-numero.js --codigo 6929524893
 *   node scripts/omie-testar-numero.js --numero 260161/1
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PEDIDO_URL = "https://app.omie.com.br/api/v1/produtos/pedido/";
const MIN_MS = 1000;
const ORDER_NUMBER_MAX = 50;
let lastAt = 0;

/** Espelho de src/lib/omie/mapper.ts → normalizeOmieOrderNumber */
function normalizeSequencialSuffix(sequencial) {
  const t = String(sequencial ?? "").trim();
  if (!t) return null;
  const withoutZeros = t.replace(/^0+/, "") || "0";
  if (withoutZeros === "0") return null;
  return withoutZeros;
}

function buildBusinessOrderNumber(base, sequencial) {
  const b = String(base ?? "").trim();
  if (!b) return "";
  const suffix = normalizeSequencialSuffix(sequencial);
  return suffix ? `${b}/${suffix}` : b;
}

function finalizeOrderNumber(value) {
  if (!value) throw new Error("Pedido Omie sem numero_pedido");
  if (value.length <= ORDER_NUMBER_MAX) return value;
  return value.slice(0, ORDER_NUMBER_MAX);
}

function normalizeOmieOrderNumber(omie) {
  const cab = omie.cabecalho ?? {};
  const seq = cab.sequencial;
  const numero = String(cab.numero_pedido ?? "").trim();
  if (numero) return finalizeOrderNumber(buildBusinessOrderNumber(numero, seq));
  const integracao = String(cab.codigo_pedido_integracao ?? "").trim();
  if (integracao) {
    return finalizeOrderNumber(buildBusinessOrderNumber(integracao, seq));
  }
  if (cab.codigo_pedido != null) {
    return finalizeOrderNumber(
      buildBusinessOrderNumber(String(cab.codigo_pedido).trim(), seq)
    );
  }
  throw new Error("Pedido Omie sem numero_pedido");
}

function truncatePreview(s, max = 40) {
  const t = String(s ?? "").trim();
  if (!t) return "(vazio)";
  return t.length > max ? `${t.slice(0, max)}…` : t;
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

async function listarPagina(opts) {
  let res;
  try {
    res = await omieCall("ListarPedidos", {
    pagina: opts.pagina ?? 1,
    registros_por_pagina: opts.registros_por_pagina ?? 50,
    apenas_importado_api: "N",
    ...(opts.etapa ? { etapa: opts.etapa } : {}),
    });
  } catch (e) {
    if (/não existem registros|nao existem registros/i.test(String(e.message))) {
      return { rows: [], totalPaginas: 0 };
    }
    throw e;
  }
  const lista = res.pedido_venda_produto ?? [];
  const rows = [];
  for (const p of lista) {
    const cab = p.cabecalho ?? p;
    const codigo = cab.codigo_pedido ?? p.codigo_pedido;
    const numero = String(cab.numero_pedido ?? p.numero_pedido ?? "").trim();
    const etapa = cab.etapa ?? p.etapa ?? opts.etapa ?? "?";
    if (codigo) rows.push({ codigo, numero, etapa });
  }
  return {
    rows,
    totalPaginas: res.total_de_paginas ?? 1,
  };
}

async function consultarPedido(codigo) {
  const res = await omieCall("ConsultarPedido", { codigo_pedido: codigo });
  return res.pedido_venda_produto ?? res;
}

function mapperFallbackUsed(omie) {
  const cab = omie.cabecalho ?? {};
  const np = String(cab.numero_pedido ?? "").trim();
  const integ = String(cab.codigo_pedido_integracao ?? "").trim();
  if (np) return "numero_pedido";
  if (integ) return "codigo_pedido_integracao";
  if (cab.codigo_pedido != null) return "FALLBACK_codigo_pedido (ID interno)";
  return "nenhum";
}

async function analisarCodigo(codigo, numeroKanban) {
  const full = await consultarPedido(codigo);
  const cab = full.cabecalho ?? {};
  let mapperGrava;
  let err;
  try {
    mapperGrava = normalizeOmieOrderNumber(full);
  } catch (e) {
    err = e.message;
  }
  const fonte = mapperFallbackUsed(full);
  return {
    numeroKanban: numeroKanban ?? cab.numero_pedido ?? "(consulta)",
    codigo_pedido: cab.codigo_pedido,
    numero_pedido: cab.numero_pedido ?? "(vazio)",
    sequencial: cab.sequencial ?? "(vazio)",
    codigo_pedido_integracao: cab.codigo_pedido_integracao ?? "(vazio)",
    etapa: cab.etapa ?? "?",
    mapperGrava: err ? `ERRO: ${err}` : mapperGrava,
    fonteMapper: fonte,
    caiuNoIdInterno: fonte === "FALLBACK_codigo_pedido (ID interno)",
  };
}

async function buscarComBarra(maxPedidos = 3) {
  const etapas = ["10", "20", "30", "40", "50", "60", "70", "80", "90"];
  const comBarra = [];
  const vistos = new Set();

  for (const etapa of etapas) {
    if (comBarra.length >= maxPedidos) break;
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= totalPaginas && comBarra.length < maxPedidos) {
      const batch = await listarPagina({ etapa, pagina });
      totalPaginas = batch.totalPaginas;
      for (const row of batch.rows) {
        if (!row.numero.includes("/")) continue;
        if (vistos.has(row.codigo)) continue;
        vistos.add(row.codigo);
        comBarra.push(row);
        if (comBarra.length >= maxPedidos) break;
      }
      pagina += 1;
      if (!batch.rows.length) break;
    }
  }

  if (comBarra.length < maxPedidos) {
    let pagina = 1;
    let totalPaginas = 1;
    while (pagina <= Math.min(totalPaginas, 5) && comBarra.length < maxPedidos) {
      const batch = await listarPagina({ pagina });
      totalPaginas = batch.totalPaginas;
      for (const row of batch.rows) {
        if (!row.numero.includes("/")) continue;
        if (vistos.has(row.codigo)) continue;
        vistos.add(row.codigo);
        comBarra.push(row);
        if (comBarra.length >= maxPedidos) break;
      }
      pagina += 1;
    }
  }

  return comBarra;
}

function printTable(rows) {
  console.log(
    "\n| codigo_pedido | numero_pedido | sequencial | o que o mapper grava AGORA |"
  );
  console.log(
    "|---------------|---------------|------------|----------------------------|"
  );
  for (const r of rows) {
    console.log(
      `| ${r.codigo_pedido} | ${truncatePreview(r.numero_pedido, 14)} | ${truncatePreview(r.sequencial, 10)} | ${truncatePreview(r.mapperGrava, 26)} |`
    );
    console.log(
      `  integracao: ${truncatePreview(r.codigo_pedido_integracao)} | etapa: ${r.etapa} | ID interno como numero? ${r.caiuNoIdInterno ? "SIM" : "nao"}`
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const buscar = args.includes("--buscar") || args.length === 0;
  const codigoArg = args.find((a) => a.startsWith("--codigo="))?.split("=")[1];
  const numeroArg = args.find((a) => a.startsWith("--numero="))?.split("=")[1];
  const prefixArg = args.find((a) => a.startsWith("--prefixo="))?.split("=")[1];

  console.log("Omie — teste numero /N (somente leitura)\n");

  const resultados = [];

  if (args.includes("--dump-cabecalho") && codigoArg) {
    const full = await consultarPedido(Number(codigoArg));
    console.log(JSON.stringify(full.cabecalho ?? {}, null, 2));
    const blob = JSON.stringify(full);
    const slashHits = blob.match(/\d{4,6}\/\d+/g);
    console.log("\nPadrões NNNNN/N no JSON:", slashHits ?? "(nenhum)");
    return;
  }

  if (codigoArg) {
    resultados.push(await analisarCodigo(Number(codigoArg)));
  } else if (numeroArg) {
    const hits = [];
    for (const etapa of ["10", "20", "50", "80"]) {
      const batch = await listarPagina({ etapa, pagina: 1, registros_por_pagina: 100 });
      for (const row of batch.rows) {
        if (row.numero === numeroArg || row.numero.includes(numeroArg)) {
          hits.push(row);
        }
      }
      await throttle();
    }
    if (!hits.length) {
      console.error(`Nenhum pedido listado com numero parecido: ${numeroArg}`);
      process.exit(1);
    }
    for (const h of hits.slice(0, 3)) {
      resultados.push(await analisarCodigo(h.codigo, h.numero));
    }
  } else if (prefixArg) {
    const hits = [];
    const etapas = ["10", "20", "30", "40", "50", "60", "70", "80", "90"];
    for (const etapa of etapas) {
      for (let pagina = 1; pagina <= 3; pagina++) {
        const batch = await listarPagina({
          etapa,
          pagina,
          registros_por_pagina: 100,
        });
        for (const row of batch.rows) {
          if (
            row.numero.includes(prefixArg) ||
            row.numero.startsWith(prefixArg)
          ) {
            hits.push(row);
          }
        }
        if (!batch.rows.length) break;
      }
    }
    const uniq = [];
    const seen = new Set();
    for (const h of hits) {
      if (seen.has(h.codigo)) continue;
      seen.add(h.codigo);
      uniq.push(h);
    }
    if (!uniq.length) {
      console.error(`Nenhum pedido com prefixo: ${prefixArg}`);
      process.exit(1);
    }
    for (const h of uniq.slice(0, 5)) {
      resultados.push(await analisarCodigo(h.codigo, h.numero));
    }
  } else if (buscar) {
    console.log("Buscando pedidos com '/' no numero (varias etapas)…\n");
    const found = await buscarComBarra(3);
    if (!found.length) {
      console.error("Nenhum pedido com / encontrado nas etapas varridas.");
      process.exit(1);
    }
    for (const f of found) {
      console.log(`→ etapa ${f.etapa} lista: ${f.numero} (codigo ${f.codigo})`);
      resultados.push(await analisarCodigo(f.codigo, f.numero));
    }
  } else {
    console.log("Uso: --buscar | --codigo=NNN | --numero=260161/1 | --prefixo=260161");
    process.exit(1);
  }

  printTable(resultados);

  const comBarraNaApi = resultados.every(
    (r) => String(r.numero_pedido).includes("/") || String(r.mapperGrava).includes("/")
  );
  const mapperOk = resultados.every(
    (r) =>
      !r.caiuNoIdInterno &&
      !String(r.mapperGrava).startsWith("ERRO") &&
      String(r.mapperGrava) === String(r.numero_pedido).trim().slice(0, ORDER_NUMBER_MAX) ||
      (String(r.numero_pedido).includes("/") &&
        String(r.mapperGrava).includes("/"))
  );
  const algumFallback = resultados.some((r) => r.caiuNoIdInterno);

  console.log("\n--- Resumo ---");
  console.log("numero_pedido traz /N quando existe?", comBarraNaApi ? "SIM" : "verificar linhas");
  console.log("mapper preserva /N?", mapperOk ? "SIM" : "verificar linhas");
  console.log("caiu em fallback ID interno?", algumFallback ? "SIM" : "NAO");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
