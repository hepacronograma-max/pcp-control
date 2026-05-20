/**
 * Cria ou atualiza usuário administrador (Auth + profiles).
 *
 * Uso (não commitar senha no repositório):
 *   PowerShell:
 *     $env:PCP_ADMIN_EMAIL="seu@email.com"
 *     $env:PCP_ADMIN_PASSWORD="sua-senha"
 *     $env:PCP_ADMIN_NAME="Seu Nome"
 *     node scripts/create-admin-user.js
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
  override: true,
});

const { createClient } = require("@supabase/supabase-js");

const email = (process.env.PCP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.PCP_ADMIN_PASSWORD || "";
const fullName = (process.env.PCP_ADMIN_NAME || "Administrador").trim();
const role = "manager";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!url || !key) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email || !password) {
  console.error("Defina PCP_ADMIN_EMAIL e PCP_ADMIN_PASSWORD");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveCompanyId() {
  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (companies?.[0]?.id) return companies[0].id;

  const { data: orderRow } = await supabase
    .from("orders")
    .select("company_id")
    .not("company_id", "is", null)
    .limit(1)
    .maybeSingle();
  return orderRow?.company_id ?? null;
}

async function findUserIdByEmail(targetEmail) {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = (data?.users ?? []).find(
      (u) => (u.email || "").toLowerCase() === targetEmail
    );
    if (hit) return hit.id;
    if ((data?.users ?? []).length < 200) break;
    page++;
  }
  return null;
}

async function main() {
  const companyId = await resolveCompanyId();
  if (!companyId) {
    console.error("Nenhuma empresa encontrada no banco. Crie uma empresa antes.");
    process.exit(1);
  }

  let userId = await findUserIdByEmail(email);

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw new Error("createUser: " + error.message);
    userId = data.user.id;
    console.log("Usuário Auth criado:", email);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw new Error("updateUser: " + error.message);
    console.log("Usuário Auth atualizado (senha/metadata):", email);
  }

  const attempts = [
    {
      id: userId,
      company_id: companyId,
      role,
      full_name: fullName,
      email,
      is_active: true,
    },
    { id: userId, company_id: companyId, role, full_name: fullName, email },
    { id: userId, company_id: companyId, role, full_name: fullName, is_active: true },
    { id: userId, company_id: companyId, role, full_name: fullName },
    { id: userId, company_id: companyId, role },
    { id: userId, company_id: companyId },
  ];
  let profileErr = null;
  for (const payload of attempts) {
    const { error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });
    if (!error) {
      profileErr = null;
      break;
    }
    profileErr = error;
  }
  if (profileErr) throw new Error("profiles: " + profileErr.message);

  console.log("Perfil manager ativo — company_id:", companyId);
  console.log("Pronto. Login em /login com o e-mail configurado.");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
