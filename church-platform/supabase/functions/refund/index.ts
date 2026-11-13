// Refunds a payment through the processor it was made with. The person who paid can refund their own ticket or
// form fee; giving staff can refund anything.
import { admin, caller, can, fail, handle, json } from "../_shared/util.ts";
import { keysFor, PayError, PROCESSORS } from "../_shared/payments.ts";
import { refunded } from "../_shared/settle.ts";

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { ref } = await req.json();
  const db = admin();
  const { data: pay } = await db.from("payments").select("*").eq("id", ref).maybeSingle();
  if (!pay) return fail("Payment not found", 404);
  const staff = await can(client, pay.church_id, "view.giving");
  if (pay.user_id !== user.id && !staff) return fail("You can only refund your own payments", 403);
  if (pay.kind === "gift" && !staff) return fail("Gifts are refunded by the church office", 403);
  if (pay.status === "refunded") return json({ ok: true });
  const { data: church } = await db.from("churches").select("id, data").eq("id", pay.church_id).single();
  const provider = pay.data?.provider || "stripe", keys = await keysFor(db, church!, pay.data);
  if (!keys || !PROCESSORS[provider]) return fail(`This church's ${provider} account is no longer connected. Refund it in ${provider} directly.`);
  try { await PROCESSORS[provider].refund(keys, pay.id, Number(pay.amount)); }
  catch (e) { if (e instanceof PayError) return fail(e.message); throw e; }
  await refunded(db, pay.church_id, pay.id);
  return json({ ok: true });
});
