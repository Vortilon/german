import type { HandwritingResult } from "@/lib/homework-types";

/** One notebook photo check; kept client-side with TTL (not in Supabase). */
export type NotebookAttempt = {
  id: string;
  createdAt: number;
  /** Compressed JPEG data URLs for display (1–2 photos). */
  imageDataUrls: string[];
  handwriting: HandwritingResult;
};

const TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 12;

export function notebookAttemptsStorageKey(userId: string, week: string) {
  return `elio_nb_attempts_${userId}_${week}`;
}

export function loadNotebookAttempts(key: string): NotebookAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: NotebookAttempt[] };
    const now = Date.now();
    const items = (parsed.items || []).filter((a) => now - a.createdAt < TTL_MS);
    return items.slice(-MAX_ATTEMPTS);
  } catch {
    return [];
  }
}

export function saveNotebookAttempts(key: string, items: NotebookAttempt[]) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const pruned = items.filter((a) => now - a.createdAt < TTL_MS).slice(-MAX_ATTEMPTS);
    localStorage.setItem(key, JSON.stringify({ items: pruned }));
  } catch {
    /* quota — drop oldest */
    try {
      const half = items.slice(Math.floor(items.length / 2));
      localStorage.setItem(key, JSON.stringify({ items: half }));
    } catch {
      /* ignore */
    }
  }
}
