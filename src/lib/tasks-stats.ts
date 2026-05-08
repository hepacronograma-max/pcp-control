import { getEffectiveTaskStatus } from "@/lib/task-hierarchy";
import type { Subtask } from "@/lib/types/subtasks";
import type { Task, TaskStatus } from "@/lib/types/tasks";

/** Contagem legada por `status !== done` (sem agregar subtarefas). */
export function countPendingTasks(tasks: Pick<Task, "status">[]): number {
  return tasks.filter((t) => t.status !== "done").length;
}

/**
 * Badge do menu + atenção global: estado efetivo ≠ done OU
 * atribuída ao utilizador ainda não aberta (`viewed_at` nulo).
 */
export function countMenuAttentionTasksForBoard(
  tasks: Task[],
  subtasksByTaskId: Record<string, Subtask[]>,
  viewerId?: string | null
): number {
  const ids = new Set<string>();
  for (const t of tasks) {
    const subs = subtasksByTaskId[t.id] ?? [];
    const eff = getEffectiveTaskStatus(t, subs);
    if (eff !== "done") {
      ids.add(t.id);
    }
    if (viewerId && t.assigned_to === viewerId && t.viewed_at == null) {
      ids.add(t.id);
    }
  }
  return ids.size;
}

export function filterTasks(params: {
  tasks: Task[];
  search: string;
  priority: "" | Task["priority"];
  scope: "mine" | "all";
  currentUserId: string | null | undefined;
  departmentId?: string;
}): Task[] {
  let list = [...params.tasks];
  const q = params.search.trim().toLowerCase();
  if (q) {
    list = list.filter((t) => t.title.toLowerCase().includes(q));
  }
  if (params.priority) {
    list = list.filter((t) => t.priority === params.priority);
  }
  if (params.scope === "mine" && params.currentUserId) {
    list = list.filter(
      (t) => t.assigned_to === params.currentUserId || t.created_by === params.currentUserId
    );
  }
  if (params.departmentId) {
    list = list.filter((t) => t.department_id === params.departmentId);
  }
  return list;
}

export function groupTasksByEffectiveStatus(
  tasks: Task[],
  subtasksByTaskId: Record<string, Subtask[]>
): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = {
    todo: [],
    in_progress: [],
    done: [],
  };
  for (const t of tasks) {
    const subs = subtasksByTaskId[t.id] ?? [];
    const eff = getEffectiveTaskStatus(t, subs);
    groups[eff].push(t);
  }
  return groups;
}
