// Booth commands from a Stream Deck (through Bitfocus Companion), a MIDI bridge or anything else that can call a web
// address, using a control key made under Screens and devices, Control keys. No sign-in: the key is the permission.
//
// Simplest, for a Companion "HTTP Request" (GET) action:
//   GET  /functions/v1/control/next?key=ofc_...
//   GET  /functions/v1/control/prev?key=...           /control/black   /control/logo   /control/clear
//   GET  /functions/v1/control/go/5?key=...           slide 5 (counting from 1)
//   GET  /functions/v1/control/section/Chorus?key=... a section of the song on screen
//   GET  /functions/v1/control/message?text=Wrap%20up&key=...   a message on the stage display (no text clears it)
// The key can go in an x-control-key header instead of the address, and a POST can send JSON:
//   POST /functions/v1/control   { "do": "go", "i": 4 }   (i counts from 0)
// The command goes to the presenter open on the booth (version 28's private control channel, sent by
// control_send in upgrade-29.sql). Answers { ok: true }, or { error } with 401 (bad key), 429 (too many) or 400.
import { admin, fail, handle, json } from "../_shared/util.ts";

const DOS = ["next", "prev", "go", "section", "black", "logo", "clear", "message"];
const text = (v: unknown, n = 80) => String(v ?? "").trim().slice(0, n);

handle(async (req) => {
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const q = (k: string) => url.searchParams.get(k) ?? body[k];
  const path = url.pathname.replace(/^.*?\/control\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const key = req.headers.get("x-control-key") || q("key") || "";
  if (!key) return fail("Add the control key: ?key=ofc_... or an x-control-key header.", 401);

  const d = String(path[0] || q("do") || "").toLowerCase();
  if (!DOS.includes(d)) return fail(`Unknown command. Use one of: ${DOS.join(", ")}.`);
  const cmd: Record<string, unknown> = { do: d };
  if (d === "go") {
    const i = path[1] != null ? Number(path[1]) - 1 : Number(q("i"));
    if (!Number.isInteger(i) || i < 0 || i > 9999) return fail("Say which slide: /control/go/5");
    cmd.i = i;
  }
  if (d === "section") { const label = text(path.slice(1).join("/") || q("label"), 40); if (!label) return fail("Say which section: /control/section/Chorus"); cmd.label = label; }
  if (d === "message") cmd.text = text(path.slice(1).join("/") || q("text"));
  if ((d === "black" || d === "logo") && q("on") != null) cmd.on = ["1", "true", "on", "yes", true].includes(q("on"));

  const { data, error } = await admin().rpc("control_send", { k: key, cmd });
  if (error) throw error;
  if (data?.error) return fail(data.error, data.status || 400);
  return json({ ok: true, do: d });
});
