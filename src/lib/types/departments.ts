export interface Department {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

/** Nomes padrão (espelho do seed SQL / localStorage). */
export const DEFAULT_DEPARTMENT_NAMES = [
  "Engenharia",
  "Produção",
  "Compras",
  "Comercial",
  "PCP",
  "Qualidade",
  "Manutenção",
  "Logística",
  "RH",
  "TI",
] as const;

const DEPT_COLOR_CLASS: Record<string, string> = {
  engenharia: "bg-violet-100 text-violet-900 border-violet-200",
  produção: "bg-sky-100 text-sky-900 border-sky-200",
  producao: "bg-sky-100 text-sky-900 border-sky-200",
  compras: "bg-amber-100 text-amber-900 border-amber-200",
  comercial: "bg-emerald-100 text-emerald-900 border-emerald-200",
  pcp: "bg-blue-100 text-blue-900 border-blue-200",
  qualidade: "bg-rose-100 text-rose-900 border-rose-200",
  manutenção: "bg-orange-100 text-orange-900 border-orange-200",
  manutencao: "bg-orange-100 text-orange-900 border-orange-200",
  logística: "bg-cyan-100 text-cyan-900 border-cyan-200",
  logistica: "bg-cyan-100 text-cyan-900 border-cyan-200",
  rh: "bg-pink-100 text-pink-900 border-pink-200",
  ti: "bg-indigo-100 text-indigo-900 border-indigo-200",
};

function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function departmentChipClasses(name: string): string {
  return DEPT_COLOR_CLASS[slug(name)] ?? "bg-slate-100 text-slate-800 border-slate-200";
}
