// Each church's payment processor calls this when money moves: payments-setup registers
// .../pay-webhook?church=ID&provider=stripe|paypal|square with the church's own Stripe, PayPal or Square account.
// The processor's signature is checked with that church's keys before anything is recorded.
import { admin, fail, json } from "../_shared/util.ts";
import { loadKeys, PROCESSORS } from "../_shared/payments.ts";
import { apply } from "../_shared/settle.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return fail("Not here", 405);
  const u = new URL(req.url), church = u.searchParams.get("church") || "", provider = u.searchParams.get("provider") || "";
  const p = PROCESSORS[provider];
  if (!p || !church) return fail("Unknown church or processor", 404);
  const body = await req.text(), db = admin();
  try {
    const keys = await loadKeys(db, church, provider);
    if (!keys) return json({ ignored: "not connected" });   // a 200, so a disconnected processor stops retrying
    const events = await p.webhook(keys, req, body);
    if (!events) return fail("Bad signature", 400);
    await apply(db, church, provider, events);
    return json({ received: true });
  } catch (e) {
    console.error(e);
    return fail("Couldn't record it; the processor will try again", 500);
  }
});
