/** Client-side word meaning: glossary first, then /api/dict with in-memory cache. */
export function makeMeaningCache() {
  return new Map<string, string>();
}

export async function fetchWordMeaning(
  word: string,
  sentence: string,
  glossary: Map<string, string>,
  cache: Map<string, string>,
): Promise<string> {
  const lower = word.toLowerCase();
  const g = glossary.get(lower);
  if (g) return g;
  const hit = cache.get(lower);
  if (hit) return hit;
  try {
    const res = await fetch("/api/dict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word, sentence }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      en?: string;
      error?: string;
    };
    if (!res.ok) {
      const msg = json.error || `HTTP ${res.status}`;
      cache.set(lower, `— (${msg})`);
      return cache.get(lower)!;
    }
    const en = json.ok && json.en?.trim() ? json.en.trim() : "— (no definition)";
    cache.set(lower, en);
    return en;
  } catch {
    return "— (offline)";
  }
}
