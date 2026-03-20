/**
 * Extrai texto de PDFs para análise do formato (prazo de entrega, etc.)
 * Uso: node scripts/extract-pdf-text.js "caminho/para/arquivo.pdf"
 */
const fs = require("fs");
const path = require("path");
const { getDocument } = require("pdfjs-serverless");

async function extractText(pdfPath) {
  const buffer = fs.readFileSync(pdfPath);
  const document = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;

  const parts = [];
  for (let i = 1; i <= document.numPages; i++) {
    const page = await document.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items || [];
    let pageText = "";
    let lastY = null;
    for (const item of items) {
      const str = item.str ?? "";
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) pageText += "\n";
      else if (item.hasEOL) pageText += "\n";
      else if (pageText.length > 0 && !pageText.endsWith("\n") && str.length > 0) pageText += " ";
      pageText += str;
      if (y !== null) lastY = y;
    }
    parts.push(pageText);
  }
  return parts.join("\n");
}

async function main() {
  const pdfs = process.argv.slice(2);
  if (pdfs.length === 0) {
    console.log("Uso: node scripts/extract-pdf-text.js arquivo1.pdf arquivo2.pdf ...");
    process.exit(1);
  }

  for (const pdf of pdfs) {
    const fullPath = path.resolve(pdf);
    if (!fs.existsSync(fullPath)) {
      console.log("Arquivo não encontrado:", fullPath);
      continue;
    }
    console.log("\n========== " + path.basename(fullPath) + " ==========\n");
    try {
      const text = await extractText(fullPath);
      console.log(text.substring(0, 4000));
      if (text.length > 4000) console.log("\n... (truncado)");
    } catch (err) {
      console.error("Erro:", err.message);
    }
  }
}

main();
