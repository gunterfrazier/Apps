// ---------- Showing media on a display ----------
// Whoever is presenting (on the main screens or in a room) can put something else on the display for a while: a video
// from a link, a website, or a file from their own device (a picture, a PDF or a video). "Back to slides" returns to
// the presentation where it was.
// A link travels as a link. A file has to reach the display itself: staff who may upload get it stored and sent as a
// link; anyone else's file is sent to the display in pieces (pictures are shrunk first), up to MEDIA_MAX.
const MEDIA_PIECE = 90000, MEDIA_MAX = 6e6;
const mediaStore = {};    // files held in this browser, by id (the presenter's copy, and a display's once it has arrived)
const mediaParts = {};    // a display's pieces of a file still arriving
const mediaAsked = {};
let mediaSending = false;
function mediaFromLink(url, want) {
  let u; try { u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null;
  if (want === "web") return { type: "web", url: u.href, title: u.hostname };
  const yt = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : /youtube\.com$/.test(u.hostname.replace(/^www\.|^m\./, "")) ? u.searchParams.get("v") || (u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]+)/) || [])[1] : null;
  if (yt) return { type: "frame", url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?autoplay=1&rel=0`, title: "YouTube video" };
  const vm = /vimeo\.com$/.test(u.hostname.replace(/^www\.|^player\./, "")) ? (u.pathname.match(/(\d{6,})/) || [])[1] : null;
  if (vm) return { type: "frame", url: `https://player.vimeo.com/video/${vm}?autoplay=1`, title: "Vimeo video" };
  return { type: "clip", url: u.href, title: u.pathname.split("/").pop() || u.hostname };
}
function mediaElement(md, src) {
  const id = md.id;
  if (md.type === "image") return html`<img class="media-fill contain" data-media-id="${id}" src="${src}" alt="${md.title || ""}">`;
  if (md.type === "clip") return html`<video class="media-fill contain" data-media-id="${id}" src="${src}" autoplay controls playsinline></video>`;
  if (md.type === "web") return html`<iframe class="media-fill" data-media-id="${id}" src="${src}" title="${md.title || "Website"}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>`;
  return html`<iframe class="media-fill" data-media-id="${id}" src="${src}" title="${md.title || "Media"}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
}
const mediaSrc = (md) => md.url || mediaStore[md.id] || "";
/** On a display: draws the media a message carries. True when media is (or is about to be) what's showing. */
function mediaDraw(app, st) {
  const md = st?.media;
  if (!md || st.black || st.logo) return false;
  if (app.querySelector(`[data-media-id="${md.id}"]`)) return true;   // already showing: leave a playing video alone
  const src = mediaSrc(md);
  if (!src) { mediaAsk(st); app.innerHTML = flat(html`<div class="display"><div class="stage"><div class="slide k-title"><div class="slide-center"><div class="slide-sub">Getting ${md.title || "the file"} ready...</div></div></div></div></div>${deviceExitBtn()}`); return true; }
  app.innerHTML = flat(html`<div class="display media-display">${mediaElement(md, src)}</div>${deviceExitBtn()}`);
  return true;
}
/** Sends something the same way slides go: to the main screens, or only to the room being presented in. */
function mediaPost(msg, room) {
  const full = { church: S.state.current, ...msg };
  try { presChannel?.postMessage(full); } catch {}
  if (Backend.on) Backend.broadcast(full, room ? roomTopic(room) : undefined);
}
/** A display that has no copy of the file yet asks the presenter for it (once every few seconds at most). */
function mediaAsk(st) {
  const id = st.media.id;
  if (mediaAsked[id] && Date.now() - mediaAsked[id] < 6000) return;
  mediaAsked[id] = Date.now();
  mediaPost({ mediaNeed: id, room: st.room || null, loc: st.loc || null }, st.room);
}
/** Called for every message a display hears. True when the message was a piece of a file, not a slide. */
function mediaIntercept(m, redraw) {
  if (m?.mediaNeed) return true;
  const p = m?.mediaPart;
  if (!p) return false;
  if (mediaStore[p.id]) return true;
  const got = (mediaParts[p.id] ||= { n: p.n, parts: [] });
  got.parts[p.i] = p.d;
  if (got.parts.filter((x) => x != null).length === got.n) { mediaStore[p.id] = got.parts.join(""); delete mediaParts[p.id]; redraw(); }
  return true;
}
/** The presenter sends a held file to the displays, a piece at a time so the connection keeps up. */
async function mediaSend(md = pres.media) {
  const data = md && mediaStore[md.id];
  if (!data || md.url || mediaSending) return;
  mediaSending = true;
  try {
    const room = pres.room?.token || null, base = { room, loc: pres.room?.loc || presLoc(pres.key) };
    if (!Backend.on) { mediaPost({ ...base, mediaPart: { id: md.id, i: 0, n: 1, d: data } }, room); return; }
    const n = Math.ceil(data.length / MEDIA_PIECE);
    for (let i = 0; i < n; i++) { mediaPost({ ...base, mediaPart: { id: md.id, i, n, d: data.slice(i * MEDIA_PIECE, (i + 1) * MEDIA_PIECE) } }, room); await new Promise((r) => setTimeout(r, 130)); }
  } finally { mediaSending = false; }
}
function mediaShow(md) { pres.media = { id: uid(), ...md }; pres.black = false; pres.logo = false; presBroadcast(); mediaSend(); render(); }
// The presenter hears a display asking for the file.
const mediaHeard = (m) => { if (m?.mediaNeed && m.mediaNeed === pres.media?.id) mediaSend(); };
try { presChannel?.addEventListener("message", (e) => mediaHeard(e.data)); } catch {}
Backend.heard = mediaHeard;

const readAsDataUrl = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
/** Pictures are shrunk to screen size so they travel quickly. */
async function mediaShrink(file) {
  const img = await createImageBitmap(file), k = Math.min(1, 1920 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85);
}
async function mediaFromFile(file) {
  const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "clip" : file.type === "application/pdf" ? "frame" : null;
  if (!type) throw new Error("Choose a picture, a PDF or a video.");
  const md = { id: uid(), type, title: file.name };
  if (type === "image") { mediaStore[md.id] = await mediaShrink(file); return md; }
  // Staff who may upload: store it and send a link, which suits long videos. Otherwise it goes to the display directly.
  if (Backend.on) { try { md.url = await Backend.upload(file, `present/${md.id}-${file.name.replace(/[^\w.-]+/g, "_")}`); return md; } catch { /* not allowed to upload: send it directly */ } }
  if (file.size > (Backend.on ? MEDIA_MAX : 40e6)) throw new Error(`That file is too big to send to the display (${Math.round(file.size / 1e6)} MB). Use a link to it instead, or ask someone who manages content to show it.`);
  mediaStore[md.id] = await readAsDataUrl(file);
  return md;
}
/** In the presenter: what's on the display instead of the slides, and the way back. */
function mediaStrip() {
  const md = pres.media;
  return md ? html`<div class="room-strip media-strip" role="status">${icon("screen")}<span><b>On the display:</b> ${md.title || "media"}</span><button class="btn sm" data-act="pres-media-off">Back to slides</button></div>` : "";
}
Actions["pres-media"] = () => openSheet("Show on the display", html`
  <form data-form="media-link" novalidate><label class="field"><span>A video from a link</span><input type="url" name="url" placeholder="YouTube, Vimeo or a video file's address" inputmode="url" autocomplete="off"></label>
    <input type="hidden" name="want" value="video"><button class="btn block">Play the video</button></form>
  <form data-form="media-link" novalidate style="margin-top:18px"><label class="field"><span>A website</span><input type="url" name="url" placeholder="www.example.org" inputmode="url" autocomplete="off"></label>
    <input type="hidden" name="want" value="web"><button class="btn block">Show the website</button>
    <p class="faint" style="margin-bottom:0">Some websites don't allow being shown inside another page. If the display stays blank, that site is one of them.</p></form>
  <div style="margin-top:18px"><label class="field"><span>A file from this device</span><input type="file" accept="image/*,video/*,application/pdf" data-change="media-file"></label>
    <p class="faint" style="margin:0">A picture, a PDF or a video. The slides stay where they are; choose Back to slides when you're done.</p></div>`);
Forms["media-link"] = (d, f) => {
  const md = mediaFromLink(String(d.url || "").trim(), d.want);
  if (!md) return formError(f, d.want === "web" ? "Enter a website address, like www.example.org." : "Enter the video's link.");
  closeSheet(true); mediaShow(md); toast(d.want === "web" ? "Showing the website" : "Playing on the display");
};
Inputs["media-file"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  el.disabled = true;
  try { const md = await mediaFromFile(file); closeSheet(true); pres.media = md; pres.black = false; pres.logo = false; presBroadcast(); mediaSend(); render(); toast(`Showing ${file.name}`); }
  catch (e) { el.disabled = false; el.value = ""; toast(e.message || "That file couldn't be shown."); }
};
Actions["pres-media-off"] = () => { pres.media = null; presBroadcast(); render(); };
