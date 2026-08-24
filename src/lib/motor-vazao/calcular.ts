/** Orquestrador: parser → motor → resultado ou campos faltantes. */

import {
  encontrarLinhaFino,
  motorBolsa,
  motorCunha,
  motorFino,
  motorPlano,
} from "./motores";
import {
  parseFamilia,
  type CampoFaltante,
  type FamiliaParseada,
} from "./parse-familia";
import type { MaterialFino } from "./tabelas-referencia";

export type ItemMotorInput = {
  product_code?: string | null;
  description?: string | null;
};

export type InputsUsuarioMotor = {
  /** Espessura do papel filtrante (mm) — plano e fino. */
  espessura_papel_mm?: number;
  material?: MaterialFino;
  tem_coroa?: boolean;
  /** Override / preenchimento de cunhas ou bolsas. */
  num_elementos?: number;
  /** Override de classe (ex.: bolsa sem token F7/F8/F9 no código). */
  classe?: string;
};

export type ResultadoCalculoMotor = {
  vazao: number;
  dPi: number;
  dPf: number;
  motor_usado: "plano" | "cunha" | "fino" | "bolsa";
  memoria_calculo: string;
  familia: FamiliaParseada;
};

export type PrecisaInputsMotor = {
  precisa: CampoFaltante[];
  familia: FamiliaParseada;
  /** Faltam inputs vs combinação material/espessura/coroa inexistente na tabela. */
  motivo?: "faltando" | "combinacao_invalida";
  mensagem?: string;
};

export type CalculoMotorResult =
  | null
  | PrecisaInputsMotor
  | ResultadoCalculoMotor;

function isPrecisa(r: CalculoMotorResult): r is PrecisaInputsMotor {
  return r !== null && "precisa" in r;
}

export function isResultadoCalculo(
  r: CalculoMotorResult
): r is ResultadoCalculoMotor {
  return r !== null && "vazao" in r;
}

export function isPrecisaInputs(
  r: CalculoMotorResult
): r is PrecisaInputsMotor {
  return isPrecisa(r);
}

/**
 * Calcula vazão/ΔP a partir do item + inputs do usuário.
 * - null → tipo sem_calculo (etiqueta simples / manual)
 * - { precisa } → faltam dados do usuário
 * - { vazao, ... } → cálculo ok
 */
export function calcularVazaoPressao(
  item: ItemMotorInput,
  inputsUsuario: InputsUsuarioMotor = {}
): CalculoMotorResult {
  const familiaBase = parseFamilia(item.product_code, item.description);

  if (familiaBase.tipo === "sem_calculo") {
    return null;
  }

  const classeEfetiva =
    (inputsUsuario.classe?.trim() || familiaBase.classe || null) as
      | FamiliaParseada["classe"]
      | null;

  const familia: FamiliaParseada = {
    ...familiaBase,
    classe: classeEfetiva ?? familiaBase.classe,
  };

  const precisa: CampoFaltante[] = [];

  if (
    familia.largura_mm == null ||
    familia.altura_mm == null ||
    familia.profundidade_mm == null
  ) {
    precisa.push("dimensoes");
  }

  const num =
    inputsUsuario.num_elementos ?? familia.num_elementos ?? null;

  if (familia.tipo === "cunha" || familia.tipo === "bolsa") {
    if (num == null || num <= 0) {
      precisa.push("num_elementos");
    }
  }

  if (familia.tipo === "plano") {
    if (
      inputsUsuario.espessura_papel_mm == null ||
      !(inputsUsuario.espessura_papel_mm > 0)
    ) {
      precisa.push("espessura_papel_mm");
    }
  }

  if (familia.tipo === "fino") {
    if (!inputsUsuario.material) precisa.push("material");
    if (
      inputsUsuario.espessura_papel_mm == null ||
      !(inputsUsuario.espessura_papel_mm > 0)
    ) {
      precisa.push("espessura_papel_mm");
    }
    if (inputsUsuario.tem_coroa === undefined) precisa.push("tem_coroa");
    else if (
      inputsUsuario.material &&
      inputsUsuario.espessura_papel_mm != null &&
      !encontrarLinhaFino(
        inputsUsuario.material,
        inputsUsuario.espessura_papel_mm,
        inputsUsuario.tem_coroa
      )
    ) {
      return {
        precisa: ["material", "espessura_papel_mm", "tem_coroa"],
        familia,
        motivo: "combinacao_invalida",
        mensagem:
          "Combinacao material/espessura/coroa inexistente na tabela. " +
          "Ex.: fibra_vidro 45 mm so SEM coroa; com coroa use 80 ou 100 mm. " +
          "Celulosico com coroa so em 60 mm.",
      };
    }
  }

  if (familia.tipo === "bolsa") {
    const c = classeEfetiva;
    if (c !== "F7" && c !== "F8" && c !== "F9") {
      precisa.push("classe");
    }
  }

  const precisaUniq = [...new Set(precisa)];
  if (precisaUniq.length > 0) {
    return { precisa: precisaUniq, familia };
  }

  const L = familia.largura_mm!;
  const A = familia.altura_mm!;

  if (familia.tipo === "plano") {
    const r = motorPlano({
      largura_mm: L,
      altura_mm: A,
      espessura_papel_mm: inputsUsuario.espessura_papel_mm!,
    });
    return {
      vazao: r.vazao,
      dPi: r.dPi,
      dPf: r.dPf,
      motor_usado: "plano",
      memoria_calculo: [
        `Motor PLANO · modelo ${familia.modelo ?? "?"} · classe ${familia.classe ?? "?"}`,
        `dims ${L}×${A}×${familia.profundidade_mm} mm · papel ${inputsUsuario.espessura_papel_mm} mm`,
        ...r.memoria,
      ].join("\n"),
      familia,
    };
  }

  if (familia.tipo === "cunha") {
    const r = motorCunha({
      base_mm: L,
      altura_mm: A,
      num_cunhas: num!,
      classe: familia.classe,
      modelo: familia.modelo,
    });
    return {
      vazao: r.vazao,
      dPi: r.dPi,
      dPf: r.dPf,
      motor_usado: "cunha",
      memoria_calculo: [
        `Motor CUNHA · modelo ${familia.modelo ?? "?"} · classe ${familia.classe ?? "?"}`,
        `base ${L} mm · altura ${A} mm · cunhas ${num}`,
        ...r.memoria,
      ].join("\n"),
      familia,
    };
  }

  if (familia.tipo === "fino") {
    const r = motorFino({
      largura_mm: L,
      altura_mm: A,
      material: inputsUsuario.material!,
      espessura_papel_mm: inputsUsuario.espessura_papel_mm!,
      tem_coroa: inputsUsuario.tem_coroa!,
    });
    return {
      vazao: r.vazao,
      dPi: r.dPi,
      dPf: r.dPf,
      motor_usado: "fino",
      memoria_calculo: [
        `Motor FINO · modelo ${familia.modelo ?? "?"} · classe ${familia.classe ?? "?"}`,
        `dims ${L}×${A} mm · ${inputsUsuario.material} ${inputsUsuario.espessura_papel_mm} mm · coroa=${inputsUsuario.tem_coroa}`,
        ...r.memoria,
      ].join("\n"),
      familia,
    };
  }

  // bolsa
  const r = motorBolsa({
    base_mm: L,
    altura_mm: A,
    num_bolsas: num!,
    classe: classeEfetiva!,
  });
  return {
    vazao: r.vazao,
    dPi: r.dPi,
    dPf: r.dPf,
    motor_usado: "bolsa",
    memoria_calculo: [
      `Motor BOLSA · modelo ${familia.modelo ?? "?"} · classe ${classeEfetiva}`,
      `base ${L} mm · altura ${A} mm · bolsas ${num}`,
      ...r.memoria,
    ].join("\n"),
    familia,
  };
}
