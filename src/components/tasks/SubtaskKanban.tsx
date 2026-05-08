"use client";

import type { ReactNode } from "react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { TASK_COLUMNS, type TaskStatus } from "@/lib/types/tasks";
import type { Subtask } from "@/lib/types/subtasks";

function colDroppableId(parentTaskId: string, status: TaskStatus): string {
  return `subcol-${parentTaskId}-${status}`;
}

function SubCol({
  parentTaskId,
  status,
  title,
  count,
  children,
}: {
  parentTaskId: string;
  status: TaskStatus;
  title: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: colDroppableId(parentTaskId, status) });
  return (
    <div className="flex flex-col flex-1 min-w-[160px] rounded-lg border border-slate-200 bg-slate-50/80">
      <div className="px-2 py-1 border-b border-slate-100 text-[11px] font-semibold flex justify-between text-slate-700">
        <span>{title}</span>
        <span className="tabular-nums text-slate-500">{count}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`p-2 flex flex-col gap-2 min-h-[120px] ${isOver ? "bg-[#1B4F72]/10" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function SubCard({
  s,
  canDrag,
}: {
  s: Subtask;
  canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `subtask-${s.id}`,
    disabled: !canDrag,
    data: { subtaskId: s.id },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border border-slate-200 bg-white p-2 text-xs shadow-sm ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-1 items-start">
        {canDrag && (
          <button
            type="button"
            className="mt-0.5 text-slate-400 hover:text-slate-600 shrink-0 p-0.5 cursor-grab"
            {...listeners}
            {...attributes}
            aria-label="Arrastar subtarefa"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{s.title}</p>
          {s.description ? (
            <p className="mt-1 text-[11px] text-slate-600 whitespace-pre-wrap line-clamp-3">
              {s.description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function resolveDropStatus(
  overId: string | undefined,
  parentTaskId: string,
  subtasks: Subtask[]
): TaskStatus | null {
  if (!overId) return null;
  const prefix = `subcol-${parentTaskId}-`;
  if (overId.startsWith(prefix)) {
    const st = overId.slice(prefix.length) as TaskStatus;
    if (st === "todo" || st === "in_progress" || st === "done") return st;
  }
  if (overId.startsWith("subtask-")) {
    const sid = overId.slice("subtask-".length);
    const hit = subtasks.find((x) => x.id === sid);
    return hit?.status ?? null;
  }
  return null;
}

export interface SubtaskKanbanProps {
  parentTaskId: string;
  subtasks: Subtask[];
  canDrag: boolean;
  onStatusChange: (subtaskId: string, status: TaskStatus) => void;
}

export function SubtaskKanban({
  parentTaskId,
  subtasks,
  canDrag,
  onStatusChange,
}: SubtaskKanbanProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const byStatus = (st: TaskStatus) => subtasks.filter((s) => s.status === st);

  function handleDragEnd(ev: DragEndEvent) {
    if (!canDrag) return;
    const { active, over } = ev;
    const sid = String(active.id).startsWith("subtask-")
      ? String(active.id).slice("subtask-".length)
      : null;
    if (!sid) return;
    const next = resolveDropStatus(over ? String(over.id) : undefined, parentTaskId, subtasks);
    if (!next) return;
    const cur = subtasks.find((x) => x.id === sid);
    if (!cur || cur.status === next) return;
    onStatusChange(sid, next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex flex-col sm:flex-row gap-3">
        {TASK_COLUMNS.map((col) => (
          <SubCol
            key={col.id}
            parentTaskId={parentTaskId}
            status={col.id}
            title={col.title}
            count={byStatus(col.id).length}
          >
            {byStatus(col.id).map((s) => (
              <SubCard key={s.id} s={s} canDrag={canDrag} />
            ))}
          </SubCol>
        ))}
      </div>
    </DndContext>
  );
}
