// ---------- Events ----------
let eventFilter = "All";

Screens.events = () => {
  if (!S.on("events")) return { redirect: "home" };
  const list = upcomingEvents();
  const cats = ["All", ...new Set(list.map((e) => e.category))];
  if (!cats.includes(eventFilter)) eventFilter = "All";
  const shown = list.filter((e) => eventFilter === "All" || e.category === eventFilter);
  const mine = list.filter(myRegistration);
  const months = [...new Set(shown.map((e) => fmt(e.start, { month: "long", year: "numeric" })))];
  return {
    title: "Events", tab: "events",
    body: html`
      <div style="margin-top:12px">${campusChip()}</div>
      ${cats.length > 2 ? html`<div class="chips" role="group" aria-label="Filter events" style="margin-top:8px">${cats.map((c) => html`<button class="chip" data-act="event-filter" data-cat="${c}" aria-pressed="${c === eventFilter}">${c}</button>`)}</div>` : ""}
      ${mine.length && eventFilter === "All" ? html`<section class="sec" style="margin-top:12px"><h2 class="sec-head">You're going</h2><div class="rows">${mine.map(eventRow)}</div></section>` : ""}
      ${shown.length ? months.map((m) => html`<section class="sec" style="margin-top:18px"><h2 class="sec-head">${m}</h2><div class="rows">${shown.filter((e) => fmt(e.start, { month: "long", year: "numeric" }) === m).map(eventRow)}</div></section>`)
        : html`<div class="rows" style="margin-top:14px">${empty("Nothing on the calendar yet.")}</div>`}`,
  };
};
Actions["event-filter"] = (el) => { eventFilter = el.dataset.cat; render(); };

function gcalLink(title, start, end, details, where) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${z(start)}/${z(end)}`, details: `${details || ""}\n\n${S.church().name}`, location: where || "" });
  return `https://calendar.google.com/calendar/render?${p}`;
}
const fullAddress = (item) => [item.room || item.location, item.locationId ? S.location(item.locationId)?.address : churchCity(S.church())].filter(Boolean).join(", ");

Screens.event = (id) => {
  const e = S.get("events", id);
  if (!e || !S.inScope(e, { ignoreCampus: true })) return { redirect: "events" };
  const reg = myRegistration(e);
  const taken = registeredCount(e);
  const left = e.capacity ? e.capacity - taken : null;
  const sameDay = isoDay(e.start) === isoDay(e.end);
  return {
    title: e.title, back: "events", tab: "events",
    body: html`
      <p style="margin:16px 0 4px"><span class="tag brand">${e.category}</span>${e.locationId && S.location(e.locationId)?.visibility === "private" ? html` <span class="tag">${icon("lock")}Private location</span>` : ""}</p>
      <h1>${e.title}</h1>
      <div class="meta">
        ${icon("calendar")}<span>${fmtDay(e.start)}<br>${fmtTime(e.start)} to ${sameDay ? fmtTime(e.end) : `${fmtShort(e.end)} ${fmtTime(e.end)}`}</span>
        ${icon("pin")}<span>${placeText(e)}<br><a href="${mapLink(fullAddress(e))}" target="_blank" rel="noopener">Directions</a></span>
        ${e.signup ? html`${icon("people")}<span>${taken} signed up${left != null ? `, ${Math.max(left, 0)} spots left` : ""}</span>` : ""}
      </div>
      <p class="lead">${e.description}</p>
      ${e.signup ? html`<div class="panel" style="margin-top:16px">
        ${reg ? html`<p style="margin-top:0"><span class="tag ok">You're going</span> ${reg.count > 1 ? `${reg.count} people in your party` : ""}${reg.kids?.length ? `, including ${listJoin(reg.kids.map((k) => S.me().household.find((p) => p.id === k)?.name).filter(Boolean))}` : ""}.</p>
            <div class="btns"><button class="btn ghost" data-act="event-register" data-id="${e.id}">Change</button><button class="btn danger" data-act="event-cancel" data-id="${e.id}">Cancel my spot</button></div>`
          : left !== null && left <= 0 ? html`<p style="margin:0"><b>This event is full.</b></p>`
          : html`<button class="btn block" data-act="event-register" data-id="${e.id}">Sign up</button>`}
      </div>` : ""}
      <div class="btns">${ext(gcalLink(e.title, e.start, e.end, e.description, fullAddress(e)), "Add to Google Calendar", "btn ghost sm", "calendar")}
        <button class="btn ghost sm" data-act="copy" data-done="Event details copied" data-text="${`${e.title}\n${fmtDay(e.start)}, ${fmtTime(e.start)}\n${placeText(e)}\n\n${e.description}\n${appLink(`event-${e.id}`)}`}">${icon("copy")}Copy details</button>
        ${S.can("qr.create") ? html`<button class="btn ghost sm" data-act="qr-for" data-target="${e.signup ? `register-event-${e.id}` : `event-${e.id}`}" data-label="${e.title}">${icon("qr")}QR code</button>` : ""}</div>`,
    after() { if (pendingRegister === e.id) { pendingRegister = null; if (e.signup && !reg) Actions["event-register"]({ dataset: { id: e.id } }); } },
  };
};
// #register-event-ID opens the event with its sign-up sheet (used by QR codes).
let pendingRegister = null;
Screens.register = (tail) => {
  const [kind, ...rest] = tail.split("-"); const id = rest.join("-");
  pendingRegister = id;
  return { redirect: kind === "event" ? `event-${id}` : `gathering-${id}` };
};

Actions["event-register"] = (el) => {
  const e = S.get("events", el.dataset.id), reg = myRegistration(e), me = S.me();
  const kids = me.household.filter((p) => p.kind === "child");
  openSheet(`Sign up for ${e.title}`, html`<form data-form="event-register" novalidate><input type="hidden" name="id" value="${e.id}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${me.name}" required></label>
    ${e.kids && kids.length ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Bringing kids?</legend>
      ${kids.map((k) => html`<label class="check"><input type="checkbox" name="kids" value="${k.id}" ${attr(reg?.kids?.includes(k.id), "checked")}><span>${k.name}</span></label>`)}
      <small class="faint">Registered kids show up in your parent portal.</small></fieldset>` : ""}
    <label class="field"><span>How many people in total, including you?</span><input type="number" name="count" min="1" max="12" value="${reg?.count || 1}"></label>
    <label class="field"><span>Email for a reminder</span><input type="email" name="email" value="${me.email}"></label>
    <button class="btn block">${reg ? "Save changes" : "Sign up"}</button></form>`);
};
Forms["event-register"] = (d, f, fd) => {
  const e = S.get("events", d.id), me = S.me();
  const kids = fd.getAll("kids");
  const count = Math.max(clamp(parseInt(d.count, 10) || 1, 1, 12), kids.length + 1);
  if (!d.name) return formError(f, "Enter your name.");
  const others = e.registrations.filter((r) => r.by !== me.id);
  const taken = others.reduce((n, r) => n + (r.count || 1), 0);
  if (e.capacity && taken + count > e.capacity) return formError(f, `Only ${e.capacity - taken} spots are left.`);
  const isNew = !myRegistration(e);
  e.registrations = [...others, { by: me.id, name: d.name, email: d.email, count, kids, at: new Date().toISOString() }];
  if (d.email && !me.email) me.email = d.email;
  if (isNew) emit("event.registered", { event: e.title, eventId: e.id, name: d.name, count, kids: kids.length });
  S.save(); closeSheet(); toast("You're signed up"); render();
};
Actions["event-cancel"] = (el) => {
  const e = S.get("events", el.dataset.id);
  e.registrations = e.registrations.filter((r) => r.by !== S.me().id);
  S.save(); toast("Your spot is cancelled"); render();
};
