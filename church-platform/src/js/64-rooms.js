// ---------- Room booking ----------
// Leaders request a room for a time, once or every week. The app checks every booking, event and class or group
// meeting in that room and won't double-book it, and suggests rooms that are free. People who manage locations
// approve requests (their own bookings go straight through).

const canBook = () => S.isMember() && S.canAny(["book.rooms", "manage.locations"]);
const canApproveRooms = () => S.isMember() && S.can("manage.locations");
const sameRoom = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase() && !!String(a || "").trim();
const atTime = (day, hhmm) => fromIsoDay(day, hhmm).getTime();
const addMinutes = (hhmm, m) => { const [h, mm] = hhmm.split(":").map(Number), t = h * 60 + mm + m; return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const roomApprovers = () => S.members().map((m) => m.userId).filter((u) => S.user(u) && S.role(S.state.current, u)?.perms["manage.locations"]);

/** Start and end times of a booking that fall between from and to. */
function bookingTimes(b, from, to) {
  const out = []; let day = b.date;
  for (let i = 0; i < 520; i++) {
    const s = atTime(day, b.start), e = atTime(day, b.end);
    if (s >= to) break;
    if (e > from) out.push([s, e]);
    if (b.repeat !== "weekly") break;
    const d = fromIsoDay(day); d.setDate(d.getDate() + 7); day = isoDay(d);
    if (b.until && day > b.until) break;
  }
  return out;
}
/** When a class or group meets between from and to. Meetings without an end time count as an hour. */
function meetingTimes(g, from, to) {
  const s = g.schedule; if (!s?.time) return [];
  const endT = s.endTime || addMinutes(s.time, 60);
  if (s.kind === "once") { const a = atTime(s.date, s.time), e = atTime(s.date, endT); return a < to && e > from ? [[a, e]] : []; }
  const out = [], d = new Date(Math.max(from, s.startDate ? atTime(s.startDate, "00:00") : from)); d.setHours(0, 0, 0, 0);
  const last = Math.min(to, s.endDate ? atTime(s.endDate, "23:59") : to);
  for (; d.getTime() <= last; d.setDate(d.getDate() + 1)) {
    if (!(s.days || []).includes(d.getDay())) continue;
    const day = isoDay(d), a = atTime(day, s.time), e = atTime(day, endT);
    if (a < to && e > from) out.push([a, e]);
  }
  return out;
}
/** Everything using a room between two times: bookings, events and class or group meetings. */
function roomUses(locationId, room, from, to) {
  const out = [];
  S.list("bookings").filter((b) => b.locationId === locationId && sameRoom(b.room, room) && b.status !== "declined")
    .forEach((b) => bookingTimes(b, from, to).forEach(([s, e]) => out.push({ kind: "booking", id: b.id, title: b.title, start: s, end: e, status: b.status, by: b.by, weekly: b.repeat === "weekly" })));
  S.list("events").filter((e) => e.locationId === locationId && sameRoom(e.location, room)).forEach((e) => {
    const s = new Date(e.start).getTime(), en = new Date(e.end).getTime(); if (s < to && en > from) out.push({ kind: "event", id: e.id, title: e.title, start: s, end: en });
  });
  // Worship services hold their room for 90 minutes from the service time.
  const loc = S.location(locationId), svcRoom = loc?.serviceRoom ?? loc?.rooms?.[0];
  if (loc && sameRoom(svcRoom, room)) (loc.services || []).forEach((sv) => meetingTimes({ schedule: { kind: "weekly", days: [sv.day], time: sv.time, endTime: addMinutes(sv.time, 90) } }, from, to)
    .forEach(([s, e]) => out.push({ kind: "service", id: `${locationId}-${sv.day}-${sv.time}`, title: sv.label || "Worship service", start: s, end: e, weekly: true })));
  S.list("gatherings").filter((g) => (g.locationId || null) === locationId && sameRoom(g.room, room))
    .forEach((g) => meetingTimes(g, from, to).forEach(([s, e]) => out.push({ kind: "gathering", id: g.id, title: g.name, start: s, end: e, weekly: g.schedule?.kind === "weekly" })));
  return out.sort((a, b) => a.start - b.start);
}
/** What a proposed booking would clash with. Weekly bookings with no end date are checked for six months. */
function bookingConflicts(b, ignore = {}) {
  const first = atTime(b.date, "00:00"), horizon = b.repeat === "weekly" ? (b.until ? atTime(b.until, "23:59") : first + 182 * DAY) : first + DAY;
  const hits = [];
  bookingTimes({ ...b, until: b.repeat === "weekly" ? (b.until || isoDay(new Date(horizon))) : "" }, first, horizon).forEach(([s, e]) =>
    roomUses(b.locationId, b.room, s, e).forEach((u) => {
      if (u.kind === ignore.kind && u.id === ignore.id) return;
      if (!hits.some((h) => h.kind === u.kind && h.id === u.id)) hits.push({ ...u, firstClash: s });
    }));
  return hits;
}
const useWhen = (u) => `${u.weekly ? `${DAYS[new Date(u.start).getDay()]}s` : fmt(u.start, { weekday: "short", month: "short", day: "numeric" })}, ${fmtTime(u.start)} to ${fmtTime(u.end)}`;
const useKind = (u) => u.kind === "event" ? "Event" : u.kind === "gathering" ? "Class or group" : u.kind === "service" ? "Service" : u.status === "requested" ? "Requested" : "Booked";

let roomDay = null, roomLoc = null;
Screens.rooms = () => {
  if (!canBook()) return { redirect: "me" };
  const locs = S.visibleLocations().filter((l) => (l.rooms || []).length), today = isoDay(new Date());
  const back = hasAdminTools() ? "admin" : "ministry";
  if (!locs.length) return { title: "Rooms", back, body: html`<div class="rows" style="margin-top:16px">${empty("Add rooms to a location first.", S.can("manage.locations") ? html`<a class="btn" href="#admin-locations">Locations</a>` : "")}</div>` };
  const loc = locs.find((l) => l.id === roomLoc) || locs.find((l) => l.id === S.campus()) || locs[0];
  roomDay ||= today;
  const from = atTime(roomDay, "00:00"), to = from + DAY, W0 = 6, W1 = 23;
  const pct = (t) => clamp(((t - from) / 3600e3 - W0) / (W1 - W0) * 100, 0, 100);
  const pending = canApproveRooms() ? S.list("bookings").filter((b) => b.status === "requested" && (b.repeat === "weekly" ? !b.until || b.until >= today : b.date >= today)) : [];
  const mine = S.list("bookings").filter((b) => b.by === S.me().id && (b.repeat === "weekly" ? !b.until || b.until >= today : b.date >= today)).sort((a, b) => a.date.localeCompare(b.date));
  const shift = (n) => { const d = fromIsoDay(roomDay); d.setDate(d.getDate() + n); return isoDay(d); };
  return {
    title: "Rooms", back,
    body: html`
      ${pending.length ? html`<section class="sec"><h2 class="sec-head">Waiting for approval</h2><div class="rows">${pending.map((b) => { const clash = bookingConflicts(b, { kind: "booking", id: b.id });
        return html`<div class="row" style="align-items:flex-start"><span class="lead-ic">${icon("door")}</span><span class="body"><span class="t">${b.title}</span><span class="s">${b.room}, ${locName(b.locationId)}. ${bookingWhen(b)}. Asked by ${S.userName(b.by)}.</span>
          ${b.note ? html`<span class="s">"${b.note}"</span>` : ""}${clash.length ? html`<span class="s warn-text">Clashes with ${clash[0].title} (${useWhen(clash[0])})</span>` : ""}
          <span class="btns" style="margin-top:8px"><button class="btn sm" data-act="room-approve" data-id="${b.id}" ${attr(clash.length, "disabled")}>${icon("check")}Approve</button><button class="btn ghost sm" data-act="room-decline" data-id="${b.id}">Decline</button></span></span></div>`; })}</div></section>` : ""}
      <div class="room-controls">
        <div class="day-pick"><button class="icon-btn" data-act="room-day" data-day="${shift(-1)}" aria-label="Previous day">${icon("prev")}</button><label><span class="sr">Day</span><input type="date" value="${roomDay}" data-change="room-day"></label><button class="icon-btn" data-act="room-day" data-day="${shift(1)}" aria-label="Next day">${icon("next")}</button></div>
        ${locs.length > 1 ? html`<label><span class="sr">Location</span><select data-change="room-loc">${locs.map((l) => html`<option value="${l.id}" ${attr(l.id === loc.id, "selected")}>${l.name}</option>`)}</select></label>` : ""}
        <button class="btn sm" data-act="room-request" data-loc="${loc.id}" data-day="${roomDay}">${icon("plus")}Request a room</button></div>
      <p class="muted" style="margin:6px 0 0">${fmtDay(fromIsoDay(roomDay))}${roomDay === today ? " (today)" : ""}</p>
      <div class="room-scale" aria-hidden="true">${[6, 9, 12, 15, 18, 21].map((h) => html`<span style="left:${((h - W0) / (W1 - W0)) * 100}%">${h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}</span>`)}</div>
      <div class="room-list">${loc.rooms.map((room) => { const uses = roomUses(loc.id, room, from, to);
        return html`<div class="room-card"><div class="rc-head"><b>${room}</b><span class="faint">${uses.length ? plural(uses.length, "booking") : "Free all day"}</span>
            <button class="btn ghost sm" data-act="room-request" data-loc="${loc.id}" data-room="${room}" data-day="${roomDay}" aria-label="Request ${room}">Book</button></div>
          <div class="timeline">${uses.map((u) => html`<i class="tl-b ${u.status === "requested" ? "req" : ""}" style="left:${pct(u.start)}%;width:${Math.max(1.2, pct(u.end) - pct(u.start))}%" title="${u.title}, ${fmtTime(u.start)} to ${fmtTime(u.end)}"></i>`)}</div>
          ${uses.length ? html`<ul class="uses">${uses.map((u) => html`<li><span class="ut">${fmtTime(u.start)} to ${fmtTime(u.end)}</span><span>${u.title}${u.status === "requested" ? html` <span class="tag">Requested</span>` : ""}${u.kind !== "booking" ? html` <span class="faint">${useKind(u)}</span>` : ""}</span></li>`)}</ul>` : ""}</div>`; })}</div>
      ${mine.length ? html`<section class="sec"><h2 class="sec-head">Your bookings</h2><div class="rows">${mine.map((b) => html`<button class="row" data-act="room-mine" data-id="${b.id}"><span class="lead-ic">${icon("door")}</span><span class="body"><span class="t">${b.title}</span><span class="s">${b.room}, ${bookingWhen(b)}</span></span><span class="tag ${b.status === "approved" ? "ok" : b.status === "declined" ? "warn" : ""}">${b.status === "approved" ? "Approved" : b.status === "declined" ? "Declined" : "Waiting"}</span></button>`)}</div></section>` : ""}`,
  };
};
const bookingWhen = (b) => `${b.repeat === "weekly" ? `${DAYS[fromIsoDay(b.date).getDay()]}s from ${fmtShort(fromIsoDay(b.date))}${b.until ? ` to ${fmtShort(fromIsoDay(b.until))}` : ""}` : fmtShort(fromIsoDay(b.date))}, ${timeLabel(b.start)} to ${timeLabel(b.end)}`;
Actions["room-day"] = (el) => { roomDay = el.dataset.day; render(); };
Inputs["room-day"] = (el) => { if (el.value) { roomDay = el.value; render(); } };
Inputs["room-loc"] = (el) => { roomLoc = el.value; render(); };

// ----- Asking for a room -----
function roomForm(b) {
  const locs = S.visibleLocations().filter((l) => (l.rooms || []).length), loc = locs.find((l) => l.id === b.locationId) || locs[0];
  return html`<form data-form="room-save" data-input="room-check" novalidate><input type="hidden" name="id" value="${b.id || ""}">
    <label class="field"><span>What's it for?</span><input type="text" name="title" value="${b.title || ""}" required maxlength="80" placeholder="Youth leaders meeting"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${locs.length > 1 ? html`<label class="field"><span>Location</span><select name="locationId" data-change="room-loc-pick">${locs.map((l) => html`<option value="${l.id}" ${attr(l.id === loc.id, "selected")}>${l.name}</option>`)}</select></label>` : html`<input type="hidden" name="locationId" value="${loc.id}">`}
      <label class="field"><span>Room</span><select name="room" data-change="room-check">${loc.rooms.map((r) => html`<option ${attr(sameRoom(r, b.room), "selected")}>${r}</option>`)}</select></label></div>
    <label class="field"><span>Date</span><input type="date" name="date" value="${b.date || isoDay(new Date())}" data-change="room-check"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>From</span><input type="time" name="start" value="${b.start || "18:00"}" data-change="room-check"></label><label class="field"><span>To</span><input type="time" name="end" value="${b.end || "19:30"}" data-change="room-check"></label></div>
    <label class="check"><input type="checkbox" name="weekly" ${attr(b.repeat === "weekly", "checked")} data-change="room-check"><span>Every week</span></label>
    <label class="field"><span>Last date, if it repeats</span><input type="date" name="until" value="${b.until || ""}" data-change="room-check"><small>Leave blank to keep it going. Weekly bookings are checked six months ahead.</small></label>
    <label class="field"><span>Setup and notes</span><textarea name="note" maxlength="400" style="min-height:60px" placeholder="Tables in a circle, a TV and coffee">${b.note || ""}</textarea></label>
    <div id="room-check" aria-live="polite"></div>
    <div class="btns"><button class="btn">${b.id ? "Save" : canApproveRooms() ? "Book it" : "Send request"}</button>${b.id ? html`<button type="button" class="btn danger" data-act="room-cancel" data-id="${b.id}">Cancel booking</button>` : ""}</div></form>`;
}
function openRoomForm(b) { openSheet(b.id ? "Edit booking" : "Request a room", roomForm(b), { wide: true }); Inputs["room-check"]($("#scrim form")); }
Actions["room-request"] = (el) => openRoomForm({ locationId: el.dataset.loc, room: el.dataset.room, date: el.dataset.day });
Actions["room-mine"] = (el) => openRoomForm(S.get("bookings", el.dataset.id));
const formBooking = (form) => {
  const d = Object.fromEntries(new FormData(form));
  return { id: d.id, title: (d.title || "").trim(), locationId: d.locationId, room: d.room, date: d.date, start: d.start, end: d.end, repeat: d.weekly ? "weekly" : "none", until: d.weekly ? d.until : "", note: d.note };
};
Inputs["room-loc-pick"] = (el) => {
  const loc = S.location(el.value), sel = $('select[name="room"]', el.form);
  sel.innerHTML = flat(html`${(loc?.rooms || []).map((r) => html`<option>${r}</option>`)}`); Inputs["room-check"](el.form);
};
Inputs["room-check"] = (el) => {
  const form = el.closest ? el.closest("form") : el, box = $("#room-check", form); if (!box) return;
  const b = formBooking(form);
  if (!b.date || !b.start || !b.end) { box.innerHTML = ""; return; }
  if (b.end <= b.start) { box.innerHTML = flat(html`<p class="room-msg warn">${icon("info")}The end time has to be after the start time.</p>`); return; }
  const clash = bookingConflicts(b, { kind: "booking", id: b.id });
  if (!clash.length) { box.innerHTML = flat(html`<p class="room-msg ok">${icon("check")}${b.room} is free${b.repeat === "weekly" ? " every week" : ""} then.</p>`); return; }
  const loc = S.location(b.locationId), free = (loc?.rooms || []).filter((r) => !sameRoom(r, b.room) && !bookingConflicts({ ...b, room: r }, { kind: "booking", id: b.id }).length);
  box.innerHTML = flat(html`<div class="room-msg warn">${icon("info")}<div><b>${b.room} is in use then.</b>${clash.slice(0, 3).map((u) => html`<br>${u.title}: ${useWhen(u)}${u.status === "requested" ? " (requested)" : ""}`)}${clash.length > 3 ? html`<br>And ${plural(clash.length - 3, "more")}.` : ""}
    ${free.length ? html`<div class="chips" style="margin-top:8px;padding-bottom:0">${free.map((r) => html`<button type="button" class="chip" data-act="room-switch" data-room="${r}">Use ${r}</button>`)}</div>` : html`<br><span class="faint">No other room is free then. Try another time.</span>`}</div></div>`);
};
Actions["room-switch"] = (el) => { const form = el.closest("form"); form.room.value = el.dataset.room; Inputs["room-check"](form); };
Forms["room-save"] = (d, f) => {
  const b = formBooking(f);
  if (!b.title) return formError(f, "Say what the room is for.");
  if (!b.date || !b.start || !b.end || b.end <= b.start) return formError(f, "Choose a date and a start and end time.");
  if (b.repeat === "weekly" && b.until && b.until < b.date) return formError(f, "The last date has to be after the first.");
  if (bookingConflicts(b, { kind: "booking", id: b.id }).length) return formError(f, "That room is taken then. Use a free room or pick another time.");
  const approve = canApproveRooms(), old = b.id && S.get("bookings", b.id);
  const rec = { ...b, status: approve ? "approved" : "requested", by: old?.by || S.me().id, at: new Date().toISOString() };
  delete rec.id;
  const saved = old ? S.update("bookings", old.id, rec) : S.add("bookings", rec);
  if (!approve) roomApprovers().filter((u) => u !== S.me().id).forEach((u) => notify(u, { kind: "room", title: `Room request: ${b.room}`, body: `${b.title}, ${bookingWhen(b)}. From ${S.me().name}.`, link: "#rooms" }));
  emit("room.booked", { title: b.title, room: b.room, location: locName(b.locationId), when: bookingWhen(b), status: saved.status, by: S.me().name });
  roomDay = b.date; roomLoc = b.locationId;
  closeSheet(); toast(approve ? `${b.room} is booked` : "Request sent. You'll get a notification when it's approved."); render();
};
Actions["room-cancel"] = (el) => { S.remove("bookings", el.dataset.id); closeSheet(); toast("Booking cancelled"); render(); };
Actions["room-approve"] = (el) => {
  const b = S.get("bookings", el.dataset.id);
  if (bookingConflicts(b, { kind: "booking", id: b.id }).some((u) => u.kind !== "booking" || u.status === "approved")) { toast("It clashes with something already booked"); return; }
  b.status = "approved"; S.save();
  notify(b.by, { kind: "room", title: `${b.room} is booked`, body: `${b.title}, ${bookingWhen(b)}`, link: "#rooms" });
  toast("Approved"); render();
};
Actions["room-decline"] = (el) => openSheet("Decline this request?", html`<form data-form="room-decline" novalidate><input type="hidden" name="id" value="${el.dataset.id}">
  <label class="field"><span>Why (optional)</span><input type="text" name="why" maxlength="120" placeholder="The hall is set up for the Christmas play that week"></label><button class="btn block danger">Decline</button></form>`);
Forms["room-decline"] = (d) => {
  const b = S.get("bookings", d.id); b.status = "declined"; S.save();
  notify(b.by, { kind: "room", title: `${b.room} isn't available`, body: `${b.title}, ${bookingWhen(b)}${d.why ? `. ${d.why}` : ""}`, link: "#rooms" });
  closeSheet(); toast("Declined"); render();
};
