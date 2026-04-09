import { SignJWT, jwtVerify } from "jose";

export const ELIO_SESSION_COOKIE = "elio_german_session";

/** Stable UUID for Elio when using cookie auth (no Supabase). */
export const ELIO_LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

function getSecretKey(): Uint8Array | null {
  const s = process.env.ELIO_AUTH_SECRET;
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

export function isElioAuthConfigured(): boolean {
  return getSecretKey() !== null;
}

/** Username from login form; drives session email `${u}@german.app` for ADMIN_EMAILS checks. */
export async function signElioSession(username?: string): Promise<string | null> {
  const key = getSecretKey();
  if (!key) return null;
  const u = (username ?? "elio").trim().toLowerCase() || "elio";
  const email = `${u}@german.app`;
  return new SignJWT({ sub: ELIO_LOCAL_USER_ID, role: "elio", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

/** Returns session email for local (Elio) auth, or null if token invalid. Legacy tokens without `email` use elio@german.app. */
export async function parseElioSession(token: string): Promise<{ email: string } | null> {
  const key = getSecretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    const email =
      typeof payload.email === "string" && payload.email.includes("@")
        ? payload.email
        : "elio@german.app";
    return { email };
  } catch {
    return null;
  }
}

export async function verifyElioSession(token: string): Promise<boolean> {
  return (await parseElioSession(token)) !== null;
}
