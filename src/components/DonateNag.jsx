import { useState } from "react";
import { DONATE_URL } from "../config.js";

const font = "'Barlow Condensed','Arial Narrow',sans-serif";
const btn = {
  padding: "8px 14px", borderRadius: 8, border: "1px solid #2A3550", background: "#0F1626",
  color: "#AEBDD8", fontSize: 13, cursor: "pointer", textDecoration: "none", display: "inline-block",
};
const donateBtn = { ...btn, background: "#F5A623", borderColor: "#F5A623", color: "#1A1205", fontWeight: 700 };

/** The "please donate" card. Shown by App when it's due; it never blocks the app. */
export function DonateNag({ onDonated, onDismiss }) {
  const [clicked, setClicked] = useState(false);
  return (
    <section aria-label="Support World Bicycle Relief" style={{
      marginTop: 14, padding: "12px 14px", borderRadius: 14,
      background: "linear-gradient(135deg, rgba(245,166,35,0.14), rgba(245,166,35,0.04))",
      border: "1px solid rgba(245,166,35,0.45)",
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>🚲</span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: font, fontWeight: 800, fontSize: 19, letterSpacing: 0.5, textTransform: "uppercase", margin: 0 }}>
            {clicked ? "Thank you!" : "Enjoying Jersey Hunt?"}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#C9D4E8", lineHeight: 1.45 }}>
            {clicked
              ? "Once you've donated, tap “I've donated” and this won't show again, on any of your synced devices."
              : "It's free and has no ads. If it's helped your hunt, consider a donation to World Bicycle Relief: they get sturdy real-world Buffalo bikes to students, health workers and entrepreneurs in rural communities."}
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {!clicked && (
              <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" onClick={() => setClicked(true)} style={donateBtn}>
                Donate to WBR ↗
              </a>
            )}
            <button onClick={onDonated} style={btn}>I've donated</button>
            <button onClick={onDismiss} style={{ ...btn, color: "#7E93B5" }}>Not now</button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function DonateThanks({ onClose }) {
  return (
    <div role="status" style={{
      marginTop: 14, padding: "10px 14px", borderRadius: 14, display: "flex", alignItems: "center", gap: 10,
      background: "rgba(62,204,95,0.08)", border: "1px solid #3ECC5F66", fontSize: 13, color: "#C9D4E8",
    }}>
      <span aria-hidden="true">💛</span>
      <span style={{ flex: 1 }}>Thank you for supporting World Bicycle Relief. Happy hunting!</span>
      <button onClick={onClose} aria-label="Close"
        style={{ background: "none", border: "none", color: "#5B6B87", fontSize: 18, cursor: "pointer", padding: "0 2px" }}>×</button>
    </div>
  );
}

/** Always-on, low-key link at the bottom of the page. */
export function DonateFooter({ donated }) {
  return (
    <p style={{ textAlign: "center", fontSize: 12.5, color: "#7E93B5", marginTop: 22 }}>
      {donated ? "Thanks for supporting World Bicycle Relief 💛 " : "Like Jersey Hunt? "}
      <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#F5A623" }}>
        {donated ? "Donate again ↗" : "Support World Bicycle Relief ↗"}
      </a>
    </p>
  );
}
