"use client";

export type AuditFiltersState = {
  table: string;
  operation: string;
  user: string;
  from: string;
  to: string;
};

type Props = {
  value: AuditFiltersState;
  onChange: (next: AuditFiltersState) => void;
  onApply: () => void;
  tables: string[];
};

export function AuditFilters({ value, onChange, onApply, tables }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 p-4 rounded-lg border border-slate-200 bg-slate-50">
      <label className="text-xs">
        <span className="text-slate-600">Tabela</span>
        <select
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={value.table}
          onChange={(e) => onChange({ ...value, table: e.target.value })}
        >
          <option value="">Todas</option>
          {tables.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="text-slate-600">Operação</span>
        <select
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={value.operation}
          onChange={(e) => onChange({ ...value, operation: e.target.value })}
        >
          <option value="">Todas</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="text-slate-600">Usuário (e-mail)</span>
        <input
          type="text"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="contém…"
          value={value.user}
          onChange={(e) => onChange({ ...value, user: e.target.value })}
        />
      </label>
      <label className="text-xs">
        <span className="text-slate-600">De</span>
        <input
          type="date"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </label>
      <label className="text-xs">
        <span className="text-slate-600">Até</span>
        <input
          type="date"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </label>
      <div className="sm:col-span-2 lg:col-span-5 flex gap-2">
        <button
          type="button"
          onClick={onApply}
          className="px-3 py-1.5 rounded-md bg-[#1B4F72] text-white text-sm font-medium hover:bg-[#163d56]"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={() => {
            onChange({ table: "", operation: "", user: "", from: "", to: "" });
            onApply();
          }}
          className="px-3 py-1.5 rounded-md border border-slate-300 text-sm"
        >
          Limpar
        </button>
      </div>
    </div>
  );
}
