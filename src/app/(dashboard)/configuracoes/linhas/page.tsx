'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { createClient } from "@/lib/supabase/client";
import type { ProductionLine } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { toast } from "sonner";
import { toSortOrder } from "@/lib/utils/supabase-data";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";

async function postProductionLines(
  body: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/production-lines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let message = "";
  try {
    const j = (await res.json()) as { error?: string };
    message = j.error || "";
  } catch {
    message = "";
  }
  if (!res.ok) {
    return {
      ok: false,
      error: message || `Erro (${res.status})`,
    };
  }
  return { ok: true };
}

export default function LinesSettingsPage() {
  const { profile, loading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const supabase = createClient();
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const isLocal = !supabase;
  const useLinesApi =
    !!supabase && !!profile && shouldUseLocalServiceApi(profile);

  useEffect(() => {
    if (!profile) return;
    if (useLinesApi && profile.company_id === "local-company" && !effectiveLoaded) {
      return;
    }
    const companyIdRaw = effectiveCompanyId ?? profile.company_id;
    if (!companyIdRaw || companyIdRaw === "local-company") return;
    const companyId = companyIdRaw;

    if (isLocal) {
      setLines([]);
      return;
    }

    async function loadLines() {
      if (useLinesApi) {
        try {
          const res = await fetch(
            `/api/company-data?companyId=${encodeURIComponent(companyId)}`,
            { credentials: "include" }
          );
          const json = await res.json();
          setLines((json.lines ?? []) as ProductionLine[]);
        } catch {
          setLines([]);
        }
        return;
      }
      const client = supabase!;
      const { data } = await client
        .from("production_lines")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true });
      setLines(data ?? []);
    }
    loadLines();
  }, [
    profile,
    supabase,
    effectiveCompanyId,
    effectiveLoaded,
    isLocal,
    useLinesApi,
  ]);

  function refresh() {
    const companyId = effectiveCompanyId ?? profile?.company_id;
    if (!companyId || companyId === "local-company") return;
    if (isLocal) return;
    if (useLinesApi) {
      fetch(
        `/api/company-data?companyId=${encodeURIComponent(companyId)}`,
        { credentials: "include" }
      )
        .then((r) => r.json())
        .then((json) => setLines((json.lines ?? []) as ProductionLine[]))
        .catch(() => setLines([]));
      return;
    }
    if (!supabase) return;
    supabase
      .from("production_lines")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .then(({ data }: { data: ProductionLine[] | null }) => setLines(data ?? []));
  }

  async function handleCreateLine() {
    const companyId = effectiveCompanyId ?? profile?.company_id;
    if (!companyId || companyId === "local-company" || !newName.trim()) return;
    setSaving(true);
    try {
      if (useLinesApi) {
        const r = await postProductionLines({
          action: "create",
          companyId,
          name: newName.trim(),
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Linha criada com sucesso");
        setNewName("");
        await refresh();
        return;
      }
      if (!supabase) return;
      const { data: maxOrder } = await supabase
        .from("production_lines")
        .select("sort_order")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = toSortOrder(maxOrder?.[0]?.sort_order) + 1;
      const { error } = await supabase.from("production_lines").insert({
        company_id: companyId,
        name: newName.trim().slice(0, 255),
        is_active: true,
        sort_order: nextOrder,
      });
      if (error) throw error;
      toast.success("Linha criada com sucesso");
      setNewName("");
      await refresh();
    } catch {
      toast.error("Erro ao criar linha");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(id: string, name: string) {
    if (useLinesApi) {
      const r = await postProductionLines({
        action: "update_name",
        lineId: id,
        name,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Linha atualizada");
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("production_lines")
      .update({ name })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao renomear linha");
    } else {
      toast.success("Linha atualizada");
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, name } : l))
      );
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    if (useLinesApi) {
      const r = await postProductionLines({
        action: "toggle_active",
        lineId: id,
        isActive: active,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(active ? "Linha ativada" : "Linha desativada");
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, is_active: active } : l))
      );
      return;
    }
    if (!supabase) return;
    const { error } = await supabase
      .from("production_lines")
      .update({ is_active: active })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar status da linha");
    } else {
      toast.success(active ? "Linha ativada" : "Linha desativada");
      setLines((prev) =>
        prev.map((l) => (l.id === id ? { ...l, is_active: active } : l))
      );
    }
  }

  async function handleDelete(id: string) {
    const line = lines.find((l) => l.id === id);
    if (!line) return;
    if (
      !window.confirm(
        `Apagar a linha "${line.name}"? Itens alocados nesta linha ficarão sem linha atribuída.`
      )
    )
      return;

    try {
      if (useLinesApi) {
        const r = await postProductionLines({ action: "delete", lineId: id });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setLines((prev) => prev.filter((l) => l.id !== id));
        toast.success("Linha apagada");
        return;
      }
      if (!supabase) return;
      await supabase.from("operator_lines").delete().eq("line_id", id);
      await supabase.from("order_items").update({ line_id: null }).eq("line_id", id);
      const { error } = await supabase.from("production_lines").delete().eq("id", id);
      if (error) throw error;
      setLines((prev) => prev.filter((l) => l.id !== id));
      toast.success("Linha apagada");
    } catch {
      toast.error("Erro ao apagar linha");
    }
  }

  async function handleReorder(id: string, direction: "up" | "down") {
    const index = lines.findIndex((l) => l.id === id);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lines.length) return;

    const current = lines[index];
    const target = lines[targetIndex];

    if (useLinesApi) {
      const r = await postProductionLines({
        action: "reorder",
        lineId: id,
        direction,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      await refresh();
      return;
    }
    if (!supabase) return;
    await supabase
      .from("production_lines")
      .update({ sort_order: target.sort_order })
      .eq("id", current.id);
    await supabase
      .from("production_lines")
      .update({ sort_order: current.sort_order })
      .eq("id", target.id);

    await refresh();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando linhas...</p>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Linhas de Produção
          </h1>
          <p className="text-sm text-slate-600">
            Gerencie as linhas de produção da empresa.
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap justify-end">
          <PageExportMenu
            fileNameBase="configuracao-linhas-producao"
            sheetTitle="Linhas de Produção"
            getData={() => ({
              headers: ["Ordem", "Nome", "Status", "Linha padrão (almox.)"],
              rows: lines.map((line, idx) => [
                line.sort_order ?? idx + 1,
                line.name,
                line.is_active ? "Ativa" : "Inativa",
                line.is_almoxarifado ? "Sim" : "Não",
              ]),
            })}
          />
          <div>
            <Label className="text-xs">Nova linha</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-xs w-40"
            />
          </div>
          <Button
            className="text-xs h-8"
            onClick={handleCreateLine}
            disabled={saving || !newName.trim()}
          >
            + Nova Linha
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left w-12">Ord.</th>
              <th className="px-2 py-2 text-left">Nome</th>
              <th className="px-2 py-2 text-left w-28">Status</th>
              <th className="px-2 py-2 text-left w-32">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={line.id}
                className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
              >
                <td className="px-2 py-1 align-middle">
                  {line.sort_order ?? idx + 1}
                </td>
                <td className="px-2 py-1 align-middle">
                  {line.is_almoxarifado ? (
                    <span className="text-xs text-slate-600 font-medium">{line.name} <span className="text-[10px] text-blue-600">(padrão)</span></span>
                  ) : (
                    <input
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-white"
                      value={line.name}
                      onChange={(e) => handleRename(line.id, e.target.value)}
                    />
                  )}
                </td>
                <td className="px-2 py-1 align-middle">
                  <span className="inline-flex items-center gap-1 text-xs">
                    <span>{line.is_active ? "🟢" : "🔴"}</span>
                    <span>{line.is_active ? "Ativa" : "Inativa"}</span>
                  </span>
                </td>
                <td className="px-2 py-1 align-middle">
                  <div className="flex items-center gap-1">
                    <button
                      className="px-1 text-xs"
                      onClick={() => handleReorder(line.id, "up")}
                      title="Mover para cima"
                    >
                      ▲
                    </button>
                    <button
                      className="px-1 text-xs"
                      onClick={() => handleReorder(line.id, "down")}
                      title="Mover para baixo"
                    >
                      ▼
                    </button>
                    <button
                      className="px-1 text-xs"
                      onClick={() =>
                        handleToggleActive(line.id, !line.is_active)
                      }
                      title={line.is_active ? "Desativar" : "Ativar"}
                    >
                      {line.is_active ? "⛔" : "✅"}
                    </button>
                    {!line.is_almoxarifado && (
                      <button
                        className="px-1 text-xs text-red-500 hover:text-red-700"
                        onClick={() => handleDelete(line.id)}
                        title="Apagar linha"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-2 py-3 text-center text-slate-500"
                >
                  Nenhuma linha cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

