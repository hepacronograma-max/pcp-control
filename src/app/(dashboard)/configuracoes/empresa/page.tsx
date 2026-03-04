'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface CompanyForm {
  name: string;
  import_path: string;
  orders_path: string;
  logo_url: string | null;
}

export default function CompanySettingsPage() {
  const { profile, loading } = useUser();
  const supabase = createClient();
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.company_id || !supabase) return;
    const companyId = profile.company_id;
    const client = supabase;
    async function loadCompany() {
      const { data } = await client
        .from("companies")
        .select("name, import_path, orders_path, logo_url")
        .eq("id", companyId)
        .single();
      if (data) {
        setForm({
          name: data.name ?? "",
          import_path: data.import_path ?? "",
          orders_path: data.orders_path ?? "",
          logo_url: data.logo_url ?? null,
        });
        setLogoPreview(data.logo_url ?? null);
      }
    }
    loadCompany();
  }, [profile, supabase]);

  async function handleLogoUpload(file: File) {
    if (!profile?.company_id || !supabase) return;
    const ext = file.name.split(".").pop();
    const filePath = `${profile.company_id}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("company-logos")
      .upload(filePath, file, { upsert: true as any });

    if (uploadError) {
      toast.error("Erro ao fazer upload do logo");
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("company-logos").getPublicUrl(filePath);

    const { error } = await supabase
      .from("companies")
      .update({ logo_url: publicUrl })
      .eq("id", profile.company_id);

    if (error) {
      toast.error("Erro ao salvar URL do logo");
      return;
    }

    setForm((prev) => (prev ? { ...prev, logo_url: publicUrl } : prev));
    setLogoPreview(publicUrl);
    toast.success("Logo atualizado com sucesso");
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      toast.error("Formato inválido. Use PNG, JPG ou SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Tamanho máximo de 2MB excedido.");
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function handleSaveCompany() {
    if (!profile?.company_id || !form || !supabase) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("companies")
        .update({
          name: form.name,
          import_path: form.import_path,
          orders_path: form.orders_path,
        })
        .eq("id", profile.company_id);
      if (error) throw error;
      toast.success("Dados da empresa salvos com sucesso");
      if (logoFile) {
        await handleLogoUpload(logoFile);
        setLogoFile(null);
      }
    } catch {
      toast.error("Erro ao salvar dados da empresa");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <p className="text-sm text-slate-500">Carregando configurações...</p>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Empresa</h1>
        <p className="text-sm text-slate-600">
          Configure o nome, logo e caminhos de pasta da sua empresa.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <Label>Logo</Label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 rounded border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-400">Sem logo</span>
              )}
            </div>
            <div>
              <input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="text-xs"
                onChange={handleLogoChange}
              />
              <p className="text-[11px] text-slate-500">
                PNG, JPG ou SVG até 2MB.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="name">Nome da empresa</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) =>
              setForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))
            }
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="import_path">Pasta de importação de PDFs</Label>
          <Input
            id="import_path"
            value={form.import_path}
            onChange={(e) =>
              setForm((prev) =>
                prev ? { ...prev, import_path: e.target.value } : prev
              )
            }
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="orders_path">Pasta base para pedidos</Label>
          <Input
            id="orders_path"
            value={form.orders_path}
            onChange={(e) =>
              setForm((prev) =>
                prev ? { ...prev, orders_path: e.target.value } : prev
              )
            }
          />
        </div>

        <div className="pt-2">
          <Button onClick={handleSaveCompany} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </div>
  );
}

