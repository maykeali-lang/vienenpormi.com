// Contador GLOBAL de reproducciones + letterbox de vienenpormi.com —
// microservicio sin dependencias. Guarda en JSON (escritura atómica vía
// tmp+rename, flush diferido). nginx proxya /api/ → 127.0.0.1:8787.
//
//   GET  /api/plays           → { plays: { intro, libreta, orgullo, envidia } }
//   POST /api/plays/<track>   → suma 1 al tema y devuelve todos los conteos
//   POST /api/plays           → compat con el cliente viejo: suma a libreta
//   GET  /api/comments        → { comments: [{ id, nick, text, ts }] } (nuevos primero)
//   POST /api/comments        → body { nick?, text } → guarda y devuelve la lista
import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const FILE = join(DIR, "plays.json");
// "orgullo-exp" = reproducciones de la EXPERIENCIA /orgullo (contador propio,
// NO se mezcla con las del music player, que suman a "orgullo")
const TRACKS = ["outro", "intro", "libreta", "orgullo", "orgullo-exp", "envidia", "ira"];

let counts = Object.fromEntries(TRACKS.map((t) => [t, 0]));
try {
  const saved = JSON.parse(readFileSync(FILE, "utf8"));
  for (const t of TRACKS) if (Number.isFinite(saved[t])) counts[t] = saved[t];
} catch {
  /* primera ejecución: arranca en cero */
}

// ---- letterbox (comentarios del About) ----
const CFILE = join(DIR, "comments.json");
const MAX_COMMENTS = 500; // se conservan los 500 más recientes
const NICK_MAX = 24;
const TEXT_MAX = 280;

let comments = [];
let nextId = 1;
try {
  const saved = JSON.parse(readFileSync(CFILE, "utf8"));
  if (Array.isArray(saved.comments)) comments = saved.comments;
  if (Number.isFinite(saved.nextId)) nextId = saved.nextId;
} catch {
  /* primera ejecución: sin comentarios */
}

// anti-spam mínimo: un comentario cada 15 s por IP (memoria, se limpia sola)
const lastPost = new Map();
const POST_COOLDOWN_MS = 15_000;

// ---- tabla de records GLOBAL del juego /libreta (top scores) ----
const SFILE = join(DIR, "scores.json");
const MAX_SCORES = 100; // se guardan 100; se devuelven los 10 mejores
const TOP_N = 10;
const SCORE_MAX = 1_000_000_000;
const SCORE_COOLDOWN_MS = 2000;

let scores = [];
try {
  const saved = JSON.parse(readFileSync(SFILE, "utf8"));
  if (Array.isArray(saved.scores)) scores = saved.scores;
} catch {
  /* primera ejecución: sin records */
}
const lastScore = new Map();

/** limpia texto plano: sin controles, espacios colapsados, largo acotado */
function clean(s, max) {
  return String(s ?? "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

let dirty = false;
let cdirty = false;
let sdirty = false;
function flush() {
  if (dirty) {
    dirty = false;
    try {
      writeFileSync(FILE + ".tmp", JSON.stringify(counts));
      renameSync(FILE + ".tmp", FILE);
    } catch (e) {
      console.error("plays: no pude guardar", e.message);
    }
  }
  if (cdirty) {
    cdirty = false;
    try {
      writeFileSync(CFILE + ".tmp", JSON.stringify({ nextId, comments }));
      renameSync(CFILE + ".tmp", CFILE);
    } catch (e) {
      console.error("comments: no pude guardar", e.message);
    }
  }
  if (sdirty) {
    sdirty = false;
    try {
      writeFileSync(SFILE + ".tmp", JSON.stringify({ scores }));
      renameSync(SFILE + ".tmp", SFILE);
    } catch (e) {
      console.error("scores: no pude guardar", e.message);
    }
  }
}
setInterval(flush, 2000);
process.on("SIGTERM", () => {
  flush();
  process.exit(0);
});

const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname.replace(/\/$/, "");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  const ok = () => res.end(JSON.stringify({ plays: counts }));
  const okComments = () => res.end(JSON.stringify({ comments }));
  const bad = (code, error) => {
    res.statusCode = code;
    res.end(JSON.stringify({ error }));
  };

  if (path === "/api/plays" && req.method === "GET") return ok();
  if (path === "/api/plays" && req.method === "POST") {
    counts.libreta += 1; // compat: el cliente viejo contaba solo libreta
    dirty = true;
    return ok();
  }
  const m = path.match(/^\/api\/plays\/([a-z-]+)$/);
  if (m && req.method === "POST" && TRACKS.includes(m[1])) {
    counts[m[1]] += 1;
    dirty = true;
    return ok();
  }

  if (path === "/api/comments" && req.method === "GET") return okComments();
  if (path === "/api/comments" && req.method === "POST") {
    // cooldown por IP (detrás de nginx: X-Real-IP / X-Forwarded-For)
    const ip =
      req.headers["x-real-ip"] ||
      String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "?";
    const now = Date.now();
    if (now - (lastPost.get(ip) || 0) < POST_COOLDOWN_MS) return bad(429, "slow down");
    if (lastPost.size > 2000) lastPost.clear();

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) req.destroy(); // cuerpo absurdo: corta
    });
    req.on("end", () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return bad(400, "bad json");
      }
      const text = clean(data.text, TEXT_MAX);
      const nick = clean(data.nick, NICK_MAX);
      if (!text) return bad(400, "empty");
      lastPost.set(ip, now);
      comments.unshift({ id: nextId++, nick: nick || null, text, ts: now });
      if (comments.length > MAX_COMMENTS) comments.length = MAX_COMMENTS;
      cdirty = true;
      okComments();
    });
    return;
  }

  // ---- tabla de records global ----
  if (path === "/api/scores" && req.method === "GET") {
    return res.end(JSON.stringify({ scores: scores.slice(0, TOP_N) }));
  }
  if (path === "/api/scores" && req.method === "POST") {
    const ip =
      req.headers["x-real-ip"] ||
      String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "?";
    const now = Date.now();
    if (now - (lastScore.get(ip) || 0) < SCORE_COOLDOWN_MS) return bad(429, "slow down");
    if (lastScore.size > 2000) lastScore.clear();

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2048) req.destroy();
    });
    req.on("end", () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return bad(400, "bad json");
      }
      const score = Math.floor(Number(data.score));
      if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) return bad(400, "bad score");
      const nick = clean(data.nick, NICK_MAX) || "anon";
      lastScore.set(ip, now);
      const row = { nick, score, ts: now };
      scores.push(row);
      scores.sort((a, b) => b.score - a.score || a.ts - b.ts);
      if (scores.length > MAX_SCORES) scores.length = MAX_SCORES;
      sdirty = true;
      const top = scores.slice(0, TOP_N);
      res.end(JSON.stringify({ scores: top, rank: top.indexOf(row) }));
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(8787, "127.0.0.1", () => console.log("plays counter on :8787"));
