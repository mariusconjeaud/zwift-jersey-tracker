import { test } from "node:test";
import assert from "node:assert/strict";
import { encode, decode, union, applyOps, diffOps, sameProgress, countCaptured } from "../src/codec.js";

test("encode/decode round trip, including the Vidéo list", () => {
  const e = { "wa-hl": 1, "ny-cmb": "rs", __video: [{ n: "Eggum Sprint", place: "Eggum Coastal", t: "spr" }] };
  const code = encode(e);
  assert.match(code, /^wa-hl,ny-cmb:rs\|V:/);
  assert.deepEqual(decode(code), e);
});

test("decode accepts codes from the original artifact and drops junk", () => {
  const d = decode("wa-hl, wa-cmb  nope-id,ny-cmb:bogus,wa-alpe:full");
  assert.equal(d["wa-hl"], 1);
  assert.equal(d["wa-cmb"], "full", "combined without state = full");
  assert.equal(d["ny-cmb"], "full", "unknown combined state = full");
  assert.equal(d["wa-alpe"], 1, "non-combined ids ignore a state");
  assert.equal(d["nope-id"], undefined);
  assert.deepEqual(decode("").__video, []);
  assert.deepEqual(decode("wa-hl|V:%%%").__video, []);
});

test("union keeps everything captured on either side", () => {
  const a = { "wa-hl": 1, "ny-cmb": "rs", "pa-cmb": "sk", __video: [{ n: "A", place: "", t: "spr" }] };
  const b = { "wa-jl": 1, "ny-cmb": "rk", "pa-cmb": "full", __video: [{ n: "a", place: "", t: "spr" }, { n: "B", place: "", t: "kom" }] };
  const u = union(a, b);
  assert.equal(u["wa-hl"], 1);
  assert.equal(u["wa-jl"], 1);
  assert.equal(u["ny-cmb"], "full", "lap+sprint ∪ lap+KOM = all three parts");
  assert.equal(u["pa-cmb"], "full");
  assert.deepEqual(u.__video.map((v) => v.n), ["A", "B"], "case-insensitive de-dupe");
  assert.equal(union({ "ny-cmb": "rs" }, {})["ny-cmb"], "rs");
});

test("diffOps + applyOps reproduce the target", () => {
  const from = { "wa-hl": 1, "ny-cmb": "rs", __video: [] };
  const to = { "wa-jl": 1, "ny-cmb": "full", __video: [{ n: "X", place: "", t: "lap" }] };
  const ops = diffOps(from, to);
  assert.deepEqual(ops, { "wa-hl": null, "wa-jl": 1, "ny-cmb": "full", __video: to.__video });
  assert.ok(sameProgress(applyOps(from, ops), to));
  assert.deepEqual(diffOps(to, to), {});
  assert.equal(countCaptured(to), 2);
});
