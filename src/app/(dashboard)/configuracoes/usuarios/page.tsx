'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { createClient } from "@/lib/supabase/client";
import { shouldUseLocalServiceApi } from "@/lib/local-service-api";
import type { Profile, ProductionLine } from "@/lib/types/database";
import {
  createLocalUser,
  updateLocalUser,
  deleteLocalUser,
  getLocalUserWithLines,
  getLocalUsers,
  toggleLocalUserActive,
} from "@/lib/local-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { toast } from "sonner";

const LOCAL_LINES_KEY = "pcp-local-lines";

/** Alinhado à API: domínio com ponto (Supabase Auth rejeita ex.: @hepaf sem .com). */
function isValidAuthEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 5) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

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

type ModalMode = "create" | "edit";

export default function UsersSettingsPage() {
  const { profile, loading } = useUser();
  const { companyId: effectiveCompanyId, loaded: effectiveLoaded } =
    useEffectiveCompanyId(profile);
  const supabase = createClient();
  const [users, setUsers] = useState<UserWithLines[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<"pcp" | "operator">("operator");
  const [formLineIds, setFormLineIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteByEmail, setDeleteByEmail] = useState("");
  const [deletingByEmail, setDeletingByEmail] = useState(false);

  /**
   * "Local" só quando não há Supabase ou é demo sem cookie de API.
   * Com `pcp-local-auth` + Supabase, usamos o mesmo banco que o resto do app
   * (senão linhas ficam vazias — vinham só do localStorage).
   */
  const isLocal =
    !supabase ||
    (profile?.company_id === "local-company" &&
      !shouldUseLocalServiceApi(profile)) ||
    (profile?.id === "local-admin" && !shouldUseLocalServiceApi(profile));

  function reloadUsers() {
    if (!profile?.company_id) return;
    if (isLocal) {
      const allLines = loadLocalLines(profile.company_id);
      setLines(allLines);
      setUsers(getLocalUserWithLines(profile.company_id, allLines));
    }
  }

  useEffect(() => {
    if (!profile?.company_id) return;
    const needsEffective =
      supabase && profile.company_id === "local-company";
    if (needsEffective && !effectiveLoaded) return;

    const companyId = effectiveCompanyId ?? profile.company_id;

    if (isLocal) {
      const allLines = loadLocalLines(companyId);
      const localUsers = getLocalUserWithLines(companyId, allLines);
      setLines(allLines);
      setUsers(localUsers);
      return;
    }
    if (!supabase) return;
    const client = supabase;
    async function load() {
      let profiles: Profile[] | null = null;
      try {
        const res = await fetch(
          `/api/users?companyId=${encodeURIComponent(companyId)}`,
          { credentials: "include" }
        );
        if (res.ok) {
          const json = (await res.json()) as { profiles?: Profile[] };
          profiles = json.profiles ?? null;
        }
      } catch {
        profiles = null;
      }
      if (!profiles) {
        const { data } = await client
          .from("profiles")
          .select("*")
          .eq("company_id", companyId)
          .order("full_name", { ascending: true });
        profiles = data ?? [];
      }

      let allLines: ProductionLine[] | null = null;
      if (shouldUseLocalServiceApi(profile)) {
        try {
          const res = await fetch(
            `/api/company-data?companyId=${encodeURIComponent(companyId)}&lite=1`,
            { credentials: "include" }
          );
          const json = (await res.json()) as { lines?: ProductionLine[] };
          allLines = (json.lines ?? []) as ProductionLine[];
        } catch {
          allLines = [];
        }
      } else {
        const { data } = await client
          .from("production_lines")
          .select("*")
          .eq("company_id", companyId)
          .order("sort_order", { ascending: true });
        allLines = data;
      }

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
  }, [profile, supabase, isLocal, effectiveCompanyId, effectiveLoaded]);

  function openCreateModal() {
    setModalMode("create");
    setEditUserId(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("operator");
    setFormLineIds([]);
  }

  function openEditModal(user: UserWithLines) {
    setModalMode("edit");
    setEditUserId(user.id);
    setFormName(user.full_name);
    setFormEmail(user.email);
    // Carregar senha atual do localStorage
    const localUsers = getLocalUsers();
    const lu = localUsers.find((u) => u.id === user.id);
    setFormPassword(lu?.password ?? "");
    setFormRole((user.role as "pcp" | "operator") ?? "operator");
    setFormLineIds(user.lines.map((l) => l.id));
  }

  function closeModal() {
    setModalMode(null);
    setEditUserId(null);
  }

  function toggleFormLine(lineId: string) {
    setFormLineIds((prev) =>
      prev.includes(lineId)
        ? prev.filter((id) => id !== lineId)
        : [...prev, lineId]
    );
  }

  async function handleSave() {
    if (!profile?.company_id) return;
    if (!formName.trim() || !formEmail.trim()) {
      toast.error("Preencha nome e email");
      return;
    }
    if (modalMode === "create" && !formPassword) {
      toast.error("Preencha a senha");
      return;
    }
    if (
      !isLocal &&
      modalMode === "create" &&
      !isValidAuthEmail(formEmail)
    ) {
      toast.error(
        "Email inválido. Use um formato completo com domínio (ex.: nome@empresa.com.br)."
      );
      return;
    }
    const apiCompanyId = effectiveCompanyId ?? profile.company_id;
    if (
      !isLocal &&
      profile.company_id === "local-company" &&
      !effectiveLoaded
    ) {
      toast.error("Aguarde o carregamento da empresa.");
      return;
    }
    if (!isLocal && (!apiCompanyId || apiCompanyId === "local-company")) {
      toast.error("Empresa não definida. Atualize a página ou configure a empresa.");
      setSaving(false);
      return;
    }
    setSaving(true);
    try {
      if (isLocal) {
        if (modalMode === "create") {
          const existing = getLocalUsers().filter(
            (u) => u.company_id === profile.company_id
          );
          if (existing.some((u) => u.email.toLowerCase() === formEmail.trim().toLowerCase())) {
            toast.error("Já existe um usuário com este email");
            setSaving(false);
            return;
          }
          createLocalUser({
            fullName: formName.trim(),
            email: formEmail.trim(),
            password: formPassword,
            role: formRole,
            companyId: profile.company_id,
            lineIds: formRole === "operator" ? formLineIds : [],
          });
          toast.success("Usuário criado com sucesso");
        } else if (modalMode === "edit" && editUserId) {
          const ok = updateLocalUser(editUserId, {
            fullName: formName.trim(),
            email: formEmail.trim(),
            password: formPassword || undefined,
            role: formRole,
            lineIds: formRole === "operator" ? formLineIds : [],
          });
          if (ok) {
            toast.success("Usuário atualizado");
          } else {
            toast.error("Erro ao atualizar usuário");
          }
        }
        closeModal();
        reloadUsers();
        setSaving(false);
        return;
      }

      // Supabase mode
      if (modalMode === "create") {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: formEmail.trim(),
            password: formPassword,
            fullName: formName.trim(),
            role: formRole,
            companyId: apiCompanyId,
            lineIds: formRole === "operator" ? formLineIds : [],
          }),
        });
        let data: { success?: boolean; error?: string } = {};
        try { data = await res.json(); } catch { data = { error: `Erro ${res.status}` }; }
        if (!res.ok || !data.success) throw new Error(data.error || "Erro ao criar usuário");
        toast.success("Usuário criado com sucesso");
        closeModal();
        window.location.reload();
      } else if (modalMode === "edit" && editUserId) {
        const res = await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            userId: editUserId,
            fullName: formName.trim(),
            email: formEmail.trim(),
            password: formPassword || undefined,
            role: formRole,
            lineIds: formRole === "operator" ? formLineIds : [],
          }),
        });
        let data: { success?: boolean; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          data = { error: `Erro ${res.status}` };
        }
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erro ao atualizar usuário");
        }
        toast.success("Usuário atualizado");
        closeModal();
        window.location.reload();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteByEmailAuth() {
    const email = deleteByEmail.trim();
    if (!email) {
      toast.error("Informe o e-mail");
      return;
    }
    if (!shouldUseLocalServiceApi(profile)) {
      toast.error("Disponível apenas para administrador local.");
      return;
    }
    setDeletingByEmail(true);
    try {
      const res = await fetch(
        `/api/users?email=${encodeURIComponent(email)}`,
        { method: "DELETE", credentials: "include" }
      );
      let data: { success?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = { error: `Erro ${res.status}` };
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao excluir");
      }
      toast.success("Usuário removido. Cadastre de novo com o mesmo e-mail.");
      setDeleteByEmail("");
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeletingByEmail(false);
    }
  }

  async function handleDelete(userId: string) {
    if (isLocal) {
      const ok = deleteLocalUser(userId);
      if (ok) {
        toast.success("Usuário excluído");
        reloadUsers();
      } else {
        toast.error("Erro ao excluir usuário");
      }
      setConfirmDeleteId(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/users?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE", credentials: "include" }
      );
      let data: { success?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = { error: `Erro ${res.status}` };
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao excluir usuário");
      }
      toast.success("Usuário excluído. Você pode cadastrar de novo com o mesmo e-mail.");
      setConfirmDeleteId(null);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
      setConfirmDeleteId(null);
    }
  }

  async function handleToggleActive(id: string, active: boolean) {
    if (isLocal) {
      const ok = toggleLocalUserActive(id, active);
      if (ok) {
        toast.success(active ? "Usuário ativado" : "Usuário desativado");
        reloadUsers();
      } else {
        toast.error("Erro ao atualizar usuário");
      }
      return;
    }
    if (!supabase) return;
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
        <div className="flex items-center gap-2 shrink-0">
          <PageExportMenu
            fileNameBase="configuracao-usuarios"
            sheetTitle="Usuários"
            getData={() => ({
              headers: ["Nome", "Email", "Perfil", "Status", "Linhas"],
              rows: users.map((u) => [
                u.full_name,
                u.email,
                u.role === "manager"
                  ? "Manager"
                  : u.role === "pcp"
                    ? "PCP"
                    : u.role === "operator"
                      ? "Operador"
                      : "Super Admin",
                u.is_active ? "Ativo" : "Inativo",
                u.lines.map((l) => l.name).join("; ") || "—",
              ]),
            })}
          />
          <Button className="text-xs h-8" onClick={openCreateModal}>
            + Novo Usuário
          </Button>
        </div>
      </div>

      {!isLocal && shouldUseLocalServiceApi(profile) && (
        <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700 space-y-2">
          <p className="font-medium text-slate-800">
            E-mail já existe no sistema mas não aparece na tabela?
          </p>
          <p className="text-slate-600">
            Remova o cadastro pelo e-mail (Auth + perfil) e crie o usuário de novo em{" "}
            <strong>+ Novo Usuário</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 text-xs max-w-xs"
              type="email"
              placeholder="mesmo@email.com"
              value={deleteByEmail}
              onChange={(e) => setDeleteByEmail(e.target.value)}
            />
            <Button
              type="button"
              className="h-8 text-xs bg-white text-slate-800 border border-slate-300 hover:bg-slate-100"
              disabled={deletingByEmail}
              onClick={() => void handleDeleteByEmailAuth()}
            >
              {deletingByEmail ? "Excluindo…" : "Excluir por e-mail"}
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-2 py-2 text-left">Nome</th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left w-24">Perfil</th>
              <th className="px-2 py-2 text-left w-16">Status</th>
              <th className="px-2 py-2 text-left w-40">Ações</th>
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
                <td className="px-2 py-1 align-middle space-x-2">
                  <button
                    className="text-xs text-[#1B4F72] hover:underline"
                    onClick={() => openEditModal(u)}
                  >
                    Editar
                  </button>
                  <button
                    className="text-xs"
                    onClick={() => handleToggleActive(u.id, !u.is_active)}
                  >
                    {u.is_active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setConfirmDeleteId(u.id)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Criar / Editar */}
      {modalMode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                {modalMode === "create" ? "Novo Usuário" : "Editar Usuário"}
              </h2>
              <button className="text-xs text-slate-500" onClick={closeModal}>
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{modalMode === "edit" ? "Senha" : "Senha"}</Label>
                <Input
                  type={modalMode === "edit" ? "text" : "password"}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Perfil</Label>
                <select
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs h-9"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as "pcp" | "operator")}
                >
                  <option value="pcp">PCP</option>
                  <option value="operator">Operador</option>
                </select>
              </div>
            </div>

            {formRole === "operator" && (
              <div className="space-y-1">
                <Label>Linhas de produção</Label>
                {lines.length === 0 ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Nenhuma linha carregada. Confira em{" "}
                    <strong>Configurações → Linhas</strong> se existem linhas ativas
                    para a empresa.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-slate-100 rounded-md p-2">
                    {lines.map((line) => (
                      <label key={line.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={formLineIds.includes(line.id)}
                          onChange={() => toggleFormLine(line.id)}
                        />
                        {line.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs"
                onClick={closeModal}
              >
                Cancelar
              </button>
              <Button className="text-xs" onClick={handleSave} disabled={saving}>
                {saving
                  ? "Salvando..."
                  : modalMode === "create"
                  ? "Criar usuário"
                  : "Salvar alterações"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmar Exclusão */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg space-y-3 text-sm">
            <h2 className="font-semibold text-slate-800">Excluir Usuário</h2>
            <p className="text-slate-600">
              Tem certeza que deseja excluir o usuário{" "}
              <strong>{users.find((u) => u.id === confirmDeleteId)?.full_name}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1.5 rounded-md border border-slate-300 text-xs"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </button>
              <button
                className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs hover:bg-red-700"
                onClick={() => handleDelete(confirmDeleteId)}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
