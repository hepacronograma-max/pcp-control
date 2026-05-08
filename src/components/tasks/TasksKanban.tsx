"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasPermission, normalizeUserRole } from "@/lib/utils/permissions";
import { isUuid } from "@/lib/utils/is-uuid";
import type { Profile } from "@/lib/types/database";
import type { Department } from "@/lib/types/departments";
import { ensureCompanyDepartmentsLocal } from "@/lib/tasks-local";
import {
  loadLocalTasksStore,
  upsertTaskLocal,
  deleteTaskLocal,
  addCommentLocal,
  emitTasksPendingChanged,
  uuidLocal,
  upsertSubtaskLocal,
} from "@/lib/tasks-local";
import {
  filterTasks,
  countMenuAttentionTasksForBoard,
  groupTasksByEffectiveStatus,
} from "@/lib/tasks-stats";
import { patchParentFromSubtasks, getEffectiveTaskStatus } from "@/lib/task-hierarchy";
import {
  TASK_COLUMNS,
  coerceTask,
  type Task,
  type TaskComment,
  type TaskStatus,
  type TaskPriority,
  type TaskAssigneeOption,
} from "@/lib/types/tasks";
import type { Subtask } from "@/lib/types/subtasks";
import { getAssignableLocalProfiles } from "@/lib/local-users";
import { mergeProfileIntoAssigneeOptions } from "@/lib/task-assignees-merge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskCard } from "@/components/tasks/TaskCard";
import { TaskComments } from "@/components/tasks/TaskComments";
import { TaskModal, type TaskModalValues } from "@/components/tasks/TaskModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import type { TaskDetailFormValues } from "@/components/tasks/TaskDetailModal";

type Backend = "local" | "supabase";

function useTasksBackend(
  profile: Profile,
  supabase: ReturnType<typeof createClient>
): Backend {
  return useMemo(() => {
    if (!supabase) return "local";
    if (!isUuid(profile.id)) return "local";
    return "supabase";
  }, [profile.id, supabase]);
}

function subtasksToMap(list: Subtask[]): Record<string, Subtask[]> {
  const m: Record<string, Subtask[]> = {};
  for (const s of list) {
    m[s.task_id] ??= [];
    m[s.task_id]!.push(s);
  }
  return m;
}

function KanbanColumn({
  status,
  title,
  count,
  children,
}: {
  status: TaskStatus;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex flex-col flex-1 min-w-[260px] max-w-full rounded-xl border border-slate-200 bg-slate-100/40">
      <div className="px-3 py-2 border-b border-slate-200 bg-white/80 rounded-t-xl flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-[11px] tabular-nums text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col gap-2 p-2 min-h-[200px] transition-colors rounded-b-xl ${
          isOver ? "bg-[#1B4F72]/10 ring-2 ring-dashed ring-[#1B4F72]/30" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function TasksKanban({
  companyId,
  profile,
}: {
  companyId: string;
  profile: Profile;
}) {
  const supabase = createClient();
  const backend = useTasksBackend(profile, supabase);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const role = normalizeUserRole(profile.role);
  const canView = hasPermission(role, "viewTasks");
  const canCreate = hasPermission(role, "createTasks");
  const canEdit = hasPermission(role, "editTasks");
  const canDelete = hasPermission(role, "deleteTasks");
  const canAssign = hasPermission(role, "assignTasks");
  const canCommentTasks = hasPermission(role, "viewTasks");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [subtasksList, setSubtasksList] = useState<Subtask[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState<
    { id: string; full_name: string; email?: string }[]
  >([]);
  const [commentsByTask, setCommentsByTask] = useState<Record<string, TaskComment[]>>({});
  const [commentsOpenFor, setCommentsOpenFor] = useState<Task | null>(null);
  const ownInsertIdsRef = useRef(new Set<string>());

  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"" | TaskPriority>("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [departmentFilter, setDepartmentFilter] = useState("");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  const subtasksMap = useMemo(() => subtasksToMap(subtasksList), [subtasksList]);

  const userNameById = useMemo(() => {
    const m: Record<string, string> = { [profile.id]: profile.full_name ?? "Eu" };
    for (const a of assignees) {
      m[a.id] = a.full_name;
    }
    return m;
  }, [assignees, profile.id, profile.full_name]);

  const deptNameById = useMemo(() => {
    const r: Record<string, string> = {};
    for (const d of departments) r[d.id] = d.name;
    return r;
  }, [departments]);

  const filteredTasks = useMemo(
    () =>
      filterTasks({
        tasks,
        search,
        priority: priorityFilter,
        scope,
        departmentId: departmentFilter || undefined,
        currentUserId: profile.id,
      }),
    [tasks, search, priorityFilter, scope, profile.id, departmentFilter]
  );

  const grouped = useMemo(
    () => groupTasksByEffectiveStatus(filteredTasks, subtasksMap),
    [filteredTasks, subtasksMap]
  );

  const emitBadge = useCallback(
    (list: Task[], subs: Subtask[]) => {
      if (typeof window === "undefined") return;
      const n = countMenuAttentionTasksForBoard(list, subtasksToMap(subs), profile.id);
      window.dispatchEvent(
        new CustomEvent("pcp-tasks-pending-changed", {
          detail: { companyId, count: n },
        })
      );
    },
    [companyId, profile.id]
  );

  const refreshTasks = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      if (backend === "local") {
        ensureCompanyDepartmentsLocal(companyId);
        const store = loadLocalTasksStore(companyId);
        const list = store.tasks
          .map((t) => coerceTask(t))
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
        setTasks(list);
        setSubtasksList(store.subtasks ?? []);
        setDepartments(store.departments ?? []);

        const cmap: Record<string, TaskComment[]> = {};
        for (const t of list) {
          cmap[t.id] = store.comments.filter((c) => c.task_id === t.id);
        }
        setCommentsByTask(cmap);
        emitTasksPendingChanged(companyId, profile.id);
        emitBadge(list, store.subtasks ?? []);
        return;
      }

      const client = supabase!;
      const [tRes, dRes] = await Promise.all([
        client
          .from("tasks")
          .select("*")
          .eq("company_id", companyId)
          .order("updated_at", { ascending: false }),
        client
          .from("departments")
          .select("id, company_id, name, description, created_at")
          .eq("company_id", companyId)
          .order("name", { ascending: true }),
      ]);

      if (tRes.error) throw tRes.error;
      let list = (tRes.data ?? []).map((r) => coerceTask(r as Task));
      if (!dRes.error && (dRes.data?.length ?? 0) > 0) {
        setDepartments(dRes.data as Department[]);
      } else if (dRes.error && !/does not exist|relation/i.test(dRes.error.message)) {
        console.warn(dRes.error.message);
      }

      let sRows: Subtask[] = [];
      const ids = list.map((t) => t.id);
      if (ids.length > 0) {
        const { data: sData, error: sErr } = await client.from("subtasks").select("*").in("task_id", ids);
        if (sErr && !/does not exist|relation/i.test(sErr.message)) throw sErr;
        sRows = (sData ?? []) as Subtask[];
      }
      setSubtasksList(sRows);
      setTasks(list);

      if (ids.length === 0) {
        setCommentsByTask({});
      } else {
        const { data: cRows, error: cErr } = await client
          .from("task_comments")
          .select("*")
          .in("task_id", ids);
        if (cErr) throw cErr;
        const cmap: Record<string, TaskComment[]> = {};
        for (const tid of ids) cmap[tid] = [];
        for (const row of (cRows ?? []) as TaskComment[]) {
          cmap[row.task_id] ??= [];
          cmap[row.task_id]!.push(row);
        }
        setCommentsByTask(cmap);
      }
      emitBadge(list, sRows);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, [
    backend,
    canView,
    companyId,
    emitBadge,
    profile.id,
    supabase,
  ]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  useEffect(() => {
    async function loadAssignees() {
      if (backend === "local") {
        const profs = getAssignableLocalProfiles(companyId);
        let fromLocal: TaskAssigneeOption[] = profs.map((p) => ({
          id: p.id,
          full_name: (p.full_name ?? "").trim() || p.email?.trim() || "Sem nome",
          email: p.email?.trim() || undefined,
        }));
        if (fromLocal.length === 0 && isUuid(companyId)) {
          console.info(
            "[TasksKanban] assignees: localStorage vazio, a tentar GET /api/tasks/assignees…"
          );
          try {
            const r = await fetch(
              `/api/tasks/assignees?companyId=${encodeURIComponent(companyId)}`,
              { credentials: "include" }
            );
            const j = (await r.json()) as {
              assignees?: { id: string; full_name: string; email?: string }[];
            };
            if (r.ok && (j.assignees?.length ?? 0) > 0) {
              fromLocal = j.assignees ?? [];
              console.info("[TasksKanban] assignees API (modo local fallback):", fromLocal.length);
            } else if (!r.ok) {
              console.warn("[TasksKanban] assignees API falhou:", await r.text().catch(() => ""));
            }
          } catch (e) {
            console.warn("[TasksKanban] assignees API exceção:", e);
          }
        }
        setAssignees(mergeProfileIntoAssigneeOptions(fromLocal, profile));
        return;
      }
      try {
        const r = await fetch(
          `/api/tasks/assignees?companyId=${encodeURIComponent(companyId)}`,
          { credentials: "include" }
        );
        const j = (await r.json()) as {
          assignees?: { id: string; full_name: string; email?: string }[];
          error?: string;
        };
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        setAssignees(mergeProfileIntoAssigneeOptions(j.assignees ?? [], profile));
      } catch (e) {
        console.warn(e);
        setAssignees(mergeProfileIntoAssigneeOptions([], profile));
      }
    }
    void loadAssignees();
  }, [backend, companyId, profile]);

  useEffect(() => {
    if (backend !== "supabase" || !supabase || !isUuid(profile.id)) return;

    const ch = supabase
      .channel(`tasks-assign-${companyId}-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          filter: `assigned_to=eq.${profile.id}`,
        },
        (payload) => {
          const row = coerceTask(payload.new as Task);
          if (row.company_id !== companyId) return;
          if (ownInsertIdsRef.current.has(row.id)) return;
          toast.success(`Nova tarefa atribuída: ${row.title}`);
          void refreshTasks();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [backend, companyId, profile.id, refreshTasks, supabase]);

  async function logHistorySupabase(
    taskId: string,
    action: string,
    oldVal: string | null,
    newVal: string | null
  ) {
    if (backend !== "supabase" || !supabase || !isUuid(profile.id)) return;
    await supabase.from("task_history").insert({
      task_id: taskId,
      user_id: profile.id,
      action,
      old_value: oldVal,
      new_value: newVal,
    });
  }

  /** Marca vista (quem abre deve ser o `assigned_to`). */
  const markViewedStable = useCallback(async () => {
    const t = detailTask;
    if (!t || t.assigned_to !== profile.id) return;
    const now = new Date().toISOString();
    if (backend === "local") {
      const next = coerceTask({ ...t, viewed_at: now, updated_at: now });
      upsertTaskLocal(companyId, next);
      await refreshTasks();
      return;
    }
    try {
      await fetch("/api/tasks/mark-viewed", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, taskId: t.id, viewerId: profile.id }),
      });
    } catch {
      /* ignore */
    }
    await refreshTasks();
  }, [backend, companyId, detailTask, profile.id, refreshTasks]);

  async function recomputeAndSaveParent(parentId: string) {
    const nowIso = new Date().toISOString();
    if (backend === "local") {
      const store = loadLocalTasksStore(companyId);
      const parentRow = store.tasks.find((x) => x.id === parentId);
      if (!parentRow) return;
      const parent = coerceTask(parentRow);
      if (!parent.status_auto) return;
      const subsFor = store.subtasks.filter((s) => s.task_id === parentId);
      const patch = patchParentFromSubtasks(parent, subsFor, nowIso);
      upsertTaskLocal(companyId, coerceTask({ ...parent, ...patch }));
      return;
    }

    const { data: prow, error: pErr } = await supabase!
      .from("tasks")
      .select("*")
      .eq("id", parentId)
      .single();
    if (pErr || !prow) return;
    const parent = coerceTask(prow as Task);
    if (!parent.status_auto) return;
    const { data: subs, error: sErr } = await supabase!
      .from("subtasks")
      .select("*")
      .eq("task_id", parentId);
    if (sErr) return;
    const sf = ((subs ?? []) as Subtask[]).slice();
    const patch = patchParentFromSubtasks(parent, sf, nowIso);
    await supabase!
      .from("tasks")
      .update({
        status: coerceTask({ ...parent, ...patch }).status,
        progress: coerceTask({ ...parent, ...patch }).progress,
        updated_at: nowIso,
      })
      .eq("id", parentId);
  }

  function resolveTargetStatus(overId: string | undefined): TaskStatus | null {
    if (!overId) return null;
    if (overId === "todo" || overId === "in_progress" || overId === "done") {
      return overId;
    }
    const hit = tasks.find((t) => t.id === overId);
    return hit ? getEffectiveTaskStatus(coerceTask(hit), subtasksMap[hit.id] ?? []) : null;
  }

  async function persistStatus(task: Task, newStatus: TaskStatus) {
    const t = coerceTask(task);
    if (t.status_auto) {
      toast.message("Esta tarefa segue o estado das subtarefas.");
      return;
    }
    if (t.status === newStatus) return;
    const now = new Date().toISOString();
    const progress =
      newStatus === "done" ? 100 : newStatus === "in_progress" ? 50 : 0;

    if (backend === "local") {
      const updated = coerceTask({ ...t, status: newStatus, progress, updated_at: now });
      upsertTaskLocal(companyId, updated, [
        {
          user_id: profile.id,
          action: "status_change",
          old_value: t.status,
          new_value: newStatus,
        },
      ]);
      await refreshTasks();
      return;
    }

    const { error } = await supabase!
      .from("tasks")
      .update({ status: newStatus, progress, updated_at: now })
      .eq("id", t.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void logHistorySupabase(t.id, "status_change", t.status, newStatus);
    toast.success("Estado atualizado");
    await refreshTasks();
  }

  function handleDragEnd(ev: DragEndEvent) {
    if (!canEdit) return;
    const { active, over } = ev;
    const targetStatus = resolveTargetStatus(over ? String(over.id) : undefined);
    const taskId = String(active.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !targetStatus) return;
    void persistStatus(task, targetStatus);
  }

  async function handleSaveCreate(values: TaskModalValues) {
    const now = new Date().toISOString();
    const due = values.due_date.trim() ? values.due_date : null;
    const assignStr = values.assigned_to.trim();
    const assigned = canAssign ? assignStr || null : null;
    const dept = values.department_id?.trim() || null;
    const statusAuto = values.status_auto;

    if (backend === "local") {
      const id = uuidLocal();
      const row = coerceTask({
        id,
        company_id: companyId,
        title: values.title.trim(),
        description: values.description.trim() || null,
        status: "todo",
        priority: values.priority,
        due_date: due,
        assigned_to: assigned,
        created_by: profile.id,
        created_at: now,
        updated_at: now,
        department_id: dept,
        status_auto: statusAuto,
        progress: 0,
        viewed_at: null,
      });
      upsertTaskLocal(companyId, row, [
        { user_id: profile.id, action: "created", old_value: null, new_value: row.title },
      ]);
      toast.success("Tarefa criada");
      await refreshTasks();
      return;
    }

    const payload = {
      company_id: companyId,
      title: values.title.trim(),
      description: values.description.trim() || null,
      status: "todo" as TaskStatus,
      priority: values.priority,
      due_date: due,
      assigned_to: assigned,
      created_by: profile.id,
      updated_at: now,
      department_id: dept,
      status_auto: statusAuto,
      progress: 0,
      viewed_at: null as string | null,
    };
    const { data: inserted, error } = await supabase!
      .from("tasks")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    ownInsertIdsRef.current.add(inserted!.id as string);
    setTimeout(() => ownInsertIdsRef.current.delete(inserted!.id as string), 4000);
    void logHistorySupabase(inserted!.id as string, "created", null, values.title.trim());
    toast.success("Tarefa criada");
    await refreshTasks();
  }

  async function handleSaveDetail(values: TaskDetailFormValues) {
    if (!detailTask) return;
    const now = new Date().toISOString();
    const due = values.due_date.trim() ? values.due_date : null;
    const assignStr = values.assigned_to.trim();
    const nextAssign = canAssign ? assignStr || null : detailTask.assigned_to;
    const dept = values.department_id.trim() || null;
    const prev = coerceTask(detailTask);
    let viewedAt = prev.viewed_at;
    if (canAssign && nextAssign !== prev.assigned_to) {
      viewedAt = null;
    }

    const base = {
      ...prev,
      title: values.title.trim(),
      description: values.description.trim() || null,
      priority: values.priority,
      due_date: due,
      assigned_to: nextAssign,
      department_id: dept,
      status_auto: values.status_auto,
      updated_at: now,
      viewed_at: viewedAt,
    };

    let merged = coerceTask(base);
    if (merged.status_auto) {
      const subs = subtasksMap[merged.id] ?? [];
      const patch = patchParentFromSubtasks(merged, subs, now);
      merged = coerceTask({ ...merged, ...patch });
    } else {
      merged = coerceTask({
        ...merged,
        progress: merged.status === "done" ? 100 : merged.status === "in_progress" ? 50 : 0,
      });
    }

    if (backend === "local") {
      upsertTaskLocal(companyId, merged);
      setDetailTask(merged);
      toast.success("Guardado");
      await refreshTasks();
      return;
    }

    const { error } = await supabase!
      .from("tasks")
      .update({
        title: merged.title,
        description: merged.description,
        priority: merged.priority,
        due_date: merged.due_date,
        assigned_to: merged.assigned_to,
        department_id: merged.department_id,
        status_auto: merged.status_auto,
        status: merged.status,
        progress: merged.progress,
        viewed_at: merged.viewed_at,
        updated_at: now,
      })
      .eq("id", merged.id);
    if (error) throw new Error(error.message);
    setDetailTask(merged);
    toast.success("Guardado");
    await refreshTasks();
  }

  async function handleDeleteDetail() {
    if (!detailTask) return;
    if (backend === "local") {
      deleteTaskLocal(companyId, detailTask.id);
      toast.success("Eliminada");
      setDetailTask(null);
      await refreshTasks();
      return;
    }
    const { error } = await supabase!.from("tasks").delete().eq("id", detailTask.id);
    if (error) throw new Error(error.message);
    toast.success("Eliminada");
    setDetailTask(null);
    await refreshTasks();
  }

  async function handleSubtaskStatus(subId: string, status: TaskStatus) {
    const st = subtasksList.find((s) => s.id === subId);
    if (!st) return;

    if (backend === "local") {
      upsertSubtaskLocal(companyId, { ...st, status });
      await recomputeAndSaveParent(st.task_id);
      await refreshTasks();
      return;
    }

    const { error } = await supabase!.from("subtasks").update({ status }).eq("id", subId);
    if (error) {
      toast.error(error.message);
      return;
    }
    await recomputeAndSaveParent(st.task_id);
    await refreshTasks();
  }

  async function handleAddSubtask(title: string, description: string) {
    if (!detailTask || !canCreate) return;
    const mx = Math.max(
      -1,
      ...subtasksList.filter((s) => s.task_id === detailTask.id).map((s) => s.sort_order)
    );

    if (backend === "local") {
      const now = new Date().toISOString();
      const row: Subtask = {
        id: uuidLocal(),
        task_id: detailTask.id,
        title,
        description: description || null,
        status: "todo",
        sort_order: mx + 1,
        created_at: now,
      };
      upsertSubtaskLocal(companyId, row);
      await recomputeAndSaveParent(detailTask.id);
      await refreshTasks();
      return;
    }

    const { error } = await supabase!.from("subtasks").insert({
      task_id: detailTask.id,
      title,
      description: description || null,
      status: "todo",
      sort_order: mx + 1,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await recomputeAndSaveParent(detailTask.id);
    await refreshTasks();
  }

  async function handleAddComment(text: string) {
    const t = commentsOpenFor;
    if (!t || !canCommentTasks) return;

    if (backend === "local") {
      addCommentLocal(companyId, { task_id: t.id, user_id: profile.id, comment: text });
      toast.success("Comentário adicionado");
      await refreshTasks();
      return;
    }

    const { error } = await supabase!.from("task_comments").insert({
      task_id: t.id,
      user_id: profile.id,
      comment: text,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Comentário adicionado");
    await refreshTasks();
  }

  if (!canView) {
    return (
      <p className="text-sm text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        Sem permissão para ver o quadro de atividades.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Atividades</h2>
          <p className="text-xs text-slate-500">
            Cards automáticos seguem subtarefas. Dados{" "}
            {backend === "local" ? "no browser (local)" : "no Supabase"}.
          </p>
        </div>
        {canCreate && (
          <Button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="bg-[#1B4F72] hover:bg-[#154360] shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nova tarefa
          </Button>
        )}
      </div>

      <div className="flex flex-col xl:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Buscar por título…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value as "all" | "mine")}
          >
            <option value="all">Todas</option>
            <option value="mine">Minhas tarefas</option>
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm min-w-[10rem]"
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
          >
            <option value="">Todos os departamentos</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as "" | TaskPriority)}
          >
            <option value="">Prioridade</option>
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 py-12 text-center">A carregar…</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">
            {TASK_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                status={col.id}
                title={col.title}
                count={grouped[col.id].length}
              >
                {grouped[col.id].map((task) => {
                  const subs = subtasksMap[task.id] ?? [];
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      subtasks={subs}
                      departmentName={
                        task.department_id ? deptNameById[task.department_id] ?? null : null
                      }
                      assigneeName={
                        task.assigned_to ? userNameById[task.assigned_to] ?? null : null
                      }
                      currentUserId={profile.id}
                      draggable={canEdit && !task.status_auto}
                      onOpenDetail={() => setDetailTask(task)}
                      onOpenComments={() => setCommentsOpenFor(task)}
                      commentCount={commentsByTask[task.id]?.length ?? 0}
                    />
                  );
                })}
              </KanbanColumn>
            ))}
          </div>
        </DndContext>
      )}

      <TaskModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        departments={departments}
        assignees={assignees}
        canAssign={canAssign}
        onSave={(v) => void handleSaveCreate(v)}
      />

      <TaskDetailModal
        open={detailTask !== null}
        onOpenChange={(o) => !o && setDetailTask(null)}
        task={detailTask}
        departments={departments}
        assignees={assignees}
        subtasks={detailTask ? subtasksMap[detailTask.id] ?? [] : []}
        canEdit={canEdit}
        canAssign={canAssign}
        canDelete={canDelete}
        canCreateSubtasks={canCreate}
        onSave={(v) => void handleSaveDetail(v)}
        onMarkViewed={markViewedStable}
        onSubtaskStatus={(id, st) => void handleSubtaskStatus(id, st)}
        onAddSubtask={(t, d) => void handleAddSubtask(t, d)}
        onOpenComments={
          detailTask ? () => setCommentsOpenFor(detailTask) : undefined
        }
        onDelete={canDelete ? () => void handleDeleteDetail() : undefined}
      />

      {commentsOpenFor && (
        <TaskComments
          open={!!commentsOpenFor}
          onOpenChange={(o) => !o && setCommentsOpenFor(null)}
          taskTitle={commentsOpenFor.title}
          comments={commentsByTask[commentsOpenFor.id] ?? []}
          userNameById={userNameById}
          canComment={canCommentTasks}
          onAdd={handleAddComment}
        />
      )}
    </div>
  );
}
