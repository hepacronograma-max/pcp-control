'use client';

import { useEffect, useState } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { useEffectiveCompanyId } from "@/lib/hooks/use-effective-company";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageExportMenu } from "@/components/ui/page-export-menu";
import { toast } from "sonner";

const LOGO_WIDTH = 200;
const LOGO_HEIGHT = 200;
const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB

interface CompanyForm {
  name: string;
  orders_path: string;
  logo_url: string | null;
}

export default function CompanySettingsPage() {
  const { profile, loading } = useUser();
  const { companyId: effectiveCompanyId } = useEffectiveCompanyId(profile);
  const supabase = createClient();
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const companyId = effectiveCompanyId ?? profile?.company_id;

  useEffect(() => {
    if (!companyId) return;

    if (!supabase) {
      setForm({ name: "Empresa Local", orders_path: "", logo_url: null });
      return;
    }

    const client = supabase;

    async function loadCompany() {
      try {
        const { data } = await client
          .from("companies")
          .select("name, import_path, orders_path, logo_url")
          .eq("id", companyId!)
          .maybeSingle();
        if (data) {
          const f: CompanyForm = {
            name: data.name ?? "",
            orders_path: data.orders_path ?? data.import_path ?? "",
            logo_url: data.logo_url ?? null,
          };
          setForm(f);
          setLogoPreview(f.logo_url);
        } else {
          setForm({
            name: "",
            orders_path: "",
            logo_url: null,
          });
        }
      } catch {
        setForm({
          name: "",
          orders_path: "",
          logo_url: null,
        });
      }
    }
    loadCompany();
  }, [profile, supabase, effectiveCompanyId]);

  async function handleLogoUpload(file: File) {
    if (!companyId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("companyId", companyId);
    const res = await fetch("/api/company-logo", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    let data: { success?: boolean; error?: string; logo_url?: string } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      data = { error: `Erro ${res.status}` };
    }
    if (!res.ok || !data.success || !data.logo_url) {
      toast.error(data.error || "Erro ao fazer upload do logo");
      return;
    }

    setForm((prev) => (prev ? { ...prev, logo_url: data.logo_url! } : prev));
    setLogoPreview(data.logo_url);
    toast.success("Logo atualizado com sucesso");
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      toast.error("Use PNG ou JPG. Tamanho máximo: 200x200 pixels.");
      return;
    }
    if (file.size > LOGO_MAX_SIZE) {
      toast.error("Tamanho máximo de 2MB excedido.");
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (img.width > LOGO_WIDTH || img.height > LOGO_HEIGHT) {
        toast.error(
          `O logo não pode ser maior que ${LOGO_WIDTH}x${LOGO_HEIGHT} pixels. Sua imagem: ${img.width}x${img.height}. Redimensione antes de enviar.`
        );
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    };
    img.onerror = () => {
      toast.error("Não foi possível ler a imagem.");
    };
    img.src = URL.createObjectURL(file);
  }

  async function handleSaveCompany() {
    if (!form || !companyId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/company-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId,
          name: form.name,
          orders_path: form.orders_path,
        }),
      });
      let data: { success?: boolean; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        data = { error: `Erro ${res.status}` };
      }
      if (!res.ok || !data.success) {
        toast.error(data.error || "Erro ao salvar dados da empresa");
        return;
      }
      toast.success("Dados da empresa salvos com sucesso");
      if (logoFile) {
        await handleLogoUpload(logoFile);
        setLogoFile(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar dados da empresa";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Carregando configurações...</p>;
  }

  if (!form) {
    return (
      <p className="text-sm text-slate-500">
        Configure sua empresa nas Configurações.
      </p>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Empresa</h1>
          <p className="text-sm text-slate-600">
            Configure o nome, logo e pasta matriz para salvar os PDFs dos pedidos.
          </p>
        </div>
        {form && (
          <PageExportMenu
            fileNameBase="configuracao-empresa"
            sheetTitle="Empresa"
            getData={() => ({
              headers: ["Campo", "Valor"],
              rows: [
                ["Nome", form.name],
                ["Pasta pedidos (PDF)", form.orders_path],
                ["URL do logo", form.logo_url ?? ""],
              ],
            })}
          />
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="space-y-1">
          <Label>Logo da empresa</Label>
          <p className="text-xs text-slate-500 mb-1">
            Tamanho máximo: {LOGO_WIDTH}x{LOGO_HEIGHT} pixels. Menor pode.
            PNG ou JPG até 2MB.
          </p>
          <div className="flex items-center gap-3">
            <div
              className="h-[120px] w-[120px] rounded border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 overflow-hidden shrink-0"
              style={{ aspectRatio: "1" }}
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Logo"
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-xs text-slate-400 text-center px-1">
                  Sem logo
                </span>
              )}
            </div>
            <div>
              <input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="text-xs"
                onChange={handleLogoChange}
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Máx. {LOGO_WIDTH}x{LOGO_HEIGHT}px • PNG/JPG • 2MB
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
          <Label htmlFor="orders_path">Pasta matriz (base para pedidos)</Label>
          <Input
            id="orders_path"
            value={form.orders_path}
            onChange={(e) =>
              setForm((prev) =>
                prev ? { ...prev, orders_path: e.target.value } : prev
              )
            }
            placeholder="Ex: \\\\servidor\\pedidos ou C:\\Pedidos"
          />
          <p className="text-[11px] text-slate-500">
            Ao importar um PDF, será criada uma subpasta com o número do pedido
            e o arquivo será salvo dentro dela. Ex: se a pasta for
            \\servidor\pedidos, o pedido 12345 ficará em
            \\servidor\pedidos\12345\arquivo.pdf
          </p>
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
