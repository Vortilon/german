export type HomeworkProgressStep =
  | "a_upload"
  | "b_notebook"
  | "c_guide"
  | "d_interactive"
  | "e_read_aloud"
  | "f_user_read"
  | "g_repeat_spelling"
  | "h_report"
  | "done";

export type WordFeedback = "none" | "green" | "blue" | "red";

export interface HomeworkProgress {
  step: HomeworkProgressStep;
  /** Highest step index (0–8) the player has unlocked; used for navigation. */
  furthest_index?: number;
  started_at?: string;
  /** Per normalized word index → feedback */
  word_feedback?: Record<string, WordFeedback>;
  /** Indices still weak for spelling */
  weak_word_indices?: number[];
  spelling_mastered?: boolean;
  time_spent_sec?: number;
}

export interface ExtractedHomework {
  title: string;
  full_german_text: string;
  instructions: string[];
  special_words: { de: string; en: string }[];
  teacher_notes?: string;
  lines: string[];
}

export interface HandwritingResult {
  is_acceptable: boolean;
  summary: string;
  fixes: Array<{
    issue: string;
    what: string;
    expected?: string;
    box: { x: number; y: number; w: number; h: number };
  }>;
  recognized_text: string;
}

export interface ParentReport {
  generated_at: string;
  accuracy_notes: string;
  pronunciation_score: number | null;
  spelling: { correct: number; total: number };
  time_spent_sec: number;
  handwriting_notes: string;
  practice_words: string[];
}
