// The lock screen of a workstation: a shared church computer paired under Devices (see upgrade-30.sql).
// Called by the workstation's own device account, never by a person:
//   { action: "people", churchId }               the names (and roles) of people who have a PIN for this church
//   { action: "unlock", churchId, userId, pin }  checks the PIN (5 wrong tries lock that name for 15 minutes) and,
//                                               if it matches, returns a one-time sign-in for that person, which the
//                                               workstation exchanges for their session. Each sign-in is logged.
import { admin, caller, fail, handle, json } from "../_shared/util.ts";

handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  const { user } = await caller(req);
  if (!user) return fail("This computer isn't signed in as a workstation.", 401);
  const db = admin(), c = String(body.churchId || "");
  const { data: m } = await db.from("memberships").select("role_key").eq("church_id", c).eq("user_id", user.id).maybeSingle();
  if (m?.role_key !== "device:workstation") return fail("Only a church workstation can do this.", 403);

  if (body.action === "people") {
    const { data, error } = await db.rpc("workstation_people", { c });
    if (error) return fail(error.message.includes("workstation_people") ? "Workstations need version 30 of the database (upgrade-30.sql)." : error.message, 500);
    return json({ people: (data || []).map((p: { user_id: string; name: string; role: string }) => ({ id: p.user_id, name: p.name, role: p.role })) });
  }

  if (body.action === "unlock") {
    const who = String(body.userId || ""), pin = String(body.pin || "");
    if (!/^\d{6}$/.test(pin)) return fail("A PIN is 6 digits.");
    const { data: dev } = await db.from("records").select("id").eq("kind", "devices").eq("church_id", c).eq("data->>deviceUser", user.id).maybeSingle();
    const { data: r, error } = await db.rpc("workstation_check_pin", { c, who, pin, device: dev?.id || null });
    if (error) return fail(error.message, 500);
    if (!r?.ok) { await new Promise((ok) => setTimeout(ok, 700)); return json({ error: r?.error || "That PIN didn't match.", left: r?.left ?? null, until: r?.until ?? null }, 403); }
    const { data: u } = await db.auth.admin.getUserById(who);
    const email = u?.user?.email;
    if (!email) return fail("This person signs in without an email address, so they can't use a workstation yet.", 409);
    const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError || !link?.properties?.hashed_token) return fail(`Couldn't start the sign-in: ${linkError?.message || "unknown error"}`, 500);
    return json({ tokenHash: link.properties.hashed_token });
  }

  return fail("Unknown action");
});
