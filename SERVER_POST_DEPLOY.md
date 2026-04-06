# After first deploy on the VPS

The app is served at **https://german.noteify.us** from `/opt/prankmaster-german/` (Docker + Nginx).

## Login without Supabase (default for quick testing)

Set **`ELIO_AUTH_SECRET`** (min 16 characters; e.g. `openssl rand -hex 32`) in `/opt/prankmaster-german/.env`, then:

```bash
cd /opt/prankmaster-german
docker compose up -d --build
```

Use **`elio` / `elio`** on the login screen. Homework is stored in **this browser** (localStorage) until you add Supabase.

## Optional: Supabase (cloud sync + same login across devices)

1. Create a Supabase project.
2. Run `supabase/migrations/001_init.sql` in the Supabase SQL editor.
3. Create user **email:** `elio@german.app` **password:** `elio`.
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env`, then `docker compose up -d --build`.

## Realtime voice WebSocket

`NEXT_PUBLIC_REALTIME_WS_URL=wss://german.noteify.us/realtime` should be set. The `realtime` container proxies to xAI (`server/realtime-proxy.mjs`).

## Do not disturb other apps

German uses **127.0.0.1:8095** (web) and **127.0.0.1:8096** (realtime) only. Existing stacks (actracker, mpd, schicchi, etc.) use other ports and are unchanged.
