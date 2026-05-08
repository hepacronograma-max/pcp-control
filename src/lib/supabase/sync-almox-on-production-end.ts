import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateOnly } from "@/lib/utils/supabase-data";
import { isUuid } from "@/lib/utils/is-uuid";

/** Converte `production_end` (data) para `almox_supplied_at` (timestamptz ISO). */
export function productionEndDateToAlmoxTimestamptz(productionEndDate: string): string {
  const d = toDateOnly(productionEndDate);
  if (!d) return `${new Date().toISOString().slice(0, 10)}T12:00:00.000Z`;
  return `${d}T12:00:00.000Z`;
}

function normalizeDateOnly(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return toDateOnly(s);
}

/** Alinha painel Almox quando `production_end` é gravado ou removido na linha de chão. */
export async function syncAlmoxOnProductionEndChange(
  supabase: SupabaseClient,
  itemId: string,
  opts: {
    nextProductionEnd: string | null;
    previousProductionEnd: string | null;
    actorUserId: string | null;
  }
): Promise<void> {
  const nNorm = normalizeDateOnly(opts.nextProductionEnd);
  const pNorm = normalizeDateOnly(opts.previousProductionEnd);
  if (nNorm === pNorm) return;

  /** Remove fecho automático de Almox se o fim da produção for apagado (só se foi automático). */
  if (!nNorm && pNorm) {
    const { data: row, error: selErr } = await supabase
      .from("order_items")
      .select("almox_supplied_auto")
      .eq("id", itemId)
      .maybeSingle();
    if (selErr?.message && /schema cache|does not exist|column/i.test(selErr.message)) {
      return;
    }
    if (selErr || !row) {
      console.warn("[sync-almox-pe] leitura almox_supplied_auto:", selErr?.message);
      return;
    }
    if ((row as { almox_supplied_auto?: boolean | null }).almox_supplied_auto !== true) {
      return;
    }
    const clearManual: Record<string, unknown> = {
      almox_supplied_at: null,
      almox_supplied_by: null,
    };
    let { error: clrErr } = await supabase
      .from("order_items")
      .update({ ...clearManual, almox_supplied_auto: false })
      .eq("id", itemId);
    if (
      clrErr?.message &&
      /almox_supplied_auto|schema cache|does not exist|column/i.test(clrErr.message)
    ) {
      ({ error: clrErr } = await supabase
        .from("order_items")
        .update(clearManual)
        .eq("id", itemId));
    }
    if (clrErr) {
      console.warn("[sync-almox-pe] limpar Almox ao remover fim produção:", clrErr.message);
    }
    return;
  }

  if (!nNorm) return;

  const actor = opts.actorUserId && isUuid(opts.actorUserId) ? opts.actorUserId.trim() : null;
  const suppliedAtIso = productionEndDateToAlmoxTimestamptz(nNorm);

  const tryPatches: Record<string, unknown>[] = [
    {
      almox_supplied_at: suppliedAtIso,
      almox_supplied_auto: true,
      almox_supplied_by: actor,
    },
    {
      almox_supplied_at: suppliedAtIso,
      almox_supplied_auto: true,
      almox_supplied_by: null,
    },
    { almox_supplied_at: suppliedAtIso, almox_supplied_by: null },
    { almox_supplied_at: suppliedAtIso },
  ];

  function recoverable(msg: string): boolean {
    return (
      /almox_supplied_auto|schema cache|does not exist|unknown column/i.test(msg) ||
      /foreign key|violates foreign key/i.test(msg)
    );
  }

  let lastMsg = "";
  for (const p of tryPatches) {
    const { error: upErr } = await supabase.from("order_items").update(p).eq("id", itemId);
    if (!upErr) return;
    lastMsg = upErr.message ?? "";
    if (!recoverable(lastMsg)) break;
  }

  console.warn("[sync-almox-pe] grava Almox ao finalizar produção:", lastMsg);
}
