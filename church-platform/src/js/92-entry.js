// ---------- Event entry: checking people in and out with their tickets ----------
// At a door or gate, a phone or tablet scans the QR code on someone's phone or printed ticket (or a handheld scanner
// reads its barcode) and checks them in, or out. A staff member can also find someone by name. Each check-in or out is
// its own record, so the door keeps a history and two devices at two doors stay in step:
//   eventCheckins: { eventId, regId, name, dir: "in" | "out", count, at, by, deviceId }
// Who can: anyone with "Check people in and out of events", the people an event names to take its payments, "Event
// entry" devices and kiosks with event check-in turned on. A kiosk lets people scan their own ticket to check in.

const canCheckinEvents = (e) => S.isMember() && (S.can("checkin.events") || S.can("manage.content") || (e?.collectors || []).includes(S.me().id));
const entriesOf = (e, r) => S.list("eventCheckins").filter((x) => x.eventId === e.id && (!r || x.regId === regIdOf(e, r)));
/** How many of a sign-up are in now, and how many came at all. */
function entryCount(e, r) {
  let now = 0, came = 0;
  entriesOf(e, r).sort((a, b) => a.at.localeCompare(b.at)).forEach((x) => { if (x.dir === "in") { now += x.count; came = Math.max(came, now); } else now = Math.max(0, now - x.count); });
  return { now, came };
}
const admitsOf = (r) => r.count || Object.values(r.tickets || {}).reduce((n, x) => n + x, 0) || 1;
/** Events a door can check people into: today's, then the next two weeks. */
function gateEvents() {
  const from = new Date(Date.now() - 18 * 3600e3).toISOString(), to = new Date(Date.now() + 14 * DAY).toISOString(), d = thisDevice();
  return S.list("events").filter((e) => e.signup && (e.end || e.start) >= from && e.start <= to && (!d?.locationId || !e.locationId || e.locationId === d.locationId)).sort((a, b) => a.start.localeCompare(b.start));
}
const gate = { eventId: "", dir: "in", last: null, q: "", n: 1, from: "" };
let gateStream = null, gateLoop = 0, gateCooldown = "";
function gateStop() { gateStream?.getTracks().forEach((t) => t.stop()); gateStream = null; clearTimeout(gateLoop); }
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#gate")) gateStop(); });

/** Finds the sign-up for something scanned or typed: a ticket link, a ticket code, or (for staff) a name. */
function gateLookup(e, text) {
  const s = String(text || "").trim(); if (!s) return null;
  const link = s.match(/ticket-([^~\s]+)~([^~\s]+)~([A-Z0-9]+)/i);
  if (link) {
    const [, eid, by, code] = link;
    if (eid !== e.id) { const other = S.get("events", eid); return { error: other ? `This ticket is for ${other.title}, ${fmtShort(other.start)}.` : "This ticket is for a different event." }; }
    const r = e.registrations.find((x) => x.by === by);
    if (!r || (r.code && r.code.toUpperCase() !== code.toUpperCase())) return { error: "This ticket wasn't found. It may have been cancelled." };
    return { r };
  }
  const code = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length >= 6) { const r = e.registrations.find((x) => (x.code || "").toUpperCase() === code); if (r) return { r }; }
  if (thisDevice()?.type === "kiosk") return { error: "That ticket wasn't found. Try scanning it again, or ask at the welcome desk." };
  const words = s.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = e.registrations.filter((r) => words.every((w) => r.name.toLowerCase().split(/\s+/).some((x) => x.startsWith(w)))).slice(0, 8);
  return hits.length === 1 ? { r: hits[0] } : hits.length ? { list: hits } : { error: `No one named "${s}" signed up for this event.` };
}
function gateRecord(e, r, dir, count) {
  const d = thisDevice();
  S.add("eventCheckins", { eventId: e.id, regId: regIdOf(e, r), name: r.name, dir, count, at: new Date().toISOString(), by: S.me().id, deviceId: d?.id || null });
  emit(dir === "in" ? "event.checkin" : "event.checkout", { event: e.title, eventId: e.id, name: r.name, count });
  S.save();
}
/** After a scan: for a self-check-in kiosk it checks them in straight away; for staff it shows who it is and the buttons. */
function gateFound(e, res) {
  gate.last = { ...res, at: Date.now() };
  if (res.r) {
    const { now } = entryCount(e, res.r), left = admitsOf(res.r) - now;
    gate.n = gate.dir === "in" ? Math.max(1, left) : Math.max(1, now);
    if (selfKiosk() && !res.error) {
      if (res.r.total && regBalance(e, res.r) > 0) gate.last.warn = `${money(regBalance(e, res.r))} is still due. Please see the welcome desk.`;
      else if (left <= 0) gate.last.warn = "You're already checked in. Enjoy!";
      else { gateRecord(e, res.r, "in", left); gate.last.done = `Welcome, ${firstName(res.r.name)}! ${left > 1 ? `${left} checked in.` : "You're checked in."}`; }
      setTimeout(() => { if (gate.last?.at && Date.now() - gate.last.at > 7000) { gate.last = null; render(); } }, 8000);
    }
  }
  render();
}
const selfKiosk = () => thisDevice()?.type === "kiosk";

Screens.gate = (tail = "") => {
  const [eid, code] = tail.split("~"), dev = thisDevice(), events = gateEvents();
  if (!S.isMember() || !(dev || S.can("checkin.events") || S.can("manage.content") || events.some((e) => canCheckinEvents(e)))) return { redirect: "events" };
  if (eid && S.get("events", eid)) gate.eventId = eid;
  if (dev?.settings?.eventId && S.get("events", dev.settings.eventId)) gate.eventId = dev.settings.eventId;
  if (gate.eventId && !S.get("events", gate.eventId)) gate.eventId = "";
  if (!gate.eventId && events.length === 1 && dev) gate.eventId = events[0].id;
  const e = gate.eventId && S.get("events", gate.eventId);
  if (e && code && gate.from !== tail) { gate.from = tail; setTimeout(() => gateFound(e, gateLookup(e, code) || {}), 0); }
  const kioskStyle = !!dev, self = selfKiosk();
  if (!e) {
    const body = html`<h1 class="${kioskStyle ? "kiosk-h" : ""}" style="${kioskStyle ? "" : "font-size:1.3rem;margin:16px 0 8px"}">Which event?</h1>
      <div class="rows">${events.length ? events.map((x) => html`<button class="row" data-act="gate-event" data-id="${x.id}"><span class="lead-ic">${icon("ticket")}</span><span class="body"><span class="t">${x.title}</span><span class="s">${fmtWhen(x.start)}. ${plural(x.registrations.length, "sign-up")}</span></span>${icon("chev")}</button>`)
        : empty("No events with sign-ups today or in the next two weeks.")}</div>`;
    return kioskStyle ? { kiosk: true, page: kioskShell("Event check-in", body, "gate-kiosk") } : { title: "Check in at events", back: "events", body };
  }
  const regs = e.registrations, total = regs.reduce((n, r) => n + admitsOf(r), 0), inNow = regs.reduce((n, r) => n + entryCount(e, r).now, 0), came = regs.reduce((n, r) => n + entryCount(e, r).came, 0);
  const L = gate.last, r = L?.r, cnt = r && entryCount(e, r), due = r && r.total ? regBalance(e, r) : 0;
  const result = !L ? "" : L.error ? html`<div class="gate-result bad" role="alert">${icon("x")}<div><b>${L.error}</b></div></div>`
    : L.list ? html`<div class="gate-result"><b>Who is it?</b><div class="rows">${L.list.map((x) => html`<button class="row" data-act="gate-pick" data-reg="${regIdOf(e, x)}"><span class="body"><span class="t">${x.name}</span><span class="s">${ticketSummary(e, x) || plural(admitsOf(x), "person", "people")}. ${entryCount(e, x).now ? `${entryCount(e, x).now} in now` : "Not in yet"}</span></span>${icon("chev")}</button>`)}</div></div>`
    : L.done ? html`<div class="gate-result ok" role="status">${icon("check")}<div><b>${L.done}</b><span>${e.title}</span></div></div>`
    : self && L.warn ? html`<div class="gate-result warn" role="alert">${icon("info")}<div><b>${L.warn}</b></div></div>`
    : r ? html`<div class="gate-result ${due ? "warn" : cnt.now >= admitsOf(r) && gate.dir === "in" ? "warn" : "ok"}">
        <div class="gate-who"><b>${r.name}</b><span>${ticketSummary(e, r) || plural(admitsOf(r), "person", "people")}. Admits ${admitsOf(r)}.</span>
          <span>${cnt.now ? `${cnt.now} in now` : cnt.came ? "Checked out" : "Not checked in yet"}${r.total ? html`. ${due ? html`<b class="tk-owe">${money(due)} due</b>` : "Paid in full"}` : ""}</span></div>
        ${due && S.can("take.payments") ? html`<button class="btn ghost sm" data-act="tk-record" data-event="${e.id}" data-reg="${regIdOf(e, r)}">${icon("plus")}Take payment</button>` : ""}
        <div class="gate-act"><div class="stepper"><button class="icon-btn" data-act="gate-n" data-d="-1" aria-label="Fewer">−</button><b>${gate.n}</b><button class="icon-btn" data-act="gate-n" data-d="1" aria-label="More">+</button></div>
          ${gate.dir === "in" ? html`<button class="btn" data-act="gate-do" data-dir="in" ${attr(cnt.now >= admitsOf(r), "disabled")}>${icon("check")}Check in ${gate.n}</button>`
            : html`<button class="btn" data-act="gate-do" data-dir="out" ${attr(!cnt.now, "disabled")}>Check out ${gate.n}</button>`}</div></div>` : "";
  const recent = entriesOf(e).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const body = html`
    <div class="gate-head"><div><b>${e.title}</b><span>${fmtWhen(e.start)}${e.location ? `. ${e.location}` : ""}</span></div>${!dev?.settings?.eventId && events.length > 1 ? html`<button class="btn ghost sm" data-act="gate-event" data-id="">Change</button>` : ""}</div>
    ${self ? "" : html`<div class="stat-tiles gate-tiles">${statTile("In now", inNow.toLocaleString(), `of ${total.toLocaleString()}`)}${statTile("Came", came.toLocaleString(), plural(regs.filter((x) => entryCount(e, x).came).length, "sign-up"))}</div>
      <div class="seg gate-dir" role="group" aria-label="Checking"><button class="chip" data-act="gate-dir" data-v="in" aria-pressed="${gate.dir === "in"}">Checking in</button>${dev && !dev.settings?.allowOut ? "" : html`<button class="chip" data-act="gate-dir" data-v="out" aria-pressed="${gate.dir === "out"}">Checking out</button>`}</div>`}
    ${self ? html`<h1 class="kiosk-h">Scan your ticket to check in</h1><p class="kiosk-hint">Hold the QR code on your phone or printed ticket up to the camera.</p>` : ""}
    <div class="scan-box gate-scan"><video id="gate-video" playsinline muted></video><div class="scan-frame"></div>${gateStream ? "" : html`<button class="btn gate-cam" data-act="gate-camera">${icon("scan")}Start the camera</button>`}</div>
    <form data-form="gate-find" class="gate-find" autocomplete="off" novalidate><input type="text" name="q" placeholder="${self ? "Or type the code under the barcode" : "Ticket code, or a name"}" aria-label="Ticket code or name" autocapitalize="characters"><button class="btn">${icon("search")}Find</button></form>
    <div id="gate-result" aria-live="polite">${result}</div>
    ${!self && recent.length ? html`<section class="sec"><h2 class="sec-head">Just now</h2><div class="rows">${recent.map((x) => html`<div class="row"><span class="lead-ic">${icon(x.dir === "in" ? "check" : "back")}</span><span class="body"><span class="t">${x.name}</span><span class="s">${x.dir === "in" ? "In" : "Out"}${x.count > 1 ? `, ${x.count}` : ""}, ${fmtTime(x.at)}</span></span></div>`)}</div></section>` : ""}
    ${IN_PREVIEW ? demoNote("The camera works on the church's own website. Here, type a ticket code (like the one under a ticket's barcode) or a name.") : ""}`;
  const after = () => { if (gateStream) { const v = $("#gate-video"); if (v && v.srcObject !== gateStream) { v.srcObject = gateStream; v.play().catch(() => {}); } } else if (dev && !IN_PREVIEW && !gate.camTried) { gate.camTried = true; Actions["gate-camera"](); } $(".gate-find input")?.focus({ preventScroll: true }); };
  return kioskStyle ? { kiosk: true, page: kioskShell(self ? "Event check-in" : `${dev.name}: ${e.title}`, body, "gate-kiosk"), after }
    : { title: "Check in", back: `event-${e.id}`, body, after };
};
Actions["gate-event"] = (el) => { gate.eventId = el.dataset.id; gate.last = null; render(); };
Actions["gate-dir"] = (el) => { gate.dir = el.dataset.v; if (gate.last?.r) { const c = entryCount(S.get("events", gate.eventId), gate.last.r); gate.n = Math.max(1, gate.dir === "in" ? admitsOf(gate.last.r) - c.now : c.now); } render(); };
Actions["gate-n"] = (el) => { const r = gate.last?.r; if (!r) return; const c = entryCount(S.get("events", gate.eventId), r), max = gate.dir === "in" ? Math.max(1, admitsOf(r) - c.now) : Math.max(1, c.now); gate.n = clamp(gate.n + +el.dataset.d, 1, max); render(); };
Actions["gate-pick"] = (el) => { const e = S.get("events", gate.eventId), r = e.registrations.find((x) => regIdOf(e, x) === el.dataset.reg); if (r) gateFound(e, { r }); };
Actions["gate-do"] = (el) => {
  const e = S.get("events", gate.eventId), r = gate.last?.r; if (!e || !r) return;
  const c = entryCount(e, r), n = el.dataset.dir === "in" ? Math.min(gate.n, admitsOf(r) - c.now) : Math.min(gate.n, c.now);
  if (n <= 0) return;
  gateRecord(e, r, el.dataset.dir, n);
  gate.last = { done: `${r.name}: ${el.dataset.dir === "in" ? `${n} checked in` : `${n} checked out`}`, at: Date.now() };
  render(); setTimeout(() => { if (gate.last?.done && Date.now() - gate.last.at > 3500) { gate.last = null; render(); } }, 4000);
};
Forms["gate-find"] = (d, f) => { const e = S.get("events", gate.eventId); if (!e) return; gateFound(e, gateLookup(e, d.q) || { error: "Type a ticket code or a name." }); f.reset(); };
Actions["gate-camera"] = async () => {
  if (!navigator.mediaDevices?.getUserMedia) return toast("This device has no camera the app can use. Type the ticket code instead.");
  try {
    gateStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: thisDevice()?.type === "kiosk" ? "user" : "environment" } });
    scanFormats = ["code_128"]; render();
    const tick = async () => {
      const v = $("#gate-video"), e = S.get("events", gate.eventId);
      if (!gateStream || !location.hash.startsWith("#gate")) return gateStop();
      if (v?.videoWidth && e) {
        const w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * (w / v.videoWidth));
        let text = null; try { text = await decodeSource(v, w, h); } catch { /* keep looking */ }
        // The same code held up for a few seconds is one scan, not many.
        if (text && text !== gateCooldown) { gateCooldown = text; setTimeout(() => { if (gateCooldown === text) gateCooldown = ""; }, 4000); gateFound(e, gateLookup(e, text) || {}); }
      }
      gateLoop = setTimeout(tick, 300);
    };
    tick();
  } catch { gateStream = null; toast("The camera couldn't start. Type the ticket code instead."); render(); }
};

// ----- Where it shows up: the event page, the device list and the Tickets report -----
DEVICE_TYPES.gate = ["Event entry", "ticket", "A phone or tablet at a door or gate that scans tickets to check people in and out"];
{
  const event = Screens.event;
  Screens.event = (id) => { const v = event(id), e = S.get("events", id);
    if (!v?.body || !e?.signup || !canCheckinEvents(e)) return v;
    const c = e.registrations.reduce((n, r) => n + entryCount(e, r).now, 0);
    return { ...v, body: html`${v.body}<div class="btns" style="margin-top:10px"><a class="btn ghost" href="#gate-${e.id}">${icon("scan")}Check people in${c ? ` (${c} in now)` : ""}</a></div>` }; };
}
