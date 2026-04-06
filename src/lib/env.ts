export const env = {
  XAI_API_KEY: process.env.textXAI_API_KEY ?? "",
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
} as const;

export function requireEnv(name: keyof typeof env): string {
  const val = env[name];
  if (!val) throw new Error(`Missing env var for ${name}`);
  return val;
}

