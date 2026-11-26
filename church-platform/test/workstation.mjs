// Checks workstation PINs and automatic lock (supabase/upgrade-30.sql) in an in-memory Postgres (PGlite), using the
// real tables and permission functions from supabase/schema.sql: setting a PIN (and refusing easy ones), that only a
// hash is kept, checking a PIN with the 5-try lockout, the sign-in log, admins switching someone off, the names on the
// lock screen, and a person's own lock time staying within the church's limits.
// Run: node test/workstation.mjs   (needs @electric-sql/pglite: npm i -g @electric-sql/pglite, or set PGLITE_DIR)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let PGlite, pgcrypto;
for (const from of [process.env.PGLITE_DIR, undefined, "/usr/local/lib/node_modules", join(process.env.HOME || "", ".npm-global/lib/node_modules")]) {
  try {
    ({ PGlite } = await import(from ? join(from, "@electric-sql/pglite/dist/index.js") : "@electric-sql/pglite"));
    ({ pgcrypto } = await import(from ? join(from, "@electric-sql/pglite/dist/contrib/pgcrypto.js") : "@electric-sql/pglite/contrib/pgcrypto"));
    break;
  } catch { /* try the next place */ }
}
if (!PGlite) { try { ({ PGlite } = require("@electric-sql/pglite")); } catch { console.log("skipped: @electric-sql/pglite isn't installed"); process.exit(0); } }

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "..", "supabase", "schema.sql"), "utf8");
const table = (name) => { const i = schema.indexOf(`create table ${name} (`); return schema.slice(i, schema.indexOf("\n);", i) + 3); };
const fn = (name) => { const i = schema.search(new RegExp(`create or replace function (public\\.)?${name}\\(`)); return schema.slice(i, schema.indexOf("$$;", schema.indexOf("$$", i) + 2) + 3); };
const upgrade = readFileSync(join(here, "..", "supabase", "upgrade-30.sql"), "utf8");

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema extensions; create extension pgcrypto schema extensions;
  grant usage on schema public, auth, extensions to authenticated, service_role;
  ${["profiles", "churches", "roles", "locations", "memberships"].map(table).join("\n")}
  ${["is_primary", "church_live", "is_member", "device_perms", "can"].map(fn).join("\n")}
`);
await db.exec(upgrade);

const U = { owner: "00000000-0000-0000-0000-000000000001", ana: "00000000-0000-0000-0000-000000000002", ben: "00000000-0000-0000-0000-000000000003",
  pc: "00000000-0000-0000-0000-000000000004", outsider: "00000000-0000-0000-0000-000000000005" };
await db.exec(`
  insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(",")};
  insert into profiles (id, name) values ('${U.ana}', 'Ana'), ('${U.ben}', 'Ben');
  insert into churches (id, handle, name, owner_id) values ('grace', 'grace', 'Grace', '${U.owner}'), ('other', 'other', 'Other', '${U.outsider}');
  insert into roles (church_id, key, name, rank, perms) values ('grace', 'staff', 'Staff', 40, '{"manage.people": true}'), ('grace', 'member', 'Member', 10, '{}');
  insert into memberships (church_id, user_id, role_key) values ('grace', '${U.ana}', 'staff'), ('grace', '${U.ben}', 'member'), ('grace', '${U.pc}', 'device:workstation');
`);
const as = async (who, sql, params) => {
  await db.exec(`reset role; select set_config('test.uid', '${who || ""}', false); set role ${who === "server" ? "service_role" : "authenticated"};`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); }
};
const fails = async (p) => { try { await p; return false; } catch (e) { return e.message; } };
const check = (who, pin) => as("server", "select public.workstation_check_pin('grace', $1, $2, 'pc1') as r", [who, pin]).then((r) => r[0].r);

let n = 0;
const step = async (name, f) => { await f(); n++; console.log(`ok  ${name}`); };

await step("members set their own 6-digit PIN; easy ones, devices and outsiders are refused", async () => {
  for (const bad of ["12345", "abcdef", "111111", "123456", "654321", "890123"]) assert.ok(await fails(as(U.ana, "select public.set_my_pin('grace', $1)", [bad])), bad);
  await as(U.ana, "select public.set_my_pin('grace', '480215')");
  await as(U.ben, "select public.set_my_pin('grace', '730594')");
  assert.ok(await fails(as(U.pc, "select public.set_my_pin('grace', '480215')")), "a workstation can't have a PIN");
  assert.ok(await fails(as(U.outsider, "select public.set_my_pin('grace', '480215')")));
  assert.equal((await as(U.ana, "select public.my_pin('grace') as r"))[0].r.set, true);
});
await step("only a hash is kept, and nobody reads the table directly", async () => {
  const rows = (await db.query("select pin_hash from workstation_pins")).rows;
  assert.ok(rows.every((r) => r.pin_hash.startsWith("$2") && !r.pin_hash.includes("480215")));
  assert.ok(await fails(as(U.ana, "select * from workstation_pins")));
  assert.ok(await fails(as(U.ana, "select public.workstation_check_pin('grace', $1, '480215', 'x')", [U.ana])), "only the server checks PINs");
  assert.ok(await fails(as(U.pc, "select * from public.workstation_people('grace')")), "only the server lists names");
});
await step("the lock screen lists people with a PIN, with their role", async () => {
  const people = await as("server", "select * from public.workstation_people('grace')");
  assert.deepEqual(people.map((p) => [p.name, p.role]), [["Ana", "Staff"], ["Ben", "Member"]]);
});
await step("a right PIN signs in and is logged; five wrong ones lock the name for 15 minutes", async () => {
  assert.equal((await check(U.ana, "480215")).ok, true);
  assert.equal((await db.query("select count(*)::int as n from workstation_signins where user_id = $1", [U.ana])).rows[0].n, 1);
  const first = await check(U.ben, "000000"); assert.equal(first.ok, false); assert.equal(first.left, 4);
  for (let i = 0; i < 4; i++) await check(U.ben, "000000");
  const locked = await check(U.ben, "730594"); assert.equal(locked.ok, false); assert.match(locked.error, /Too many/);
  await as(U.ana, "select public.workstation_pin_admin('grace', $1, 'unlock')", [U.ben]);
  assert.equal((await check(U.ben, "730594")).ok, true);
});
await step("admins see PINs and sign-ins, and can switch someone off; members can't", async () => {
  assert.equal((await as(U.ana, "select * from public.workstation_pins_list('grace')")).length, 2);
  assert.equal((await as(U.ben, "select * from public.workstation_pins_list('grace')")).length, 0);
  assert.equal((await as(U.ana, "select * from public.workstation_signins_list('grace')")).length, 2);
  assert.ok(await fails(as(U.ben, "select public.workstation_pin_admin('grace', $1, 'disable')", [U.ana])));
  await as(U.ana, "select public.workstation_pin_admin('grace', $1, 'disable')", [U.ben]);
  assert.equal((await check(U.ben, "730594")).ok, false);
  assert.match(await fails(as(U.ben, "select public.set_my_pin('grace', '730594')")), /switched off/);
  assert.equal((await as("server", "select * from public.workstation_people('grace')")).length, 1);
  await as(U.ana, "select public.workstation_pin_admin('grace', $1, 'enable')", [U.ben]);
  await as(U.ben, "select public.set_my_pin('grace', '730594')");
  assert.equal((await check(U.ben, "730594")).ok, true);
});
await step("own lock time: within the church's limit, and only when allowed", async () => {
  await db.exec(`update churches set data = '{"timeouts": {"master": 60, "roles": {"member": {"minutes": 30}, "staff": {"adjust": false}}}}' where id = 'grace'`);
  await as(U.ben, "select public.set_my_lock_minutes('grace', 15)");
  assert.equal((await db.query("select data->'timeouts'->'people'->$1->>'mine' as m from churches where id = 'grace'", [U.ben])).rows[0].m, "15");
  assert.match(await fails(as(U.ben, "select public.set_my_lock_minutes('grace', 45)")), /between 1 and 30/);
  assert.match(await fails(as(U.ana, "select public.set_my_lock_minutes('grace', 10)")), /sets this for you/);
  await db.exec(`update churches set data = jsonb_set(data, '{timeouts,people}', jsonb_build_object('${U.ana}', '{"adjust": true}'::jsonb) || (data->'timeouts'->'people')) where id = 'grace'`);
  await as(U.ana, "select public.set_my_lock_minutes('grace', 10)");   // a person's own permission wins over their role's
  await as(U.ben, "select public.set_my_lock_minutes('grace', null)");
  assert.equal((await db.query("select data->'timeouts'->'people'->$1 ? 'mine' as m from churches where id = 'grace'", [U.ben])).rows[0].m, false);
  assert.ok(await fails(as(U.pc, "select public.set_my_lock_minutes('grace', 5)")));
});

console.log(`\n${n} checks passed`);
