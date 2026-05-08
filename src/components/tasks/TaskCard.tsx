"use client";

import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Task } from "@/lib/types/tasks";
import type { Subtask } from "@/lib/types/subtasks";
import { departmentChipClasses } from "@/lib/types/departments";
import { completedSubtasksCount, getEffectiveTaskProgress, getEffectiveTaskStatus } from "@/lib/task-hierarchy";
import { coerceTask } from "@/lib/types/tasks";

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

export interface TaskCardProps {
  task: Task;
  subtasks: Subtask[];
  departmentName: string | null;
  assigneeName: string | null;
  currentUserId: string;
  draggable: boolean;
  onOpenDetail: () => void;
  onOpenComments: () => void;
  commentCount: number;
}

export function TaskCard({
  task,
  subtasks,
  departmentName,
  assigneeName,
  currentUserId,
  draggable,
  onOpenDetail,
  onOpenComments,
  commentCount,
}: TaskCardProps) {
  const t = coerceTask(task);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !draggable,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const progress = useMemo(
    () => getEffectiveTaskProgress(t, subtasks),
    [t, subtasks]
  );
  const doneN = completedSubtasksCount(subtasks);

  const dueLabel = useMemo(() => {
    if (!task.due_date) return null;
    try {
      return format(parseISO(task.due_date), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return task.due_date;
    }
  }, [task.due_date]);

  const pulse =
    t.assigned_to === currentUserId &&
    t.viewed_at == null &&
    getEffectiveTaskStatus(t, subtasks) !== "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetail();
        }
      }}
      className={`rounded-lg border bg-white p-3 shadow-sm text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1B4F72]/40 ${
        pulse
          ? "border-amber-400 shadow-amber-200/80 ring-2 ring-amber-300 animate-pulse"
          : "border-slate-200"
      } ${isDragging ? "opacity-60 ring-2 ring-[#1B4F72]/30" : ""}`}
    >
      <div className="flex items-start gap-2">
        {draggable && (
          <button
            type="button"
            className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing touch-manipulation p-1 -ml-1"
            aria-label="Arrastar tarefa"
            {...listeners}
            {...attributes}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-900 text-sm leading-snug flex-1 min-w-0">
              {task.title}
            </span>
            {departmentName ? (
              <Badge
                variant="outline"
                className={`text-[10px] shrink-0 border ${departmentChipClasses(departmentName)}`}
              >
                {departmentName}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#1B4F72] transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-slate-600 w-8 text-right">{progress}%</span>
          </div>

          <p className="text-[11px] text-slate-600">
            {doneN}/{subtasks.length || 0} subtarefas concluídas
            {t.status_auto ? "" : " · manual"}
          </p>

          {dueLabel ? (
            <p className="text-[11px] text-slate-500">
              Prazo: <span className="text-slate-700 font-medium">{dueLabel}</span>
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="h-7 w-7 rounded-full bg-slate-200 text-slate-700 text-[10px] font-semibold flex items-center justify-center shrink-0"
                title={assigneeName ?? "Sem atribuição"}
              >
                {assigneeName ? initials(assigneeName) : "—"}
              </div>
              <span className="text-xs text-slate-700 truncate max-w-[9rem]">
                {assigneeName ?? "Sem atribuição"}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenComments();
                }}
                title="Comentários"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {commentCount > 0 && (
                  <span className="ml-1 tabular-nums text-[10px]">{commentCount}</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
