import { NextResponse } from "next/server";
import { getXaiApiKey } from "@/lib/xai";

export const runtime = "nodejs";

/** Server-side Grok TTS — browser never sees API key. */
export async function POST(req: Request) {
  try {
    const { text, language } = (await req.json()) as {
      text?: string;
      language?: string;
    };
    if (!text?.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getXaiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        voice_id: "eve",
        language: language === "de" ? "de" : "en",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `TTS failed: ${res.status}`, detail: err.slice(0, 300) },
        { status: 502 },
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "TTS error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
