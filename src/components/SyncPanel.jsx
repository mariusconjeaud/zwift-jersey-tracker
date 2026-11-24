import { useRef, useState } from "react";
import { encode, decode, isEmpty } from "../codec.js";
import { normalizeCode, formatCode } from "../api.js";
import { personalLink } from "../syncLink.js";
import { btnS, primaryBtn, dangerBtn, inputS, h2S, pS, mono, copyText } from "./ui.js";
import MergeChoice from "./MergeChoice.jsx";

export { btnS };

function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return new Date(ts).toLocaleDateString();
}

const errText = (e) =>
  e && e.status === 0 ? "Can't reach the sync server. Check your connection and try again." : (e && e.message) || "Something went wrong";

function SyncSection({ state, store, say }) {
  const [name, setName] = useState("");
  const [codeIn, setCodeIn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [choice, setChoice] = useState(null); // result of fetchProfile awaiting merge/replace
  const [renaming, setRenaming] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    const n = name.trim();
    if (!n) { setErr("Pick a nickname first."); return; }
    await store.createSync(n);
    setName("");
    say("Sync code created");
  });

  const lookup = () => run(async () => {
    const code = normalizeCode(codeIn);
    if (!code) { setErr("A sync code looks like ABCD-EFGH-JKMN (12 letters and digits)."); return; }
    let info;
    try {
      info = await store.fetchProfile(code);
    } catch (e) {
      if (e.status === 404) { setErr("No progress found for that code. Check for typos."); return; }
      throw e;
    }
    if (info.localEmpty || info.localOnly === 0) {
      await store.link(info.profile, "merge");
      setCodeIn("");
      say(`Linked to ${info.profile.username}'s progress`);
    } else {
      setChoice(info);
    }
  });

  const confirmLink = (mode) => run(async () => {
    const info = choice;
    setChoice(null);
    await store.link(info.profile, mode);
    setCodeIn("");
    say(mode === "merge" ? "Linked and merged" : `Now using ${info.profile.username}'s progress`);
  });

  const saveName = () => run(async () => {
    const n = (renaming || "").trim();
    if (!n) return;
    await store.rename(n);
    setRenaming(null);
    say("Nickname updated");
  });

  const unlink = () => {
    if (window.confirm("Unlink this device? Your progress stays here, it just stops syncing.")) {
      store.unlink();
      say("Device unlinked");
    }
  };

  const del = () => {
    const who = state.sync.username;
    if (!window.confirm(
      `Delete the cloud copy of ${who}'s progress?\n\nThe sync code stops working on every device. ` +
      "Progress already on your devices stays there.",
    )) return;
    run(async () => {
      await store.deleteCloud();
      say("Cloud copy deleted");
    });
  };

  if (!state.sync) {
    return (
      <div>
        <h2 style={h2S}>Sync across devices</h2>
        <p style={pS}>
          Get a sync code to see your progress on your phone, tablet and computer.
          No account, no email: just a nickname.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32}
            placeholder="Nickname" aria-label="Nickname" autoComplete="nickname"
            style={{ ...inputS, flex: "2 1 160px" }} />
          <button type="submit" disabled={busy} style={{ ...primaryBtn, flex: "1 1 140px" }}>Get a sync code</button>
        </form>

        <p style={{ ...pS, marginTop: 12 }}>Already have a code from another device?</p>
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <input value={codeIn} onChange={(e) => setCodeIn(e.target.value)} maxLength={20}
            placeholder="XXXX-XXXX-XXXX" aria-label="Sync code" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            style={{ ...inputS, flex: "2 1 160px", fontFamily: mono, letterSpacing: 1 }} />
          <button type="submit" disabled={busy} style={{ ...btnS, flex: "1 1 140px" }}>Link this device</button>
        </form>

        {choice && <MergeChoice info={choice} busy={busy} onChoose={confirmLink} onCancel={() => setChoice(null)} />}
        {err && <p style={{ ...pS, color: "#F5A623" }}>{err}</p>}
      </div>
    );
  }

  const { sync, status } = state;
  const link = personalLink(sync.code);
  const statusLine = {
    synced: "Synced " + timeAgo(sync.syncedAt),
    pending: "Saving…",
    syncing: "Syncing…",
    offline: "Offline: changes are saved here and will sync when you're back online.",
    error: state.error || "Sync failed",
  }[status] || "";

  return (
    <div>
      <h2 style={h2S}>Sync across devices</h2>
      {renaming === null ? (
        <p style={{ ...pS, color: "#EAF0FA" }}>
          Synced as <b>{sync.username}</b>{" "}
          <button onClick={() => setRenaming(sync.username)}
            style={{ background: "none", border: "none", color: "#7E93B5", cursor: "pointer", fontSize: 12.5, padding: 0, textDecoration: "underline" }}>
            rename
          </button>
        </p>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); saveName(); }} style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={32} aria-label="Nickname" autoFocus
            style={{ ...inputS, flex: "2 1 160px" }} />
          <button type="submit" disabled={busy} style={btnS}>Save</button>
          <button type="button" onClick={() => setRenaming(null)} style={btnS}>Cancel</button>
        </form>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <code style={{
          flex: "1 1 auto", padding: "8px 12px", borderRadius: 8, background: "#0B111C", border: "1px solid #22304A",
          fontFamily: mono, fontSize: 19, letterSpacing: 2, color: "#3ECC5F", userSelect: "all", textAlign: "center",
        }}>
          {formatCode(sync.code)}
        </code>
        <button onClick={async () => say((await copyText(formatCode(sync.code))) ? "Sync code copied" : "Select the code and copy it manually")}
          style={btnS}>Copy</button>
      </div>

      <p style={{ ...pS, marginTop: 10, color: "#C9D4E8" }}>Your personal link</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
        <a href={link} title="Open your personal link (then bookmark it)" style={{
          flex: "1 1 220px", minWidth: 0, padding: "8px 10px", borderRadius: 8, background: "#0B111C", border: "1px solid #22304A",
          fontFamily: mono, fontSize: 12.5, color: "#8FB8FF", overflowWrap: "anywhere", textDecoration: "none",
        }}>
          {link}
        </a>
        <button onClick={async () => say((await copyText(link)) ? "Link copied" : "Select the link and copy it manually")}
          style={btnS}>Copy</button>
      </div>
      <p style={pS}>
        Enter the code or open the link on your other devices. Bookmark the link to get back to your progress in one tap.
        Anyone who has the code or the link can see and change this progress, so keep them to yourself.
      </p>
      <p style={{ ...pS, color: status === "offline" || status === "error" ? "#F5A623" : "#5B7F5E" }} aria-live="polite">
        {statusLine}
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={() => store.syncNow()} disabled={status === "syncing"} style={btnS}>Sync now</button>
        <button onClick={unlink} style={btnS}>Unlink this device</button>
        <button onClick={del} disabled={busy} style={dangerBtn}>Delete cloud copy</button>
      </div>
      {err && <p style={{ ...pS, color: "#F5A623" }}>{err}</p>}
    </div>
  );
}

function BackupSection({ state, store, say }) {
  const [codeIn, setCodeIn] = useState("");
  const code = encode(state.earned);

  const restore = () => {
    if (!codeIn.trim()) return;
    if (normalizeCode(codeIn) && store.syncEnabled) {
      say("That's a sync code: use “Link this device” above");
      return;
    }
    const next = decode(codeIn);
    if (isEmpty(next)) { say("That code doesn't contain any jerseys"); return; }
    if (!isEmpty(state.earned) && !window.confirm("Replace your current progress with the one in this code?")) return;
    store.replaceProgress(next);
    setCodeIn("");
    say("Progress restored");
  };

  return (
    <div>
      <h2 style={h2S}>Backup code</h2>
      <p style={{ ...pS, color: state.saved ? "#8CA0C0" : "#F5A623" }}>
        {state.saved
          ? "A copy of your progress you can keep anywhere. Paste it back below to restore. Codes from the original Jersey Hunt artifact work too."
          : "This browser can't save automatically. Copy the code below after a session and paste it back to restore."}
      </p>
      <div style={{
        marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#0B111C",
        border: "1px solid #22304A", fontSize: 11.5, color: "#8CA0C0", wordBreak: "break-all",
        maxHeight: 80, overflowY: "auto", userSelect: "all",
      }}>
        {code || "(nothing captured yet)"}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button onClick={async () => say((await copyText(code)) ? "Code copied" : "Select the code and copy it manually")}
          disabled={!code} style={btnS}>Copy code</button>
        {!state.saved && (
          <button onClick={() => say(store.retrySave() ? "Saved" : "Still unavailable, use the code")} style={btnS}>Retry saving</button>
        )}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); restore(); }} style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input value={codeIn} onChange={(e) => setCodeIn(e.target.value)}
          placeholder="Paste a backup code…" aria-label="Backup code"
          style={{ ...inputS, flex: "3 1 200px" }} />
        <button type="submit" style={{ ...btnS, flex: "1 1 120px" }}>Restore from code</button>
      </form>
    </div>
  );
}

export default function SyncPanel({ state, store }) {
  const [flash, setFlash] = useState("");
  const timer = useRef(null);
  const say = (m) => {
    setFlash(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(""), 2600);
  };
  return (
    <div id="sync-panel" style={{
      marginTop: 14, padding: 12, borderRadius: 14,
      background: "#141C2C", border: "1px solid #2A3550", boxSizing: "border-box",
    }}>
      {store.syncEnabled && (
        <>
          <SyncSection state={state} store={store} say={say} />
          <hr style={{ border: "none", borderTop: "1px solid #22304A", margin: "14px 0" }} />
        </>
      )}
      <BackupSection state={state} store={store} say={say} />
      {store.syncEnabled && (
        <p style={{ ...pS, fontSize: 11.5, color: "#5B6B87", marginTop: 12 }}>
          What syncing stores: your nickname, your jersey list and whether you've told us you donated. No email, no account.
        </p>
      )}
      {flash && <p role="status" style={{ margin: "8px 0 0", fontSize: 12, color: "#3ECC5F" }}>{flash}</p>}
    </div>
  );
}
