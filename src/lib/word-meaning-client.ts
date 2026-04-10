import { glossFromParallelSentences } from "@/lib/word-gloss";

/** Client-side word meaning: glossary → aligned sentence gloss → translate lemma (cached). */
export function makeMeaningCache() {
  return new Map<string, string>();
}

function sessionKeyCtx(sentenceDe: string, word: string) {
  return `gloss:ctx:${sentenceDe.slice(0, 160)}:${word.toLowerCase()}`;
}

function sessionKeyLemma(word: string) {
  return `gloss:lemma:${word.toLowerCase()}`;
}

export async function fetchWordMeaning(
  word: string,
  sentence: string,
  glossary: Map<string, string>,
  cache: Map<string, string>,
  sentenceEn?: string,
): Promise<string> {
  const lower = word.toLowerCase();
  const g = glossary.get(lower);
  if (g) return g;

  const ctxKey = `${sentence.slice(0, 160)}|${lower}`;
  const cachedCtx = cache.get(ctxKey);
  if (cachedCtx) return cachedCtx;

  try {
    if (sentenceEn?.trim() && sentence.trim()) {
      try {
        const sk = sessionKeyCtx(sentence, word);
        const hit = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(sk) : null;
        if (hit) {
          cache.set(ctxKey, hit);
          return hit;
        }
      } catch {
        /* ignore */
      }

      const aligned = glossFromParallelSentences(sentence, sentenceEn, word);
      if (aligned) {
        cache.set(ctxKey, aligned);
        try {
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(sessionKeyCtx(sentence, word), aligned);
          }
        } catch {
          /* quota */
        }
        return aligned;
      }
    }

    const lemmaKey = lower;
    const hitLemma = cache.get(lemmaKey);
    if (hitLemma) return hitLemma;

    try {
      const sk = sessionKeyLemma(word);
      const hit = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(sk) : null;
      if (hit) {
        cache.set(lemmaKey, hit);
        return hit;
      }
    } catch {
      /* ignore */
    }

    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: word, source: "de", target: "en" }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      text?: string;
      error?: string;
    };
    if (!res.ok) {
      const msg = json.error || `HTTP ${res.status}`;
      const err = `— (${msg})`;
      cache.set(lemmaKey, err);
      return err;
    }
    const out = json.ok && json.text?.trim() ? json.text.trim() : "—";
    cache.set(lemmaKey, out);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(sessionKeyLemma(word), out);
      }
    } catch {
      /* quota */
    }
    return out;
  } catch {
    return "— (offline)";
  }
}
