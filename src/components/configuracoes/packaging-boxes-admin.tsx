"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import type { PackagingBox } from "@/lib/packaging/boxes";
import { formatBoxDimensions, isAvulsaBoxCode } from "@/lib/packaging/boxes";

type FormState = {
  code: string;
  name: string;
  length_cm: string;
  width_cm: string;
  height_cm: string;
  empty_weight_kg: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  length_cm: "",
  width_cm: "",
  height_cm: "",
  empty_weight_kg: "",
  active: true,
};

function boxToForm(box: PackagingBox): FormState {
  return {
    code: box.code,
    name: box.name,
    length_cm: String(box.length_cm),
    width_cm: String(box.width_cm),
    height_cm: String(box.height_cm),
    empty_weight_kg:
      box.empty_weight_kg == null ? "" : String(box.empty_weight_kg),
    active: box.active,
  };
}

async function postBox(
  body: Record<string, unknown>
): Promise<
  { ok: true; box?: PackagingBox } | { ok: false; error: string }
> {
  const res = await fetch("/api/packaging-boxes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  let json: { error?: string; box?: PackagingBox } = {};
  try {
    json = (await res.json()) as { error?: string; box?: PackagingBox };
  } catch {
    json = {};
  }
  if (!res.ok) {
    return { ok: false, error: json.error || `Erro (${res.status})` };
  }
  return { ok: true, box: json.box };
}

export function PackagingBoxesAdmin({ companyId }: { companyId: string }) {
  const [boxes, setBoxes] = useState<PackagingBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PackagingBox | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tableMissing, setTableMissing] = useState(false);
  const [creatingTable, setCreatingTable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/packaging-boxes?companyId=${encodeURIComponent(companyId)}&includeInactive=1`,
        { credentials: "include" }
      );
      const json = (await res.json()) as {
        boxes?: PackagingBox[];
        error?: string;
      };
      if (!res.ok) {
        const msg = json.error || `Erro (${res.status})`;
        if (/packaging_boxes ausente|does not exist|schema cache/i.test(msg)) {
          setTableMissing(true);
          setBoxes([]);
          return;
        }
        toast.error(msg);
        setBoxes([]);
        return;
      }
      setTableMissing(false);
      setBoxes((json.boxes ?? []).filter((b) => !isAvulsaBoxCode(b.code)));
    } catch {
      toast.error("Erro ao carregar caixas");
      setBoxes([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(box: PackagingBox) {
    setEditing(box);
    setForm(boxToForm(box));
    setDialogOpen(true);
  }

  function patchForm(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        companyId,
        code: form.code,
        name: form.name,
        length_cm: form.length_cm,
        width_cm: form.width_cm,
        height_cm: form.height_cm,
        empty_weight_kg: form.empty_weight_kg,
        active: form.active,
      };
      const r = editing
        ? await postBox({ action: "update", id: editing.id, ...payload })
        : await postBox({ action: "create", ...payload });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(editing ? "Caixa atualizada" : "Caixa cadastrada");
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(box: PackagingBox) {
    const r = await postBox({
      action: "toggle_active",
      companyId,
      id: box.id,
      active: !box.active,
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(box.active ? "Caixa desativada" : "Caixa ativada");
    setBoxes((prev) =>
      prev.map((b) => (b.id === box.id ? { ...b, active: !box.active } : b))
    );
  }

  async function handleDelete(box: PackagingBox) {
    if (
      !window.confirm(
        `Excluir a caixa "${box.name}" (${box.code})? Esta ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    const r = await postBox({
      action: "delete",
      companyId,
      id: box.id,
    });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success("Caixa excluída");
    setBoxes((prev) => prev.filter((b) => b.id !== box.id));
  }

  async function handleCreateTable() {
    setCreatingTable(true);
    try {
      const res = await fetch("/api/setup-packaging-boxes", {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        msg?: string;
      };
      if (!res.ok || !json.success) {
        toast.error(
          json.error || "Não foi possível criar a tabela automaticamente."
        );
        return;
      }
      toast.success(json.msg || "Tabela criada");
      await load();
    } catch {
      toast.error("Erro ao criar tabela");
    } finally {
      setCreatingTable(false);
    }
  }

  if (tableMissing) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-3">
        <p>
          Tabela <code className="text-xs">packaging_boxes</code> ainda não
          existe neste banco. Tente criar automaticamente ou cole o arquivo{" "}
          <code className="text-xs">supabase-packaging-boxes.sql</code> no SQL
          Editor do Supabase.
        </p>
        <Button
          size="sm"
          onClick={() => void handleCreateTable()}
          disabled={creatingTable}
        >
          {creatingTable ? "Criando…" : "Criar tabela agora"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm text-slate-600 max-w-xl">
          Cadastre as caixas disponíveis (código, medidas e peso vazio). Não
          controlamos estoque de caixa — só o catálogo usado na etiqueta.
          A lista antiga do packing local não é importada.
        </p>
        <div className="flex items-center gap-2">
          <PageExportMenu
            fileNameBase="caixas-papelao"
            sheetTitle="Caixas de papelão"
            getData={() => ({
              headers: [
                "Código",
                "Nome",
                "C (cm)",
                "L (cm)",
                "A (cm)",
                "Peso vazio (kg)",
                "Status",
              ],
              rows: boxes.map((b) => [
                b.code,
                b.name,
                b.length_cm,
                b.width_cm,
                b.height_cm,
                b.empty_weight_kg ?? "",
                b.active ? "Ativa" : "Inativa",
              ]),
            })}
          />
          <Button className="text-xs h-8" onClick={openCreate}>
            + Nova caixa
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left">Código</th>
              <th className="px-2 py-2 text-left">Nome</th>
              <th className="px-2 py-2 text-left">Medidas</th>
              <th className="px-2 py-2 text-right">Peso vazio</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-left w-36">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                  Carregando caixas…
                </td>
              </tr>
            ) : boxes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                  Nenhuma caixa cadastrada. Quando a lista nova chegar,
                  cadastre aqui — uma por vez, pelo botão Nova caixa.
                </td>
              </tr>
            ) : (
              boxes.map((box, idx) => (
                <tr
                  key={box.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="px-2 py-1.5 font-medium text-slate-800">
                    {box.code}
                  </td>
                  <td className="px-2 py-1.5">{box.name}</td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {formatBoxDimensions(box)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {box.empty_weight_kg == null
                      ? "—"
                      : `${box.empty_weight_kg} kg`}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={
                        box.active
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }
                    >
                      {box.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded text-xs text-[#1B4F72] hover:bg-slate-100"
                        onClick={() => openEdit(box)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded text-xs text-slate-600 hover:bg-slate-100"
                        onClick={() => void handleToggle(box)}
                      >
                        {box.active ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="px-1.5 py-0.5 rounded text-xs text-red-600 hover:bg-red-50"
                        onClick={() => void handleDelete(box)}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar caixa" : "Nova caixa de papelão"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Código</Label>
              <Input
                value={form.code}
                onChange={(e) => patchForm({ code: e.target.value })}
                placeholder="Ex.: CX-310"
                maxLength={64}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder="Ex.: Caixa triplex 310×200×310"
                maxLength={255}
              />
            </div>
            <div>
              <Label className="text-xs">Comprimento (cm)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.length_cm}
                onChange={(e) => patchForm({ length_cm: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Largura (cm)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.width_cm}
                onChange={(e) => patchForm({ width_cm: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Altura (cm)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.height_cm}
                onChange={(e) => patchForm({ height_cm: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Peso vazio (kg, opcional)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={form.empty_weight_kg}
                onChange={(e) =>
                  patchForm({ empty_weight_kg: e.target.value })
                }
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => patchForm({ active: e.target.checked })}
                />
                Caixa ativa
              </label>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Salvando…" : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
