// When someone comes back from the processor's page, the app asks here whether the payment went through and
// records it right away. The webhook records it too, so whichever comes first wins and the other does nothing.
import { admin, caller, fail, handle, json } from "../_shared/util.ts";
import { keysFor, PayError, PROCESSORS } from "../_shared/payments.ts";
import { apply } from "../_shared/settle.ts";

handle(async (req) => {
  const { user } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const { checkout } = await req.json();
  const db = admin();
  const { data: co } = await db.from("checkouts").select("*").eq("id", String(checkout || "")).maybeSingle();
  if (!co || co.user_id !== user.id) return fail("Payment not found", 404);
  if (co.status === "paid") return json({ status: "paid", kind: co.kind });
  const p = PROCESSORS[co.provider];
  const { data: church } = await db.from("churches").select("id, data").eq("id", co.church_id).single();
  const keys = p && church ? await keysFor(db, church, co.meta) : null;
  if (!p || !keys || !co.provider_ref) return fail("This payment can't be checked here. If you paid, it shows up once the church's processor reports it.");
  try {
    const r = await p.confirm(keys, co.provider_ref);
    await apply(db, co.church_id, co.provider, r.events);
    if (r.status === "pending") await db.from("checkouts").update({ status: "pending" }).eq("id", co.id);
    return json({ status: r.status, kind: co.kind });
  } catch (e) {
    if (e instanceof PayError) return fail(e.message, 400);
    throw e;
  }
});
