// Signs in church devices (check-in kiosks, signage screens, presentation, room and stage screens, the booth computer).
// A device isn't a person: it gets its own account with a 'device:<type>' membership, so it can do its one job and nothing else.
//   { action: "pair", code }              no sign-in needed: the 6-character code from Admin, Screens and devices is the key.
//                                         Returns a one-time email and password the device signs in with.
//   { action: "remove", deviceId, churchId }   staff with manage.devices: deletes the device's account, which signs it out.
import { admin, caller, can, fail, handle, json } from "../_shared/util.ts";

const DEVICE_TYPES = ["kiosk", "signage", "display", "room", "stage", "overlay", "booth"];
const password = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");

handle(async (req) => {
  const body = await req.json().catch(() => ({}));
  const db = admin();

  if (body.action === "pair") {
    const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) return fail("The code has 6 letters and numbers.");
    const { data: rows } = await db.from("records").select("id, church_id, location_id, data").eq("kind", "devices").eq("data->>code", code).limit(1);
    const dev = rows?.[0];
    // Same answer for a wrong code and an expired one, and a pause, so codes can't be guessed quickly.
    if (!dev || dev.data.status === "paired" || new Date(dev.data.codeExpires) < new Date() || !DEVICE_TYPES.includes(dev.data.type)) {
      await new Promise((r) => setTimeout(r, 1200));
      return fail("That code didn't work. Codes last 30 minutes; ask for a new one.", 404);
    }
    // A device paired again gets a fresh account; the old one is signed out.
    if (dev.data.deviceUser) await db.auth.admin.deleteUser(dev.data.deviceUser).catch(() => {});
    const email = `device-${dev.id}-${Date.now().toString(36)}@devices.our-faithful.invalid`, pw = password();
    const { data: made, error } = await db.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { device: dev.id, church: dev.church_id } });
    if (error || !made.user) return fail(`Couldn't create the device's sign-in: ${error?.message || "unknown error"}`, 500);
    const id = made.user.id, now = new Date().toISOString();
    await db.from("profiles").upsert({ id, name: dev.data.name || "Church device" });
    await db.from("profile_private").upsert({ user_id: id, data: { current: dev.church_id } });
    await db.from("memberships").upsert({ church_id: dev.church_id, user_id: id, role_key: `device:${dev.data.type}`, locations: dev.location_id ? [dev.location_id] : "all", listed: false });
    const data = { ...dev.data, status: "paired", deviceUser: id, code: null, pairedAt: now, lastSeen: now };
    await db.from("records").update({ owner: id, data }).eq("kind", "devices").eq("id", dev.id);
    return json({ email, password: pw, deviceId: dev.id });
  }

  if (body.action === "remove") {
    const { user, client } = await caller(req);
    if (!user) return fail("Sign in first", 401);
    const { data: dev } = await db.from("records").select("id, church_id, data").eq("kind", "devices").eq("id", body.deviceId).maybeSingle();
    if (!dev) return json({ ok: true });
    if (!(await can(client, dev.church_id, "manage.devices"))) return fail("Your role doesn't include screens and devices", 403);
    // Deleting the account removes its membership and private settings too, and ends its session.
    if (dev.data.deviceUser) await db.auth.admin.deleteUser(dev.data.deviceUser).catch(() => {});
    await db.from("records").delete().eq("kind", "devices").eq("id", dev.id);
    return json({ ok: true });
  }

  return fail("Unknown action");
});
