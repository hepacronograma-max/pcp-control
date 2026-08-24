/**
 * Regenera amostras COM imagens reais + extrai metadados para validação.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { rotearCertificado } from "../src/lib/certificado/roteador";
import { gerarCertificadoPdf } from "../src/lib/certificado/gerar-pdf";
import {
  calcularVazaoPressao,
  isResultadoCalculo,
} from "../src/lib/motor-vazao";

function fileToDataUrl(rel: string): string | null {
  try {
    const buf = readFileSync(
      join(process.cwd(), "public", rel.replace(/^\//, ""))
    );
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function one(
  label: string,
  code: string,
  desc: string,
  inputs: Record<string, unknown> = {},
  classe: string
) {
  const roteamento = rotearCertificado(code, desc)!;
  const calc = calcularVazaoPressao(
    { product_code: code, description: desc },
    inputs as never
  );
  const vazao = isResultadoCalculo(calc) ? calc.vazao : null;
  const dPi = isResultadoCalculo(calc) ? calc.dPi : null;
  const dPf = isResultadoCalculo(calc) ? calc.dPf : null;

  const logoDataUrl = fileToDataUrl("/certificados/logo-hepa.png");

  const blob = await gerarCertificadoPdf({
    roteamento,
    vazao,
    dPi,
    dPf,
    classe,
    elaborador: "Leonardo Silva Alves",
    aprovador: "Fernanda Miranda da Silva",
    logoDataUrl,
    fotoDataUrl: null,
    item: {
      product_code: code,
      description: desc,
      dimensoes:
        desc.match(/(\d+[xX×]\d+[xX×]\d+)/)?.[1]?.replace(/×/g, "X") ?? null,
      lote: "260806-12345",
      serie: 1,
      serieTotal: 6,
      pedido: "12345",
      orcamento: "ORC-99",
    },
  });

  const buf = Buffer.from(await blob.arrayBuffer());
  const outDir = join(process.cwd(), "tmp-certificados");
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, `amostra-${label}.pdf`);
  writeFileSync(path, buf);

  const latin = buf.toString("latin1");
  console.log(
    JSON.stringify(
      {
        label,
        bytes: buf.length,
        pagesApprox: (latin.match(/\/Type\s*\/Page[^s]/g) || []).length,
        imagesApprox: (latin.match(/\/Subtype\s*\/Image/g) || []).length,
        tipo: roteamento.tipo,
        foto: roteamento.foto,
        fotoPath: roteamento.fotoPath,
        vazao,
        hasAsciiEff:
          latin.includes("H14 >=") ||
          buf.includes(Buffer.from("H14 >=", "utf8")),
        hasPiLabel:
          latin.includes("Pi (Pa)") || latin.includes("inicial Pi"),
      },
      null,
      2
    )
  );
}

async function main() {
  await one(
    "ABSW",
    "HF-ABSW6",
    "HF-ABSW6 H14 610x610x292mm",
    { num_elementos: 6 },
    "H14"
  );
  await one(
    "FFP",
    "HF-FFP",
    "HF-FFP F9 595x595x96mm",
    { espessura_papel_mm: 80, material: "fibra_vidro", tem_coroa: true },
    "F9"
  );
  await one(
    "BSF",
    "HF-BSF8",
    "HF-BSF8 F8 592x592x600mm",
    { num_elementos: 8, classe: "F8" },
    "F8"
  );
  await one("GP", "HF-GP", "HF-GP G4 595x595x48mm", {}, "G4");
  await one("PL", "HF-PL", "HF-PL G4 595x595x48mm", {}, "G4");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
