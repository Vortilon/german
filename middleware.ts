import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { jwtVerify } from "jose";

const ELIO_SESSION_COOKIE = "elio_german_session";

const PUBLIC_PREFIXES = ["/login", "/api", "/_next", "/favicon.ico", "/manifest.webmanifest", "/icons"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

async function verifyElioCookie(request: NextRequest): Promise<boolean> {
  const secret = process.env.ELIO_AUTH_SECRET;
  if (!secret || secret.length < 16) return false;
  const token = request.cookies.get(ELIO_SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

function elioAuthEnabled(): boolean {
  const s = process.env.ELIO_AUTH_SECRET;
  return !!s && s.length >= 16;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const hasSupabase = !!(supabaseUrl && supabaseAnonKey);

  if (!hasSupabase) {
    if (!elioAuthEnabled()) {
      if (!isPublicPath(pathname) && pathname !== "/") {
        return NextResponse.redirect(new URL("/login?error=config", request.url));
      }
      if (pathname === "/") {
        return NextResponse.redirect(new URL("/login?error=config", request.url));
      }
      return NextResponse.next();
    }

    const elioOk = await verifyElioCookie(request);
    if (pathname === "/") {
      const home = request.nextUrl.clone();
      home.pathname = elioOk ? "/app" : "/login";
      return NextResponse.redirect(home);
    }
    if (isPublicPath(pathname)) {
      return NextResponse.next();
    }
    if (!elioOk) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const response = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const elioOk = await verifyElioCookie(request);
  const authenticated = !!user || elioOk;

  if (pathname === "/") {
    const home = request.nextUrl.clone();
    home.pathname = authenticated ? "/app" : "/login";
    return NextResponse.redirect(home);
  }

  if (isPublicPath(pathname)) {
    return response;
  }

  if (!authenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
