"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Department } from "@/lib/types/departments";
import type { TaskPriority } from "@/lib/types/tasks";
import type { TaskAssigneeOption } from "@/lib/types/tasks";
import { assigneeOptionLabel } from "@/lib/task-assignees-merge";

export interface TaskModalValues {
  title: string;
  description: string;
  priority: TaskPriority;
  due_date: string;
  assigned_to: string;
  department_id: string;
  status_auto: boolean;
}

const emptyValues: TaskModalValues = {
  title: "",
  description: "",
  priority: "medium",
  due_date: "",
  assigned_to: "",
  department_id: "",
  status_auto: true,
};

export interface TaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Department[];
  assignees: TaskAssigneeOption[];
  canAssign: boolean;
  onSave: (values: TaskModalValues) => void | Promise<void>;
}

export function TaskModal({
  open,
  onOpenChange,
  departments,
  assignees,
  canAssign,
  onSave,
}: TaskModalProps) {
  const [values, setValues] = useState<TaskModalValues>(emptyValues);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValues(emptyValues);
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = values.title.trim();
    if (!t) return;
    setBusy(true);
    try {
      await onSave({ ...values, title: t });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Não foi possível guardar";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              required
              value={values.title}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
              placeholder="Título obrigatório"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="task-desc">Descrição</Label>
            <Textarea
              id="task-desc"
              rows={4}
              value={values.description}
              onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
              placeholder="Detalhes (opcional)"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="task-dept">Departamento</Label>
              <select
                id="task-dept"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={values.department_id}
                onChange={(e) => setValues((v) => ({ ...v, department_id: e.target.value }))}
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-700 pb-2">
                <input
                  type="checkbox"
                  checked={values.status_auto}
                  onChange={(e) => setValues((v) => ({ ...v, status_auto: e.target.checked }))}
                  className="rounded border-slate-300"
                />
                Estado automático pelas subtarefas
              </label>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="task-priority">Prioridade</Label>
              <select
                id="task-priority"
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={values.priority}
                onChange={(e) =>
                  setValues((v) => ({ ...v, priority: e.target.value as TaskPriority }))
                }
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-due">Data limite</Label>
              <Input
                id="task-due"
                type="date"
                value={values.due_date}
                onChange={(e) => setValues((v) => ({ ...v, due_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="task-assign">Atribuir para</Label>
            <select
              id="task-assign"
              className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-60"
              value={values.assigned_to}
              disabled={!canAssign}
              onChange={(e) => setValues((v) => ({ ...v, assigned_to: e.target.value }))}
            >
              <option value="">Sem atribuição</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {assigneeOptionLabel(a)}
                </option>
              ))}
            </select>
            {!canAssign && (
              <p className="text-[11px] text-slate-500">
                Precisa da permissão «Atribuir tarefas» para escolher outro utilizador.
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-[#1B4F72] hover:bg-[#154360]" disabled={busy}>
              Criar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
