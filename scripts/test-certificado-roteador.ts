import { rotearCertificado } from "../src/lib/certificado/roteador";
import {
  calcularVazaoPressao,
  isResultadoCalculo,
} from "../src/lib/motor-vazao";

const cases: [string, string, string][] = [
  ["ABSW", "HF-ABSW6 H14 610x610x292mm", "HF-ABSW6"],
  ["ABSP", "HF-ABSP H14 610x610x150mm", "HF-ABSP"],
  ["FFW", "HF-FFW3-F8 610x610x292mm", "HF-FFW3"],
  ["FF4W", "FILTRO HF-FF4W-ABA 472X472X292mm", "HF-2315"],
  ["FF4WC", "FILTRO HF-FF4WC-ABA 472X472X292mm", "HF-2316"],
  ["FFP", "HF-FFP F9 595x595x96mm", "HF-FFP"],
  ["BSF", "HF-BSF8 F8 592x592x600mm 8 bolsas", "HF-BSF8"],
  ["GP", "HF-GP G4 595x595x48mm", "HF-GP"],
  ["PL", "HF-PL G4 595x595x48mm", "HF-PL"],
];

for (const [label, desc, code] of cases) {
  const r = rotearCertificado(code, desc);
  if (!r) {
    console.log(label, "→ NULL");
    continue;
  }
  console.log(
    label,
    "→",
    "tipo=" + r.tipo,
    "foto=" + r.foto,
    "path=" + r.fotoPath,
    "pags=" + r.paginas,
    "auto=" + r.saiAutomatico,
    "itens=" + r.template.checklist.length
  );
}

const absw = calcularVazaoPressao(
  { product_code: "HF-ABSW6", description: "HF-ABSW6 H14 610x610x292mm" },
  { num_elementos: 6 }
);
console.log(
  "ABSW motor",
  isResultadoCalculo(absw)
    ? absw.vazao + " / " + absw.dPi + " / " + absw.dPf
    : JSON.stringify(absw)
);

const ffp = calcularVazaoPressao(
  { product_code: "HF-FFP", description: "HF-FFP F9 595x595x96mm" },
  { espessura_papel_mm: 80, material: "fibra_vidro", tem_coroa: true }
);
console.log(
  "FFP motor",
  isResultadoCalculo(ffp)
    ? ffp.vazao + " / " + ffp.dPi + " / " + ffp.dPf
    : JSON.stringify(ffp)
);
