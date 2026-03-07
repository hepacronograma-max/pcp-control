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

export function hasPermission(
  userRole: UserRole,
  permission: keyof typeof PERMISSIONS
): boolean {
  return PERMISSIONS[permission].includes(userRole);
}

export function canAccessLine(
  userRole: UserRole,
  lineId: string,
  operatorLines: string[]
): boolean {
  if (["super_admin", "manager", "pcp"].includes(userRole)) return true;
  return operatorLines.includes(lineId);
}

