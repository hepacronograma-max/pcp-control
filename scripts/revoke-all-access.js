/**
 * Revoga acesso de todos: desativa perfis e remove usuários do Supabase Auth.
 * Uso: node scripts/revoke-all-access.js
 */
require("dotenv").config();
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env.local"),
  override: true,
});

const { createClient } = require("@supabase/supabase-js");

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!url || !key) {
  console.error("Faltam variáveis Supabase no .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, is_active");
  if (pErr && !pErr.message.includes("does not exist")) {
    throw new Error("profiles: " + pErr.message);
  }
  const profileList = profiles ?? [];
  if (profileList.length) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error("desativar profiles: " + error.message);
    console.log(`Perfis desativados: ${profileList.length}`);
  } else {
    console.log("Perfis: nenhum na tabela");
  }

  let page = 1;
  let totalAuth = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("listUsers: " + error.message);
    const users = data?.users ?? [];
    if (!users.length) break;
    for (const u of users) {
      const uid = u.id;
      await supabase.from("user_preferences").delete().eq("user_id", uid);
      await supabase.from("cq_registros").delete().eq("registered_by", uid);
      await supabase.from("cq_registros").delete().eq("resolvido_por", uid);
      await supabase.from("operator_lines").delete().eq("user_id", uid);
      await supabase.from("profiles").delete().eq("id", uid);
      await supabase.from("task_comments").delete().eq("user_id", uid);
      await supabase.from("task_history").delete().eq("user_id", uid);

      const { error: delErr } = await supabase.auth.admin.deleteUser(uid);
      if (delErr) {
        const { error: banErr } = await supabase.auth.admin.updateUserById(uid, {
          ban_duration: "876000h",
        });
        if (banErr) {
          console.error(`Falha ${u.email}: delete=${delErr.message}; ban=${banErr.message}`);
        } else {
          console.log(`Auth banido (não apagado): ${u.email}`);
          totalAuth++;
        }
      } else {
        console.log(`Auth removido: ${u.email}`);
        totalAuth++;
      }
    }
    if (users.length < 200) break;
    page++;
  }
  console.log(`\nTotal auth.users removidos: ${totalAuth}`);
  console.log("Login local em produção deve ser bloqueado no deploy do patch de segurança.");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
