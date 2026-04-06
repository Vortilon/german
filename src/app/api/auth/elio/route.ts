import { NextResponse } from "next/server";
import { ELIO_SESSION_COOKIE, signElioSession } from "@/lib/elio-auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!process.env.ELIO_AUTH_SECRET || process.env.ELIO_AUTH_SECRET.length < 16) {
    return NextResponse.json({ error: "ELIO_AUTH_SECRET not set" }, { status: 503 });
  }

  const body = (await req.json()) as { username?: string; password?: string };
  const u = (body.username ?? "").trim().toLowerCase();
  const p = body.password ?? "";
  const okUser = (process.env.ELIO_LOGIN_USER ?? "elio").toLowerCase();
  const okPass = process.env.ELIO_LOGIN_PASSWORD ?? "elio";

  if (u !== okUser || p !== okPass) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await signElioSession();
  if (!token) {
    return NextResponse.json({ error: "Session error" }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ELIO_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ELIO_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
