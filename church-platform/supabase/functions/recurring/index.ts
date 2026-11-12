// Stops a recurring gift. The giver can stop their own; giving staff can stop any.
import { admin, caller, can, fail, handle, json, patchRecord } from "../_shared/util.ts";
import { stripe } from "../_shared/stripe.ts";

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { action, subscriptionId, churchId } = await req.json();
  if (action !== "cancel") return fail("Unknown action");
  const db = admin();
  const { data: rec } = await db.from("records").select("owner, church_id").eq("kind", "recurring").eq("id", subscriptionId).maybeSingle();
  if (!rec || rec.church_id !== churchId) return fail("Recurring gift not found", 404);
  if (rec.owner !== user.id && !(await can(client, churchId, "view.giving"))) return fail("You can only stop your own gifts", 403);
  const { data: c } = await db.from("churches").select("data").eq("id", churchId).single();
  await stripe.subscriptions.cancel(subscriptionId, { stripeAccount: c!.data.stripe.accountId });
  await patchRecord(db, "recurring", subscriptionId, { active: false, endedAt: new Date().toISOString() });
  return json({ ok: true });
});
