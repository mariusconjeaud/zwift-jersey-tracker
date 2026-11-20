import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { newCode, normalizeCode, cleanUsername } from "../src/index.js";
import { createD1 } from "./d1-shim.js";

const ORIGIN = "https://mariusconjeaud.github.io";

function setup(extraEnv = {}) {
  const env = { DB: createD1(), ALLOWED_ORIGINS: ORIGIN + ",http://localhost:5173", ...extraEnv };
  const call = async (method, path, body, headers = {}) => {
    const req = new Request("https://api.test" + path, {
      method,
      headers: { origin: ORIGIN, ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const res = await worker.fetch(req, env);
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  return { env, call };
}

test("codes are 12 Crockford chars and normalise forgivingly", () => {
  const c = newCode();
  assert.match(c, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/);
  assert.equal(normalizeCode("abcd-efgh-jkmn"), "ABCDEFGHJKMN");
  assert.equal(normalizeCode(" o1l2-I3I4-5678 "), "01121314" + "5678");
  assert.equal(normalizeCode("ABCD-EFGH-JKMU"), null); // U is not in the alphabet
  assert.equal(normalizeCode("ABC"), null);
});

test("usernames are trimmed and bounded", () => {
  assert.equal(cleanUsername("  Marius  the\tGreat "), "Marius the Great");
  assert.equal(cleanUsername("a\u0000b"), "ab");
  assert.equal(cleanUsername("   "), null);
  assert.equal(cleanUsername("x".repeat(33)), null);
  assert.equal(cleanUsername("🚴".repeat(32)), "🚴".repeat(32));
  assert.equal(cleanUsername("👨‍👩‍👧 team"), "👨‍👩‍👧 team");
  assert.equal(cleanUsername("a\u202Eb"), "ab");
  assert.equal(cleanUsername(42), null);
});

test("create, read, update, delete", async () => {
  const { call } = setup();
  const c = await call("POST", "/v1/profiles", { username: "Rider", progress: "wa-hl,ny-cmb:rs" });
  assert.equal(c.status, 201);
  assert.equal(c.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(c.body.username, "Rider");
  assert.equal(c.body.rev, 1);
  assert.equal(c.body.donatedAt, null);
  const code = c.body.code;

  const dashed = code.replace(/(.{4})(?=.)/g, "$1-").toLowerCase();
  const g = await call("GET", "/v1/profiles/" + dashed);
  assert.equal(g.status, 200);
  assert.equal(g.body.progress, "wa-hl,ny-cmb:rs");

  const u = await call("PATCH", "/v1/profiles/" + code, { progress: "wa-hl", baseRev: 1 });
  assert.equal(u.status, 200);
  assert.equal(u.body.rev, 2);
  assert.equal(u.body.progress, "wa-hl");

  const d = await call("DELETE", "/v1/profiles/" + code);
  assert.equal(d.status, 204);
  assert.equal((await call("GET", "/v1/profiles/" + code)).status, 404);
  assert.equal((await call("DELETE", "/v1/profiles/" + code)).status, 404);
});

test("stale baseRev gets 409 with the current copy and writes nothing", async () => {
  const { call } = setup();
  const { body: p } = await call("POST", "/v1/profiles", { username: "R" });
  await call("PATCH", "/v1/profiles/" + p.code, { progress: "wa-hl", baseRev: 1 });
  const stale = await call("PATCH", "/v1/profiles/" + p.code, {
    progress: "wa-jl", baseRev: 1, donated: true, username: "Changed",
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.profile.progress, "wa-hl");
  assert.equal(stale.body.profile.rev, 2);
  const now = (await call("GET", "/v1/profiles/" + p.code)).body;
  assert.equal(now.donatedAt, null, "conflicting write must be atomic");
  assert.equal(now.username, "R");
});

test("donation flags only move forward", async () => {
  const { call } = setup();
  const { body: p } = await call("POST", "/v1/profiles", { username: "R", donated: true, nagDismissedAt: 1000 });
  assert.ok(p.donatedAt > 0);
  assert.equal(p.nagDismissedAt, 1000);
  const first = p.donatedAt;

  const a = await call("PATCH", "/v1/profiles/" + p.code, { donated: true, nagDismissedAt: 500 });
  assert.equal(a.body.donatedAt, first, "donatedAt is set once");
  assert.equal(a.body.nagDismissedAt, 1000, "older dismissal doesn't win");

  const b = await call("PATCH", "/v1/profiles/" + p.code, { donated: false, nagDismissedAt: 2000 });
  assert.equal(b.body.donatedAt, first, "donated:false can't undo");
  assert.equal(b.body.nagDismissedAt, 2000);

  const future = await call("PATCH", "/v1/profiles/" + p.code, { nagDismissedAt: Date.now() + 1e12 });
  assert.ok(future.body.nagDismissedAt <= Date.now(), "future timestamps are clamped");
  assert.equal(future.body.rev, 1, "meta-only updates don't bump rev");
});

test("validation", async () => {
  const { call } = setup();
  assert.equal((await call("POST", "/v1/profiles", {})).status, 400);
  assert.equal((await call("POST", "/v1/profiles", { username: "x".repeat(40) })).status, 400);
  assert.equal((await call("POST", "/v1/profiles", { username: "R", progress: "<script>" })).status, 400);
  assert.equal((await call("POST", "/v1/profiles", "not json")).status, 400);
  assert.equal((await call("POST", "/v1/profiles", { username: "R", progress: "a".repeat(40000) })).status, 400);
  const { body: p } = await call("POST", "/v1/profiles", { username: "R" });
  assert.equal((await call("PATCH", "/v1/profiles/" + p.code, { progress: "wa-hl" })).status, 400, "baseRev required");
  assert.equal((await call("PATCH", "/v1/profiles/" + p.code, {})).status, 400);
  assert.equal((await call("PATCH", "/v1/profiles/" + p.code, { nagDismissedAt: "soon" })).status, 400);
  assert.equal((await call("GET", "/v1/profiles/not-a-code")).status, 404);
  assert.equal((await call("PATCH", "/v1/profiles/ABCDEFGHJKMN", { username: "x" })).status, 404);
  assert.equal((await call("PUT", "/v1/profiles/" + p.code, {})).status, 405);
  assert.equal((await call("GET", "/nope")).status, 404);
});

test("video list survives the round trip", async () => {
  const { call } = setup();
  const vid = encodeURIComponent(JSON.stringify([{ n: "Eggum Sprint", place: "Eggum Coastal (Norway) — 'é'", t: "spr" }]));
  const progress = "wa-hl|V:" + vid;
  const { status, body } = await call("POST", "/v1/profiles", { username: "R", progress });
  assert.equal(status, 201);
  assert.equal(body.progress, progress);
});

test("CORS: preflight, allowed and blocked origins", async () => {
  const { env, call } = setup();
  const pre = await worker.fetch(new Request("https://api.test/v1/profiles", {
    method: "OPTIONS", headers: { origin: ORIGIN, "access-control-request-method": "PATCH" },
  }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
  assert.match(pre.headers.get("access-control-allow-methods"), /PATCH/);

  const bad = await call("GET", "/v1/health", undefined, { origin: "https://evil.example" });
  assert.equal(bad.status, 403);

  const noOrigin = await worker.fetch(new Request("https://api.test/v1/health"), env);
  assert.equal(noOrigin.status, 200);
  assert.equal(noOrigin.headers.get("access-control-allow-origin"), null);

  const { call: anyCall } = setup({ ALLOWED_ORIGINS: "*" });
  const any = await anyCall("GET", "/v1/health", undefined, { origin: "https://elsewhere.example" });
  assert.equal(any.headers.get("access-control-allow-origin"), "*");
});

test("optional rate limiter is honoured when bound", async () => {
  let n = 0;
  const { call } = setup({ CREATE_LIMITER: { limit: async () => ({ success: ++n <= 2 }) } });
  assert.equal((await call("POST", "/v1/profiles", { username: "a" })).status, 201);
  assert.equal((await call("POST", "/v1/profiles", { username: "b" })).status, 201);
  assert.equal((await call("POST", "/v1/profiles", { username: "c" })).status, 429);
});

test("code collisions are retried", async () => {
  const { env, call } = setup();
  const real = crypto.getRandomValues.bind(crypto);
  let calls = 0;
  crypto.getRandomValues = (arr) => (++calls <= 2 ? arr.fill(0) : real(arr));
  try {
    const a = await call("POST", "/v1/profiles", { username: "a" }); // gets 000000000000
    const b = await call("POST", "/v1/profiles", { username: "b" }); // collides once, then random
    assert.equal(a.body.code, "000000000000");
    assert.equal(b.status, 201);
    assert.notEqual(b.body.code, a.body.code);
  } finally {
    crypto.getRandomValues = real;
  }
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM profiles").get().n, 2);
});
