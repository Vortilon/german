import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedHomework, HandwritingResult, HomeworkProgress, ParentReport } from "@/lib/homework-types";
import { env } from "@/lib/env";

export type HomeworkAssignmentRow = {
  week_start: string;
  extracted: ExtractedHomework;
  updated_at: string;
};

export type StudentWeekRow = {
  user_id: string;
  week_start: string;
  progress: HomeworkProgress;
  handwriting: HandwritingResult | null;
  parent_report: ParentReport | null;
  updated_at: string;
};

export async function fetchHomeworkWeeksIndex(
  supabase: SupabaseClient,
): Promise<Array<{ week_start: string; title: string; updated_at: string }>> {
  const { data, error } = await supabase
    .from("homework_assignments")
    .select("week_start, extracted, updated_at")
    .order("week_start", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ week_start: string; extracted?: ExtractedHomework; updated_at: string }>;
  return rows.map((r) => ({
    week_start: r.week_start,
    title: r.extracted?.title ?? "Homework",
    updated_at: r.updated_at,
  }));
}

export async function fetchHomeworkAssignment(
  supabase: SupabaseClient,
  weekStart: string,
): Promise<HomeworkAssignmentRow | null> {
  const { data, error } = await supabase
    .from("homework_assignments")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as HomeworkAssignmentRow | null) ?? null;
}

export async function fetchStudentWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<StudentWeekRow | null> {
  const { data, error } = await supabase
    .from("homework_student_weeks")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as StudentWeekRow | null) ?? null;
}

export async function upsertStudentWeek(
  supabase: SupabaseClient,
  row: {
    user_id: string;
    week_start: string;
    progress?: HomeworkProgress;
    handwriting?: HandwritingResult | null;
    parent_report?: ParentReport | null;
  },
) {
  const { error } = await supabase.from("homework_student_weeks").upsert(
    {
      user_id: row.user_id,
      week_start: row.week_start,
      progress: row.progress ?? {},
      handwriting: row.handwriting ?? null,
      parent_report: row.parent_report ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) throw error;
}

/** Server-side only (service role required). */
export async function adminUpsertHomeworkAssignment(
  supabaseServiceRole: SupabaseClient,
  row: { week_start: string; extracted: ExtractedHomework },
) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for admin upsert.");
  }
  const { error } = await supabaseServiceRole.from("homework_assignments").upsert(
    {
      week_start: row.week_start,
      extracted: row.extracted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "week_start" },
  );
  if (error) throw error;
}

