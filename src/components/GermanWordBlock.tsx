"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ExtractedHomework } from "@/lib/homework-types";
import { playTts } from "@/lib/play-tts";
import { segmentWords, sentencesFromExtracted, tokenizeWords } from "@/lib/tokenize";
import { fetchWordMeaning, makeMeaningCache } from "@/lib/word-meaning-client";

type Props = {
  extracted: ExtractedHomework;
  /** Optional: only words in this sentence (by index in sentencesFromExtracted). */
  sentenceIndex?: number | null;
  /** Show English for whole sentence under the word row (read-aloud / you-read). */
  showSentenceEnglish?: boolean;
  /** "buttons" = large tap tiles; "inline" = flowing text (e.g. You read). */
  layout?: "buttons" | "inline";
  className?: string;
};

export function GermanWordBlock({
  extracted,
  sentenceIndex,
  showSentenceEnglish,
  layout = "buttons",
  className = "",
}: Props) {
  const sentences = useMemo(() => sentencesFromExtracted(extracted), [extracted]);
  const trans = extracted.sentence_translations_en ?? [];

  const { words, sentenceText, sentenceEn } = useMemo(() => {
    if (sentenceIndex != null && sentences[sentenceIndex]) {
      const s = sentences[sentenceIndex]!;
      return {
        words: tokenizeWords(s),
        sentenceText: s,
        sentenceEn: trans[sentenceIndex]?.trim() || "",
      };
    }
    return {
      words: tokenizeWords(extracted.full_german_text),
      sentenceText: extracted.full_german_text,
      sentenceEn: "",
    };
  }, [extracted, sentenceIndex, sentences, trans]);

  const meaningMap = useMemo(() => {
    const m = new Map<string, string>();
    extracted.special_words.forEach((x) => m.set(x.de.toLowerCase(), x.en));
    return m;
  }, [extracted.special_words]);

  const cacheRef = useRef(makeMeaningCache());

  const [tapWord, setTapWord] = useState<string | null>(null);
  const [tapMeaning, setTapMeaning] = useState<string>("");
  const [tapOpen, setTapOpen] = useState(false);
  const holdRef = useRef(false);

  const resolveMeaning = useCallback(
    async (w: string, sentence: string) => {
      return fetchWordMeaning(w, sentence, meaningMap, cacheRef.current, sentenceEn || undefined);
    },
    [meaningMap, sentenceEn],
  );

  const onWordDown = useCallback(
    async (w: string) => {
      const sentence =
        sentenceIndex != null && sentences[sentenceIndex] ? sentences[sentenceIndex]! : "";
      holdRef.current = true;
      try {
        await playTts(w, "de", 0.82);
      } catch {
        /* ignore */
      }
      setTapWord(w);
      setTapOpen(true);
      setTapMeaning("…");
      const m = await resolveMeaning(w, sentence);
      if (holdRef.current) setTapMeaning(m);
    },
    [resolveMeaning, sentenceIndex, sentences],
  );

  const onWordUp = useCallback(() => {
    holdRef.current = false;
    setTapOpen(false);
  }, []);

  const segs = useMemo(() => segmentWords(sentenceText), [sentenceText]);

  if (layout === "inline") {
    return (
      <div className={className}>
        <p className="text-lg leading-relaxed text-stone-900">
          {segs.map((seg, i) => (
            <span key={`${sentenceIndex ?? "all"}-${i}-${seg.raw}`}>
              {i > 0 ? " " : null}
              <button
                type="button"
                className="inline cursor-pointer rounded-sm border-0 bg-transparent p-0 font-semibold text-stone-900 underline decoration-stone-400 decoration-dotted underline-offset-[5px] hover:text-amber-900"
                onPointerDown={() => void onWordDown(seg.w)}
                onPointerUp={onWordUp}
                onPointerCancel={onWordUp}
                onPointerLeave={onWordUp}
              >
                {seg.raw}
              </button>
            </span>
          ))}
        </p>

        {tapOpen ? (
          <div className="mt-3 rounded-xl border border-stone-300 bg-stone-100 p-3 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-stone-600">Meaning</p>
            <p className="text-lg font-black text-amber-900">{tapWord ?? "—"}</p>
            <p className="mt-1 text-sm text-stone-800">{tapMeaning}</p>
            <p className="mt-2 text-xs text-stone-500">Release to hide.</p>
          </div>
        ) : null}

        {showSentenceEnglish && sentenceEn ? (
          <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-800">
            <span className="font-bold text-amber-800">EN: </span>
            {sentenceEn}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 leading-relaxed">
        {words.map(({ w, i }) => (
          <button
            key={`${sentenceIndex ?? "all"}-${i}-${w}`}
            type="button"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-stone-300 bg-stone-100 px-2 py-2 text-xl font-bold text-stone-900 transition active:scale-95"
            onPointerDown={() => void onWordDown(w)}
            onPointerUp={onWordUp}
            onPointerCancel={onWordUp}
            onPointerLeave={onWordUp}
          >
            {w}
          </button>
        ))}
      </div>

      {tapOpen ? (
        <div className="mt-3 rounded-xl border border-stone-300 bg-stone-100 p-3 text-left">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-600">Meaning</p>
          <p className="text-lg font-black text-amber-900">{tapWord ?? "—"}</p>
          <p className="mt-1 text-sm text-stone-800">{tapMeaning}</p>
          <p className="mt-2 text-xs text-stone-500">Release to hide.</p>
        </div>
      ) : null}

      {showSentenceEnglish && sentenceEn ? (
        <p className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-800">
          <span className="font-bold text-amber-800">EN: </span>
          {sentenceEn}
        </p>
      ) : null}
    </div>
  );
}
