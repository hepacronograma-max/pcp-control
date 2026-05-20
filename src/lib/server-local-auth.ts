import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { allowLocalAuth } from "@/lib/allow-local-auth";

/** Cookie `pcp-local-auth` só vale em desenvolvimento (nunca em produção na Vercel). */
export async function hasServerLocalAuthCookie(): Promise<boolean> {
  if (!allowLocalAuth()) return false;
  const cookieStore = await cookies();
  return cookieStore.get("pcp-local-auth")?.value === "1";
}

export function hasRequestLocalAuthCookie(request: NextRequest): boolean {
  if (!allowLocalAuth()) return false;
  return request.cookies.get("pcp-local-auth")?.value === "1";
}
