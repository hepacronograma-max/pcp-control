/**
 * Configura branch protection em master (Fase 1).
 * Token: GITHUB_ADMIN_TOKEN no .env.local ou .env
 * (aceita também linha GitHub_token_* no .env)
 */
const fs = require("fs");
const path = require("path");

function loadToken() {
  if (process.env.GITHUB_ADMIN_TOKEN?.trim()) {
    return process.env.GITHUB_ADMIN_TOKEN.trim();
  }
  for (const file of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      if (
        key === "GITHUB_ADMIN_TOKEN" ||
        /^github.*token/i.test(key)
      ) {
        let val = t.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (val) return val;
      }
    }
  }
  return null;
}

const REPO = "hepacronograma-max/pcp-control";
const BRANCH = "master";

async function gh(pathname, { method = "GET", body } = {}) {
  const token = loadToken();
  if (!token) {
    console.error(
      "ERRO: Defina GITHUB_ADMIN_TOKEN no .env.local (recomendado) ou renomeie seu token GitHub no .env."
    );
    process.exit(1);
  }
  const res = await fetch(`https://api.github.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function listVercelContexts() {
  const checks = await gh(
    `/repos/${REPO}/commits/${BRANCH}/check-runs?per_page=30`
  );
  const contexts = new Set();
  if (checks.ok && checks.json?.check_runs) {
    for (const r of checks.json.check_runs) {
      if (r.name) contexts.add(r.name);
    }
  }
  const status = await gh(`/repos/${REPO}/commits/${BRANCH}/status`);
  if (status.ok && status.json?.statuses) {
    for (const s of status.json.statuses) {
      if (s.context) contexts.add(s.context);
    }
  }
  const combined = await gh(`/repos/${REPO}/commits/${BRANCH}/check-suites`);
  if (combined.ok && combined.json?.check_suites) {
    for (const s of combined.json.check_suites) {
      if (s.app?.slug === "vercel") contexts.add("Vercel");
    }
  }
  return [...contexts];
}

async function main() {
  const me = await gh("/user");
  if (!me.ok) {
    console.error("Token inválido ou sem permissão:", me.status, me.json?.message);
    process.exit(1);
  }
  console.log("GitHub autenticado como:", me.json?.login);

  let contexts = await listVercelContexts();
  const vercelLike = contexts.filter(
    (c) => /vercel/i.test(c) || /deploy/i.test(c)
  );
  if (vercelLike.length === 0) {
    contexts = ["Vercel"];
    console.log(
      "Aviso: nenhum check Vercel encontrado no último commit; usando contexto 'Vercel'."
    );
  } else {
    contexts = vercelLike;
  }
  console.log("Status checks exigidos:", contexts.join(", "));

  const payload = {
    required_status_checks: {
      strict: true,
      contexts,
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
    },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: false,
    lock_branch: false,
    allow_fork_syncing: false,
  };

  const put = await gh(
    `/repos/${REPO}/branches/${BRANCH}/protection`,
    { method: "PUT", body: payload }
  );

  if (!put.ok) {
    console.error("Falha ao configurar protection:", put.status);
    console.error(JSON.stringify(put.json, null, 2));
    process.exit(1);
  }

  const get = await gh(`/repos/${REPO}/branches/${BRANCH}/protection`);
  console.log("\n=== Branch protection configurado com sucesso ===\n");
  if (get.ok) {
    const p = get.json;
    console.log("Repositório:", REPO);
    console.log("Branch:", BRANCH);
    console.log(
      "Pull request obrigatório:",
      p?.required_pull_request_reviews ? "sim" : "não"
    );
    if (p?.required_pull_request_reviews) {
      console.log(
        "  Approvals mínimos:",
        p.required_pull_request_reviews.required_approving_review_count
      );
      console.log(
        "  Dismiss stale reviews:",
        p.required_pull_request_reviews.dismiss_stale_reviews
      );
    }
    console.log(
      "Status checks:",
      p?.required_status_checks?.contexts?.join(", ") || "(nenhum)"
    );
    console.log("Strict (branch atualizada):", p?.required_status_checks?.strict);
    console.log("Enforce admins (sem bypass admin):", p?.enforce_admins);
    console.log("Allow force push:", p?.allow_force_pushes?.enabled === false ? "bloqueado" : p?.allow_force_pushes);
    console.log("Restrictions (push direto):", p?.restrictions ?? "null = regras via PR");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
