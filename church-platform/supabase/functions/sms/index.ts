// Texts that come in to a church's Twilio number. Linking Twilio under Admin, Texting points the number here, with
// ?church=ID; Twilio signs each request with the church's own Auth Token.
//   STOP (or UNSUBSCRIBE, CANCEL, END, QUIT): no more texts to this number from this church. START or UNSTOP: back on.
//   HELP: who this is and how to stop.
//   Text to give, where the church has it on: "GIVE 50" (or just "50") gets a link to the Give screen with the amount.
// Older setups without ?church use the server's TWILIO_AUTH_TOKEN and find the church by its text-to-give number.
import { admin, env, hmacHex } from "../_shared/util.ts";
import { last10, optOut, textingOn, twilioKeys } from "../_shared/messaging.ts";

const twiml = (msg = "") => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message>` : ""}</Response>`, { headers: { "content-type": "text/xml" } });

Deno.serve(async (req) => {
  const form = await req.formData(), params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const url = new URL(req.url), churchId = url.searchParams.get("church") || "";
  const db = admin();
  let church: { id: string; name: string; data: Record<string, any> } | null = null, token = env("TWILIO_AUTH_TOKEN"), signedUrl = env("SMS_PUBLIC_URL"); // deno-lint-ignore no-explicit-any
  if (churchId) {
    const { data } = await db.from("churches").select("id, name, data").eq("id", churchId).maybeSingle();
    church = data; token = (await twilioKeys(db, churchId))?.token || "";
    signedUrl = `${env("SUPABASE_URL")}/functions/v1/sms?church=${encodeURIComponent(churchId)}`;
  }
  // Twilio signs each request: base64 HMAC-SHA1 of the URL plus every parameter, sorted.
  if (!token) return new Response("Not set up", { status: 403 });
  const hex = await hmacHex(token, signedUrl + Object.keys(params).sort().map((k) => k + params[k]).join(""), "SHA-1");
  const expected = btoa(String.fromCharCode(...hex.match(/../g)!.map((h) => parseInt(h, 16))));
  if (req.headers.get("x-twilio-signature") !== expected) return new Response("Not allowed", { status: 403 });

  if (!church) {
    const { data: churches } = await db.from("churches").select("id, name, data").not("data->textGive", "is", null);
    church = (churches || []).find((x) => !x.data.training && last10(x.data.textGive?.number) === last10(params.To)) || null;
  }
  if (!church || church.data.training || church.data.deactivation?.status === "deactivated") return twiml("This number isn't set up yet.");
  const words = (params.Body || "").trim().toUpperCase();
  if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/.test(words)) { await optOut(db, church.id, params.From, true); return twiml(); }   // carriers send their own confirmation
  if (/^(START|UNSTOP|YES)\b/.test(words)) { await optOut(db, church.id, params.From, false); return twiml(`You'll get texts from ${church.name} again. Reply STOP to stop.`); }
  if (/^(HELP|INFO)\b/.test(words)) return twiml(`${church.name} texts through Our Faithful Church App. Reply STOP to stop getting texts.`);

  const give = church.data.textGive, giveOn = churchId ? textingOn(church) && church.data.messaging?.giveByText !== false && !!give : !!give?.number;
  if (giveOn) {
    const keyword = (give.keyword || "GIVE").toUpperCase();
    const m = words.match(new RegExp(`^\\s*(?:${keyword}\\s*)?\\$?(\\d{1,6}(?:\\.\\d{1,2})?)\\s*$`));
    if (!m) return twiml(`To give to ${church.name}, text ${keyword} and an amount, like ${keyword} 50.`);
    const amount = Number(m[1]);
    if (amount < 1) return twiml("Gifts start at $1.");
    return twiml(`Thank you! Finish your $${amount} gift to ${church.name} here: ${env("APP_URL")}#give-${church.id}~${amount}`);
  }
  return twiml();
});
