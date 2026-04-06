"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { AppPersistence } from "@/lib/get-app-session";
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
import {
  QUEST_STEP_LABELS,
  QUEST_STEP_ORDER,
  inferFurthestIndex,
  stepIndex,
} from "@/lib/quest-steps";
import { GermanWordBlock } from "@/components/GermanWordBlock";
import { playTts } from "@/lib/play-tts";
import {
  sentenceEnglishLines,
  sentencesFromExtracted,
  tokenizeWords,
} from "@/lib/tokenize";
import { compressImageToJpegDataUrl } from "@/lib/compress-image-client";
import {
  loadNotebookAttempts,
  notebookAttemptsStorageKey,
  saveNotebookAttempts,
  type NotebookAttempt,
} from "@/lib/notebook-attempts";

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

function localStorageKey(userId: string, week: string) {
  return `elio_german_homework_${userId}_${week}`;
}

function relativeNotebookTime(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} day(s) ago`;
}

export function QuestClient({
  user,
  persistence,
}: {
  user: User;
  persistence: AppPersistence;
}) {
  const weekStart = useMemo(() => getWeekStartIso(), []);
  const notebookAttemptsKey = useMemo(
    () => notebookAttemptsStorageKey(user.id, weekStart),
    [user.id, weekStart],
  );
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const useLocal = persistence === "local";

  const [loaded, setLoaded] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedHomework | null>(null);
  const [progress, setProgress] = useState<HomeworkProgress>({
    step: "a_upload",
    furthest_index: 0,
    word_feedback: {},
    weak_word_indices: [],
    time_spent_sec: 0,
  });
  const [handwriting, setHandwriting] = useState<HandwritingResult | null>(null);
  const [parentReport, setParentReport] = useState<ParentReport | null>(null);
  /** Short-lived client history (48h); photos + AI feedback per upload. */
  const [notebookAttempts, setNotebookAttempts] = useState<NotebookAttempt[]>([]);
  const notebookFeedbackRef = useRef<HTMLDivElement>(null);

  const [hwFiles, setHwFiles] = useState<File[]>([]);
  const [nbFiles, setNbFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rewardTick, setRewardTick] = useState(0);

  const [highlightSentence, setHighlightSentence] = useState(0);
  const [spellTarget, setSpellTarget] = useState<{ word: string; idx: number } | null>(
    null,
  );
  const [spellInput, setSpellInput] = useState("");
  const [spellStats, setSpellStats] = useState({ correct: 0, total: 0 });
  const [spellingDone, setSpellingDone] = useState(false);

  const startedRef = useRef<number | null>(null);
  const [voiceEvents, setVoiceEvents] = useState<string[]>([]);

  /** After scan: confirm or edit text before notebook. */
  const [pendingSheetReview, setPendingSheetReview] = useState(false);
  const [draftFullText, setDraftFullText] = useState("");
  useEffect(() => {
    if (extracted?.full_german_text) setDraftFullText(extracted.full_german_text);
  }, [extracted?.full_german_text]);

  const [readAloudSpeed, setReadAloudSpeed] = useState(0.78);
  const [fSentenceIdx, setFSentenceIdx] = useState(0);

  useEffect(() => {
    if (!extracted) return;
    const n = sentencesFromExtracted(extracted).length;
    if (n <= 0) return;
    setHighlightSentence((h) => Math.min(h, n - 1));
    setFSentenceIdx((i) => Math.min(i, n - 1));
  }, [extracted]);

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
      const ex = next.extracted ?? extracted;
      const pr = next.progress ?? progress;
      const hw = next.handwriting ?? handwriting;
      const rep = next.parent_report ?? parentReport;
      if (useLocal && typeof window !== "undefined") {
        try {
          localStorage.setItem(
            localStorageKey(user.id, weekStart),
            JSON.stringify({
              extracted: ex,
              progress: pr,
              handwriting: hw,
              parent_report: rep,
            }),
          );
        } catch {
          /* quota */
        }
        return;
      }
      if (!supabase) return;
      await upsertHomeworkWeek(supabase, {
        user_id: user.id,
        week_start: weekStart,
        topic: ex?.title ?? null,
        extracted: ex,
        progress: pr,
        handwriting: hw,
        parent_report: rep,
      });
    },
    [
      useLocal,
      supabase,
      user.id,
      weekStart,
      extracted,
      progress,
      handwriting,
      parentReport,
    ],
  );

  useEffect(() => {
    (async () => {
      if (useLocal) {
        try {
          const raw = localStorage.getItem(localStorageKey(user.id, weekStart));
          if (raw) {
            const bundle = JSON.parse(raw) as {
              extracted?: ExtractedHomework;
              progress?: HomeworkProgress;
              handwriting?: HandwritingResult | null;
              parent_report?: ParentReport | null;
            };
            if (bundle.extracted) setExtracted(bundle.extracted);
            if (bundle.progress) {
              const bp = bundle.progress as HomeworkProgress;
              setProgress({
                ...bp,
                furthest_index: inferFurthestIndex(bp.step, bp.furthest_index),
              });
            }
            if (bundle.handwriting) setHandwriting(bundle.handwriting);
            if (bundle.parent_report) setParentReport(bundle.parent_report);
          }
        } catch {
          /* ignore */
        }
        setLoaded(true);
        return;
      }
      if (!supabase) {
        setLoaded(true);
        return;
      }
      try {
        const row = await fetchHomeworkWeek(supabase, user.id, weekStart);
        if (row?.extracted) setExtracted(row.extracted);
        if (row?.progress) {
          const rp = row.progress as HomeworkProgress;
          setProgress({
            ...rp,
            furthest_index: inferFurthestIndex(rp.step, rp.furthest_index),
          });
        }
        if (row?.handwriting) setHandwriting(row.handwriting);
        if (row?.parent_report) setParentReport(row.parent_report as ParentReport);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoaded(true);
      }
    })();
  }, [useLocal, supabase, user.id, weekStart]);

  useEffect(() => {
    if (!loaded) return;
    setNotebookAttempts(loadNotebookAttempts(notebookAttemptsKey));
  }, [loaded, notebookAttemptsKey]);

  function goToStep(next: HomeworkProgressStep) {
    setProgress((p) => {
      const i = stepIndex(next);
      const prevFur = inferFurthestIndex(p.step, p.furthest_index);
      const furthest_index = Math.max(prevFur, i);
      const n = { ...p, step: next, furthest_index };
      void persist({ progress: n });
      return n;
    });
  }

  function navigateToStep(target: HomeworkProgressStep) {
    setProgress((p) => {
      const targetI = stepIndex(target);
      const fur = inferFurthestIndex(p.step, p.furthest_index);
      if (targetI > fur) return p;
      const n = { ...p, step: target };
      void persist({ progress: n });
      return n;
    });
  }

  const furthestUnlocked = inferFurthestIndex(progress.step, progress.furthest_index);

  function confirmSheetToNotebook() {
    if (!extracted) return;
    const full = draftFullText.trim();
    const lines = full.split("\n").map((l) => l.trim()).filter(Boolean);
    const next: ExtractedHomework = {
      ...extracted,
      full_german_text: full || extracted.full_german_text,
      lines: lines.length > 0 ? lines : [full || extracted.full_german_text],
    };
    setExtracted(next);
    void persist({ extracted: next });
    setPendingSheetReview(false);
    goToStep("b_notebook");
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
      setDraftFullText(json.extracted.full_german_text);
      setPendingSheetReview(true);
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
      const files = nbFiles.slice(0, 2);
      const images = await Promise.all(files.map(fileToBase64));
      const imageDataUrls = (
        await Promise.all(files.map((f) => compressImageToJpegDataUrl(f)))
      ).filter((u): u is string => !!u);
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
      const hw = json.handwriting;
      const attempt: NotebookAttempt = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `nb-${Date.now()}`,
        createdAt: Date.now(),
        imageDataUrls,
        handwriting: hw,
      };
      setHandwriting(hw);
      void persist({ handwriting: hw });
      setNotebookAttempts((prev) => {
        const next = [attempt, ...prev];
        saveNotebookAttempts(notebookAttemptsKey, next);
        return next;
      });
      setNbFiles([]);
      setRewardTick((x) => x + 1);
      requestAnimationFrame(() => {
        notebookFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
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

  function notebookWordTiles(hw: HandwritingResult) {
    const checks = hw.word_checks;
    if (!checks?.length) {
      return (
        <p className="mt-2 text-xs text-white/60">
          Word-by-word data was not returned — compare the two text boxes above.
        </p>
      );
    }
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {words.map(({ w, i }) => {
          const wc = checks.find((x) => x.word_index === i);
          const ok = wc?.ok ?? true;
          const hasCheck = !!wc;
          return (
            <div
              key={`nbw-${i}-${w}`}
              className={`max-w-[160px] rounded-lg border-4 p-2 text-center ${
                !hasCheck ? "border-white/30 bg-black/10"
                : ok ? "border-green-500 bg-green-900/30"
                : "border-red-500 bg-red-900/30"
              }`}
            >
              <div className="text-lg font-black">{w}</div>
              {wc?.word_seen?.trim() ? (
                <p className="mt-0.5 text-xs text-white/80">Seen: {wc.word_seen}</p>
              ) : null}
              {wc && !wc.ok ? (
                <p className="mt-1 text-left text-xs leading-snug text-white/95">{wc.hint_en}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  async function playCurrentSentenceAloud() {
    if (!extracted) return;
    const sents = sentencesFromExtracted(extracted);
    if (!sents.length) return;
    const s = sents[highlightSentence] ?? sents[0]!;
    setBusy("Reading…");
    try {
      await playTts(s, "de", readAloudSpeed);
    } finally {
      setBusy(null);
    }
  }

  const readSents = extracted ? sentencesFromExtracted(extracted) : [];
  const readTrans = extracted ? sentenceEnglishLines(extracted) : [];

  function sentenceNavPrev() {
    setHighlightSentence((h) => Math.max(0, h - 1));
  }

  function sentenceNavNext() {
    setHighlightSentence((h) => Math.min(readSents.length - 1, h + 1));
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
        await playTts("Super!", "de", 0.95);
      } catch {
        /* ignore */
      }
    } else {
      try {
        await playTts(spellTarget.word, "de", 0.82);
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
      const i = stepIndex("h_report");
      const prevFur = inferFurthestIndex(p.step, p.furthest_index);
      const furthest_index = Math.max(prevFur, i);
      const n = { ...p, step: "h_report" as const, furthest_index };
      void persist({ parent_report: r, progress: n });
      return n;
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

  if (!useLocal && !supabase) {
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
              onClick={() => {
                if (useLocal) {
                  void fetch("/api/auth/elio", { method: "DELETE" }).then(() =>
                    window.location.assign("/login"),
                  );
                } else if (supabase) {
                  void supabase.auth.signOut().then(() => window.location.assign("/login"));
                }
              }}
            >
              Log out
            </button>
          </div>
        </div>

        <nav
          className="mt-3 flex flex-wrap gap-2"
          aria-label="Quest steps — tap a step you have unlocked"
        >
          {QUEST_STEP_ORDER.map((id) => {
            const idx = stepIndex(id);
            const locked = idx > furthestUnlocked;
            const current = id === step;
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                title={locked ? "Finish earlier steps first" : QUEST_STEP_LABELS[id]}
                onClick={() => !locked && navigateToStep(id)}
                className={`rounded-full px-3 py-2 text-left text-xs font-bold transition sm:text-sm ${
                  current ? "bg-[#f4d03f] text-[#2d1f18] ring-2 ring-[#2d1f18]" : ""
                } ${
                  locked ?
                    "cursor-not-allowed bg-black/10 text-white/40"
                  : "cursor-pointer bg-black/25 text-white hover:bg-black/35"
                } `}
              >
                {QUEST_STEP_LABELS[id]}
              </button>
            );
          })}
        </nav>
      </header>

      {err ? (
        <div className="rounded-xl border-2 border-red-300 bg-red-900/40 p-3 text-sm">{err}</div>
      ) : null}

      {step !== "a_upload" && !extracted && step !== "done" ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-900/30 p-4 text-sm">
          <p className="font-bold">Scan your homework sheet first.</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-[#f4d03f] px-4 py-2 font-black text-[#2d1f18]"
            onClick={() => navigateToStep("a_upload")}
          >
            Go to homework photo
          </button>
        </div>
      ) : null}

      {/* a — photo then confirm/edit text */}
      {step === "a_upload" && extracted && pendingSheetReview ? (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Is this the right homework text?</h2>
          <p className="mt-2 text-sm text-white/90">
            Fix spelling or typing if the scan missed something. This is the text Elio will copy
            and practice.
          </p>
          <textarea
            value={draftFullText}
            onChange={(e) => setDraftFullText(e.target.value)}
            rows={8}
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-white p-3 font-mono text-base text-black"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {extracted.main_task_summary_en ? (
            <p className="mt-3 rounded-lg bg-black/20 p-3 text-sm">
              <span className="font-bold text-[#f4d03f]">What to do: </span>
              {extracted.main_task_summary_en}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="flex-1 rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-lg font-black text-[#2d1f18]"
              onClick={confirmSheetToNotebook}
            >
              Looks good — next: notebook
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl border-2 border-white/40 py-4 font-bold"
              onClick={() => setPendingSheetReview(false)}
            >
              Back to photo
            </button>
          </div>
        </section>
      ) : null}

      {step === "a_upload" && (!extracted || !pendingSheetReview) ? (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Homework sheet photo</h2>
          <p className="mt-2 text-sm text-white/90">
            Ask a grown-up to take a clear photo of the whole sheet.
          </p>
          {extracted && !pendingSheetReview ? (
            <button
              type="button"
              className="mt-3 w-full rounded-lg border-2 border-amber-300 bg-amber-900/40 py-3 text-sm font-bold"
              onClick={() => {
                setDraftFullText(extracted.full_german_text);
                setPendingSheetReview(true);
              }}
            >
              Edit scanned text (if something was wrong)
            </button>
          ) : null}
          <label className="mt-4 flex min-h-[4rem] cursor-pointer flex-col items-center justify-center rounded-xl border-4 border-dashed border-[#2d1f18] bg-[#2d6a4f] px-4 py-5 text-center active:scale-[0.99]">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => setHwFiles(Array.from(e.target.files || []))}
            />
            <span className="text-lg font-black">📷 Tap here to add photos</span>
            <span className="mt-1 text-sm font-semibold text-white/85">
              Use camera or photo library — you can pick several pictures
            </span>
          </label>
          {hwFiles.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-lg bg-black/20 px-3 py-2 text-sm">
              {hwFiles.map((f) => (
                <li key={f.name + f.size}>✓ {f.name}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            disabled={!hwFiles.length || !!busy}
            onClick={() => void runVisionHomework()}
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18] disabled:opacity-50"
          >
            {busy || "Scan sheet"}
          </button>
        </section>
      ) : null}

      {/* b */}
      {step === "b_notebook" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Notebook copy</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Copy the German text into your notebook. Take 1–2 photos and tap <strong>Check notebook</strong>.
            Every check shows your photo and what was read vs what it should be, plus green/red per word.
            Photos stay on this device for about <strong>two days</strong>, then they are removed automatically
            (we do not keep a long history of pictures).
          </p>
          <label className="mt-4 flex min-h-[4rem] cursor-pointer flex-col items-center justify-center rounded-xl border-4 border-dashed border-[#2d1f18] bg-[#2d6a4f] px-4 py-5 text-center active:scale-[0.99]">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => setNbFiles(Array.from(e.target.files || []))}
            />
            <span className="text-lg font-black">📷 Tap here to photograph your writing</span>
            <span className="mt-1 text-sm font-semibold text-white/85">
              1 or 2 clear pictures of your notebook page
            </span>
          </label>
          {nbFiles.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-lg bg-black/20 px-3 py-2 text-sm">
              {nbFiles.map((f) => (
                <li key={f.name + f.size}>✓ {f.name}</li>
              ))}
            </ul>
          ) : null}
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
              onClick={() => goToStep("c_guide")}
            >
              Skip for now
            </button>
          </div>

          {notebookAttempts.length > 0 ? (
            <div ref={notebookFeedbackRef} className="mt-6 scroll-mt-24 space-y-6 border-t-2 border-white/20 pt-4">
              <div>
                <p className="font-bold text-[#f4d03f]">Your notebook checks</p>
                <p className="mt-1 text-xs text-white/75">
                  Each upload gets its own feedback. You can take another photo and check again anytime.
                </p>
              </div>
              {notebookAttempts.map((attempt, idx) => (
                <div
                  key={attempt.id}
                  className="rounded-xl border-2 border-white/25 bg-black/25 p-3 shadow-inner"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-white/90">
                      {relativeNotebookTime(attempt.createdAt)}
                    </span>
                    {idx === 0 ? (
                      <span className="rounded bg-[#f4d03f] px-2 py-0.5 text-xs font-black text-[#2d1f18]">
                        Latest
                      </span>
                    ) : null}
                  </div>
                  {attempt.imageDataUrls.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {attempt.imageDataUrls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className="max-h-48 max-w-full rounded-lg border-2 border-white/40 object-contain shadow-md"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-white/60">
                      (Photo preview not saved — feedback still applies.)
                    </p>
                  )}
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-black/35 p-3 ring-1 ring-white/15">
                      <p className="text-xs font-bold uppercase tracking-wide text-white/70">
                        From your photo
                      </p>
                      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
                        {attempt.handwriting.recognized_text?.trim() || "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-black/35 p-3 ring-1 ring-[#7bed9f]/40">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#7bed9f]">
                        Should match
                      </p>
                      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
                        {extracted.full_german_text}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-white/90">{attempt.handwriting.summary}</p>
                  {notebookWordTiles(attempt.handwriting)}
                </div>
              ))}
            </div>
          ) : handwriting ? (
            <div className="mt-6 border-t-2 border-white/20 pt-4">
              <p className="font-bold text-[#f4d03f]">Last saved check</p>
              <p className="mt-1 text-xs text-white/75">
                Add a new photo to see it here with your picture. Older sessions may not have stored images.
              </p>
              <p className="mt-3 text-sm text-white/90">{handwriting.summary}</p>
              {notebookWordTiles(handwriting)}
            </div>
          ) : null}

          {(notebookAttempts.length > 0 || handwriting) ? (
            <button
              type="button"
              className="mt-6 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18]"
              onClick={() => goToStep("c_guide")}
            >
              Continue to next step
            </button>
          ) : null}
        </section>
      )}

      {/* c */}
      {step === "c_guide" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">What to do</h2>
          {extracted.main_task_summary_en ? (
            <p className="mt-3 rounded-lg bg-black/25 p-3 text-base font-semibold leading-relaxed">
              {extracted.main_task_summary_en}
            </p>
          ) : null}
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
            onClick={() => goToStep("d_interactive")}
          >
            Continue
          </button>
        </section>
      )}

      {/* d */}
      {step === "d_interactive" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Tap words</h2>
          <p className="mt-2 text-sm text-white/90">
            On a phone: <span className="font-bold text-[#f4d03f]">tap</span> a word to hear it and
            see the English under the box.
          </p>
          <GermanWordBlock extracted={extracted} showSentenceEnglish={false} className="mt-4" />
          <button
            type="button"
            className="mt-6 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18]"
            onClick={() => goToStep("e_read_aloud")}
          >
            Next: listen
          </button>
        </section>
      )}

      {/* e */}
      {step === "e_read_aloud" && extracted && readSents.length > 0 && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Listen</h2>
          <p className="mt-2 text-sm text-white/90">
            Read the whole text below. Pick a sentence, then play — slower is easier.
          </p>
          <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border-2 border-[#2d1f18] bg-[#1a472a] p-3 text-sm leading-relaxed">
            {readSents.map((line, i) => (
              <p
                key={i}
                className={`mb-2 rounded px-2 py-1 ${
                  i === highlightSentence ? "bg-[#f4d03f]/25 ring-2 ring-[#f4d03f]" : ""
                }`}
              >
                <span className="text-white/50">{i + 1}. </span>
                {line}
              </p>
            ))}
          </div>
          <p className="mt-4 rounded-lg bg-black/30 p-3 text-base leading-relaxed">
            <span className="font-bold text-[#f4d03f]">English (this sentence): </span>
            {readTrans[highlightSentence]?.trim() || "— (add translations when scanning next time)"}
          </p>
          <p className="mt-3 text-sm font-bold text-white/80">Speaking speed</p>
          <input
            type="range"
            min={0.55}
            max={1}
            step={0.05}
            value={readAloudSpeed}
            onChange={(e) => setReadAloudSpeed(Number(e.target.value))}
            className="mt-1 w-full"
          />
          <p className="text-xs text-white/60">Slower ← {readAloudSpeed.toFixed(2)} → Faster</p>
          <p className="mt-4 rounded-lg bg-black/20 p-4 text-xl font-semibold leading-relaxed">
            {readSents[highlightSentence]}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              className="rounded-xl border-2 border-white/30 py-3 font-bold"
              onClick={sentenceNavPrev}
              disabled={highlightSentence <= 0}
            >
              ← Previous
            </button>
            <button
              type="button"
              className="rounded-xl border-2 border-white/30 py-3 font-bold"
              onClick={sentenceNavNext}
              disabled={highlightSentence >= readSents.length - 1}
            >
              Next →
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void playCurrentSentenceAloud()}
              className="col-span-2 rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-3 text-lg font-black text-[#2d1f18] disabled:opacity-50 sm:col-span-2"
            >
              {busy || "🔊 Play this sentence"}
            </button>
          </div>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-2 border-white/30 py-3 font-bold"
            onClick={() => goToStep("f_user_read")}
          >
            Next: you read
          </button>
        </section>
      )}

      {/* f */}
      {step === "f_user_read" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">You read</h2>
          <p className="mt-2 text-sm">
            Move sentence by sentence. Tap words to hear them again if a sound is tricky.
          </p>
          {sentencesFromExtracted(extracted).length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-lg border-2 border-white/30 px-4 py-2 font-bold"
                onClick={() => setFSentenceIdx((i) => Math.max(0, i - 1))}
              >
                ← Sentence
              </button>
              <span className="text-sm">
                {fSentenceIdx + 1} / {sentencesFromExtracted(extracted).length}
              </span>
              <button
                type="button"
                className="rounded-lg border-2 border-white/30 px-4 py-2 font-bold"
                onClick={() =>
                  setFSentenceIdx((i) =>
                    Math.min(sentencesFromExtracted(extracted).length - 1, i + 1),
                  )
                }
              >
                Sentence →
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#2d6a4f] py-3 text-lg font-black text-white"
            onClick={() => {
              const s = sentencesFromExtracted(extracted)[fSentenceIdx];
              if (s) void playTts(s, "de", 0.75);
            }}
          >
            🔊 Listen to this sentence (slow)
          </button>
          <GermanWordBlock
            extracted={extracted}
            sentenceIndex={fSentenceIdx}
            showSentenceEnglish
            className="mt-4"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {rtState === "off" ? (
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold"
                onClick={connectRealtime}
              >
                Optional: Grok voice (Realtime)
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg bg-white/10 px-3 py-2 text-sm font-bold"
                onClick={disconnectRealtime}
              >
                Disconnect ({rtState})
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-white/60">
            Voice debug: {voiceEvents.slice(-4).join(", ") || "—"}
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18]"
            onClick={() => goToStep("g_repeat_spelling")}
          >
            Next: practice & spelling
          </button>
        </section>
      )}

      {/* g */}
      {step === "g_repeat_spelling" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Practice & spelling</h2>
          <div className="mt-3 rounded-lg border-2 border-white/20 bg-black/20 p-3 text-sm leading-relaxed">
            <p className="font-bold text-[#f4d03f]">How you felt reading each word (honest is OK!)</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <span className="inline-block h-3 w-3 rounded bg-green-500 align-middle" />{" "}
                <strong>Green</strong> — sounded perfect
              </li>
              <li>
                <span className="inline-block h-3 w-3 rounded bg-blue-600 align-middle" />{" "}
                <strong>Blue</strong> — almost right (small slip)
              </li>
              <li>
                <span className="inline-block h-3 w-3 rounded bg-red-600 align-middle" />{" "}
                <strong>Red</strong> — needs more practice
              </li>
            </ul>
            <p className="mt-2 text-xs text-white/75">
              Then play the spelling game: hear the word, type it in German (capital letters for
              nouns).
            </p>
          </div>
          <p className="mt-4 text-sm">
            Tap a color under each word. When ready, start the spelling game.
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
                      {c === "green" ? "OK" : c === "blue" ? "Almost" : "Hard"}
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
                    onClick={() => void playTts(spellTarget.word, "de", 0.78)}
                  >
                    Hear again (slow)
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
          <h2 className="text-xl font-black">Parent report</h2>
          <pre className="mt-4 overflow-auto rounded-lg bg-black/30 p-4 text-sm leading-relaxed">
            {JSON.stringify(parentReport, null, 2)}
          </pre>
          <button
            type="button"
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 font-black text-[#2d1f18]"
            onClick={() => goToStep("done")}
          >
            Done
          </button>
        </section>
      )}
    </div>
  );
}
