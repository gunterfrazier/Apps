// Runs every minute (pg_cron). Sends the events the app queued to each church's webhooks, signed with HMAC-SHA256
// (Slack, Discord, Teams and Google Chat webhooks get a readable message instead of the JSON):
//   X-Our-Faithful-Signature: t=<unix seconds>,v1=<hex of HMAC(secret, "<t>.<body>")>
// Failures retry with growing gaps, up to 6 tries. Each attempt is logged for the church's admins.
import { admin, fail, fromCron, handle, hmacHex, json, uid } from "../_shared/util.ts";

// A webhook can be limited to some locations; church-wide events (no location) always go.
const placeOk = (h: any, d: any) => !h.locations?.length || !d?.locationId || h.locations.includes(d.locationId);
// Chat apps get a readable message in their own shape; everything else gets the standard JSON. Keep in step with hookBody
// in src/js/20-store.js.
function shape(h: any, p: any) {
  const text = p.data?.summary || p.event, link = p.data?.link, line = link ? `${text}\n${link}` : text;
  switch (h.format) {
    case "slack": return { text: link ? `${text}\n<${link}|Open in the app>` : text };
    case "discord": return { content: String(line).slice(0, 2000), allowed_mentions: { parse: [] } };
    case "googlechat": return { text: line };
    case "teams": return { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
      body: [{ type: "TextBlock", text: p.church?.name || "", weight: "Bolder", size: "Small", isSubtle: true }, { type: "TextBlock", text, wrap: true }], ...(link ? { actions: [{ type: "Action.OpenUrl", title: "Open in the app", url: link }] } : {}) } }] };
    default: return p;
  }
}

handle(async (req) => {
  if (!fromCron(req)) return fail("Not allowed", 401);
  const db = admin(), now = new Date();
  const { data: queue } = await db.from("records").select("id, church_id, data").eq("kind", "deliveries").eq("data->>status", "queued").eq("data->>outbox", "true").limit(100);
  let sent = 0;
  for (const q of queue || []) {
    if (q.data.nextAt && new Date(q.data.nextAt) > now) continue;
    const { data: integ } = await db.from("records").select("data").eq("kind", "integrations").eq("id", q.church_id).maybeSingle();
    const { data: church } = await db.from("churches").select("id, handle, name, data").eq("id", q.church_id).single();
    // A training church sends nothing to outside systems, and neither does a deactivated one.
    const hooks = church?.data?.training || church?.data?.deactivation?.status === "deactivated" ? [] : (integ?.data?.webhooks || []).filter((h: any) => h.active && h.events.includes(q.data.event) && placeOk(h, q.data.data));
    let failed = 0;
    for (const h of hooks) {
      const body = JSON.stringify(shape(h, { id: q.id, event: q.data.event, church: { id: church!.id, handle: church!.handle, name: (church as any).name || church!.handle }, at: q.data.at, data: q.data.data }));
      const t = Math.floor(Date.now() / 1000), sig = `t=${t},v1=${await hmacHex(h.secret, `${t}.${body}`)}`;
      let status = "delivered";
      try {
        const res = await fetch(h.url, { method: "POST", headers: { "content-type": "application/json", "x-our-faithful-signature": sig, "x-our-faithful-event": q.data.event }, body, signal: AbortSignal.timeout(10000) });
        if (!res.ok) { status = `failed (HTTP ${res.status})`; failed++; }
      } catch (e) { status = `failed (${(e as Error).name})`; failed++; }
      await db.from("records").insert({ kind: "deliveries", id: `d-${uid()}`, church_id: q.church_id, data: { churchId: q.church_id, webhookId: h.id, url: h.url, event: q.data.event, body, signature: sig, at: new Date().toISOString(), status } });
      sent++;
    }
    const tries = (q.data.tries || 0) + 1;
    const done = !failed || tries >= 6;
    await db.from("records").update({ data: { ...q.data, status: done ? (failed ? "gave up" : "sent") : "queued", tries, nextAt: done ? null : new Date(Date.now() + 2 ** tries * 60e3).toISOString() } }).eq("kind", "deliveries").eq("id", q.id);
  }
  // Keep the log short: delete sent events and attempts older than 30 days.
  await db.from("records").delete().eq("kind", "deliveries").lt("updated_at", new Date(Date.now() - 30 * 86400e3).toISOString());
  return json({ sent });
});
