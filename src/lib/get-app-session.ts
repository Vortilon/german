import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import {
  ELIO_LOCAL_USER_ID,
  ELIO_SESSION_COOKIE,
  verifyElioSession,
} from "@/lib/elio-auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppPersistence = "supabase" | "local";

function makeLocalUser(): User {
  return {
    id: ELIO_LOCAL_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "elio@german.app",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  } as User;
}

export async function getAppSession(): Promise<
  { user: User; persistence: AppPersistence } | null
> {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { user, persistence: "supabase" };
  }

  const jar = await cookies();
  const raw = jar.get(ELIO_SESSION_COOKIE)?.value;
  if (raw && (await verifyElioSession(raw))) {
    return { user: makeLocalUser(), persistence: "local" };
  }

  return null;
}
