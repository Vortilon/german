import type { ExtractedHomework } from "@/lib/homework-types";

/** Word tokens with stable indices for vision + UI alignment. */
export function tokenizeWords(text: string): { w: string; i: number }[] {
  const out: { w: string; i: number }[] = [];
  let i = 0;
  for (const raw of text.trim().split(/\s+/)) {
    const w = raw.replace(/[.,!?;:«»"„"()]/g, "");
    if (w.length) out.push({ w, i: i++ });
  }
  return out;
}

export function sentencesFromExtracted(ex: ExtractedHomework): string[] {
  if (ex.lines?.length) return ex.lines.map((l) => l.trim()).filter(Boolean);
  return ex.full_german_text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** English line per sentence, aligned with sentencesFromExtracted when possible. */
export function sentenceEnglishLines(ex: ExtractedHomework): string[] {
  const n = sentencesFromExtracted(ex).length;
  const t = ex.sentence_translations_en ?? [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(t[i]?.trim() || "");
  }
  return out;
}
