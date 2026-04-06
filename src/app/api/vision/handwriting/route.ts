import { NextResponse } from "next/server";
import { parseJsonFromModelContent } from "@/lib/xai";
import { base64ToImageDataUrl, xaiVisionCompletionText } from "@/lib/xai-vision";
import { VISION_NOTEBOOK_WORDS } from "@/lib/prompts";
import type { HandwritingResult, HandwritingWordCheck } from "@/lib/homework-types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = { images_base64: string[]; expected_german_text?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.images_base64?.length) {
      return NextResponse.json({ error: "images_base64 required" }, { status: 400 });
    }

    const expected = body.expected_german_text?.trim() || "(not provided)";
    const prompt = VISION_NOTEBOOK_WORDS.replace("{{EXPECTED}}", expected);

    const content: unknown[] = [
      { type: "text", text: prompt },
      ...body.images_base64.slice(0, 2).map((b64) => ({
        type: "image_url" as const,
        image_url: {
          url: base64ToImageDataUrl(b64, "image/png"),
        },
      })),
    ];

    const { text } = await xaiVisionCompletionText({
      temperature: 0.2,
      messages: [{ role: "user", content }],
    });
    const raw = parseJsonFromModelContent(text) as Record<string, unknown>;

    const word_checks: HandwritingWordCheck[] = Array.isArray(raw.word_checks)
      ? (raw.word_checks as Array<Record<string, unknown>>).map((w) => ({
          word_index: Number(w.word_index ?? w.i ?? 0),
          word_expected: String(w.word_expected ?? ""),
          word_seen: String(w.word_seen ?? ""),
          ok: Boolean(w.ok),
          hint_en: String(w.hint_en ?? ""),
        }))
      : [];

    const data: HandwritingResult = {
      is_acceptable: Boolean(raw.is_acceptable),
      summary: String(raw.summary ?? ""),
      recognized_text: String(raw.recognized_text ?? ""),
      word_checks,
      fixes: [],
    };

    return NextResponse.json({ ok: true, handwriting: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Handwriting vision failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
