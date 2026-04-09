import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/get-app-session";
import type { ExtractedHomework } from "@/lib/homework-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { adminUpsertHomeworkAssignment } from "@/lib/homework-weekly";

function isAdminEmail(email: string | null | undefined): boolean {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return false;
  return !!email && allowed.includes(email.toLowerCase());
}

export async function POST(req: Request) {
  const session = await getAppSession();
  if (!session) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  const email = session.user.email;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ ok: false, error: "Not allowed" }, { status: 403 });
  }

  const body = (await req.json()) as { week_start?: string; extracted?: ExtractedHomework };
  const weekStart = String(body.week_start || "").slice(0, 10);
  const extracted = body.extracted;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ ok: false, error: "Invalid week_start (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!extracted?.full_german_text?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing German text" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  await adminUpsertHomeworkAssignment(admin, { week_start: weekStart, extracted });
  return NextResponse.json({ ok: true });
}

