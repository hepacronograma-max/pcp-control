import type { UserRole } from "@/lib/types/database";

/**
 * Matriz de permissões (áreas e ações).
 * - Operador / Logística: só as linhas em `operator_lines`.
 * - PCP: vê Compras em modo leitura; edita produção, logística, almox. conforme ações.
 * - Comercial: área comercial + dashboard de produção (não edita pedidos gerais).
 * - Compras: vê/altera compras; pode ver Pedidos; dashboard geral.
 * - Manager / super_admin: configuração e tudo o resto.
 */
export const PERMISSIONS = {
  viewDashboard: [
    "super_admin",
    "manager",
    "pcp",
    "operator",
    "comercial",
    "compras",
    "logistica",
  ] as UserRole[],

  /** Tela de lista de pedidos (importação / edição de pedidos) */
  viewOrders: ["super_admin", "manager", "pcp", "compras"] as UserRole[],

  viewComercial: ["super_admin", "manager", "comercial"] as UserRole[],

  /** Aba Compras (inclui PCP em leitura) */
  viewCompras: ["super_admin", "manager", "compras", "pcp"] as UserRole[],

  /** Criar/editar/excluir PC, vínculos, importar PDF de compra */
  editCompras: ["super_admin", "manager", "compras"] as UserRole[],

  viewAllLines: ["super_admin", "manager", "pcp"] as UserRole[],

  viewSettings: ["super_admin", "manager"] as UserRole[],

  importOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  importComprasPdfs: ["super_admin", "manager", "compras"] as UserRole[],

  editOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  finishOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  allocateItems: ["super_admin", "manager", "pcp"] as UserRole[],

  scheduleItems: ["super_admin", "manager", "pcp", "operator", "logistica"] as UserRole[],

  completeItems: ["super_admin", "manager", "pcp", "operator", "logistica"] as UserRole[],

  manageCompany: ["super_admin", "manager"] as UserRole[],

  manageUsers: ["super_admin", "manager"] as UserRole[],

  manageLines: ["super_admin", "manager"] as UserRole[],

  manageHolidays: ["super_admin", "manager"] as UserRole[],
};

/** Perfis no Supabase às vezes usam `admin`; no app equivale a manager. */
export function normalizeUserRole(userRole: UserRole | string | null | undefined): UserRole {
  if (!userRole) return "operator";
  if (userRole === "admin") return "manager";
  return userRole as UserRole;
}

/**
 * Rota padrão após login. Áreas “estreitas” vão para o dashboard de produção
 * (KPIs gerais); o menu leva a Comercial, Compras, etc.
 */
export function defaultAppPathForRole(
  userRole: UserRole | string | null | undefined
): string {
  const r = normalizeUserRole(userRole);
  if (r === "comercial" || r === "compras" || r === "logistica") return "/dashboard";
  return "/dashboard";
}

export function hasPermission(
  userRole: UserRole | string | null | undefined,
  permission: keyof typeof PERMISSIONS
): boolean {
  const r = normalizeUserRole(userRole);
  return PERMISSIONS[permission].includes(r);
}

/** Menu lateral: linhas (operador, logística, PCP, gestão). Não: só comercial ou só leitura global sem linha. */
export function canViewProductionLineMenu(
  userRole: UserRole | string | null | undefined
): boolean {
  const r = normalizeUserRole(userRole);
  return (
    r === "super_admin" ||
    r === "manager" ||
    r === "pcp" ||
    r === "operator" ||
    r === "logistica"
  );
}

export function canAccessLine(
  userRole: UserRole | string | null | undefined,
  lineId: string,
  operatorLines: string[]
): boolean {
  const r = normalizeUserRole(userRole);
  if (["super_admin", "manager", "pcp"].includes(r)) return true;
  if (r === "operator" || r === "logistica") return operatorLines.includes(lineId);
  return false;
}
