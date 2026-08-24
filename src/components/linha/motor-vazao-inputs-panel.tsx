"use client";

import type { MaterialFino, TipoMotor } from "@/lib/motor-vazao";

type Props = {
  motorTipo: TipoMotor | null;
  motorMode: "off" | "precisa" | "ok" | "invalida";
  motorMensagem: string | null;
  motorPrecisa: string[];
  showPapel: boolean;
  showMaterial: boolean;
  showCoroa: boolean;
  showNumElementos: boolean;
  papelOptions: number[];
  coroaOptions: { value: "sim" | "nao"; label: string }[];
  materialOptions: MaterialFino[];
  motorEspessura: string;
  setMotorEspessura: (v: string) => void;
  motorMaterial: MaterialFino | "";
  setMotorMaterial: (v: MaterialFino | "") => void;
  motorCoroa: "" | "sim" | "nao";
  setMotorCoroa: (v: "" | "sim" | "nao") => void;
  motorNumElementos: string;
  setMotorNumElementos: (v: string) => void;
  savingMotor?: boolean;
};

export function MotorVazaoInputsPanel(props: Props) {
  const {
    motorTipo,
    motorMode,
    motorMensagem,
    motorPrecisa,
    showPapel,
    showMaterial,
    showCoroa,
    showNumElementos,
    papelOptions,
    coroaOptions,
    materialOptions,
    motorEspessura,
    setMotorEspessura,
    motorMaterial,
    setMotorMaterial,
    motorCoroa,
    setMotorCoroa,
    motorNumElementos,
    setMotorNumElementos,
    savingMotor,
  } = props;

  return (
    <div className="rounded-md border border-[#1B4F72]/25 bg-[#1B4F72]/5 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-[#1B4F72]">
        Dados para o cálculo de vazão / pressão
        {savingMotor ? (
          <span className="ml-2 font-normal text-slate-500">· salvando…</span>
        ) : null}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {showPapel ? (
          <label className="text-xs font-medium text-slate-700">
            Espessura do papel (mm)
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
              value={motorEspessura}
              onChange={(e) => setMotorEspessura(e.target.value)}
            >
              <option value="">— selecione —</option>
              {papelOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n} mm
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showMaterial ? (
          <label className="text-xs font-medium text-slate-700">
            Material (fino)
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
              value={motorMaterial}
              onChange={(e) =>
                setMotorMaterial(e.target.value as MaterialFino | "")
              }
            >
              <option value="">— selecione —</option>
              {materialOptions.map((m) => (
                <option key={m} value={m}>
                  {m === "fibra_vidro" ? "Fibra de vidro" : "Celulósico"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showCoroa ? (
          <label className="text-xs font-medium text-slate-700">
            Coroa (fino)
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
              value={motorCoroa}
              onChange={(e) =>
                setMotorCoroa(e.target.value as "" | "sim" | "nao")
              }
            >
              <option value="">— selecione —</option>
              {coroaOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showNumElementos ? (
          <label className="text-xs font-medium text-slate-700">
            Nº de {motorTipo === "bolsa" ? "bolsas" : "cunhas"}
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white"
              value={motorNumElementos}
              onChange={(e) => setMotorNumElementos(e.target.value)}
              placeholder={motorTipo === "bolsa" ? "ex.: 8" : "ex.: 6"}
            />
          </label>
        ) : null}
      </div>
      {motorMode === "invalida" && motorMensagem ? (
        <p className="text-[10px] text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {motorMensagem}
        </p>
      ) : null}
      {motorMode === "precisa" ? (
        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Preencha os campos acima para calcular vazão e pressões.
          {motorPrecisa.length > 0
            ? ` Falta: ${motorPrecisa.join(", ")}.`
            : null}
        </p>
      ) : null}
      {motorMode === "ok" ? (
        <p className="text-[10px] text-emerald-800">
          Calculado — valores salvos no item (etiqueta e certificado usam a
          mesma vazão).
        </p>
      ) : null}
    </div>
  );
}
