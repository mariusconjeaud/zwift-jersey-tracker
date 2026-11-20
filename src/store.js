// Progress store: saves to localStorage on every change and, once the device is
// linked to a sync code, keeps the copy in the Cloudflare Worker in step.
//
// Sync model: every local change is recorded as an op ("set id to value") in
// `pending`. A push sends the whole progress string with the revision it was
// based on. If another device got there first, the server answers 409 with its
// copy; we replay our pending ops on top of it and push again. Nothing a device
// changed is lost, and un-ticking a jersey syncs as well as ticking one.

import { nextCmb } from "./catalog.js";
import {
  VIDEO_KEY, encode, decode, applyOps, diffOps, union, isEmpty, sameProgress, countCaptured,
} from "./codec.js";

export const STORE_KEY = "zwift-jersey-hunt-v1";

const emptyDonation = () => ({ donatedAt: null, nagDismissedAt: null });

function mergeDonation(local, remote) {
  return {
    donatedAt: local.donatedAt || remote.donatedAt || null,
    nagDismissedAt: Math.max(local.nagDismissedAt || 0, remote.nagDismissedAt || 0) || null,
  };
}

/** True when the server copy already knows everything this device knows about donating. */
const donationCovered = (local, remote) =>
  !(local.donatedAt && !remote.donatedAt) && !((local.nagDismissedAt || 0) > (remote.nagDismissedAt || 0));

const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createStore({
  storage = globalThis.localStorage,
  api = null,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  pushDelay = 1200,
} = {}) {
  const listeners = new Set();
  let state = {
    earned: { [VIDEO_KEY]: [] },
    pending: {},
    metaDirty: false,
    sync: null, // { code, username, rev, syncedAt }
    donation: emptyDonation(),
    status: "local", // local | pending | syncing | synced | offline | error
    error: "",
    saved: true,
  };

  // ————— persistence —————
  function readStorage() {
    try {
      const raw = storage && storage.getItem(STORE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return {
        earned: decode(p.progress || ""),
        pending: p.pending && typeof p.pending === "object" ? p.pending : {},
        metaDirty: !!p.metaDirty,
        sync: p.sync && p.sync.code ? p.sync : null,
        donation: { ...emptyDonation(), ...(p.donation || {}) },
      };
    } catch {
      return null;
    }
  }

  function save() {
    if (!storage) { state.saved = false; return; }
    try {
      storage.setItem(STORE_KEY, JSON.stringify({
        progress: encode(state.earned),
        pending: state.pending,
        metaDirty: state.metaDirty,
        sync: state.sync,
        donation: state.donation,
      }));
      state.saved = true;
    } catch {
      state.saved = false;
    }
  }

  function set(patch, { persist = true } = {}) {
    state = { ...state, ...patch };
    if (persist) save();
    state = { ...state }; // new identity so `saved` changes re-render too
    listeners.forEach((l) => l());
  }

  const loaded = readStorage();
  if (loaded) state = { ...state, ...loaded, status: loaded.sync ? "pending" : "local" };
  save(); // probe writability so the banner is accurate before the first tap

  // ————— sync engine —————
  let timer = null;
  let inflight = null;
  let again = false;
  let retryMs = 0;
  let lastAttempt = 0;
  let metaEpoch = 0;

  const canSync = () => !!(api && state.sync);
  const hasWork = () => Object.keys(state.pending).length > 0 || state.metaDirty;

  function schedule(ms) {
    if (!canSync()) return;
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = null; syncNow(); }, ms);
  }

  /** Bring local state in line with a profile the server returned. */
  function reconcile(p, acked = {}) {
    if (!state.sync || state.sync.code !== p.code) return;
    const pending = { ...state.pending };
    for (const [k, v] of Object.entries(acked)) {
      if (k in pending && sameJSON(pending[k], v)) delete pending[k];
    }
    let earned = applyOps(decode(p.progress), pending);
    if (sameProgress(earned, state.earned)) earned = state.earned;
    set({
      earned,
      pending,
      donation: mergeDonation(state.donation, p),
      sync: { ...state.sync, rev: p.rev, username: p.username, syncedAt: now() },
    });
  }

  function metaBody() {
    const body = {};
    if (state.donation.donatedAt) body.donated = true;
    if (state.donation.nagDismissedAt) body.nagDismissedAt = state.donation.nagDismissedAt;
    return body;
  }

  async function syncOnce() {
    const code = state.sync.code;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!state.sync || state.sync.code !== code) return;
      const sentOps = state.pending;
      const sentEpoch = metaEpoch;
      const body = {};
      if (Object.keys(sentOps).length) {
        body.progress = encode(state.earned);
        body.baseRev = state.sync.rev;
      }
      if (state.metaDirty) Object.assign(body, metaBody());

      if (!Object.keys(body).length) {
        reconcile(await api.get(code));
        if (!hasWork()) return;
        continue;
      }
      try {
        const p = await api.patch(code, body);
        if (state.metaDirty && sentEpoch === metaEpoch && state.sync?.code === code) {
          set({ metaDirty: false });
        }
        reconcile(p, body.progress !== undefined ? sentOps : {});
      } catch (e) {
        if (e.status === 409 && e.body && e.body.profile) {
          reconcile(e.body.profile); // replay our ops on the newer copy, then retry
          continue;
        }
        throw e;
      }
      if (!hasWork()) return;
    }
  }

  function syncNow() {
    if (!canSync()) return Promise.resolve();
    if (inflight) { again = true; return inflight; }
    if (timer) { clearTimer(timer); timer = null; }
    const code = state.sync.code;
    lastAttempt = now();
    set({ status: "syncing", error: "" }, { persist: false });
    inflight = (async () => {
      try {
        do {
          again = false;
          await syncOnce();
        } while (again && state.sync && state.sync.code === code);
        retryMs = 0;
        if (state.sync && state.sync.code === code) {
          set({ status: hasWork() ? "pending" : "synced" }, { persist: false });
          if (hasWork()) schedule(pushDelay);
        }
      } catch (e) {
        if (!state.sync || state.sync.code !== code) return;
        if (e.retryable) {
          retryMs = Math.min(retryMs ? retryMs * 2 : 5000, 120000);
          set({ status: "offline", error: e.status ? e.message : "" }, { persist: false });
          schedule(retryMs);
        } else if (e.status === 404) {
          set({ status: "error", error: "This sync code no longer exists on the server." }, { persist: false });
        } else {
          set({ status: "error", error: e.message || "Sync failed" }, { persist: false });
        }
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  /** Pull (and push if needed) when the app comes back into view; cheap to call often. */
  function refresh() {
    if (!canSync()) return Promise.resolve();
    if (!hasWork() && now() - lastAttempt < 5000) return Promise.resolve();
    return syncNow();
  }

  /** Last-chance push while the page is being hidden or closed. */
  function flush() {
    if (!canSync() || !hasWork() || inflight) return;
    const body = state.metaDirty ? metaBody() : {};
    if (Object.keys(state.pending).length) {
      body.progress = encode(state.earned);
      body.baseRev = state.sync.rev;
    }
    api.patch(state.sync.code, body, { keepalive: true }).catch(() => {});
  }

  // ————— local edits —————
  function change(ops) {
    const earned = applyOps(state.earned, ops);
    if (canSync()) {
      set({ earned, pending: { ...state.pending, ...ops }, status: state.status === "syncing" ? "syncing" : "pending" });
      schedule(pushDelay);
    } else {
      set({ earned });
    }
  }

  function toggle(id, isCmb) {
    const cur = state.earned[id];
    let val;
    if (isCmb) {
      const s = nextCmb(cur);
      val = s === "none" ? null : s;
    } else {
      val = cur ? null : 1;
    }
    change({ [id]: val });
  }

  const setVideo = (list) => change({ [VIDEO_KEY]: list });
  const replaceProgress = (next) => change(diffOps(state.earned, next));

  function donationChanged(donation) {
    metaEpoch++;
    if (canSync()) {
      set({ donation, metaDirty: true });
      schedule(0);
    } else {
      set({ donation });
    }
  }
  const markDonated = () => donationChanged({ ...state.donation, donatedAt: state.donation.donatedAt || now() });
  const dismissNag = () => donationChanged({ ...state.donation, nagDismissedAt: now() });

  // ————— linking —————
  function requireApi() {
    if (!api) throw new Error("Sync isn't configured for this site.");
  }

  async function createSync(username) {
    requireApi();
    const sentDonation = state.donation;
    const p = await api.create({ username, progress: encode(state.earned), ...metaBody() });
    // Anything changed while the request was in flight still needs pushing.
    set({
      sync: { code: p.code, username: p.username, rev: p.rev, syncedAt: now() },
      pending: diffOps(decode(p.progress), state.earned),
      metaDirty: !sameJSON(sentDonation, state.donation),
      status: "synced",
      error: "",
    });
    reconcile(p);
    if (hasWork()) schedule(0);
    return p;
  }

  /** Look up a code without linking, so the UI can ask how to combine progress. */
  async function fetchProfile(code) {
    requireApi();
    const p = await api.get(code);
    const remote = decode(p.progress);
    const merged = union(remote, state.earned);
    return {
      profile: p,
      remoteCount: countCaptured(remote),
      localOnly: countCaptured(merged) - countCaptured(remote) +
        (merged[VIDEO_KEY].length - remote[VIDEO_KEY].length),
      localEmpty: isEmpty(state.earned),
    };
  }

  /** mode: "merge" keeps jerseys from both sides, "replace" adopts the synced copy. */
  function link(profile, mode = "merge") {
    const remote = decode(profile.progress);
    const earned = mode === "merge" ? union(remote, state.earned) : remote;
    const donation = mergeDonation(state.donation, profile);
    if (timer) { clearTimer(timer); timer = null; }
    metaEpoch++;
    set({
      earned,
      pending: diffOps(remote, earned),
      donation,
      metaDirty: !donationCovered(donation, profile),
      sync: { code: profile.code, username: profile.username, rev: profile.rev, syncedAt: now() },
      status: "synced",
      error: "",
    });
    if (hasWork()) return syncNow();
    return Promise.resolve();
  }

  function unlink() {
    if (timer) { clearTimer(timer); timer = null; }
    retryMs = 0;
    set({ sync: null, pending: {}, metaDirty: false, status: "local", error: "" });
  }

  async function deleteCloud() {
    requireApi();
    if (!state.sync) return;
    try {
      await api.remove(state.sync.code);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    unlink();
  }

  async function rename(username) {
    requireApi();
    if (!state.sync) return;
    const p = await api.patch(state.sync.code, { username });
    if (state.sync && state.sync.code === p.code) {
      set({ sync: { ...state.sync, username: p.username } });
    }
  }

  /** Another tab on this device wrote to localStorage. */
  function reloadFromStorage() {
    const l = readStorage();
    if (!l) return;
    set({ ...l, status: l.sync ? (state.status === "local" ? "pending" : state.status) : "local" }, { persist: false });
    if (l.sync && Object.keys(l.pending).length) schedule(pushDelay);
  }

  function retrySave() {
    set({});
    return state.saved;
  }

  return {
    getState: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    syncEnabled: !!api,
    toggle, setVideo, replaceProgress, markDonated, dismissNag, retrySave,
    createSync, fetchProfile, link, unlink, deleteCloud, rename,
    syncNow, refresh, flush, reloadFromStorage,
  };
}
