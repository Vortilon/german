import { env } from "@/lib/env";
import { xaiChatCompletionText } from "@/lib/xai";

const FALLBACK_VISION_MODELS = [
  "grok-4-1-fast-non-reasoning",
  "grok-4-1-fast-reasoning",
  "grok-2-vision-1212",
] as const;

/**
 * xAI model IDs change by account/region. Try env first, then known multimodal models.
 */
export async function xaiVisionCompletionText(params: {
  messages: unknown[];
  temperature?: number;
}): Promise<{ text: string; model: string }> {
  const preferred = env.XAI_VISION_MODEL?.trim();
  const ordered = preferred ?
      [preferred, ...FALLBACK_VISION_MODELS.filter((m) => m !== preferred)]
    : [...FALLBACK_VISION_MODELS];

  const tried: string[] = [];
  let lastErr: Error | null = null;

  for (const model of ordered) {
    if (tried.includes(model)) continue;
    tried.push(model);
    try {
      const text = await xaiChatCompletionText({
        model,
        temperature: params.temperature ?? 0.2,
        messages: params.messages,
      });
      return { text, model };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message;
      if (msg.includes("Model not found") || msg.includes("invalid_argument")) {
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ?? new Error("No vision model succeeded");
}

/** Build data URL; iPhone photos are often PNG. */
export function base64ToImageDataUrl(b64: string, mime: "image/png" | "image/jpeg" = "image/png"): string {
  const clean = b64.replace(/^data:image\/\w+;base64,/, "");
  return `data:${mime};base64,${clean}`;
}
