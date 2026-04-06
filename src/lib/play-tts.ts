/**
 * Play Grok TTS audio in the browser. `playbackRate` 0.65–1.0 = slower German.
 */
export async function playTts(
  text: string,
  language: "de" | "en",
  playbackRate = 0.88,
): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  const rate = Math.min(1.05, Math.max(0.55, playbackRate));
  audio.playbackRate = rate;
  try {
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio error"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
