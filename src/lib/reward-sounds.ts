/**
 * Short celebratory tones (no assets). Call after a user gesture so AudioContext unlocks on iOS.
 */
export async function playDictationCorrectChime(): Promise<void> {
  await playToneSequence([659, 880, 1047], 55, 0.11);
}

export async function playDictationCompleteFanfare(): Promise<void> {
  await playToneSequence([523, 659, 784, 1047, 1319], 65, 0.13);
}

async function playToneSequence(
  frequenciesHz: number[],
  gapMs: number,
  durationSec: number,
): Promise<void> {
  if (typeof window === "undefined") return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    /* ignore */
  }
  for (const freq of frequenciesHz) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
    await new Promise((r) => setTimeout(r, durationSec * 1000 + gapMs));
  }
  try {
    await ctx.close();
  } catch {
    /* ignore */
  }
}
