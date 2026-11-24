import { formatCode } from "../api.js";
import { btnS, primaryBtn, pS, mono } from "./ui.js";
import MergeChoice from "./MergeChoice.jsx";

const font = "'Barlow Condensed','Arial Narrow',sans-serif";
const codeS = { fontFamily: mono, letterSpacing: 1, whiteSpace: "nowrap" };

function Card({ tone = "info", title, children, onClose }) {
  const color = { info: "#2E7CE2", ok: "#3ECC5F", warn: "#F5A623" }[tone];
  return (
    <section role={tone === "warn" ? "alert" : "status"} aria-label={title} style={{
      marginTop: 14, padding: "12px 14px", borderRadius: 14, position: "relative",
      background: color + "14", border: "1px solid " + color + "77",
    }}>
      {onClose && (
        <button onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: "#5B6B87", fontSize: 18, cursor: "pointer" }}>×</button>
      )}
      <h2 style={{ fontFamily: font, fontWeight: 800, fontSize: 18, letterSpacing: 0.5, textTransform: "uppercase", margin: 0, paddingRight: 24 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

const Row = ({ children }) => <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{children}</div>;
const Err = ({ text }) => text ? <p style={{ ...pS, color: "#F5A623" }}>{text}</p> : null;

/** What happened, or what to decide, after opening a personal sync link. */
export default function LinkPrompt({ prompt, busy, actions }) {
  if (!prompt) return null;
  const { kind, code, info } = prompt;
  const who = info && info.profile.username;
  const shown = code && <span style={codeS}>{formatCode(code)}</span>;

  switch (kind) {
    case "loading":
      return <Card title="Opening sync link…"><p style={pS}>Looking up {shown}.</p></Card>;

    case "linked":
      return (
        <Card tone="ok" title={prompt.switched ? `Switched to ${who}` : `Synced as ${who}`} onClose={actions.close}>
          <p style={{ ...pS, color: "#C9D4E8" }}>
            {[
              prompt.switched && "This device now shows this progress. The progress it showed before is still saved under its own code.",
              prompt.merged && "This device's jerseys were merged in.",
              "Bookmark this page to get back to your progress in one tap.",
            ].filter(Boolean).join(" ")}
          </p>
        </Card>
      );

    case "choose":
      return (
        <Card title={`Open ${who}'s progress?`}>
          <MergeChoice info={info} busy={busy} onChoose={actions.choose} onCancel={actions.decline} />
          <Err text={prompt.error} />
        </Card>
      );

    case "switch":
      return (
        <Card tone="warn" title={`Switch to ${who}'s progress?`}>
          <p style={{ ...pS, color: "#C9D4E8" }}>
            This link opens <b>{who}</b>'s progress ({shown}). This device is synced as <b>{prompt.from.username}</b>{" "}
            (<span style={codeS}>{formatCode(prompt.from.code)}</span>). If you switch, {prompt.from.username}'s progress stays
            saved under its own code.
          </p>
          <Row>
            <button onClick={actions.switchCode} disabled={busy} style={primaryBtn}>Switch to {who}</button>
            <button onClick={actions.decline} disabled={busy} style={btnS}>Keep {prompt.from.username}</button>
          </Row>
          <Err text={prompt.error} />
        </Card>
      );

    case "missing":
      return (
        <Card tone="warn" title="Sync code not found" onClose={actions.close}>
          <p style={{ ...pS, color: "#C9D4E8" }}>
            No progress is saved under {shown}. It may have been deleted, or the link is incomplete. Nothing changed on this device.
          </p>
        </Card>
      );

    case "invalid":
      return (
        <Card tone="warn" title="That link isn't right" onClose={actions.close}>
          <p style={{ ...pS, color: "#C9D4E8" }}>
            “<span style={codeS}>{prompt.raw}</span>” isn't a valid sync code. A code has 12 letters and digits, like
            {" "}<span style={codeS}>7KQ2-M9XD-4RTA</span>. Nothing changed on this device.
          </p>
        </Card>
      );

    case "unreachable":
      return (
        <Card tone="warn" title="Couldn't open the sync link">
          <p style={{ ...pS, color: "#C9D4E8" }}>
            The sync server can't be reached right now, so {shown} couldn't be loaded. Nothing changed on this device.
          </p>
          <Row>
            <button onClick={actions.retry} style={primaryBtn}>Try again</button>
            <button onClick={actions.decline} style={btnS}>Dismiss</button>
          </Row>
        </Card>
      );

    case "unavailable":
      return (
        <Card tone="warn" title="Sync isn't available here" onClose={actions.close}>
          <p style={{ ...pS, color: "#C9D4E8" }}>This version of the site has no sync server, so sync links can't be opened.</p>
        </Card>
      );

    default:
      return null;
  }
}
