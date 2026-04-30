import type { OrderWithItems } from "@/lib/types/database";

const STORAGE_PREFIX = "pcp-seen-comercial-obs-v1";

/** Identifica a versão atual do recado (nova mensagem = novo token). */
export function comercialObsSeenToken(
  order: Pick<OrderWithItems, "comercial_pcp_observation" | "comercial_pcp_observation_at">
): string {
  const at = order.comercial_pcp_observation_at;
  if (at && String(at).trim()) return String(at).trim();
  const text = (order.comercial_pcp_observation ?? "").trim();
  return `legacy:${text}`;
}

export function readComercialObsSeen(orderId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(`${STORAGE_PREFIX}:${orderId}`);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export function writeComercialObsSeen(orderId: string, token: string): void {
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}:${orderId}`, token);
  } catch {
    /* quota / private mode */
  }
}
