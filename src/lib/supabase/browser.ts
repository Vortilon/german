import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return null;
  }
  return createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}

