import type { Department } from "@/lib/types/departments";
import type { Subtask } from "@/lib/types/subtasks";

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

/** Linha em `tasks` (Supabase ou espelho local). */
export interface Task {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** FK `departments.id` (nullable). */
  department_id: string | null;
  /** Se true, coluna Kanban usa agregação das subtarefas. */
  status_auto: boolean;
  /** 0–100 (persistido; em `status_auto` deve refletir subtarefas). */
  progress: number;
  /** Quando o responsável (`assigned_to`) abriu a task pela última vez. */
  viewed_at: string | null;
}

/** Normaliza linhas antigas (Supabase/local) sem as novas colunas. */
export function coerceTask(
  row: Partial<Task> & Pick<Task, "id" | "company_id" | "title">
): Task {
  const now = new Date().toISOString();
  return {
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    description: row.description ?? null,
    status: row.status ?? "todo",
    priority: row.priority ?? "medium",
    due_date: row.due_date ?? null,
    assigned_to: row.assigned_to ?? null,
    created_by: row.created_by ?? null,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
    department_id: row.department_id ?? null,
    status_auto: row.status_auto !== undefined ? row.status_auto : true,
    progress:
      typeof row.progress === "number" && !Number.isNaN(row.progress)
        ? Math.min(100, Math.max(0, row.progress))
        : 0,
    viewed_at: row.viewed_at ?? null,
  };
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  comment: string;
  created_at: string;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  user_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface TaskAssigneeOption {
  id: string;
  full_name: string;
  email?: string;
}

/** Bundle em localStorage (sem Supabase). */
export interface LocalTasksStore {
  tasks: Task[];
  comments: TaskComment[];
  history: TaskHistory[];
  departments: Department[];
  subtasks: Subtask[];
}

export const TASK_COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "A Fazer" },
  { id: "in_progress", title: "Em Andamento" },
  { id: "done", title: "Concluído" },
];

export function priorityLabel(p: TaskPriority): string {
  switch (p) {
    case "low":
      return "Baixa";
    case "medium":
      return "Média";
    case "high":
      return "Alta";
    default:
      return p;
  }
}

export function priorityClasses(p: TaskPriority): string {
  switch (p) {
    case "low":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "medium":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "high":
      return "bg-red-100 text-red-900 border-red-200";
    default:
      return "bg-slate-100 text-slate-700";
  }
}
