"use client";

import { useEffect, useState } from "react";

const PRANKS = [
  "🥚 on a motorbike vrooms past your homework!",
  "🧱 Lego wall built itself — spelling brick added!",
  "⛏️ Creeper says: “Nice try — do one more!”",
  "🎨 Art bot drew a trophy with your name!",
  "🧪 Teacher potion: +10 confidence (cartoon-safe).",
  "🐷 Piggy parachute lands on the correct answer!",
  "🪄 “Eins-zwei-drei” — you still win!",
  "🚀 Rocket launches your streak to the moon!",
];

export function PrankReward({ trigger }: { trigger: number }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!trigger) return;
    setText(PRANKS[Math.floor(Math.random() * PRANKS.length)]!);
    const t = setTimeout(() => setText(null), 4500);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!text) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 max-w-md -translate-x-1/2 animate-bounce rounded-xl border border-stone-300 bg-white px-4 py-3 text-center text-lg font-semibold text-stone-800 shadow-lg">
      {text}
    </div>
  );
}
