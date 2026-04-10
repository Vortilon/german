export type HomeworkProgressStep =
  | "a_upload"
  | "b_notebook"
  | "c_guide"
  | "e_read_aloud"
  | "f_user_read"
  | "g_dictation"
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
  /** The main passage Elio must learn—ignore side doodles, headers, or unrelated lines unless they are the assigned text. */
  full_german_text: string;
  instructions: string[];
  special_words: { de: string; en: string }[];
  teacher_notes?: string;
  lines: string[];
  /** One English translation per entry in `lines` (same order). */
  sentence_translations_en?: string[];
  /** When true, `special_words` were built with sentence-aligned glosses (v2). */
  word_glossary_aligned_v2?: boolean;
  /** Short English summary of what the teacher wants (copy, memorize, answer questions, etc.). */
  main_task_summary_en?: string;
}

export interface HandwritingWordCheck {
  /** Same index as tokenizeWords on expected text. */
  word_index: number;
  word_expected: string;
  word_seen: string;
  ok: boolean;
  /** What is wrong + how to fix (English): capitalization, missing letters, punctuation, etc. */
  hint_en: string;
}

export interface HandwritingResult {
  is_acceptable: boolean;
  summary: string;
  /** Per-word match vs expected text; green/red UI. */
  word_checks?: HandwritingWordCheck[];
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
