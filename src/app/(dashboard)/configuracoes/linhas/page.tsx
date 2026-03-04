'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import type { ProductionLine } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const LOCAL_LINES_KEY = "pcp-local-lines";

function loadLocalLines(): ProductionLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_LINES_KEY);
    return raw ? (JSON.parse(raw) as ProductionLine[]) : [];
  } catch {
    return [];
  }
}

function saveLocalLines(lines: ProductionLine[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_LINES_KEY, JSON.stringify(lines));
}

export default function LinesSettingsPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    const companyId = profile.company_id;
    if (!supabase) {
      const all = loadLocalLines();
      const companyLines = all
        .filter((l) => l.company_id === companyId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setLines(companyLines);
      return;
    }
    const client = supabase;
    async function loadLines() {
      const { data } = await client
        .from("production_lines")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true });
      setLines(data ?? []);
    }
    loadLines();
  }, [profile, supabase]);

  function refresh() {
    if (!profile?.company_id) return;
    const companyId = profile.company_id;
    if (!supabase) {
      const all = loadLocalLines();
      const companyLines = all
        .filter((l) => l.company_id === companyId)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setLines(companyLines);
      return;
    }
    supabase
      .from("production_lines")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .then(({ data }: { data: ProductionLine[] | null }) => setLines(data ?? []));
  }

  async function handleCreateLine() {
    if (!profile?.company_id || !newName.trim()) return;
    setSaving(true);
    try {
      if (!supabase) {
        const all = loadLocalLines();
        const maxOrder = all
          .filter((l) => l.company_id === profile.company_id)
          .reduce((max, l) => Math.max(max, l.sort_order ?? 0), 0);
        const newLine: ProductionLine = {
          id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `line-${Date.now()}`,
          company_id: profile.company_id,
          name: newName.trim(),
          is_active: true,
          sort_order: maxOrder + 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        saveLocalLines([...all, newLine]);
        setLines((prev) => [...prev, newLine].sort((a, b) => a.sort_order - b.sort_order));
        setNewName("");
        toast.success("Linha criada com sucesso");
        setSaving(false);
        return;
      }
      const { data: maxOrder } = await supabase
        .from("production_lines")
        .select("sort_order")
        .eq("company_id", profile.company_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = (maxOrder?.[0]?.sort_order ?? 0) + 1;
      const { error } = await supabase.from("production_lines").insert({
        company_id: profile.company_id,
        name: newName.trim(),
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
    if (!supabase) {
      const all = loadLocalLines();
      const next = all.map((l) => (l.id === id ? { ...l, name, updated_at: new Date().toISOString() } : l));
      saveLocalLines(next);
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)));
      toast.success("Linha atualizada");
      return;
    }
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
    if (!supabase) {
      const all = loadLocalLines();
      const next = all.map((l) => (l.id === id ? { ...l, is_active: active, updated_at: new Date().toISOString() } : l));
      saveLocalLines(next);
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, is_active: active } : l)));
      toast.success(active ? "Linha ativada" : "Linha desativada");
      return;
    }
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

  async function handleReorder(id: string, direction: "up" | "down") {
    const index = lines.findIndex((l) => l.id === id);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= lines.length) return;

    const current = lines[index];
    const target = lines[targetIndex];

    if (!supabase) {
      const all = loadLocalLines();
      const swap = (arr: ProductionLine[]) => {
        const out = [...arr];
        const ci = out.findIndex((l) => l.id === current.id);
        const ti = out.findIndex((l) => l.id === target.id);
        if (ci === -1 || ti === -1) return arr;
        const so = out[ci].sort_order;
        out[ci] = { ...out[ci], sort_order: out[ti].sort_order, updated_at: new Date().toISOString() };
        out[ti] = { ...out[ti], sort_order: so, updated_at: new Date().toISOString() };
        return out;
      };
      const next = swap(all);
      saveLocalLines(next);
      setLines(next.filter((l) => l.company_id === profile?.company_id).sort((a, b) => a.sort_order - b.sort_order));
      return;
    }

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
        <div className="flex items-end gap-2">
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
                  <input
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-white"
                    value={line.name}
                    onChange={(e) => handleRename(line.id, e.target.value)}
                  />
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

