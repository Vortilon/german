import { NextResponse } from "next/server";
import { xaiChatCompletionJson } from "@/lib/xai";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { word?: string; sentence?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const word = String(body.word || "").trim();
    if (!word) return NextResponse.json({ ok: false, error: "word required" }, { status: 400 });

    const data = await xaiChatCompletionJson<{
      en: string;
      part_of_speech?: string;
      short_note?: string;
    }>({
      model: "grok-2",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a German→English kids dictionary. Return only JSON with a short, kid-friendly English meaning.",
        },
        {
          role: "user",
          content: JSON.stringify({
            word,
            sentence: body.sentence || "",
            format:
              '{ "en": "English meaning", "part_of_speech": "noun/verb/etc (optional)", "short_note": "very short usage note (optional)" }',
          }),
        },
      ],
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Dictionary failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

