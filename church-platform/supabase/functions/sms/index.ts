// Text to give. Point a Twilio number's "A message comes in" webhook here. Someone texts "GIVE 50" (or just "50")
// and gets a link that opens the app's Give screen for that church with the amount filled in.
import { admin, env, hmacHex } from "../_shared/util.ts";

const twiml = (msg: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</Message></Response>`, { headers: { "content-type": "text/xml" } });
const digits = (s: string) => (s || "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req) => {
  const form = await req.formData(), params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  // Twilio signs each request: base64 HMAC-SHA1 of the URL plus every parameter, sorted.
  const signed = env("SMS_PUBLIC_URL") + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const hex = await hmacHex(env("TWILIO_AUTH_TOKEN"), signed, "SHA-1");
  const expected = btoa(String.fromCharCode(...hex.match(/../g)!.map((h) => parseInt(h, 16))));
  if (req.headers.get("x-twilio-signature") !== expected) return new Response("Not allowed", { status: 403 });

  const db = admin();
  const { data: churches } = await db.from("churches").select("id, name, data").not("data->textGive", "is", null);
  const c = (churches || []).find((x) => digits(x.data.textGive?.number) === digits(params.To));
  if (!c) return twiml("This number isn't set up for giving.");
  const keyword = (c.data.textGive.keyword || "GIVE").toUpperCase();
  const m = (params.Body || "").toUpperCase().match(new RegExp(`^\\s*(?:${keyword}\\s*)?\\$?(\\d{1,6}(?:\\.\\d{1,2})?)\\s*$`));
  if (!m) return twiml(`To give to ${c.name}, text ${keyword} and an amount, like ${keyword} 50.`);
  const amount = Number(m[1]);
  if (amount < 1) return twiml("Gifts start at $1.");
  return twiml(`Thank you! Finish your $${amount} gift to ${c.name} here: ${env("APP_URL")}#give-${c.id}~${amount}`);
});
