'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { findLocalUserByEmail } from "@/lib/local-users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Modo local/demo: sem Supabase, usa usuários do localStorage.
    if (!supabase) {
      if (email === "admin@local" && password === "123456") {
        const demoProfile = {
          id: "local-admin",
          company_id: "local-company",
          full_name: "Administrador Local",
          email,
          role: "manager",
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        window.localStorage.setItem(
          "pcp-local-profile",
          JSON.stringify(demoProfile)
        );
        router.push("/dashboard");
        router.refresh();
        return;
      }
      const localProfile = findLocalUserByEmail(email, password);
      if (localProfile) {
        window.localStorage.setItem(
          "pcp-local-profile",
          JSON.stringify(localProfile)
        );
        if (localProfile.role === "operator") {
          const usersRaw = window.localStorage.getItem("pcp-local-users");
          const users = usersRaw ? JSON.parse(usersRaw) : [];
          const u = users.find((x: { id: string }) => x.id === localProfile.id);
          const firstLineId = u?.line_ids?.[0];
          router.push(firstLineId ? `/linha/${firstLineId}` : "/dashboard");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
        return;
      }
      setError("Email ou senha incorretos");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      setError("Email ou senha incorretos");
      setLoading(false);
      return;
    }

    const userId = data.user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profile?.role === "operator") {
      const { data: opLines } = await supabase
        .from("operator_lines")
        .select("line_id")
        .eq("user_id", userId)
        .limit(1);
      const firstLineId = opLines?.[0]?.line_id;
      router.push(firstLineId ? `/linha/${firstLineId}` : "/dashboard");
    } else {
      router.push("/dashboard");
    }

    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-[#1B4F72]">
            PCP Control
          </CardTitle>
          <CardDescription>
            Sistema de Planejamento e Controle de Produção
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

