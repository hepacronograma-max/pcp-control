import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShippingList } from "@/lib/types/database";

export function isShippingListsMissing(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("shipping_lists") && (m.includes("does not exist") || m.includes("schema cache"));
}

export async function ensureOpenShippingList(
  admin: SupabaseClient,
  companyId: string,
  orderId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error } = await admin
    .from("shipping_lists")
    .select("id, status")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (isShippingListsMissing(error.message)) return;
    console.warn("[shipping-lists] ensure open:", error.message);
    return;
  }
  if (existing) return;
  const { error: insErr } = await admin.from("shipping_lists").insert({
    company_id: companyId,
    order_id: orderId,
    status: "open",
    created_at: now,
    updated_at: now,
  });
  if (insErr && !isShippingListsMissing(insErr.message)) {
    console.warn("[shipping-lists] insert:", insErr.message);
  }
}

export async function finalizeShippingListForOrder(
  admin: SupabaseClient,
  orderId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing, error } = await admin
    .from("shipping_lists")
    .select("id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (isShippingListsMissing(error.message)) return;
    console.warn("[shipping-lists] finalize read:", error.message);
    return;
  }
  if (!existing) return;
  const { error: updErr } = await admin
    .from("shipping_lists")
    .update({
      status: "finalized",
      finalized_at: now,
      updated_at: now,
    })
    .eq("id", existing.id);
  if (updErr && !isShippingListsMissing(updErr.message)) {
    console.warn("[shipping-lists] finalize:", updErr.message);
  }
}

export async function reopenShippingListForOrder(
  admin: SupabaseClient,
  orderId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("shipping_lists")
    .update({
      status: "open",
      finalized_at: null,
      invoiced_at: null,
      collected_at: null,
      nfe_number: null,
      updated_at: now,
    })
    .eq("order_id", orderId);
  if (error && /invoiced_at|collected_at|nfe_number|schema cache|column/i.test(error.message)) {
    await admin
      .from("shipping_lists")
      .update({
        status: "open",
        finalized_at: null,
        updated_at: now,
      })
      .eq("order_id", orderId);
    return;
  }
  if (error && !isShippingListsMissing(error.message)) {
    console.warn("[shipping-lists] reopen:", error.message);
  }
}

export async function markShippingListInvoiced(
  admin: SupabaseClient,
  orderId: string,
  opts?: { nfeNumber?: string | null }
): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const nfe = String(opts?.nfeNumber ?? "").trim() || null;
  const { data: existing, error } = await admin
    .from("shipping_lists")
    .select("id, invoiced_at, nfe_number")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (/nfe_number|schema cache|column|does not exist/i.test(error.message)) {
      const retry = await admin
        .from("shipping_lists")
        .select("id, invoiced_at")
        .eq("order_id", orderId)
        .maybeSingle();
      if (retry.error) return { ok: false, error: retry.error.message };
      if (!retry.data) {
        return { ok: false, error: "Lista de embarque não existe para este pedido." };
      }
      if (retry.data.invoiced_at) return { ok: true, changed: false };
      const updLegacy = await admin
        .from("shipping_lists")
        .update({ invoiced_at: now, updated_at: now })
        .eq("id", retry.data.id)
        .select("id");
      if (updLegacy.error) return { ok: false, error: updLegacy.error.message };
      return { ok: true, changed: true };
    }
    return { ok: false, error: error.message };
  }
  if (!existing) {
    return { ok: false, error: "Lista de embarque não existe para este pedido." };
  }
  const alreadyInvoiced = Boolean(existing.invoiced_at);
  const nfeChanged = Boolean(nfe && existing.nfe_number !== nfe);
  if (alreadyInvoiced && !nfeChanged) return { ok: true, changed: false };

  const payload: Record<string, unknown> = { updated_at: now };
  if (!alreadyInvoiced) payload.invoiced_at = now;
  if (nfeChanged) payload.nfe_number = nfe;

  const upd = await admin
    .from("shipping_lists")
    .update(payload)
    .eq("id", existing.id)
    .select("id");
  if (upd.error && /nfe_number|schema cache|column|does not exist/i.test(upd.error.message)) {
    if (alreadyInvoiced) return { ok: true, changed: false };
    const retry = await admin
      .from("shipping_lists")
      .update({ invoiced_at: now, updated_at: now })
      .eq("id", existing.id)
      .select("id");
    if (retry.error && /invoiced_at|schema cache|column|does not exist/i.test(retry.error.message)) {
      return {
        ok: false,
        error:
          "Falta a coluna invoiced_at. Cole supabase-shipping-lists-stations.sql no SQL Editor.",
      };
    }
    if (retry.error) return { ok: false, error: retry.error.message };
    return { ok: true, changed: true };
  }
  if (upd.error && /invoiced_at|schema cache|column|does not exist/i.test(upd.error.message)) {
    return {
      ok: false,
      error:
        "Falta a coluna invoiced_at. Cole supabase-shipping-lists-stations.sql no SQL Editor.",
    };
  }
  if (upd.error) return { ok: false, error: upd.error.message };
  return { ok: true, changed: true };
}

export async function markShippingListCollected(
  admin: SupabaseClient,
  orderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { data: existing, error } = await admin
    .from("shipping_lists")
    .select("id, invoiced_at, collected_at")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!existing) {
    return { ok: false, error: "Lista de embarque não existe para este pedido." };
  }
  if (existing.collected_at) return { ok: true };
  const upd = await admin
    .from("shipping_lists")
    .update({ collected_at: now, updated_at: now })
    .eq("id", existing.id)
    .select("id");
  if (upd.error && /collected_at|schema cache|column|does not exist/i.test(upd.error.message)) {
    return {
      ok: false,
      error:
        "Falta a coluna collected_at. Cole supabase-shipping-lists-stations.sql no SQL Editor.",
    };
  }
  if (upd.error) return { ok: false, error: upd.error.message };
  return { ok: true };
}

export async function loadShippingList(
  admin: SupabaseClient,
  orderId: string
): Promise<ShippingList | null> {
  const { data, error } = await admin
    .from("shipping_lists")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) {
    if (isShippingListsMissing(error.message)) return null;
    return null;
  }
  return (data as ShippingList) ?? null;
}
