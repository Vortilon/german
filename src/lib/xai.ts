import { env } from "@/lib/env";

const XAI_BASE = "https://api.x.ai/v1";

export function getXaiApiKey(): string {
  const key = env.XAI_API_KEY;
  if (!key) throw new Error("Missing textXAI_API_KEY");
  return key;
}

export function parseJsonFromModelContent(content: string): unknown {
  const trimmed = content.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

export async function xaiChatCompletionText(body: {
  model: string;
  messages: unknown[];
  temperature?: number;
  response_format?: { type: "json_object" };
}): Promise<string> {
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getXaiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`xAI chat error ${res.status}: ${raw.slice(0, 500)}`);
  }
  const parsed = JSON.parse(raw) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error("xAI returned empty content");
  return content;
}

export async function xaiChatCompletionJson<T>(body: {
  model: string;
  messages: unknown[];
  temperature?: number;
}): Promise<T> {
  const content = await xaiChatCompletionText({
    ...body,
    response_format: { type: "json_object" },
  });
  return parseJsonFromModelContent(content) as T;
}
