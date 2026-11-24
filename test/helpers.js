// Shared test helpers: an in-memory sync server, storage and manual timers.
import { createStore } from "../src/store.js";
import { ApiError } from "../src/api.js";

// In-memory server with the same semantics as the Worker.
export function fakeServer() {
  const db = new Map();
  let n = 0;
  let down = false;
  const now = () => 1_000_000 + n;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const api = {
    calls: [],
    setDown(v) { down = v; },
    db,
    async create(b) {
      api.calls.push(["create", b]);
      if (down) throw new ApiError(0, null);
      const code = "C0DE" + String(++n).padStart(8, "0");
      const p = { code, username: b.username, progress: b.progress || "", rev: 1, donatedAt: b.donated ? now() : null, nagDismissedAt: b.nagDismissedAt || null };
      db.set(code, p);
      return clone(p);
    },
    async get(code) {
      api.calls.push(["get", code]);
      if (down) throw new ApiError(0, null);
      if (!db.has(code)) throw new ApiError(404, { error: "Sync code not found" });
      return clone(db.get(code));
    },
    async patch(code, b) {
      api.calls.push(["patch", code, b]);
      if (down) throw new ApiError(0, null);
      const p = db.get(code);
      if (!p) throw new ApiError(404, { error: "Sync code not found" });
      if (b.progress !== undefined && b.baseRev !== p.rev) throw new ApiError(409, { error: "conflict", profile: clone(p) });
      if (b.progress !== undefined) { p.progress = b.progress; p.rev++; }
      if (b.username !== undefined) p.username = b.username;
      if (b.donated === true) p.donatedAt = p.donatedAt || now();
      if (b.nagDismissedAt) p.nagDismissedAt = Math.max(p.nagDismissedAt || 0, b.nagDismissedAt);
      return clone(p);
    },
    async remove(code) {
      api.calls.push(["remove", code]);
      if (!db.delete(code)) throw new ApiError(404, {});
    },
  };
  return api;
}

export function memStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m };
}

// Manual timers so tests decide when debounced pushes fire.
export function timers() {
  const q = new Map();
  let id = 0;
  return {
    setTimer: (fn, ms) => { q.set(++id, { fn, ms }); return id; },
    clearTimer: (t) => q.delete(t),
    async runOnce() {
      const items = [...q.values()];
      q.clear();
      for (const { fn } of items) fn();
      await settle();
    },
    async runAll() {
      for (let i = 0; i < 20 && q.size; i++) {
        const items = [...q.entries()];
        q.clear();
        for (const [, { fn }] of items) fn();
        await settle();
      }
    },
    get size() { return q.size; },
    delays: () => [...q.values()].map((x) => x.ms),
  };
}
export const settle = () => new Promise((r) => setTimeout(r, 0)).then(() => new Promise((r) => setTimeout(r, 0)));

export function device(api, opts = {}) {
  const t = timers();
  const storage = opts.storage || memStorage();
  let clock = opts.clock || 5_000_000;
  const store = createStore({ storage, api, now: () => (clock += 10), setTimer: t.setTimer, clearTimer: t.clearTimer });
  return { store, t, storage, s: () => store.getState() };
}
