/** Roteador: família do filtro → template + foto do certificado. */

import { parseFamilia, type FamiliaParseada } from "@/lib/motor-vazao/parse-familia";
import {
  templatePorTipo,
  type TemplateCertificado,
  type TipoCertificado,
} from "./templates";

export type FotoCertificado =
  | "cunha"
  | "plano"
  | "bolsa"
  | "plano-grosso"
  | "plissado";

/**
 * Arquivos em /public/certificados/.
 * Mapeamento semântico (nome do arquivo = tipo).
 * GP/PL: fotos comparativas (2 filtros na mesma imagem) — ok por enquanto.
 */
export const FOTO_PATH: Record<FotoCertificado, string> = {
  cunha: "/certificados/filtro-cunha.png",
  plano: "/certificados/filtro-plano.png",
  bolsa: "/certificados/filtro-bolsa.png",
  "plano-grosso": "/certificados/filtro-plano-grosso.png",
  plissado: "/certificados/filtro-plissado.png",
};

export const LOGO_HEPA_PATH = "/certificados/logo-hepa.png";

export type RoteamentoCertificado = {
  tipo: TipoCertificado;
  template: TemplateCertificado;
  foto: FotoCertificado;
  fotoPath: string;
  /** Acima de F9 / absoluto-fino: sai automático. BSF/GP/PL: só sob solicitação. */
  saiAutomatico: boolean;
  familia: FamiliaParseada;
  modeloFamilia: string | null;
  paginas: 1 | 2;
};

function familiaBase(modelo: string | null): string | null {
  if (!modelo) return null;
  const m = modelo.toUpperCase();
  if (m.startsWith("ABSPI") || m.startsWith("ABSP")) return "ABSP";
  if (m.startsWith("ABSW")) return "ABSW";
  /** FFW = Filtro Fino + Cunha (F7/F8/F9). */
  if (m.startsWith("FFW")) return "FFW";
  /** FF4W / FF4WC = fino em cunha (mesmo certificado que FFW). */
  if (/^FF\d+WC?$/.test(m)) return "FFW";
  if (m.startsWith("FFP")) return "FFP";
  if (m.startsWith("BSF") || m.startsWith("BSM") || m.startsWith("BSG"))
    return "BSF";
  if (m === "GP") return "GP";
  if (m === "PL") return "PL";
  if (m.startsWith("HESP")) return "HESP";
  return m;
}

export function rotearCertificado(
  productCode: string | null | undefined,
  description: string | null | undefined
): RoteamentoCertificado | null {
  const familia = parseFamilia(productCode, description);
  const base = familiaBase(familia.modelo);

  let tipo: TipoCertificado;
  let foto: FotoCertificado;
  let saiAutomatico: boolean;

  switch (base) {
    case "ABSW":
      tipo = "A";
      foto = "cunha";
      saiAutomatico = true;
      break;
    case "ABSP":
      tipo = "A";
      foto = "plano";
      saiAutomatico = true;
      break;
    case "FFW":
      /** Fino em cunha (F7/F8/F9): mesmo checklist/norma do FFP, foto de cunha. */
      tipo = "B";
      foto = "cunha";
      saiAutomatico = true;
      break;
    case "FFP":
      tipo = "B";
      foto = "plano";
      saiAutomatico = true;
      break;
    case "BSF":
      tipo = "C";
      foto = "bolsa";
      saiAutomatico = false;
      break;
    case "GP":
      tipo = "D";
      foto = "plano-grosso";
      saiAutomatico = false;
      break;
    case "PL":
      tipo = "D";
      foto = "plissado";
      saiAutomatico = false;
      break;
    default:
      return null;
  }

  const template = templatePorTipo(tipo);
  return {
    tipo,
    template,
    foto,
    fotoPath: FOTO_PATH[foto],
    saiAutomatico,
    familia,
    modeloFamilia: base,
    paginas: 1,
  };
}
