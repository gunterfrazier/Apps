// Checks game night's rooms, joining and Realtime rules (supabase/upgrade-32.sql) in an in-memory Postgres (PGlite).
// Run: node test/games.mjs   (needs @electric-sql/pglite, or set PGLITE_DIR)
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

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create schema realtime;
  create table realtime.messages (topic text not null, extension text not null, event text, payload jsonb);
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('test.topic', true), '') $$;
  alter table realtime.messages enable row level security;
  grant usage on schema realtime, public, auth to authenticated;
  grant select, insert on realtime.messages to authenticated;
  ${["churches", "roles", "locations", "memberships", "records"].map(table).join("\n")}
  ${["is_primary", "church_live", "is_member", "device_perms", "can"].map(fn).join("\n")}
`);
await db.exec(readFileSync(join(here, "..", "supabase", "upgrade-32.sql"), "utf8"));

const U = { owner: "00000000-0000-0000-0000-000000000001", leader: "00000000-0000-0000-0000-000000000002", member: "00000000-0000-0000-0000-000000000003",
  guest: "00000000-0000-0000-0000-000000000004", other: "00000000-0000-0000-0000-000000000005", guest2: "00000000-0000-0000-0000-000000000006" };
await db.exec(`
  insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(",")};
  insert into churches (id, handle, name, owner_id) values ('grace', 'grace', 'Grace Church', '${U.owner}'), ('other', 'other', 'Other', '${U.other}');
  insert into roles (church_id, key, name, rank, perms) values ('grace', 'leader', 'Leader', 30, '{"host.games": true}'), ('grace', 'member', 'Member', 10, '{}');
  insert into memberships (church_id, user_id, role_key) values ('grace', '${U.leader}', 'leader'), ('grace', '${U.member}', 'member');
`);

const as = async (who, sql, topic = "") => {
  await db.exec(`reset role; select set_config('test.uid', '${who || ""}', false), set_config('test.topic', '${topic}', false); set role authenticated;`);
  try { return await db.query(sql); } finally { await db.exec("reset role;"); }
};
const fails = async (p) => { try { await p; return false; } catch { return true; } };
const hears = async (who, topic) => (await as(who, `select count(*)::int as n from realtime.messages where topic = '${topic}'`, topic)).rows[0].n > 0;
const sends = async (who, topic, ev) => !(await fails(as(who, `insert into realtime.messages (topic, extension, event) values ('${topic}', 'broadcast', '${ev}')`, topic)));

let n = 0;
const check = async (name, f) => { await f(); n++; console.log(`ok  ${name}`); };

let room, code;
await check("people who can host open a room with a 4-letter code; others can't", async () => {
  const r = (await as(U.leader, `select game_open('grace', 'Friday games') as r`)).rows[0].r;
  ({ room, code } = r);
  assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(await fails(as(U.member, `select game_open('grace')`)), true);
  assert.equal(await fails(as(U.other, `select game_open('grace')`)), true);
  assert.equal(await fails(as(null, `select game_open('grace')`)), true);
  const o = (await as(U.owner, `select game_open('grace') as r`)).rows[0].r;
  assert.notEqual(o.code, code);
});
await check("anyone signed in (an anonymous guest too) joins with the code and a name", async () => {
  const j = (await as(U.guest, `select game_join('  ${code.toLowerCase()} ', 'Sam') as r`)).rows[0].r;
  assert.equal(j.room, room); assert.equal(j.church, "Grace Church"); assert.equal(j.title, "Friday games");
  await as(U.guest, `select game_join('${code}', 'Sammy')`);
  const rows = (await db.query(`select name from game_players where room_id = '${room}'`)).rows;
  assert.deepEqual(rows.map((r) => r.name), ["Sammy"]);
  assert.equal(await fails(as(U.guest2, `select game_join('ZZZZ', 'Lee')`)), true);
  assert.equal(await fails(as(U.guest2, `select game_join('${code}', '   ')`)), true);
  assert.equal(await fails(as(null, `select game_join('${code}', 'Lee')`)), true);
});
const topic = () => `game:${room}`;
await check("the host and players hear the game; people who didn't join don't", async () => {
  await db.exec(`insert into realtime.messages (topic, extension, event) values ('${topic()}', 'broadcast', 'state')`);
  assert.equal(await hears(U.leader, topic()), true);
  assert.equal(await hears(U.owner, topic()), true);
  assert.equal(await hears(U.guest, topic()), true);
  assert.equal(await hears(U.member, topic()), false);
  assert.equal(await hears(U.guest2, topic()), false);
  assert.equal(await hears(U.other, topic()), false);
});
await check("only the host sends questions; players send answers", async () => {
  assert.equal(await sends(U.leader, topic(), "state"), true);
  assert.equal(await sends(U.guest, topic(), "state"), false);
  assert.equal(await sends(U.guest, topic(), "answer"), true);
  assert.equal(await sends(U.guest, topic(), "hello"), true);
  assert.equal(await sends(U.guest, topic(), "other"), false);
  assert.equal(await sends(U.guest2, topic(), "answer"), false);
  assert.equal(await sends(U.member, topic(), "answer"), false);
});
await check("other channels stay closed to game players", async () => {
  assert.equal(await sends(U.guest, "live:grace", "slide"), false);
  assert.equal(await hears(U.guest, "live:grace"), false);
});
await check("ending the night closes the room to everyone", async () => {
  assert.equal(await fails(as(U.member, `select game_close('${room}')`)), false); // allowed to call, changes nothing
  assert.equal(await hears(U.guest, topic()), true);
  await as(U.leader, `select game_close('${room}')`);
  assert.equal(await hears(U.guest, topic()), false);
  assert.equal(await sends(U.leader, topic(), "state"), false);
  assert.equal(await fails(as(U.guest2, `select game_join('${code}', 'Lee')`)), true);
});
console.log(`\n${n} checks passed`);
