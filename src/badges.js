// Achievement badges. They are worked out from the jersey progress every time,
// so nothing extra is stored or synced, and un-ticking a jersey can re-lock one.

import { W } from "./catalog.js";

const jerseys = (segs) => segs.filter((s) => s[2] !== "cmb").map((s) => s[0]);
const ALL_JERSEYS = jerseys(W.flatMap((w) => w.segs));
const ofType = (t) => W.flatMap((w) => w.segs).filter((s) => s[2] === t).map((s) => s[0]);
const worldJerseys = (name) => jerseys((W.find((w) => w.name === name) || { segs: [] }).segs);
const COMBINED = ofType("cmb");

const have = (earned, ids) => ids.filter((id) => earned[id]).length;

/** A badge for holding every jersey in `ids`. */
const set = (ids) => ({ ids, progress: (e) => [have(e, ids), ids.length] });
const milestone = (n) => ({ progress: (e) => [Math.min(have(e, ALL_JERSEYS), n), n] });

// One per world. A world added to the catalog later still gets a (plain) badge.
const WORLD_BADGES = {
  Watopia: ["Volcano Landlord", "🌋"],
  "Makuri Islands": ["Shogun of Makuri", "⛩️"],
  France: ["Le Patron", "🥖"],
  Paris: ["Champs-ion", "🗼"],
  London: ["Mind the Gap", "💂"],
  "New York": ["Big Apple Core", "🍎"],
  Richmond: ["Filthy Richmond", "💰"],
  Innsbruck: ["Strudel Supremo", "🏔️"],
  Yorkshire: ["Flat Cap Legend", "🧢"],
  Scotland: ["Laird of the Loch", "🦄"],
  "Crit City": ["Crit Happens", "🏙️"],
  Bologna: ["Full Bolognese", "🍝"],
};

const ONE_OF_EACH_WORLDS = W.map((w) => w.name).filter((n) => n !== "Bologna");

export const BADGE_GROUPS = ["Milestones", "Worlds", "Collections", "Sets"];

export const BADGES = [
  // ——— Milestones ———
  { id: "first", group: "Milestones", icon: "👕", name: "Fresh Laundry", desc: "Your first jersey", ...milestone(1) },
  { id: "j10", group: "Milestones", icon: "🧺", name: "Laundry Day", desc: "10 jerseys", ...milestone(10) },
  { id: "j25", group: "Milestones", icon: "🙈", name: "Wardrobe Malfunction", desc: "25 jerseys", ...milestone(25) },
  { id: "j50", group: "Milestones", icon: "🐿️", name: "Kit Hoarder", desc: "50 jerseys", ...milestone(50) },
  { id: "j100", group: "Milestones", icon: "🐉", name: "Lycra Dragon", desc: "100 jerseys", ...milestone(100) },
  { id: "all", group: "Milestones", icon: "👑", name: "Nothing Left to Wear", desc: `All ${ALL_JERSEYS.length} jerseys`, ...milestone(ALL_JERSEYS.length) },

  // ——— Worlds ———
  {
    id: "one-of-each", group: "Worlds", icon: "✈️", name: "Jet Lagged",
    desc: "At least one jersey in every world (Bologna excused)",
    progress: (e) => [ONE_OF_EACH_WORLDS.filter((n) => have(e, worldJerseys(n)) > 0).length, ONE_OF_EACH_WORLDS.length],
  },
  ...W.map((w) => {
    const [name, icon] = WORLD_BADGES[w.name] || [`${w.name} Cleared`, "🏆"];
    return { id: "clear-" + w.name, group: "Worlds", icon, name, desc: `Every ${w.name} jersey`, ...set(worldJerseys(w.name)) };
  }),
  { id: "ouhlala", group: "Worlds", icon: "🥐", name: "Ouhlala", desc: "Every France and Paris jersey", ...set([...worldJerseys("France"), ...worldJerseys("Paris")]) },

  // ——— Collections ———
  { id: "all-spr", group: "Collections", icon: "💚", name: "Green With Envy", desc: "Every sprint jersey", ...set(ofType("spr")) },
  { id: "all-kom", group: "Collections", icon: "🤒", name: "Chickenpox", desc: "Every KOM jersey: polka dots everywhere", ...set(ofType("kom")) },
  { id: "all-lap", group: "Collections", icon: "🚧", name: "Human Traffic Cone", desc: "Every lap jersey", ...set(ofType("lap")) },
  {
    id: "all-cmb", group: "Collections", icon: "🍳", name: "The Full English", desc: "Every combined jersey, fully combined",
    progress: (e) => [COMBINED.filter((id) => e[id] === "full").length, COMBINED.length],
  },

  // ——— Sets ———
  { id: "uci", group: "Sets", icon: "🌈", name: "Rainbow Wannabe", desc: "All 6 UCI course laps: Richmond, Innsbruck, Yorkshire, both ways", ...set(["ri-uc", "ri-ucr", "in-ul", "in-ulr", "yo-uw", "yo-uwr"]) },
  { id: "pink", group: "Sets", icon: "🦩", name: "Tickled Pink", desc: "Keith Hill and Leith Hill, the pink polka dots", ...set(["lo-kh", "lo-lh"]) },
  { id: "fuego", group: "Sets", icon: "🐃", name: "Buffalo Herd", desc: "Fuego Flats in both directions", ...set(["wa-fu", "wa-fur"]) },
];

/** Every badge with its progress: { ...badge, have, need, done, ratio }. */
export function computeBadges(earned) {
  return BADGES.map((b) => {
    const [h, need] = b.progress(earned);
    return { ...b, have: h, need, done: need > 0 && h >= need, ratio: need ? h / need : 0 };
  });
}

/** The locked badges closest to unlocking. */
export function nextUp(computed, n = 4) {
  return computed
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.done)
    .sort((x, y) => y.b.ratio - x.b.ratio || x.i - y.i)
    .slice(0, n)
    .map(({ b }) => b);
}
