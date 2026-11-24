import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore, STORE_KEY } from "../src/store.js";
import { encode } from "../src/codec.js";
import { fakeServer, memStorage, device } from "./helpers.js";

test("local-only: toggles persist to storage and survive a reload", () => {
  const storage = memStorage();
  const a = createStore({ storage, api: null });
  a.toggle("wa-hl", false);
  a.toggle("ny-cmb", true); // full
  a.toggle("ny-cmb", true); // rs
  assert.equal(a.getState().status, "local");
  const b = createStore({ storage, api: null });
  assert.equal(b.getState().earned["wa-hl"], 1);
  assert.equal(b.getState().earned["ny-cmb"], "rs");
  a.toggle("wa-hl", false);
  assert.equal(a.getState().earned["wa-hl"], undefined);
});

test("storage failures are reported, not thrown", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  const s = createStore({ storage: broken, api: null });
  assert.equal(s.getState().saved, false);
  s.toggle("wa-hl", false);
  assert.equal(s.getState().earned["wa-hl"], 1);
});

test("create a sync code, then a second device links and both stay in step", async () => {
  const api = fakeServer();
  const A = device(api);
  A.store.toggle("wa-hl", false);
  A.store.dismissNag();
  const p = await A.store.createSync("Rider");
  assert.equal(api.db.get(p.code).progress, "wa-hl");
  assert.ok(api.db.get(p.code).nagDismissedAt);
  assert.equal(A.s().status, "synced");

  const B = device(api);
  const info = await B.store.fetchProfile(p.code);
  assert.equal(info.remoteCount, 1);
  assert.equal(info.localEmpty, true);
  await B.store.link(info.profile, "merge");
  assert.equal(B.s().earned["wa-hl"], 1);
  assert.equal(B.s().sync.username, "Rider");
  assert.ok(B.s().donation.nagDismissedAt, "nag snooze follows the code");

  B.store.toggle("wa-jl", false);
  assert.equal(B.s().status, "pending");
  await B.t.runAll();
  assert.equal(api.db.get(p.code).progress, "wa-hl,wa-jl");
  assert.equal(B.s().status, "synced");

  await A.store.refresh();
  assert.equal(A.s().earned["wa-jl"], 1, "A pulls B's change");
});

test("concurrent edits on two devices are both kept, un-ticks included", async () => {
  const api = fakeServer();
  const A = device(api);
  A.store.toggle("wa-hl", false);
  A.store.toggle("wa-jl", false);
  const { code } = await A.store.createSync("R");
  const B = device(api);
  await B.store.link((await B.store.fetchProfile(code)).profile);

  // Both edit without seeing each other's change.
  A.store.toggle("wa-alpe", false); // add
  B.store.toggle("wa-hl", false);   // remove
  B.store.toggle("ny-cmb", true);   // add combined
  await A.t.runAll();
  await B.t.runAll(); // 409 -> rebase -> retry

  assert.equal(api.db.get(code).progress, "wa-jl,wa-alpe,ny-cmb:full");
  assert.ok(api.calls.some(([k, , b]) => k === "patch" && b?.baseRev === 2), "B rebased onto A's write");
  await A.store.syncNow();
  assert.equal(encode(A.s().earned), "wa-jl,wa-alpe,ny-cmb:full");
  assert.equal(encode(B.s().earned), "wa-jl,wa-alpe,ny-cmb:full");
  assert.deepEqual(A.s().pending, {});
  assert.deepEqual(B.s().pending, {});
});

test("linking a device that already has progress: merge vs replace", async () => {
  const api = fakeServer();
  const A = device(api);
  A.store.toggle("wa-hl", false);
  const { code } = await A.store.createSync("R");

  const B = device(api);
  B.store.toggle("wa-jl", false);
  B.store.setVideo([{ n: "Eggum Sprint", place: "", t: "spr" }]);
  const info = await B.store.fetchProfile(code);
  assert.equal(info.localEmpty, false);
  assert.equal(info.localOnly, 2);
  await B.store.link(info.profile, "merge");
  await B.t.runAll();
  assert.match(api.db.get(code).progress, /^wa-hl,wa-jl\|V:/);

  const C = device(api);
  C.store.toggle("fr-vt", false);
  await C.store.link((await C.store.fetchProfile(code)).profile, "replace");
  assert.equal(C.s().earned["fr-vt"], undefined);
  assert.equal(C.s().earned["wa-jl"], 1);
});

test("offline: changes queue up, survive a reload and push when back", async () => {
  const api = fakeServer();
  const storage = memStorage();
  const A = device(api, { storage });
  const { code } = await A.store.createSync("R");
  api.setDown(true);
  A.store.toggle("wa-hl", false);
  await A.t.runOnce(); // the debounced push fails
  assert.equal(A.s().status, "offline");
  assert.ok(A.t.delays().some((d) => d >= 5000), "retry is scheduled with backoff");

  // App closed and reopened while still offline.
  const A2 = device(api, { storage });
  assert.deepEqual(Object.keys(A2.s().pending), ["wa-hl"]);
  assert.equal(A2.s().status, "pending");
  api.setDown(false);
  await A2.store.refresh();
  assert.equal(api.db.get(code).progress, "wa-hl");
  assert.equal(A2.s().status, "synced");
});

test("donation: 'I have donated' syncs and other devices learn it", async () => {
  const api = fakeServer();
  const A = device(api);
  const { code } = await A.store.createSync("R");
  const B = device(api);
  await B.store.link((await B.store.fetchProfile(code)).profile);

  A.store.markDonated();
  assert.equal(A.s().metaDirty, true);
  await A.t.runAll();
  assert.ok(api.db.get(code).donatedAt);
  assert.equal(A.s().metaDirty, false);

  await B.store.refresh();
  assert.ok(B.s().donation.donatedAt);
});

test("donation recorded before linking is pushed on link", async () => {
  const api = fakeServer();
  const A = device(api);
  const { code } = await A.store.createSync("R");
  const B = device(api);
  B.store.markDonated(); // local only for now
  await B.store.link((await B.store.fetchProfile(code)).profile);
  await B.t.runAll();
  assert.ok(api.db.get(code).donatedAt);
});

test("restore from backup code and reset sync as normal edits", async () => {
  const api = fakeServer();
  const A = device(api);
  const { code } = await A.store.createSync("R");
  A.store.replaceProgress({ "wa-hl": 1, "pa-cmb": "sk", __video: [] });
  await A.t.runAll();
  assert.equal(api.db.get(code).progress, "wa-hl,pa-cmb:sk");
  A.store.replaceProgress({ __video: [] });
  await A.t.runAll();
  assert.equal(api.db.get(code).progress, "");
});

test("deleted code: error status, then unlink keeps local progress", async () => {
  const api = fakeServer();
  const A = device(api);
  A.store.toggle("wa-hl", false);
  const { code } = await A.store.createSync("R");
  api.db.delete(code);
  A.store.toggle("wa-jl", false);
  await A.t.runAll();
  assert.equal(A.s().status, "error");
  assert.match(A.s().error, /no longer exists/);
  A.store.unlink();
  assert.equal(A.s().sync, null);
  assert.equal(A.s().earned["wa-jl"], 1);
});

test("deleteCloud removes the server copy", async () => {
  const api = fakeServer();
  const A = device(api);
  const { code } = await A.store.createSync("R");
  await A.store.deleteCloud();
  assert.equal(api.db.has(code), false);
  assert.equal(A.s().sync, null);
});

test("rename updates the nickname", async () => {
  const api = fakeServer();
  const A = device(api);
  const { code } = await A.store.createSync("R");
  await A.store.rename("New name");
  assert.equal(api.db.get(code).username, "New name");
  assert.equal(A.s().sync.username, "New name");
});

test("persisted state uses the backup-code format", async () => {
  const storage = memStorage();
  const s = createStore({ storage, api: null });
  s.toggle("wa-hl", false);
  assert.equal(JSON.parse(storage.m.get(STORE_KEY)).progress, "wa-hl");
});
