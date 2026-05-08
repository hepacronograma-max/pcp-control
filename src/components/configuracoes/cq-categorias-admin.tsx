"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { UserRole } from "@/lib/types/database";
import type { CQCategoria } from "@/lib/types/cq";
import { Button } from "@/components/ui/button";

const CQ_ROLE_OPTIONS: UserRole[] = [
  "operator",
  "pcp",
  "compras",
  "comercial",
  "logistica",
  "manager",
  "super_admin",
];

type NewCQRowState = {
  role: UserRole;
  categoria: string;
  cor: string;
  is_active: boolean;
  sort_order: number;
};

export function CQCategoriasAdmin({ companyId }: { companyId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<CQCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | "new" | null>(null);
  const [newRow, setNewRow] = useState<NewCQRowState>({
    role: "operator",
    categoria: "",
    cor: "#94a3b8",
    is_active: true,
    sort_order: 0,
  });

  const load = useCallback(async () => {
    if (!supabase || !companyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("cq_categorias")
      .select("*")
      .eq("company_id", companyId)
      .order("role", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      console.error("[CQ categorias]", error);
      toast.error(
        error.message.includes("relation")
          ? "Tabela cq_categorias ausente. Execute supabase-cq.sql."
          : "Erro ao carregar categorias"
      );
      setRows([]);
    } else {
      setRows((data ?? []) as CQCategoria[]);
    }
    setLoading(false);
  }, [supabase, companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byRole = useMemo(() => {
    const m = new Map<string, CQCategoria[]>();
    for (const r of CQ_ROLE_OPTIONS) m.set(r, []);
    for (const row of rows) {
      const k = row.role as string;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(row);
    }
    return m;
  }, [rows]);

  async function savePatch(id: string, patch: Partial<CQCategoria>) {
    if (!supabase) return;
    setSavingId(id);
    const { error } = await supabase
      .from("cq_categorias")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId);
    setSavingId(null);
    if (error) {
      toast.error(error.message || "Erro ao salvar");
      return;
    }
    toast.success("Categoria atualizada");
    void load();
  }

  async function createRow() {
    if (!supabase) return;
    const nome = (newRow.categoria ?? "").trim();
    if (!nome) {
      toast.error("Informe o nome da categoria");
      return;
    }
    setSavingId("new");
    const { error } = await supabase.from("cq_categorias").insert({
      company_id: companyId,
      role: String(newRow.role ?? "operator"),
      categoria: nome,
      cor: String(newRow.cor ?? "#94a3b8"),
      is_active: newRow.is_active !== false,
      sort_order: Number(newRow.sort_order ?? 0),
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message || "Erro ao criar");
      return;
    }
    toast.success("Categoria criada");
    setNewRow({
      role: newRow.role,
      categoria: "",
      cor: newRow.cor ?? "#94a3b8",
      is_active: true,
      sort_order: Number(newRow.sort_order ?? 0) + 1,
    });
    void load();
  }

  async function removeRow(id: string) {
    if (!supabase) return;
    if (!window.confirm("Excluir esta categoria?")) return;
    const { error } = await supabase
      .from("cq_categorias")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId);
    if (error) {
      toast.error(error.message || "Erro ao excluir");
      return;
    }
    toast.success("Removido");
    void load();
  }

  if (!supabase) {
    return (
      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3">
        Configure o Supabase para gerir categorias CQ.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando…</p>;
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p>
          Estas categorias aparecem no menu de registo de ocorrências (CQ), filtradas pelo{" "}
          <strong>perfil</strong> de quem regista (<code className="text-xs">cq_categorias.role</code> deve
           coincidir com o papel do utilizador no Supabase).
        </p>
      </div>

      <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-emerald-900">Nova categoria</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-slate-600">Perfil</span>
            <select
              className="h-9 rounded-md border border-slate-300 px-2 text-xs bg-white"
              value={String(newRow.role ?? "operator")}
              onChange={(e) =>
                setNewRow((r) => ({ ...r, role: e.target.value as UserRole }))
              }
            >
              {CQ_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-xs flex-1 min-w-[140px]">
            <span className="text-slate-600">Nome</span>
            <input
              className="h-9 rounded-md border border-slate-300 px-2 text-xs bg-white"
              value={newRow.categoria ?? ""}
              placeholder="Ex.: Material em falta"
              onChange={(e) =>
                setNewRow((r) => ({ ...r, categoria: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-slate-600">Cor</span>
            <input
              type="color"
              className="h-9 w-14 cursor-pointer rounded border border-slate-300 bg-white p-0"
              value={newRow.cor ?? "#94a3b8"}
              onChange={(e) => setNewRow((r) => ({ ...r, cor: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-xs">
            <span className="text-slate-600">Ordem</span>
            <input
              type="number"
              className="h-9 w-20 rounded-md border border-slate-300 px-2 text-xs bg-white"
              value={newRow.sort_order ?? 0}
              onChange={(e) =>
                setNewRow((r) => ({
                  ...r,
                  sort_order: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-xs h-9">
            <input
              type="checkbox"
              checked={newRow.is_active !== false}
              onChange={(e) =>
                setNewRow((r) => ({ ...r, is_active: e.target.checked }))
              }
            />
            Ativa
          </label>
          <Button
            type="button"
            size="sm"
            disabled={savingId !== null}
            onClick={() => void createRow()}
          >
            {savingId === "new" ? "…" : "Adicionar"}
          </Button>
        </div>
      </section>

      {CQ_ROLE_OPTIONS.map((role) => {
        const list = byRole.get(role) ?? [];
        return (
          <section key={role} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800 capitalize border-b border-slate-200 pb-1">
              {role.replace("_", " ")} ({list.length})
            </h3>
            {list.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhuma categoria.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Nome</th>
                      <th className="text-left px-3 py-2 font-medium w-24">Cor</th>
                      <th className="text-left px-3 py-2 font-medium w-20">Ordem</th>
                      <th className="text-center px-3 py-2 font-medium w-20">Ativa</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            className="w-full min-w-[180px] rounded border border-slate-300 px-2 py-1"
                            defaultValue={row.categoria}
                            disabled={savingId === row.id}
                            key={`nome-${row.id}`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== row.categoria) {
                                void savePatch(row.id, { categoria: v });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="color"
                            className="h-8 w-full max-w-[4rem] cursor-pointer rounded border border-slate-200"
                            defaultValue={row.cor}
                            disabled={savingId === row.id}
                            key={`cor-${row.id}`}
                            onBlur={(e) => {
                              if (e.target.value !== row.cor) {
                                void savePatch(row.id, { cor: e.target.value });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            className="w-full rounded border border-slate-300 px-2 py-1"
                            defaultValue={row.sort_order}
                            disabled={savingId === row.id}
                            key={`so-${row.id}`}
                            onBlur={(e) => {
                              const n = Number(e.target.value);
                              if (
                                Number.isFinite(n) &&
                                n !== row.sort_order
                              ) {
                                void savePatch(row.id, { sort_order: n });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            defaultChecked={row.is_active}
                            disabled={savingId === row.id}
                            aria-label={`Ativa: ${row.categoria}`}
                            onChange={(e) => {
                              void savePatch(row.id, {
                                is_active: e.target.checked,
                              });
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-red-600 hover:underline"
                            disabled={!!savingId}
                            onClick={() => void removeRow(row.id)}
                          >
                            Excluir
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
