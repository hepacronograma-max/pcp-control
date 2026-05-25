/**
 * Notificação via Bot API do Telegram (opcional).
 */
const ICON = { info: "ℹ️", warning: "⚠️", error: "❌" } as const;

export type NotifyLevel = "info" | "warning" | "error";

export async function notify(
  message: string,
  level: NotifyLevel = "info"
): Promise<{ sent: boolean; reason?: string }> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    return { sent: false, reason: "TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausente" };
  }

  const text = `${ICON[level] ?? ""} ${message}`.trim();
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };
  if (!res.ok || !body.ok) {
    return { sent: false, reason: body.description || `HTTP ${res.status}` };
  }
  return { sent: true };
}
