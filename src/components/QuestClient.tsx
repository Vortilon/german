"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type {
  ExtractedHomework,
  HandwritingResult,
  HomeworkProgress,
  HomeworkProgressStep,
  ParentReport,
  WordFeedback,
} from "@/lib/homework-types";
import { fetchHomeworkWeek, upsertHomeworkWeek } from "@/lib/homework-db";
import { getWeekStartIso } from "@/lib/week";
import { VOICE_AGENT_SYSTEM } from "@/lib/prompts";
import { PrankReward } from "@/components/PrankReward";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      const idx = s.indexOf("base64,");
      resolve(idx >= 0 ? s.slice(idx + 7) : s);
    };
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function tokenizeWords(text: string): { w: string; i: number }[] {
  const out: { w: string; i: number }[] = [];
  let i = 0;
  for (const raw of text.split(/\s+/)) {
    const w = raw.replace(/[.,!?;:«»"„"()]/g, "");
    if (w.length) out.push({ w, i: i++ });
  }
  return out;
}

function sentencesFromExtracted(ex: ExtractedHomework): string[] {
  if (ex.lines?.length) return ex.lines.map((l) => l.trim()).filter(Boolean);
  return ex.full_german_text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function playTts(text: string, language: "de" | "en") {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await audio.play();
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("audio error"));
  });
  URL.revokeObjectURL(url);
}

const STEP_ORDER: HomeworkProgressStep[] = [
  "a_upload",
  "b_notebook",
  "c_guide",
  "d_interactive",
  "e_read_aloud",
  "f_user_read",
  "g_repeat_spelling",
  "h_report",
  "done",
];

export function QuestClient({ user }: { user: User }) {
  const weekStart = useMemo(() => getWeekStartIso(), []);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loaded, setLoaded] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedHomework | null>(null);
  const [progress, setProgress] = useState<HomeworkProgress>({
    step: "a_upload",
    word_feedback: {},
    weak_word_indices: [],
    time_spent_sec: 0,
  });
  const [handwriting, setHandwriting] = useState<HandwritingResult | null>(null);
  const [parentReport, setParentReport] = useState<ParentReport | null>(null);

  const [hwFiles, setHwFiles] = useState<File[]>([]);
  const [nbFiles, setNbFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rewardTick, setRewardTick] = useState(0);

  const [readIdx, setReadIdx] = useState(0);
  const [highlightSentence, setHighlightSentence] = useState(0);
  const [spellTarget, setSpellTarget] = useState<{ word: string; idx: number } | null>(
    null,
  );
  const [spellInput, setSpellInput] = useState("");
  const [spellStats, setSpellStats] = useState({ correct: 0, total: 0 });
  const [spellingDone, setSpellingDone] = useState(false);

  const startedRef = useRef<number | null>(null);
  const [voiceEvents, setVoiceEvents] = useState<string[]>([]);

  useEffect(() => {
    startedRef.current = Date.now();
    const id = window.setInterval(() => {
      const t = Math.floor((Date.now() - (startedRef.current || Date.now())) / 1000);
      setProgress((p) => ({ ...p, time_spent_sec: t }));
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const persist = useCallback(
    async (next: {
      extracted?: ExtractedHomework | null;
      progress?: HomeworkProgress;
      handwriting?: HandwritingResult | null;
      parent_report?: ParentReport | null;
    }) => {
      if (!supabase) return;
      await upsertHomeworkWeek(supabase, {
        user_id: user.id,
        week_start: weekStart,
        topic: next.extracted?.title ?? extracted?.title ?? null,
        extracted: next.extracted ?? extracted,
        progress: next.progress ?? progress,
        handwriting: next.handwriting ?? handwriting,
        parent_report: next.parent_report ?? parentReport,
      });
    },
    [supabase, user.id, weekStart, extracted, progress, handwriting, parentReport],
  );

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setLoaded(true);
        return;
      }
      try {
        const row = await fetchHomeworkWeek(supabase, user.id, weekStart);
        if (row?.extracted) setExtracted(row.extracted);
        if (row?.progress) setProgress(row.progress as HomeworkProgress);
        if (row?.handwriting) setHandwriting(row.handwriting);
        if (row?.parent_report) setParentReport(row.parent_report as ParentReport);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoaded(true);
      }
    })();
  }, [supabase, user.id, weekStart]);

  function setStep(step: HomeworkProgressStep) {
    setProgress((p) => {
      const n = { ...p, step };
      void persist({ progress: n });
      return n;
    });
  }

  async function runVisionHomework() {
    setErr(null);
    setBusy("Reading your sheet…");
    try {
      const images = await Promise.all(hwFiles.slice(0, 8).map(fileToBase64));
      const res = await fetch("/api/vision/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images_base64: images }),
      });
      const json = (await res.json()) as { ok?: boolean; extracted?: ExtractedHomework; error?: string };
      if (!res.ok || !json.ok || !json.extracted) throw new Error(json.error || "Vision failed");
      setExtracted(json.extracted);
      setStep("b_notebook");
      setRewardTick((x) => x + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function runVisionNotebook() {
    if (!extracted) return;
    setErr(null);
    setBusy("Checking notebook…");
    try {
      const images = await Promise.all(nbFiles.slice(0, 2).map(fileToBase64));
      const res = await fetch("/api/vision/handwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images_base64: images,
          expected_german_text: extracted.full_german_text,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        handwriting?: HandwritingResult;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.handwriting) throw new Error(json.error || "Vision failed");
      setHandwriting(json.handwriting);
      void persist({ handwriting: json.handwriting });
      setStep("c_guide");
      setRewardTick((x) => x + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Notebook failed");
    } finally {
      setBusy(null);
    }
  }

  const words = useMemo(
    () => (extracted ? tokenizeWords(extracted.full_german_text) : []),
    [extracted],
  );

  const meaningMap = useMemo(() => {
    const m = new Map<string, string>();
    extracted?.special_words.forEach((x) => m.set(x.de.toLowerCase(), x.en));
    return m;
  }, [extracted]);

  async function pronounceWord(word: string) {
    setBusy("Speaking…");
    try {
      await playTts(word, "de");
    } finally {
      setBusy(null);
    }
  }

  async function readAloudNext() {
    if (!extracted) return;
    const sents = sentencesFromExtracted(extracted);
    if (!sents.length) return;
    const s = sents[highlightSentence % sents.length]!;
    setBusy("Reading…");
    try {
      await playTts(s, "de");
      setHighlightSentence((h) => (h + 1) % sents.length);
    } finally {
      setBusy(null);
    }
  }

  function markWordFeedback(idx: number, fb: WordFeedback) {
    setProgress((p) => {
      const wf = { ...(p.word_feedback || {}) };
      wf[String(idx)] = fb;
      const n = { ...p, word_feedback: wf };
      void persist({ progress: n });
      return n;
    });
  }

  function startSpellingFromWeak(weakArr: number[] | null) {
    if (!words.length) return;
    const weak =
      weakArr && weakArr.length > 0 ? weakArr : words.map((w) => w.i);
    const pick = weak[Math.floor(Math.random() * weak.length)]!;
    const word = words.find((w) => w.i === pick)?.w || words[0]!.w;
    setSpellTarget({ word, idx: pick });
    setSpellInput("");
  }

  function startSpelling() {
    startSpellingFromWeak(
      progress.weak_word_indices && progress.weak_word_indices.length > 0 ?
        progress.weak_word_indices
      : null,
    );
  }

  async function checkSpelling() {
    if (!spellTarget) return;
    const ok = spellInput.trim() === spellTarget.word;
    const idx = spellTarget.idx;
    setSpellStats((s) => ({
      correct: s.correct + (ok ? 1 : 0),
      total: s.total + 1,
    }));
    if (ok) {
      setRewardTick((x) => x + 1);
      try {
        await playTts("Super!", "de");
      } catch {
        /* ignore */
      }
    } else {
      try {
        await playTts(spellTarget.word, "de");
      } catch {
        /* ignore */
      }
    }

    setSpellTarget(null);
    setSpellInput("");

    setProgress((p) => {
      const base =
        p.weak_word_indices && p.weak_word_indices.length > 0 ?
          p.weak_word_indices
        : words.map((w) => w.i);
      const weak = new Set(base);
      if (ok) weak.delete(idx);
      else weak.add(idx);
      const weakArr = [...weak];
      const mastered = ok && weakArr.length === 0 && words.length > 0;
      const n: HomeworkProgress = {
        ...p,
        weak_word_indices: weakArr,
        spelling_mastered: mastered ? true : p.spelling_mastered,
      };
      void persist({ progress: n });
      if (mastered) setSpellingDone(true);
      else window.setTimeout(() => startSpellingFromWeak(weakArr), 0);
      return n;
    });
  }

  function buildParentReport(p: HomeworkProgress): ParentReport {
    const wf = p.word_feedback || {};
    const greens = Object.values(wf).filter((x) => x === "green").length;
    const total = Object.keys(wf).length || 1;
    const pronunciation_score = Math.round((greens / total) * 100);

    const practice_words = (p.weak_word_indices || [])
      .map((i) => words.find((w) => w.i === i)?.w)
      .filter(Boolean) as string[];

    return {
      generated_at: new Date().toISOString(),
      accuracy_notes: `Word feedback entries: ${total}. Greens: ${greens}.`,
      pronunciation_score,
      spelling: { correct: spellStats.correct, total: spellStats.total },
      time_spent_sec: p.time_spent_sec || 0,
      handwriting_notes: handwriting?.summary || "No notebook pass yet.",
      practice_words,
    };
  }

  function finishToReport() {
    setProgress((p) => {
      const r = buildParentReport(p);
      setParentReport(r);
      void persist({ parent_report: r, progress: { ...p, step: "h_report" } });
      return { ...p, step: "h_report" };
    });
  }

  // --- Realtime: connect for diagnostics + future audio streaming
  const [rtState, setRtState] = useState<"off" | "connecting" | "open" | "error">("off");
  const rtWs = useRef<WebSocket | null>(null);

  function connectRealtime() {
    const url = process.env.NEXT_PUBLIC_REALTIME_WS_URL;
    if (!url) {
      setErr("Set NEXT_PUBLIC_REALTIME_WS_URL to your deployed /realtime WebSocket proxy.");
      return;
    }
    setRtState("connecting");
    try {
      const ws = new WebSocket(url);
      rtWs.current = ws;
      ws.onopen = () => {
        setRtState("open");
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              voice: "ara",
              instructions: VOICE_AGENT_SYSTEM,
              turn_detection: { type: "server_vad" },
            },
          }),
        );
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as { type?: string };
          setVoiceEvents((prev) =>
            [...prev.slice(-40), msg.type || "event"].slice(-40),
          );
        } catch {
          /* binary */
        }
      };
      ws.onerror = () => setRtState("error");
      ws.onclose = () => setRtState("off");
    } catch {
      setRtState("error");
    }
  }

  function disconnectRealtime() {
    rtWs.current?.close();
    rtWs.current = null;
    setRtState("off");
  }

  if (!supabase) {
    return (
      <div className="p-6 text-center text-xl font-bold text-white">
        Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-xl font-bold text-white">
        Loading your week…
      </div>
    );
  }

  const step = progress.step;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-24 text-white">
      <PrankReward trigger={rewardTick} />

      <header className="rounded-2xl border-4 border-[#5c4033] bg-[#2d6a4f] p-4 shadow-[6px_6px_0_#2d1f18]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-white/80">This week</p>
            <p className="text-2xl font-black">
              {extracted?.title ? `Continue: ${extracted.title}` : "New homework quest"}
            </p>
            <p className="text-xs text-white/70">Week of {weekStart}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/parent"
              className="rounded-lg border-2 border-[#2d1f18] bg-[#f4d03f] px-3 py-2 text-sm font-black text-[#2d1f18]"
            >
              Parent
            </Link>
            <button
              type="button"
              className="rounded-lg border-2 border-[#2d1f18] bg-white/10 px-3 py-2 text-sm font-bold"
              onClick={() => void supabase.auth.signOut().then(() => window.location.assign("/login"))}
            >
              Log out
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {STEP_ORDER.map((s) => (
            <span
              key={s}
              className={`rounded-full px-2 py-1 text-xs font-bold ${
                s === step ? "bg-[#f4d03f] text-[#2d1f18]" : "bg-black/20"
              }`}
            >
              {s}
            </span>
          ))}
        </div>
      </header>

      {err ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-900/40 p-3 text-sm">{err}</div>
      ) : null}

      {/* a */}
      {step === "a_upload" && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">a) Homework sheet photo</h2>
          <p className="mt-2 text-sm text-white/90">
            Ask a grown-up to take a clear photo of the whole sheet.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="mt-4 block w-full text-lg"
            onChange={(e) => setHwFiles(Array.from(e.target.files || []))}
          />
          <button
            type="button"
            disabled={!hwFiles.length || !!busy}
            onClick={() => void runVisionHomework()}
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18] disabled:opacity-50"
          >
            {busy || "Scan sheet"}
          </button>
        </section>
      )}

      {/* b */}
      {step === "b_notebook" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">b) Copy into notebook</h2>
          <p className="mt-2 text-sm">
            Copy the German text. Take 1–2 photos. Grok checks handwriting.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            className="mt-4 block w-full text-lg"
            onChange={(e) => setNbFiles(Array.from(e.target.files || []))}
          />
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={!nbFiles.length || !!busy}
              onClick={() => void runVisionNotebook()}
              className="w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18] disabled:opacity-50"
            >
              {busy || "Check notebook"}
            </button>
            <button
              type="button"
              className="w-full rounded-xl border-2 border-white/40 py-3 font-bold"
              onClick={() => setStep("c_guide")}
            >
              Skip for now
            </button>
          </div>
        </section>
      )}

      {/* c */}
      {step === "c_guide" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">c) What to do</h2>
          <ul className="mt-3 list-decimal pl-6 text-sm">
            {extracted.instructions.map((x, i) => (
              <li key={i} className="mb-1">
                {x}
              </li>
            ))}
          </ul>
          {handwriting ? (
            <p className="mt-3 rounded-lg bg-black/20 p-3 text-sm">{handwriting.summary}</p>
          ) : null}
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18]"
            onClick={() => setStep("d_interactive")}
          >
            Continue
          </button>
        </section>
      )}

      {/* d */}
      {step === "d_interactive" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">d) Tap words</h2>
          <p className="mt-2 text-sm">Hover: English tip. Click: hear German.</p>
          <p className="mt-4 text-2xl leading-relaxed">
            {words.map(({ w, i }) => (
              <span key={`${i}-${w}`} className="inline-block">
                <button
                  type="button"
                  title={meaningMap.get(w.toLowerCase()) || "Look it up with your coach"}
                  className="mx-0.5 rounded px-1 hover:bg-white/20"
                  onClick={() => void pronounceWord(w)}
                >
                  {w}
                </button>{" "}
              </span>
            ))}
          </p>
          <button
            type="button"
            className="mt-6 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18]"
            onClick={() => setStep("e_read_aloud")}
          >
            Next: read aloud
          </button>
        </section>
      )}

      {/* e */}
      {step === "e_read_aloud" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">e) Listen (sentence by sentence)</h2>
          <p className="mt-2 text-sm text-white/90">
            Highlight moves after each sentence (Grok TTS).
          </p>
          <p className="mt-4 rounded-lg bg-black/20 p-3 text-xl font-semibold leading-relaxed">
            {sentencesFromExtracted(extracted)[highlightSentence % sentencesFromExtracted(extracted).length]}
          </p>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void readAloudNext()}
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18] disabled:opacity-50"
          >
            {busy || "Play next sentence"}
          </button>
          <button
            type="button"
            className="mt-3 w-full rounded-xl border-2 border-white/30 py-3 font-bold"
            onClick={() => setStep("f_user_read")}
          >
            Next: you read
          </button>
        </section>
      )}

      {/* f */}
      {step === "f_user_read" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">f) You read — word highlight</h2>
          <p className="mt-2 text-sm">
            Tap the word you are on while you read. For full Grok listening, connect voice
            (proxy).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {words.map(({ w, i }) => (
              <button
                key={`read-${i}`}
                type="button"
                onClick={() => setReadIdx(i)}
                className={`rounded-lg border-2 px-2 py-1 text-lg font-bold ${
                  readIdx === i ? "border-[#f4d03f] bg-[#f4d03f] text-[#2d1f18]" : "border-white/20"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {rtState === "off" ? (
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-2 font-bold"
                onClick={connectRealtime}
              >
                Connect Grok voice (Realtime)
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-2 font-bold"
                onClick={disconnectRealtime}
              >
                Disconnect ({rtState})
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-white/70">
            Events: {voiceEvents.slice(-6).join(", ") || "—"}
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18]"
            onClick={() => setStep("g_repeat_spelling")}
          >
            Next: repeat & spell
          </button>
        </section>
      )}

      {/* g */}
      {step === "g_repeat_spelling" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">g) Pronunciation colors + spelling</h2>
          <p className="mt-2 text-sm">
            Tap a color for each word. When ready, start the spelling game.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {words.map(({ w, i }) => {
              const fb = (progress.word_feedback || {})[String(i)] || "none";
              return (
                <div key={`fb-${i}`} className="flex items-center gap-1">
                  <span className="rounded bg-black/20 px-2 py-1 font-bold">{w}</span>
                  {(["green", "blue", "red"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`rounded px-2 py-1 text-xs font-black ${
                        fb === c ? "ring-2 ring-white" : ""
                      } ${c === "green" ? "bg-green-500" : c === "blue" ? "bg-blue-600" : "bg-red-600"}`}
                      onClick={() => markWordFeedback(i, c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {!spellingDone ? (
            <div className="mt-6 rounded-xl bg-black/20 p-4">
              <p className="font-bold">Spelling</p>
              {!spellTarget ? (
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-3 font-black text-[#2d1f18]"
                  onClick={startSpelling}
                >
                  Start spelling game
                </button>
              ) : (
                <>
                  <p className="mt-2 text-sm">Type what you hear (nouns capitalized).</p>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg bg-white/10 py-3 font-bold"
                    onClick={() => void playTts(spellTarget.word, "de")}
                  >
                    Hear again
                  </button>
                  <input
                    value={spellInput}
                    onChange={(e) => setSpellInput(e.target.value)}
                    className="mt-3 w-full rounded-xl border-4 border-[#2d1f18] p-4 text-2xl font-bold text-black"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-3 font-black text-[#2d1f18]"
                    onClick={() => void checkSpelling()}
                  >
                    Check
                  </button>
                  <p className="mt-2 text-sm">
                    Score: {spellStats.correct}/{spellStats.total}
                  </p>
                </>
              )}
            </div>
          ) : (
            <p className="mt-4 font-black text-[#f4d03f]">Spelling mastered — epic!</p>
          )}

          <button
            type="button"
            className="mt-6 w-full rounded-xl border-4 border-[#2d1f18] bg-white/10 py-4 font-black"
            onClick={finishToReport}
          >
            Finish & parent report
          </button>
        </section>
      )}

      {/* h */}
      {(step === "h_report" || step === "done") && parentReport && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">h) Parent report</h2>
          <pre className="mt-4 overflow-auto rounded-lg bg-black/30 p-4 text-sm leading-relaxed">
            {JSON.stringify(parentReport, null, 2)}
          </pre>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 font-black text-[#2d1f18]"
            onClick={() => setStep("done")}
          >
            Done
          </button>
        </section>
      )}
    </div>
  );
}
