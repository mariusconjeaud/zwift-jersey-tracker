// Progress format shared by the backup code, localStorage and the sync API.
//
//   "wa-hl,wa-alpe,ny-cmb:rs|V:<uri-encoded JSON of the video list>"
//
// A plain id means "captured". Combined jerseys carry their state after ":".
// The "|V:" suffix is only present when the Vidéo list is non-empty.

import { ALL_IDS, CMB_IDS, CMB_CYCLE, VIDEO_TYPES } from "./catalog.js";

const CMB_STATES = new Set(CMB_CYCLE.filter((s) => s !== "none"));
const VIDEO_TYPE_KEYS = new Set(VIDEO_TYPES.map(([k]) => k));
const KNOWN = new Set(ALL_IDS);

export const VIDEO_KEY = "__video";

export function encode(earned) {
  const base = ALL_IDS.filter((id) => earned[id]).map((id) => {
    const v = earned[id];
    return typeof v === "string" ? id + ":" + v : id;
  }).join(",");
  const vid = earned[VIDEO_KEY] || [];
  return vid.length ? base + "|V:" + encodeURIComponent(JSON.stringify(vid)) : base;
}

function cleanValue(id, state) {
  if (!KNOWN.has(id)) return undefined;
  if (CMB_IDS.has(id)) return CMB_STATES.has(state) ? state : "full";
  return 1;
}

export function cleanVideo(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((v) => v && typeof v.n === "string" && v.n.trim())
    .map((v) => ({
      n: v.n.trim().slice(0, 80),
      place: typeof v.place === "string" ? v.place.trim().slice(0, 80) : "",
      t: VIDEO_TYPE_KEYS.has(v.t) ? v.t : "other",
    }))
    .slice(0, 300);
}

export function decode(code) {
  const [main = "", vidPart] = String(code || "").trim().split("|V:");
  let video = [];
  if (vidPart) { try { video = JSON.parse(decodeURIComponent(vidPart)); } catch { video = []; } }
  const out = {};
  main.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).forEach((tok) => {
    const [id, state] = tok.split(":");
    const v = cleanValue(id, state);
    if (v !== undefined) out[id] = v;
  });
  out[VIDEO_KEY] = cleanVideo(video);
  return out;
}

export const countCaptured = (earned) => ALL_IDS.filter((id) => earned[id]).length;
export const isEmpty = (earned) => countCaptured(earned) === 0 && !(earned[VIDEO_KEY] || []).length;
export const sameProgress = (a, b) => encode(a) === encode(b);

// ————— merging (used when linking a device that already has progress) —————

// Combined states expressed as the set of parts captured.
const PARTS = { full: "lsk", rs: "ls", rk: "lk", sk: "sk" };
const FROM_PARTS = { lsk: "full", ls: "rs", lk: "rk", sk: "sk" };

function unionCmb(a, b) {
  const parts = new Set([...(PARTS[a] || ""), ...(PARTS[b] || "")]);
  const key = ["l", "s", "k"].filter((p) => parts.has(p)).join("");
  return FROM_PARTS[key] || "full";
}

const videoKey = (v) => [v.n, v.place, v.t].map((x) => String(x || "").toLowerCase()).join("\u0001");

/** Union of two progress objects: a jersey captured on either side stays captured. */
export function union(a, b) {
  const out = {};
  for (const id of ALL_IDS) {
    const x = a[id], y = b[id];
    if (!x && !y) continue;
    out[id] = CMB_IDS.has(id) ? unionCmb(x, y) : 1;
  }
  const seen = new Set();
  out[VIDEO_KEY] = [...(a[VIDEO_KEY] || []), ...(b[VIDEO_KEY] || [])].filter((v) => {
    const k = videoKey(v);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}

// ————— operations (what the sync engine replays on top of the server copy) —————
// ops: { [id]: value | null, __video?: list }

export function applyOps(base, ops) {
  const out = { ...base, [VIDEO_KEY]: base[VIDEO_KEY] || [] };
  for (const [k, v] of Object.entries(ops)) {
    if (k === VIDEO_KEY) out[VIDEO_KEY] = v || [];
    else if (v == null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** The ops that turn `from` into `to`. */
export function diffOps(from, to) {
  const ops = {};
  for (const id of ALL_IDS) {
    const x = from[id] || null, y = to[id] || null;
    if (x !== y) ops[id] = y;
  }
  if (JSON.stringify(from[VIDEO_KEY] || []) !== JSON.stringify(to[VIDEO_KEY] || [])) {
    ops[VIDEO_KEY] = to[VIDEO_KEY] || [];
  }
  return ops;
}
