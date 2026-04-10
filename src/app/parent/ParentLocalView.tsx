"use client";

import { useEffect, useState } from "react";
import type { ParentReport } from "@/lib/homework-types";
import { getWeekStartIso } from "@/lib/week";

function storageKey(userId: string, week: string) {
  return `elio_german_homework_${userId}_${week}`;
}

export function ParentLocalView({ userId }: { userId: string }) {
  const [report, setReport] = useState<ParentReport | null>(null);

  useEffect(() => {
    const week = getWeekStartIso();
    try {
      const raw = localStorage.getItem(storageKey(userId, week));
      if (raw) {
        const bundle = JSON.parse(raw) as { parent_report?: ParentReport | null };
        setReport(bundle.parent_report ?? null);
      }
    } catch {
      /* ignore */
    }
  }, [userId]);

  return (
    <div className="rounded-2xl border border-stone-300 bg-white p-4 shadow-sm">
      <h2 className="text-xl font-black">Latest report</h2>
      <p className="mt-2 text-xs text-stone-500">
        Saved in this browser (add Supabase on the server for cloud sync).
      </p>
      {!report ? (
        <p className="mt-3 text-sm text-stone-700">
          No report yet — finish step (h) on the quest screen.
        </p>
      ) : (
        <pre className="mt-4 overflow-auto rounded-lg bg-stone-100 p-4 text-sm leading-relaxed text-stone-800">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}
