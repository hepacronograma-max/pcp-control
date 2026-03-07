'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import type { Holiday } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const LOCAL_HOLIDAYS_KEY = "pcp-local-holidays";

function loadLocalHolidays(): Holiday[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_HOLIDAYS_KEY);
    return raw ? (JSON.parse(raw) as Holiday[]) : [];
  } catch {
    return [];
  }
}

function saveLocalHolidays(holidays: Holiday[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_HOLIDAYS_KEY, JSON.stringify(holidays));
}

const FERIADOS_NACIONAIS = [
  { date: "01-01", description: "Confraternização Universal", is_recurring: true },
  { date: "04-21", description: "Tiradentes", is_recurring: true },
  { date: "05-01", description: "Dia do Trabalho", is_recurring: true },
  { date: "09-07", description: "Independência do Brasil", is_recurring: true },
  { date: "10-12", description: "Nossa Sra. Aparecida", is_recurring: true },
  { date: "11-02", description: "Finados", is_recurring: true },
  { date: "11-15", description: "Proclamação da República", is_recurring: true },
  { date: "12-25", description: "Natal", is_recurring: true },
];

function genId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `holiday-${Date.now()}`;
}

export default function HolidaysSettingsPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRecurring, setNewRecurring] = useState(true);

  const isLocal =
    !supabase ||
    profile?.company_id === "local-company" ||
    profile?.id === "local-admin";

  useEffect(() => {
    if (!profile?.company_id) return;
    if (isLocal) {
      const all = loadLocalHolidays();
      setHolidays(
        [...all].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      );
      return;
    }
    const client = supabase!;
    async function load() {
      const { data } = await client
        .from("holidays")
        .select("*")
        .eq("company_id", profile!.company_id!)
        .order("date", { ascending: true });
      setHolidays(data ?? []);
    }
    load();
  }, [profile, supabase, isLocal]);

  async function refresh() {
    if (!profile?.company_id) return;
    if (isLocal) {
      const all = loadLocalHolidays();
      setHolidays(
        [...all].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      );
      return;
    }
    const { data } = await supabase!
      .from("holidays")
      .select("*")
      .eq("company_id", profile.company_id)
      .order("date", { ascending: true });
    setHolidays(data ?? []);
  }

  async function handleCreate() {
    if (!profile?.company_id || !newDate || !newDescription.trim()) return;
    if (isLocal) {
      const now = new Date().toISOString();
      const newHoliday: Holiday = {
        id: genId(),
        company_id: profile.company_id,
        date: newDate,
        description: newDescription.trim(),
        is_recurring: newRecurring,
        created_at: now,
      };
      const all = loadLocalHolidays();
      saveLocalHolidays([...all, newHoliday]);
      setHolidays((prev) =>
        [...prev, newHoliday].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      );
      setNewDate("");
      setNewDescription("");
      setNewRecurring(true);
      toast.success("Feriado criado");
      return;
    }
    const { error } = await supabase!.from("holidays").insert({
      company_id: profile.company_id,
      date: newDate,
      description: newDescription.trim(),
      is_recurring: newRecurring,
    });
    if (error) {
      toast.error("Erro ao criar feriado");
    } else {
      toast.success("Feriado criado");
      setNewDate("");
      setNewDescription("");
      setNewRecurring(true);
      await refresh();
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Deseja realmente excluir este feriado?")) return;
    if (isLocal) {
      const all = loadLocalHolidays().filter((h) => h.id !== id);
      saveLocalHolidays(all);
      setHolidays(all);
      toast.success("Feriado excluído");
      return;
    }
    const { error } = await supabase!.from("holidays").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir feriado");
    } else {
      toast.success("Feriado excluído");
      setHolidays((prev) => prev.filter((h) => h.id !== id));
    }
  }

  async function handlePreload() {
    if (!profile?.company_id) return;
    const year = new Date().getFullYear();
    const now = new Date().toISOString();
    if (isLocal) {
      const all = loadLocalHolidays();
      const existingDates = new Set(all.map((h) => h.date));
      const toAdd = FERIADOS_NACIONAIS.filter((f) => {
        const dateStr = `${year}-${f.date}`;
        return !existingDates.has(dateStr);
      }).map((f) => ({
        id: genId(),
        company_id: profile.company_id,
        date: `${year}-${f.date}`,
        description: f.description,
        is_recurring: f.is_recurring,
        created_at: now,
      })) as Holiday[];
      if (toAdd.length === 0) {
        toast.info("Feriados nacionais já estão cadastrados");
        return;
      }
      saveLocalHolidays([...all, ...toAdd]);
      setHolidays((prev) =>
        [...prev, ...toAdd].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        )
      );
      toast.success(
        `${toAdd.length} feriado(s) nacionais carregado(s)`
      );
      return;
    }
    const rows = FERIADOS_NACIONAIS.map((f) => ({
      company_id: profile.company_id,
      date: `${year}-${f.date}`,
      description: f.description,
      is_recurring: f.is_recurring,
    }));
    const { error } = await supabase!.from("holidays").insert(rows);
    if (error) {
      toast.error("Erro ao carregar feriados nacionais");
    } else {
      toast.success("Feriados nacionais carregados");
      await refresh();
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando feriados...</p>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Feriados</h1>
          <p className="text-sm text-slate-600">
            Gerencie os feriados que impactam o calendário de produção.
          </p>
        </div>
        <Button className="text-xs h-8" onClick={handlePreload}>
          Carregar feriados nacionais
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm space-y-2">
        <div className="grid grid-cols-[120px_minmax(0,1fr)_120px_auto] gap-2 items-end">
          <div>
            <Label className="text-xs">Data</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input
              className="h-8 text-xs"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-xs mt-4">
            <input
              type="checkbox"
              checked={newRecurring}
              onChange={(e) => setNewRecurring(e.target.checked)}
            />
            Recorrente anual
          </label>
          <Button
            className="text-xs h-8"
            onClick={handleCreate}
            disabled={!newDate || !newDescription.trim()}
          >
            + Novo Feriado
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left w-32">Data</th>
              <th className="px-2 py-2 text-left">Descrição</th>
              <th className="px-2 py-2 text-left w-28">Recorrente</th>
              <th className="px-2 py-2 text-left w-20">Ações</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h, idx) => {
              const dateObj = new Date(h.date);
              const formatted = h.is_recurring
                ? dateObj.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })
                : dateObj.toLocaleDateString("pt-BR");
              return (
                <tr
                  key={h.id}
                  className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >
                  <td className="px-2 py-1 align-middle">{formatted}</td>
                  <td className="px-2 py-1 align-middle">{h.description}</td>
                  <td className="px-2 py-1 align-middle">
                    {h.is_recurring ? "✅ Anual" : "❌ Único"}
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <button
                      className="text-xs text-red-500"
                      onClick={() => handleDelete(h.id)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
            {holidays.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-2 py-3 text-center text-slate-500"
                >
                  Nenhum feriado cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

