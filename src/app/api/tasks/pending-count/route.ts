import { NextRequest, NextResponse } from "next/server";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";
import { resolveTasksViewerId } from "@/lib/tasks-api-viewer";
import { countMenuAttentionTasksForBoard } from "@/lib/tasks-stats";
import type { Subtask } from "@/lib/types/subtasks";
import type { Task } from "@/lib/types/tasks";

function buildSubtaskMap(rows: Subtask[]): Record<string, Subtask[]> {
  const m: Record<string, Subtask[]> = {};
  for (const s of rows) {
    m[s.task_id] ??= [];
    m[s.task_id]!.push(s);
  }
  return m;
}

/**
 * Contagem para o menu: tarefas com atenção (efetivo ≠ done ou atribuídas ao viewer sem `viewed_at`).
 * `viewerId` na query (modo local) ou deduzido da sessão Supabase.
 */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const viewerParam = request.nextUrl.searchParams.get("viewerId");
  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, count: 0 }, { status: gate.status });
  }

  const who = await resolveTasksViewerId(viewerParam);
  if (!who.ok) {
    return NextResponse.json({ error: who.error, count: 0 }, { status: who.status });
  }

  const { admin } = gate;
  const { data: taskRows, error: tErr } = await admin
    .from("tasks")
    .select("*")
    .eq("company_id", companyId!);
  if (tErr) {
    if (/relation|does not exist/i.test(tErr.message)) {
      return NextResponse.json({ count: 0, schemaMissing: true });
    }
    return NextResponse.json({ error: tErr.message, count: 0 }, { status: 500 });
  }

  const tasks = (taskRows ?? []) as Task[];
  const ids = tasks.map((t) => t.id);
  let subMap: Record<string, Subtask[]> = {};
  if (ids.length > 0) {
    const { data: sRows, error: sErr } = await admin
      .from("subtasks")
      .select("*")
      .in("task_id", ids);
    if (sErr && !/relation|does not exist/i.test(sErr.message)) {
      return NextResponse.json({ error: sErr.message, count: 0 }, { status: 500 });
    }
    if (!sErr && sRows) {
      subMap = buildSubtaskMap(sRows as Subtask[]);
    }
  }

  const count = countMenuAttentionTasksForBoard(tasks, subMap, who.viewerId);
  return NextResponse.json({ count });
}
