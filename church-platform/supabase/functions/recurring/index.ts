// Stops a recurring gift with the processor it was set up with. The giver can stop their own; giving staff can stop any.
import { admin, caller, can, fail, handle, json, patchRecord } from "../_shared/util.ts";
import { keysFor, PayError, PROCESSORS } from "../_shared/payments.ts";

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { action, subscriptionId, churchId } = await req.json();
  if (action !== "cancel") return fail("Unknown action");
  const db = admin();
  const { data: rec } = await db.from("records").select("owner, church_id, data").eq("kind", "recurring").eq("id", subscriptionId).maybeSingle();
  if (!rec || rec.church_id !== churchId) return fail("Recurring gift not found", 404);
  if (rec.owner !== user.id && !(await can(client, churchId, "view.giving"))) return fail("You can only stop your own gifts", 403);
  const { data: church } = await db.from("churches").select("id, data").eq("id", churchId).single();
  const provider = rec.data.provider || "stripe", keys = await keysFor(db, church!, rec.data);
  if (!keys || !PROCESSORS[provider]) return fail(`The church's ${provider} account is no longer connected. Ask the church office to stop it in ${provider}.`);
  try { await PROCESSORS[provider].cancel(keys, subscriptionId); }
  catch (e) { if (e instanceof PayError) return fail(e.message); throw e; }
  await patchRecord(db, "recurring", subscriptionId, { active: false, endedAt: new Date().toISOString() });
  return json({ ok: true });
});
