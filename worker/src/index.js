// Jersey Hunt sync API — Cloudflare Worker + D1, no dependencies.
//
//   POST   /v1/profiles          create a profile, returns a fresh sync code
//   GET    /v1/profiles/:code    read a profile
//   PATCH  /v1/profiles/:code    update progress (with baseRev), username, donation flags
//   DELETE /v1/profiles/:code    delete a profile
//   GET    /v1/health
//
// The sync code is the only credential: whoever knows it can read and edit
// that profile. Codes carry 60 random bits, so they can't be guessed.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const CODE_LEN = 12;
const CODE_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/;
const PROGRESS_RE = /^[A-Za-z0-9,:|%\-_.!~*'()]*$/; // ids, ":" states, "|V:" + encodeURIComponent output
const MAX_PROGRESS = 32 * 1024;
const MAX_BODY = 64 * 1024;
const MAX_USERNAME = 32;

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  let s = "";
  for (const b of bytes) s += ALPHABET[b & 31]; // 256 is a multiple of 32: no bias
  return s;
}

export function normalizeCode(raw) {
  const s = decodeURIComponent(String(raw || ""))
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return CODE_RE.test(s) ? s : null;
}

export function cleanUsername(raw) {
  if (typeof raw !== "string") return null;
  // Whitespace -> single spaces, then drop control and bidi-override characters
  // (zero-width joiners stay, so emoji sequences survive).
  const s = raw.replace(/\s+/g, " ").replace(/[\p{Cc}\u202A-\u202E\u2066-\u2069]/gu, "").trim();
  const chars = [...s];
  if (!chars.length || chars.length > MAX_USERNAME) return null;
  return s;
}

function cleanProgress(raw) {
  if (typeof raw !== "string" || raw.length > MAX_PROGRESS || !PROGRESS_RE.test(raw)) return null;
  return raw;
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const toProfile = (r) => ({
  code: r.code,
  username: r.username,
  progress: r.progress,
  rev: r.rev,
  donatedAt: r.donated_at ?? null,
  nagDismissedAt: r.nag_dismissed_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) throw new HttpError(413, "Request too large");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "Request too large");
  try {
    const body = JSON.parse(text || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

function clampTime(v, now) {
  if (v == null) return null;
  if (!Number.isFinite(v) || v < 0) throw new HttpError(400, "nagDismissedAt must be a timestamp in ms");
  return Math.min(Math.floor(v), now);
}

async function getRow(db, code) {
  return db.prepare("SELECT * FROM profiles WHERE code = ?").bind(code).first();
}

// ————— handlers —————

async function createProfile(request, env) {
  if (env.CREATE_LIMITER) {
    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    const { success } = await env.CREATE_LIMITER.limit({ key: ip });
    if (!success) throw new HttpError(429, "Too many new sync codes from this network, try again in a minute");
  }
  const body = await readJson(request);
  const username = cleanUsername(body.username);
  if (!username) throw new HttpError(400, `Choose a nickname of 1–${MAX_USERNAME} characters`);
  const progress = body.progress === undefined ? "" : cleanProgress(body.progress);
  if (progress === null) throw new HttpError(400, "Invalid progress");
  const now = Date.now();
  const donatedAt = body.donated === true ? now : null;
  const nag = clampTime(body.nagDismissedAt, now);

  for (let i = 0; i < 5; i++) {
    const row = await env.DB.prepare(
      `INSERT OR IGNORE INTO profiles
         (code, username, progress, rev, donated_at, nag_dismissed_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)
       RETURNING *`,
    ).bind(newCode(), username, progress, donatedAt, nag, now, now).first();
    if (row) return json(toProfile(row), 201);
  }
  throw new HttpError(503, "Could not allocate a sync code, try again");
}

async function readProfile(env, code) {
  const row = await getRow(env.DB, code);
  if (!row) throw new HttpError(404, "Sync code not found");
  return json(toProfile(row));
}

async function updateProfile(request, env, code) {
  const body = await readJson(request);
  const now = Date.now();
  const sets = ["updated_at = ?"];
  const args = [now];
  let baseRev = null;

  if (body.progress !== undefined) {
    const progress = cleanProgress(body.progress);
    if (progress === null) throw new HttpError(400, "Invalid progress");
    if (!Number.isInteger(body.baseRev)) throw new HttpError(400, "baseRev is required with progress");
    baseRev = body.baseRev;
    sets.push("progress = ?", "rev = rev + 1");
    args.push(progress);
  }
  if (body.username !== undefined) {
    const username = cleanUsername(body.username);
    if (!username) throw new HttpError(400, `Choose a nickname of 1–${MAX_USERNAME} characters`);
    sets.push("username = ?");
    args.push(username);
  }
  // Donation flags only move forward, so a stale device can't undo them.
  if (body.donated === true) {
    sets.push("donated_at = COALESCE(donated_at, ?)");
    args.push(now);
  }
  if (body.nagDismissedAt !== undefined && body.nagDismissedAt !== null) {
    sets.push("nag_dismissed_at = MAX(COALESCE(nag_dismissed_at, 0), ?)");
    args.push(clampTime(body.nagDismissedAt, now));
  }
  if (sets.length === 1) throw new HttpError(400, "Nothing to update");

  let sql = `UPDATE profiles SET ${sets.join(", ")} WHERE code = ?`;
  args.push(code);
  if (baseRev !== null) {
    sql += " AND rev = ?";
    args.push(baseRev);
  }
  const row = await env.DB.prepare(sql + " RETURNING *").bind(...args).first();
  if (row) return json(toProfile(row));

  const current = await getRow(env.DB, code);
  if (!current) throw new HttpError(404, "Sync code not found");
  // Another device saved first. Nothing was written; the client rebases and retries.
  throw new HttpError(409, "Progress changed on another device", { profile: toProfile(current) });
}

async function deleteProfile(env, code) {
  const res = await env.DB.prepare("DELETE FROM profiles WHERE code = ?").bind(code).run();
  if (!res.meta || !res.meta.changes) throw new HttpError(404, "Sync code not found");
  return new Response(null, { status: 204 });
}

// ————— plumbing —————

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return { ok: true, value: null };
  const list = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.includes("*")) return { ok: true, value: "*" };
  return list.includes(origin) ? { ok: true, value: origin } : { ok: false, value: null };
}

function withCors(res, origin) {
  if (!origin) return res;
  const r = new Response(res.body, res);
  r.headers.set("access-control-allow-origin", origin);
  r.headers.set("vary", "origin");
  return r;
}

async function route(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const m = request.method;

  if (parts[0] !== "v1") throw new HttpError(404, "Not found");
  if (parts[1] === "health" && parts.length === 2 && m === "GET") return json({ ok: true });
  if (parts[1] !== "profiles") throw new HttpError(404, "Not found");

  if (parts.length === 2) {
    if (m === "POST") return createProfile(request, env);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 3) {
    const code = normalizeCode(parts[2]);
    if (!code) throw new HttpError(404, "Sync code not found");
    if (m === "GET") return readProfile(env, code);
    if (m === "PATCH") return updateProfile(request, env, code);
    if (m === "DELETE") return deleteProfile(env, code);
    throw new HttpError(405, "Method not allowed");
  }
  throw new HttpError(404, "Not found");
}

export default {
  async fetch(request, env) {
    const cors = allowedOrigin(request, env);
    if (!cors.ok) return json({ error: "Origin not allowed" }, 403);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "86400",
        },
      }), cors.value);
    }

    let res;
    try {
      res = await route(request, env);
    } catch (e) {
      if (e instanceof HttpError) {
        res = json({ error: e.message, ...(e.extra || {}) }, e.status);
      } else {
        console.error(e);
        res = json({ error: "Server error" }, 500);
      }
    }
    return withCors(res, cors.value);
  },
};
