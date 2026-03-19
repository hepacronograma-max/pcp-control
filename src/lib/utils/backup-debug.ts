/**
 * Utilitário de backup para desenvolvimento.
 * NÃO é importado automaticamente pela aplicação.
 *
 * Para usar em desenvolvimento:
 * 1. Importe em um componente que só renderiza em dev, ou
 * 2. Use o script export-local-data.js no Console (recomendado).
 *
 * O script export-local-data.js expõe window.__pcpExportLocalData()
 * após ser executado uma vez no Console.
 */

export interface BackupExport {
  exportedAt: string;
  origin: string;
  version: string;
  orders: unknown[];
  lines: unknown[];
  company: unknown;
  profile: unknown;
  users: unknown[];
  holidays: unknown[];
  _validation: {
    ordersCount: number;
    itemsCount: number;
    itemsWithProgramacao: number;
    linesCount: number;
    usersCount: number;
    holidaysCount: number;
    warnings: string[];
    errors: string[];
  };
}

const KEYS = {
  orders: "pcp-local-orders",
  lines: "pcp-local-lines",
  company: "pcp-local-company",
  profile: "pcp-local-profile",
  users: "pcp-local-users",
  holidays: "pcp-local-holidays",
} as const;

function safeGet(key: string): unknown {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Retorna os dados locais sem fazer download.
 * Útil para inspeção programática em desenvolvimento.
 */
export function getLocalBackupData(): Omit<BackupExport, "exportedAt" | "origin" | "version" | "_validation"> {
  const orders = safeGet(KEYS.orders) as unknown[] | null;
  const lines = safeGet(KEYS.lines) as unknown[] | null;
  const company = safeGet(KEYS.company);
  const profile = safeGet(KEYS.profile);
  const users = safeGet(KEYS.users) as unknown[] | null;
  const holidays = safeGet(KEYS.holidays) as unknown[] | null;

  return {
    orders: orders || [],
    lines: lines || [],
    company: company || null,
    profile: profile || null,
    users: users || [],
    holidays: holidays || [],
  };
}

/**
 * Registra window.__pcpExportLocalData para uso no Console.
 * Chame uma vez (ex.: em um useEffect de um componente dev-only).
 */
export function registerBackupDebug(): void {
  if (typeof window === "undefined") return;
  // O script export-local-data.js já expõe isso ao ser executado.
  // Esta função existe para documentação e uso programático futuro.
  console.log("[PCP Backup] Use o script export-local-data.js no Console ou window.__pcpExportLocalData() após executá-lo.");
}
