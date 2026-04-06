"use client";

import { useCallback, useMemo, useState } from "react";
import type { ExtractedHomework } from "@/lib/homework-types";
import { playTts } from "@/lib/play-tts";
import { sentencesFromExtracted, tokenizeWords } from "@/lib/tokenize";

type Props = {
  extracted: ExtractedHomework;
  /** Optional: only words in this sentence (by index in sentencesFromExtracted). */
  sentenceIndex?: number | null;
  /** Show English for whole sentence under the word row (read-aloud / you-read). */
  showSentenceEnglish?: boolean;
  className?: string;
};

export function GermanWordBlock({
  extracted,
  sentenceIndex,
  showSentenceEnglish,
  className = "",
}: Props) {
  const sentences = useMemo(() => sentencesFromExtracted(extracted), [extracted]);
  const trans = extracted.sentence_translations_en ?? [];

  const { words, sentenceEn } = useMemo(() => {
    if (sentenceIndex != null && sentences[sentenceIndex]) {
      const s = sentences[sentenceIndex]!;
      return {
        words: tokenizeWords(s),
        sentenceEn: trans[sentenceIndex]?.trim() || "",
      };
    }
    return {
      words: tokenizeWords(extracted.full_german_text),
      sentenceEn: "",
    };
  }, [extracted, sentenceIndex, sentences, trans]);

  const meaningMap = useMemo(() => {
    const m = new Map<string, string>();
    extracted.special_words.forEach((x) => m.set(x.de.toLowerCase(), x.en));
    return m;
  }, [extracted.special_words]);

  const [tapWord, setTapWord] = useState<string | null>(null);
  const [tapMeaning, setTapMeaning] = useState<string>("");

  const onWordTap = useCallback(
    async (w: string) => {
      const lower = w.toLowerCase();
      const m = meaningMap.get(lower) || "— (no glossary entry — ask a grown-up)";
      setTapWord(w);
      setTapMeaning(m);
      try {
        await playTts(w, "de", 0.82);
      } catch {
        /* ignore */
      }
    },
    [meaningMap],
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5 leading-relaxed">
        {words.map(({ w, i }) => (
          <button
            key={`${sentenceIndex ?? "all"}-${i}-${w}`}
            type="button"
            className={`min-h-[44px] min-w-[44px] rounded-lg border-2 px-2 py-2 text-xl font-bold transition active:scale-95 ${
              tapWord === w ?
                "border-[#f4d03f] bg-[#f4d03f] text-[#2d1f18]"
              : "border-white/25 bg-black/15 text-white"
            }`}
            onClick={() => void onWordTap(w)}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-[4rem] rounded-xl border-2 border-[#2d1f18] bg-[#1a472a] p-3 text-left">
        <p className="text-xs font-bold uppercase tracking-wide text-white/60">Word you tapped</p>
        <p className="text-lg font-black text-[#f4d03f]">{tapWord ?? "—"}</p>
        <p className="mt-1 text-sm text-white/90">
          <span className="font-bold text-white">English: </span>
          {tapWord ? tapMeaning : "Tap any German word above."}
        </p>
      </div>

      {showSentenceEnglish && sentenceEn ? (
        <p className="mt-3 rounded-lg bg-black/25 p-3 text-sm leading-relaxed text-white/95">
          <span className="font-bold text-[#f4d03f]">This sentence in English: </span>
          {sentenceEn}
        </p>
      ) : null}
    </div>
  );
}
