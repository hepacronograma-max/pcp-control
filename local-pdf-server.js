// Servidor local para leitura de PDFs de orçamento (layout TOTVS)
// Roda separado do Next.js para evitar conflitos.

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { PDFParse } = require("pdf-parse");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(
  cors({
    origin: "http://localhost:3100",
    methods: ["POST", "OPTIONS"],
  })
);

function normalizarTextoPdf(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\uFFFD/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\t]+/g, " ")
    .replace(/ [ \u00A0]+/g, " ")
    .trim();
}

function parseTotvsOrcamento(text, fileName) {
  const norm = normalizarTextoPdf(text);
  const linhas = norm.split(/\n/).map((l) => l.trim()).filter(Boolean);

  let orderNumber = null;
  let clientName = null;
  let deliveryDate = null;
  const items = [];

  for (const l of linhas) {
    const m = l.match(/Orçamento\s+N[ºo]\s*(\d+)/i);
    if (m) {
      orderNumber = m[1];
      break;
    }
  }

  const idxInfo = linhas.findIndex((l) =>
    /^Informa[cç][oõ]es do Cliente/i.test(l)
  );
  if (idxInfo >= 0 && idxInfo + 1 < linhas.length) {
    clientName = linhas[idxInfo + 1].trim() || null;
  }

  for (const l of linhas) {
    const m = l.match(/Previs[aã]o de Faturamento:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (m) {
      const [d, mth, y] = m[1].split("/");
      deliveryDate = `${y}-${mth}-${d}`;
      break;
    }
  }

  const idxItens = linhas.findIndex((l) =>
    /^Itens do Or[cç]amento/i.test(l)
  );
  const idxOutras = linhas.findIndex((l) =>
    /^Outras Informa[cç][oõ]es/i.test(l)
  );

  if (idxItens >= 0) {
    const start = idxItens + 2;
    const end = idxOutras > start ? idxOutras : linhas.length;

    const linhasItens = [];
    for (let i = start; i < end; i++) {
      let linha = linhas[i];
      if (!linha) continue;
      while (
        i + 1 < end &&
        !/^\d+,\d{2}\s+\S+\s+\S+/.test(linhas[i + 1]) &&
        !/^Outras Informa[cç]/i.test(linhas[i + 1])
      ) {
        i++;
        linha = linha + " " + (linhas[i] || "");
      }
      linhasItens.push(linha);
    }

    for (const linha of linhasItens) {
      const m = linha.match(
        /^(\d+,\d{2})\s+\S+\s+(\S+)\s+(.+)$/
      );
      if (!m) continue;
      const qtd = parseFloat(m[1].replace(".", "").replace(",", "."));
      const codigo = m[2];
      const desc = m[3].trim();
      if (!Number.isNaN(qtd) && desc) {
        items.push({
          description: `${codigo} ${desc}`,
          quantity: qtd,
        });
      }
    }
  }

  if (!orderNumber) {
    const baseName = fileName.replace(/\.pdf$/i, "");
    const mNum = baseName.match(/\d+/);
    orderNumber = mNum ? mNum[0] : baseName;
  }

  if (!clientName) {
    clientName = "Cliente do PDF";
  }

  if (!items.length) {
    items.push({
      description: `Item importado de ${fileName}`,
      quantity: 1,
    });
  }

  return {
    success: true,
    orderNumber,
    clientName,
    deliveryDate,
    items,
    itemCount: items.length,
  };
}

app.post("/pdf/import", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "Nenhum arquivo enviado." });
    }

    const parser = new PDFParse({ data: req.file.buffer });
    const result = await parser.getText();
    const text = (result && result.text) || "";
    if (!text || text.length < 20) {
      return res.status(400).json({
        success: false,
        error: "Não foi possível extrair texto do PDF.",
      });
    }

    const parsed = parseTotvsOrcamento(text, req.file.originalname);
    return res.json(parsed);
  } catch (e) {
    console.error("Erro no servidor PDF local:", e);
    return res.status(500).json({
      success: false,
      error: "Erro ao processar PDF no servidor local.",
    });
  }
});

const PORT = 3201;
app.listen(PORT, () => {
  console.log(`Servidor local de PDF ouvindo em http://localhost:${PORT}`);
});

