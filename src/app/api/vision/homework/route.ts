import { NextResponse } from "next/server";
import { parseJsonFromModelContent } from "@/lib/xai";
import { base64ToImageDataUrl, xaiVisionCompletionText } from "@/lib/xai-vision";
import {
  VISION_HOMEWORK_EXTRACTION,
} from "@/lib/prompts";
import type { ExtractedHomework } from "@/lib/homework-types";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = { images_base64: string[] };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.images_base64?.length) {
      return NextResponse.json({ error: "images_base64 required" }, { status: 400 });
    }

    const content: unknown[] = [
      { type: "text", text: VISION_HOMEWORK_EXTRACTION },
      ...body.images_base64.slice(0, 8).map((b64) => ({
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
    const data = parseJsonFromModelContent(text) as ExtractedHomework;

    return NextResponse.json({ ok: true, extracted: data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Vision failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
