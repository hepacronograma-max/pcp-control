import { NextRequest, NextResponse } from "next/server";
import { allowLocalAuth } from "@/lib/allow-local-auth";
import { matchesLocalDevCredentials } from "@/lib/local-dev-credentials";

export async function GET(request: NextRequest) {
  if (!allowLocalAuth()) {
    return NextResponse.json({ error: "Não disponível em produção" }, { status: 403 });
  }
  const origin = request.nextUrl.origin;
  const isSecure = origin.startsWith("https://");
  const response = NextResponse.redirect(`${origin}/dashboard`, 302);
  response.cookies.set("pcp-local-auth", "1", {
    path: "/",
    maxAge: 60 * 60 * 24,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
  });
  return response;
}

export async function POST(request: NextRequest) {
  if (!allowLocalAuth()) {
    return NextResponse.json({ error: "Não disponível em produção" }, { status: 403 });
  }
  const origin = request.nextUrl.origin;
  const isSecure = origin.startsWith("https://");

  let email = "";
  let password = "";
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      email = (body.email || "").trim();
      password = (body.password || "").trim();
    } catch {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    email = (formData.get("email") as string || "").trim();
    password = (formData.get("password") as string || "").trim();
  } else {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  if (!matchesLocalDevCredentials(email, password)) {
    return NextResponse.redirect(`${origin}/login?error=credenciais`, 302);
  }

  const response = NextResponse.redirect(`${origin}/dashboard`, 302);
  response.cookies.set("pcp-local-auth", "1", {
    path: "/",
    maxAge: 60 * 60 * 24,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
  });

  return response;
}
