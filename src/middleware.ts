import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Permite rota de login local sem autenticação
  if (request.nextUrl.pathname === "/api/auth/local-login") {
    return NextResponse.next({ request });
  }

  // Se as variáveis do Supabase não estiverem configuradas,
  // não tenta criar o client (evita erro em ambiente local).
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const url = rawUrl.trim();
  const anonKey = rawAnonKey.trim();

  const urlPareceValida =
    url.startsWith("http://") || url.startsWith("https://");

  if (!urlPareceValida || !anonKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[pcp-control] Supabase desativado no middleware (URL/KEY ausentes ou inválidos)."
      );
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Em localhost/rede local: permite admin@local (cookie pcp-local-auth)
  const hostname = request.nextUrl.hostname;
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    process.env.NODE_ENV !== "production";
  const hasLocalAuth = request.cookies.get("pcp-local-auth")?.value === "1";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login") && request.nextUrl.pathname !== "/login.html" && request.nextUrl.pathname !== "/entrar") {
    if (isLocalhost && hasLocalAuth) {
      return NextResponse.next({ request });
    }
    const port = request.nextUrl.port || "3100";
    return NextResponse.redirect(`http://localhost:${port}/login.html`);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const port = request.nextUrl.port || "3100";
    return NextResponse.redirect(`http://localhost:${port}/dashboard`);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/auth/local-login).*)",
  ],
};

