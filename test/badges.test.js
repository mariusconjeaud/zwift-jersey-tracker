import { test } from "node:test";
import assert from "node:assert/strict";
import { BADGES, BADGE_GROUPS, computeBadges, nextUp } from "../src/badges.js";
import { ALL_IDS, ALL_SEGS, CMB_IDS, W } from "../src/catalog.js";

const byId = (list) => Object.fromEntries(list.map((b) => [b.id, b]));
const everything = () => Object.fromEntries(ALL_IDS.map((id) => [id, CMB_IDS.has(id) ? "full" : 1]));

test("badge definitions are sound", () => {
  const ids = BADGES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  const known = new Set(ALL_IDS);
  for (const b of BADGES) {
    assert.ok(BADGE_GROUPS.includes(b.group), b.id + " group");
    assert.ok(b.name && b.icon && b.desc, b.id + " has name, icon, desc");
    for (const id of b.ids || []) assert.ok(known.has(id), `${b.id} refers to unknown jersey ${id}`);
  }
  assert.equal(BADGES.filter((b) => b.id.startsWith("clear-")).length, W.length, "one clear badge per world");
});

test("nothing is unlocked at the start; everything is unlocked at the end", () => {
  assert.equal(computeBadges({}).filter((b) => b.done).length, 0);
  const all = computeBadges(everything());
  assert.deepEqual(all.filter((b) => !b.done).map((b) => b.id), []);
});

test("Jet Lagged: one jersey per world, Bologna excused, combined doesn't count", () => {
  const e = {};
  for (const w of W) {
    if (w.name === "Bologna") continue;
    e[w.segs.find((s) => s[2] !== "cmb")[0]] = 1;
  }
  let b = byId(computeBadges(e))["one-of-each"];
  assert.equal(b.done, true);
  assert.equal(b.need, W.length - 1);
  delete e["pa-ce"];
  e["pa-cmb"] = "full";
  b = byId(computeBadges(e))["one-of-each"];
  assert.equal(b.done, false);
  assert.equal(b.have, W.length - 2);
});

test("world clear ignores the combined jersey; The Full English needs every combined at full", () => {
  const yorkshire = ALL_SEGS.filter((s) => s[0].startsWith("yo-") && s[2] !== "cmb").map((s) => s[0]);
  const e = Object.fromEntries(yorkshire.map((id) => [id, 1]));
  const c = byId(computeBadges(e));
  assert.equal(c["clear-Yorkshire"].done, true);
  assert.equal(c["clear-Yorkshire"].need, 6);

  const cmb = Object.fromEntries([...CMB_IDS].map((id) => [id, "full"]));
  assert.equal(byId(computeBadges(cmb))["all-cmb"].done, true);
  cmb["ny-cmb"] = "rs";
  const partial = byId(computeBadges(cmb))["all-cmb"];
  assert.equal(partial.done, false);
  assert.equal(partial.have, CMB_IDS.size - 1);
});

test("milestones, sets and Ouhlala count the right jerseys", () => {
  const e = { "wa-fu": 1, "wa-fur": 1, "lo-kh": 1, "wa-cmb": "full" };
  const c = byId(computeBadges(e));
  assert.equal(c.first.done, true);
  assert.equal(c.j10.have, 4 - 1, "combined isn't a jersey for milestones");
  assert.equal(c.fuego.done, true);
  assert.equal(c.pink.done, false);
  assert.equal(c.pink.have, 1);
  assert.equal(c.ouhlala.need, 18 + 8);
  assert.equal(c["all-spr"].need, ALL_SEGS.filter((s) => s[2] === "spr").length);
});

test("nextUp picks the closest locked badges", () => {
  const e = { "wa-fu": 1, "lo-kh": 1 };
  const up = nextUp(computeBadges(e), 3).map((b) => b.id);
  assert.deepEqual(up, ["pink", "fuego", "j10"], "1/2, 1/2 (definition order), then 2/10");
  assert.equal(nextUp(computeBadges(everything())).length, 0);
});
