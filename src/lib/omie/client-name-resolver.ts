import { truncate } from "@/lib/utils/supabase-data";
import type { OmieClient } from "./client";
import type { OmiePedidoCompleto } from "./types";
import { extractClientNameFromPedido } from "./mapper";

const CLIENT_NAME_MAX = 255;

const PLACEHOLDER_RE = /^Cliente Omie(?:\s+\d+)?$/i;

export type OmieClientNameCache = Map<number, string>;

export function isPlaceholderOmieClientName(name: string): boolean {
  return PLACEHOLDER_RE.test(name.trim());
}

/** Preferência alinhada ao PDF: nome fantasia, depois razão social. */
export function pickOmieClientDisplayName(
  razaoSocial?: string | null,
  nomeFantasia?: string | null
): string | null {
  for (const raw of [nomeFantasia, razaoSocial]) {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s.length > 2 && s.length < 300) {
      return truncate(s, CLIENT_NAME_MAX) ?? s.slice(0, CLIENT_NAME_MAX);
    }
  }
  return null;
}

export async function resolveClientNameForPedido(
  omie: OmiePedidoCompleto,
  client: OmieClient,
  cache: OmieClientNameCache
): Promise<string> {
  const fromPedido = extractClientNameFromPedido(omie);
  if (!isPlaceholderOmieClientName(fromPedido)) {
    return fromPedido;
  }

  const codigo = omie.cabecalho?.codigo_cliente;
  if (codigo == null || !Number.isFinite(codigo)) {
    return fromPedido;
  }

  const cached = cache.get(codigo);
  if (cached) return cached;

  try {
    const cadastro = await client.consultarCliente(codigo);
    const resolved = pickOmieClientDisplayName(
      cadastro.razao_social,
      cadastro.nome_fantasia
    );
    if (resolved) {
      cache.set(codigo, resolved);
      return resolved;
    }
  } catch (err) {
    console.warn(
      `[omie] ConsultarCliente(${codigo}) falhou:`,
      err instanceof Error ? err.message : err
    );
  }

  return fromPedido;
}
