import { NextRequest, NextResponse } from "next/server";

function checkLocal(request: NextRequest) {
  const hostHeader = request.headers.get("host") || "";
  let hostname = request.nextUrl?.hostname || hostHeader.split(":")[0];
  if (!hostname && request.url) {
    try {
      hostname = new URL(request.url).hostname;
    } catch {
      hostname = "";
    }
  }
  return (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    process.env.NODE_ENV !== "production"
  );
}

/**
 * GET: Login direto em localhost (sem formulário) - para contornar problemas de JS/form.
 */
export async function GET(request: NextRequest) {
  if (!checkLocal(request)) {
    return NextResponse.json(
      { error: "Login local só disponível em localhost" },
      { status: 403 }
    );
  }
  const port = request.nextUrl.port || "3100";
  const response = NextResponse.redirect(`http://localhost:${port}/dashboard`, 302);
  response.cookies.set("pcp-local-auth", "1", {
    path: "/",
    maxAge: 60 * 60 * 24,
    httpOnly: false,
    sameSite: "lax",
    secure: false,
  });
  return response;
}

/**
 * POST: Login local (admin@local) - define o cookie no servidor para o middleware reconhecer.
 * Só funciona em localhost.
 */
export async function POST(request: NextRequest) {
  if (!checkLocal(request)) {
    return NextResponse.json(
      { error: "Login local só disponível em localhost ou rede local" },
      { status: 403 }
    );
  }

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

  const port = request.nextUrl.port || "3100";

  if (email !== "admin@local" || password !== "123456") {
    return NextResponse.redirect(`http://localhost:${port}/login.html?error=credenciais`, 302);
  }

  const response = NextResponse.redirect(`http://localhost:${port}/dashboard`, 302);
  response.cookies.set("pcp-local-auth", "1", {
    path: "/",
    maxAge: 60 * 60 * 24, // 24 horas
    httpOnly: false, // precisa ser acessível no client para o useUser
    sameSite: "lax",
    secure: false,
  });

  return response;
}
