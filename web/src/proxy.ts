import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "opencluely_session";

export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/dashboard/:path*",
};
