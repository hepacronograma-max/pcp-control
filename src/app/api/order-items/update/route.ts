import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncAlmoxarifadoOnProgram } from "@/lib/supabase/sync-almoxarifado-on-program";
import { toDateOnly, toQuantity } from "@/lib/utils/supabase-data";

/**
 * Atualiza order_items ou orders no Supabase (service role).
 * Garante que alterações de linha, quantidade, prazo PCP sejam salvas no banco.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const hasLocalAuth = cookieStore.get("pcp-local-auth")?.value === "1";
    if (!hasLocalAuth) {
      return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const {
      action,
      itemId,
      orderId,
      lineId,
      quantity,
      pcp_deadline,
      order_number,
      client_name,
      delivery_deadline,
      production_start,
      production_end,
      notes,
      complete,
      pc_number,
      pc_delivery_date,
      target_almox_line_id,
    } = body;

    const supabase = createSupabaseAdminClient();

    if (action === "order" && orderId) {
      const update: Record<string, unknown> = {};
      if (order_number !== undefined) update.order_number = String(order_number).trim().slice(0, 50);
      if (client_name !== undefined) update.client_name = String(client_name).trim().slice(0, 255);
      if (delivery_deadline !== undefined) update.delivery_deadline = toDateOnly(delivery_deadline);
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ success: true });
      }
      const { error } = await supabase.from("orders").update(update).eq("id", orderId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "line" && itemId !== undefined) {
      const { error } = await supabase
        .from("order_items")
        .update({ line_id: lineId || null })
        .eq("id", itemId);
      if (error) {
        const msg = error.message || "";
        const hint =
          /line_id|schema cache/i.test(msg)
            ? " Rode no SQL Editor: ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_id uuid REFERENCES production_lines(id) ON DELETE SET NULL;"
            : "";
        return NextResponse.json(
          { success: false, error: msg + hint },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "quantity" && itemId !== undefined) {
      const qty = toQuantity(quantity);
      const { error } = await supabase
        .from("order_items")
        .update({ quantity: qty })
        .eq("id", itemId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "finish" && orderId) {
      const nowIso = new Date().toISOString();
      let { error } = await supabase
        .from("orders")
        .update({ status: "finished", finished_at: nowIso })
        .eq("id", orderId);
      /** Bancos sem migração: grava só status (recomendado ainda adicionar finished_at). */
      if (
        error &&
        /finished_at|schema cache|column|does not exist/i.test(error.message)
      ) {
        ({ error } = await supabase
          .from("orders")
          .update({ status: "finished" })
          .eq("id", orderId));
      }
      if (error) {
        const msg = error.message || "";
        const hint = /finished_at|schema cache|column/i.test(msg)
          ? " Opcional: ALTER TABLE orders ADD COLUMN IF NOT EXISTS finished_at timestamptz;"
          : "";
        return NextResponse.json(
          { success: false, error: msg + hint },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }

    if (action === "delete" && orderId) {
      const { error: itErr } = await supabase.from("order_items").delete().eq("order_id", orderId);
      if (itErr) {
        return NextResponse.json({ success: false, error: itErr.message }, { status: 500 });
      }
      const { error: ordErr } = await supabase.from("orders").delete().eq("id", orderId);
      if (ordErr) {
        return NextResponse.json({ success: false, error: ordErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "pc" && itemId !== undefined) {
      const update: Record<string, unknown> = {};
      if (pc_number !== undefined) {
        const v = String(pc_number ?? "").trim().slice(0, 80);
        update.pc_number = v || null;
      }
      if (pc_delivery_date !== undefined) {
        update.pc_delivery_date = toDateOnly(pc_delivery_date);
      }
      if (Object.keys(update).length === 0) {
        return NextResponse.json({ success: true });
      }
      const { error } = await supabase.from("order_items").update(update).eq("id", itemId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "program" && itemId !== undefined) {
      const { data: itemRow } = await supabase
        .from("order_items")
        .select("pc_delivery_date, production_start, production_end")
        .eq("id", itemId)
        .maybeSingle();
      const pcDelivery = itemRow?.pc_delivery_date
        ? toDateOnly(itemRow.pc_delivery_date as string)
        : null;
      const existingStart = itemRow?.production_start
        ? toDateOnly(itemRow.production_start as string)
        : null;
      const existingEnd = itemRow?.production_end
        ? toDateOnly(itemRow.production_end as string)
        : null;
      /** undefined = não enviado (cliente só mexe em um campo por vez); null = limpar */
      const resolveDateField = (
        incoming: unknown,
        existing: string | null
      ): string | null => {
        if (incoming === undefined) return existing;
        if (incoming === null || incoming === "") return null;
        return toDateOnly(incoming as string);
      };
      const ps = resolveDateField(production_start, existingStart);
      const pe = resolveDateField(production_end, existingEnd);
      if (pcDelivery) {
        if (ps && ps < pcDelivery) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Início da produção não pode ser antes da entrega do pedido de compras (matéria-prima).",
            },
            { status: 400 }
          );
        }
        if (pe && pe < pcDelivery) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Fim da produção não pode ser antes da entrega do pedido de compras (matéria-prima).",
            },
            { status: 400 }
          );
        }
      }
      if (ps && pe && pe < ps) {
        return NextResponse.json(
          { success: false, error: "Data de fim não pode ser antes do início." },
          { status: 400 }
        );
      }
      const update: Record<string, unknown> = {
        status: "scheduled",
        production_start: ps,
        production_end: pe,
      };
      const { error } = await supabase.from("order_items").update(update).eq("id", itemId);
      if (error) {
        const msg = error.message || "";
        const hint =
          /status|production_start|schema cache/i.test(msg)
            ? " Execute no SQL Editor (supabase-add-columns.sql): ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status text DEFAULT 'waiting'; e colunas production_start, production_end."
            : "";
        return NextResponse.json(
          { success: false, error: msg + hint },
          { status: 500 }
        );
      }

      /** Almoxarifado: mesmo dia do início de produção na linha de chão. */
      const { data: ctxItem } = await supabase
        .from("order_items")
        .select(
          "id, order_id, line_id, description, quantity, pcp_deadline, pc_delivery_date"
        )
        .eq("id", itemId)
        .maybeSingle();
      if (ctxItem?.order_id) {
        const { data: orderRow } = await supabase
          .from("orders")
          .select("pcp_deadline")
          .eq("id", ctxItem.order_id)
          .maybeSingle();
        const tid =
          typeof target_almox_line_id === "string" && target_almox_line_id
            ? target_almox_line_id
            : null;
        await syncAlmoxarifadoOnProgram({
          supabase,
          sourceItemId: String(itemId),
          orderId: ctxItem.order_id,
          sourceLineId: ctxItem.line_id,
          sourceDescription: String(ctxItem.description ?? ""),
          sourceQuantity: Number(ctxItem.quantity ?? 1),
          productionStart: ps,
          productionEnd: pe,
          orderPcpDeadline: orderRow?.pcp_deadline ?? null,
          itemPcpDeadline: ctxItem.pcp_deadline ?? null,
          pcDeliveryDate: ctxItem.pc_delivery_date ?? null,
          targetAlmoxLineId: tid,
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "notes" && itemId !== undefined) {
      const notesVal = String(notes ?? "").trim().slice(0, 2000);
      const { error } = await supabase.from("order_items").update({ notes: notesVal }).eq("id", itemId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "complete" && itemId !== undefined) {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.slice(0, 10);
      const completedBy = body.completed_by ?? null;
      const updateData: Record<string, unknown> = {
        status: "completed",
        production_start: production_start ?? todayStr,
        production_end: production_end ?? todayStr,
        completed_at: nowIso,
      };
      if (completedBy) updateData.completed_by = completedBy;
      const { error } = await supabase.from("order_items").update(updateData).eq("id", itemId);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === "pcp_deadline" && orderId) {
      const dateVal = toDateOnly(pcp_deadline);
      const { error: ordErr } = await supabase
        .from("orders")
        .update({ pcp_deadline: dateVal })
        .eq("id", orderId);
      if (ordErr) {
        return NextResponse.json({ success: false, error: ordErr.message }, { status: 500 });
      }
      const { error: itErr } = await supabase
        .from("order_items")
        .update({ pcp_deadline: dateVal })
        .eq("order_id", orderId);
      if (itErr) {
        const msg = itErr.message || "";
        // Coluna ausente no banco antigo: pedido já foi atualizado; UI usa fallback do prazo do pedido
        if (/pcp_deadline|column|does not exist|schema cache/i.test(msg)) {
          console.warn("[order-items/update] itens sem pcp_deadline:", msg);
          return NextResponse.json({
            success: true,
            warning: "Adicione a coluna: ALTER TABLE order_items ADD COLUMN IF NOT EXISTS pcp_deadline date;",
          });
        }
        return NextResponse.json({ success: false, error: itErr.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
  } catch (err) {
    console.error("[order-items/update]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
