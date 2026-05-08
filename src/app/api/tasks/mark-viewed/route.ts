import { NextRequest, NextResponse } from "next/server";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";
import { resolveTasksViewerId } from "@/lib/tasks-api-viewer";

export async function POST(request: NextRequest) {
  let body: { companyId?: string; taskId?: string; viewerId?: string };
  try {
    body = (await request.json()) as { companyId?: string; taskId?: string; viewerId?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const companyId = body.companyId?.trim() ?? null;
  const taskId = body.taskId?.trim() ?? null;
  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const who = await resolveTasksViewerId(body.viewerId?.trim() ?? null);
  if (!who.ok) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }

  if (!taskId) {
    return NextResponse.json({ error: "taskId obrigatório" }, { status: 400 });
  }

  const { admin } = gate;
  const { data: task, error: fErr } = await admin
    .from("tasks")
    .select("id, company_id, assigned_to")
    .eq("id", taskId)
    .maybeSingle();

  if (fErr) {
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }
  if (!task || task.company_id !== companyId) {
    return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
  }

  if (task.assigned_to !== who.viewerId) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const now = new Date().toISOString();
  const { error: uErr } = await admin
    .from("tasks")
    .update({ viewed_at: now, updated_at: now })
    .eq("id", taskId);
  if (uErr) {
    if (/column|viewed_at|does not exist/i.test(uErr.message)) {
      return NextResponse.json({ success: true, schemaMissing: true });
    }
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, viewed_at: now });
}
