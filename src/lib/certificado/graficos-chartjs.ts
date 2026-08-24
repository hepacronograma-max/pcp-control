/**
 * Gráficos do certificado: Chart.js em canvas → JPEG (data URL).
 * Browser: <canvas> nativo. Node: @napi-rs/canvas (import dinâmico).
 *
 * Tamanhos em px são calibrados para o PDF A4 no preview (~640 px de largura)
 * e na impressão: fontes, linhas e ponto de operação precisam “sobreviver”
 * ao downscale do iframe e à compressão JPEG.
 */

export type ChartPt = { x: number; y: number };

export type CertificadoChartSpec = {
  title: string;
  xLabel: string;
  yLabel: string;
  series: { label: string; color: string; pts: ChartPt[] }[];
  opPoints?: { x: number; y: number; color: string; tag?: string }[];
  xMax: number;
  yMax: number;
  xStep?: number;
  yStep?: number;
};

/** ~16 px/mm ≈ 406 dpi — texto e curvas nítidos no preview. */
const PX_PER_MM = 16;
const FONT = "Arial, Helvetica, sans-serif";

type OpPluginOpts = {
  points: { x: number; y: number; color: string; tag?: string }[];
};

export function cssColor(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function rgbaFromCss(color: string, alpha: number): string {
  const m = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (!m) return color;
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
}

let nodeFontsReady = false;

async function registerNodeFonts(mod: {
  GlobalFonts?: { registerFromPath: (path: string, name?: string) => boolean };
}): Promise<void> {
  if (nodeFontsReady || !mod.GlobalFonts) return;
  const win = "C:\\Windows\\Fonts";
  const paths = [
    `${win}\\arialbd.ttf`,
    `${win}\\arial.ttf`,
    `${win}\\ARIALBD.TTF`,
    `${win}\\ARIAL.TTF`,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ];
  for (const p of paths) {
    try {
      mod.GlobalFonts.registerFromPath(p, "Arial");
    } catch {
      /* fonte opcional */
    }
  }
  nodeFontsReady = true;
}

async function createCanvasCtx(
  cssW: number,
  cssH: number
): Promise<{
  canvas: { toDataURL: (type?: string, quality?: number) => string };
  ctx: CanvasRenderingContext2D;
} | null> {
  const w = Math.max(640, cssW);
  const h = Math.max(480, cssH);

  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    return { canvas, ctx };
  }

  try {
    const spec = ["@napi-rs", "canvas"].join("/");
    const mod = (await import(spec)) as {
      createCanvas: (
        width: number,
        height: number
      ) => {
        getContext: (t: "2d") => CanvasRenderingContext2D;
        toDataURL: (type?: string, quality?: number) => string;
      };
      GlobalFonts?: {
        registerFromPath: (path: string, name?: string) => boolean;
      };
    };
    await registerNodeFonts(mod);
    const canvas = mod.createCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    return { canvas, ctx };
  } catch {
    return null;
  }
}

function whiteBgPlugin() {
  return {
    id: "certWhiteBg",
    beforeDraw(chart: {
      ctx: CanvasRenderingContext2D;
      canvas: { width: number; height: number };
    }) {
      const { ctx, canvas } = chart;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
  };
}

function yTitlePlugin() {
  return {
    id: "certYTitle",
    afterDraw(chart: {
      ctx: CanvasRenderingContext2D;
      chartArea: { top: number; bottom: number };
      options: { plugins?: { certYTitle?: { text?: string } } };
    }) {
      const text = chart.options.plugins?.certYTitle?.text;
      if (!text) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.font = `bold 52px ${FONT}`;
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.translate(32, (chartArea.top + chartArea.bottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    },
  };
}

function opGuidesPlugin() {
  return {
    id: "certOpGuides",
    afterDatasetsDraw(chart: {
      ctx: CanvasRenderingContext2D;
      scales: Record<string, { getPixelForValue: (v: number) => number }>;
      options: { plugins?: { certOpGuides?: OpPluginOpts } };
    }) {
      const ops = chart.options.plugins?.certOpGuides?.points ?? [];
      if (ops.length === 0) return;
      const { ctx } = chart;
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale) return;

      const x0 = xScale.getPixelForValue(0);
      const y0 = yScale.getPixelForValue(0);
      const mx = xScale.getPixelForValue(ops[0]!.x);
      const topY = Math.min(...ops.map((p) => yScale.getPixelForValue(p.y)));

      ctx.save();
      ctx.setLineDash([16, 9]);
      ctx.strokeStyle = "rgba(30, 30, 30, 0.82)";
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(mx, y0);
      ctx.lineTo(mx, topY);
      ctx.stroke();
      for (const p of ops) {
        const py = yScale.getPixelForValue(p.y);
        const px = xScale.getPixelForValue(p.x);
        ctx.beginPath();
        ctx.moveTo(x0, py);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const tags = ops.map((p, i) => p.tag ?? (i === 0 ? "Pi" : "Pf"));
      for (let i = 0; i < ops.length; i++) {
        const p = ops[i]!;
        const px = xScale.getPixelForValue(p.x);
        const py = yScale.getPixelForValue(p.y);

        ctx.beginPath();
        ctx.fillStyle = "#ffffff";
        ctx.arc(px, py, 36, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.arc(px, py, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = p.color;
        ctx.stroke();

        const tag = tags[i]!;
        ctx.font = `bold 52px ${FONT}`;
        const tw = ctx.measureText(tag).width;
        const padX = 12;
        const padY = 8;
        const boxW = tw + padX * 2;
        const boxH = 52 + padY;
        const bx = px - boxW - 28;
        const by = py + (i === 0 ? 28 : -28) - boxH / 2;
        ctx.beginPath();
        const r = 10;
        ctx.moveTo(bx + r, by);
        ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r);
        ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r);
        ctx.arcTo(bx, by + boxH, bx, by, r);
        ctx.arcTo(bx, by, bx + boxW, by, r);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
        ctx.fill();
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = p.color;
        ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tag, bx + boxW / 2, by + boxH / 2);
      }
      ctx.restore();
    },
  };
}

function formatTick(value: number | string): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Math.abs(n) >= 100 || Number.isInteger(n)) {
    return String(Math.round(n));
  }
  const t = Math.round(n * 10) / 10;
  return Number.isInteger(t) ? String(t) : t.toFixed(1);
}

export async function renderCertificadoChartPng(
  spec: CertificadoChartSpec,
  widthMm: number,
  heightMm: number
): Promise<string | null> {
  const seriesOk = spec.series.filter((s) => s.pts.length >= 2);
  if (seriesOk.length === 0) return null;

  const cssW = Math.round(widthMm * PX_PER_MM);
  const cssH = Math.round(heightMm * PX_PER_MM);
  const surface = await createCanvasCtx(cssW, cssH);
  if (!surface) return null;

  const { Chart } = await import("chart.js/auto");
  Chart.defaults.color = "#1a1a1a";
  Chart.defaults.borderColor = "rgba(0,0,0,0.18)";
  Chart.defaults.backgroundColor = "#ffffff";
  Chart.defaults.font.family = FONT;
  Chart.defaults.font.weight = "bold";
  const ops = (spec.opPoints ?? []).filter((p) => p.x > 0 && p.y >= 0);

  const datasets: Record<string, unknown>[] = seriesOk.map((s, i) => ({
    type: "line",
    label: s.label,
    data: s.pts,
    borderColor: s.color,
    backgroundColor: rgbaFromCss(s.color, 0.07),
    borderWidth: 15,
    tension: 0.28,
    cubicInterpolationMode: "monotone",
    borderCapStyle: "round",
    borderJoinStyle: "round",
    pointRadius: 0,
    pointHoverRadius: 0,
    fill: true,
    spanGaps: false,
    order: i + 2,
  }));

  if (ops.length > 0) {
    datasets.push({
      type: "scatter",
      label: "Ponto de operacao",
      data: ops.map((p) => ({ x: p.x, y: p.y })),
      showLine: false,
      pointRadius: 0,
      pointHoverRadius: 0,
      backgroundColor: "#333333",
      borderColor: "#ffffff",
      order: 0,
    });
  }

  const chart = new Chart(surface.ctx, {
    type: "line",
    plugins: [
      whiteBgPlugin() as never,
      yTitlePlugin() as never,
      opGuidesPlugin() as never,
    ],
    data: { datasets: datasets as never },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      color: "#1a1a1a",
      backgroundColor: "#ffffff",
      animation: false,
      devicePixelRatio: 1,
      layout: {
        padding: { top: 8, right: 16, bottom: 2, left: 78 },
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "center",
          labels: {
            boxWidth: 48,
            boxHeight: 16,
            padding: 16,
            font: { size: 52, weight: "bold", family: FONT },
            color: "#111111",
            usePointStyle: false,
            filter: (item: { text?: string }) =>
              item.text !== "Ponto de operacao",
          },
        },
        title: {
          display: true,
          text: spec.title,
          color: "#111111",
          font: {
            size: 64,
            weight: "bold",
            family: FONT,
          },
          padding: { top: 2, bottom: 10 },
        },
        tooltip: { enabled: false },
        certOpGuides: { points: ops },
        certYTitle: { text: spec.yLabel },
      } as Record<string, unknown>,
      scales: {
        x: {
          type: "linear",
          min: 0,
          max: spec.xMax,
          clip: false,
          title: {
            display: true,
            text: spec.xLabel,
            color: "#111111",
            font: { size: 52, weight: "bold", family: FONT },
            padding: { top: 8 },
          },
          ticks: {
            color: "#111111",
            font: { size: 52, weight: "bold", family: FONT },
            maxRotation: 0,
            minRotation: 0,
            padding: 10,
            autoSkip: true,
            maxTicksLimit: 6,
            stepSize: spec.xStep,
            callback: formatTick,
          },
          grid: {
            color: "rgba(0, 0, 0, 0.18)",
            lineWidth: 2.2,
          },
          border: { color: "#222222", width: 3.2, display: true },
        },
        y: {
          type: "linear",
          min: 0,
          max: spec.yMax,
          clip: false,
          afterFit(scale: { width: number }) {
            scale.width = Math.max(scale.width, 92);
          },
          title: {
            display: false,
            text: spec.yLabel,
          },
          ticks: {
            color: "#111111",
            font: { size: 52, weight: "bold", family: FONT },
            padding: 10,
            autoSkip: true,
            maxTicksLimit: 6,
            stepSize: spec.yStep,
            callback: formatTick,
          },
          grid: {
            color: "rgba(0, 0, 0, 0.18)",
            lineWidth: 2.2,
          },
          border: { color: "#222222", width: 3.2, display: true },
        },
      },
    },
  });

  chart.update("none");
  const png = surface.canvas.toDataURL("image/jpeg", 0.96);
  chart.destroy();
  return png;
}
