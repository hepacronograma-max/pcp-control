import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { PDFParse } from "pdf-parse";

async function inspect(name: string) {
  const path = join(process.cwd(), "tmp-certificados", name);
  const data = readFileSync(path);
  const parser = new PDFParse({ data });
  const textResult = await parser.getText();
  const info = await parser.getInfo();
  const pages = textResult.pages?.length ?? info.total ?? 0;
  const full = textResult.text || textResult.pages?.map((p) => p.text).join("\n---PAGE---\n") || "";

  const outDir = join(process.cwd(), "tmp-certificados", "inspect");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, name.replace(".pdf", ".txt")), full, "utf8");

  console.log("====", name, "====");
  console.log("pages:", pages);
  console.log("--- excerpt ---");
  console.log(full.slice(0, 2500));
  console.log("--- end excerpt / total chars", full.length, "---\n");
  await parser.destroy?.();
}

async function main() {
  for (const f of [
    "amostra-absoluto.pdf",
    "amostra-fino.pdf",
    "amostra-bolsa.pdf",
    "amostra-grosso.pdf",
  ]) {
    await inspect(f);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
