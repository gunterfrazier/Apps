import { browser } from "./support/browser-globals";
import assert from "node:assert/strict";
import { test } from "node:test";
import { attachCloud, combineData, detachCloud, getData, mergeData, releaseDeviceData, update, type UserData } from "../src/app/store";
import { friendlyError } from "../src/account/account";
import type { CloudCollection } from "../src/account/types";

const guide = (id: string, title: string, updatedAt: string) => ({ id, title, format: "inductive" as const, lens: "all" as const, translation: "BSB" as const, createdAt: updatedAt, updatedAt, sections: [] });
const data = (raw: Partial<Record<keyof UserData, unknown>>) => mergeData(raw);

/** A pretend account: documents in a Map, with a count of requests. */
function fakeAccount(docs: Record<string, unknown> = {}) {
  const store = new Map(Object.entries(docs));
  const calls = { get: 0, setMany: 0, deleteMany: 0 };
  const collection: CloudCollection = {
    async get() { calls.get++; return { docs: [...store].map(([id, v]) => ({ id, data: () => structuredClone(v) })) }; },
    doc: (id) => ({ set: async (v) => { store.set(id, v); }, delete: async () => { store.delete(id); } }),
    async setMany(entries) { calls.setMany++; for (const [k, v] of entries) store.set(k, v); },
    async deleteMany(ids) { calls.deleteMany++; for (const k of ids) store.delete(k); },
  };
  return { store, calls, collection };
}
const reset = (d: Partial<Record<keyof UserData, unknown>>, flag?: string) => {
  detachCloud();
  browser.storage.clear();
  if (flag) browser.storage.setItem("veritas.logos.synced", flag);
  update(() => data(d));
};
const titles = () => getData().guides.map((g) => g.title).sort();

test("combineData keeps everything, with the later version of anything in both", () => {
  const first = data({ prefs: { theme: "dark" }, guides: [guide("g1", "Old title", "2026-01-01T00:00:00Z"), guide("g2", "Only first", "2026-01-01T00:00:00Z")], highlights: { a: "amber" }, bookmarks: ["x"], notes: { n: { key: "n", ref: "John 1:1", text: "first", updatedAt: "2026-02-01T00:00:00Z" } }, notebook: [{ id: "nb", title: "t", body: "first", tags: [], createdAt: "", updatedAt: "2026-01-01" }] });
  const second = data({ prefs: { theme: "light" }, guides: [guide("g1", "New title", "2026-03-01T00:00:00Z"), guide("g3", "Only second", "2026-01-01T00:00:00Z")], highlights: { a: "rose", b: "green" }, bookmarks: ["x", "y"], notes: { n: { key: "n", ref: "John 1:1", text: "older", updatedAt: "2026-01-01T00:00:00Z" }, m: { key: "m", ref: "John 1:2", text: "m", updatedAt: "2026-01-01T00:00:00Z" } }, notebook: [{ id: "nb", title: "t", body: "second", tags: [], createdAt: "", updatedAt: "2026-05-01" }] });
  const c = combineData(first, second);
  assert.equal(c.prefs.theme, "dark");
  assert.deepEqual(c.guides.map((g) => g.title), ["New title", "Only first", "Only second"]);
  assert.deepEqual(c.highlights, { a: "amber", b: "green" });
  assert.deepEqual(c.bookmarks, ["x", "y"]);
  assert.equal(c.notes.n.text, "first");
  assert.ok(c.notes.m);
  assert.equal(c.notebook[0].body, "second");
});

test("first sign-in on a browser merges its work into the account, then the account is the record", async () => {
  reset({ guides: [guide("local", "Made here", "2026-01-01T00:00:00Z")] });
  const acct = fakeAccount({ profile: { prefs: { theme: "dark" } }, "guide-remote": { guide: guide("remote", "From the account", "2026-01-01T00:00:00Z") } });
  assert.equal(await attachCloud(acct.collection, "account", "user-1"), true);
  assert.deepEqual(titles(), ["From the account", "Made here"]);
  assert.equal(getData().prefs.theme, "dark");
  assert.ok(acct.store.has("guide-local"), "the browser's guide went up to the account");
  assert.equal(browser.storage.getItem("veritas.logos.synced"), "user-1");
  // Deleted on another device: gone here at the next load, not put back.
  acct.store.delete("guide-local");
  detachCloud();
  browser.storage.setItem("veritas.logos.synced", "user-1");
  await attachCloud(acct.collection, "account", "user-1");
  assert.deepEqual(titles(), ["From the account"]);
  assert.ok(!acct.store.has("guide-local"));
});

test("a browser holding another reader's data doesn't pour it into this account", async () => {
  reset({ guides: [guide("theirs", "Someone else's", "2026-01-01T00:00:00Z")], highlights: { k: "rose" } }, "left:user-other");
  const acct = fakeAccount({});
  await attachCloud(acct.collection, "account", "user-1");
  assert.deepEqual(titles(), []);
  assert.deepEqual(getData().highlights, {});
  assert.ok(![...acct.store.keys()].some((k) => k === "guide-theirs"));
});

test("the same reader coming back after keeping data here gets it merged", async () => {
  reset({ guides: [guide("offline", "Written while signed out", "2026-01-01T00:00:00Z")] }, "left:user-1");
  const acct = fakeAccount({ profile: { prefs: {} }, "guide-a": { guide: guide("a", "In the account", "2026-01-01T00:00:00Z") } });
  await attachCloud(acct.collection, "account", "user-1");
  assert.deepEqual(titles(), ["In the account", "Written while signed out"]);
});

test("after deleting an account and keeping the data, the next account starts from it", async () => {
  reset({ guides: [guide("kept", "Kept", "2026-01-01T00:00:00Z")] }, "user-gone");
  releaseDeviceData();
  const acct = fakeAccount({});
  await attachCloud(acct.collection, "account", "user-new");
  assert.deepEqual(titles(), ["Kept"]);
  assert.ok(acct.store.has("guide-kept"));
});

test("changes are saved in one batch and only what changed is sent", async () => {
  reset({});
  const acct = fakeAccount({});
  await attachCloud(acct.collection, "account", "user-1");
  const before = acct.calls.setMany;
  update((d) => ({ ...d, guides: [guide("g1", "One", "2026-01-01T00:00:00Z"), guide("g2", "Two", "2026-01-01T00:00:00Z")] }));
  await new Promise((r) => setTimeout(r, 1000));
  assert.equal(acct.calls.setMany, before + 1);
  assert.ok(acct.store.has("guide-g1") && acct.store.has("guide-g2"));
  update((d) => ({ ...d, guides: d.guides.filter((g) => g.id !== "g1") }));
  await new Promise((r) => setTimeout(r, 1000));
  assert.ok(!acct.store.has("guide-g1"));
  assert.equal(acct.calls.deleteMany, 1);
  detachCloud();
});

test("account errors read as plain sentences", () => {
  assert.match(friendlyError({ code: "invalid_credentials", message: "Invalid login credentials" }), /don't match an account/);
  assert.match(friendlyError({ code: "otp_expired" }), /wrong or has expired/);
  assert.match(friendlyError({ hint: "veritas:too-many", message: "x" }), /2,000 saved items/);
  assert.match(friendlyError({ hint: "veritas:too-big", message: "x" }), /over 25 MB/);
  assert.match(friendlyError({ code: "email_address_not_authorized" }), /can't send email yet/);
  assert.match(friendlyError({ message: "TypeError: Failed to fetch" }), /Couldn't reach/);
});
