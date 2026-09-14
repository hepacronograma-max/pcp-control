import type { PackagingBox } from "@/lib/types/database";

export type { PackagingBox };

export type PackagingBoxInput = {
  code: string;
  name: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  empty_weight_kg: number | null;
  stock_quantity: number;
  active: boolean;
};

function asTrimmedString(value: unknown, field: string, max: number): string | { error: string } {
  if (typeof value !== "string" && typeof value !== "number") {
    return { error: `${field} é obrigatório` };
  }
  const s = String(value).trim();
  if (!s) return { error: `${field} é obrigatório` };
  if (s.length > max) return { error: `${field} deve ter no máximo ${max} caracteres` };
  return s;
}

function asPositiveNumber(value: unknown, field: string): number | { error: string } {
  if (value === "" || value === null || value === undefined) {
    return { error: `${field} é obrigatório` };
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${field} deve ser um número maior que zero` };
  }
  return Math.round(n * 100) / 100;
}

function asOptionalNonNegativeNumber(
  value: unknown
): number | null | { error: string } {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) {
    return { error: "Peso vazio deve ser um número maior ou igual a zero" };
  }
  return Math.round(n * 1000) / 1000;
}

function isErr<T>(v: T | { error: string }): v is { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

export function parsePackagingBoxPayload(
  body: unknown
): { ok: true; data: PackagingBoxInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Dados inválidos" };
  }
  const raw = body as Record<string, unknown>;

  const code = asTrimmedString(raw.code, "Código", 64);
  if (isErr(code)) return { ok: false, error: code.error };

  const name = asTrimmedString(raw.name, "Nome", 255);
  if (isErr(name)) return { ok: false, error: name.error };

  const length_cm = asPositiveNumber(raw.length_cm, "Comprimento");
  if (isErr(length_cm)) return { ok: false, error: length_cm.error };

  const width_cm = asPositiveNumber(raw.width_cm, "Largura");
  if (isErr(width_cm)) return { ok: false, error: width_cm.error };

  const height_cm = asPositiveNumber(raw.height_cm, "Altura");
  if (isErr(height_cm)) return { ok: false, error: height_cm.error };

  const empty_weight_kg = asOptionalNonNegativeNumber(raw.empty_weight_kg);
  if (isErr(empty_weight_kg)) return { ok: false, error: empty_weight_kg.error };

  const active = raw.active === false || raw.active === "false" ? false : true;

  return {
    ok: true,
    data: {
      code,
      name,
      length_cm,
      width_cm,
      height_cm,
      empty_weight_kg,
      stock_quantity: 0,
      active,
    },
  };
}

const AVULSA_PREFIX = "AV-";

export function isAvulsaBoxCode(code: string | null | undefined): boolean {
  return String(code || "").toUpperCase().startsWith(AVULSA_PREFIX);
}

export function buildAvulsaBoxCode(
  dims: Pick<PackagingBox, "length_cm" | "width_cm" | "height_cm">
): string {
  const fmt = (n: number) => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : String(r);
  };
  return `${AVULSA_PREFIX}${fmt(dims.length_cm)}x${fmt(dims.width_cm)}x${fmt(dims.height_cm)}`;
}

export function parseCustomBoxSize(
  value: unknown
):
  | { ok: true; length_cm: number; width_cm: number; height_cm: number }
  | { ok: false; error: string } {
  if (value === "" || value === null || value === undefined) {
    return { ok: false, error: "Informe o tamanho da caixa (ex.: 123x20x63)." };
  }
  const raw = String(value)
    .trim()
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/\*/g, "x")
    .replace(/,/g, ".");
  const parts = raw.split(/x/).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 3) {
    return {
      ok: false,
      error: "Tamanho customizado: use C×L×A em cm (ex.: 123x20x63).",
    };
  }
  const length_cm = asPositiveNumber(parts[0], "Comprimento");
  if (isErr(length_cm)) return { ok: false, error: length_cm.error };
  const width_cm = asPositiveNumber(parts[1], "Largura");
  if (isErr(width_cm)) return { ok: false, error: width_cm.error };
  const height_cm = asPositiveNumber(parts[2], "Altura");
  if (isErr(height_cm)) return { ok: false, error: height_cm.error };
  return { ok: true, length_cm, width_cm, height_cm };
}

export function formatBoxDimensions(box: Pick<PackagingBox, "length_cm" | "width_cm" | "height_cm">): string {
  const fmt = (n: number) =>
    Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return `${fmt(Number(box.length_cm))} × ${fmt(Number(box.width_cm))} × ${fmt(Number(box.height_cm))} cm`;
}

export function mapPgPackagingBoxError(message: string | undefined): string | null {
  if (!message) return null;
  const m = message.toLowerCase();
  if (m.includes("idx_packaging_boxes_company_code") || m.includes("duplicate")) {
    return "Já existe uma caixa com este código nesta empresa.";
  }
  if (m.includes("packaging_boxes_dims_positive")) {
    return "Comprimento, largura e altura devem ser maiores que zero.";
  }
  if (m.includes("packaging_boxes_stock_nonneg")) {
    return "Estoque não pode ser negativo.";
  }
  if (m.includes("does not exist") || m.includes("schema cache")) {
    return "Tabela packaging_boxes ausente. Execute supabase-packaging-boxes.sql no SQL Editor do Supabase.";
  }
  return null;
}
