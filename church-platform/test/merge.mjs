// The three-way merge two preview tabs use when they save at once (mergeSaved in src/js/20-store.js).
// Run: node test/merge.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const src = readFileSync(new URL("../src/js/20-store.js", import.meta.url), "utf8");
const start = src.indexOf("function mergeSaved("), end = src.indexOf("\nconst S = {", start);
const mergeSaved = new Function(`${src.slice(start, end)}; return mergeSaved;`)();
const clone = (x) => JSON.parse(JSON.stringify(x));

const base = {
  v: 2, current: "c1", prefs: { theme: "light", bibleT: "BSB" },
  churches: { c1: { id: "c1", name: "Riverside" }, c2: { id: "c2", name: "Hillside" } },
  users: { u1: { id: "u1", name: "Dana" } },
  docs: [{ id: "d1", title: "Vine", blocks: [{ id: "b1", text: "A" }] }, { id: "d2", title: "Light", blocks: [] }],
  reportRuns: [], notifications: [{ id: "n1", title: "Hi" }],
};
let pass = 0;
const check = (name, fn) => { fn(); pass++; console.log(`ok ${name}`); };

check("a report run the other tab added survives this tab's edit (the duplicate-report bug)", () => {
  const theirs = clone(base); theirs.reportRuns.push({ id: "r1", period: "2026-11-23" }); theirs.notifications.push({ id: "n2", title: "Report ready" });
  const mine = clone(base); mine.docs[0].blocks.push({ id: "b2", text: "B" });
  const m = mergeSaved(base, theirs, mine);
  assert.deepEqual(m.reportRuns.map((x) => x.id), ["r1"]);
  assert.deepEqual(m.notifications.map((x) => x.id), ["n1", "n2"]);
  assert.equal(m.docs[0].blocks.length, 2);
});
check("each side's edit to a different record is kept", () => {
  const theirs = clone(base); theirs.docs[1].title = "Light of the world";
  const mine = clone(base); mine.docs[0].title = "The vine";
  const m = mergeSaved(base, theirs, mine);
  assert.equal(m.docs[0].title, "The vine"); assert.equal(m.docs[1].title, "Light of the world");
});
check("both edited the same record: this tab's newer save wins", () => {
  const theirs = clone(base); theirs.docs[0].title = "Theirs";
  const mine = clone(base); mine.docs[0].title = "Mine";
  assert.equal(mergeSaved(base, theirs, mine).docs[0].title, "Mine");
});
check("deletes: an untouched record deleted on one side is gone; one the other side changed is kept", () => {
  const theirs = clone(base); theirs.docs = theirs.docs.filter((d) => d.id !== "d2"); theirs.docs[0].title = "Edited there";
  const mine = clone(base); mine.docs = mine.docs.filter((d) => d.id !== "d1");
  const m = mergeSaved(base, theirs, mine);
  assert.deepEqual(m.docs.map((d) => [d.id, d.title]), [["d1", "Edited there"]]);
});
check("both added records: all of them, theirs first", () => {
  const theirs = clone(base); theirs.docs.push({ id: "d3", title: "T", blocks: [] });
  const mine = clone(base); mine.docs.push({ id: "d4", title: "M", blocks: [] });
  assert.deepEqual(mergeSaved(base, theirs, mine).docs.map((d) => d.id), ["d1", "d2", "d3", "d4"]);
});
check("maps merge by key: churches, users and prefs", () => {
  const theirs = clone(base); theirs.churches.c2.name = "Hillside Chapel"; theirs.prefs.theme = "dark";
  const mine = clone(base); mine.churches.c1.name = "Riverside Community"; mine.users.u2 = { id: "u2", name: "Lee" }; mine.prefs.bibleT = "KJV";
  const m = mergeSaved(base, theirs, mine);
  assert.equal(m.churches.c1.name, "Riverside Community"); assert.equal(m.churches.c2.name, "Hillside Chapel");
  assert.equal(m.users.u2.name, "Lee"); assert.deepEqual(m.prefs, { theme: "dark", bibleT: "KJV" });
});
check("values: whoever changed it; both changed: mine", () => {
  const theirs = clone(base); theirs.current = "c2";
  assert.equal(mergeSaved(base, theirs, clone(base)).current, "c2");
  const mine = clone(base); mine.current = "c1x";
  assert.equal(mergeSaved(base, theirs, mine).current, "c1x");
});
check("nothing changed on this side: exactly theirs", () => {
  const theirs = clone(base); theirs.docs[0].blocks[0].text = "Z"; theirs.notifications = [];
  assert.deepEqual(mergeSaved(base, theirs, clone(base)), theirs);
});
console.log(`${pass} merge checks passed`);
