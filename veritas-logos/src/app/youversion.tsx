// Highlights shared with YouVersion, on the website ("Sign in with YouVersion"; the page in Claude can't make the trip).
//
// Connecting: the reader is sent to YouVersion to sign in and allow Veritas Logos to use their highlights. YouVersion
// sends them back to the website with a code, sometimes after one more stop at YouVersion, and the code is exchanged
// for tokens. The owner's Bible service (supabase/functions/bible-texts, the /yv routes) adds the app key, so it isn't
// in this code. The tokens stay in this browser only, like API keys: they're never saved to an account.
//
// Syncing goes a chapter at a time, as YouVersion's highlights do: opening a chapter brings in YouVersion's highlights
// for it that aren't here yet, and sends up this chapter's highlights that YouVersion doesn't have. Setting or clearing
// a color in the reader sends that change at once. Highlights are matched in one Bible version, chosen on the Account
// page (the BSB by default).
import { useEffect, useState, useSyncExternalStore } from "react";
import { chapterPassage, highlightsByVerse, TO_HEX, versePassage, type HighlightColor } from "../core/youversion";
import { getData, navigate, toast, update } from "./store";
import { IN_CLAUDE } from "./account";

const KEY = "veritas.yv";
const PENDING = "veritas.yv.pending";
const YV_HOST = "https://api.youversion.com";
const BSB_ID = 3034;

interface Conn { access: string; refresh: string; expiresAt: number; name?: string; bibleId: number }
let conn: Conn | null = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function load(): Conn | null {
  try { const c = JSON.parse(localStorage.getItem(KEY) ?? "null"); return c?.access && c?.refresh ? c : null; } catch { return null; }
}
function save(c: Conn | null) {
  conn = c;
  try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* this session only */ }
  emit();
}
export const useYouVersion = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => conn);

/** The service's /yv/<route> address, from the website's settings; empty where there's none (and in Claude). */
function service(route: string): string {
  const web: string | undefined = (window as any).VERITAS_CONFIG?.bibleTextsUrl;
  return !IN_CLAUDE && web ? web.replace(/\/web\/?$/, `/yv/${route}`) : "";
}
export const YOUVERSION_ON = () => Boolean(service("token"));
/** The return address YouVersion was given: the website itself, with no slash at the end. */
const returnAddress = () => location.origin;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/** Starts the trip to YouVersion. */
export async function connectYouVersion() {
  const verifier = random(48), state = random(16), nonce = random(16);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const q = new URLSearchParams({ redirect_uri: returnAddress(), state, nonce, code_challenge: challenge });
  const res = await fetch(`${service("authorize")}?${q}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error || "YouVersion couldn't be reached. Try again.");
  try { localStorage.setItem(PENDING, JSON.stringify({ state, verifier, at: Date.now() })); } catch { throw new Error("This browser won't keep the sign-in details. Allow site storage and try again."); }
  location.href = body.url;
}

/** On page load: finishes a trip back from YouVersion, if this is one. */
export async function finishYouVersionReturn() {
  const params = new URLSearchParams(location.search);
  const state = params.get("state"), code = params.get("code"), error = params.get("error");
  if (!state && !error) return;
  let pending: { state: string; verifier: string } | null = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING) ?? "null"); } catch { /* none */ }
  if (!pending || pending.state !== state) return; // not ours
  const clean = () => { history.replaceState(null, "", `${location.origin}${location.pathname}`); navigate("account"); };
  if (error) {
    localStorage.removeItem(PENDING); clean();
    toast(error === "access_denied" ? "YouVersion wasn't connected." : `YouVersion sign-in didn't finish: ${params.get("error_description") || error}`);
    return;
  }
  if (!code) { location.href = `${YV_HOST}/auth/callback?${params}`; return; } // one more stop at YouVersion
  localStorage.removeItem(PENDING);
  try {
    const t = await tokenCall({ code, code_verifier: pending.verifier, redirect_uri: returnAddress() });
    save({ ...t, bibleId: conn?.bibleId ?? BSB_ID });
    toast(t.name ? `YouVersion connected for ${t.name}` : "YouVersion connected");
  } catch (e: any) {
    toast(e?.message ?? "YouVersion couldn't be connected. Try again.");
  }
  clean();
}

async function tokenCall(body: Record<string, string>): Promise<Omit<Conn, "bibleId">> {
  const res = await fetch(service("token"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) throw new Error(t.error || "YouVersion didn't accept the sign-in.");
  return { access: t.access_token, refresh: t.refresh_token || body.refresh_token || "", expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60_000, name: t.name ?? conn?.name };
}

export function disconnectYouVersion() { save(null); toast("YouVersion disconnected on this device"); }
export function setYouVersionBible(bibleId: number) { if (conn) save({ ...conn, bibleId }); }

/** A highlights request, refreshing the sign-in once if it has run out. */
async function call(method: "GET" | "POST" | "DELETE", passage: string, color?: string): Promise<any> {
  if (!conn) throw new Error("not connected");
  if (Date.now() > conn.expiresAt) await refresh();
  const go = () => fetch(`${service("highlights")}?${new URLSearchParams({ bible_id: String(conn!.bibleId), passage_id: passage })}`, {
    method, headers: { Authorization: `Bearer ${conn!.access}`, ...(color ? { "Content-Type": "application/json" } : {}) }, body: color ? JSON.stringify({ color }) : undefined,
  });
  let res = await go();
  if (res.status === 401) { await refresh(); res = await go(); }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) { save(null); toast("Your YouVersion sign-in ended. Connect again on the Account page."); throw new Error("expired"); }
  if (res.status === 403) throw new Error(body.error || "YouVersion hasn't been allowed to share highlights.");
  if (!res.ok) throw new Error(body.error || "YouVersion didn't answer.");
  return body;
}
let refreshing: Promise<void> | null = null;
function refresh(): Promise<void> {
  refreshing ??= (async () => {
    try { const t = await tokenCall({ refresh_token: conn!.refresh }); if (conn) save({ ...conn, ...t }); }
    catch { save(null); toast("Your YouVersion sign-in ended. Connect again on the Account page."); throw new Error("expired"); }
    finally { refreshing = null; }
  })();
  return refreshing;
}

/** Brings a chapter's YouVersion highlights in, and sends up the ones only this app has. */
const synced = new Map<string, number>();
export async function syncChapter(book: number, chapter: number) {
  if (!conn || !YOUVERSION_ON()) return;
  const key = `${conn.bibleId}:${book}:${chapter}`;
  if (Date.now() - (synced.get(key) ?? 0) < 5 * 60_000) return;
  synced.set(key, Date.now());
  try {
    const theirs = highlightsByVerse(await call("GET", chapterPassage(book, chapter)), book, chapter);
    const mine = getData().highlights;
    const incoming = Object.entries(theirs).filter(([k]) => !mine[k]);
    if (incoming.length) update((d) => ({ ...d, highlights: { ...d.highlights, ...Object.fromEntries(incoming.filter(([k]) => !d.highlights[k])) } }));
    const prefix = `${book}:${chapter}:`;
    const outgoing = Object.entries(mine).filter(([k]) => k.startsWith(prefix) && !theirs[k]).slice(0, 25);
    for (const [k, c] of outgoing) await call("POST", versePassage(book, chapter, Number(k.slice(prefix.length))), TO_HEX[c]);
  } catch {
    synced.delete(key); // try again next time the chapter opens
  }
}

/** The reader set (or cleared) a color on some verses: sends it to YouVersion too. */
export async function pushHighlights(book: number, chapter: number, verses: number[], color: HighlightColor | null) {
  if (!conn || !YOUVERSION_ON()) return;
  try {
    for (const v of verses) await call(color ? "POST" : "DELETE", versePassage(book, chapter, v), color ? TO_HEX[color] : undefined);
  } catch (e: any) {
    if (e?.message !== "expired") toast(`Couldn't update YouVersion: ${e?.message ?? "try again"}`);
  }
}

/** The Account page's YouVersion section, on the website. */
export function YouVersionSection() {
  const c = useYouVersion();
  const [busy, setBusy] = useState(false);
  const [bibles, setBibles] = useState<{ id: number; abbreviation: string; title: string }[]>([]);
  useEffect(() => {
    if (!c) return;
    fetch(service("bibles")).then((r) => r.json()).then((b) => setBibles(Array.isArray(b?.bibles) ? b.bibles : [])).catch(() => {});
  }, [!!c]);
  if (!YOUVERSION_ON()) return null;
  return (
    <section className="youversion-section">
      <h2>YouVersion highlights</h2>
      {c ? (
        <div className="form">
          <p>Connected{c.name ? <> as <strong>{c.name}</strong></> : ""}. Highlights you make here go to your YouVersion account, and your YouVersion highlights appear here as you open each chapter.</p>
          {bibles.length > 0 && (
            <div>
              <label className="label" htmlFor="yv-bible">Match highlights in</label>
              <select id="yv-bible" value={c.bibleId} onChange={(e) => { setYouVersionBible(Number(e.target.value)); synced.clear(); }}>
                {bibles.map((b) => <option key={b.id} value={b.id}>{b.title} ({b.abbreviation})</option>)}
              </select>
              <p className="fine">YouVersion keeps each highlight in one Bible version. Choose the one you highlight in on YouVersion.</p>
            </div>
          )}
          <button type="button" className="btn" onClick={disconnectYouVersion}>Disconnect YouVersion</button>
          <p className="fine">Removing a highlight in the YouVersion Bible App doesn't remove it here; remove it in both.</p>
        </div>
      ) : (
        <div className="form">
          <p>Connect your YouVersion account to keep your highlights the same here and in the YouVersion Bible App. YouVersion asks you to sign in and to allow Veritas Logos to use your highlights.</p>
          <button type="button" className="btn primary" disabled={busy} onClick={async () => { setBusy(true); try { await connectYouVersion(); } catch (e: any) { toast(e?.message ?? "Try again."); setBusy(false); } }}>
            {busy ? "Opening YouVersion…" : "Connect YouVersion"}
          </button>
          <p className="fine">Your YouVersion sign-in is kept in this browser only.</p>
        </div>
      )}
    </section>
  );
}
