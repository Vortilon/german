import type { HomeworkProgressStep } from "@/lib/homework-types";

/** Canonical order — internal ids stay stable for saved progress. */
export const QUEST_STEP_ORDER: HomeworkProgressStep[] = [
  "a_upload",
  "b_notebook",
  "c_guide",
  "e_read_aloud",
  "f_user_read",
  "g_dictation",
  "g_repeat_spelling",
  "h_report",
  "done",
];

export const QUEST_STEP_LABELS: Record<HomeworkProgressStep, string> = {
  a_upload: "Homework text",
  b_notebook: "Notebook copy",
  c_guide: "What to do",
  e_read_aloud: "Listen",
  f_user_read: "You read",
  g_dictation: "Dictation",
  g_repeat_spelling: "Practice & spelling",
  h_report: "Parent report",
  done: "All done",
};

export function stepIndex(step: HomeworkProgressStep): number {
  return QUEST_STEP_ORDER.indexOf(step);
}

export function inferFurthestIndex(
  step: HomeworkProgressStep,
  stored?: number | null,
): number {
  if (typeof stored === "number" && stored >= 0) return stored;
  return Math.max(0, stepIndex(step));
}

/** Old saves used `d_interactive` (removed); map to Listen. */
export function migrateProgressStep(step: string): HomeworkProgressStep {
  if (step === "d_interactive") return "e_read_aloud";
  const i = QUEST_STEP_ORDER.indexOf(step as HomeworkProgressStep);
  if (i >= 0) return step as HomeworkProgressStep;
  return "a_upload";
}
