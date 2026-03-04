'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import type { Profile, ProductionLine } from "@/lib/types/database";
import {
  createLocalUser,
  getLocalUserWithLines,
  getLocalUsers,
  toggleLocalUserActive,
} from "@/lib/local-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const LOCAL_LINES_KEY = "pcp-local-lines";

function loadLocalLines(companyId: string): ProductionLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_LINES_KEY);
    const all = raw ? (JSON.parse(raw) as ProductionLine[]) : [];
    return all
      .filter((l) => l.company_id === companyId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  } catch {
    return [];
  }
}

interface UserWithLines extends Profile {
  lines: ProductionLine[];
}

export default function UsersSettingsPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [users, setUsers] = useState<UserWithLines[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"pcp" | "operator">("operator");
  const [newLineIds, setNewLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.company_id) return;
    const companyId = profile.company_id;

    // Modo local: sem Supabase, carrega usuários do localStorage
    if (!supabase) {
      const allLines = loadLocalLines(companyId);
      const localUsers = getLocalUserWithLines(companyId, allLines);
      setLines(allLines);
      setUsers(localUsers);
      return;
    }
    const client = supabase;
    async function load() {
      const { data: profiles } = await client
        .from("profiles")
        .select("*")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true });

      const { data: allLines } = await client
        .from("production_lines")
        .select("*")
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true });

      const { data: opLines } = await client
        .from("operator_lines")
        .select("user_id, line_id");

      const linesByUser: Record<string, ProductionLine[]> = {};
      (opLines ?? []).forEach((ol: { user_id: string; line_id: string }) => {
        const line = allLines?.find((l: ProductionLine) => l.id === ol.line_id);
        if (!line) return;
        if (!linesByUser[ol.user_id]) linesByUser[ol.user_id] = [];
        linesByUser[ol.user_id].push(line);
      });

      setLines(allLines ?? []);
      setUsers(
        (profiles ?? []).map((p: Profile) => ({
          ...p,
          lines: linesByUser[p.id] ?? [],
        }))
      );
    }
    load();
  }, [profile, supabase]);

  function toggleNewLine(lineId: string) {
    setNewLineIds((prev) =>
      prev.includes(lineId)
        ? prev.filter((id) => id !== lineId)
        : [...prev, lineId]
    );
  }

  async function handleCreateUser() {
    if (!profile?.company_id) return;
    if (!newFullName?.trim() || !newEmail?.trim() || !newPassword) {
      toast.error("Preencha nome, email e senha");
      return;
    }
    setSaving(true);
    try {
      // Modo local: sem Supabase, salva no localStorage
      if (!supabase) {
        const existing = getLocalUsers().filter(
          (u) => u.company_id === profile.company_id
        );
        if (
          existing.some(
            (u) => u.email.toLowerCase() === newEmail.trim().toLowerCase()
          )
        ) {
          toast.error("Já existe um usuário com este email");
          setSaving(false);
          return;
        }
        createLocalUser({
          fullName: newFullName.trim(),
          email: newEmail.trim(),
          password: newPassword,
          role: newRole,
          companyId: profile.company_id,
          lineIds: newRole === "operator" ? newLineIds : [],
        });
        toast.success("Usuário criado com sucesso");
        setShowNewModal(false);
        setNewFullName("");
        setNewEmail("");
        setNewPassword("");
        setNewRole("operator");
        setNewLineIds([]);
        const allLines = loadLocalLines(profile.company_id);
        setUsers(getLocalUserWithLines(profile.company_id, allLines));
        setSaving(false);
        return;
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          fullName: newFullName.trim(),
          role: newRole,
          companyId: profile.company_id,
          lineIds: newRole === "operator" ? newLineIds : [],
        }),
      });
      let data: { success?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        const fallback =
          res.status === 500
            ? "Erro no servidor. Verifique se o Supabase está configurado em .env.local (NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY)."
            : `Erro ${res.status}: resposta inválida`;
        data = { error: fallback };
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao criar usuário");
      }
      toast.success("Usuário criado com sucesso");
      setShowNewModal(false);
      setNewFullName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("operator");
      setNewLineIds([]);
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar usuário";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    if (!supabase) {
      const ok = toggleLocalUserActive(id, active);
      if (ok) {
        toast.success(active ? "Usuário ativado" : "Usuário desativado");
        if (profile?.company_id) {
          const allLines = loadLocalLines(profile.company_id);
          setUsers(getLocalUserWithLines(profile.company_id, allLines));
        }
      } else {
        toast.error("Erro ao atualizar usuário");
      }
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: active })
      .eq("id", id);
    if (error) {
      toast.error("Erro ao atualizar usuário");
    } else {
      toast.success(active ? "Usuário ativado" : "Usuário desativado");
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, is_active: active } : u))
      );
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando usuários...</p>;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-600">
            Gerencie os usuários e permissões do sistema.
          </p>
        </div>
        <Button
          className="text-xs h-8"
          onClick={() => setShowNewModal(true)}
        >
          + Novo Usuário
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left">Nome</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left w-24">Perfil</th>
              <th className="px-2 py-2 text-left w-16">Status</th>
              <th className="px-2 py-2 text-left w-24">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, idx) => (
              <tr
                key={u.id}
                className={idx % 2 === 0 ? "bg-white" : "bg-slate-50"}
              >
                <td className="px-2 py-1 align-middle">{u.full_name}</td>
                <td className="px-2 py-1 align-middle">{u.email}</td>
                <td className="px-2 py-1 align-middle">
                  {u.role === "manager"
                    ? "Manager"
                    : u.role === "pcp"
                    ? "PCP"
                    : u.role === "operator"
                    ? "Operador"
                    : "Super Admin"}
                </td>
                <td className="px-2 py-1 align-middle">
                  {u.is_active ? "✅" : "❌"}
                </td>
                <td className="px-2 py-1 align-middle">
                  <button
                    className="text-xs mr-2"
                    onClick={() => handleToggleActive(u.id, !u.is_active)}
                  >
                    {u.is_active ? "Desativar" : "Ativar"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-2 py-3 text-center text-slate-500"
                >
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showNewModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Novo Usuário
              </h2>
              <button
                className="text-xs text-slate-500"
                onClick={() => setShowNewModal(false)}
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Perfil</Label>
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs h-9"
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value as "pcp" | "operator")
                  }
                >
                  <option value="pcp">PCP</option>
                  <option value="operator">Operador</option>
                </select>
              </div>
            </div>

            {newRole === "operator" && (
              <div className="space-y-1">
                <Label>Linhas de produção</Label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {lines.map((line) => (
                    <label
                      key={line.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={newLineIds.includes(line.id)}
                        onChange={() => toggleNewLine(line.id)}
                      />
                      {line.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs"
                onClick={() => setShowNewModal(false)}
              >
                Cancelar
              </button>
              <Button
                className="text-xs"
                onClick={handleCreateUser}
                disabled={saving}
              >
                {saving ? "Criando..." : "Criar usuário"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

