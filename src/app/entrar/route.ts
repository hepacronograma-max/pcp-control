import { NextRequest, NextResponse } from "next/server";

/**
 * GET /entrar - define cookie local e redireciona para o dashboard.
 * Funciona como Route Handler (pode setar cookies e redirecionar).
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const dashboardUrl = `${origin}/dashboard`;
  const isSecure = origin.startsWith("https://");
  const response = NextResponse.redirect(dashboardUrl, 302);

  response.cookies.set("pcp-local-auth", "1", {
    path: "/",
    maxAge: 60 * 60 * 24,
    httpOnly: false,
    sameSite: "lax",
    secure: isSecure,
  });

  return response;
}
