"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Department } from "@/lib/types/departments";
import { departmentChipClasses } from "@/lib/types/departments";
import type { Subtask } from "@/lib/types/subtasks";
import {
  coerceTask,
  priorityClasses,
  priorityLabel,
  type Task,
  type TaskAssigneeOption,
  type TaskPriority,
} from "@/lib/types/tasks";
import {
  completedSubtasksCount,
  getEffectiveTaskProgress,
} from "@/lib/task-hierarchy";
import { assigneeOptionLabel } from "@/lib/task-assignees-merge";
import { SubtaskKanban } from "@/components/tasks/SubtaskKanban";
import { MessageSquare, Plus } from "lucide-react";

export interface TaskDetailFormValues {
  title: string;
  description: string;
  priority: TaskPriority;
  due_date: string;
  assigned_to: string;
  department_id: string;
  status_auto: boolean;
}

export interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  departments: Department[];
  assignees: TaskAssigneeOption[];
  subtasks: Subtask[];
  canEdit: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canCreateSubtasks: boolean;
  onSave: (values: TaskDetailFormValues) => void | Promise<void>;
  onMarkViewed: () => void | Promise<void>;
  onSubtaskStatus: (subtaskId: string, status: Subtask["status"]) => void | Promise<void>;
  onAddSubtask: (title: string, description: string) => void | Promise<void>;
  onOpenComments?: () => void;
  onDelete?: () => void | Promise<void>;
}

export function TaskDetailModal({
  open,
  onOpenChange,
  task,
  departments,
  assignees,
  subtasks,
  canEdit,
  canAssign,
  canDelete,
  canCreateSubtasks,
  onSave,
  onMarkViewed,
  onSubtaskStatus,
  onAddSubtask,
  onOpenComments,
  onDelete,
}: TaskDetailModalProps) {
  const [values, setValues] = useState<TaskDetailFormValues>({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
    assigned_to: "",
    department_id: "",
    status_auto: true,
  });
  const [busy, setBusy] = useState(false);
  const [newSubTitle, setNewSubTitle] = useState("");
  const [newSubDesc, setNewSubDesc] = useState("");

  useEffect(() => {
    if (!open || !task) return;
    void onMarkViewed();
  }, [open, task, onMarkViewed]);

  useEffect(() => {
    if (!open || !task) return;
    const t = coerceTask(task);
    setValues({
      title: t.title,
      description: t.description ?? "",
      priority: t.priority,
      due_date: t.due_date ? String(t.due_date).slice(0, 10) : "",
      assigned_to: t.assigned_to ?? "",
      department_id: t.department_id ?? "",
      status_auto: t.status_auto,
    });
  }, [open, task]);

  const deptName =
    task && task.department_id
      ? departments.find((d) => d.id === task.department_id)?.name ?? null
      : null;

  const progress = task
    ? getEffectiveTaskProgress(coerceTask(task), subtasks)
    : 0;
  const doneN = completedSubtasksCount(subtasks);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !task) return;
    const tl = values.title.trim();
    if (!tl) return;
    setBusy(true);
    try {
      await onSave({ ...values, title: tl });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSub() {
    const t = newSubTitle.trim();
    if (!t || !canCreateSubtasks) return;
    setBusy(true);
    try {
      await onAddSubtask(t, newSubDesc.trim());
      setNewSubTitle("");
      setNewSubDesc("");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !canDelete) return;
    if (!confirm("Eliminar esta tarefa e todas as subtarefas?")) return;
    setBusy(true);
    try {
      await onDelete();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(960px,calc(100vw-2rem))] max-h-[92vh] overflow-y-auto">
        {!task ? null : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-start gap-2">
                <DialogTitle className="flex-1 min-w-0 text-left">
                  {task.title}
                </DialogTitle>
                {deptName && (
                  <Badge variant="outline" className={`text-[10px] ${departmentChipClasses(deptName)}`}>
                    {deptName}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] border ${priorityClasses(task.priority)}`}
                >
                  {priorityLabel(task.priority)}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 text-left">
                Progresso: <strong>{progress}%</strong> · {doneN}/{subtasks.length} subtarefas
                concluídas
                {task.status_auto ? " · estado automático" : " · estado manual"}
              </p>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-4 pt-2 border-t border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="td-title">Título</Label>
                  <Input
                    id="td-title"
                    required
                    disabled={!canEdit}
                    value={values.title}
                    onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="td-desc">Descrição</Label>
                  <Textarea
                    id="td-desc"
                    rows={3}
                    disabled={!canEdit}
                    value={values.description}
                    onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="td-dept">Departamento</Label>
                  <select
                    id="td-dept"
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-60"
                    disabled={!canEdit}
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
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      disabled={!canEdit}
                      checked={values.status_auto}
                      onChange={(e) => setValues((v) => ({ ...v, status_auto: e.target.checked }))}
                    />
                    Estado automático (subtarefas definem coluna Kanban pai)
                  </label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="td-priority">Prioridade</Label>
                  <select
                    id="td-priority"
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                    disabled={!canEdit}
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
                  <Label htmlFor="td-due">Prazo</Label>
                  <Input
                    id="td-due"
                    type="date"
                    disabled={!canEdit}
                    value={values.due_date}
                    onChange={(e) => setValues((v) => ({ ...v, due_date: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="td-assign">Atribuído</Label>
                  <select
                    id="td-assign"
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
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button type="submit" className="bg-[#1B4F72] hover:bg-[#154360]" disabled={busy}>
                    Guardar alterações
                  </Button>
                )}
                {onOpenComments && (
                  <Button type="button" variant="outline" onClick={onOpenComments}>
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Comentários
                  </Button>
                )}
                {canDelete && onDelete && (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-red-600 border-red-200 ml-auto"
                    disabled={busy}
                    onClick={handleDelete}
                  >
                    Eliminar tarefa
                  </Button>
                )}
              </div>
            </form>

            <div className="border-t border-slate-100 pt-4 mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Subtarefas</h3>
              </div>
              <SubtaskKanban
                parentTaskId={task.id}
                subtasks={subtasks}
                canDrag={canCreateSubtasks || canEdit}
                onStatusChange={(id, status) => void onSubtaskStatus(id, status)}
              />
              {canCreateSubtasks ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">Nova subtarefa</p>
                  <Input
                    placeholder="Título"
                    value={newSubTitle}
                    onChange={(e) => setNewSubTitle(e.target.value)}
                  />
                  <Textarea
                    placeholder="Descrição (opcional)"
                    rows={2}
                    value={newSubDesc}
                    onChange={(e) => setNewSubDesc(e.target.value)}
                  />
                  <Button type="button" size="sm" onClick={() => void handleAddSub()} disabled={busy}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar subtarefa
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
