import { tokenizeWords } from "@/lib/tokenize";

/**
 * Map a German word to its English gloss using parallel DE/EN sentences (same index).
 * Uses token index proportional mapping so "Zelt" aligns with "tent" even when
 * word counts differ slightly (better than translating the lemma in isolation).
 */
export function glossFromParallelSentences(
  sentenceDe: string,
  sentenceEn: string,
  word: string,
): string | null {
  const wn = word.toLowerCase().replace(/[.,!?;:«»"„"()]/g, "");
  if (!wn.trim() || !sentenceDe.trim() || !sentenceEn.trim()) return null;
  const toksDe = tokenizeWords(sentenceDe);
  const toksEn = tokenizeWords(sentenceEn);
  if (!toksDe.length || !toksEn.length) return null;
  const j = toksDe.findIndex((t) => t.w.toLowerCase() === wn);
  if (j < 0) return null;
  let jEn: number;
  if (toksDe.length === toksEn.length) {
    jEn = j;
  } else {
    const denom = Math.max(1, toksDe.length - 1);
    jEn = Math.min(
      Math.round((j / denom) * Math.max(0, toksEn.length - 1)),
      toksEn.length - 1,
    );
  }
  const gloss = toksEn[jEn]?.w;
  if (!gloss) return null;
  return gloss.replace(/[.,!?;:]/g, "");
}
