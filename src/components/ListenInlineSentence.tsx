"use client";

import { useMemo } from "react";
import { segmentWords } from "@/lib/tokenize";

type Props = {
  sentence: string;
  /** Called with dictionary form of the word (punctuation stripped). */
  onWordPointerDown: (lemma: string) => void;
  onWordPointerUp: () => void;
};

/**
 * Flowing sentence text with tappable words (inline — no second word row).
 */
export function ListenInlineSentence({ sentence, onWordPointerDown, onWordPointerUp }: Props) {
  const segs = useMemo(() => segmentWords(sentence), [sentence]);
  return (
    <span className="text-[15px] leading-relaxed text-white sm:text-base">
      {segs.map((seg, i) => (
        <span key={`${i}-${seg.raw}`}>
          {i > 0 ? " " : null}
          <button
            type="button"
            className="inline cursor-pointer rounded-sm border-0 bg-transparent p-0 font-semibold text-white underline decoration-white/40 decoration-dotted underline-offset-[5px] hover:text-[#f4d03f] hover:decoration-[#f4d03f] active:opacity-90"
            onPointerDown={(e) => {
              e.stopPropagation();
              onWordPointerDown(seg.w);
            }}
            onPointerUp={onWordPointerUp}
            onPointerCancel={onWordPointerUp}
            onPointerLeave={onWordPointerUp}
          >
            {seg.raw}
          </button>
        </span>
      ))}
    </span>
  );
}
