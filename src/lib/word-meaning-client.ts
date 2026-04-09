/** Client-side word meaning: glossary first, then free translate with cache. */
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
      cache.set(lower, `— (${msg})`);
      return cache.get(lower)!;
    }
    const out = json.ok && json.text?.trim() ? json.text.trim() : "—";
    cache.set(lower, out);
    return out;
  } catch {
    return "— (offline)";
  }
}
