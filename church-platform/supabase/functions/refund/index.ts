// Refunds a ticket or form fee: the person who paid can cancel their own; giving staff can refund anything.
import { admin, caller, can, fail, handle, json } from "../_shared/util.ts";
import { stripe } from "../_shared/stripe.ts";

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { ref } = await req.json();
  const db = admin();
  const { data: pay } = await db.from("payments").select("*").eq("id", ref).maybeSingle();
  if (!pay) return fail("Payment not found", 404);
  if (pay.user_id !== user.id && !(await can(client, pay.church_id, "view.giving"))) return fail("You can only refund your own payments", 403);
  if (pay.kind === "gift" && !(await can(client, pay.church_id, "view.giving"))) return fail("Gifts are refunded by the church office", 403);
  const { data: c } = await db.from("churches").select("data").eq("id", pay.church_id).single();
  await stripe.refunds.create({ payment_intent: ref }, { stripeAccount: c!.data.stripe.accountId });
  return json({ ok: true });   // the charge.refunded webhook marks the records
});
