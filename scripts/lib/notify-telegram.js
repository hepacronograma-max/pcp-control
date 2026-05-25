/**
 * Notificação via Bot API do Telegram.
 * notify(message, level) — level: info | warning | error
 */
const { loadEnv } = require("./load-env");

const ICON = { info: "ℹ️", warning: "⚠️", error: "❌" };

async function notify(message, level = "info") {
  loadEnv();
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    return { sent: false, reason: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausente" };
  }

  const lvl = ["info", "warning", "error"].includes(level) ? level : "info";
  const text = `${ICON[lvl] || ""} ${message}`.trim();

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    return {
      sent: false,
      reason: body.description || `HTTP ${res.status}`,
    };
  }
  return { sent: true };
}

module.exports = { notify };
