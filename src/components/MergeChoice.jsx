import { btnS, primaryBtn, pS } from "./ui.js";

/** "This device has jerseys that aren't in X's progress": merge, replace or cancel. */
export default function MergeChoice({ info, busy, onChoose, onCancel }) {
  const n = info.localOnly;
  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#0B111C", border: "1px solid #F5A62366" }}>
      <p style={{ ...pS, marginTop: 0, color: "#EAF0FA" }}>
        This device has {n} jersey{n === 1 ? "" : "s"} that {n === 1 ? "isn't" : "aren't"} in{" "}
        <b>{info.profile.username}</b>'s progress ({info.remoteCount} captured).
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={() => onChoose("merge")} disabled={busy} style={primaryBtn}>Merge both</button>
        <button onClick={() => onChoose("replace")} disabled={busy} style={btnS}>Use synced progress only</button>
        <button onClick={onCancel} disabled={busy} style={btnS}>Cancel</button>
      </div>
    </div>
  );
}
