#!/usr/bin/env node
/**
 * Batch-generate reward images via xAI Grok Imagine (image edit from reference).
 * Docs: https://docs.x.ai/docs/guides/image-generation (POST /v1/images/edits)
 *
 * Usage:
 *   textXAI_API_KEY=... node scripts/generate-reward-images.mjs
 *
 * Requires: scripts/reward-images/reference.png and scripts/reward-images/prompts.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const REF_PATH = join(__dirname, "reward-images", "reference.png");
const PROMPTS_PATH = join(__dirname, "reward-images", "prompts.json");
const OUT_SUCCESS = join(ROOT, "public", "rewards", "success");
const OUT_FAIL = join(ROOT, "public", "rewards", "fail");
const MANIFEST_PATH = join(ROOT, "src", "lib", "reward-manifest.json");

const MODEL = "grok-imagine-image";
const API = "https://api.x.ai/v1/images/edits";
const DELAY_MS = 2500;
const MAX_RETRIES = 4;

/** Load `.env` then `.env.local` if present (later file wins; no extra deps). */
function loadEnvFiles() {
  for (const name of [".env", ".env.local"]) {
    try {
      const p = join(ROOT, name);
      const raw = readFileSync(p, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    } catch {
      /* missing */
    }
  }
}

function getApiKey() {
  const k = process.env.textXAI_API_KEY || process.env.XAI_API_KEY || "";
  if (!k.trim()) {
    console.error("Set textXAI_API_KEY (or XAI_API_KEY) in .env, .env.local, or the environment.");
    process.exit(1);
  }
  return k.trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extFromMime(mime) {
  if (!mime) return "png";
  const m = String(mime).toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  return "png";
}

async function editImage({ apiKey, referenceDataUrl, prompt, attempt = 0 }) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      image: {
        url: referenceDataUrl,
        type: "image_url",
      },
      response_format: "b64_json",
      aspect_ratio: "1:1",
      quality: "high",
      resolution: "1k",
    }),
  });

  const raw = await res.text();
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const backoff = 5000 * (attempt + 1);
    console.warn(`Rate limited; retrying in ${backoff}ms...`);
    await sleep(backoff);
    return editImage({ apiKey, referenceDataUrl, prompt, attempt: attempt + 1 });
  }
  if (!res.ok) {
    throw new Error(`xAI images/edits ${res.status}: ${raw.slice(0, 800)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from API: ${raw.slice(0, 200)}`);
  }
  const row = parsed?.data?.[0];
  const b64 = row?.b64_json;
  if (!b64) {
    throw new Error(`No b64_json in response: ${raw.slice(0, 400)}`);
  }
  const mime = row?.mime_type || "image/png";
  return { buffer: Buffer.from(b64, "base64"), mime };
}

async function main() {
  loadEnvFiles();
  const apiKey = getApiKey();

  const refBuf = readFileSync(REF_PATH);
  const refB64 = refBuf.toString("base64");
  const referenceDataUrl = `data:image/png;base64,${refB64}`;

  const prompts = JSON.parse(readFileSync(PROMPTS_PATH, "utf8"));
  if (!Array.isArray(prompts) || !prompts.length) {
    console.error("prompts.json must be a non-empty array.");
    process.exit(1);
  }

  mkdirSync(OUT_SUCCESS, { recursive: true });
  mkdirSync(OUT_FAIL, { recursive: true });
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });

  const counters = { success: 0, fail: 0 };
  const manifest = { success: [], fail: [] };

  let i = 0;
  for (const row of prompts) {
    const kind = row.kind === "fail" ? "fail" : "success";
    const prompt = String(row.prompt || "").trim();
    if (!prompt) continue;

    counters[kind] += 1;
    const n = counters[kind];
    const baseName = `${kind}-${String(n).padStart(2, "0")}`;

    const subtitle = row.title ? ` — ${row.title}` : "";
    console.log(`[${++i}/${prompts.length}] ${kind} #${n}${subtitle}…`);
    const { buffer, mime } = await editImage({ apiKey, referenceDataUrl, prompt });
    const ext = extFromMime(mime);
    const rel = `/rewards/${kind}/${baseName}.${ext}`;
    const outPath = join(ROOT, "public", rel.slice(1));
    writeFileSync(outPath, buffer);
    manifest[kind].push(rel);
    console.log(`  saved ${rel}`);

    if (i < prompts.length) await sleep(DELAY_MS);
  }

  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        success: manifest.success,
        fail: manifest.fail,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`Wrote ${MANIFEST_PATH}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
