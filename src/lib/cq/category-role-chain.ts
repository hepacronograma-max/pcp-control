import { normalizeUserRole } from "@/lib/utils/permissions";

/**
 * Se não existirem categorias para o papel exato, tenta cargos relacionados
 * (ex.: manager usa categorias de PCP; seeds não incluem "manager").
 * Logística/registo na linha: alinha com categorias de operador.
 */
export function categoryRoleFallbackChain(role: string): string[] {
  const r = normalizeUserRole(role);
  switch (r) {
    case "super_admin":
      return ["super_admin", "manager", "pcp"];
    case "manager":
      return ["manager", "pcp"];
    case "logistica":
      return ["logistica", "operator"];
    default:
      return [r];
  }
}
