// The pathname is not available to a server component, and the admin gate is
// a function of the route. So it is put on a header here, once, rather than
// each page being told which route it is — a page that declares its own route
// is a page that can declare the wrong one.

import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/admin/:path*" };
