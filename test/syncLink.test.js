import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSyncHash, personalLink, resolveSyncLink, switchSyncCode } from "../src/syncLink.js";
import { createStore } from "../src/store.js";
import { fakeServer, memStorage, device } from "./helpers.js";

test("parseSyncHash reads codes forgivingly and ignores non-codes", () => {
  assert.deepEqual(parseSyncHash("#7KQ2-M9XD-4RTA"), { code: "7KQ2M9XD4RTA" });
  assert.deepEqual(parseSyncHash("#7kq2m9xd4rta"), { code: "7KQ2M9XD4RTA" });
  assert.deepEqual(parseSyncHash("#7KQ2%20M9XD%204RTA"), { code: "7KQ2M9XD4RTA" });
  assert.deepEqual(parseSyncHash("#7KQ2-M9XD-4RTO"), { code: "7KQ2M9XD4RT0" }, "O read as zero");
  assert.equal(parseSyncHash(""), null);
  assert.equal(parseSyncHash("#"), null);
  assert.equal(parseSyncHash("#top"), null, "short anchors are not codes");
  assert.equal(parseSyncHash("#foo=bar&x"), null);
  assert.deepEqual(parseSyncHash("#7KQ2-M9XD-4RT"), { invalid: true, raw: "7KQ2-M9XD-4RT" }, "one char short");
  assert.deepEqual(parseSyncHash("#7KQ2-M9XD-4RTU"), { invalid: true, raw: "7KQ2-M9XD-4RTU" }, "U isn't in the alphabet");
  assert.equal(parseSyncHash("#%E0%A4%A"), null, "malformed escapes don't throw");
});

test("personalLink builds a link on the current site", () => {
  const loc = { origin: "https://virtualjerseyhunt.namatech.eu", pathname: "/" };
  assert.equal(personalLink("7KQ2M9XD4RTA", loc), "https://virtualjerseyhunt.namatech.eu/#7KQ2-M9XD-4RTA");
  const pages = { origin: "https://mariusconjeaud.github.io", pathname: "/zwift-jersey-tracker/" };
  assert.equal(personalLink("7KQ2M9XD4RTA", pages), "https://mariusconjeaud.github.io/zwift-jersey-tracker/#7KQ2-M9XD-4RTA");
});

async function profileWith(api, ids = ["wa-hl"]) {
  const A = device(api);
  ids.forEach((id) => A.store.toggle(id, false));
  const p = await A.store.createSync("Marius");
  return { A, code: p.code };
}

test("unlinked device with nothing ticked: links straight away", async () => {
  const api = fakeServer();
  const { code } = await profileWith(api, ["wa-hl", "wa-jl"]);
  const B = device(api);
  const r = await resolveSyncLink(B.store, code);
  assert.equal(r.kind, "linked");
  assert.equal(B.s().sync.code, code);
  assert.equal(B.s().earned["wa-jl"], 1);
});

test("unlinked device whose jerseys are all in the synced copy: links straight away", async () => {
  const api = fakeServer();
  const { code } = await profileWith(api, ["wa-hl", "wa-jl"]);
  const B = device(api);
  B.store.toggle("wa-hl", false);
  assert.equal((await resolveSyncLink(B.store, code)).kind, "linked");
});

test("unlinked device with its own jerseys: asks merge or replace, changes nothing yet", async () => {
  const api = fakeServer();
  const { code } = await profileWith(api);
  const B = device(api);
  B.store.toggle("fr-vt", false);
  const r = await resolveSyncLink(B.store, code);
  assert.equal(r.kind, "choose");
  assert.equal(r.info.localOnly, 1);
  assert.equal(r.info.profile.username, "Marius");
  assert.equal(B.s().sync, null, "not linked until the user chooses");
  await B.store.link(r.info.profile, "merge");
  await B.t.runAll();
  assert.equal(api.db.get(code).progress, "wa-hl,fr-vt");
});

test("already linked to that code: nothing changes, it just syncs", async () => {
  const api = fakeServer();
  const { A, code } = await profileWith(api);
  const before = api.calls.length;
  const r = await resolveSyncLink(A.store, code);
  assert.equal(r.kind, "same");
  assert.equal(A.s().sync.code, code);
  assert.ok(api.calls.length >= before, "a refresh may run");
  assert.ok(!api.calls.slice(before).some(([k]) => k === "create" || k === "remove"));
});

test("linked to a different code: asks, then switching keeps the old progress on the server", async () => {
  const api = fakeServer();
  const { code: mine } = await profileWith(api, ["wa-hl"]);
  const B = device(api);
  B.store.toggle("lo-kh", false);
  const { code: theirs } = await B.store.createSync("Partner");

  const r = await resolveSyncLink(B.store, mine);
  assert.equal(r.kind, "switch");
  assert.deepEqual(r.from, { code: theirs, username: "Partner" });
  assert.equal(B.s().sync.code, theirs, "nothing switched before the user agrees");

  const done = await switchSyncCode(B.store, r.info);
  assert.deepEqual(done, { ok: true });
  assert.equal(B.s().sync.code, mine);
  assert.equal(B.s().earned["wa-hl"], 1);
  assert.equal(B.s().earned["lo-kh"], undefined, "device now shows the new code's progress");
  assert.equal(api.db.get(theirs).progress, "lo-kh", "old code's progress is untouched");
  assert.equal(api.db.get(mine).progress, "wa-hl", "and nothing leaked into the new one");
});

test("switching is refused while the current code has unsynced changes", async () => {
  const api = fakeServer();
  const { code: mine } = await profileWith(api);
  const B = device(api);
  await B.store.createSync("Partner");
  const r = await resolveSyncLink(B.store, mine);
  api.setDown(true);
  B.store.toggle("ny-cp", false);
  const done = await switchSyncCode(B.store, r.info);
  assert.deepEqual(done, { ok: false, reason: "unsynced" });
  assert.notEqual(B.s().sync.code, mine);
  assert.equal(B.s().earned["ny-cp"], 1);
});

test("switching is allowed when the current code was deleted", async () => {
  const api = fakeServer();
  const { code: mine } = await profileWith(api);
  const B = device(api);
  const { code: gone } = await B.store.createSync("Partner");
  const r = await resolveSyncLink(B.store, mine);
  api.db.delete(gone);
  B.store.toggle("ny-cp", false);
  assert.deepEqual(await switchSyncCode(B.store, r.info), { ok: true });
  assert.equal(B.s().sync.code, mine);
});

test("bad or deleted code: reports it and leaves the device as it is", async () => {
  const api = fakeServer();
  const B = device(api);
  B.store.toggle("wa-hl", false);
  const r = await resolveSyncLink(B.store, "ABCDEFGHJKMN");
  assert.equal(r.kind, "missing");
  assert.equal(B.s().sync, null);
  assert.equal(B.s().earned["wa-hl"], 1);

  const { store: C } = device(api);
  const { code } = await C.createSync("C");
  const r2 = await resolveSyncLink(C, "ABCDEFGHJKMN");
  assert.equal(r2.kind, "missing");
  assert.equal(C.getState().sync.code, code, "a linked device stays linked");
});

test("server unreachable: reports it and changes nothing", async () => {
  const api = fakeServer();
  const { code } = await profileWith(api);
  const B = device(api);
  api.setDown(true);
  const r = await resolveSyncLink(B.store, code);
  assert.equal(r.kind, "unreachable");
  assert.equal(B.s().sync, null);
});

test("site without sync: the link can't be used", async () => {
  const s = createStore({ storage: memStorage(), api: null });
  assert.equal((await resolveSyncLink(s, "7KQ2M9XD4RTA")).kind, "unavailable");
});
