import { NextRequest, NextResponse } from "next/server";
import { assertTasksCompanyAccess } from "@/lib/tasks-api-guard";
import { resolveTasksViewerId } from "@/lib/tasks-api-viewer";
import type { ProductionLine } from "@/lib/types/database";
import type { Subtask } from "@/lib/types/subtasks";
import type { Task } from "@/lib/types/tasks";
import { PRODUCTION_LINES_ACTIVE_OR } from "@/lib/supabase/production-line-filters";
import { productionLineIsAlmoxarifado } from "@/lib/supabase/sync-almoxarifado-on-program";
import { countAlmoxSupplyPending } from "@/lib/supabase/fetch-almox-scheduled-items";
import {
  buildDepartmentIdToLineIdMap,
  countAttentionOrderItemsByLineId,
  countAttentionTasksByLineId,
  mergeCountMaps,
  todayYmdBrazil,
  type LinePendingOrderRow,
} from "@/lib/supabase/fetch-line-pending-count";

function buildSubtaskMap(rows: Subtask[]): Record<string, Subtask[]> {
  const m: Record<string, Subtask[]> = {};
  for (const s of rows) {
    m[s.task_id] ??= [];
    m[s.task_id]!.push(s);
  }
  return m;
}

function nestedOrderStatus(ordersEmbed: unknown): string | null {
  if (!ordersEmbed) return null;
  if (Array.isArray(ordersEmbed)) {
    const row = ordersEmbed[0] as { status?: unknown } | undefined;
    return row?.status != null ? String(row.status) : null;
  }
  const obj = ordersEmbed as { status?: unknown };
  return obj.status != null ? String(obj.status) : null;
}

/**
 * GET: contagens por `line_id` para pulso hierárquico no menu lateral.
 *
 * Critérios de pedidos (order_items): ver `orderItemNeedsLineAttention` —
 * só sem `production_start` ou atrasados (`production_start` &lt; hoje BR),
 * sem `production_end`, sem pedido/item encerrados.
 *
 * Opcional `includeTasks=1`: soma tarefas Kanban onde o departamento tem o mesmo nome da linha
 * (padrão **desligado** por gerar falsos positivos quando nomes coincidem).
 *
 * Opcional `diag=1`: log servidor com contagens só-pedidos vs tarefas por linha.
 *
 * Params: `companyId` obrigatório; `viewerId` recomendado (modo cookie local para tasks).
 */
export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const viewerParam = request.nextUrl.searchParams.get("viewerId");
  const includeTasks =
    request.nextUrl.searchParams.get("includeTasks") === "1" ||
    request.nextUrl.searchParams.get("includeTasks") === "true";
  const diag = request.nextUrl.searchParams.get("diag") === "1";

  const gate = await assertTasksCompanyAccess(companyId);
  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error, counts: {} },
      { status: gate.status }
    );
  }

  const vr = await resolveTasksViewerId(viewerParam);
  const viewerId = vr.ok ? vr.viewerId : null;

  const { admin } = gate;
  const todayYmd = todayYmdBrazil();

  const { data: oiRows, error: oiErr } = await admin
    .from("order_items")
    .select(
      `
      line_id,
      status,
      production_start,
      production_end,
      orders!inner ( company_id, status )
    `
    )
    .eq("orders.company_id", companyId!)
    .not("line_id", "is", null);

  if (oiErr) {
    if (/relation|does not exist/i.test(oiErr.message ?? "")) {
      return NextResponse.json({
        counts: {},
        hint: "order_items × orders falhou ao consultar.",
      });
    }
    return NextResponse.json({ error: oiErr.message, counts: {} }, { status: 500 });
  }

  const orderShapes: LinePendingOrderRow[] = ((oiRows ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      line_id: row.line_id as string | null,
      status: String(row.status ?? ""),
      production_start:
        typeof row.production_start === "string"
          ? row.production_start
          : row.production_start != null
            ? String(row.production_start)
            : null,
      production_end:
        typeof row.production_end === "string"
          ? row.production_end
          : row.production_end != null
            ? String(row.production_end)
            : null,
      order_status: nestedOrderStatus(row.orders),
    })
  );

  let counts = countAttentionOrderItemsByLineId(orderShapes, todayYmd);

  let linesRes = await admin
    .from("production_lines")
    .select("id, name, company_id, is_active, sort_order, is_almoxarifado")
    .eq("company_id", companyId!)
    .or(PRODUCTION_LINES_ACTIVE_OR)
    .order("sort_order", { ascending: true });
  let linesTyped: ProductionLine[] = (linesRes.data ?? []) as ProductionLine[];

  if (
    linesRes.error &&
    /is_almoxarifado|schema cache/i.test(linesRes.error.message ?? "")
  ) {
    const retry = await admin
      .from("production_lines")
      .select("id, name, company_id, is_active, sort_order")
      .eq("company_id", companyId!)
      .or(PRODUCTION_LINES_ACTIVE_OR)
      .order("sort_order", { ascending: true });
    linesTyped = (
      retry.data?.map((r: Record<string, unknown>) => ({
        ...r,
        is_almoxarifado: false as const,
      })) ?? []
    ) as ProductionLine[];
  }

  let almoxN = 0;

  if (linesTyped.length > 0) {
    try {
      const pendingRes = await countAlmoxSupplyPending(admin, linesTyped, {
        period: "all",
      });
      if (!pendingRes.error) {
        almoxN = pendingRes.count ?? 0;
        const almoxLineIds = linesTyped.filter((l) => productionLineIsAlmoxarifado(l)).map((l) => l.id);
        for (const id of almoxLineIds) {
          counts[id] = Math.max(counts[id] ?? 0, almoxN);
        }
      }
    } catch {
      /* ignore */
    }

    let taskContribution: Record<string, number> = {};
    if (includeTasks) {
      try {
        const deptRes = await admin
          .from("departments")
          .select("id, name")
          .eq("company_id", companyId!);

        if (!deptRes.error && deptRes.data?.length) {
          const deptIdToLineId = buildDepartmentIdToLineIdMap(
            linesTyped.map((l) => ({ id: l.id, name: l.name })),
            deptRes.data as { id: string; name: string }[]
          );

          const taskRes = await admin.from("tasks").select("*").eq("company_id", companyId!);
          if (
            !taskRes.error &&
            taskRes.data?.length &&
            Object.keys(deptIdToLineId).length > 0
          ) {
            const tasks = taskRes.data as Task[];
            const ids = tasks.map((t) => t.id);
            let subMap: Record<string, Subtask[]> = {};
            const sRes = await admin.from("subtasks").select("*").in("task_id", ids);
            if (sRes.data && !sRes.error) {
              subMap = buildSubtaskMap(sRes.data as Subtask[]);
            }
            taskContribution = countAttentionTasksByLineId(
              tasks,
              subMap,
              deptIdToLineId,
              viewerId ?? null
            );
            counts = mergeCountMaps(counts, taskContribution);
          }
        }
      } catch {
        /* opcional */
      }
    }

    const attentionFromItemsOnly = countAttentionOrderItemsByLineId(
      orderShapes,
      todayYmd
    );

    const afterItemsPlusAlmox: Record<string, number> = {
      ...attentionFromItemsOnly,
    };
    if (almoxN > 0) {
      const almoxIds = linesTyped
        .filter((l) => productionLineIsAlmoxarifado(l))
        .map((l) => l.id);
      for (const id of almoxIds) {
        afterItemsPlusAlmox[id] = Math.max(afterItemsPlusAlmox[id] ?? 0, almoxN);
      }
    }

    if (diag) {
      console.log("[line-pending-count/diag]", {
        companyId,
        todayUsed: todayYmd,
        includeTasks,
        orderRows: orderShapes.length,
        attentionFromItemsOnly,
        attentionAfterItemsPlusAlmox: afterItemsPlusAlmox,
        attentionFromTasks: includeTasks
          ? taskContribution
          : "(omitido — use includeTasks=1)",
        mergedFinalReturned: counts,
        lineLabels: Object.fromEntries(linesTyped.map((l) => [l.id, l.name])),
      });
    }
  }

  return NextResponse.json({ counts });
}