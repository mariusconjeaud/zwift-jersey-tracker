import { useMemo } from "react";

// ————— Tiny jersey SVG —————
export default function Jersey({ style, earned, combo = null, size = 34 }) {
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const body = "M9 5 L15 2 Q20 6 25 2 L31 5 L38 13 L31 17 L31 30 L9 30 L9 17 L2 13 Z";
  const fills = {
    orange: "#F5842B", green: "#3ECC5F", skoda: "#0E7C3A",
    teal: "#1B5E5A", khaki: "#9A9166", fuego: "#D93A1E",
    dotsred: "#FFFFFF", dotsblue: "#FFFFFF", dotspink: "#FFFFFF",
    volcano: "#F5842B", watt: "#7B4DFF", combo: "#F5842B",
  };
  const dotCol = { dotsred: "#E23A2E", dotsblue: "#2E7CE2", dotspink: "#F06AA8" }[style];
  const fill = earned ? fills[style] : "#232C3E";
  return (
    <svg width={size} height={(size * 32) / 40} viewBox="0 0 40 32" aria-hidden="true" style={{ flexShrink: 0 }}>
      <defs><clipPath id={`c${uid}`}><path d={body} /></clipPath></defs>
      <path d={body} fill={fill} stroke={earned ? "rgba(255,255,255,0.35)" : "#33405A"} strokeWidth="1.4" />
      {earned && dotCol && (
        <g clipPath={`url(#c${uid})`}>
          {[6, 14, 22, 30, 38].map((x) =>
            [7, 15, 23].map((y) => (
              <circle key={x + "-" + y} cx={x + ((y / 8) % 2 ? 4 : 0)} cy={y} r="2.2" fill={dotCol} />
            ))
          )}
        </g>
      )}
      {earned && style === "combo" && (() => {
        const dots = (x0, w) => (
          <g key="d">
            <rect x={x0} y="0" width={w} height="32" fill="#FFFFFF" />
            {[5, 13, 21, 29, 37].filter((x) => x >= x0 - 4 && x <= x0 + w + 4).map((x) =>
              [7, 15, 23].map((y) => (
                <circle key={x + "-" + y} cx={x} cy={y} r="2" fill="#E23A2E" />
              ))
            )}
          </g>
        );
        const band = (x0, w, fill) => <rect key={"b" + x0} x={x0} y="0" width={w} height="32" fill={fill} />;
        let parts;
        if (combo === "rs") parts = [band(20, 20, "#3ECC5F")];
        else if (combo === "rk") parts = [dots(20, 20)];
        else if (combo === "sk") parts = [band(0, 20, "#3ECC5F"), dots(20, 20)];
        else parts = [band(0, 13, "#F5842B"), band(13, 14, "#3ECC5F"), dots(27, 13)];
        return <g clipPath={`url(#c${uid})`}>{parts}</g>;
      })()}
      {earned && style === "skoda" && (
        <rect x="0" y="13" width="40" height="4" fill="rgba(255,255,255,0.55)" clipPath={`url(#c${uid})`} />
      )}
      {earned && style === "khaki" && (
        <circle cx="20" cy="17" r="3.2" fill="#F2EFE3" clipPath={`url(#c${uid})`} />
      )}
      {earned && style === "teal" && (
        <path d="M13 30 L20 15 L27 30 Z" fill="#0C3330" clipPath={`url(#c${uid})`} />
      )}
      {earned && style === "fuego" && (
        <path d="M20 12 Q24 19 20 27 Q16 19 20 12 Z" fill="#FFC244" clipPath={`url(#c${uid})`} />
      )}
      {earned && style === "volcano" && (
        <g clipPath={`url(#c${uid})`}>
          <path d="M14 28 L20 16 L26 28 Z" fill="#1B1B1B" />
        </g>
      )}
      {earned && style === "watt" && (
        <path d="M21 8 L15 19 L19 19 L17 27 L25 15 L21 15 Z" fill="#FFE14D" clipPath={`url(#c${uid})`} />
      )}
    </svg>
  );
}
