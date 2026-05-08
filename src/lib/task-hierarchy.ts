import type { Subtask } from "@/lib/types/subtasks";
import type { Task, TaskStatus } from "@/lib/types/tasks";

/**
 * Regras do enunciado:
 * - Todas done → done
 * - Pelo menos uma in_progress → in_progress
 * - Caso contrário → todo
 */
export function aggregateStatusFromSubtasks(subtasks: Subtask[]): TaskStatus {
  if (subtasks.length === 0) return "todo";
  const allDone = subtasks.every((s) => s.status === "done");
  if (allDone) return "done";
  const anyInProgress = subtasks.some((s) => s.status === "in_progress");
  if (anyInProgress) return "in_progress";
  return "todo";
}

export function aggregateProgressFromSubtasks(subtasks: Subtask[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.status === "done").length;
  return Math.round((done / subtasks.length) * 100);
}

/** Progresso sintético quando a task pai é manual (sem agregação de subtarefas). */
export function progressForManualStatus(status: TaskStatus): number {
  switch (status) {
    case "todo":
      return 0;
    case "in_progress":
      return 50;
    case "done":
      return 100;
    default:
      return 0;
  }
}

export function getEffectiveTaskStatus(task: Task, subtasks: Subtask[]): TaskStatus {
  if (!task.status_auto) return task.status;
  return aggregateStatusFromSubtasks(subtasks);
}

export function getEffectiveTaskProgress(task: Task, subtasks: Subtask[]): number {
  if (!task.status_auto) {
    return task.progress ?? progressForManualStatus(task.status);
  }
  return aggregateProgressFromSubtasks(subtasks);
}

export function completedSubtasksCount(subtasks: Subtask[]): number {
  return subtasks.filter((s) => s.status === "done").length;
}

export function patchParentFromSubtasks(
  parent: Task,
  subs: Subtask[],
  nowIso: string
): Partial<Task> {
  if (!parent.status_auto) {
    return {
      progress: progressForManualStatus(parent.status),
      updated_at: nowIso,
    };
  }
  return {
    status: aggregateStatusFromSubtasks(subs),
    progress: aggregateProgressFromSubtasks(subs),
    updated_at: nowIso,
  };
}
