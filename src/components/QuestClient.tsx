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
  migrateProgressStep,
  stepIndex,
} from "@/lib/quest-steps";
import { GermanWordBlock } from "@/components/GermanWordBlock";
import { ListenInlineSentence } from "@/components/ListenInlineSentence";
import { fetchWordMeaning, makeMeaningCache } from "@/lib/word-meaning-client";
import { formatSpeechRecognitionError } from "@/lib/speech-rec-errors";
import { playDictationCompleteFanfare, playDictationCorrectChime } from "@/lib/reward-sounds";
import rewardManifest from "@/lib/reward-manifest.json";
import { pickRewardImageUrl } from "@/lib/reward-feedback-images";
import { playTts } from "@/lib/play-tts";
import { fetchHomeworkAssignment, fetchHomeworkWeeksIndex, fetchStudentWeek, upsertStudentWeek } from "@/lib/homework-weekly";
import {
  sentenceEnglishLines,
  sentencesFromExtracted,
  segmentWords,
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
  const currentWeekStart = useMemo(() => getWeekStartIso(), []);
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [weeksIndex, setWeeksIndex] = useState<Array<{ week_start: string; title: string }>>([]);
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

  const [nbFiles, setNbFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rewardTick, setRewardTick] = useState(0);
  const readListRef = useRef<HTMLDivElement>(null);
  const listenMeaningCacheRef = useRef(makeMeaningCache());
  const listenHoldRef = useRef(false);
  const [listenTip, setListenTip] = useState<{ word: string; text: string } | null>(null);

  const glossaryForListen = useMemo(() => {
    const m = new Map<string, string>();
    extracted?.special_words.forEach((x) => m.set(x.de.toLowerCase(), x.en));
    return m;
  }, [extracted?.special_words]);

  // Translation preload lives near `persist` (below) so TS doesn't complain about use-before-declaration.

  const onListenWordDown = useCallback(
    async (word: string, sentence: string) => {
      listenHoldRef.current = true;
      setListenTip({ word, text: "…" });
      try {
        await playTts(word, "de", 0.82);
      } catch {
        /* ignore */
      }
      const text = await fetchWordMeaning(
        word,
        sentence,
        glossaryForListen,
        listenMeaningCacheRef.current,
      );
      if (listenHoldRef.current) setListenTip({ word, text });
    },
    [glossaryForListen],
  );

  const onListenWordUp = useCallback(() => {
    listenHoldRef.current = false;
    setListenTip(null);
  }, []);

  const [highlightSentence, setHighlightSentence] = useState(0);
  const [spellTarget, setSpellTarget] = useState<{ word: string; idx: number } | null>(
    null,
  );
  const [spellInput, setSpellInput] = useState("");
  const [spellStats, setSpellStats] = useState({ correct: 0, total: 0 });
  const [spellingDone, setSpellingDone] = useState(false);

  const startedRef = useRef<number | null>(null);
  const [voiceEvents, setVoiceEvents] = useState<string[]>([]);

  const [draftFullText, setDraftFullText] = useState("");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [draftTitle, setDraftTitle] = useState("Homework");

  const [readAloudSpeed, setReadAloudSpeed] = useState(0.78);
  const [fSentenceIdx, setFSentenceIdx] = useState(0);

  /** Full-passage dictation: random prompts until every word is mastered once. */
  const [dictation, setDictation] = useState<{
    words: string[];
    mastered: boolean[];
    currentIdx: number;
    typed: string;
    /** If true, capitalization can be ignored (sentence-start non-nouns). */
    allowCaseFoldAtIdx: boolean[];
    /** After Check: show image + Next before the next listen/type round. */
    result:
      | null
      | { kind: "correct"; imageUrl: string; isFinal: boolean }
      | { kind: "wrong"; imageUrl: string; expected: string; written: string };
    totalAttempts: number;
    complete: boolean;
    /** False until the current prompt’s TTS has finished (new word after wrong/correct, or session start). */
    readyToType: boolean;
    /** Bumped when a new listen-before-type cycle starts; stale TTS completions do not unlock input. */
    playEpoch: number;
  } | null>(null);
  const dictationPlayEpochRef = useRef(0);
  function bumpDictationPlayEpoch() {
    dictationPlayEpochRef.current += 1;
    return dictationPlayEpochRef.current;
  }
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;
  const dictationInputRef = useRef<HTMLInputElement | null>(null);

  const DICTATION_VIDEO_URL = "https://www.youtube.com/embed/dQw4w9WgXcQ";

  // --- Listening check (Web Speech API)
  const [listenState, setListenState] = useState<
    | { kind: "idle" }
    | { kind: "listening" }
    | { kind: "done"; transcript: string; wordOk: boolean[]; scorePct: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const speechRecRef = useRef<any>(null);

  useEffect(() => {
    if (!extracted) return;
    const n = sentencesFromExtracted(extracted).length;
    if (n <= 0) return;
    setHighlightSentence((h) => Math.min(h, n - 1));
    setFSentenceIdx((i) => Math.min(i, n - 1));
  }, [extracted]);

  useEffect(() => {
    // Reset listening results when sentence changes.
    setListenState({ kind: "idle" });
  }, [fSentenceIdx]);

  useEffect(() => {
    if (progress.step !== "g_dictation" || !extracted) return;
    setDictation((d) => {
      if (d && d.words.length > 0) return d;
      const words = tokenizeWords(extracted.full_german_text).map((x) => x.w);
      if (words.length === 0) return null;
      const currentIdx = Math.floor(Math.random() * words.length);
      const first = words[currentIdx]!;
      const playEpoch = bumpDictationPlayEpoch();
      queueMicrotask(() => {
        void (async () => {
          try {
            await playTts(first, "de", 0.78);
          } catch {
            /* ignore */
          } finally {
            setDictation((prev) =>
              prev && prev.playEpoch === playEpoch ? { ...prev, readyToType: true } : prev,
            );
          }
        })();
      });
      return {
        words,
        mastered: words.map(() => false),
        currentIdx,
        typed: "",
        allowCaseFoldAtIdx: computeDictationCaseFoldFlags(extracted),
        result: null,
        totalAttempts: 0,
        complete: false,
        readyToType: false,
        playEpoch,
      };
    });
  }, [progress.step, extracted]);

  function computeDictationCaseFoldFlags(ex: ExtractedHomework): boolean[] {
    // Determine sentence starts from the *raw* stream (keeps punctuation), then map 1:1 to tokenized words.
    const segs = segmentWords(ex.full_german_text);
    const words = segs.map((s) => s.w);
    const sentenceStartAt: boolean[] = [];
    for (let i = 0; i < segs.length; i++) {
      const prevRaw = segs[i - 1]?.raw ?? "";
      const isStart = i === 0 || /[.!?]$/.test(prevRaw);
      sentenceStartAt.push(isStart);
    }

    // If a word ever appears capitalized mid-sentence, assume noun/proper noun → require capitalization.
    const capMidSentence = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      const w = words[i] || "";
      const lower = w.toLowerCase();
      const isCap = /^[A-ZÄÖÜ]/.test(w);
      if (!sentenceStartAt[i] && isCap) capMidSentence.add(lower);
    }

    // Case folding is allowed only for sentence-start words that are not "noun-likely" by the rule above.
    return words.map((w, i) => {
      const lower = w.toLowerCase();
      const isCap = /^[A-ZÄÖÜ]/.test(w);
      return Boolean(sentenceStartAt[i] && isCap && !capMidSentence.has(lower));
    });
  }

  function pickRandomUnmasteredIndex(mastered: boolean[]): number {
    const pool: number[] = [];
    for (let i = 0; i < mastered.length; i++) {
      if (!mastered[i]) pool.push(i);
    }
    if (!pool.length) return 0;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }

  /** Prefer another unmastered word than `avoidIdx` so we don’t repeat the same prompt back-to-back. */
  function pickRandomUnmasteredAvoiding(mastered: boolean[], avoidIdx: number): number {
    const pool: number[] = [];
    const poolOther: number[] = [];
    for (let i = 0; i < mastered.length; i++) {
      if (!mastered[i]) {
        pool.push(i);
        if (i !== avoidIdx) poolOther.push(i);
      }
    }
    if (!pool.length) return avoidIdx;
    const use = poolOther.length ? poolOther : pool;
    return use[Math.floor(Math.random() * use.length)]!;
  }

  function dictationHint(expected: string, written: string, allowCaseFold: boolean): string {
    const hints: string[] = [];
    if (!allowCaseFold && expected !== written && expected.toLowerCase() === written.toLowerCase()) {
      hints.push("Check capital letters — German nouns start with a capital letter.");
    }
    if (expected.length !== written.length) {
      hints.push(
        expected.length > written.length ?
          "Some letters may be missing."
        : "You may have extra letters.",
      );
    }
    const eU = /[äöüß]/i.test(expected);
    const wU = /[äöüß]/i.test(written);
    if (eU && !wU) hints.push("Check umlauts (ä, ö, ü) and ß.");
    return hints.length ? hints.join(" ") : "Compare letter by letter with the correct word below.";
  }

  async function submitDictation() {
    const d = dictationRef.current;
    if (!d || d.complete || d.result || !d.readyToType) return;
    const gradeIdx = d.currentIdx;
    const expected = d.words[gradeIdx]!;
    const written = d.typed.trim();
    const nW = normalizeDictationWord(written);
    const nE = normalizeDictationWord(expected);
    const ok =
      nW === nE || (d.allowCaseFoldAtIdx[gradeIdx] && nW.toLowerCase() === nE.toLowerCase());

    if (!ok) {
      let imageUrl = "/rewards/fail/fail-01.jpg";
      try {
        imageUrl =
          pickRewardImageUrl("fail", rewardManifest) ?? rewardManifest.fail[0] ?? imageUrl;
      } catch {
        /* sessionStorage etc. */
      }
      setDictation((prev) => {
        if (!prev || prev.complete || prev.result) return prev;
        return {
          ...prev,
          result: { kind: "wrong", imageUrl, expected, written },
          totalAttempts: prev.totalAttempts + 1,
        };
      });
      return;
    }

    try {
      await playDictationCorrectChime();
    } catch {
      /* ignore */
    }

    let imageUrl = "/rewards/success/success-01.jpg";
    try {
      imageUrl =
        pickRewardImageUrl("success", rewardManifest) ??
        rewardManifest.success[0] ??
        imageUrl;
    } catch {
      /* ignore */
    }

    setDictation((prev) => {
      if (!prev || prev.complete || prev.result) return prev;
      if (prev.currentIdx !== gradeIdx) return prev;
      const mastered = [...prev.mastered];
      mastered[gradeIdx] = true;
      const allDone = mastered.every(Boolean);
      return {
        ...prev,
        mastered,
        typed: "",
        result: { kind: "correct", imageUrl, isFinal: allDone },
        totalAttempts: prev.totalAttempts + 1,
      };
    });
  }

  /** After success/fail image: go to next word (TTS) or finish session. */
  async function dictationContinueAfterResult() {
    const d = dictationRef.current;
    if (!d?.result || d.complete) return;

    if (d.result.kind === "wrong") {
      const nextIdx = pickRandomUnmasteredAvoiding(d.mastered, d.currentIdx);
      const nextWord = d.words[nextIdx]!;
      const playEpoch = bumpDictationPlayEpoch();
      setDictation({
        ...d,
        currentIdx: nextIdx,
        result: null,
        typed: "",
        readyToType: false,
        playEpoch,
      });
      try {
        await playTts(nextWord, "de", 0.78);
      } catch {
        /* ignore */
      } finally {
        setDictation((prev) =>
          prev && prev.playEpoch === playEpoch ? { ...prev, readyToType: true } : prev,
        );
      }
      return;
    }

    if (d.result.isFinal) {
      setDictation({
        ...d,
        result: null,
        complete: true,
      });
      try {
        await playDictationCompleteFanfare();
      } catch {
        /* ignore */
      }
      return;
    }

    const nextIdx = pickRandomUnmasteredIndex(d.mastered);
    const nextWord = d.words[nextIdx]!;
    const playEpoch = bumpDictationPlayEpoch();
    setDictation({
      ...d,
      currentIdx: nextIdx,
      result: null,
      typed: "",
      readyToType: false,
      playEpoch,
    });
    try {
      await playTts(nextWord, "de", 0.78);
    } catch {
      /* ignore */
    } finally {
      setDictation((prev) =>
        prev && prev.playEpoch === playEpoch ? { ...prev, readyToType: true } : prev,
      );
    }
  }

  function resetDictationSession() {
    if (!extracted) return;
    const words = tokenizeWords(extracted.full_german_text).map((x) => x.w);
    if (!words.length) {
      setDictation(null);
      return;
    }
    const currentIdx = Math.floor(Math.random() * words.length);
    const first = words[currentIdx]!;
    const playEpoch = bumpDictationPlayEpoch();
    queueMicrotask(() => {
      void (async () => {
        try {
          await playTts(first, "de", 0.78);
        } catch {
          /* ignore */
        } finally {
          setDictation((prev) =>
            prev && prev.playEpoch === playEpoch ? { ...prev, readyToType: true } : prev,
          );
        }
      })();
    });
    setDictation({
      words,
      mastered: words.map(() => false),
      currentIdx,
      typed: "",
      allowCaseFoldAtIdx: computeDictationCaseFoldFlags(extracted),
      result: null,
      totalAttempts: 0,
      complete: false,
      readyToType: false,
      playEpoch,
    });
  }

  useEffect(() => {
    if (progress.step !== "g_dictation") return;
    const d = dictation;
    if (!d) return;
    if (d.complete || d.result) return;
    if (!d.readyToType) return;
    queueMicrotask(() => dictationInputRef.current?.focus());
  }, [progress.step, dictation?.readyToType, dictation?.result, dictation?.complete]);

  /** Typed dictation: same punctuation rules as tokenizeWords; case must match (German nouns). */
  function normalizeDictationWord(w: string) {
    return w.replace(/[.,!?;:«»"„"()]/g, "").replace(/\s+/g, "").trim();
  }

  function normalizeSpokenWord(w: string) {
    return w
      .toLowerCase()
      .replace(/[.,!?;:«»"„"()]/g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function scoreTranscriptAgainstSentence(transcript: string, sentence: string) {
    const expected = tokenizeWords(sentence).map((x) => normalizeSpokenWord(x.w));
    const spoken = tokenizeWords(transcript).map((x) => normalizeSpokenWord(x.w));
    const n = expected.length;
    const wordOk: boolean[] = [];
    for (let i = 0; i < n; i++) {
      const e = expected[i] || "";
      const s = spoken[i] || "";
      wordOk.push(!!e && !!s && e === s);
    }
    const correct = wordOk.filter(Boolean).length;
    const scorePct = n > 0 ? Math.round((correct / n) * 100) : 0;
    return { wordOk, scorePct };
  }

  function stopSpeechRec() {
    try {
      speechRecRef.current?.stop?.();
    } catch {
      /* ignore */
    }
  }

  function startListeningCheck(sentence: string) {
    setErr(null);
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;
    if (!SR) {
      setListenState({
        kind: "error",
        message:
          "Listening check is not supported on this browser. Try Chrome on phone or desktop.",
      });
      return;
    }

    stopSpeechRec();
    const rec = new SR();
    speechRecRef.current = rec;
    rec.lang = "de-DE";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    let finalText = "";
    rec.onresult = (ev: any) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = String(ev.results[i]?.[0]?.transcript || "");
        if (ev.results[i].isFinal) finalText += txt + " ";
        else interim += txt + " ";
      }
      const t = (finalText + interim).trim();
      if (t) {
        const { wordOk, scorePct } = scoreTranscriptAgainstSentence(t, sentence);
        setListenState({ kind: "done", transcript: t, wordOk, scorePct });
      } else {
        setListenState({ kind: "listening" });
      }
    };
    rec.onerror = (e: any) => {
      const code = String(e?.error ?? "");
      if (code === "aborted") {
        setListenState({ kind: "idle" });
        return;
      }
      setListenState({
        kind: "error",
        message: formatSpeechRecognitionError(code),
      });
    };
    rec.onend = () => {
      setListenState((s) => (s.kind === "listening" ? { kind: "idle" } : s));
    };

    setListenState({ kind: "listening" });
    try {
      rec.start();
    } catch (e) {
      setListenState({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not start microphone",
      });
    }
  }

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
      await upsertStudentWeek(supabase, {
        user_id: user.id,
        week_start: weekStart,
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

  // Preload free translations once per homework (sentence + words), then persist into `extracted`.
  useEffect(() => {
    if (!extracted) return;
    if (useLocal) return;
    const hasSentenceEn = (extracted.sentence_translations_en || []).some((x) => (x || "").trim());
    const hasWordEn = (extracted.special_words || []).some((x) => (x.en || "").trim());
    if (hasSentenceEn && hasWordEn) return;

    let cancelled = false;
    void (async () => {
      try {
        const sentences = sentencesFromExtracted(extracted);
        const uniq = Array.from(
          new Set(tokenizeWords(extracted.full_german_text).map((t) => t.w.toLowerCase())),
        ).slice(0, 140);

        async function translate(text: string) {
          const k = `mm:de|en:${text}`;
          try {
            const hit = sessionStorage.getItem(k);
            if (hit) return hit;
          } catch {
            /* ignore */
          }
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, source: "de", target: "en" }),
          });
          const json = (await res.json()) as { ok?: boolean; text?: string };
          const out = res.ok && json.ok && json.text ? String(json.text) : "";
          try {
            if (out) sessionStorage.setItem(k, out);
          } catch {
            /* ignore */
          }
          return out;
        }

        async function runLimited<T>(
          items: T[],
          worker: (item: T, idx: number) => Promise<void>,
          concurrency = 4,
        ) {
          const q = items.map((it, idx) => ({ it, idx }));
          const runners = Array.from({ length: Math.min(concurrency, q.length) }, async () => {
            while (q.length) {
              const row = q.shift();
              if (!row) break;
              await worker(row.it, row.idx);
            }
          });
          await Promise.all(runners);
        }

        const sentenceEn: string[] = Array(sentences.length).fill("");
        await runLimited(sentences, async (s, idx) => {
          const out = await translate(s);
          if (out) sentenceEn[idx] = out;
        });

        const wordPairs: Array<{ de: string; en: string }> = [];
        await runLimited(uniq, async (lower) => {
          const out = await translate(lower);
          if (out) wordPairs.push({ de: lower, en: out });
        });

        if (cancelled) return;
        const nextEx: ExtractedHomework = {
          ...extracted,
          sentence_translations_en: sentenceEn,
          special_words: wordPairs.length ? wordPairs : extracted.special_words,
        };
        setExtracted(nextEx);
        void persist({ extracted: nextEx });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [extracted, useLocal, persist]);

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
              const migratedStep = migrateProgressStep(String(bp.step));
              const maxIdx = QUEST_STEP_ORDER.length - 1;
              setProgress({
                ...bp,
                step: migratedStep,
                furthest_index: Math.min(
                  inferFurthestIndex(migratedStep, bp.furthest_index),
                  maxIdx,
                ),
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
        const [idx, assignment, student] = await Promise.all([
          fetchHomeworkWeeksIndex(supabase),
          fetchHomeworkAssignment(supabase, weekStart),
          fetchStudentWeek(supabase, user.id, weekStart),
        ]);
        setWeeksIndex(idx.map((x) => ({ week_start: x.week_start, title: x.title })));
        if (assignment?.extracted) setExtracted(assignment.extracted);
        if (student?.progress) {
          const rp = student.progress as HomeworkProgress;
          const migratedStep = migrateProgressStep(String(rp.step));
          const maxIdx = QUEST_STEP_ORDER.length - 1;
          setProgress({
            ...rp,
            step: migratedStep,
            furthest_index: Math.min(
              inferFurthestIndex(migratedStep, rp.furthest_index),
              maxIdx,
            ),
          });
        }
        if (student?.handwriting) setHandwriting(student.handwriting);
        if (student?.parent_report) setParentReport(student.parent_report as ParentReport);
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

  function saveManualHomeworkAndContinue() {
    const full = draftFullText.trim();
    if (!full) {
      setErr("Please type the German homework text first.");
      return;
    }
    const lines = full
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);
    const instructions = draftInstructions
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const next: ExtractedHomework = {
      title: draftTitle.trim() || "Homework",
      full_german_text: full,
      lines: lines.length > 0 ? lines : [full],
      sentence_translations_en: [],
      instructions: instructions.length > 0 ? instructions : ["Copy the text into your notebook."],
      main_task_summary_en: "Copy the text neatly, then practice reading it aloud.",
      special_words: [],
    };

    setExtracted(next);
    void persist({ extracted: next });
    setErr(null);
    goToStep("b_notebook");
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
    setErr(null);
    try {
      await playTts(s, "de", readAloudSpeed);
    } catch (e) {
      const msg =
        e instanceof Error && /play|not allowed|user gesture/i.test(e.message) ?
          "Tap Play again — the browser blocked sound until you interact."
        : e instanceof Error ? e.message
        : "Could not play audio";
      setErr(msg);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const el = readListRef.current;
    if (!el) return;
    const target = el.querySelector(`[data-sent-idx="${highlightSentence}"]`) as HTMLElement | null;
    if (target) target.scrollIntoView({ block: "nearest" });
  }, [highlightSentence]);

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

        {!useLocal && weeksIndex.length > 0 ? (
          <div className="mt-3">
            <label className="text-xs font-bold text-white/70">Week</label>
            <select
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="mt-1 w-full rounded-lg border-2 border-[#2d1f18] bg-white/10 px-3 py-2 text-sm font-bold text-white"
            >
              {weeksIndex.map((w) => (
                <option key={w.week_start} value={w.week_start}>
                  {w.week_start} — {w.title}
                </option>
              ))}
              {/* Ensure current week is reachable even before an assignment exists */}
              {!weeksIndex.some((w) => w.week_start === currentWeekStart) ? (
                <option value={currentWeekStart}>{currentWeekStart} — (no homework yet)</option>
              ) : null}
            </select>
          </div>
        ) : null}

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
          <p className="font-bold">Type your homework text first.</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-[#f4d03f] px-4 py-2 font-black text-[#2d1f18]"
            onClick={() => navigateToStep("a_upload")}
          >
            Go to homework text
          </button>
        </div>
      ) : null}

      {/* a — manual homework text (no photo scanning) */}
      {step === "a_upload" ? (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Type the homework text</h2>

          <label className="mt-4 block text-sm font-bold text-white/90">Title (optional)</label>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="mt-2 w-full rounded-xl border-4 border-[#2d1f18] bg-white p-3 text-base font-bold text-black"
            autoComplete="off"
          />

          <label className="mt-4 block text-sm font-bold text-white/90">German text to copy</label>
          <textarea
            value={draftFullText}
            onChange={(e) => setDraftFullText(e.target.value)}
            rows={10}
            className="mt-2 w-full rounded-xl border-4 border-[#2d1f18] bg-white p-3 font-mono text-base text-black"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />

          <label className="mt-4 block text-sm font-bold text-white/90">
            Instructions (optional, one per line)
          </label>
          <textarea
            value={draftInstructions}
            onChange={(e) => setDraftInstructions(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border-4 border-[#2d1f18] bg-white p-3 text-base text-black"
            autoComplete="off"
            autoCorrect="on"
            spellCheck={true}
          />

          <button
            type="button"
            disabled={!!busy}
            onClick={saveManualHomeworkAndContinue}
            className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18] disabled:opacity-50"
          >
            {busy || "Save & go to notebook"}
          </button>
        </section>
      ) : null}

      {/* b */}
      {step === "b_notebook" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Notebook copy</h2>
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
          <h2 className="text-xl font-black">Task</h2>
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
            onClick={() => goToStep("e_read_aloud")}
          >
            Continue
          </button>
        </section>
      )}

      {/* e */}
      {step === "e_read_aloud" && extracted && readSents.length > 0 && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Listen</h2>
          <div
            ref={readListRef}
            className="mt-3 max-h-[min(28rem,55vh)] overflow-y-auto rounded-xl border-2 border-[#2d1f18] bg-[#1a472a] p-2 text-sm leading-relaxed"
          >
            {readSents.map((line, i) => (
              <div
                key={i}
                data-sent-idx={i}
                role="presentation"
                onClick={() => setHighlightSentence(i)}
                className={`mb-2 w-full cursor-pointer rounded-lg px-2 py-2 text-left transition ${
                  i === highlightSentence ?
                    "bg-[#f4d03f]/25 ring-2 ring-[#f4d03f]"
                  : "hover:bg-white/5"
                }`}
              >
                <span className="mr-1 align-top font-bold text-white/50">{i + 1}.</span>
                <ListenInlineSentence
                  sentence={line}
                  onWordPointerDown={(lemma) => void onListenWordDown(lemma, line)}
                  onWordPointerUp={onListenWordUp}
                />
              </div>
            ))}
          </div>

          {listenTip ? (
            <div className="mt-3 rounded-xl border-2 border-[#2d1f18] bg-[#1a472a] p-3 text-left shadow-lg">
              <p className="text-xs font-bold uppercase tracking-wide text-white/60">Meaning</p>
              <p className="text-lg font-black text-[#f4d03f]">{listenTip.word}</p>
              <p className="mt-1 text-sm text-white/95">{listenTip.text}</p>
            </div>
          ) : null}

          <p className="mt-4 rounded-lg bg-black/30 p-3 text-base leading-relaxed">
            <span className="font-bold text-[#f4d03f]">EN: </span>
            {readTrans[highlightSentence]?.trim() || "—"}
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

          <div className="mt-4 rounded-xl border-2 border-white/20 bg-black/20 p-3">
            <p className="text-sm font-bold text-[#f4d03f]">Listening check (microphone)</p>
            <p className="mt-1 text-xs text-white/80">Allow the mic when asked.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {listenState.kind !== "listening" ? (
                <button
                  type="button"
                  className="flex-1 rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-3 text-base font-black text-[#2d1f18]"
                  onClick={() => {
                    const s = sentencesFromExtracted(extracted)[fSentenceIdx] || "";
                    if (s) startListeningCheck(s);
                  }}
                >
                  🎙️ Start listening check
                </button>
              ) : (
                <button
                  type="button"
                  className="flex-1 rounded-xl border-4 border-red-300 bg-red-900/30 py-3 text-base font-black text-white"
                  onClick={stopSpeechRec}
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                className="flex-1 rounded-xl border-2 border-white/30 py-3 text-base font-bold"
                onClick={() => setListenState({ kind: "idle" })}
              >
                Clear
              </button>
            </div>

            {listenState.kind === "listening" ? (
              <p className="mt-3 rounded-lg bg-[#f4d03f]/15 p-3 text-sm font-bold">
                Listening…
              </p>
            ) : null}
            {listenState.kind === "error" ? (
              <p className="mt-3 rounded-lg bg-red-900/30 p-3 text-sm">{listenState.message}</p>
            ) : null}
            {listenState.kind === "done" ? (
              <div className="mt-3 rounded-lg bg-black/30 p-3">
                <p className="text-sm font-bold">
                  Score: <span className="text-[#f4d03f]">{listenState.scorePct}%</span>
                </p>
                <p className="mt-2 text-xs font-bold uppercase tracking-wide text-white/70">
                  What we heard
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{listenState.transcript}</p>
              </div>
            ) : null}
          </div>

          {/* Sentence display with per-word highlights when we have a result */}
          {(() => {
            const s = sentencesFromExtracted(extracted)[fSentenceIdx] || "";
            const toks = tokenizeWords(s);
            if (!s) return null;
            const isActive = listenState.kind === "listening";
            const hasResult = listenState.kind === "done";
            return (
              <div
                className={`mt-4 rounded-xl border-4 p-4 text-xl font-semibold leading-relaxed ${
                  isActive ? "border-[#f4d03f] bg-[#f4d03f]/10" : "border-white/20 bg-black/10"
                }`}
              >
                {toks.map(({ w, i }) => {
                  const ok = hasResult ? Boolean((listenState as any).wordOk?.[i]) : null;
                  return (
                    <span
                      key={`ls-${i}-${w}`}
                      className={`mr-1 inline-block rounded px-1.5 py-0.5 ${
                        ok === null ? ""
                        : ok ? "bg-green-600/40 ring-2 ring-green-400"
                        : "bg-red-700/40 ring-2 ring-red-400"
                      }`}
                    >
                      {w}
                    </span>
                  );
                })}
              </div>
            );
          })()}

          <GermanWordBlock
            extracted={extracted}
            sentenceIndex={fSentenceIdx}
            showSentenceEnglish
            layout="inline"
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
            onClick={() => goToStep("g_dictation")}
          >
            Next: dictation
          </button>
        </section>
      )}

      {/* g — dictation */}
      {step === "g_dictation" && extracted && (
        <section className="rounded-2xl border-4 border-[#5c4033] bg-[#40916c] p-4">
          <h2 className="text-xl font-black">Dictation</h2>

          {dictation && dictation.words.length > 0 ? (
            <div className="mt-4 space-y-4">
              {(() => {
                const d = dictation;
                const target = d.words[d.currentIdx] || "";
                const masteredCount = d.mastered.filter(Boolean).length;
                const totalW = d.words.length;
                const pct = totalW ? Math.round((masteredCount / totalW) * 100) : 0;
                return (
                  <>
                    <div className="rounded-xl border-2 border-white/25 bg-black/20 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
                        <span>
                          Progress: {masteredCount} / {totalW} words ({pct}%)
                        </span>
                        <span className="text-white/70">Attempts: {d.totalAttempts}</span>
                      </div>
                      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-black/30">
                        <div
                          className="h-full rounded-full bg-[#f4d03f] transition-[width] duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {d.complete ? (
                      <div className="rounded-xl border-4 border-[#f4d03f] bg-[#1a472a] p-4 text-center">
                        <p className="text-xl font-black text-[#f4d03f]">100% — all words correct!</p>
                        <div className="mt-4 aspect-video w-full overflow-hidden rounded-lg">
                          <iframe
                            className="h-full w-full"
                            src={DICTATION_VIDEO_URL}
                            title="Reward"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      </div>
                    ) : d.result ? (
                      <div className="rounded-xl border-2 border-white/25 bg-black/25 p-4 text-center">
                        <img
                          src={d.result.imageUrl}
                          alt=""
                          className="mx-auto max-h-[min(40vh,280px)] w-auto rounded-lg object-contain shadow-lg"
                        />
                        {d.result.kind === "wrong" ? (
                          <div className="mt-4 rounded-lg border border-red-400/40 bg-red-900/25 p-3 text-left text-sm">
                            <p className="font-black text-lg">Not quite</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-lg bg-black/25 p-2">
                                <p className="text-xs font-bold uppercase text-white/60">You wrote</p>
                                <p className="text-lg font-bold text-white">
                                  {d.result.written ? `"${d.result.written}"` : "(empty)"}
                                </p>
                              </div>
                              <div className="rounded-lg bg-black/25 p-2">
                                <p className="text-xs font-bold uppercase text-[#f4d03f]">Correct</p>
                                <p className="text-lg font-bold text-[#f4d03f]">{d.result.expected}</p>
                              </div>
                            </div>
                            <p className="mt-3 text-sm text-white/90">
                              {dictationHint(
                                d.result.expected,
                                d.result.written,
                                Boolean(d.allowCaseFoldAtIdx[d.currentIdx]),
                              )}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-3 text-lg font-bold text-[#f4d03f]">
                            {d.result.isFinal ? "You finished every word!" : "Correct!"}
                          </p>
                        )}
                        <button
                          type="button"
                          className="mt-4 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-3 font-black text-[#2d1f18]"
                          onClick={() => void dictationContinueAfterResult()}
                        >
                          {d.result.kind === "correct" && d.result.isFinal ?
                            "Continue"
                          : "Next"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="w-full rounded-xl border-2 border-white/35 bg-white/10 py-2.5 text-sm font-bold"
                          onClick={() => {
                            void (async () => {
                              try {
                                await playTts(target, "de", 0.78);
                              } catch {
                                /* ignore */
                              } finally {
                                dictationInputRef.current?.focus();
                              }
                            })();
                          }}
                          disabled={!target || !d.readyToType}
                        >
                          🔊 Hear again (slow)
                        </button>

                        <input
                          ref={dictationInputRef}
                          value={d.typed}
                          onChange={(e) =>
                            setDictation((prev) => (prev ? { ...prev, typed: e.target.value } : prev))
                          }
                          placeholder={d.readyToType ? "Type the word…" : "Listen…"}
                          className="w-full rounded-xl border-4 border-[#2d1f18] p-4 text-2xl font-bold text-black disabled:opacity-60"
                          autoCapitalize="off"
                          autoCorrect="off"
                          disabled={!d.readyToType}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void submitDictation();
                            }
                          }}
                        />

                        <button
                          type="button"
                          className="w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-3 font-black text-[#2d1f18] disabled:opacity-50"
                          onClick={() => void submitDictation()}
                          disabled={!target || !d.readyToType}
                        >
                          Check
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      className="w-full rounded-lg border-2 border-white/30 py-2 text-sm font-bold"
                      onClick={resetDictationSession}
                    >
                      Start dictation over
                    </button>
                  </>
                );
              })()}
            </div>
          ) : null}

          <button
            type="button"
            disabled={!dictation?.complete}
            className="mt-6 w-full rounded-xl border-4 border-[#2d1f18] bg-[#f4d03f] py-4 text-xl font-black text-[#2d1f18] disabled:cursor-not-allowed disabled:opacity-45"
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
          <p className="mt-3 text-xs text-white/75">
            <span className="inline-block h-2 w-2 rounded bg-green-500 align-middle" /> OK ·{" "}
            <span className="inline-block h-2 w-2 rounded bg-blue-600 align-middle" /> Almost ·{" "}
            <span className="inline-block h-2 w-2 rounded bg-red-600 align-middle" /> Hard — then spelling.
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
