import type { TaskStatus } from "@/lib/types/tasks";

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  sort_order: number;
  created_at: string;
}
