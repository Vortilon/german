import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

type Body = { text?: string; source?: string; target?: string };

const mem = new Map<string, { at: number; out: string }>();
const TTL_MS = 1000 * 60 * 60 * 24; // 24h

function cacheGet(key: string): string | null {
  const v = mem.get(key);
  if (!v) return null;
  if (Date.now() - v.at > TTL_MS) {
    mem.delete(key);
    return null;
  }
  return v.out;
}

function cacheSet(key: string, out: string) {
  mem.set(key, { at: Date.now(), out });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const text = String(body.text || "").trim();
    const source = String(body.source || "de").toLowerCase();
    const target = String(body.target || "en").toLowerCase();
    if (!text) return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
    if (!/^[a-z]{2}$/.test(source) || !/^[a-z]{2}$/.test(target)) {
      return NextResponse.json({ ok: false, error: "invalid language code" }, { status: 400 });
    }

    const key = `${source}|${target}|${text}`;
    const hit = cacheGet(key);
    if (hit) return NextResponse.json({ ok: true, text: hit });

    // MyMemory: free, no API key. (Public service; best-effort.)
    const url =
      "https://api.mymemory.translated.net/get" +
      `?q=${encodeURIComponent(text)}` +
      `&langpair=${encodeURIComponent(`${source}|${target}`)}`;
    const res = await fetch(url, { method: "GET" });
    const raw = await res.text();
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `translate failed: HTTP ${res.status}` }, { status: 502 });
    }
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ ok: false, error: "translate failed: bad json" }, { status: 502 });
    }
    const out = String(json?.responseData?.translatedText || "").trim();
    if (!out) {
      return NextResponse.json({ ok: false, error: "translate failed: empty" }, { status: 502 });
    }
    cacheSet(key, out);
    return NextResponse.json({ ok: true, text: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "translate failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

