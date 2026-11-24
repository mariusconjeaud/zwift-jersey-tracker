// Small shared styles and helpers for the sync UI.

export const btnS = {
  padding: "8px 14px", borderRadius: 8, border: "1px solid #2A3550", background: "#0F1626",
  color: "#AEBDD8", fontSize: 13, cursor: "pointer",
};
export const primaryBtn = { ...btnS, border: "1px solid #3ECC5F", background: "rgba(62,204,95,0.12)", color: "#3ECC5F", fontWeight: 600 };
export const dangerBtn = { ...btnS, color: "#E2766E", borderColor: "#4A2A30" };
export const inputS = {
  padding: "9px 10px", borderRadius: 8, boxSizing: "border-box", minWidth: 0,
  background: "#0B111C", border: "1px solid #22304A", color: "#EAF0FA", fontSize: 13,
};
export const h2S = {
  fontFamily: "'Barlow Condensed','Arial Narrow',sans-serif", fontWeight: 800, fontSize: 17,
  letterSpacing: 0.5, textTransform: "uppercase", margin: 0, color: "#EAF0FA",
};
export const pS = { margin: "4px 0 0", fontSize: 12.5, color: "#8CA0C0", lineHeight: 1.45 };
export const mono = "ui-monospace,Menlo,monospace";

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
