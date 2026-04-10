"use client";

import { useMemo, useState } from "react";
import type { ExtractedHomework } from "@/lib/homework-types";

function buildExtracted(title: string, full: string, instructionsRaw: string): ExtractedHomework {
  const lines = full
    .trim()
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const instructions = instructionsRaw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    title: title.trim() || "Homework",
    full_german_text: full.trim(),
    lines: lines.length ? lines : [full.trim()],
    sentence_translations_en: [],
    instructions: instructions.length ? instructions : ["Copy the text into your notebook."],
    main_task_summary_en: "",
    special_words: [],
  };
}

export function AdminHomeworkWeekClient({ defaultWeekStart }: { defaultWeekStart: string }) {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [title, setTitle] = useState("Homework");
  const [full, setFull] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const extracted = useMemo(() => buildExtracted(title, full, instructions), [title, full, instructions]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/homework-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: weekStart, extracted }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-6 text-stone-800">
      <h1 className="text-2xl font-black">Admin</h1>
      <p className="mt-2 text-sm text-stone-600">
        Set `ADMIN_EMAILS` (comma-separated) on the server to enable this page.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-stone-300 bg-stone-100 p-4 shadow-sm">
        <label className="block text-sm font-bold text-stone-800">Week start (YYYY-MM-DD)</label>
        <input
          value={weekStart}
          onChange={(e) => setWeekStart(e.target.value)}
          className="mt-2 w-full rounded-xl border border-stone-400 bg-white p-3 text-base font-bold text-stone-900"
          autoComplete="off"
          inputMode="numeric"
        />

        <label className="block text-sm font-bold text-stone-800">Name</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-2 w-full rounded-xl border border-stone-400 bg-white p-3 text-base font-bold text-stone-900"
          autoComplete="off"
        />

        <label className="block text-sm font-bold text-stone-800">German text</label>
        <textarea
          value={full}
          onChange={(e) => setFull(e.target.value)}
          rows={10}
          className="mt-2 w-full rounded-xl border border-stone-400 bg-white p-3 font-mono text-base text-stone-900"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />

        <label className="block text-sm font-bold text-stone-800">Instructions (optional, one per line)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-xl border border-stone-400 bg-white p-3 text-base text-stone-900"
          autoComplete="off"
        />

        <button
          type="button"
          disabled={busy || !full.trim()}
          onClick={() => void save()}
          className="w-full rounded-xl border border-stone-400 bg-stone-800 py-4 text-xl font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save homework for this week"}
        </button>

        {msg ? <p className="text-sm text-stone-700">{msg}</p> : null}
      </div>
    </div>
  );
}

