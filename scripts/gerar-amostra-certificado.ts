/**
 * Gera PDFs de amostra — 1 por família.
 * Uso: npx tsx scripts/gerar-amostra-certificado.ts
 */
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { rotearCertificado } from "../src/lib/certificado/roteador";
import { gerarCertificadoPdf } from "../src/lib/certificado/gerar-pdf";
import {
  ELABORADOR_PADRAO,
  pathAssinatura,
} from "../src/lib/certificado/dados-fixos";
import {
  calcularVazaoPressao,
  isResultadoCalculo,
} from "../src/lib/motor-vazao";

function fileToDataUrl(publicPath: string | null): string | null {
  if (!publicPath) return null;
  try {
    const buf = readFileSync(
      join(process.cwd(), "public", publicPath.replace(/^\//, ""))
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
  classe: string,
  aprovador: string,
  inputs: Record<string, unknown> = {}
) {
  const roteamento = rotearCertificado(code, desc);
  if (!roteamento) throw new Error("sem roteamento " + label);

  const calc = calcularVazaoPressao(
    { product_code: code, description: desc },
    inputs as never
  );
  const vazao = isResultadoCalculo(calc) ? calc.vazao : null;
  const dPi = isResultadoCalculo(calc) ? calc.dPi : null;
  const dPf = isResultadoCalculo(calc) ? calc.dPf : null;

  const elaborador = ELABORADOR_PADRAO;
  const pathElab = pathAssinatura(elaborador);
  const pathAprov = pathAssinatura(aprovador);
  const assinaturaElaboradorDataUrl = fileToDataUrl(pathElab);
  const assinaturaAprovadorDataUrl = fileToDataUrl(pathAprov);

  const blob = await gerarCertificadoPdf({
    roteamento,
    vazao,
    dPi,
    dPf,
    classe,
    elaborador,
    aprovador,
    logoDataUrl: fileToDataUrl("/certificados/logo-hepa.png"),
    fotoDataUrl: null,
    assinaturaElaboradorDataUrl,
    assinaturaAprovadorDataUrl,
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
  console.log(
    label,
    "→",
    path,
    "(" +
      buf.length +
      " bytes, familia=" +
      roteamento.template.familia +
      ", tipo=" +
      roteamento.tipo +
      ", teste=" +
      roteamento.template.temTesteBancada +
      ", elabImg=" +
      Boolean(assinaturaElaboradorDataUrl) +
      ", aprovImg=" +
      Boolean(assinaturaAprovadorDataUrl) +
      ", aprovador=" +
      aprovador +
      ")"
  );
}

async function main() {
  await one(
    "absoluto",
    "HF-ABSW6",
    "FILTRO HF-ABSW6-H14-AG-S 610x610x292mm",
    "H14",
    "Norma Manuel",
    { num_elementos: 6 }
  );
  await one(
    "fino",
    "HF-FFW3",
    "FILTRO HF-FFW3-F8 592X592X292mm",
    "F8",
    "Fernanda Miranda da Silva"
  );
  await one(
    "bolsa",
    "HF-BSF8",
    "FILTRO HF-BSF8-8-AG 592X592X600mm",
    "F8",
    "Eliane Carvalho",
    { num_elementos: 8, classe: "F8" }
  );
  await one(
    "grosso",
    "HF-GP",
    "FILTRO HF-GP-G4 595x595x48mm",
    "G4",
    "Gabriela Baldan dos Santos"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
