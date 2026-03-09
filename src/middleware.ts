import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/auth/local-login") {
    return NextResponse.next({ request });
  }

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const rawAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const url = rawUrl.trim();
  const anonKey = rawAnonKey.trim();

  const urlPareceValida =
    url.startsWith("http://") || url.startsWith("https://");

  const hasLocalAuth = request.cookies.get("pcp-local-auth")?.value === "1";
  const origin = request.nextUrl.origin;

  if (!urlPareceValida || !anonKey) {
    if (hasLocalAuth) {
      return NextResponse.next({ request });
    }
    const isLoginPage =
      request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname === "/login.html" ||
      request.nextUrl.pathname === "/entrar";
    if (isLoginPage) {
      return NextResponse.next({ request });
    }
    return NextResponse.redirect(`${origin}/login.html`);
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

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    request.nextUrl.pathname !== "/login.html" &&
    request.nextUrl.pathname !== "/entrar"
  ) {
    if (hasLocalAuth) {
      return NextResponse.next({ request });
    }
    return NextResponse.redirect(`${origin}/login.html`);
  }

  if (user && request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|api/auth/local-login).*)",
  ],
};
