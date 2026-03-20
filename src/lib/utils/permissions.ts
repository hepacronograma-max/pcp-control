import type { UserRole } from "@/lib/types/database";

export const PERMISSIONS = {
  viewDashboard: ["super_admin", "manager", "pcp", "operator"] as UserRole[],
  viewOrders: ["super_admin", "manager", "pcp"] as UserRole[],
  viewAllLines: ["super_admin", "manager", "pcp"] as UserRole[],
  viewSettings: ["super_admin", "manager"] as UserRole[],

  importOrders: ["manager", "pcp"] as UserRole[],
  editOrders: ["manager", "pcp"] as UserRole[],
  finishOrders: ["manager", "pcp"] as UserRole[],

  allocateItems: ["manager", "pcp"] as UserRole[],
  scheduleItems: ["manager", "pcp", "operator"] as UserRole[],
  completeItems: ["manager", "pcp", "operator"] as UserRole[],

  manageCompany: ["manager"] as UserRole[],
  manageUsers: ["manager"] as UserRole[],
  manageLines: ["manager"] as UserRole[],
  manageHolidays: ["manager"] as UserRole[],
};

/** Perfis no Supabase às vezes usam `admin`; no app equivale a manager. */
export function normalizeUserRole(userRole: UserRole | string | null | undefined): UserRole {
  if (!userRole) return "operator";
  if (userRole === "admin") return "manager";
  return userRole as UserRole;
}

export function hasPermission(
  userRole: UserRole | string | null | undefined,
  permission: keyof typeof PERMISSIONS
): boolean {
  const r = normalizeUserRole(userRole);
  return PERMISSIONS[permission].includes(r);
}

export function canAccessLine(
  userRole: UserRole | string | null | undefined,
  lineId: string,
  operatorLines: string[]
): boolean {
  const r = normalizeUserRole(userRole);
  if (["super_admin", "manager", "pcp"].includes(r)) return true;
  return operatorLines.includes(lineId);
}

