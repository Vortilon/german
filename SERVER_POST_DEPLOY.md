# After first deploy on the VPS

The app is served at **https://german.noteify.us** from `/opt/prankmaster-german/` (Docker + Nginx).

## Required: Supabase (login + homework DB)

Until these are set, the site shows a **config** error at login.

1. Create a Supabase project (or use an existing one).
2. Run `supabase/migrations/001_init.sql` in the Supabase SQL editor.
3. In Supabase Auth, create user **email:** `elio@german.app` **password:** `elio`.
4. On the server, edit `/opt/prankmaster-german/.env`:

   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`

5. Rebuild so `NEXT_PUBLIC_*` is embedded in the client bundle:

   ```bash
   cd /opt/prankmaster-german
   docker compose up -d --build
   ```

6. Reload is automatic; test **https://german.noteify.us/login**.

## Realtime voice WebSocket

`NEXT_PUBLIC_REALTIME_WS_URL=wss://german.noteify.us/realtime` should already be set. The `realtime` container proxies to xAI (see `server/realtime-proxy.mjs`).

## Do not disturb other apps

German uses **127.0.0.1:8095** (web) and **127.0.0.1:8096** (realtime) only. Existing stacks (actracker, mpd, schicchi, etc.) use other ports and are unchanged.
