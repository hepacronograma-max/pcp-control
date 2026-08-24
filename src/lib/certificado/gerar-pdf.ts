/**
 * Gerador de PDF — layout EXATO dos moldes em docs/certificado/:
 * - MODELO-certificado-tipoA-HEPA.html (frente + verso)
 * - MODELO-certificado-tipoBCD-Padrao.html (1 página)
 *
 * Fino/bolsa: 2 gráficos em largura total. Sem quadro lateral DESEMPENHO.
 * Conclusão discreta abaixo dos gráficos (drawConclusaoDiscreta).
 */

import {
  GERADOR_AEROSSOL,
  INSTRUMENTO_TESTE,
  pathAssinatura,
} from "./dados-fixos";
import {
  normaDoTemplate,
  textoClasseComNorma,
  toleranciaChecklist,
  type ChecklistItem,
  type TemplateCertificado,
} from "./templates";
import {
  LOGO_HEPA_PATH,
  type RoteamentoCertificado,
} from "./roteador";
import { renderCertificadoChartPng, cssColor } from "./graficos-chartjs";

export type CertificadoItemInput = {
  product_code: string | null;
  description: string;
  dimensoes: string | null;
  lote: string;
  serie: number;
  serieTotal: number;
  /** Pedido interno HEPA (produção). */
  pedido: string;
  orcamento?: string | null;
};

export type CertificadoPdfParams = {
  item: CertificadoItemInput;
  roteamento: RoteamentoCertificado;
  vazao: number | null;
  dPi: number | null;
  dPf: number | null;
  classe?: string | null;
  elaborador: string;
  aprovador: string;
  dataEmissao?: Date;
  logoDataUrl: string | null;
  fotoDataUrl: string | null;
  /** PNG da assinatura (acima da linha). Null = so o nome. */
  assinaturaElaboradorDataUrl?: string | null;
  assinaturaAprovadorDataUrl?: string | null;
};

/* ===== Cores / medidas do molde (A4, margin 8mm) ===== */
const M = 8; // @page margin
const PAGE_W = 210;
const PAGE_H = 297;
const INNER_W = PAGE_W - M * 2; // 194
const BORDER = 0.5; // ~2px
const BLACK: [number, number, number] = [17, 17, 17];
const GRAY_BD: [number, number, number] = [153, 153, 153];
const LBL_BG: [number, number, number] = [238, 238, 238];
const TH_BG: [number, number, number] = [221, 221, 221];
const LEGENDA_BG: [number, number, number] = [204, 204, 204];
const OK_BG: [number, number, number] = [26, 156, 76];
const TESTE_BG: [number, number, number] = [255, 248, 220];
const CURVA_INI: [number, number, number] = [20, 90, 185]; // azul Pi
const CURVA_FIN: [number, number, number] = [8, 132, 58]; // verde Pf
const AVISO_RED: [number, number, number] = [204, 0, 0];
const APROV_GREEN: [number, number, number] = [26, 124, 60];
const MUTED: [number, number, number] = [85, 85, 85];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPdfDoc = any;

function fmtData(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function parseAreaFrontalM2(dimensoes: string | null): number | null {
  if (!dimensoes) return null;
  const m = dimensoes.match(/(\d+)\s*[xX×]\s*(\d+)/);
  if (!m) return null;
  const a = Number(m[1]) / 1000;
  const b = Number(m[2]) / 1000;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return a * b;
}

const PA_POR_MMCA = 9.80665;

type Ponto = { x: number; y: number };

function paParaMmca(pa: number): number {
  return pa / PA_POR_MMCA;
}

/** Curva ΔP ∝ Q², estendida um pouco além do ponto de operação. */
function pontosCurvaQ(vazao: number, dP: number, n = 128): Ponto[] {
  if (vazao <= 0 || dP < 0) return [];
  const qMax = vazao * 1.08;
  const pts: Ponto[] = [];
  for (let i = 0; i <= n; i++) {
    const q = (qMax * i) / n;
    const t = q / vazao;
    pts.push({ x: q, y: dP * t * t });
  }
  return pts;
}

function pontosCurvaVel(
  vazao: number,
  dP: number,
  areaM2: number,
  n = 128
): Ponto[] {
  if (vazao <= 0 || dP < 0 || areaM2 <= 0) return [];
  const vNom = vazao / (areaM2 * 3600);
  const vMax = vNom * 1.08;
  const pts: Ponto[] = [];
  for (let i = 0; i <= n; i++) {
    const v = (vMax * i) / n;
    const q = v * areaM2 * 3600;
    const t = q / vazao;
    pts.push({ x: v, y: dP * t * t });
  }
  return pts;
}

function strokeRect(
  doc: JsPdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  lw = BORDER
) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h, "S");
}

function strokeRectOpenTop(
  doc: JsPdfDoc,
  x: number,
  y: number,
  w: number,
  h: number,
  lw = BORDER
) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(lw);
  doc.line(x, y, x, y + h);
  doc.line(x + w, y, x + w, y + h);
  doc.line(x, y + h, x + w, y + h);
}

async function loadImageAsDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadAssinaturaDataUrl(
  nome: string | null | undefined
): Promise<string | null> {
  const path = pathAssinatura(nome);
  if (!path) return null;
  return loadImageAsDataUrl(path);
}

/**
 * Recorta padding vazio, escurece o traço e devolve PNG para o PDF.
 * Funciona no browser e no Node (@napi-rs/canvas).
 */
export async function enhanceAssinaturaDataUrl(
  dataUrl: string | null | undefined
): Promise<string | null> {
  if (!dataUrl) return null;
  try {
    const m = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!m?.[1]) return dataUrl;

    type ImgLike = {
      width: number;
      height: number;
    };
    type CanvasLike = {
      width: number;
      height: number;
      getContext: (t: "2d") => CanvasRenderingContext2D | null;
      toDataURL: (type?: string) => string;
    };

    let img: ImgLike;
    let makeCanvas: (w: number, h: number) => CanvasLike;

    if (typeof document !== "undefined") {
      const el = new Image();
      el.src = dataUrl;
      await el.decode();
      img = el;
      makeCanvas = (w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      };
    } else {
      const spec = ["@napi-rs", "canvas"].join("/");
      const mod = (await import(spec)) as {
        loadImage: (buf: Buffer) => Promise<ImgLike>;
        createCanvas: (w: number, h: number) => CanvasLike;
      };
      img = await mod.loadImage(Buffer.from(m[1], "base64"));
      makeCanvas = (w, h) => mod.createCanvas(w, h);
    }

    const src = makeCanvas(img.width, img.height);
    const sctx = src.getContext("2d");
    if (!sctx) return dataUrl;
    sctx.drawImage(img as CanvasImageSource, 0, 0);
    const { data, width, height } = sctx.getImageData(0, 0, img.width, img.height);

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let inkCount = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const a = data[i + 3]!;
        const lum = (r + g + b) / 3;
        const fundoPreto = lum < 40 && a > 200;
        const ink = a > 55 && !fundoPreto;
        if (!ink) continue;
        inkCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (inkCount < 40) return dataUrl;

    const pad = 2;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY);

    /** Recorta linhas quase vazias no topo/base (aproxima o traço da linha do PDF). */
    const rowInk = (yy: number, x0: number, x1: number) => {
      let s = 0;
      for (let xx = x0; xx <= x1; xx++) {
        const i = (yy * width + xx) * 4;
        const a = data[i + 3]!;
        const lum = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
        if (a > 55 && !(lum < 40 && a > 200)) s += a;
      }
      return s;
    };
    while (minY < maxY && rowInk(minY, minX, maxX) < 800) minY++;
    while (maxY > minY && rowInk(maxY, minX, maxX) < 800) maxY--;

    let maxRow = 0;
    for (let yy = minY; yy <= maxY; yy++) {
      maxRow = Math.max(maxRow, rowInk(yy, minX, maxX));
    }
    const thr = Math.max(400, maxRow * 0.05);
    while (minY < maxY && rowInk(minY, minX, maxX) < thr) minY++;
    while (maxY > minY && rowInk(maxY, minX, maxX) < thr) maxY--;
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = makeCanvas(cw, ch);
    const octx = out.getContext("2d");
    if (!octx) return dataUrl;
    const outImg = octx.createImageData(cw, ch);
    const od = outImg.data;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const si = ((minY + y) * width + (minX + x)) * 4;
        const di = (y * cw + x) * 4;
        const r = data[si]!;
        const g = data[si + 1]!;
        const b = data[si + 2]!;
        const a = data[si + 3]!;
        const lum = (r + g + b) / 3;
        const fundoPreto = lum < 40 && a > 200;
        const ink = a > 40 && !fundoPreto;
        if (!ink) {
          od[di] = 0;
          od[di + 1] = 0;
          od[di + 2] = 0;
          od[di + 3] = 0;
          continue;
        }
        /** Azul-tinta; densidade alta (Fernanda) fica mais suave. */
        const strength = Math.min(
          1,
          Math.max(a / 180, (255 - Math.min(lum, 230)) / 140) * 1.55
        );
        od[di] = 8;
        od[di + 1] = 32;
        od[di + 2] = 105;
        od[di + 3] = Math.min(255, Math.round(70 + strength * 185));
      }
    }

    let inkPx = 0;
    for (let i = 3; i < od.length; i += 4) {
      if (od[i]! > 40) inkPx++;
    }
    const coverage = inkPx / Math.max(1, cw * ch);
    /** Só espessa traço fino (ex.: Leonardo). Assinatura cheia não precisa. */
    if (coverage < 0.12) {
      const thick = octx.createImageData(cw, ch);
      const td = thick.data;
      td.set(od);
      for (let y = 1; y < ch - 1; y++) {
        for (let x = 1; x < cw - 1; x++) {
          const di = (y * cw + x) * 4;
          if (od[di + 3]! > 80) continue;
          let best = 0;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const ni = ((y + dy) * cw + (x + dx)) * 4;
            best = Math.max(best, od[ni + 3]!);
          }
          if (best > 140) {
            td[di] = 8;
            td[di + 1] = 32;
            td[di + 2] = 105;
            td[di + 3] = Math.min(200, Math.round(best * 0.65));
          }
        }
      }
      octx.putImageData(thick, 0, 0);
    } else {
      /** Traço já grosso: só suaviza opacidade. */
      for (let i = 3; i < od.length; i += 4) {
        if (od[i]! > 0) od[i] = Math.min(210, Math.round(od[i]! * 0.82));
      }
      octx.putImageData(outImg, 0, 0);
    }
    return out.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

export async function carregarAssetsCertificado(
  _fotoPath?: string,
  pessoas?: { elaborador?: string; aprovador?: string }
): Promise<{
  logoDataUrl: string | null;
  fotoDataUrl: string | null;
  assinaturaElaboradorDataUrl: string | null;
  assinaturaAprovadorDataUrl: string | null;
}> {
  const [logoDataUrl, assinaturaElaboradorDataUrl, assinaturaAprovadorDataUrl] =
    await Promise.all([
      loadImageAsDataUrl(LOGO_HEPA_PATH),
      loadAssinaturaDataUrl(pessoas?.elaborador),
      loadAssinaturaDataUrl(pessoas?.aprovador),
    ]);
  /** Foto do filtro removida do certificado — mantém a chave por compatibilidade. */
  return {
    logoDataUrl,
    fotoDataUrl: null,
    assinaturaElaboradorDataUrl,
    assinaturaAprovadorDataUrl,
  };
}

/* ---------- Cabeçalho (molde .cab) ---------- */
/** Proporção real de public/certificados/logo-hepa.png (328×245). */
const LOGO_HEPA_RATIO = 328 / 245;

function fitImageInBox(
  boxW: number,
  boxH: number,
  aspectWOverH: number
): { w: number; h: number; x: number; y: number } {
  let w = boxW;
  let h = w / aspectWOverH;
  if (h > boxH) {
    h = boxH;
    w = h * aspectWOverH;
  }
  return {
    w,
    h,
    x: (boxW - w) / 2,
    y: (boxH - h) / 2,
  };
}

function drawCab(
  doc: JsPdfDoc,
  params: CertificadoPdfParams,
  dataStr: string,
  y: number,
  opts: { laboratorio: boolean }
): number {
  const h = opts.laboratorio ? 20 : 14;
  /** Logo: célula larga o bastante para a proporção 328:245 sem espremer. */
  const logoW = opts.laboratorio ? 48 : 46;
  const dirW = opts.laboratorio ? 54 : 48;
  const tituloW = INNER_W - logoW - dirW;

  strokeRect(doc, M, y, INNER_W, h);

  // logo — proporção original, centralizado
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(BORDER);
  doc.line(M + logoW, y, M + logoW, y + h);
  if (params.logoDataUrl) {
    try {
      const padX = 2;
      const padY = 2;
      const fitted = fitImageInBox(
        logoW - padX * 2,
        h - padY * 2,
        LOGO_HEPA_RATIO
      );
      doc.addImage(
        params.logoDataUrl,
        "PNG",
        M + padX + fitted.x,
        y + padY + fitted.y,
        fitted.w,
        fitted.h
      );
    } catch {
      /* ignore */
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    doc.text("HEPA", M + logoW / 2, y + h / 2 + 1, { align: "center" });
  }

  // título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(opts.laboratorio ? 11.5 : 14);
  doc.setTextColor(...BLACK);
  doc.text(
    "CERTIFICADO DE QUALIDADE",
    M + logoW + tituloW / 2,
    y + h / 2 + 1.5,
    { align: "center" }
  );

  // direita — texto contido no quadro (quebra explícita)
  doc.line(M + logoW + tituloW, y, M + logoW + tituloW, y + h);
  const dx = M + logoW + tituloW + 1.8;
  const dMaxW = dirW - 4;
  doc.setTextColor(...BLACK);
  let ty = y + 3.5;
  if (opts.laboratorio) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.2);
    for (const ln of ["TESTE DE QUALIDADE", "LABORATORIO"]) {
      doc.text(ln, dx, ty, { maxWidth: dMaxW });
      ty += 2.8;
    }
    ty += 0.6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  const certTxt = `CERTIFICADO Nº ${params.item.pedido}`;
  const certLines = doc.splitTextToSize(certTxt, dMaxW) as string[];
  for (const ln of certLines) {
    doc.text(ln, dx, ty);
    ty += 2.8;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.text(`DATA: ${dataStr}`, dx, ty);

  return y + h;
}

/* ---------- Bloco identificação (largura total — sem foto) ---------- */
function drawIdBloco(
  doc: JsPdfDoc,
  params: CertificadoPdfParams,
  template: TemplateCertificado,
  y: number
): number {
  const tabW = INNER_W;
  const item = params.item;
  const rowH = 5.5;
  const lblH = 4.8;
  const legendH = 6.4;
  const startY = y;
  let ry = y;

  const hLine = (yy: number) => {
    doc.setDrawColor(...GRAY_BD);
    doc.setLineWidth(0.2);
    doc.line(M, yy, M + tabW, yy);
  };
  const vLine = (x: number, y0: number, h: number) => {
    doc.setDrawColor(...GRAY_BD);
    doc.setLineWidth(0.2);
    doc.line(x, y0, x, y0 + h);
  };

  const drawPairLabels = (l1: string, l2: string, split = 0.5) => {
    const mid = M + tabW * split;
    doc.setFillColor(...LBL_BG);
    doc.rect(M + BORDER / 2, ry + BORDER / 2, tabW * split - BORDER / 2, lblH, "F");
    doc.rect(mid, ry + BORDER / 2, tabW * (1 - split) - BORDER / 2, lblH, "F");
    vLine(mid, ry, lblH);
    hLine(ry + lblH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.setTextColor(...BLACK);
    doc.text(l1, M + 2, ry + 3.3);
    doc.text(l2, mid + 2, ry + 3.3);
    ry += lblH;
  };

  const drawPairValues = (
    v1: string,
    v2: string,
    split = 0.5,
    opts?: { v2Size?: number; wrap2?: boolean }
  ) => {
    const mid = M + tabW * split;
    const v2Size = opts?.v2Size ?? 8;
    let thisH = rowH;
    doc.setFont("helvetica", "normal");
    if (opts?.wrap2) {
      doc.setFontSize(v2Size);
      const lines = doc.splitTextToSize(String(v2), tabW * (1 - split) - 4) as string[];
      thisH = Math.max(rowH, lines.length * 3.2 + 2);
    }
    vLine(mid, ry, thisH);
    hLine(ry + thisH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(String(v1).slice(0, 36), M + 2, ry + 3.8);
    doc.setFontSize(v2Size);
    if (opts?.wrap2) {
      const lines = doc.splitTextToSize(String(v2), tabW * (1 - split) - 4) as string[];
      let ty = ry + 3.6;
      for (const ln of lines.slice(0, 2)) {
        doc.text(ln, mid + 2, ty);
        ty += 3.2;
      }
    } else {
      doc.text(String(v2).slice(0, 52), mid + 2, ry + 3.8);
    }
    ry += thisH;
  };

  const codigo = item.product_code?.trim() || "-";
  const modelo = item.description?.trim() || "-";
  drawPairLabels("CODIGO", "MODELO", 0.28);
  drawPairValues(codigo, modelo, 0.28, { v2Size: 7, wrap2: true });

  drawPairLabels("N. LOTE / BATCH", "SERIE / SERIAL");
  drawPairValues(item.lote, `${item.serie}/${item.serieTotal}`);

  drawPairLabels("DIMENSAO (mm)", "NORMA");
  drawPairValues(
    item.dimensoes ?? "-",
    normaDoTemplate(template.familia),
    0.5,
    { v2Size: 7.5 }
  );

  drawPairLabels("N. PEDIDO HEPA", "ORCAMENTO");
  drawPairValues(item.pedido, item.orcamento?.trim() || "-");

  const classeTxt = textoClasseComNorma(params.classe, template.familia);

  if (template.temCurvaDesempenho) {
    const colW = [tabW * 0.22, tabW * 0.21, tabW * 0.21, tabW * 0.36];
    const xs = [
      M,
      M + colW[0]!,
      M + colW[0]! + colW[1]!,
      M + colW[0]! + colW[1]! + colW[2]!,
    ];
    doc.setFillColor(...LBL_BG);
    doc.rect(M + BORDER / 2, ry + BORDER / 2, tabW - BORDER, lblH, "F");
    vLine(xs[1]!, ry, lblH);
    vLine(xs[2]!, ry, lblH);
    vLine(xs[3]!, ry, lblH);
    hLine(ry + lblH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.0);
    doc.setTextColor(...BLACK);
    doc.text("VAZAO", xs[0]! + 2, ry + 3.3);
    doc.text("PRESSAO INICIAL", xs[1]! + 2, ry + 3.3);
    doc.text("PRESSAO FINAL", xs[2]! + 2, ry + 3.3);
    doc.text("CLASSE", xs[3]! + 2, ry + 3.3);
    ry += lblH;

    vLine(xs[1]!, ry, rowH);
    vLine(xs[2]!, ry, rowH);
    vLine(xs[3]!, ry, rowH);
    hLine(ry + rowH);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    const vazaoTxt =
      params.vazao != null ? `${params.vazao} m3/h` : "- m3/h";
    const piTxt = params.dPi != null ? `${params.dPi} Pa` : "- Pa";
    const pfTxt = params.dPf != null ? `${params.dPf} Pa` : "- Pa";
    doc.text(vazaoTxt, xs[0]! + 2, ry + 3.8);
    doc.text(piTxt, xs[1]! + 2, ry + 3.8);
    doc.text(pfTxt, xs[2]! + 2, ry + 3.8);
    const classeW = colW[3]! - 4;
    doc.setFontSize(6.2);
    if (doc.getTextWidth(classeTxt) > classeW) {
      const lines = doc.splitTextToSize(classeTxt, classeW) as string[];
      let ty = ry + 2.6;
      for (const ln of lines.slice(0, 2)) {
        doc.text(ln, xs[3]! + 2, ty);
        ty += 2.4;
      }
    } else {
      doc.text(classeTxt, xs[3]! + 2, ry + 3.8);
    }
    ry += rowH;
  } else {
    drawPairLabels("CLASSE", "");
    drawPairValues(classeTxt || " ", " ", 0.5, { v2Size: 7.5 });
  }

  doc.setFillColor(...LEGENDA_BG);
  doc.rect(M + BORDER / 2, ry, tabW - BORDER, legendH, "F");
  doc.setFillColor(180, 180, 180);
  doc.rect(M + 2.2, ry + 1.4, 16, 3.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(...BLACK);
  doc.text("Legenda", M + 3.4, ry + 4.0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const legendaTxt = template.temTesteBancada
    ? "N.A = Nao Aplica"
    : "N.A = Nao Aplica  |  Obs.: Todos os pedidos devem ser inspecionados.";
  doc.text(legendaTxt, M + 20.5, ry + 4.0);
  ry += legendH;

  strokeRectOpenTop(doc, M, startY, INNER_W, ry - startY);
  return ry;
}

/* ---------- Checklist ---------- */
function drawChecklist(
  doc: JsPdfDoc,
  template: TemplateCertificado,
  params: CertificadoPdfParams,
  y: number,
  opts?: { compact?: boolean; minRh?: number; headH?: number }
): number {
  const compact = !!opts?.compact;
  const colW = [
    8, // ITEM
    32, // CARACTERÍSTICA
    44, // DESCRIÇÃO
    26, // MEIO
    38, // TOLERÂNCIA (vazão + Pi/Pf)
    22, // FREQ
    24, // CERTIFICAÇÃO / PLANO
  ];
  const headers = [
    "ITEM",
    "CARACTERÍSTICA CRÍTICA",
    "DESCRIÇÃO",
    "MEIO DE MEDIÇÃO",
    "TOLERÂNCIA",
    "FREQ.",
    template.colunaCertificacao,
  ];

  const headH = opts?.headH ?? (compact ? 6.2 : 7.4);
  const fontBody = compact ? 5.4 : 6.1;
  const lineStep = compact ? 2.35 : 2.9;
  const minRh = opts?.minRh ?? (compact ? 5.6 : 6.6);
  const startY = y;

  doc.setFillColor(...TH_BG);
  doc.rect(M, y, INNER_W, headH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(compact ? 5.1 : 5.5);
  doc.setTextColor(...BLACK);
  let x = M;
  for (let i = 0; i < headers.length; i++) {
    const w = colW[i]!;
    if (i > 0) {
      doc.setDrawColor(...GRAY_BD);
      doc.setLineWidth(0.2);
      doc.line(x, y, x, y + headH);
    }
    const lines = doc.splitTextToSize(headers[i]!, w - 1.6) as string[];
    const totalH = lines.length * 2.3;
    let ty = y + (headH - totalH) / 2 + 2.1;
    for (const ln of lines) {
      doc.text(ln, x + w / 2, ty, { align: "center" });
      ty += 2.3;
    }
    x += w;
  }

  let cy = y + headH;
  const rows = template.checklist;

  for (const row of rows) {
    const tol = toleranciaChecklist(
      row,
      params.vazao,
      params.classe,
      params.dPi,
      params.dPf
    );
    const cells = [
      String(row.ordem),
      row.caracteristica,
      row.descricao,
      row.meio,
      tol,
      row.frequencia,
      "OK",
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontBody);
    let maxLines = 1;
    for (let i = 1; i <= 5; i++) {
      const lines = doc.splitTextToSize(cells[i]!, colW[i]! - 2) as string[];
      maxLines = Math.max(maxLines, lines.length);
    }
    const rh = Math.max(minRh, maxLines * lineStep + (compact ? 1.6 : 2.0));

    if (row.destaqueTeste) {
      doc.setFillColor(...TESTE_BG);
      doc.rect(M, cy, INNER_W, rh, "F");
    }

    doc.setDrawColor(...GRAY_BD);
    doc.setLineWidth(0.2);
    doc.rect(M, cy, INNER_W, rh, "S");

    x = M;
    for (let i = 0; i < cells.length; i++) {
      const w = colW[i]!;
      if (i > 0) doc.line(x, cy, x, cy + rh);

      if (i === 6) {
        doc.setFillColor(...OK_BG);
        doc.rect(x + 0.3, cy + 0.3, w - 0.6, rh - 0.6, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(compact ? 6.2 : 7);
        doc.setTextColor(255, 255, 255);
        doc.text("OK", x + w / 2, cy + rh / 2 + 1, { align: "center" });
      } else if (i === 0) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(compact ? 5.6 : 6.5);
        doc.setTextColor(...BLACK);
        doc.text(cells[i]!, x + w / 2, cy + rh / 2 + 1, { align: "center" });
      } else {
        doc.setFont(
          "helvetica",
          row.toleranciaDinamicaVazao && i === 4 ? "bold" : "normal"
        );
        doc.setFontSize(fontBody);
        doc.setTextColor(...BLACK);
        const lines = doc.splitTextToSize(cells[i]!, w - 2) as string[];
        const blockH = lines.length * lineStep;
        let ty = cy + (rh - blockH) / 2 + lineStep - 0.4;
        for (const ln of lines) {
          doc.text(ln, x + 1, ty);
          ty += lineStep;
        }
      }
      x += w;
    }
    cy += rh;
  }

  /** Tabela fechada (4 lados) — começa DEPOIS do bloco de identificação. */
  strokeRect(doc, M, startY, INNER_W, cy - startY);
  return cy;
}

function drawAssinaturaImg(
  doc: JsPdfDoc,
  dataUrl: string | null | undefined,
  colX: number,
  colW: number,
  lineY: number
) {
  if (!dataUrl) return;
  try {
    const props = doc.getImageProperties(dataUrl);
    const aspect =
      props?.width > 0 && props?.height > 0 ? props.width / props.height : 2.6;
    /**
     * Assinatura larga/compacta (Fernanda) → menor.
     * Assinatura mais “alta”/fina (Leonardo) → tamanho atual.
     */
    const wideCompact = aspect >= 2.35;
    let w = colW * (wideCompact ? 0.58 : 0.9);
    let h = w / aspect;
    const maxH = wideCompact ? 20 : 32;
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    const x = colX + (colW - w) / 2;
    const y = lineY - h + (wideCompact ? 1.2 : 2.5);
    doc.addImage(dataUrl, "PNG", x, y, w, h);
  } catch {
    /* sem imagem: so o nome abaixo da linha */
  }
}

/* ---------- Assinaturas ---------- */
function drawAssin(
  doc: JsPdfDoc,
  elaborador: string,
  aprovador: string,
  y: number,
  opts?: {
    openTop?: boolean;
    h?: number;
    imgElab?: string | null;
    imgAprov?: string | null;
  }
): number {
  const h = opts?.h ?? 38;
  const yy = y;
  const half = INNER_W / 2;
  if (opts?.openTop) {
    strokeRectOpenTop(doc, M, yy, INNER_W, h);
  } else {
    strokeRect(doc, M, yy, INNER_W, h);
  }
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(BORDER);
  doc.line(M + half, yy, M + half, yy + h);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...BLACK);
  doc.text("ELABORADO:", M + 3, yy + 3.4);
  doc.text("APROVADO:", M + half + 3, yy + 3.4);

  const lineY = yy + h - 5.2;

  drawAssinaturaImg(doc, opts?.imgElab, M, half, lineY);
  drawAssinaturaImg(doc, opts?.imgAprov, M + half, half, lineY);

  /** Linha e nome por cima da imagem. */
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.35);
  doc.line(M + 8, lineY, M + half - 8, lineY);
  doc.line(M + half + 8, lineY, M + INNER_W - 8, lineY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text(elaborador || "-", M + half / 2, lineY + 3.5, {
    align: "center",
  });
  doc.text(aprovador || "-", M + half + half / 2, lineY + 3.5, {
    align: "center",
  });

  return yy + h;
}

/* ---------- Gráficos ---------- */
function niceStep(maxVal: number, targetTicks = 5): number {
  if (!(maxVal > 0)) return 1;
  const raw = maxVal / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function niceAxisMax(maxVal: number, targetTicks = 5): { max: number; step: number } {
  const padded = Math.max(maxVal * 1.14, maxVal + Number.EPSILON);
  const step = niceStep(padded, targetTicks);
  const max = Math.max(step, Math.ceil(padded / step) * step);
  return { max, step };
}

function seriesVazaoPressao(params: CertificadoPdfParams) {
  const vazao = params.vazao;
  const dPi = params.dPi;
  const dPf = params.dPf;
  if (vazao == null || dPi == null || dPf == null) return [];
  return [
    {
      label: "Inicial Pi",
      color: CURVA_INI,
      pts: pontosCurvaQ(vazao, dPi),
    },
    {
      label: "Final Pf",
      color: CURVA_FIN,
      pts: pontosCurvaQ(vazao, dPf),
    },
  ];
}

function seriesVelPressaoMmca(params: CertificadoPdfParams) {
  const vazao = params.vazao;
  const dPi = params.dPi;
  const dPf = params.dPf;
  const area = parseAreaFrontalM2(params.item.dimensoes);
  if (vazao == null || dPi == null || dPf == null || area == null) return [];
  return [
    {
      label: "Inicial Pi",
      color: CURVA_INI,
      pts: pontosCurvaVel(vazao, paParaMmca(dPi), area),
    },
    {
      label: "Final Pf",
      color: CURVA_FIN,
      pts: pontosCurvaVel(vazao, paParaMmca(dPf), area),
    },
  ];
}

function opPointsVazao(params: CertificadoPdfParams) {
  const { vazao, dPi, dPf } = params;
  if (vazao == null || dPi == null || dPf == null) return [];
  return [
    { x: vazao, y: dPi, color: CURVA_INI, tag: "Pi" },
    { x: vazao, y: dPf, color: CURVA_FIN, tag: "Pf" },
  ];
}

function opPointsVelMmca(params: CertificadoPdfParams) {
  const { vazao, dPi, dPf } = params;
  const area = parseAreaFrontalM2(params.item.dimensoes);
  if (vazao == null || dPi == null || dPf == null || area == null) return [];
  const vNom = vazao / (area * 3600);
  return [
    { x: vNom, y: paParaMmca(dPi), color: CURVA_INI, tag: "Pi" },
    { x: vNom, y: paParaMmca(dPf), color: CURVA_FIN, tag: "Pf" },
  ];
}

function axisLimits(
  series: { pts: Ponto[] }[],
  ops: { x: number; y: number }[],
  yScale?: "mmca"
): { xMax: number; yMax: number; xStep: number; yStep: number } {
  const all = series.flatMap((s) => s.pts);
  const maxXData =
    Math.max(...all.map((p) => p.x), ...ops.map((p) => p.x), 0) || 1;
  const maxYData =
    Math.max(...all.map((p) => p.y), ...ops.map((p) => p.y), 0) || 1;
  const x = niceAxisMax(maxXData, 5);
  if (yScale === "mmca" && maxYData <= 50) {
    return { xMax: x.max, yMax: 50, xStep: x.step, yStep: 10 };
  }
  const y = niceAxisMax(maxYData, 5);
  return { xMax: x.max, yMax: y.max, xStep: x.step, yStep: y.step };
}

/* ---------- Desempenho Tipo A (mesma página) ---------- */
async function drawDoisGraficos(
  doc: JsPdfDoc,
  params: CertificadoPdfParams,
  y: number,
  grafH: number,
  opts: { x: number; w: number }
): Promise<number> {
  const inset = 0.9;
  const grafW = opts.w / 2;
  const imgW = grafW - inset * 2;
  const imgH = grafH - inset * 2;
  const sQ = seriesVazaoPressao(params);
  const sV = seriesVelPressaoMmca(params);
  const opQ = opPointsVazao(params);
  const opV = opPointsVelMmca(params);
  const limQ = axisLimits(sQ, opQ);
  const limV = axisLimits(sV, opV, "mmca");

  const [pngQ, pngV] = await Promise.all([
    renderCertificadoChartPng(
      {
        title: "Vazão × Pressão",
        xLabel: "Vazão (m³/h)",
        yLabel: "Pressão (Pa)",
        series: sQ.map((s) => ({ ...s, color: cssColor(s.color) })),
        opPoints: opQ.map((p) => ({ ...p, color: cssColor(p.color) })),
        xMax: limQ.xMax,
        yMax: limQ.yMax,
        xStep: limQ.xStep,
        yStep: limQ.yStep,
      },
      imgW,
      imgH
    ),
    renderCertificadoChartPng(
      {
        title: "Velocidade × Pressão",
        xLabel: "Velocidade (m/s)",
        yLabel: "Pressão (mmca)",
        series: sV.map((s) => ({ ...s, color: cssColor(s.color) })),
        opPoints: opV.map((p) => ({ ...p, color: cssColor(p.color) })),
        xMax: limV.xMax,
        yMax: limV.yMax,
        xStep: limV.xStep,
        yStep: limV.yStep,
      },
      imgW,
      imgH
    ),
  ]);

  doc.setFillColor(255, 255, 255);
  doc.rect(opts.x, y, opts.w, grafH, "F");
  strokeRect(doc, opts.x, y, opts.w, grafH);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(BORDER);
  doc.line(opts.x + grafW, y, opts.x + grafW, y + grafH);

  const place = (png: string | null, x: number) => {
    if (png) {
      try {
        doc.addImage(
          png,
          png.startsWith("data:image/jpeg") ? "JPEG" : "PNG",
          x + inset,
          y + inset,
          imgW,
          imgH
        );
        return;
      } catch {
        png = null;
      }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(136);
    doc.text("Sem dados de curva", x + grafW / 2, y + grafH / 2, {
      align: "center",
    });
  };

  place(pngQ, opts.x);
  place(pngV, opts.x + grafW);
  return y + grafH;
}

function drawInstrumentoTeste(doc: JsPdfDoc, y: number, boxH: number): number {
  doc.setDrawColor(...GRAY_BD);
  doc.setLineWidth(0.3);
  doc.rect(M, y, INNER_W, boxH, "S");
  doc.setFillColor(...LBL_BG);
  doc.rect(M, y, INNER_W, 4.4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...BLACK);
  doc.text("DADOS DE TESTE / CONCLUSAO", M + 2, y + 3.2);

  const inst = INSTRUMENTO_TESTE;
  const ger = GERADOR_AEROSSOL;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.1);
  doc.setTextColor(...BLACK);
  doc.text(
    `Instrumento: ${inst.instrumento} ${inst.fabricante} ${inst.modelo} · S/N ${inst.numeroSerie} · Cert. ${inst.certificadoCalibracao} · Val. ${inst.validadeCalibracao}`,
    M + 2,
    y + 8.4
  );
  doc.text(
    `Gerador: ${ger.modelo} · Aerossol ${ger.aerossol} · Norma NBR ISO 29463-1:2013`,
    M + 2,
    y + boxH - 3.2
  );
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...APROV_GREEN);
  doc.text("Filtro Aprovado", M + INNER_W - 2, y + boxH - 3.2, {
    align: "right",
  });

  return y + boxH;
}

/** Conclusão discreta abaixo dos gráficos (famílias sem bloco de instrumento). */
function drawConclusaoDiscreta(doc: JsPdfDoc, y: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  doc.text("Conclusao:", M + INNER_W - 36, y + 3.6, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...APROV_GREEN);
  doc.text("Filtro Aprovado", M + INNER_W - 2, y + 3.6, { align: "right" });
  return y + 5.2;
}


/**
 * Desenha 1 folha de certificado no doc atual (página já selecionada).
 */
async function drawCertificadoPagina(
  doc: JsPdfDoc,
  params: CertificadoPdfParams,
  assinaturas: {
    imgElab: string | null;
    imgAprov: string | null;
  }
): Promise<void> {
  const dataStr = fmtData(params.dataEmissao ?? new Date());
  const template = params.roteamento.template;
  const comTeste = template.temTesteBancada;
  const comCurva = template.temCurvaDesempenho;

  const ASSIN_H = 40;
  const INST_H = 16;
  const GAP = 4.2;
  const GAP_ID_TABELA = 6.5;
  const pageBottom = PAGE_H - M;
  const assinY = pageBottom - ASSIN_H;

  let y = M;
  y = drawCab(doc, params, dataStr, y, { laboratorio: comTeste });
  y = drawIdBloco(doc, params, template, y);
  y += GAP_ID_TABELA;
  y = drawChecklist(doc, template, params, y, {
    compact: comTeste,
    minRh: comTeste ? 5.4 : 7.4,
    headH: comTeste ? 6.4 : 7.4,
  });

  if (comCurva) {
    const instH = comTeste ? INST_H : 0;
    const conclH = comTeste ? 0 : 5.2;
    const grafCeiling =
      assinY - GAP - (comTeste ? instH + GAP : conclH);
    const grafY = y + 2.2;
    let grafH = grafCeiling - grafY;
    const minGraf = 56;
    if (grafH < minGraf) {
      grafH = Math.max(40, Math.min(minGraf, grafCeiling - grafY));
    }

    await drawDoisGraficos(doc, params, grafY, grafH, { x: M, w: INNER_W });
    if (comTeste) {
      drawInstrumentoTeste(doc, assinY - GAP - instH, instH);
    } else {
      drawConclusaoDiscreta(doc, grafY + grafH);
    }
  }

  drawAssin(doc, params.elaborador, params.aprovador, assinY, {
    h: ASSIN_H,
    imgElab: assinaturas.imgElab,
    imgAprov: assinaturas.imgAprov,
  });
}

async function resolveAssinaturas(
  params: Pick<
    CertificadoPdfParams,
    | "elaborador"
    | "aprovador"
    | "assinaturaElaboradorDataUrl"
    | "assinaturaAprovadorDataUrl"
  >
): Promise<{ imgElab: string | null; imgAprov: string | null }> {
  const imgElab = await enhanceAssinaturaDataUrl(
    params.assinaturaElaboradorDataUrl !== undefined
      ? params.assinaturaElaboradorDataUrl
      : await loadAssinaturaDataUrl(params.elaborador)
  );
  const imgAprov = await enhanceAssinaturaDataUrl(
    params.assinaturaAprovadorDataUrl !== undefined
      ? params.assinaturaAprovadorDataUrl
      : await loadAssinaturaDataUrl(params.aprovador)
  );
  return { imgElab, imgAprov };
}

/**
 * Gera PDF A4 conforme moldes HTML.
 * Tipo A e B/C/D: 1 página. Assinaturas no rodapé da folha.
 */
export async function gerarCertificadoPdf(
  params: CertificadoPdfParams
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const assinaturas = await resolveAssinaturas(params);
  await drawCertificadoPagina(doc, params, assinaturas);
  return doc.output("blob");
}

/** Sobe quando o layout muda — o preview do modal usa isto para não reutilizar blob antigo. */
export const CERT_PDF_LAYOUT = 28;

export type CertificadoLoteResult = {
  blob: Blob;
  filename: string;
  paginas: number;
};

/**
 * Gera um único PDF com N folhas (1 certificado por página).
 */
export async function gerarCertificadosSeries(
  base: Omit<CertificadoPdfParams, "item"> & {
    item: Omit<CertificadoItemInput, "serie" | "serieTotal">;
  },
  series: number[],
  serieTotal: number
): Promise<CertificadoLoteResult> {
  if (series.length === 0) {
    throw new Error("Nenhuma série para gerar.");
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const assinaturas = await resolveAssinaturas(base);

  for (let i = 0; i < series.length; i++) {
    if (i > 0) doc.addPage();
    const serie = series[i]!;
    await drawCertificadoPagina(
      doc,
      {
        ...base,
        item: { ...base.item, serie, serieTotal },
      },
      assinaturas
    );
  }

  const pedido = base.item.pedido.replace(/[^\w-]/g, "_") || "pedido";
  const filename =
    series.length === 1
      ? `certificado-${pedido}-serie-${series[0]}-de-${serieTotal}.pdf`
      : series.length === serieTotal
        ? `certificado-${pedido}-todas-${serieTotal}-folhas.pdf`
        : `certificado-${pedido}-series-${series.join("-")}-de-${serieTotal}.pdf`;

  return {
    blob: doc.output("blob"),
    filename,
    paginas: series.length,
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function openBlobInNewTab(blob: Blob): Window | null {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) {
    URL.revokeObjectURL(url);
    return null;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return win;
}

/** Abre o diálogo de impressão (equivalente a Ctrl+P) para o PDF. */
export function printBlob(blob: Blob): boolean {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "Imprimir certificado");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
    URL.revokeObjectURL(url);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error("[certificado] print:", err);
      const win = window.open(url, "_blank");
      if (win) {
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch {
            /* viewer nativo */
          }
        }, 400);
      }
    }
    setTimeout(cleanup, 120_000);
  };

  setTimeout(cleanup, 180_000);
  return true;
}

// silencia unused type warning em builds estritos
export type { ChecklistItem, TemplateCertificado };
