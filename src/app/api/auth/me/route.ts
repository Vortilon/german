import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ELIO_LOCAL_USER_ID, ELIO_SESSION_COOKIE, verifyElioSession } from "@/lib/elio-auth";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      return NextResponse.json({
        mode: "supabase" as const,
        user: { id: user.id, email: user.email },
      });
    }
  }

  const jar = await cookies();
  const raw = jar.get(ELIO_SESSION_COOKIE)?.value;
  if (raw && (await verifyElioSession(raw))) {
    return NextResponse.json({
      mode: "local" as const,
      user: { id: ELIO_LOCAL_USER_ID, email: "elio@german.app" },
    });
  }

  return NextResponse.json({ mode: null, user: null }, { status: 401 });
}
