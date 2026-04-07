import { NextResponse } from "next/server";
import { parseJsonFromModelContent, xaiChatCompletionText } from "@/lib/xai";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { word?: string; sentence?: string };

/** Same family as vision; chat models — try env override first. */
const FALLBACK_DICT_MODELS = [
  "grok-3-mini-fast",
  "grok-3",
  "grok-4-1-fast-non-reasoning",
  "grok-2-1212",
  "grok-beta",
] as const;

function extractEn(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const candidates = ["en", "meaning", "definition", "translation", "english"];
  for (const k of candidates) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const word = String(body.word || "").trim();
    if (!word) return NextResponse.json({ ok: false, error: "word required" }, { status: 400 });

    const ordered = [...FALLBACK_DICT_MODELS];

    let lastErr: Error | null = null;
    let rawJson: unknown = null;

    for (const model of ordered) {
      try {
        const content = await xaiChatCompletionText({
          model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Return ONLY JSON: {"en":"short kid-friendly English gloss of the German word in context"}. One sentence max.',
            },
            {
              role: "user",
              content: `German word: "${word}"\nSentence (context): ${String(body.sentence || "").slice(0, 800)}`,
            },
          ],
        });
        rawJson = parseJsonFromModelContent(content);
        const en = extractEn(rawJson);
        if (en) {
          return NextResponse.json({ ok: true, en, part_of_speech: (rawJson as any)?.part_of_speech });
        }
        lastErr = new Error("Model JSON missing en/meaning");
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        const msg = lastErr.message;
        if (msg.includes("Model not found") || msg.includes("invalid_argument") || msg.includes("does not exist")) {
          continue;
        }
        throw lastErr;
      }
    }

    return NextResponse.json(
      { ok: false, error: lastErr?.message || "No dictionary model succeeded" },
      { status: 500 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dictionary failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
