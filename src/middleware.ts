import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session-token";

const protectedPaths = ["/library", "/read", "/review", "/settings", "/mind-maps", "/graph"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.AUTH_SECRET;
  // Without a secret we cannot verify here; the route handlers still do.
  const valid = secret ? !!(await verifySessionToken(token, secret)) : !!token;
  if (valid) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname);
  if (token) url.searchParams.set("reason", "expired");
  const response = NextResponse.redirect(url);
  if (token) response.cookies.delete(COOKIE_NAME);
  return response;
}

export const config = {
  // API routes authenticate themselves; keeping them out of the matcher also
  // stops the middleware from buffering large upload bodies.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
