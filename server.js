import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROUTER_URL = (process.env.MAX_ROUTER_URL || "https://max-router-production.up.railway.app/v1").replace(/\/+$/, "");
const ROUTER_KEY = process.env.MAX_ROUTER_API_KEY || "";
const EDITOR_URL = process.env.MAX_EDITOR_URL || "https://max-editor-production.up.railway.app";
const MARU_ACCESS_TOKEN = process.env.MARU_ACCESS_TOKEN || "";
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "2mb" }));

function userKey(req) { return req.headers["x-maru-user"] || "anonymous"; }

async function initDatabase() {
  if (!pool) return;
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await pool.query("CREATE TABLE IF NOT EXISTS maru_conversations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_key TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Percakapan baru', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE TABLE IF NOT EXISTS maru_messages (id BIGSERIAL PRIMARY KEY, conversation_id UUID NOT NULL REFERENCES maru_conversations(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE INDEX IF NOT EXISTS maru_conversations_user_key_idx ON maru_conversations(user_key)");
  await pool.query("CREATE INDEX IF NOT EXISTS maru_messages_conversation_id_idx ON maru_messages(conversation_id)");
}

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
  return fetch(ROUTER_URL + endpoint, {
    ...options,
    headers: { ...routerHeaders(), ...(options.headers || {}) }
  });
}

app.get("/api/health", async (_req, res) => {
  let database = "not_configured";
  if (pool) { try { await pool.query("SELECT 1"); database = "postgres"; } catch { database = "error"; } }
  res.json({ ok: true, service: "Maru AI", router: ROUTER_URL, editor: EDITOR_URL, database, routerKeyConfigured: Boolean(ROUTER_KEY), uptime: Math.round(process.uptime()), time: new Date().toISOString() });
});

app.get("/api/db/status", async (_req, res) => {
  try { if (!pool) return res.status(503).json({ ok:false, database:"not_configured" }); await pool.query("SELECT 1"); res.json({ ok:true, database:"postgres" }); }
  catch (error) { res.status(503).json({ ok:false, database:"error", detail:error.message }); }
});

app.get("/api/config", (_req, res) => {
  res.json({ routerUrl: ROUTER_URL, editorUrl: EDITOR_URL, routerKeyConfigured: Boolean(ROUTER_KEY) });
});

app.get("/api/conversations", authorized, async (req, res) => {
  try {
    if (!pool) return res.json([]);
    const r = await pool.query("SELECT id,title,created_at,updated_at FROM maru_conversations WHERE user_key=$1 ORDER BY updated_at DESC", [userKey(req)]);
    res.json(r.rows);
  } catch (error) { res.status(500).json({ error:"Gagal mengambil percakapan.", detail:error.message }); }
});

app.get("/api/conversations/:id/messages", authorized, async (req, res) => {
  try {
    if (!pool) return res.json([]);
    const r = await pool.query("SELECT m.id,m.role,m.content,m.created_at FROM maru_messages m JOIN maru_conversations c ON c.id=m.conversation_id WHERE m.conversation_id=$1 AND c.user_key=$2 ORDER BY m.id", [req.params.id, userKey(req)]);
    res.json(r.rows);
  } catch (error) { res.status(500).json({ error:"Gagal mengambil pesan.", detail:error.message }); }
});

app.post("/api/conversations", authorized, async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error:"PostgreSQL belum dikonfigurasi." });
    const title = String(req.body?.title || "Percakapan baru").slice(0, 200);
    const r = await pool.query("INSERT INTO maru_conversations(user_key,title) VALUES($1,$2) RETURNING *", [userKey(req), title]);
    res.status(201).json(r.rows[0]);
  } catch (error) { res.status(500).json({ error:"Gagal membuat percakapan.", detail:error.message }); }
});

app.post("/api/conversations/:id/messages", authorized, async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error:"PostgreSQL belum dikonfigurasi." });
    const role = String(req.body?.role || "user");
    const content = String(req.body?.content || "");
    const c = await pool.query("SELECT id FROM maru_conversations WHERE id=$1 AND user_key=$2", [req.params.id, userKey(req)]);
    if (!c.rowCount) return res.status(404).json({ error:"Percakapan tidak ditemukan." });
    const r = await pool.query("INSERT INTO maru_messages(conversation_id,role,content) VALUES($1,$2,$3) RETURNING *", [req.params.id, role, content]);
    await pool.query("UPDATE maru_conversations SET updated_at=NOW() WHERE id=$1", [req.params.id]);
    res.status(201).json(r.rows[0]);
  } catch (error) { res.status(500).json({ error:"Gagal menyimpan pesan.", detail:error.message }); }
});

app.get("/api/models", authorized, async (_req, res) => {
  try {
    const upstream = await routerFetch("/models");
    const body = await upstream.text();
    res.status(upstream.status).type("application/json").send(body);
  } catch (error) { res.status(502).json({ error:"MAX Router tidak dapat dihubungi.", detail:error.message }); }
});

app.post("/api/chat", authorized, async (req, res) => {
  const { model, messages, stream = true, temperature, max_tokens, ...rest } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error:"messages wajib berupa array dan tidak boleh kosong." });
  const payload = { model, messages, stream:Boolean(stream), ...rest };
  if (temperature !== undefined) payload.temperature = temperature;
  if (max_tokens !== undefined) payload.max_tokens = max_tokens;
  try {
    const upstream = await routerFetch("/chat/completions", { method:"POST", body:JSON.stringify(payload), signal:AbortSignal.timeout(180000) });
    res.status(upstream.status);
    const contentType = upstream.headers.get("content-type") || "";
    if (contentType) res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    if (!upstream.body) return res.end(await upstream.text());
    const reader = upstream.body.getReader();
    try { while (true) { const {done,value}=await reader.read(); if(done) break; res.write(Buffer.from(value)); } }
    finally { reader.releaseLock(); }
    res.end();
  } catch (error) {
    if (!res.headersSent) res.status(502).json({ error:"Gagal meneruskan permintaan ke MAX Router.", detail:error.message });
    else res.end();
  }
});

app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error("[Maru AI]", err);
  if (!res.headersSent) res.status(500).json({ error:"Kesalahan internal Maru AI." });
});

initDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("[Maru AI] listening on 0.0.0.0:" + PORT);
    console.log("[Maru AI] router:", ROUTER_URL);
    console.log("[Maru AI] editor:", EDITOR_URL);
  });
}).catch(error => { console.error("[Maru AI] database initialization failed:", error); process.exit(1); });
