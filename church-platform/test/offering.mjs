// Checks offering counters and depositors (supabase/upgrade-31.sql) in an in-memory Postgres (PGlite), using the real
// records table, its policies and rec_read/rec_write from supabase/schema.sql: counters see and enter only an open
// batch's cash and checks and nobody's other giving; a second counter (not the one who counted) verifies; a depositor
// closes a verified batch in their own name; a closed batch can't be reopened; treasurers still see everything.
// Run: node test/offering.mjs   (needs @electric-sql/pglite: npm i -g @electric-sql/pglite, or set PGLITE_DIR)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

let PGlite;
for (const from of [process.env.PGLITE_DIR, undefined, "/usr/local/lib/node_modules", join(process.env.HOME || "", ".npm-global/lib/node_modules")]) {
  try { ({ PGlite } = await import(from ? join(from, "@electric-sql/pglite/dist/index.js") : "@electric-sql/pglite")); break; } catch { /* try the next place */ }
}
if (!PGlite) { console.log("skipped: @electric-sql/pglite isn't installed"); process.exit(0); }

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "..", "supabase", "schema.sql"), "utf8");
const table = (name) => { const i = schema.indexOf(`create table ${name} (`); return schema.slice(i, schema.indexOf("\n);", i) + 3); };
const fn = (name) => { const i = schema.search(new RegExp(`create or replace function (public\\.)?${name}\\(`)); return schema.slice(i, schema.indexOf("$$;", schema.indexOf("$$", i) + 2) + 3); };
const policy = (name) => { const i = schema.indexOf(`create policy "${name}" on records`); return schema.slice(i, schema.indexOf(";", i) + 1); };

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated;
  ${["profiles", "churches", "roles", "locations", "memberships", "records"].map(table).join("\n")}
  ${["is_primary", "church_live", "is_member", "device_perms", "can", "sees_location", "offering_batch"].map(fn).join("\n")}
  -- Not what these rules are about: off.
  create function collects(e text) returns boolean language sql as $$ select false $$;
  create function leads(g text) returns boolean language sql as $$ select false $$;
  create function on_team(c text, t text) returns boolean language sql as $$ select false $$;
  create function in_channel(c text, ch text) returns boolean language sql as $$ select false $$;
  create function security_access(c text, u uuid) returns int language sql as $$ select 0 $$;
  create function volunteer_preapproved(c text) returns boolean language sql as $$ select false $$;
  ${fn("rec_read")}
  ${fn("rec_write")}
  alter table records enable row level security;
  ${["read records", "add records", "change records", "remove records"].map(policy).join("\n")}
  grant select, insert, update, delete on records to authenticated;
`);
// The upgrade itself must also run on a database that has the old rules.
const upgrade = readFileSync(join(here, "..", "supabase", "upgrade-31.sql"), "utf8");
await db.exec(upgrade);

const U = { owner: "00000000-0000-0000-0000-000000000001", cam: "00000000-0000-0000-0000-000000000002", cora: "00000000-0000-0000-0000-000000000003",
  dee: "00000000-0000-0000-0000-000000000004", tess: "00000000-0000-0000-0000-000000000005", gabe: "00000000-0000-0000-0000-000000000006" };
await db.exec(`
  insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(",")};
  insert into churches (id, handle, name, owner_id) values ('grace', 'grace', 'Grace', '${U.owner}');
  insert into roles (church_id, key, name, rank, perms) values ('grace', 'counter', 'Offering counter', 20, '{"count.offering": true}'),
    ('grace', 'depositor', 'Depositor', 25, '{"deposit.offering": true}'), ('grace', 'treasurer', 'Treasurer', 40, '{"view.giving": true}'), ('grace', 'member', 'Member', 10, '{}');
  insert into memberships (church_id, user_id, role_key) values ('grace', '${U.cam}', 'counter'), ('grace', '${U.cora}', 'counter'),
    ('grace', '${U.dee}', 'depositor'), ('grace', '${U.tess}', 'treasurer'), ('grace', '${U.gabe}', 'member');
  -- Last month's deposited batch, and an online gift: no counter or depositor should see them.
  insert into records (kind, id, church_id, owner, data) values
    ('batches', 'b-old', 'grace', null, '{"status": "closed", "date": "2026-10-25"}'),
    ('gifts', 'g-old', 'grace', '${U.gabe}', '{"batchId": "b-old", "method": "check", "amount": 500, "name": "Gabe", "recordedBy": "${U.tess}"}'),
    ('gifts', 'g-online', 'grace', '${U.gabe}', '{"method": "card", "amount": 75, "name": "Gabe"}');
`);
const as = async (who, sql, params) => {
  await db.exec(`reset role; select set_config('test.uid', '${who || ""}', false); set role authenticated;`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); }
};
const fails = async (p) => { try { await p; return false; } catch (e) { return e.message || true; } };
const gifts = (who) => as(who, "select id from records where kind = 'gifts' order by id").then((r) => r.map((x) => x.id));
// Refused either way: no row it may change (the batch as it was), or an error (the batch as it would become).
const batch = (who, status, extra = {}) => as(who, "update records set data = data || $1::jsonb where kind = 'batches' and id = 'b1' returning data->>'status' as s", [JSON.stringify({ status, ...extra })]).catch(() => []);
const addGift = (who, id, d) => as(who, "insert into records (kind, id, church_id, owner, data) values ('gifts', $1, 'grace', null, $2::jsonb)", [id, JSON.stringify({ batchId: "b1", recordedBy: who, ...d })]);

let n = 0;
const step = async (name, f) => { await f(); n++; console.log(`ok  ${name}`); };

await step("counters see no one's giving until there's a batch to count", async () => {
  assert.deepEqual(await gifts(U.cam), []);
  assert.deepEqual(await gifts(U.dee), []);
  assert.deepEqual(await gifts(U.tess), ["g-old", "g-online"]);
  assert.deepEqual(await gifts(U.gabe), ["g-old", "g-online"]); // their own
});
await step("a counter starts a batch and enters cash and checks into it", async () => {
  await as(U.cam, "insert into records (kind, id, church_id, data) values ('batches', 'b1', 'grace', '{\"status\": \"open\", \"date\": \"2026-11-29\"}')");
  await addGift(U.cam, "g1", { method: "cash", amount: 240, name: "Loose cash" });
  await addGift(U.cam, "g2", { method: "check", amount: 100, name: "Ana", checkNo: "1042" });
  assert.deepEqual(await gifts(U.cam), ["g1", "g2"]);
  assert.deepEqual(await gifts(U.cora), ["g1", "g2"]);
  assert.ok(await fails(addGift(U.cam, "g3", { method: "card", amount: 5 })), "only cash and checks");
  assert.ok(await fails(addGift(U.cam, "g4", { method: "cash", amount: 5, recordedBy: U.cora })), "in their own name");
  assert.ok(await fails(as(U.cam, "insert into records (kind, id, church_id, data) values ('gifts', 'g5', 'grace', $1::jsonb)", [JSON.stringify({ batchId: "b-old", method: "cash", amount: 1, recordedBy: U.cam })])), "not into a closed batch");
  assert.ok(await fails(addGift(U.gabe, "g6", { method: "cash", amount: 1 })), "members can't");
  assert.deepEqual(await gifts(U.dee), [], "depositors wait until it's counted");
});
await step("the counter marks it counted; the same counter can't verify their own count", async () => {
  assert.deepEqual(await batch(U.cam, "counted", { countedBy: U.cam }), [{ s: "counted" }]);
  assert.ok(await fails(addGift(U.cam, "g7", { method: "cash", amount: 1 })), "no new gifts once it's counted");
  assert.deepEqual(await batch(U.cam, "verified", { countedBy: U.cam, verifiedBy: U.cam }), [], "dual control");
  assert.deepEqual(await gifts(U.dee), ["g1", "g2"], "depositors see a counted batch");
});
await step("a second counter verifies; depositors can't close one that isn't verified", async () => {
  assert.deepEqual(await batch(U.cora, "verified", { verifiedBy: U.cora }), [{ s: "verified" }]);
  assert.deepEqual(await batch(U.cam, "closed", { depositedBy: U.cam }), [], "counters don't deposit");
  assert.deepEqual(await batch(U.dee, "closed", { depositedBy: U.cora }), [], "a deposit is in your own name");
});
await step("the depositor closes it; then counters and depositors lose sight of its gifts and can't reopen it", async () => {
  assert.deepEqual(await batch(U.dee, "closed", { depositedBy: U.dee, depositRef: "DEP-1100" }), [{ s: "closed" }]);
  assert.deepEqual(await gifts(U.cam), []);
  assert.deepEqual(await gifts(U.dee), []);
  assert.deepEqual(await batch(U.cam, "open"), [], "a counter can't reopen it");
  assert.equal((await as(U.cam, "select data->>'status' as s from records where kind = 'batches' and id = 'b1'"))[0].s, "closed", "but still sees the batch and its totals");
  assert.ok(await fails(as(U.cam, "update records set data = data || '{\"amount\": 1}' where kind = 'gifts' and id = 'g1' returning id").then((r) => { if (!r.length) throw new Error("no row"); })));
  assert.deepEqual(await gifts(U.tess), ["g-old", "g-online", "g1", "g2"], "the treasurer sees everything");
});
await step("counters delete only an open batch", async () => {
  await as(U.cam, "insert into records (kind, id, church_id, data) values ('batches', 'b2', 'grace', '{\"status\": \"open\"}')");
  assert.equal((await as(U.cam, "delete from records where kind = 'batches' and id = 'b2' returning id")).length, 1);
  assert.equal((await as(U.cam, "delete from records where kind = 'batches' and id = 'b1' returning id")).length, 0);
});
console.log(`${n} offering checks passed`);
