"use client";

import { Fragment, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { diffJsonKeys } from "@/lib/audit/diff-json";

export type AuditEvent = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  user_email: string | null;
  created_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type Props = {
  events: AuditEvent[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function AuditTable({
  events,
  page,
  totalPages,
  total,
  onPageChange,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {total} registro(s) — página {page} de {totalPages || 1}
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-2 text-left">Quando</th>
              <th className="p-2 text-left">Op</th>
              <th className="p-2 text-left">Tabela</th>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Usuário</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => {
              const open = expandedId === ev.id;
              const diffs =
                ev.action === "UPDATE"
                  ? diffJsonKeys(ev.old_data, ev.new_data)
                  : [];
              return (
                <Fragment key={ev.id}>
                  <tr className="border-t border-slate-100">
                    <td className="p-2 whitespace-nowrap">
                      {format(new Date(ev.created_at), "dd/MM/yy HH:mm", {
                        locale: ptBR,
                      })}
                    </td>
                    <td className="p-2 font-medium">{ev.action}</td>
                    <td className="p-2">{ev.table_name}</td>
                    <td className="p-2 font-mono text-[10px] max-w-[100px] truncate">
                      {ev.record_id}
                    </td>
                    <td className="p-2">{ev.user_email ?? "—"}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        className="text-[#1B4F72] underline"
                        onClick={() =>
                          setExpandedId(open ? null : ev.id)
                        }
                      >
                        {open ? "Ocultar" : "Diff"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr key={`${ev.id}-detail`} className="bg-slate-50">
                      <td colSpan={6} className="p-3">
                        {ev.action === "UPDATE" && diffs.length > 0 ? (
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className="text-slate-500">
                                <th className="text-left p-1">Campo</th>
                                <th className="text-left p-1">Antes</th>
                                <th className="text-left p-1">Depois</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diffs.map((d) => (
                                <tr key={d.key} className="border-t border-slate-200">
                                  <td className="p-1 font-medium text-amber-800">
                                    {d.key}
                                  </td>
                                  <td className="p-1 text-red-700 break-all">
                                    {d.oldVal}
                                  </td>
                                  <td className="p-1 text-emerald-700 break-all">
                                    {d.newVal}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <pre className="text-[10px] overflow-auto max-h-40 p-2 bg-white rounded border">
                            {JSON.stringify(
                              { old: ev.old_data, new: ev.new_data },
                              null,
                              2
                            )}
                          </pre>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          disabled={page <= 1}
          className="px-2 py-1 text-xs border rounded disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
        >
          Anterior
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          className="px-2 py-1 text-xs border rounded disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
