/**
 * Gera valores para colar na Vercel (Production).
 * Saída em secrets/vercel-env-*.txt (gitignored).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dir = path.join(root, "secrets");
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const cleanupSecret = crypto.randomBytes(32).toString("base64url");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.join(dir, `vercel-env-${stamp}.txt`);

const body = `# Gerado em ${new Date().toISOString()}
# Cole na Vercel → Project → Settings → Environment Variables → Production
# Depois: Redeploy Production
#
# IMPORTANTE: rotacione também anon e service_role no Supabase e atualize as chaves aqui.

CLEANUP_SECRET=${cleanupSecret}

# Teste após deploy:
# curl.exe -s -o NUL -w "%{http_code}" -X POST "${process.env.PCP_SMOKE_BASE_URL || "https://pcp-control.vercel.app"}/api/cleanup?dry_run=1" -H "x-cleanup-key: ${cleanupSecret}" -H "Content-Type: application/json" -d "{}"
# Esperado: 200
`;

fs.writeFileSync(out, body, "utf8");
console.log("Arquivo gerado (não commitar):", out);
console.log("CLEANUP_SECRET length:", cleanupSecret.length);
