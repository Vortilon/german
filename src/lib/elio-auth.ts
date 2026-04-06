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

export async function signElioSession(): Promise<string | null> {
  const key = getSecretKey();
  if (!key) return null;
  return new SignJWT({ sub: ELIO_LOCAL_USER_ID, role: "elio" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

export async function verifyElioSession(token: string): Promise<boolean> {
  const key = getSecretKey();
  if (!key) return false;
  try {
    await jwtVerify(token, key, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
