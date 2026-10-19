/**
 * Regra única de senha do PCP Control (usada no navegador e no servidor).
 * Mínimo 8 caracteres, com pelo menos uma letra e um número.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT =
  "Mínimo de 8 caracteres, com pelo menos uma letra e um número.";

/** Retorna a mensagem de erro, ou `null` se a senha for aceita. */
export function validatePassword(password: string | null | undefined): string | null {
  const p = String(password ?? "");
  if (p.length < PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (p.length > 72) {
    return "A senha pode ter no máximo 72 caracteres.";
  }
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) {
    return "A senha precisa ter pelo menos uma letra e um número.";
  }
  return null;
}

/** Traduz mensagens comuns do Supabase Auth para português. */
export function translateAuthError(message: string | null | undefined): string {
  const m = String(message ?? "").toLowerCase();
  if (!m) return "Não foi possível concluir. Tente novamente.";
  if (m.includes("should be different")) {
    return "A nova senha precisa ser diferente da senha atual.";
  }
  if (m.includes("expired") || (m.includes("invalid") && m.includes("token"))) {
    return "Este link expirou ou já foi usado. Peça um novo link de redefinição.";
  }
  if (m.includes("rate limit") || m.includes("security purposes") || m.includes("too many")) {
    return "Muitas tentativas seguidas. Aguarde um minuto e tente novamente.";
  }
  if (m.includes("weak") || m.includes("at least")) {
    return PASSWORD_RULE_TEXT;
  }
  if (m.includes("session") && m.includes("missing")) {
    return "Sessão de redefinição não encontrada. Abra novamente o link do e-mail.";
  }
  return message ?? "Não foi possível concluir. Tente novamente.";
}
