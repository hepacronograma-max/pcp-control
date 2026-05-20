import { allowLocalAuth } from "@/lib/allow-local-auth";

/** Credenciais de dev (somente servidor, nunca NEXT_PUBLIC_). */
export function getLocalDevCredentials(): { email: string; password: string } | null {
  if (!allowLocalAuth()) return null;
  const email = (process.env.PCP_LOCAL_DEV_EMAIL || "").trim().toLowerCase();
  const password = process.env.PCP_LOCAL_DEV_PASSWORD || "";
  if (!email || !password) return null;
  return { email, password };
}

export function matchesLocalDevCredentials(
  email: string,
  password: string
): boolean {
  const creds = getLocalDevCredentials();
  if (!creds) return false;
  return (
    email.trim().toLowerCase() === creds.email && password === creds.password
  );
}
