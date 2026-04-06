import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExtractedHomework,
  HandwritingResult,
  HomeworkProgress,
  ParentReport,
} from "@/lib/homework-types";

export type HomeworkRow = {
  id: string;
  user_id: string;
  week_start: string;
  topic: string | null;
  extracted: ExtractedHomework | null;
  progress: HomeworkProgress;
  handwriting: HandwritingResult | null;
  parent_report: ParentReport | null;
  updated_at: string;
};

export async function fetchHomeworkWeek(
  supabase: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<HomeworkRow | null> {
  const { data, error } = await supabase
    .from("homework_weeks")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw error;
  return data as HomeworkRow | null;
}

export async function upsertHomeworkWeek(
  supabase: SupabaseClient,
  row: {
    user_id: string;
    week_start: string;
    topic?: string | null;
    extracted?: ExtractedHomework | null;
    progress?: HomeworkProgress;
    handwriting?: HandwritingResult | null;
    parent_report?: ParentReport | null;
  },
) {
  const { error } = await supabase.from("homework_weeks").upsert(
    {
      user_id: row.user_id,
      week_start: row.week_start,
      topic: row.topic ?? null,
      extracted: row.extracted ?? null,
      progress: row.progress ?? {},
      handwriting: row.handwriting ?? null,
      parent_report: row.parent_report ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) throw error;
}
