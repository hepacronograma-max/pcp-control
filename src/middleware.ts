import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { allowLocalAuth } from "@/lib/allow-local-auth";

/** Páginas abertas sem login (login e recuperação de senha). */
function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname === "/login.html" ||
    pathname === "/entrar" ||
    pathname === "/esqueci-senha" ||
    pathname === "/redefinir-senha"
  );
}

export async function middleware(request: NextRequest) {
  /**
   * Rotas /api/* validam sessão e permissão dentro de cada rota
   * (getUser / requirePermission / assert*Access / segredo do cron).
   * Validar de novo aqui custava uma ida extra ao Supabase Auth em toda chamada.
   */
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next({ request });
  }

  if (request.nextUrl.pathname === "/login.html") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const url = rawUrl.trim();
  const anonKey = rawAnonKey.trim();
  const origin = request.nextUrl.origin;

  const hasLocalAuth =
    allowLocalAuth() && request.cookies.get("pcp-local-auth")?.value === "1";

  if (!allowLocalAuth() && request.cookies.get("pcp-local-auth")?.value === "1") {
    const res = NextResponse.redirect(`${origin}/login`);
    res.cookies.set("pcp-local-auth", "", { path: "/", maxAge: 0 });
    return res;
  }

  /** Login local: não espera o Auth do Supabase em cada página/API. */
  if (hasLocalAuth) {
    return NextResponse.next({ request });
  }

  const urlPareceValida =
    url.startsWith("http://") || url.startsWith("https://");

  if (!urlPareceValida || !anonKey) {
    if (isPublicAuthPath(request.nextUrl.pathname)) {
      return NextResponse.next({ request });
    }
    return NextResponse.redirect(`${origin}/login`);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicAuthPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.png|icons|manifest.json|sw.js).*)",
  ],
};
