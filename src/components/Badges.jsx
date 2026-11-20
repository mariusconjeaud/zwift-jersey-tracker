import { useEffect, useMemo, useRef, useState } from "react";
import { BADGE_GROUPS, computeBadges, nextUp } from "../badges.js";

const font = "'Barlow Condensed','Arial Narrow',sans-serif";
const GOLD = "#F5C542";
const OPEN_KEY = "zwift-jersey-hunt-badges-open";

function readOpen() {
  try { return window.localStorage.getItem(OPEN_KEY) === "1"; } catch { return false; }
}
function writeOpen(v) {
  try { window.localStorage.setItem(OPEN_KEY, v ? "1" : "0"); } catch { /* per-device nicety only */ }
}

function Medal({ b, size = 38 }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
      fontSize: size * 0.5, lineHeight: 1,
      background: b.done ? "radial-gradient(circle at 35% 30%, #FFE8A3, #F5C542 45%, #B9831F)" : "#0F1626",
      border: "1.5px solid " + (b.done ? "#FFE8A3" : "#2A3550"),
      boxShadow: b.done ? "0 0 10px rgba(245,197,66,0.35)" : "none",
    }}>
      <span style={{ filter: b.done ? "none" : "grayscale(1)", opacity: b.done ? 1 : 0.45 }}>{b.icon}</span>
    </span>
  );
}

function Bar({ value, done, height = 5, label }) {
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
      style={{ flex: 1, height, borderRadius: height, background: "#1A2231", overflow: "hidden", display: "block" }}>
      <span style={{
        display: "block", height: "100%", width: `${Math.max(value * 100, value > 0 ? 3 : 0)}%`, transition: "width .4s",
        background: done ? GOLD : "linear-gradient(90deg,#B9831F,#F5C542)",
      }} />
    </span>
  );
}

function Tile({ b }) {
  return (
    <li title={b.desc} style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, listStyle: "none",
      border: "1px solid " + (b.done ? "rgba(245,197,66,0.55)" : "#2A3550"),
      background: b.done ? "rgba(245,197,66,0.08)" : "#0F1626",
    }}>
      <Medal b={b} />
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2, color: b.done ? "#FFF3CF" : "#C9D4E8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {b.name}
        </span>
        <span style={{ fontSize: 10.5, color: "#7E93B5", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {b.desc}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
          <Bar value={b.ratio} done={b.done} label={b.name} />
          <span style={{ fontSize: 10.5, color: b.done ? GOLD : "#8CA0C0", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {b.done ? "Unlocked" : `${b.have}/${b.need}`}
          </span>
        </span>
      </span>
    </li>
  );
}

const gridS = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 8, padding: 0, margin: 0 };
const labelS = { fontSize: 10.5, color: "#5B6B87", textTransform: "uppercase", letterSpacing: 0.6, margin: "12px 2px 6px" };

function UnlockToast({ badges, onClose }) {
  const one = badges.length === 1;
  return (
    <div role="status" onClick={onClose} style={{
      position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 20,
      width: "max-content", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box",
      display: "flex", alignItems: "center", gap: 12, padding: "10px 16px 10px 10px", borderRadius: 14, cursor: "pointer",
      background: "#1A2231", border: "1px solid " + GOLD, boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
      animation: "badge-pop .35s ease-out",
    }}>
      <Medal b={{ ...badges[0], done: true }} size={44} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 11, color: GOLD, textTransform: "uppercase", letterSpacing: 0.8 }}>
          {one ? "Badge unlocked" : `${badges.length} badges unlocked`}
        </span>
        <span style={{ display: "block", fontFamily: font, fontWeight: 800, fontSize: 20, letterSpacing: 0.4, color: "#FFF3CF" }}>
          {one ? badges[0].name : badges.map((b) => b.name).join(" · ")}
        </span>
        {one && <span style={{ display: "block", fontSize: 11.5, color: "#8CA0C0" }}>{badges[0].desc}</span>}
      </span>
    </div>
  );
}

export default function Badges({ earned }) {
  const computed = useMemo(() => computeBadges(earned), [earned]);
  const [open, setOpen] = useState(readOpen);
  const [toast, setToast] = useState(null);
  const prevDone = useRef(null);
  const toastTimer = useRef(null);

  const done = computed.filter((b) => b.done);
  const doneKey = done.map((b) => b.id).join("|");

  // Celebrate badges that unlock while the app is open (not the ones you already had).
  useEffect(() => {
    const now = new Set(doneKey ? doneKey.split("|") : []);
    if (prevDone.current) {
      const fresh = computed.filter((b) => b.done && !prevDone.current.has(b.id));
      if (fresh.length) {
        setToast(fresh);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 4500);
      }
    }
    prevDone.current = now;
  }, [doneKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const toggle = () => setOpen((o) => { writeOpen(!o); return !o; });
  const up = nextUp(computed, 3);

  return (
    <section aria-labelledby="badges-title" style={{ background: "#141C2C", border: "1px solid #2A3550", borderRadius: 14, marginTop: 14, padding: "12px 12px 10px" }}>
      <button onClick={toggle} aria-expanded={open} aria-controls="badge-list"
        style={{ width: "100%", display: "flex", alignItems: "baseline", justifyContent: "space-between", background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0 2px" }}>
        <span id="badges-title" style={{ fontFamily: font, fontWeight: 800, fontSize: 21, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Badges
        </span>
        <span style={{ fontFamily: font, fontWeight: 600, fontSize: 17, color: done.length ? GOLD : "#8CA0C0" }}>
          {done.length}/{computed.length} {open ? "▾" : "▸"}
        </span>
      </button>
      <span style={{ display: "flex", margin: "8px 2px 0" }}>
        <Bar value={computed.length ? done.length / computed.length : 0} done={done.length === computed.length} height={8} label="Badges unlocked" />
      </span>

      <div id="badge-list">
        {open ? (
          BADGE_GROUPS.map((g) => (
            <div key={g}>
              <p style={labelS}>{g}</p>
              <ul style={gridS}>{computed.filter((b) => b.group === g).map((b) => <Tile key={b.id} b={b} />)}</ul>
            </div>
          ))
        ) : (
          <>
            {done.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 2px 0" }} aria-label="Unlocked badges">
                {done.map((b) => (
                  <button key={b.id} onClick={toggle} title={`${b.name}: ${b.desc}`} aria-label={b.name}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                    <Medal b={b} size={30} />
                  </button>
                ))}
              </div>
            )}
            {up.length > 0 && (
              <>
                <p style={labelS}>{done.length ? "Next up" : "Tick jerseys to unlock badges"}</p>
                <ul style={gridS}>{up.map((b) => <Tile key={b.id} b={b} />)}</ul>
              </>
            )}
          </>
        )}
      </div>

      <button onClick={toggle}
        style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#7E93B5", fontSize: 12.5, cursor: "pointer" }}>
        {open ? "Show less ▴" : `Show all ${computed.length} badges ▾`}
      </button>

      {toast && <UnlockToast badges={toast} onClose={() => setToast(null)} />}
    </section>
  );
}
