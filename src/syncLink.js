// Personal sync links: <site>/#7KQ2-M9XD-4RTA opens the app with that sync code.
// The part after "#" never leaves the browser, so the code isn't sent to the
// web host. These helpers decide what a link should do; useSyncLink.js wires
// them to the page.

import { normalizeCode, formatCode } from "./api.js";

/**
 * Read the address-bar hash.
 * Returns { code } for a valid sync code, { invalid, raw } for something that
 * looks like a mistyped code, or null when there's nothing code-like to act on.
 */
export function parseSyncHash(hash) {
  let raw = String(hash || "").replace(/^#/, "");
  try { raw = decodeURIComponent(raw); } catch { /* keep it as typed */ }
  raw = raw.trim();
  if (!raw) return null;
  const code = normalizeCode(raw);
  if (code) return { code };
  const compact = raw.replace(/[\s-]/g, "");
  return /^[0-9a-z]{6,20}$/i.test(compact) && /^[0-9a-z\s-]+$/i.test(raw) ? { invalid: true, raw } : null;
}

/** The link to share or bookmark for a code, on the site currently open. */
export function personalLink(code, loc = globalThis.location) {
  return `${loc.origin}${loc.pathname}#${formatCode(code)}`;
}

/**
 * Work out what opening a link with `code` means for this device.
 * Only links straight away when nothing on the device could be lost; otherwise
 * returns a question for the user.
 *
 * kinds: same | linked | choose | switch | missing | unreachable | unavailable
 */
export async function resolveSyncLink(store, code) {
  if (!store.syncEnabled) return { kind: "unavailable", code };
  const before = store.getState();
  if (before.sync && before.sync.code === code) {
    store.refresh();
    return { kind: "same", code };
  }

  let info;
  try {
    info = await store.fetchProfile(code);
  } catch (e) {
    if (e.status === 404) return { kind: "missing", code };
    return { kind: "unreachable", code };
  }

  const now = store.getState();
  if (now.sync && now.sync.code === code) return { kind: "same", code };
  if (now.sync) return { kind: "switch", code, info, from: { code: now.sync.code, username: now.sync.username } };
  if (info.localEmpty || info.localOnly === 0) {
    await store.link(info.profile, "merge");
    return { kind: "linked", code, info };
  }
  return { kind: "choose", code, info };
}

/**
 * Move a linked device to another sync code. The device then shows that
 * code's progress; its old progress stays saved on the server under the old code.
 * Refuses while the device has changes it couldn't upload yet (offline).
 */
export async function switchSyncCode(store, info) {
  await store.syncNow();
  const s = store.getState();
  const unsynced = Object.keys(s.pending).length > 0 || s.metaDirty;
  // "error" means the old code is gone or rejected: there's nowhere left to save to.
  if (unsynced && s.status !== "error") return { ok: false, reason: "unsynced" };
  store.unlink();
  await store.link(info.profile, "replace");
  return { ok: true };
}
