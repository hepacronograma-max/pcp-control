"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { useUser } from "@/lib/hooks/use-user";
import {
  LIVE_PAGE_POLL_MS,
  liveGetInit,
  usePollWhenVisible,
} from "@/lib/hooks/use-poll-when-visible";
import {
  ABASTECIMENTO_DEFAULT_SORT,
  compareAbastecimentoItems,
  matchesAbastecimentoFilter,
  nextAbastecimentoSortKeys,
  type AbastecimentoFilter,
  type AbastecimentoSortKey,
  type SupplyStatus,
} from "@/lib/abastecimento";
import { formatShortDate, isPastDeadline } from "@/lib/utils/date";
import {
  defaultAppPathForRole,
  hasPermission,
} from "@/lib/utils/permissions";

type BoardItem = {
  id: string;
  product_code: string | null;
  description: string;
  quantity: number;
  line_name: string;
  pcp_deadline: string | null;
  production_start: string | null;
  production_end: string | null;
  supply_planned_date: string | null;
  supply_status: SupplyStatus | null;
  order_number: string;
  client_name: string;
};

const FILTERS: { id: AbastecimentoFilter; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pendentes", label: "Pendentes" },
  { id: "parcial", label: "Parcial" },
  { id: "abastecido", label: "Abastecido" },
];

export default function AbastecimentoPage() {
  const { profile, loading } = useUser();
  const router = useRouter();
  const { companyId, loaded: companyLoaded } = useEffectiveCompanyId(profile);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [fetching, setFetching] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AbastecimentoFilter>("todos");
  const [sortKeys, setSortKeys] = useState<AbastecimentoSortKey[]>(
    ABASTECIMENTO_DEFAULT_SORT
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  const allowed = profile && hasPermission(profile, "viewAbastecimento");
  const canEdit = profile ? hasPermission(profile, "editAbastecimento") : false;

  useEffect(() => {
    if (!loading && profile && !hasPermission(profile, "viewAbastecimento")) {
      router.replace(defaultAppPathForRole(profile.role));
    }
  }, [loading, profile, router]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!companyId) return;
      const silent = Boolean(opts?.silent);
      if (!silent) setFetching(true);
      try {
        const res = await fetch(
          `/api/abastecimento?companyId=${encodeURIComponent(companyId)}`,
          liveGetInit
        );
        const json = (await res.json()) as {
          items?: BoardItem[];
          error?: string;
          schemaMissing?: boolean;
        };
        if (json.schemaMissing) {
          setSchemaMissing(true);
          setItems([]);
          if (!silent) toast.error(json.error || "Faltam colunas no banco");
          return;
        }
        if (!res.ok) {
          if (!silent) toast.error(json.error || "Erro ao carregar abastecimento");
          return;
        }
        setSchemaMissing(false);
        setItems(json.items ?? []);
      } catch {
        if (!silent) toast.error("Erro ao carregar abastecimento");
      } finally {
        if (!silent) setFetching(false);
      }
    },
    [companyId]
  );

  useEffect(() => {
    if (allowed && companyLoaded && companyId) void load();
  }, [allowed, companyLoaded, companyId, load]);

  usePollWhenVisible(
    () => void load({ silent: true }),
    LIVE_PAGE_POLL_MS,
    Boolean(allowed && companyLoaded && companyId),
    { immediate: false }
  );

  const counts = useMemo(() => {
    const c: Record<AbastecimentoFilter, number> = {
      todos: items.length,
      pendentes: 0,
      parcial: 0,
      abastecido: 0,
    };
    for (const item of items) {
      if (item.supply_status == null) c.pendentes += 1;
      else if (item.supply_status === "partial") c.parcial += 1;
      else c.abastecido += 1;
    }
    return c;
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!matchesAbastecimentoFilter(item.supply_status, filter)) return false;
      if (!q) return true;
      return [
        item.order_number,
        item.client_name,
        item.product_code,
        item.description,
        item.line_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return filtered.sort((a, b) => compareAbastecimentoItems(a, b, sortKeys));
  }, [items, filter, query, sortKeys]);

  async function patchItem(
    item: BoardItem,
    patch: { supply_planned_date?: string | null; supply_status?: SupplyStatus | null }
  ) {
    if (!companyId || !canEdit) return;
    setSavingId(item.id);
    try {
      const res = await fetch("/api/abastecimento", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, itemId: item.id, ...patch }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        schemaMissing?: boolean;
        item?: { supply_planned_date: string | null; supply_status: SupplyStatus | null };
      };
      if (!res.ok || !json.success || !json.item) {
        if (json.schemaMissing) setSchemaMissing(true);
        toast.error(json.error || "Não foi possível salvar");
        return;
      }
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                supply_planned_date: json.item!.supply_planned_date,
                supply_status: json.item!.supply_status,
              }
            : row
        )
      );
    } catch {
      toast.error("Não foi possível salvar");
    } finally {
      setSavingId(null);
    }
  }

  if (loading || !allowed) {
    return (
      <div className="p-6 text-sm text-slate-500">Carregando abastecimento…</div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Abastecimento</h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            Itens das linhas de produção. A logística informa a data e marca
            Abastecido ou Abastecido parcialmente — nesse caso a produção pode
            começar faltando peça. Clicar de novo no botão ativo desfaz a marcação.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar pedido, cliente ou descrição…"
          className="h-9 w-full sm:w-72 rounded-md border border-slate-300 px-3 text-sm"
        />
      </div>

      {schemaMissing ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Faltam colunas no banco. Execute o arquivo{" "}
          <span className="font-medium">supabase-abastecimento.sql</span> no SQL
          Editor do Supabase.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${
              filter === tab.id
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
            }`}
          >
            {tab.label} {counts[tab.id]}
          </button>
        ))}
      </div>

      <div className="min-w-0 overflow-x-hidden overflow-y-auto rounded-md border border-slate-200 bg-white">
        <table className="w-full table-fixed text-[10px] leading-tight">
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            <col className="w-[14%]" />
            <col className="w-[4%]" />
            <col className="w-[9%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <SortHeader label="Pedido" sortKey="order_number" sortKeys={sortKeys} onSort={setSortKeys} />
              <SortHeader label="Cliente" sortKey="client_name" sortKeys={sortKeys} onSort={setSortKeys} />
              <th className="px-1 py-1 text-left font-medium">Cód.</th>
              <SortHeader label="Descrição" sortKey="description" sortKeys={sortKeys} onSort={setSortKeys} />
              <SortHeader label="Qtd" sortKey="quantity" sortKeys={sortKeys} onSort={setSortKeys} align="center" />
              <th className="px-1 py-1 text-left font-medium">Linha</th>
              <SortHeader label="Prazo PCP" sortKey="pcp_deadline" sortKeys={sortKeys} onSort={setSortKeys} />
              <SortHeader label="Início" sortKey="production_start" sortKeys={sortKeys} onSort={setSortKeys} />
              <SortHeader label="Fim" sortKey="production_end" sortKeys={sortKeys} onSort={setSortKeys} />
              <th className="px-1 py-1 text-left font-medium">Abastecer em</th>
              <th className="px-1 py-1 text-left font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const late =
                item.supply_status !== "full" &&
                isPastDeadline(item.supply_planned_date);
              const rowTone =
                item.supply_status === "full"
                  ? "bg-emerald-50"
                  : item.supply_status === "partial"
                    ? "bg-amber-50"
                    : late
                      ? "bg-red-50"
                      : "";
              const busy = savingId === item.id;
              return (
                <tr key={item.id} className={`border-t border-slate-100 ${rowTone}`}>
                  <td className="overflow-hidden px-1 py-1 font-medium whitespace-nowrap">
                    {item.order_number}
                  </td>
                  <td className="overflow-hidden px-1 py-1 truncate" title={item.client_name}>
                    {item.client_name}
                  </td>
                  <td className="overflow-hidden px-1 py-1 truncate" title={item.product_code ?? undefined}>
                    {item.product_code || "—"}
                  </td>
                  <td className="overflow-hidden px-1 py-1 truncate" title={item.description}>
                    {item.description}
                  </td>
                  <td className="overflow-hidden px-1 py-1 text-center">{item.quantity}</td>
                  <td className="overflow-hidden px-1 py-1 truncate" title={item.line_name}>
                    {item.line_name}
                  </td>
                  <td className="overflow-hidden px-1 py-1 whitespace-nowrap">
                    {formatShortDate(item.pcp_deadline)}
                  </td>
                  <td className="overflow-hidden px-1 py-1 whitespace-nowrap">
                    {formatShortDate(item.production_start)}
                  </td>
                  <td className="overflow-hidden px-1 py-1 whitespace-nowrap">
                    {formatShortDate(item.production_end)}
                  </td>
                  <td className="overflow-hidden px-1 py-1">
                    <input
                      type="date"
                      value={item.supply_planned_date ?? ""}
                      disabled={!canEdit || busy}
                      onChange={(e) =>
                        void patchItem(item, {
                          supply_planned_date: e.target.value || null,
                        })
                      }
                      className="box-border h-6 w-full min-w-0 max-w-full rounded border border-slate-300 px-0 text-[10px] disabled:bg-slate-100 [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:w-3.5 [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-datetime-edit]:p-0"
                    />
                  </td>
                  <td className="overflow-hidden px-1 py-1">
                    <div className="flex flex-col gap-0.5">
                      <StatusButton
                        active={item.supply_status === "full"}
                        disabled={!canEdit || busy}
                        tone="full"
                        onClick={() =>
                          void patchItem(item, {
                            supply_status:
                              item.supply_status === "full" ? null : "full",
                          })
                        }
                      >
                        Abastecido
                      </StatusButton>
                      <StatusButton
                        active={item.supply_status === "partial"}
                        disabled={!canEdit || busy}
                        tone="partial"
                        onClick={() =>
                          void patchItem(item, {
                            supply_status:
                              item.supply_status === "partial" ? null : "partial",
                          })
                        }
                      >
                        Abastecido parcialmente
                      </StatusButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-500">
                  {fetching
                    ? "Carregando…"
                    : "Nenhum item de produção neste filtro."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sortKeys,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: AbastecimentoSortKey;
  sortKeys: AbastecimentoSortKey[];
  onSort: (keys: AbastecimentoSortKey[]) => void;
  align?: "left" | "center";
}) {
  const index = sortKeys.indexOf(sortKey);
  const rank = index >= 0 && index < 3 ? index + 1 : null;
  return (
    <th className={`px-1 py-1 font-medium ${align === "center" ? "text-center" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(nextAbastecimentoSortKeys(sortKeys, sortKey))}
        className={`inline-flex max-w-full items-center gap-0.5 hover:text-slate-900 ${align === "center" ? "justify-center" : ""}`}
      >
        {label}
        {rank != null ? (
          <span className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white px-0.5 text-[8px] font-bold text-slate-700">
            {rank}
          </span>
        ) : null}
      </button>
    </th>
  );
}

function StatusButton({
  active,
  disabled,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  tone: "full" | "partial";
  onClick: () => void;
  children: string;
}) {
  const on =
    tone === "full"
      ? "bg-emerald-600 text-white border-emerald-600"
      : "bg-amber-500 text-white border-amber-500";
  const off =
    tone === "full"
      ? "bg-white text-emerald-700 border-emerald-600 hover:bg-emerald-50"
      : "bg-white text-amber-800 border-amber-500 hover:bg-amber-50";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded border px-1 py-0.5 text-[10px] font-medium leading-tight whitespace-normal disabled:opacity-60 ${
        active ? on : off
      }`}
    >
      {children}
    </button>
  );
}
