"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  calcularVazaoPressao,
  coroasFinoDisponiveis,
  espessurasFinoDisponiveis,
  espessurasPlanoDisponiveis,
  isPrecisaInputs,
  isResultadoCalculo,
  materiaisFinoDisponiveis,
  parseFamilia,
  patchMotorFromCalculo,
  type CampoFaltante,
  type MaterialFino,
  type MotorCamposSalvos,
  type TipoMotor,
} from "@/lib/motor-vazao";
import type { ItemComMotor } from "@/lib/motor-vazao/persistencia";

type MotorUiMode = "off" | "precisa" | "ok" | "invalida";

export type UseMotorVazaoItemArgs = {
  open: boolean;
  item: (ItemComMotor & {
    product_code?: string | null;
    description?: string | null;
  }) | null;
  /** Classe detectada/editável (bolsa). */
  classe: string;
  /** Atualiza estado local da linha após salvar no banco. */
  onMotorSalvo?: (itemId: string, patch: MotorCamposSalvos) => void;
};

export function useMotorVazaoItem({
  open,
  item,
  classe,
  onMotorSalvo,
}: UseMotorVazaoItemArgs) {
  const productCode = item?.product_code ?? null;
  const descricao = item?.description ?? "";

  const [motorEspessura, setMotorEspessura] = useState("");
  const [motorMaterial, setMotorMaterial] = useState<MaterialFino | "">("");
  const [motorCoroa, setMotorCoroa] = useState<"" | "sim" | "nao">("");
  const [motorNumElementos, setMotorNumElementos] = useState("");
  const [motorPrecisa, setMotorPrecisa] = useState<CampoFaltante[]>([]);
  const [motorTipo, setMotorTipo] = useState<TipoMotor | null>(null);
  const [motorMode, setMotorMode] = useState<MotorUiMode>("off");
  const [motorMensagem, setMotorMensagem] = useState<string | null>(null);
  const [memoriaCalculo, setMemoriaCalculo] = useState<string | null>(null);
  const [vazao, setVazao] = useState("");
  const [perdaInicial, setPerdaInicial] = useState("");
  const [perdaFinal, setPerdaFinal] = useState("");
  const [savingMotor, setSavingMotor] = useState(false);
  const lastSavedKey = useRef<string>("");

  /** Carrega do order_item ao abrir. */
  useEffect(() => {
    if (!open || !item) return;
    const fam = parseFamilia(productCode, descricao);

    setMotorEspessura(
      item.motor_espessura_papel_mm != null
        ? String(item.motor_espessura_papel_mm)
        : ""
    );
    setMotorMaterial(
      item.motor_material === "celulosico" ||
        item.motor_material === "fibra_vidro"
        ? item.motor_material
        : ""
    );
    setMotorCoroa(
      item.motor_tem_coroa === true
        ? "sim"
        : item.motor_tem_coroa === false
          ? "nao"
          : ""
    );
    setMotorNumElementos(
      item.motor_num_elementos != null
        ? String(item.motor_num_elementos)
        : fam.num_elementos != null
          ? String(fam.num_elementos)
          : ""
    );
    setVazao(item.motor_vazao != null ? String(item.motor_vazao) : "");
    setPerdaInicial(item.motor_dpi != null ? String(item.motor_dpi) : "");
    setPerdaFinal(item.motor_dpf != null ? String(item.motor_dpf) : "");
    setMemoriaCalculo(null);
    setMotorPrecisa([]);
    setMotorMensagem(null);
    setMotorMode("off");
    setMotorTipo(fam.tipo === "sem_calculo" ? null : fam.tipo);
    lastSavedKey.current = "";
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const temCoroaBool =
    motorCoroa === ""
      ? null
      : motorCoroa === "sim"
        ? true
        : false;

  const espessuraNum = motorEspessura.trim()
    ? Number(motorEspessura)
    : null;

  const papelOptions = useMemo(() => {
    if (motorTipo === "fino") {
      return espessurasFinoDisponiveis(
        motorMaterial || undefined,
        temCoroaBool
      );
    }
    if (motorTipo === "plano") return espessurasPlanoDisponiveis();
    return [50, 80, 100];
  }, [motorTipo, motorMaterial, temCoroaBool]);

  const coroaOptions = useMemo(
    () =>
      coroasFinoDisponiveis(
        motorMaterial || undefined,
        espessuraNum != null && Number.isFinite(espessuraNum)
          ? espessuraNum
          : null
      ),
    [motorMaterial, espessuraNum]
  );

  const materialOptions = materiaisFinoDisponiveis();

  /** Recalcula quando inputs mudam. */
  useEffect(() => {
    if (!open || !item) return;

    const familia = parseFamilia(productCode, descricao);
    setMotorTipo(familia.tipo === "sem_calculo" ? null : familia.tipo);

    if (familia.tipo === "sem_calculo") {
      setMotorMode("off");
      setMotorPrecisa([]);
      setMotorMensagem(null);
      setMemoriaCalculo(null);
      return;
    }

    const inputs = {
      espessura_papel_mm:
        espessuraNum != null && Number.isFinite(espessuraNum)
          ? espessuraNum
          : undefined,
      material: motorMaterial || undefined,
      tem_coroa: temCoroaBool === null ? undefined : temCoroaBool,
      num_elementos: motorNumElementos.trim()
        ? Number(motorNumElementos)
        : undefined,
      classe: classe.trim() || undefined,
    };

    const r = calcularVazaoPressao(
      { product_code: productCode, description: descricao },
      inputs
    );

    if (r === null) {
      setMotorMode("off");
      setMotorPrecisa([]);
      setMotorMensagem(null);
      setMemoriaCalculo(null);
      return;
    }

    if (isPrecisaInputs(r)) {
      if (r.motivo === "combinacao_invalida") {
        setMotorMode("invalida");
        setMotorMensagem(r.mensagem ?? "Combinacao invalida na tabela.");
      } else {
        setMotorMode("precisa");
        setMotorMensagem(null);
      }
      setMotorPrecisa(r.precisa);
      setMemoriaCalculo(null);
      // Não limpa vazão se veio do banco e ainda está pedindo inputs
      // (só limpa se não havia cache)
      if (item.motor_vazao == null) {
        setVazao("");
        setPerdaInicial("");
        setPerdaFinal("");
      }
      return;
    }

    if (isResultadoCalculo(r)) {
      setMotorMode("ok");
      setMotorPrecisa([]);
      setMotorMensagem(null);
      setMemoriaCalculo(r.memoria_calculo);
      setVazao(String(r.vazao));
      setPerdaInicial(String(r.dPi));
      setPerdaFinal(String(r.dPf));
    }
  }, [
    open,
    item,
    productCode,
    descricao,
    motorEspessura,
    motorMaterial,
    motorCoroa,
    motorNumElementos,
    classe,
    espessuraNum,
    temCoroaBool,
  ]);

  /** Persiste no order_item quando cálculo OK. */
  useEffect(() => {
    if (!open || !item || motorMode !== "ok") return;
    const vazaoN = Number(vazao);
    const dPiN = Number(perdaInicial);
    const dPfN = Number(perdaFinal);
    if (![vazaoN, dPiN, dPfN].every((n) => Number.isFinite(n))) return;

    const key = [
      item.id,
      motorEspessura,
      motorMaterial,
      motorCoroa,
      motorNumElementos,
      vazaoN,
      dPiN,
      dPfN,
    ].join("|");
    if (key === lastSavedKey.current) return;

    const patch = patchMotorFromCalculo({
      espessura_papel_mm:
        espessuraNum != null && Number.isFinite(espessuraNum)
          ? espessuraNum
          : undefined,
      material: motorMaterial,
      tem_coroa: temCoroaBool === null ? undefined : temCoroaBool,
      num_elementos: motorNumElementos.trim()
        ? Number(motorNumElementos)
        : undefined,
      vazao: vazaoN,
      dPi: dPiN,
      dPf: dPfN,
    });

    let cancelled = false;
    setSavingMotor(true);
    void (async () => {
      try {
        const supabase = createClient();
        if (!supabase) {
          console.warn("[motor-vazao] save: supabase client null");
          return;
        }
        const { error } = await supabase
          .from("order_items")
          .update(patch)
          .eq("id", item.id);
        if (cancelled) return;
        if (error) {
          // Colunas ainda não migradas: não quebra o modal.
          console.warn("[motor-vazao] save:", error.message);
          return;
        }
        lastSavedKey.current = key;
        onMotorSalvo?.(item.id, patch);
      } catch (e) {
        console.warn("[motor-vazao] save exception:", e);
      } finally {
        if (!cancelled) setSavingMotor(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    item,
    motorMode,
    vazao,
    perdaInicial,
    perdaFinal,
    motorEspessura,
    motorMaterial,
    motorCoroa,
    motorNumElementos,
    espessuraNum,
    temCoroaBool,
    onMotorSalvo,
  ]);

  const precisaSet = new Set(motorPrecisa);
  const showMotorAssist =
    motorMode === "precisa" ||
    motorMode === "ok" ||
    motorMode === "invalida";

  const showPapel =
    showMotorAssist &&
    (precisaSet.has("espessura_papel_mm") ||
      motorMode === "invalida" ||
      ((motorTipo === "plano" || motorTipo === "fino") &&
        (motorMode === "ok" || motorMode === "precisa" || motorMode === "invalida")));

  const showMaterial =
    showMotorAssist &&
    (precisaSet.has("material") ||
      motorMode === "invalida" ||
      (motorTipo === "fino" &&
        (motorMode === "ok" || motorMode === "precisa" || motorMode === "invalida")));

  const showCoroa =
    showMotorAssist &&
    (precisaSet.has("tem_coroa") ||
      motorMode === "invalida" ||
      (motorTipo === "fino" &&
        (motorMode === "ok" || motorMode === "precisa" || motorMode === "invalida")));

  const showNumElementos =
    showMotorAssist &&
    (precisaSet.has("num_elementos") ||
      ((motorTipo === "cunha" || motorTipo === "bolsa") &&
        (motorMode === "ok" || motorMode === "precisa")));

  const showClasseMotor =
    showMotorAssist &&
    precisaSet.has("classe") &&
    motorTipo === "bolsa";

  const showMotorPanel =
    showMotorAssist &&
    (motorMode === "precisa" ||
      motorMode === "invalida" ||
      showPapel ||
      showMaterial ||
      showCoroa ||
      showNumElementos ||
      showClasseMotor);

  const setEspessuraSafe = useCallback((v: string) => {
    setMotorEspessura(v);
  }, []);

  return {
    motorEspessura,
    setMotorEspessura: setEspessuraSafe,
    motorMaterial,
    setMotorMaterial,
    motorCoroa,
    setMotorCoroa,
    motorNumElementos,
    setMotorNumElementos,
    motorPrecisa,
    motorTipo,
    motorMode,
    motorMensagem,
    memoriaCalculo,
    vazao,
    setVazao,
    perdaInicial,
    setPerdaInicial,
    perdaFinal,
    setPerdaFinal,
    savingMotor,
    papelOptions,
    coroaOptions,
    materialOptions,
    showMotorAssist,
    showMotorPanel,
    showPapel,
    showMaterial,
    showCoroa,
    showNumElementos,
    showClasseMotor,
  };
}
