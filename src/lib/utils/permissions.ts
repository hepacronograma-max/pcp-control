import type { UserRole } from "@/lib/types/database";

/**
 * Matriz de permissões (áreas e ações).
 * - Operador / Logística: só as linhas em `operator_lines`.
 * - PCP: vê Compras; pode sinalizar “material chegou” (independente da NF); não cria PC nem vínculos.
 * - Comercial: área comercial + dashboard de produção (não edita pedidos gerais).
 * - Compras: vê/altera compras; dashboard dedicado a compras (sem lista Pedidos).
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
    "faturamento",
  ] as UserRole[],

  /** Tela de lista de pedidos de venda (importação / edição) — não inclui Compras */
  viewOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  viewComercial: ["super_admin", "manager", "comercial"] as UserRole[],

  /** Aba Compras (inclui PCP em leitura) */
  viewCompras: ["super_admin", "manager", "compras", "pcp"] as UserRole[],

  /** Criar/editar/excluir PC, vínculos, importar PDF de compra */
  editCompras: ["super_admin", "manager", "compras"] as UserRole[],

  /**
   * Sinalizar que o material do PC já chegou (físico), independente de NF/Omie.
   * PCP usa isso para liberar produção enquanto a nota ainda não entrou.
   */
  markComprasMaterialArrived: [
    "super_admin",
    "manager",
    "compras",
    "pcp",
  ] as UserRole[],

  viewAllLines: ["super_admin", "manager", "pcp"] as UserRole[],

  viewSettings: ["super_admin", "manager"] as UserRole[],

  importOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  importComprasPdfs: ["super_admin", "manager", "compras"] as UserRole[],

  editOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  /** Prazo de vendas na tela /comercial (Comercial e gestão) */
  editComercialDeliveryDeadline: ["super_admin", "manager", "comercial"] as UserRole[],

  finishOrders: ["super_admin", "manager", "pcp"] as UserRole[],

  allocateItems: ["super_admin", "manager", "pcp"] as UserRole[],

  scheduleItems: ["super_admin", "manager", "pcp", "operator", "logistica"] as UserRole[],

  completeItems: ["super_admin", "manager", "pcp", "operator", "logistica"] as UserRole[],

  manageCompany: ["super_admin", "manager"] as UserRole[],

  manageUsers: ["super_admin", "manager"] as UserRole[],

  manageLines: ["super_admin", "manager"] as UserRole[],

  manageHolidays: ["super_admin", "manager"] as UserRole[],

  /** Catálogo de caixas de papelão (etiqueta de embalagem) */
  managePackagingBoxes: ["super_admin", "manager"] as UserRole[],

  /** Aba Faturamento: listas de embarque */
  viewFaturamento: [
    "super_admin",
    "manager",
    "pcp",
    "logistica",
    "faturamento",
  ] as UserRole[],

  /** Aba Expedição (Logística): bipar volumes, foto da carga, finalizar */
  viewExpedicao: [
    "super_admin",
    "manager",
    "pcp",
    "logistica",
    "operator",
  ] as UserRole[],

  /** CQ: categorias em Configurações */
  manageCQCategorias: ["super_admin", "manager"] as UserRole[],

  /** Dashboard de ocorrências CQ (super admin + gestão) */
  viewCQDashboard: ["super_admin", "manager"] as UserRole[],

  /** Quadro de atividades (Kanban) */
  viewTasks: [
    "super_admin",
    "manager",
    "pcp",
    "operator",
    "comercial",
    "compras",
  ] as UserRole[],

  createTasks: ["super_admin", "manager", "pcp"] as UserRole[],

  editTasks: ["super_admin", "manager", "pcp"] as UserRole[],

  deleteTasks: ["super_admin", "manager"] as UserRole[],

  assignTasks: ["super_admin", "manager", "pcp"] as UserRole[],
};

/** Perfis no Supabase às vezes usam `admin`; no app equivale a manager. */
export function normalizeUserRole(userRole: UserRole | string | null | undefined): UserRole {
  if (!userRole) return "operator";
  const s = String(userRole).trim().toLowerCase();
  if (s === "admin") return "manager";
  return s as UserRole;
}

export type StaffPosition =
  | "pcp"
  | "operator"
  | "comercial"
  | "compras"
  | "logistica"
  | "faturamento";

export const STAFF_POSITIONS: { value: StaffPosition; label: string }[] = [
  { value: "pcp", label: "PCP" },
  { value: "operator", label: "Operador" },
  { value: "comercial", label: "Comercial" },
  { value: "compras", label: "Compras" },
  { value: "logistica", label: "Logística" },
  { value: "faturamento", label: "Faturamento" },
];

const STAFF_POSITION_SET = new Set<string>(STAFF_POSITIONS.map((p) => p.value));

export function parseStaffPosition(
  role: string | null | undefined
): StaffPosition {
  const s = String(role ?? "").trim().toLowerCase();
  if (STAFF_POSITION_SET.has(s)) return s as StaffPosition;
  return "operator";
}

export function staffPositionLabel(role: string | null | undefined): string {
  const found = STAFF_POSITIONS.find((p) => p.value === role);
  if (found) return found.label;
  if (role === "manager" || role === "admin") return "Manager";
  if (role === "super_admin") return "Super Admin";
  return role || "—";
}

/** Perfil, ou só o cargo textual (APIs antigas). */
export type PermissionActor =
  | UserRole
  | string
  | null
  | undefined
  | {
      role?: UserRole | string | null;
      extra_roles?: (UserRole | string | null | undefined)[] | null;
    };

function isActorObject(
  actor: PermissionActor
): actor is {
  role?: UserRole | string | null;
  extra_roles?: (UserRole | string | null | undefined)[] | null;
} {
  return typeof actor === "object" && actor !== null && !Array.isArray(actor);
}

function pushNormalizedRole(out: UserRole[], raw: unknown) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return;
  const n = s === "admin" ? "manager" : (s as UserRole);
  if (!out.includes(n)) out.push(n);
}

/** União do cargo principal com os extras. */
export function collectActorRoles(actor: PermissionActor): UserRole[] {
  const out: UserRole[] = [];
  if (isActorObject(actor)) {
    pushNormalizedRole(out, actor.role);
    for (const extra of actor.extra_roles ?? []) {
      pushNormalizedRole(out, extra);
    }
    if (out.length === 0) out.push("operator");
    return out;
  }
  if (actor == null || actor === "") {
    return ["operator"];
  }
  pushNormalizedRole(out, actor);
  return out.length > 0 ? out : ["operator"];
}

export function parseExtraRoles(
  raw: unknown,
  primaryRole?: string | null
): StaffPosition[] {
  const primary = String(primaryRole ?? "").trim().toLowerCase();
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,\s]+/)
      : [];
  const out: StaffPosition[] = [];
  for (const item of list) {
    const s = String(item ?? "").trim().toLowerCase();
    if (!STAFF_POSITION_SET.has(s) || s === primary) continue;
    if (!out.includes(s as StaffPosition)) out.push(s as StaffPosition);
  }
  return out;
}

export function formatStaffPositionsLabel(
  primary: string | null | undefined,
  extra?: (string | null | undefined)[] | null
): string {
  const roles = collectActorRoles({ role: primary, extra_roles: extra ?? [] });
  return roles.map((r) => staffPositionLabel(r)).join(" · ");
}

export function actorUsesOperatorLines(actor: PermissionActor): boolean {
  return collectActorRoles(actor).some(
    (r) => r === "operator" || r === "logistica"
  );
}

/**
 * Rota padrão após login. Áreas “estreitas” vão para o dashboard de produção
 * (KPIs gerais); o menu leva a Comercial, Compras, etc.
 */
export function defaultAppPathForRole(
  userRole: UserRole | string | null | undefined
): string {
  const r = normalizeUserRole(userRole);
  if (r === "comercial" || r === "compras" || r === "logistica" || r === "faturamento") {
    return "/dashboard";
  }
  return "/dashboard";
}

export function hasPermission(
  actor: PermissionActor,
  permission: keyof typeof PERMISSIONS
): boolean {
  const allowed = PERMISSIONS[permission];
  return collectActorRoles(actor).some((r) => allowed.includes(r));
}

/** Menu lateral: linhas (operador, logística, PCP, gestão). Não: só comercial ou só leitura global sem linha. */
export function canViewProductionLineMenu(actor: PermissionActor): boolean {
  return collectActorRoles(actor).some(
    (r) =>
      r === "super_admin" ||
      r === "manager" ||
      r === "pcp" ||
      r === "operator" ||
      r === "logistica"
  );
}

export function canAccessLine(
  actor: PermissionActor,
  lineId: string,
  operatorLines: string[]
): boolean {
  const roles = collectActorRoles(actor);
  if (roles.some((r) => r === "super_admin" || r === "manager" || r === "pcp")) {
    return true;
  }
  if (roles.some((r) => r === "operator" || r === "logistica")) {
    return operatorLines.includes(lineId);
  }
  return false;
}
