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
      return fetchWordMeaning(w, sentence, meaningMap, cacheRef.current);
    },
    [meaningMap],
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
        <p className="text-lg leading-relaxed text-white">
          {segs.map((seg, i) => (
            <span key={`${sentenceIndex ?? "all"}-${i}-${seg.raw}`}>
              {i > 0 ? " " : null}
              <button
                type="button"
                className="inline cursor-pointer rounded-sm border-0 bg-transparent p-0 font-semibold text-white underline decoration-white/40 decoration-dotted underline-offset-[5px] hover:text-[#f4d03f]"
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
          <div className="mt-3 rounded-xl border-2 border-[#2d1f18] bg-[#1a472a] p-3 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-white/60">Meaning</p>
            <p className="text-lg font-black text-[#f4d03f]">{tapWord ?? "—"}</p>
            <p className="mt-1 text-sm text-white/90">{tapMeaning}</p>
            <p className="mt-2 text-xs text-white/60">Release to hide.</p>
          </div>
        ) : null}

        {showSentenceEnglish && sentenceEn ? (
          <p className="mt-3 rounded-lg bg-black/25 p-3 text-sm leading-relaxed text-white/95">
            <span className="font-bold text-[#f4d03f]">This sentence in English: </span>
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
            className="min-h-[44px] min-w-[44px] rounded-lg border-2 border-white/25 bg-black/15 px-2 py-2 text-xl font-bold transition active:scale-95"
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
        <div className="mt-3 rounded-xl border-2 border-[#2d1f18] bg-[#1a472a] p-3 text-left">
          <p className="text-xs font-bold uppercase tracking-wide text-white/60">Meaning</p>
          <p className="text-lg font-black text-[#f4d03f]">{tapWord ?? "—"}</p>
          <p className="mt-1 text-sm text-white/90">{tapMeaning}</p>
          <p className="mt-2 text-xs text-white/60">Release to hide.</p>
        </div>
      ) : null}

      {showSentenceEnglish && sentenceEn ? (
        <p className="mt-3 rounded-lg bg-black/25 p-3 text-sm leading-relaxed text-white/95">
          <span className="font-bold text-[#f4d03f]">This sentence in English: </span>
          {sentenceEn}
        </p>
      ) : null}
    </div>
  );
}
