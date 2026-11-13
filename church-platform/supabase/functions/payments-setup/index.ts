// Connects a church's own payment processor (Stripe, PayPal or Square) from Admin, Giving, or disconnects it.
// The keys are checked with the processor, a webhook is set up so payments are recorded, and the keys go into Vault.
import { admin, caller, can, env, fail, handle, json } from "../_shared/util.ts";
import { loadKeys, PayError, PROCESSORS, saveKeys, webhookUrl } from "../_shared/payments.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

/** Changes the church's payment status. Only server functions may (see guard_church in schema.sql). */
async function setPayments(db: SupabaseClient, churchId: string, payments: unknown) {
  const { data: c } = await db.from("churches").select("data").eq("id", churchId).single();
  const data = { ...c!.data };
  if (payments) data.payments = payments; else delete data.payments;
  await db.from("churches").update({ data }).eq("id", churchId);
}

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first", 401);
  const b = await req.json();
  const churchId = String(b.churchId || "");
  const manage = await can(client, churchId, "manage.church");
  if (!manage && !(await can(client, churchId, "view.giving"))) return fail("Your role can't see payment settings", 403);
  if (b.action === "options") return json({ stripeConnect: !!env("STRIPE_SECRET_KEY"), providers: Object.keys(PROCESSORS) });
  if (!manage) return fail("Ask someone who manages the church account to change how payments are taken", 403);

  const provider = String(b.provider || ""), p = PROCESSORS[provider];
  if (!p) return fail("Choose Stripe, PayPal or Square");
  const db = admin();
  const { data: church } = await db.from("churches").select("id, data").eq("id", churchId).maybeSingle();
  if (!church) return fail("Church not found", 404);
  const previous = await loadKeys(db, churchId, provider);

  if (b.action === "disconnect") {
    if (previous) await p.disconnect(previous).catch((e) => console.error(e));
    await db.from("payment_keys").delete().eq("church_id", churchId).eq("provider", provider);
    if (church.data?.payments?.provider === provider) await setPayments(db, churchId, null);
    return json({ ok: true });
  }
  if (b.action !== "connect") return fail("Unknown action");
  try {
    const { keys, status } = await p.connect(b.keys || {}, { webhookUrl: webhookUrl(churchId, provider), previous });
    await saveKeys(db, churchId, provider, keys);
    const payments = { provider, ready: true, ...status, connectedAt: new Date().toISOString() };
    await setPayments(db, churchId, payments);
    return json({ payments });
  } catch (e) {
    if (e instanceof PayError) return fail(e.message, 400);
    throw e;
  }
});
