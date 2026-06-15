/**
 * Corrige orders.client_name "Cliente Omie <id>" via ConsultarCliente.
 * Uso: npx tsx scripts/omie-corrigir-nomes-clientes.ts
 *      npx tsx scripts/omie-corrigir-nomes-clientes.ts --dry-run
 */
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local"), override: true });

import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { OmieClient } from "../src/lib/omie/client";
import {
  isPlaceholderOmieClientName,
  pickOmieClientDisplayName,
  type OmieClientNameCache,
} from "../src/lib/omie/client-name-resolver";

const dryRun = process.argv.includes("--dry-run");

async function resolveFromPayload(
  payload: Record<string, unknown> | null,
  cache: OmieClientNameCache,
  client: OmieClient
): Promise<string | null> {
  const cab = (payload?.cabecalho ?? {}) as { codigo_cliente?: number };
  const cod = cab.codigo_cliente;
  if (cod == null || !Number.isFinite(cod)) return null;

  const cached = cache.get(cod);
  if (cached) return cached;

  const cadastro = await client.consultarCliente(cod);
  const name = pickOmieClientDisplayName(
    cadastro.razao_social,
    cadastro.nome_fantasia
  );
  if (name) cache.set(cod, name);
  return name;
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const client = new OmieClient();
  client.assertConfigured();
  const cache: OmieClientNameCache = new Map();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, client_name")
    .like("client_name", "Cliente Omie%");

  if (error) throw new Error(error.message);

  const rows = (orders ?? []).filter((o) =>
    isPlaceholderOmieClientName(String(o.client_name ?? ""))
  );

  console.log(`Pedidos com placeholder: ${rows.length}`);
  if (rows.length === 0) return;

  for (const order of rows) {
    const { data: link } = await supabase
      .from("omie_order_links")
      .select("omie_payload_original, omie_codigo_pedido")
      .eq("pcp_order_id", order.id)
      .maybeSingle();

    let resolved: string | null = null;

    if (link?.omie_payload_original) {
      resolved = await resolveFromPayload(
        link.omie_payload_original as Record<string, unknown>,
        cache,
        client
      );
    }

    if (!resolved && link?.omie_codigo_pedido) {
      const pedido = await client.consultarPedido(link.omie_codigo_pedido);
      const cod = pedido.cabecalho?.codigo_cliente;
      if (cod != null) {
        const cached = cache.get(cod);
        if (cached) {
          resolved = cached;
        } else {
          const cadastro = await client.consultarCliente(cod);
          resolved = pickOmieClientDisplayName(
            cadastro.razao_social,
            cadastro.nome_fantasia
          );
          if (resolved) cache.set(cod, resolved);
        }
      }
    }

    if (!resolved) {
      console.warn(`  ${order.order_number}: sem nome resolvido`);
      continue;
    }

    console.log(`  ${order.order_number}: "${order.client_name}" -> "${resolved}"`);

    if (!dryRun) {
      const { error: upErr } = await supabase
        .from("orders")
        .update({ client_name: resolved })
        .eq("id", order.id);
      if (upErr) console.error(`    erro: ${upErr.message}`);
    }
  }

  console.log(dryRun ? "(dry-run — nada gravado)" : "Concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
