// Checks the Realtime rules for private live channels (supabase/upgrade-28.sql) in an in-memory Postgres (PGlite),
// using the real tables and permission functions from supabase/schema.sql.
// Run: node test/live-channels.mjs   (needs @electric-sql/pglite: npm i -g @electric-sql/pglite, or set PGLITE_DIR)
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
const upgrade = readFileSync(join(here, "..", "supabase", "upgrade-28.sql"), "utf8");

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema realtime;
  create table realtime.messages (topic text not null, extension text not null, payload jsonb);
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('test.topic', true), '') $$;
  alter table realtime.messages enable row level security;
  grant usage on schema realtime, public, auth to authenticated;
  grant select, insert on realtime.messages to authenticated;
  ${["churches", "roles", "locations", "memberships", "records"].map(table).join("\n")}
  ${["is_primary", "church_live", "is_member", "device_perms", "can"].map(fn).join("\n")}
`);
await db.exec(upgrade);

const U = { owner: "00000000-0000-0000-0000-000000000001", media: "00000000-0000-0000-0000-000000000002", member: "00000000-0000-0000-0000-000000000003",
  screen: "00000000-0000-0000-0000-000000000004", teacher: "00000000-0000-0000-0000-000000000005", outsider: "00000000-0000-0000-0000-000000000006" };
await db.exec(`
  insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(",")};
  insert into churches (id, handle, name, owner_id) values ('grace', 'grace', 'Grace', '${U.owner}'), ('other', 'other', 'Other', '${U.outsider}');
  insert into roles (church_id, key, name, rank, perms) values ('grace', 'media', 'Media', 40, '{"present": true}'), ('grace', 'member', 'Member', 10, '{}'),
    ('grace', 'teacher', 'Teacher', 20, '{}');
  insert into memberships (church_id, user_id, role_key) values ('grace', '${U.media}', 'media'), ('grace', '${U.member}', 'member'),
    ('grace', '${U.screen}', 'device:display'), ('grace', '${U.teacher}', 'teacher');
  insert into records (kind, id, church_id, owner, data) values
    ('roomSessions', 'rs1', 'grace', '${U.teacher}', '{"token": "abc123", "until": "2999-01-01T00:00:00Z"}'),
    ('roomSessions', 'rs2', 'grace', '${U.teacher}', '{"token": "old999", "until": "2000-01-01T00:00:00Z"}');
`);

const as = async (who, topic, sql) => {
  await db.exec(`reset role; select set_config('test.uid', '${who || ""}', false), set_config('test.topic', '${topic}', false); set role authenticated;`);
  try { return await db.query(sql); } finally { await db.exec("reset role;"); }
};
const hears = async (who, topic) => (await as(who, topic, `select count(*)::int as n from realtime.messages where topic = '${topic}'`)).rows[0].n > 0;
const sends = async (who, topic) => { try { await as(who, topic, `insert into realtime.messages (topic, extension) values ('${topic}', 'broadcast')`); return true; } catch { return false; } };
await db.exec(`insert into realtime.messages (topic, extension) values ('live:grace', 'broadcast'), ('live:grace:room:abc123', 'broadcast'), ('control:grace', 'broadcast'), ('present:grace', 'broadcast')`);

let n = 0;
const check = async (name, fnc) => { await fnc(); n++; console.log(`ok  ${name}`); };

await check("members and paired screens hear the church's slides; outsiders don't", async () => {
  for (const u of [U.owner, U.media, U.member, U.screen, U.teacher]) assert.equal(await hears(u, "live:grace"), true, u);
  assert.equal(await hears(U.outsider, "live:grace"), false);
  assert.equal(await hears(null, "live:grace"), false);
});
await check("only people and devices that can present send slides", async () => {
  assert.equal(await sends(U.owner, "live:grace"), true);
  assert.equal(await sends(U.media, "live:grace"), true);
  assert.equal(await sends(U.screen, "live:grace"), true);   // a display asks the booth to send a file again
  assert.equal(await sends(U.member, "live:grace"), false);
  assert.equal(await sends(U.outsider, "live:grace"), false);
});
await check("a room's channel: its session holder sends, only while the session is current", async () => {
  assert.equal(await sends(U.teacher, "live:grace:room:abc123"), true);
  assert.equal(await sends(U.teacher, "live:grace:room:old999"), false);
  assert.equal(await sends(U.member, "live:grace:room:abc123"), false);
  assert.equal(await hears(U.member, "live:grace:room:abc123"), true);
});
await check("booth commands: presenters send and hear them, members don't", async () => {
  assert.equal(await sends(U.media, "control:grace"), true);
  assert.equal(await hears(U.media, "control:grace"), true);
  assert.equal(await hears(U.screen, "control:grace"), true);
  assert.equal(await sends(U.member, "control:grace"), false);
  assert.equal(await hears(U.member, "control:grace"), false);
  assert.equal(await sends(U.outsider, "control:grace"), false);
});
await check("other topics and malformed names are refused", async () => {
  assert.equal(await sends(U.owner, "present:grace"), false);   // the old open channel isn't private: these rules don't grant it
  assert.equal(await sends(U.owner, "live:grace:extra"), false);
  assert.equal(await sends(U.owner, "live:other"), false);
  assert.equal(await hears(U.owner, "control:grace:x"), false);
});
await check("a deactivated church goes quiet for everyone but its primary account holder", async () => {
  await db.exec(`update churches set data = '{"deactivation": {"status": "deactivated"}}' where id = 'grace'`);
  assert.equal(await hears(U.member, "live:grace"), false);
  assert.equal(await sends(U.media, "live:grace"), false);
  assert.equal(await hears(U.owner, "live:grace"), true);
  await db.exec(`update churches set data = '{}' where id = 'grace'`);
});

console.log(`\n${n} checks passed`);
