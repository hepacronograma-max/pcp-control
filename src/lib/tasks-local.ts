import type { Department } from "@/lib/types/departments";
import { DEFAULT_DEPARTMENT_NAMES } from "@/lib/types/departments";
import { countMenuAttentionTasksForBoard } from "@/lib/tasks-stats";
import type { Subtask } from "@/lib/types/subtasks";
import type { LocalTasksStore, Task, TaskComment, TaskHistory } from "@/lib/types/tasks";
import { coerceTask } from "@/lib/types/tasks";

const PREFIX_V1 = "pcp-tasks-v1";
const PREFIX_V2 = "pcp-tasks-v2";

function keyV2(companyId: string): string {
  return `${PREFIX_V2}:${companyId}`;
}

function keyV1(companyId: string): string {
  return `${PREFIX_V1}:${companyId}`;
}

function emptyStore(): LocalTasksStore {
  return { tasks: [], comments: [], history: [], departments: [], subtasks: [] };
}

function seedDepartmentsLocal(companyId: string, now: string): Department[] {
  return DEFAULT_DEPARTMENT_NAMES.map((name, i) => ({
    id: `local-dept-${companyId}-${i}`,
    company_id: companyId,
    name,
    description: null,
    created_at: now,
  }));
}

/** Garante lista de departamentos padrão por empresa (local). */
export function ensureCompanyDepartmentsLocal(companyId: string): Department[] {
  const store = loadLocalTasksStoreRaw(companyId);
  if (!store.departments?.length) {
    const now = new Date().toISOString();
    store.departments = seedDepartmentsLocal(companyId, now);
    saveLocalTasksStore(companyId, store);
    return store.departments;
  }
  return store.departments;
}

function loadLocalTasksStoreRaw(companyId: string): LocalTasksStore {
  if (typeof window === "undefined") return emptyStore();
  const v2 = window.localStorage.getItem(keyV2(companyId));

  if (!v2) {
    const legacy = window.localStorage.getItem(keyV1(companyId));
    if (legacy) {
      try {
        const old = JSON.parse(legacy) as {
          tasks?: Task[];
          comments?: TaskComment[];
          history?: TaskHistory[];
        };
        const migrated: LocalTasksStore = {
          tasks: (old.tasks ?? []).map((t) =>
            coerceTask(t as Partial<Task> & Pick<Task, "id" | "company_id" | "title">)
          ),
          comments: Array.isArray(old.comments) ? old.comments : [],
          history: Array.isArray(old.history) ? old.history : [],
          departments: seedDepartmentsLocal(companyId, new Date().toISOString()),
          subtasks: [],
        };
        window.localStorage.setItem(keyV2(companyId), JSON.stringify(migrated));
        window.localStorage.removeItem(keyV1(companyId));
        return migrated;
      } catch {
        /* empty */
      }
    }
    return emptyStore();
  }

  try {
    const parsed = JSON.parse(v2) as LocalTasksStore;
    return {
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.map((t) =>
            coerceTask(t as Partial<Task> & Pick<Task, "id" | "company_id" | "title">)
          )
        : [],
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
    };
  } catch {
    return emptyStore();
  }
}

export function loadLocalTasksStore(companyId: string): LocalTasksStore {
  const s = loadLocalTasksStoreRaw(companyId);
  if (!s.departments.length) {
    const now = new Date().toISOString();
    s.departments = seedDepartmentsLocal(companyId, now);
    saveLocalTasksStore(companyId, s);
  }
  return s;
}

export function saveLocalTasksStore(companyId: string, store: LocalTasksStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyV2(companyId), JSON.stringify(store));
}

export function uuidLocal(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function subtasksMapFromStore(store: LocalTasksStore): Record<string, Subtask[]> {
  const m: Record<string, Subtask[]> = {};
  for (const s of store.subtasks) {
    m[s.task_id] ??= [];
    m[s.task_id]!.push(s);
  }
  return m;
}

/** Contagem para o menu (pendentes efetivos ∪ atribuídas a mim ainda não vistas). */
export function attentionMenuCountLocal(companyId: string, viewerId: string | null): number {
  const s = loadLocalTasksStore(companyId);
  return countMenuAttentionTasksForBoard(s.tasks, subtasksMapFromStore(s), viewerId);
}

export function appendHistoryLocal(
  companyId: string,
  entry: Omit<TaskHistory, "id" | "created_at">
): void {
  const store = loadLocalTasksStore(companyId);
  const row: TaskHistory = {
    ...entry,
    id: uuidLocal(),
    created_at: new Date().toISOString(),
  };
  store.history.push(row);
  saveLocalTasksStore(companyId, store);
}

/** Emite evento para o menu atualizar o badge. */
export function emitTasksPendingChanged(companyId: string, viewerId: string | null): void {
  if (typeof window === "undefined") return;
  const s = loadLocalTasksStore(companyId);
  const n = countMenuAttentionTasksForBoard(s.tasks, subtasksMapFromStore(s), viewerId);
  window.dispatchEvent(
    new CustomEvent("pcp-tasks-pending-changed", {
      detail: { companyId, count: n },
    })
  );
}

export function upsertTaskLocal(
  companyId: string,
  task: Task,
  history?: Omit<TaskHistory, "id" | "created_at" | "task_id">[]
): void {
  const store = loadLocalTasksStore(companyId);
  const ix = store.tasks.findIndex((t) => t.id === task.id);
  if (ix >= 0) store.tasks[ix] = task;
  else store.tasks.push(task);
  saveLocalTasksStore(companyId, store);
  if (history?.length) {
    for (const h of history) {
      appendHistoryLocal(companyId, { ...h, task_id: task.id });
    }
  }
}

export function deleteTaskLocal(companyId: string, taskId: string): void {
  const store = loadLocalTasksStore(companyId);
  store.tasks = store.tasks.filter((t) => t.id !== taskId);
  store.comments = store.comments.filter((c) => c.task_id !== taskId);
  store.subtasks = store.subtasks.filter((s) => s.task_id !== taskId);
  saveLocalTasksStore(companyId, store);
}

export function listCommentsLocal(companyId: string, taskId: string): TaskComment[] {
  return loadLocalTasksStore(companyId)
    .comments.filter((c) => c.task_id === taskId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function addCommentLocal(
  companyId: string,
  row: Omit<TaskComment, "id" | "created_at">
): TaskComment {
  const store = loadLocalTasksStore(companyId);
  const c: TaskComment = {
    ...row,
    id: uuidLocal(),
    created_at: new Date().toISOString(),
  };
  store.comments.push(c);
  saveLocalTasksStore(companyId, store);
  return c;
}

export function upsertSubtaskLocal(companyId: string, subtask: Subtask): void {
  const store = loadLocalTasksStore(companyId);
  const ix = store.subtasks.findIndex((s) => s.id === subtask.id);
  if (ix >= 0) store.subtasks[ix] = subtask;
  else store.subtasks.push(subtask);
  saveLocalTasksStore(companyId, store);
}

export function deleteSubtaskLocal(companyId: string, subtaskId: string): void {
  const store = loadLocalTasksStore(companyId);
  store.subtasks = store.subtasks.filter((s) => s.id !== subtaskId);
  saveLocalTasksStore(companyId, store);
}
