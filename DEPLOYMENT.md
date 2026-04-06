# Deploy Elio German on the VPS (`german.noteify.us`)

There is **no fixed IP in this repository**. The **`A` record for `german.noteify.us` must point to the public IPv4 of the VPS where you run this app** (often the same IPv4 as your main `noteify.us` host if it is the same machine).

## 1) Discover the IP to use in DNS (on the server)

SSH into the VPS, then:

```bash
bash scripts/show-public-ip.sh
```

Or:

```bash
curl -4 ifconfig.me
```

Use **that** IPv4 as the **`A` record** target for `german` (subdomain of `noteify.us`). DNS is edited at whoever hosts your DNS for `noteify.us` (registrar, Cloudflare, etc.).

If the panel shows a different “primary” or “elastic” IP than `curl` prints, **trust the provider’s IP** for that instance.

## 2) One-time layout

| Item | Value |
|------|--------|
| App directory | `/opt/prankmaster-german/` |
| Next.js (Docker) | `127.0.0.1:8095` |
| Realtime WS proxy | `127.0.0.1:8096` |
| Public | **80/443** via Nginx → those ports |

Check nothing else is bound:

```bash
ss -lntp | egrep ':8095|:8096' || true
```

## 3) Get the code on the server

```bash
sudo mkdir -p /opt/prankmaster-german
sudo chown "$USER:$USER" /opt/prankmaster-german
cd /opt/prankmaster-german
git clone <YOUR_REPO_URL> .
```

## 4) Environment (on the server only)

```bash
cp .env.example .env
nano .env
```

Required:

- `textXAI_API_KEY` — your xAI key  
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key  
- `NEXT_PUBLIC_REALTIME_WS_URL=wss://german.noteify.us/realtime` (after TLS + Nginx below)

Supabase:

1. Run SQL in `supabase/migrations/001_init.sql` in the Supabase SQL editor.  
2. Create auth user: email **`elio@german.app`**, password **`elio`** (matches the app login).

## 5) Run with Docker

```bash
cd /opt/prankmaster-german
docker compose up -d --build
```

Check:

```bash
curl -sI http://127.0.0.1:8095 | head -n1
```

## 6) Nginx + TLS

- Terminate HTTPS on `german.noteify.us` (e.g. Let’s Encrypt).  
- Proxy **`/`** → `http://127.0.0.1:8095`  
- Proxy **`/realtime`** → `http://127.0.0.1:8096` with WebSocket upgrade headers.

Example (adjust certificate paths):

```nginx
server {
  server_name german.noteify.us;

  location /realtime {
    proxy_pass http://127.0.0.1:8096;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {
    proxy_pass http://127.0.0.1:8095;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  listen 443 ssl;
  # ssl_certificate ...;
  # ssl_certificate_key ...;
}
```

Reload Nginx, then test in a browser:

- `https://german.noteify.us/login`  
- Sign in as **`elio` / `elio`** → `/app`

## 7) Cloudflare (if used)

If the DNS is proxied (orange cloud), **WebSockets must be enabled** and SSL mode must allow your origin certificate. If Realtime fails, try DNS-only (grey cloud) for `german` or use “Full (strict)” with a valid cert on the VPS.

---

**Testing:** Perform all checks on **`https://german.noteify.us`** after DNS propagates and TLS works. No local machine is required for acceptance testing.
