import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROUTER_URL = (process.env.MAX_ROUTER_URL || "https://max-router-production.up.railway.app/v1").replace(/\/+$/, "");
const ROUTER_KEY = process.env.MAX_ROUTER_API_KEY || "";
const EDITOR_URL = process.env.MAX_EDITOR_URL || "https://max-editor-production.up.railway.app";
const MARU_ACCESS_TOKEN = process.env.MARU_ACCESS_TOKEN || "";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "2mb" }));

function authorized(req, res, next) {
  if (!MARU_ACCESS_TOKEN) return next();
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token === MARU_ACCESS_TOKEN) return next();
  return res.status(401).json({ error: "Akses Maru AI ditolak." });
}

function routerHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (ROUTER_KEY) headers.Authorization = "Bearer " + ROUTER_KEY;
  return headers;
}

async function routerFetch(endpoint, options = {}) {
  const response = await fetch(ROUTER_URL + endpoint, {
    ...options,
    headers: { ...routerHeaders(), ...(options.headers || {}) }
  });
  return response;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "Maru AI",
    router: ROUTER_URL,
    editor: EDITOR_URL,
    routerKeyConfigured: Boolean(ROUTER_KEY),
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString()
  });
});

app.get("/api/config", (_req, res) => {
  res.json({ routerUrl: ROUTER_URL, editorUrl: EDITOR_URL, routerKeyConfigured: Boolean(ROUTER_KEY) });
});

app.get("/api/models", authorized, async (_req, res) => {
  try {
    const upstream = await routerFetch("/models");
    const body = await upstream.text();
    res.status(upstream.status).type("application/json").send(body);
  } catch (error) {
    res.status(502).json({ error: "MAX Router tidak dapat dihubungi.", detail: error.message });
  }
});

app.post("/api/chat", authorized, async (req, res) => {
  const { model, messages, stream = true, temperature, max_tokens, ...rest } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages wajib berupa array dan tidak boleh kosong." });
  }

  const payload = {
    model,
    messages,
    stream: Boolean(stream),
    ...rest
  };
  if (temperature !== undefined) payload.temperature = temperature;
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;

  try {
    const upstream = await routerFetch("/chat/completions", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000)
    });

    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    if (!upstream.body) {
      return res.end(await upstream.text());
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error: "Gagal meneruskan permintaan ke MAX Router.", detail: error.message });
    else res.end();
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("[Maru AI]", err);
  if (!res.headersSent) res.status(500).json({ error: "Kesalahan internal Maru AI." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("[Maru AI] listening on 0.0.0.0:" + PORT);
  console.log("[Maru AI] router:", ROUTER_URL);
  console.log("[Maru AI] editor:", EDITOR_URL);
});