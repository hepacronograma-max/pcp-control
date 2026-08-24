"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { hasPermission } from "@/lib/utils/permissions";
import {
  calcularVazaoPressao,
  isPrecisaInputs,
  isResultadoCalculo,
  parseFamilia,
  type MaterialFino,
} from "@/lib/motor-vazao";

const EXEMPLOS: { label: string; code: string; desc: string }[] = [
  {
    label: "Plano H14 — ABSP 610×610",
    code: "HF-017",
    desc: "FILTRO HF-ABSP-H14-T-S 610X610X78mm",
  },
  {
    label: "Cunha H14 — ABSW6 592×287",
    code: "HF-1579",
    desc: "FILTRO HF-ABSW6-H14-AG-S 592X287X292mm",
  },
  {
    label: "Cunha 3×450 (validação)",
    code: "",
    desc: "FILTRO HF-ABSW3-H14-AG-S 450X450X292mm",
  },
  {
    label: "Cunha fino F8 — FFW3",
    code: "HF-2001",
    desc: "FILTRO HF-FFW3-F8 592X592X292mm",
  },
  {
    label: "Fino FFP F7",
    code: "HF-1822",
    desc: "FILTRO HF-FFP-F7-AG-S 432X620X78mm",
  },
  {
    label: "Bolsa BSF8-8",
    code: "HF-1405",
    desc: "FILTRO HF-BSF8-8-AG 592X592X600mm",
  },
  {
    label: "PL-M5 (sem cálculo)",
    code: "HF-0251",
    desc: "FILTRO HF-PL-M5 180x620x45mm",
  },
];

export default function AdminMotorTestePage() {
  const { profile, loading } = useUser();
  const router = useRouter();

  const [productCode, setProductCode] = useState("HF-017");
  const [description, setDescription] = useState(
    "FILTRO HF-ABSP-H14-T-S 610X610X78mm"
  );
  const [espessuraPapel, setEspessuraPapel] = useState("50");
  const [material, setMaterial] = useState<MaterialFino | "">("");
  const [temCoroa, setTemCoroa] = useState<"" | "sim" | "nao">("");
  const [numElementos, setNumElementos] = useState("");

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile.role, "viewSettings")) {
      router.replace("/dashboard");
    }
  }, [loading, profile, router]);

  const familia = useMemo(
    () => parseFamilia(productCode, description),
    [productCode, description]
  );

  const resultado = useMemo(() => {
    const inputs = {
      espessura_papel_mm: espessuraPapel.trim()
        ? Number(espessuraPapel)
        : undefined,
      material: material || undefined,
      tem_coroa:
        temCoroa === ""
          ? undefined
          : temCoroa === "sim"
            ? true
            : false,
      num_elementos: numElementos.trim()
        ? Number(numElementos)
        : undefined,
    };
    return calcularVazaoPressao(
      { product_code: productCode, description },
      inputs
    );
  }, [
    productCode,
    description,
    espessuraPapel,
    material,
    temCoroa,
    numElementos,
  ]);

  if (loading || !profile) {
    return (
      <div className="p-6 text-sm text-slate-600">Carregando…</div>
    );
  }

  if (!hasPermission(profile.role, "viewSettings")) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Motor vazão / pressão — teste
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Validação isolada — <strong>não</strong> ligado à etiqueta ainda.
          </p>
        </div>
        <Link
          href="/admin/omie"
          className="text-xs text-[#1B4F72] hover:underline"
        >
          ← Admin Omie
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Exemplos rápidos</h2>
        <div className="flex flex-wrap gap-2">
          {EXEMPLOS.map((ex) => (
            <button
              key={ex.label}
              type="button"
              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setProductCode(ex.code);
                setDescription(ex.desc);
              }}
            >
              {ex.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Item</h2>
        <label className="block text-xs font-medium text-slate-700">
          product_code
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-mono"
            value={productCode}
            onChange={(e) => setProductCode(e.target.value)}
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          description
          <textarea
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm font-mono"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">Parser</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">tipo</dt>
            <dd className="font-mono font-semibold">{familia.tipo}</dd>
          </div>
          <div>
            <dt className="text-slate-500">modelo</dt>
            <dd className="font-mono">{familia.modelo ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">classe</dt>
            <dd className="font-mono">{familia.classe ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">L × A × P (mm)</dt>
            <dd className="font-mono">
              {familia.largura_mm ?? "?"} × {familia.altura_mm ?? "?"} ×{" "}
              {familia.profundidade_mm ?? "?"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">nº elementos</dt>
            <dd className="font-mono">{familia.num_elementos ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">falta (parser)</dt>
            <dd className="font-mono">
              {familia.falta.length ? familia.falta.join(", ") : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Inputs do usuário (quando o motor pedir)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-700">
            Espessura papel (mm) — plano / fino
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={espessuraPapel}
              onChange={(e) => setEspessuraPapel(e.target.value)}
              placeholder="ex.: 50"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Nº cunhas / bolsas (override)
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={numElementos}
              onChange={(e) => setNumElementos(e.target.value)}
              placeholder="só se ambíguo"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Material — fino
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={material}
              onChange={(e) =>
                setMaterial(e.target.value as MaterialFino | "")
              }
            >
              <option value="">—</option>
              <option value="celulosico">celulosico</option>
              <option value="fibra_vidro">fibra_vidro</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Coroa — fino
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={temCoroa}
              onChange={(e) =>
                setTemCoroa(e.target.value as "" | "sim" | "nao")
              }
            >
              <option value="">—</option>
              <option value="sim">sim</option>
              <option value="nao">não</option>
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-[#1B4F72]/30 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800">Resultado</h2>
        {resultado === null ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            <strong>sem_calculo</strong> — motor não se aplica (etiqueta
            simples / preencher manual).
          </p>
        ) : isPrecisaInputs(resultado) ? (
          <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
            Precisa de:{" "}
            <strong className="font-mono">{resultado.precisa.join(", ")}</strong>
          </p>
        ) : isResultadoCalculo(resultado) ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div className="rounded-md bg-slate-50 p-3">
                <div className="text-[10px] uppercase text-slate-500">Motor</div>
                <div className="font-semibold font-mono">
                  {resultado.motor_usado}
                </div>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <div className="text-[10px] uppercase text-slate-500">
                  Vazão
                </div>
                <div className="font-semibold font-mono text-lg">
                  {resultado.vazao}{" "}
                  <span className="text-xs font-normal">m³/h</span>
                </div>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <div className="text-[10px] uppercase text-slate-500">ΔPi</div>
                <div className="font-semibold font-mono">
                  {resultado.dPi} Pa
                </div>
              </div>
              <div className="rounded-md bg-slate-50 p-3">
                <div className="text-[10px] uppercase text-slate-500">ΔPf</div>
                <div className="font-semibold font-mono">
                  {resultado.dPf} Pa
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-600 mb-1">
                Memória de cálculo
              </div>
              <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-800 font-mono overflow-x-auto">
                {resultado.memoria_calculo}
              </pre>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
