import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { W, TYPE_LABEL, VIDEO_TYPES, VIDEO_STYLE } from "./catalog.js";
import { VIDEO_KEY } from "./codec.js";
import { STORE_KEY } from "./store.js";
import { NAG_MIN_JERSEYS, NAG_SNOOZE_DAYS } from "./config.js";
import Jersey from "./Jersey.jsx";
import SyncPanel, { btnS } from "./components/SyncPanel.jsx";
import Badges from "./components/Badges.jsx";
import { DonateNag, DonateThanks, DonateFooter } from "./components/DonateNag.jsx";

const font = "'Barlow Condensed','Arial Narrow',sans-serif";
const bodyFont = "'Inter',system-ui,sans-serif";

function statusBadge(state, syncEnabled) {
  if (!state.saved) return { text: "not saved · backup code ▸", color: "#F5A623" };
  if (!syncEnabled) return { text: "saved ✓ · backup ▸", color: "#5B7F5E" };
  if (!state.sync) return { text: "this device only · sync ▸", color: "#7E93B5" };
  switch (state.status) {
    case "synced": return { text: "synced ✓", color: "#5B7F5E" };
    case "offline": return { text: "offline · will sync ▸", color: "#F5A623" };
    case "error": return { text: "sync problem ▸", color: "#F5A623" };
    default: return { text: "syncing…", color: "#8CA0C0" };
  }
}

/** Keep the store in step with the server as the app comes and goes. */
function useSyncLifecycle(store) {
  useEffect(() => {
    store.refresh();
    const onVisibility = () => (document.visibilityState === "visible" ? store.refresh() : store.flush());
    const onFocus = () => store.refresh();
    const onOnline = () => store.syncNow();
    const onPageHide = () => store.flush();
    const onStorage = (e) => { if (e.key === STORE_KEY) store.reloadFromStorage(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("storage", onStorage);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("storage", onStorage);
    };
  }, [store]);
}

export default function JerseyHunt({ store }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { earned, donation } = state;
  useSyncLifecycle(store);

  const [vName, setVName] = useState("");
  const [vPlace, setVPlace] = useState("");
  const [vType, setVType] = useState("spr");
  const [filter, setFilter] = useState("all"); // all | todo | special
  const [open, setOpen] = useState(() => Object.fromEntries(W.map((w) => [w.name, true])));
  const [panelOpen, setPanelOpen] = useState(false);
  const [thanks, setThanks] = useState(false);

  const video = earned[VIDEO_KEY] || [];

  const addVideo = () => {
    const n = vName.trim();
    if (!n) return;
    store.setVideo([...video, { n, place: vPlace.trim(), t: vType }]);
    setVName(""); setVPlace("");
  };
  const removeVideo = (i) => {
    if (!window.confirm("Remove this jersey?")) return;
    store.setVideo(video.filter((_, k) => k !== i));
  };

  const resetAll = () => {
    if (window.confirm("Clear all captured jerseys?" + (state.sync ? " This also clears them on your synced devices." : ""))) {
      store.replaceProgress({ [VIDEO_KEY]: [] });
    }
  };

  const togglePanel = () => {
    setPanelOpen((o) => !o);
    if (!panelOpen) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const all = useMemo(() => W.flatMap((w) => w.segs).filter((s) => s[2] !== "cmb"), []);
  const cmbAll = useMemo(() => W.flatMap((w) => w.segs).filter((s) => s[2] === "cmb"), []);
  const total = all.length;
  const got = all.filter((s) => earned[s[0]]).length;
  const specials = all.filter((s) => s[4]);
  const gotSpecials = specials.filter((s) => earned[s[0]]).length;
  const pct = total ? Math.round((got / total) * 100) : 0;
  const cmbTotal = cmbAll.length;
  const cmbFull = cmbAll.filter((s) => earned[s[0]] === "full").length;
  const cmbAny = cmbAll.filter((s) => earned[s[0]]).length;

  const showNag = !donation.donatedAt && got >= NAG_MIN_JERSEYS &&
    (!donation.nagDismissedAt || Date.now() - donation.nagDismissedAt > NAG_SNOOZE_DAYS * 864e5);

  const visible = (s) => {
    if (filter === "todo") return !earned[s[0]];
    if (filter === "special") return !!s[4];
    return true;
  };

  const badge = statusBadge(state, store.syncEnabled);

  return (
    <div style={{ minHeight: "100vh", background: "#0E1420", color: "#EAF0FA", fontFamily: bodyFont, paddingBottom: 48 }}>
      {/* Header */}
      <header style={{ padding: "22px 16px 14px", position: "sticky", top: 0, zIndex: 5, background: "linear-gradient(#0E1420 82%, rgba(14,20,32,0))" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontFamily: font, fontWeight: 800, fontSize: 30, letterSpacing: 0.5, margin: 0, textTransform: "uppercase" }}>
            Jersey&nbsp;Hunt
          </h1>
          <div style={{ fontFamily: font, fontWeight: 800, fontSize: 26 }}>
            <span style={{ color: "#3ECC5F" }}>{got}</span>
            <span style={{ color: "#5B6B87", fontSize: 18 }}> / {total}</span>
          </div>
        </div>
        <div style={{ maxWidth: 720, margin: "10px auto 0", height: 10, borderRadius: 6, background: "#1A2231", overflow: "hidden", display: "flex" }}>
          <div style={{ width: `${pct}%`, transition: "width .4s", background: "linear-gradient(90deg,#F5842B,#3ECC5F 45%,#E23A2E 80%,#2E7CE2)" }} />
        </div>
        <div style={{ maxWidth: 720, margin: "8px auto 0", display: "flex", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12, rowGap: 4, fontSize: 12.5, color: "#8CA0C0" }}>
          <span>{pct}% · ⭐ {gotSpecials}/{specials.length} · <span style={{ color: "#3ECC5F" }}>{cmbFull}/{cmbTotal} full</span> · <span style={{ color: "#F5A623" }}>{cmbAny}/{cmbTotal} combos</span></span>
          <button onClick={togglePanel} aria-expanded={panelOpen} aria-controls="sync-panel"
            title={state.sync ? `Synced as ${state.sync.username}` : undefined}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: badge.color, fontSize: 12.5, marginLeft: "auto" }}>
            {badge.text}
          </button>
        </div>

        {/* Filters */}
        <div style={{ maxWidth: 720, margin: "12px auto 0", display: "flex", gap: 8 }}>
          {[["all", "All"], ["todo", "Still to hunt"], ["special", "⭐ Specials"]].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid " + (filter === k ? "#3ECC5F" : "#2A3550"),
                background: filter === k ? "rgba(62,204,95,0.12)" : "#141C2C", color: filter === k ? "#3ECC5F" : "#AEBDD8",
                fontFamily: font, fontWeight: 600, fontSize: 15, letterSpacing: 0.6, textTransform: "uppercase", cursor: "pointer",
              }}>{label}</button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 12px" }}>
        {panelOpen && <SyncPanel state={state} store={store} />}

        <Badges earned={earned} />

        {showNag && (
          <DonateNag
            onDonated={() => { store.markDonated(); setThanks(true); }}
            onDismiss={() => store.dismissNag()}
          />
        )}
        {thanks && donation.donatedAt && <DonateThanks onClose={() => setThanks(false)} />}

        {/* Worlds */}
        {W.map((w) => {
          const segs = w.segs.filter(visible);
          const wSegs = w.segs.filter((s) => s[2] !== "cmb");
          const wTotal = wSegs.length;
          const wGot = wSegs.filter((s) => earned[s[0]]).length;
          const done = wGot === wTotal;
          if (filter !== "all" && segs.length === 0) return null;
          return (
            <section key={w.name} style={{ background: "#141C2C", border: "1px solid #2A3550", borderRadius: 14, marginTop: 14, overflow: "hidden", borderColor: done ? "#3ECC5F55" : "#2A3550" }}>
              <button onClick={() => setOpen((o) => ({ ...o, [w.name]: !o[w.name] }))} aria-expanded={!!open[w.name]}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
                <span style={{ fontFamily: font, fontWeight: 800, fontSize: 21, letterSpacing: 0.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                  {w.name} {done && <span title="World complete">🏆</span>}
                </span>
                <span style={{ fontFamily: font, fontWeight: 600, fontSize: 17, color: done ? "#3ECC5F" : "#8CA0C0" }}>
                  {wGot}/{wTotal} {open[w.name] ? "▾" : "▸"}
                </span>
              </button>
              {open[w.name] && (
                <div style={{ padding: "0 10px 12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 8 }}>
                    {segs.map((s) => {
                      const [id, n, t, j, sp, route, dist] = s;
                      const isCmb = t === "cmb";
                      const st = earned[id];
                      const on = !!st;
                      const partial = isCmb && on && st !== "full";
                      const accent = partial ? "#F5A623" : "#3ECC5F";
                      return (
                        <button key={id} onClick={() => store.toggle(id, isCmb)}
                          aria-pressed={on}
                          title={isCmb ? "Tap to cycle: full → lap+sprint → lap+KOM → sprint+KOM" : undefined}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 10,
                            border: "1px solid " + (on ? accent + "88" : "#2A3550"),
                            background: on ? (partial ? "rgba(245,166,35,0.10)" : "rgba(62,204,95,0.08)") : "#0F1626",
                            color: on ? "#EAF0FA" : "#93A5C4", cursor: "pointer", textAlign: "left",
                            transition: "background .15s,border .15s",
                          }}>
                          <Jersey style={j} earned={on} combo={isCmb ? st : null} />
                          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {sp ? "⭐ " : ""}{n}
                            </span>
                            <span style={{ fontSize: 10.5, color: "#5B6B87", textTransform: "uppercase", letterSpacing: 0.4 }}>{TYPE_LABEL[t]}{dist ? " · " + dist : ""}</span>
                            {route && (
                              <span style={{ fontSize: 10.5, color: "#7E93B5", lineHeight: 1.25, overflowWrap: "anywhere" }}>
                                {route}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {w.note && filter === "all" && (
                    <p style={{ fontSize: 11.5, color: "#5B6B87", margin: "10px 4px 0" }}>{w.note}</p>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {/* Vidéo */}
        <section style={{ background: "#141C2C", border: "1px solid #2A3550", borderRadius: 14, marginTop: 22, padding: "12px 10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px" }}>
            <span style={{ fontFamily: font, fontWeight: 800, fontSize: 21, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Vidéo
            </span>
            <span style={{ fontFamily: font, fontWeight: 600, fontSize: 17, color: "#8CA0C0" }}>
              {video.length} jerseys
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: "#5B6B87", margin: "4px 4px 10px" }}>
            Jerseys earned in Zwift's Video feature. No target, not part of the counts above.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 8 }}>
            {video.map((v, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 9px", borderRadius: 10,
                border: "1px solid #3ECC5F66", background: "rgba(62,204,95,0.08)" }}>
                <Jersey style={VIDEO_STYLE[v.t] || "watt"} earned={true} />
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.n}</span>
                  {v.place && <span style={{ fontSize: 10.5, color: "#7E93B5", lineHeight: 1.25, overflowWrap: "anywhere" }}>{v.place}</span>}
                </span>
                <button onClick={() => removeVideo(i)} aria-label={"Remove " + v.n}
                  style={{ background: "none", border: "none", color: "#5B6B87", fontSize: 16, cursor: "pointer", padding: "0 2px" }}>×</button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addVideo(); }} style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="Jersey / segment" aria-label="Jersey or segment" maxLength={80}
              style={{ flex: "2 1 140px", minWidth: 0, padding: "9px 10px", borderRadius: 8, background: "#0B111C", border: "1px solid #22304A", color: "#EAF0FA", fontSize: 13 }} />
            <input value={vPlace} onChange={(e) => setVPlace(e.target.value)} placeholder="Video / place" aria-label="Video or place" maxLength={80}
              style={{ flex: "2 1 140px", minWidth: 0, padding: "9px 10px", borderRadius: 8, background: "#0B111C", border: "1px solid #22304A", color: "#EAF0FA", fontSize: 13 }} />
            <select value={vType} onChange={(e) => setVType(e.target.value)} aria-label="Jersey type"
              style={{ flex: "1 1 90px", padding: "9px 8px", borderRadius: 8, background: "#0B111C", border: "1px solid #22304A", color: "#EAF0FA", fontSize: 13 }}>
              {VIDEO_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button type="submit" style={{ ...btnS, flex: "1 1 70px" }}>Add</button>
          </form>
        </section>

        <DonateFooter donated={!!donation.donatedAt} />

        <button onClick={resetAll}
          style={{ margin: "18px auto 0", display: "block", background: "none", border: "1px solid #2A3550", color: "#5B6B87", borderRadius: 8, padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>
          Reset all progress
        </button>
        <p style={{ textAlign: "center", fontSize: 11, color: "#3D4A63", marginTop: 12 }}>
          Tap a jersey when you capture it. The small line = shortest native route with that segment.
        </p>
        <p style={{ textAlign: "center", fontSize: 11, color: "#3D4A63", marginTop: 4 }}>
          Combined jerseys: tap repeatedly to cycle full → lap+sprint → lap+KOM → sprint+KOM (partial, in orange) → not captured.
        </p>
        <p style={{ textAlign: "center", fontSize: 11, color: "#3D4A63", marginTop: 4 }}>
          Fan-made tracker, not affiliated with Zwift or World Bicycle Relief.
        </p>
      </main>
    </div>
  );
}
