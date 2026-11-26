// Checks control keys (supabase/upgrade-29.sql) in an in-memory Postgres (PGlite), using the real tables and
// permission functions from supabase/schema.sql: who may make and remove keys, that only a hash is kept, that a key
// reaches only its own church's booth, and the limit of 30 commands in 10 seconds.
// Run: node test/control-keys.mjs   (needs @electric-sql/pglite: npm i -g @electric-sql/pglite, or set PGLITE_DIR)
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
let PGlite;
for (const from of [process.env.PGLITE_DIR, undefined, "/usr/local/lib/node_modules", join(process.env.HOME || "", ".npm-global/lib/node_modules")]) {
  try { ({ PGlite } = await import(from ? join(from, "@electric-sql/pglite/dist/index.js") : "@electric-sql/pglite")); break; } catch { /* try the next place */ }
}
if (!PGlite) { try { ({ PGlite } = require("@electric-sql/pglite")); } catch { console.log("skipped: @electric-sql/pglite isn't installed"); process.exit(0); } }

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "..", "supabase", "schema.sql"), "utf8");
const table = (name) => { const i = schema.indexOf(`create table ${name} (`); return schema.slice(i, schema.indexOf("\n);", i) + 3); };
const fn = (name) => { const i = schema.search(new RegExp(`create or replace function (public\\.)?${name}\\(`)); return schema.slice(i, schema.indexOf("$$;", schema.indexOf("$$", i) + 2) + 3); };
const upgrade = readFileSync(join(here, "..", "supabase", "upgrade-29.sql"), "utf8");

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema realtime;
  create table realtime.sent (payload jsonb, event text, topic text, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as $$ insert into realtime.sent values (payload, event, topic, private) $$;
  grant usage on schema public, auth to authenticated, service_role;
  ${["profiles", "churches", "roles", "locations", "memberships"].map(table).join("\n")}
  ${["is_primary", "church_live", "is_member", "device_perms", "can"].map(fn).join("\n")}
`);
await db.exec(upgrade);

const U = { owner: "00000000-0000-0000-0000-000000000001", av: "00000000-0000-0000-0000-000000000002", media: "00000000-0000-0000-0000-000000000003",
  outsider: "00000000-0000-0000-0000-000000000004" };
await db.exec(`
  insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(",")};
  insert into profiles (id, name) values ('${U.av}', 'Ana');
  insert into churches (id, handle, name, owner_id) values ('grace', 'grace', 'Grace', '${U.owner}'), ('other', 'other', 'Other', '${U.outsider}');
  insert into locations (id, church_id) values ('north', 'grace'), ('elsewhere', 'other');
  insert into roles (church_id, key, name, rank, perms) values ('grace', 'av', 'AV', 40, '{"manage.devices": true, "present": true}'), ('grace', 'media', 'Media', 30, '{"present": true}');
  insert into memberships (church_id, user_id, role_key) values ('grace', '${U.av}', 'av'), ('grace', '${U.media}', 'media');
`);
const as = async (who, sql, params) => {
  await db.exec(`reset role; select set_config('test.uid', '${who || ""}', false); set role ${who === "server" ? "service_role" : "authenticated"};`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); }
};
const fails = async (p) => { try { await p; return false; } catch { return true; } };
const send = (key, cmd = { do: "next" }) => as("server", "select public.control_send($1, $2::jsonb) as r", [key, JSON.stringify(cmd)]).then((r) => r[0].r);
const sent = async () => (await db.query("select payload, event, topic, private from realtime.sent")).rows;

let n = 0;
const check = async (name, fnc) => { await fnc(); n++; console.log(`ok  ${name}`); };
let key, keyNorth;

await check("people with Screens and devices make keys; presenters and outsiders can't", async () => {
  key = (await as(U.av, "select public.control_key_create('grace', 'Booth Stream Deck') as r"))[0].r.key;
  assert.match(key, /^ofc_[0-9a-f]{64}$/);
  keyNorth = (await as(U.owner, "select public.control_key_create('grace', 'North deck', 'north') as r"))[0].r.key;
  assert.equal(await fails(as(U.media, "select public.control_key_create('grace', 'x')")), true);
  assert.equal(await fails(as(U.outsider, "select public.control_key_create('grace', 'x')")), true);
  assert.equal(await fails(as(U.av, "select public.control_key_create('grace', 'x', 'elsewhere')")), true, "another church's campus");
  assert.equal(await fails(as(U.av, "select public.control_key_create('grace', '  ')")), true, "a name is needed");
});
await check("only a hash is kept, and the table can't be read directly", async () => {
  const rows = (await db.query("select hash, hint from control_keys")).rows;
  assert.equal(rows.some((r) => r.hash.includes(key.slice(4))), false);
  assert.equal(rows[0].hint, key.slice(-4));
  assert.equal(await fails(as(U.av, "select * from control_keys")), true);
});
await check("the list shows names, campus and who made it, to Screens and devices only", async () => {
  const list = await as(U.av, "select * from public.control_keys_list('grace')");
  assert.deepEqual(list.map((k) => [k.name, k.location_id, k.created_by_name]), [["Booth Stream Deck", null, "Ana"], ["North deck", "north", ""]]);
  assert.equal("hash" in list[0], false);
  assert.equal((await as(U.media, "select * from public.control_keys_list('grace')")).length, 0);
  assert.equal(await fails(as(U.av, "select public.control_send('x', '{}')")), true, "people can't call control_send");
});
await check("a good key reaches its church's private control channel, marked with the key's name and campus", async () => {
  assert.deepEqual(await send(key, { do: "go", i: 2 }), { church: "grace" });
  await send(keyNorth);
  const [a, b] = await sent();
  assert.equal(a.topic, "control:grace"); assert.equal(a.event, "cmd"); assert.equal(a.private, true);
  assert.equal(a.payload.do, "go"); assert.equal(a.payload.i, 2); assert.equal(a.payload.church, "grace"); assert.equal(a.payload.from, "Booth Stream Deck"); assert.ok(a.payload._id);
  assert.equal(b.payload.loc, "north");
  assert.ok((await db.query("select last_used from control_keys where name = 'Booth Stream Deck'")).rows[0].last_used);
});
await check("a command can't pretend to be for another church", async () => {
  await db.exec("delete from realtime.sent");
  await send(key, { do: "next", church: "other", loc: "elsewhere" });
  const [m] = await sent();
  assert.equal(m.topic, "control:grace"); assert.equal(m.payload.church, "grace"); assert.equal(m.payload.loc, null);
});
await check("wrong, empty and removed keys are turned away", async () => {
  assert.equal((await send("ofc_" + "0".repeat(64))).status, 401);
  assert.equal((await send("")).status, 401);
  const id = (await db.query("select id from control_keys where name = 'North deck'")).rows[0].id;
  assert.equal(await fails(as(U.media, "select public.control_key_remove('grace', $1)", [id])), true);
  await as(U.av, "select public.control_key_remove('grace', $1)", [id]);
  assert.equal((await send(keyNorth)).status, 401);
});
await check("30 commands in 10 seconds, then a pause", async () => {
  await db.exec("update control_keys set window_start = null, window_count = 0");
  for (let i = 0; i < 30; i++) assert.equal((await send(key)).church, "grace");
  assert.equal((await send(key)).status, 429);
  await db.exec("update control_keys set window_start = window_start - interval '11 seconds'");
  assert.equal((await send(key)).church, "grace");
});
await check("a deactivated church's keys stop working", async () => {
  await db.exec(`update churches set data = '{"deactivation": {"status": "deactivated"}}' where id = 'grace'`);
  assert.equal((await send(key)).status, 403);
  await db.exec(`update churches set data = '{}' where id = 'grace'`);
});

console.log(`\n${n} checks passed`);
