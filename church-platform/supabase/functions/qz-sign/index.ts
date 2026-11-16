// Signs QZ Tray requests with the church's private key, so QZ Tray prints without asking "Allow?" each time.
// The certificate is public (church.qzCert); the private key is kept in Vault as provider "qz" and never leaves here.
//   { action: "set-key", churchId, key }     manage.devices: saves the private key (PKCS#8 PEM, as QZ Tray makes it)
//   { action: "remove-key", churchId }       manage.devices
//   { action: "sign", churchId, request }    any member or device of the church -> { signature } (base64 RSA SHA-512)
import { admin, caller, can, fail, handle, json } from "../_shared/util.ts";

const pemBody = (pem: string) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
const importKey = (pem: string) => crypto.subtle.importKey("pkcs8", pemBody(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" }, false, ["sign"]);

handle(async (req) => {
  const { user, client } = await caller(req);
  if (!user) return fail("Sign in first.", 401);
  const b = await req.json(), db = admin(), churchId = String(b.churchId || "");
  if (b.action === "set-key" || b.action === "remove-key") {
    if (!(await can(client, churchId, "manage.devices"))) return fail("Your role doesn't include screens and devices.", 403);
    if (b.action === "remove-key") { await db.from("payment_keys").delete().eq("church_id", churchId).eq("provider", "qz"); return json({ ok: true }); }
    const key = String(b.key || "").trim();
    if (!/BEGIN PRIVATE KEY/.test(key)) return fail("Paste the private key that starts with BEGIN PRIVATE KEY.");
    try { await importKey(key); } catch { return fail("That private key couldn't be read. Use the private-key.pem file QZ Tray made."); }
    const { error } = await db.rpc("payment_key_set", { c: churchId, p: "qz", s: key });
    return error ? fail(error.message, 500) : json({ ok: true });
  }
  if (b.action === "sign") {
    const { data: m } = await db.from("memberships").select("user_id").eq("church_id", churchId).eq("user_id", user.id).maybeSingle();
    if (!m) return fail("Join this church first.", 403);
    const { data: pem } = await db.rpc("payment_key_get", { c: churchId, p: "qz" });
    if (!pem) return fail("No signing key is saved. Add it under Admin, Printing.", 404);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", await importKey(pem), new TextEncoder().encode(String(b.request || "")));
    return json({ signature: btoa(String.fromCharCode(...new Uint8Array(sig))) });
  }
  return fail("Unknown action");
});
