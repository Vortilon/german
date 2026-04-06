/**
 * Browser WebSocket cannot attach Authorization to xAI Realtime.
 * Run this alongside Next and point Nginx `location /realtime` here.
 *
 *   node server/realtime-proxy.mjs
 *
 * Env: textXAI_API_KEY, REALTIME_PROXY_PORT (default 3001)
 */
import { WebSocketServer } from "ws";
import WebSocket from "ws";

const port = Number(process.env.REALTIME_PROXY_PORT || 3001);
const upstreamUrl = "wss://api.x.ai/v1/realtime";
const key = process.env.textXAI_API_KEY || process.env.XAI_API_KEY;

if (!key) {
  console.error("Missing textXAI_API_KEY");
  process.exit(1);
}

const wss = new WebSocketServer({ port });

wss.on("connection", (client) => {
  const upstream = new WebSocket(upstreamUrl, {
    headers: { Authorization: `Bearer ${key}` },
  });

  const safeClose = () => {
    try {
      upstream.close();
    } catch {
      /* ignore */
    }
    try {
      client.close();
    } catch {
      /* ignore */
    }
  };

  upstream.on("open", () => {
    client.on("message", (data) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    });
  });

  upstream.on("message", (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  });

  upstream.on("error", safeClose);
  client.on("error", safeClose);
  upstream.on("close", safeClose);
  client.on("close", safeClose);
});

console.log(`Realtime proxy listening on ws://0.0.0.0:${port} → ${upstreamUrl}`);
