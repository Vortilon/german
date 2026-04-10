"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function emailFromUsername(u: string) {
  return `${u.trim().toLowerCase()}@german.app`;
}

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const err = sp.get("error");
  const next = sp.get("next") || "/app";

  const [username, setUsername] = useState("elio");
  const [password, setPassword] = useState("elio");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hint = useMemo(() => {
    if (err === "config")
      return "Server needs Supabase keys or ELIO_AUTH_SECRET — ask your admin.";
    return null;
  }, [err]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailFromUsername(username),
          password,
        });
        if (!error) {
          router.replace(next);
          router.refresh();
          return;
        }
      }

      const r = await fetch("/api/auth/elio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) {
        setMsg(data.error ?? "Login failed");
        setBusy(false);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch (e2) {
      setMsg(e2 instanceof Error ? e2.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-stone-300 bg-white p-6 shadow-md">
      <h1 className="text-center text-3xl font-black tracking-wide text-stone-900">
        Elio German
      </h1>
      <p className="mt-2 text-center text-sm text-stone-600">PrankMaster homework quest</p>

      {hint ? (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-stone-800">{hint}</p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-bold text-stone-800">
          Username
          <input
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg text-stone-900"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold text-stone-800">
          Password
          <input
            type="password"
            className="rounded-lg border border-stone-300 bg-white px-4 py-3 text-lg text-stone-900"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {msg ? <p className="text-sm font-semibold text-red-700">{msg}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-xl border border-stone-400 bg-stone-800 py-4 text-xl font-semibold text-white shadow-sm active:translate-y-0.5 disabled:opacity-60"
        >
          {busy ? "Loading…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
