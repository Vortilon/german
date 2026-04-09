import { NextResponse } from "next/server";
import { ELIO_SESSION_COOKIE, signElioSession } from "@/lib/elio-auth";

export const runtime = "nodejs";

/** Pairs from ELIO_LOGIN_USER/PASSWORD plus optional ELIO_AUTH_EXTRA (comma-separated user:password). */
function elioCredentialPairs(): Array<{ user: string; pass: string }> {
  const pairs: Array<{ user: string; pass: string }> = [
    {
      user: (process.env.ELIO_LOGIN_USER ?? "elio").trim().toLowerCase(),
      pass: process.env.ELIO_LOGIN_PASSWORD ?? "elio",
    },
  ];
  const extra = process.env.ELIO_AUTH_EXTRA?.trim();
  if (!extra) return pairs;

  for (const segment of extra.split(",")) {
    const s = segment.trim();
    if (!s) continue;
    const colon = s.indexOf(":");
    if (colon <= 0) continue;
    pairs.push({
      user: s.slice(0, colon).trim().toLowerCase(),
      pass: s.slice(colon + 1),
    });
  }
  return pairs;
}

function matchesElioCredentials(u: string, p: string): boolean {
  return elioCredentialPairs().some((pair) => pair.user === u && pair.pass === p);
}

export async function POST(req: Request) {
  if (!process.env.ELIO_AUTH_SECRET || process.env.ELIO_AUTH_SECRET.length < 16) {
    return NextResponse.json({ error: "ELIO_AUTH_SECRET not set" }, { status: 503 });
  }

  const body = (await req.json()) as { username?: string; password?: string };
  const u = (body.username ?? "").trim().toLowerCase();
  const p = body.password ?? "";

  if (!matchesElioCredentials(u, p)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await signElioSession(u);
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
