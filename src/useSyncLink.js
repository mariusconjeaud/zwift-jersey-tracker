import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { parseSyncHash, resolveSyncLink, switchSyncCode } from "./syncLink.js";

/** Drop the "#code" from the address bar without reloading or adding history. */
function clearHash() {
  try {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  } catch { /* some embedded browsers refuse; harmless */ }
}

/**
 * Opens <site>/#SYNC-CODE links: on load, and when the hash changes while the
 * app is open. Returns the prompt to show (or null) and the actions for it.
 *
 * The hash is kept while it matches the linked code, so the page can be
 * bookmarked. It's removed when the user declines, the code is bad, or the
 * device is unlinked, so a reload doesn't ask again.
 */
export function useSyncLink(store) {
  const [prompt, setPrompt] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(null);
  const closeTimer = useRef(null);

  const show = useCallback((p) => {
    clearTimeout(closeTimer.current);
    setPrompt(p);
    if (!p) return;
    // The prompt sits at the top of the list: bring it into view if the page is scrolled.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "smooth" });
    if (p.kind === "linked") closeTimer.current = setTimeout(() => setPrompt(null), 8000);
  }, []);

  const open = useCallback(async () => {
    const parsed = parseSyncHash(window.location.hash);
    if (!parsed) return;
    if (parsed.invalid) {
      clearHash();
      show({ kind: "invalid", raw: parsed.raw });
      return;
    }
    const { code } = parsed;
    const current = store.getState().sync;
    if (current && current.code === code) {
      store.refresh();
      return;
    }
    if (inFlight.current === code) return; // StrictMode / load + hashchange double fire
    inFlight.current = code;
    show({ kind: "loading", code });
    try {
      const r = await resolveSyncLink(store, code);
      if (r.kind === "missing" || r.kind === "unavailable") clearHash();
      show(r.kind === "same" ? null : r);
    } catch {
      show({ kind: "unreachable", code });
    } finally {
      inFlight.current = null;
    }
  }, [store, show]);

  useEffect(() => {
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [open]);

  // Unlinking (or deleting the cloud copy) removes the code from the address bar too.
  const syncCode = useSyncExternalStore(store.subscribe, () => store.getState().sync?.code ?? null);
  const prevCode = useRef(syncCode);
  useEffect(() => {
    if (prevCode.current && !syncCode) {
      const parsed = parseSyncHash(window.location.hash);
      if (parsed && parsed.code === prevCode.current) clearHash();
    }
    prevCode.current = syncCode;
  }, [syncCode]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const act = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      show({ ...prompt, error: "Couldn't reach the sync server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const actions = {
    choose: (mode) => act(async () => {
      await store.link(prompt.info.profile, mode);
      show({ kind: "linked", info: prompt.info, merged: mode === "merge" });
    }),
    switchCode: () => act(async () => {
      const r = await switchSyncCode(store, prompt.info);
      if (r.ok) show({ kind: "linked", info: prompt.info, switched: true });
      else show({ ...prompt, error: "This device has changes that haven't synced yet. Reconnect and try again, so they aren't lost." });
    }),
    decline: () => { clearHash(); show(null); },
    retry: () => { show(null); open(); },
    close: () => show(null),
  };

  return { prompt, busy, actions };
}
