import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function renderPdf(name: string) {
  const data = new Uint8Array(readFileSync(join("tmp-certificados", name)));
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const outDir = join("tmp-certificados", "inspect");
  mkdirSync(outDir, { recursive: true });
  console.log(name, "numPages=", doc.numPages);
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2.4 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    // pdfjs 5 + napi canvas
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      // @ts-expect-error canvas optional in types
      canvas,
    }).promise;
    const out = join(outDir, name.replace(".pdf", `-p${p}.png`));
    writeFileSync(out, canvas.toBuffer("image/png"));
    console.log("wrote", out);
  }
}

async function main() {
  for (const f of [
    "amostra-absoluto.pdf",
    "amostra-fino.pdf",
    "amostra-bolsa.pdf",
    "amostra-grosso.pdf",
  ]) {
    await renderPdf(f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
