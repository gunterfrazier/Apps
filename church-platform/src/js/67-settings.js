// ---------- Settings: language, text size, contrast, motion, read aloud and notifications ----------
// Display settings belong to the device, so they live in S.state.prefs and apply before the first paint.

const DEFAULT_PREFS = { lang: "", text: "m", contrast: false, calm: false, notify: { news: true, chat: true, serve: true, event: true, staff: true }, push: false, quiet: false };
const prefs = () => { S.state.prefs ||= JSON.parse(JSON.stringify(DEFAULT_PREFS)); return S.state.prefs; };
const lang = () => S.state?.prefs?.lang || ((navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en");
const appLocale = () => (lang() === "es" ? "es-US" : undefined);
function applyDisplay() {
  const p = prefs(), root = document.documentElement;
  root.classList.toggle("text-l", p.text === "l"); root.classList.toggle("text-xl", p.text === "xl");
  root.classList.toggle("contrast", !!p.contrast); root.classList.toggle("calm", !!p.calm);
  root.lang = lang() === "es" ? "es" : "en";
}

Screens.settings = () => {
  const p = prefs(), staff = S.isMember() && S.canAny(["manage.followup", "manage.locations", "manage.content", "schedule.teams"]);
  const pushState = !Push.supported() ? "unsupported" : typeof Notification !== "undefined" && Notification.permission === "denied" ? "denied" : p.push ? "on" : "off";
  const toggle = (k, label, sub, on) => html`<label class="row switch-row"><span class="body"><span class="t">${label}</span>${sub ? html`<span class="s">${sub}</span>` : ""}</span><input type="checkbox" class="switch" data-change="pref" data-k="${k}" ${attr(on, "checked")}></label>`;
  return {
    title: "Settings", back: "me",
    body: html`<section class="sec"><h2 class="sec-head">Language</h2>
        <nav class="seg" aria-label="Language" style="margin-top:0">${[["en", "English"], ["es", "Español"]].map(([k, l]) => html`<a href="#settings" data-act="set-lang" data-v="${k}" lang="${k}" ${attr(lang() === k, 'aria-current="page"')}>${l}</a>`)}</nav>
        <p class="faint">Changes the app's buttons, menus and dates. Sermons, announcements and other things your church writes stay as they wrote them.</p></section>
      <section class="sec"><h2 class="sec-head">Display</h2>
        <fieldset class="field" style="border:0;padding:0;margin-top:0"><legend class="flabel">Text size</legend><div class="radios">${[["m", "Default"], ["l", "Large"], ["xl", "Largest"]].map(([k, l]) => html`<label><input type="radio" name="text" value="${k}" data-change="pref-text" ${attr(p.text === k, "checked")}><span style="font-size:${k === "m" ? 1 : k === "l" ? 1.12 : 1.25}em">${l}</span></label>`)}</div></fieldset>
        <div class="rows">${toggle("contrast", "More contrast", "Darker text and stronger outlines", p.contrast)}${toggle("calm", "Reduce motion", "Turn off animations and moving effects", p.calm)}</div></section>
      <section class="sec"><h2 class="sec-head">Notifications</h2>
        <div class="rows">
          <div class="row"><span class="lead-ic">${icon("bell")}</span><span class="body"><span class="t">Push notifications</span><span class="s">${{ on: "On for this device", off: "Off. Turn on to get them even when the app is closed.", denied: "Blocked in your browser's settings for this site", unsupported: IN_PREVIEW ? "Work once the app is on your church's website" : "Not available in this browser. On iPhone, add the app to your Home Screen first." }[pushState]}</span></span>
            ${pushState === "off" ? html`<button class="btn sm" data-act="push-on">Turn on</button>` : pushState === "on" ? html`<button class="btn ghost sm" data-act="push-off">Turn off</button>` : ""}</div>
          ${toggle("notify.news", "Announcements", "When your church posts something important", p.notify.news)}
          ${toggle("notify.chat", "Messages", "New messages in your chats", p.notify.chat)}
          ${toggle("notify.serve", "Serving", "Requests to serve and reminders the day before", p.notify.serve)}
          ${toggle("notify.event", "Events and classes", "Reminders the day before something you signed up for", p.notify.event)}
          ${staff ? toggle("notify.staff", "Staff updates", "New people to follow up, room requests and form responses", p.notify.staff) : ""}
          ${toggle("quiet", "Quiet at night", "Hold push notifications from 9 PM to 7 AM", p.quiet)}</div></section>`,
  };
};
Inputs["pref"] = (el) => {
  const p = prefs(), [a, b] = el.dataset.k.split(".");
  if (b) p[a][b] = el.checked; else p[a] = el.checked;
  S.save(); applyDisplay();
};
Inputs["pref-text"] = (el) => { prefs().text = el.value; S.save(); applyDisplay(); };
Actions["set-lang"] = (el) => { prefs().lang = el.dataset.v; S.save(); applyDisplay(); render(); toast(el.dataset.v === "es" ? "Idioma: español" : "Language: English"); };

// ----- Read aloud: the page's Claude voice in the preview, the browser's voice elsewhere -----
const Speech = {
  tts: undefined, current: null,
  async engine() {
    if (IN_PREVIEW) {
      if (this.tts === undefined) { try { this.tts = (await window.claude?.use?.("tts")) || null; } catch { this.tts = null; } }
      if (this.tts) return "tts";
    }
    return "speechSynthesis" in window ? "web" : null;
  },
  chunks(text) { const out = []; let cur = ""; String(text).split(/(?<=[.!?])\s+|\n+/).forEach((s) => { if ((cur + " " + s).length > 1500) { if (cur) out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s; }); if (cur) out.push(cur); return out; },
  stop() { try { this.tts?.stop(); } catch {} try { window.speechSynthesis?.cancel(); } catch {} this.mark(null); },
  mark(src) { this.current = src; $$("[data-act=listen]").forEach((b) => { const on = b.dataset.src === src; b.setAttribute("aria-pressed", on); $(".lbl", b).textContent = on ? tr("Stop") : tr(b.dataset.label || "Listen"); }); },
  async say(text, src) {
    this.stop();
    const eng = await this.engine();
    if (!eng) { toast("Read aloud isn't available in this browser"); return; }
    const parts = this.chunks(text); if (!parts.length) return;
    this.mark(src);
    try {
      if (eng === "tts") await this.tts.speak(parts.map((t) => ({ text: t })));
      else await new Promise((res, rej) => parts.forEach((t, i) => { const u = new SpeechSynthesisUtterance(t); u.rate = 0.95; if (i === parts.length - 1) { u.onend = res; u.onerror = (e) => (e.error === "interrupted" || e.error === "canceled" ? res() : rej(e)); } window.speechSynthesis.speak(u); }));
    } catch (e) { if (e?.code === "not_granted") toast("Read aloud is turned off for this page"); else if (e?.code === "rate_limited") toast("Too many requests. Try again in a minute."); }
    if (this.current === src) this.mark(null);
  },
};
/** A Listen button. src says what to read: "passage:John 3:16", "sermon:ID", "news:ID", "doc:ID", "plan:ID:day". */
const listenBtn = (src, label = "Listen") => html`<button class="btn ghost sm listen" data-act="listen" data-src="${src}" data-label="${label}" aria-pressed="false">${icon("music")}<span class="lbl">${label}</span></button>`;
async function listenText(src) {
  const [kind, ...rest] = src.split(":"), id = rest.join(":");
  if (kind === "passage") { const t = await Bible.text(id, "BSB").catch(() => ""); return t ? `${id}. ${t.replace(/(^|\s)\d+\s/g, " ")}` : ""; }
  if (kind === "sermon") { const s = S.get("sermons", id); return s ? [s.title, s.summary, ...(s.outline || []), transcriptText(s)].filter(Boolean).join(". ") : ""; }
  if (kind === "transcript") { const s = S.get("sermons", id); return s ? transcriptText(s) : ""; }
  if (kind === "news") { const n = S.get("news", id); return n ? `${n.title}. ${n.body}` : ""; }
  if (kind === "doc") {
    const d = S.get("docs", id); if (!d) return "";
    const out = [d.title];
    for (const b of d.blocks.filter((x) => x.show && x.type !== "note")) out.push(b.type === "scripture" ? `${b.ref}. ${(b.text || (await Bible.text(b.ref, "BSB").catch(() => ""))).replace(/(^|\s)\d+\s/g, " ")}` : [b.title, b.text, b.caption].filter(Boolean).join(". "));
    return out.join(". ");
  }
  if (kind === "plan") { const [pid, day] = id.split("|"), p = S.get("plans", pid); const refs = p?.days[+day] || []; const texts = await Promise.all(refs.map((r) => Bible.text(r, "BSB").then((t) => `${r}. ${t.replace(/(^|\s)\d+\s/g, " ")}`).catch(() => ""))); return texts.join(" "); }
  return "";
}
Actions["listen"] = async (el) => {
  const src = el.dataset.src;
  if (Speech.current === src) { Speech.stop(); return; }
  const text = await listenText(src);
  if (!text) { toast("There's nothing to read here yet"); return; }
  Speech.say(text, src);
};
window.addEventListener("hashchange", () => { if (Speech.current) Speech.stop(); });

// ----- Push notifications (Web Push) -----
const Push = {
  supported() { return !IN_PREVIEW && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined"; },
  async enable() {
    if (!this.supported()) { toast("Push notifications aren't available here"); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications are blocked. You can allow them in your browser's settings."); return false; }
    try {
      const reg = await navigator.serviceWorker.ready;
      if (PLATFORM.vapidPublicKey && typeof Backend !== "undefined" && Backend.on) {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(PLATFORM.vapidPublicKey) });
        await Backend.savePush(sub.toJSON());
      }
    } catch (e) { console.warn("push subscribe", e); }
    prefs().push = true; S.save(); return true;
  },
  async disable() {
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) { if (typeof Backend !== "undefined" && Backend.on) await Backend.removePush(sub.endpoint); await sub.unsubscribe(); } } catch {}
    prefs().push = false; S.save();
  },
  /** While the app is open in the background, show new notifications through the service worker. */
  async local(n) {
    const p = prefs();
    if (!p.push || typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const h = new Date().getHours(); if (p.quiet && (h >= 21 || h < 7)) return;
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(n.title, { body: n.body, tag: n.id, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: `./${n.link || "#alerts"}` } }); } catch {}
  },
};
function vapidKey(b64) { const pad = "=".repeat((4 - (b64.length % 4)) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); }
Actions["push-on"] = async () => { if (await Push.enable()) { toast("Push notifications are on"); render(); } };
Actions["push-off"] = async () => { await Push.disable(); toast("Push notifications are off"); render(); };

// Which setting covers each kind of notification.
const NOTIFY_GROUP = { serve: "serve", chat: "chat", news: "news", event: "event", form: "staff", follow: "staff", room: "staff" };
const wantsNotify = (n) => { const g = NOTIFY_GROUP[n.kind]; return !g || prefs().notify[g] !== false; };

// ----- Reminders the day before -----
function runReminders() {
  if (!S.church() || !S.isMember()) return;
  const sent = (S.state.reminded ||= []), now = Date.now(), soon = (t) => t > now && t - now < 30 * 3600e3;
  const once = (key, n) => { if (sent.includes(key)) return; sent.push(key); if (sent.length > 300) sent.splice(0, sent.length - 300); notify(S.me().id, n); };
  myAssignments().filter(([p, a]) => a.status === "accepted" && soon(fromIsoDay(p.date, p.time || "09:00").getTime()))
    .forEach(([p, a]) => once(`serve:${a.id}`, { kind: "serve", title: `You're serving ${isoDay(fromIsoDay(p.date)) === isoDay(new Date()) ? "today" : "tomorrow"}`, body: `${a.position} on the ${a.team} team, ${planLabel(p)}`, link: "#serving" }));
  upcomingEvents().filter((e) => myRegistration(e) && soon(new Date(e.start).getTime()))
    .forEach((e) => once(`event:${e.id}`, { kind: "event", title: `Coming up: ${e.title}`, body: `${fmtWhen(e.start)}, ${placeText(e)}`, link: `#event-${e.id}` }));
  S.visible("gatherings", { ignoreCampus: true }).filter((g) => isIn(g) || myEntries(g).length).forEach((g) => {
    const t = nextMeeting(g); if (t && soon(t.getTime())) once(`g:${g.id}:${isoDay(t)}`, { kind: "event", title: `${g.name} meets ${isoDay(t) === isoDay(new Date()) ? "today" : "tomorrow"}`, body: `${fmtTime(t)}${g.room ? `, ${g.room}` : ""}`, link: `#gathering-${g.id}` });
  });
}
setInterval(runReminders, 30 * 60e3);
