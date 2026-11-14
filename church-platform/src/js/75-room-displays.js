// ---------- Rooms and room displays ----------
// Every room can have a number and a place ("Education building, 2nd floor"). A room display is a TV or projector paired
// to one room. Whoever is teaching a class there, or has an approved booking for it, can present to it from their own
// phone or laptop, from 15 minutes before their time until it ends; people with "Present on any room's display" can
// present any time. When the time is up or the presenter stops, the display goes back to its signage playlist, or to
// showing what the main screens show.
//
// A presentation in a room is a roomSessions record (who, which room, until when, and a random token) plus slide moves
// broadcast on that token's own channel. The record can only be written by the person presenting (security rules), and
// the display only follows a session whose presenter has the room right now by its own reading of bookings and classes.

const ROOM_EARLY = 15 * 60e3;          // teachers can start this long before their time
const ROOM_ANYTIME = 2 * 3600e3;       // how long someone with present.rooms gets when they have no booking
/** "riverside-main~Room%20201": a room, for links and QR codes. */
const roomKey = (locId, room) => `${locId}~${encodeURIComponent(room)}`;
function parseRoomKey(key) {
  const s = String(key || ""), i = s.indexOf("~");
  if (i < 0) return { loc: "", room: "" };
  let room = s.slice(i + 1); try { room = decodeURIComponent(room); } catch {}
  return { loc: s.slice(0, i), room };
}
/** A room's number and where it is, as saved on its location. */
const roomInfo = (loc, room) => { const all = loc?.roomInfo || {}, k = Object.keys(all).find((x) => sameRoom(x, room)); return k ? all[k] : {}; };
/** "Room 12, 1st floor by the kitchen, Staff offices": what to say under a room's name. */
function roomSub(loc, room, withCampus = true) {
  const i = roomInfo(loc, room), num = String(i.number || "").trim();
  return [num && !String(room).includes(num) ? `Room ${num}` : "", i.where, withCampus ? loc?.name : ""].filter(Boolean).join(", ");
}
const roomTopic = (token) => `present:${S.state.current}:room:${token}`;
const roomToken = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const roomScreens = (locId, room) => S.list("devices").filter((d) => d.type === "room" && d.locationId === locId && sameRoom(d.settings?.room, room));

// ----- Who has a room right now -----
const canAllRooms = (userId) => !!S.role(S.state.current, userId)?.perms?.["present.rooms"];
/** A person's own times in a room: their approved bookings, and the classes and groups they lead there. */
function roomTimesFor(userId, locId, room, from, to) {
  const out = [];
  S.list("bookings").filter((b) => b.locationId === locId && sameRoom(b.room, room) && b.status === "approved" && b.by === userId)
    .forEach((b) => bookingTimes(b, from, to).forEach(([s, e]) => out.push({ start: s, end: e, title: b.title })));
  S.list("gatherings").filter((g) => (g.locationId || null) === locId && sameRoom(g.room, room) && (g.leaders || []).includes(userId))
    .forEach((g) => meetingTimes(g, from, to).forEach(([s, e]) => out.push({ start: s, end: e, title: g.name })));
  return out.sort((a, b) => a.start - b.start);
}
/** Can this person present in this room at this moment, and until when? */
function roomAccess(userId, locId, room, at = Date.now()) {
  const times = roomTimesFor(userId, locId, room, at - DAY, at + 8 * DAY);
  const now = times.filter((t) => t.start - ROOM_EARLY <= at && at < t.end).sort((a, b) => b.end - a.end)[0];
  if (now) return { ok: true, until: now.end, title: now.title };
  if (canAllRooms(userId)) return { ok: true, until: at + ROOM_ANYTIME, any: true };
  return { ok: false, next: times.find((t) => t.start - ROOM_EARLY > at) || null };
}
/** The presentation a room's display should show now: the newest one whose presenter still has the room. */
function activeRoomSession(d, at = Date.now()) {
  const room = d?.settings?.room; if (!room) return null;
  return S.list("roomSessions").filter((s) => s.locationId === d.locationId && sameRoom(s.room, room) && !roomLive.ended.has(s.token) && new Date(s.until).getTime() > at)
    .filter((s) => { const a = roomAccess(s.by, d.locationId, room, at); return a.ok && new Date(s.until).getTime() <= a.until + 60e3; })
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] || null;
}

// ----- Presenting in a room, from the presenter's phone or laptop -----
/** What a presenter can put on a room's screen: their lessons and studies (their classes' first), and plans and sermons if they run the screens. */
function roomChoices(locId, room) {
  const me = S.me().id, today = isoDay(new Date());
  const leads = new Set(S.list("gatherings").filter((g) => (g.leaders || []).includes(me)).map((g) => g.id));
  const here = new Set(S.list("gatherings").filter((g) => leads.has(g.id) && (g.locationId || null) === locId && sameRoom(g.room, room)).map((g) => g.id));
  const docs = S.list("docs").filter((d) => d.authorId === me || (d.gatheringId && leads.has(d.gatheringId)) || S.can("present"))
    .sort((a, b) => (here.has(b.gatheringId) ? 1 : 0) - (here.has(a.gatheringId) ? 1 : 0) || String(b.date || "").localeCompare(String(a.date || ""))).slice(0, 12);
  const plans = S.can("present") ? S.list("services").filter((p) => p.date >= today && !p._stubOnly && (!p.locationId || p.locationId === locId)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4) : [];
  return { docs, plans, here };
}
Screens.roompresent = (tail) => {
  const { loc: locId, room } = parseRoomKey(tail), loc = S.location(locId), back = canBook() ? "rooms" : "me";
  if (!S.isMember()) return { title: "Present", back, body: needMember("present in a room") };
  if (!loc || !(loc.rooms || []).some((r) => sameRoom(r, room))) return { title: "Present", back, body: html`<div class="rows" style="margin-top:16px">${empty("This room isn't set up any more.")}</div>` };
  const acc = roomAccess(S.me().id, locId, room), r = pres.room, mine = r && r.loc === locId && sameRoom(r.room, room) ? r : null;
  const screens = canDevices() ? roomScreens(locId, room) : null;
  const { docs, plans, here } = acc.ok ? roomChoices(locId, room) : { docs: [], plans: [], here: new Set() };
  const pick = (key, ic, t, s) => html`<button class="row" data-act="room-start" data-room="${tail}" data-key="${key}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${t}</span><span class="s">${s}</span></span>${icon("screen")}</button>`;
  return {
    title: `Present in ${room}`, back,
    body: html`<p class="muted" style="margin:16px 0 10px">${roomSub(loc, room) || loc.name}</p>
      ${mine ? html`<div class="panel room-now"><p style="margin-top:0"><b>You're presenting ${mine.title} here</b> until ${fmtTime(mine.until)}.</p>
        <div class="btns" style="margin:0"><a class="btn" href="#present-${pres.key}">${icon("screen")}Back to your slides</a><button class="btn ghost" data-act="room-stop">Stop presenting</button></div></div>` : ""}
      ${acc.ok ? html`<p class="room-msg ok">${icon("check")}${acc.any ? `You can present in any room. You'll have ${room} for two hours, or until you stop.` : `You have ${room} until ${fmtTime(acc.until)} for ${acc.title}.`}</p>`
        : html`<div class="room-msg warn">${icon("info")}<div><b>You can present here while you're teaching in this room or have it booked.</b>
          ${acc.next ? html`<br>Your next time here: ${acc.next.title}, ${fmt(acc.next.start, { weekday: "short", month: "short", day: "numeric" })} at ${fmtTime(acc.next.start)}. You can start 15 minutes before.` : ""}
          ${canBook() ? html`<div class="btns" style="margin:8px 0 0"><button class="btn sm" data-act="room-request" data-loc="${locId}" data-room="${room}" data-day="${isoDay(new Date())}">${icon("plus")}Book this room</button></div>` : ""}</div></div>`}
      ${screens && !screens.length ? html`<p class="room-msg warn">${icon("info")}<span>${room} doesn't have a display yet. <a href="#admin-rooms">Add one under Rooms</a>.</span></p>` : ""}
      ${acc.ok ? html`<section class="sec"><h2 class="sec-head">What do you want to show?</h2>
        <div class="rows">${docs.map((d) => pick(`doc-${d.id}`, DOC_KINDS[d.kind]?.icon || "note", d.title, [here.has(d.gatheringId) ? "For your class here" : DOC_KINDS[d.kind]?.label, d.passage].filter(Boolean).join(", ")))}
          ${plans.map((p) => pick(`service-${p.id}`, "list", p.title, `Service plan, ${fmtDay(fromIsoDay(p.date))}`))}
          ${!docs.length && !plans.length ? empty("Nothing to show yet. Lessons and study guides you build show up here.", (() => { const k = ["lesson", "study", "sermon"].find((x) => S.can(DOC_KINDS[x].perm)); return k ? html`<a class="btn" href="#docs-${k}">Open the builder</a>` : ""; })()) : ""}</div></section>` : ""}
      <p class="faint">It shows on ${room}'s display. When your time is up, or you stop, the display goes back to what it usually shows.</p>`,
  };
};
Actions["room-start"] = (el) => {
  const { loc, room } = parseRoomKey(el.dataset.room), me = S.me().id, acc = roomAccess(me, loc, room), key = el.dataset.key, data = routeData(key);
  if (!acc.ok) { toast("Your time in this room hasn't started yet"); render(); return; }
  if (!data) { toast("That can't be shown right now"); return; }
  roomStop();
  S.list("roomSessions").filter((s) => s.by === me).forEach((s) => S.remove("roomSessions", s.id));
  const token = roomToken(), until = acc.until;
  const ses = S.add("roomSessions", { locationId: loc, room, key, token, by: me, title: data.title, startedAt: new Date().toISOString(), until: new Date(until).toISOString() });
  S.flush();
  pres.room = { id: ses.id, token, loc, room, until, title: data.title, warned: false };
  Object.assign(pres, { key, index: 0, live: null, black: false, logo: false, msg: "", startedAt: Date.now(), segKey: "", mode: "slideshow", cc: false });
  go(`present-${key}`);
};
/** Ends this person's presentation in a room: the display goes back to its usual screen straight away. */
function roomStop() {
  const r = pres.room; if (!r) return null;
  pres.room = null; pres.wasRoom = location.hash.startsWith("#present-");
  const msg = { room: r.token, ended: true, church: S.state.current };
  try { presChannel?.postMessage(msg); } catch {}
  if (Backend.on) { Backend.broadcast(msg, roomTopic(r.token)); setTimeout(() => Backend.offBroadcast(roomTopic(r.token)), 2000); }
  if (S.get("roomSessions", r.id)) S.remove("roomSessions", r.id);
  return r;
}
Actions["room-stop"] = () => { const r = roomStop(); toast("Stopped. The room's display is back to its usual screen."); go(r ? `roompresent-${roomKey(r.loc, r.room)}` : "me"); };
const roomStrip = () => { const r = pres.room, left = r.until - Date.now();
  return html`<div class="room-strip ${left <= 5 * 60e3 ? "warn" : ""}" role="status">${icon("door")}<span>On ${r.room}'s display until ${fmtTime(r.until)}${left <= 5 * 60e3 ? ". Less than 5 minutes left" : ""}</span><button class="btn sm" data-act="room-stop">Stop presenting</button></div>`; };
// Time's up: hand the display back. Until then, resend where we are every few seconds so a display that just came on catches up.
setInterval(() => {
  const r = pres.room; if (!r) return;
  const left = r.until - Date.now(), presenting = location.hash.startsWith("#present-");
  if (left <= 0) { roomStop(); toast(`Your time in ${r.room} is up. Its display is back to its usual screen.`); if (presenting) go(`roompresent-${roomKey(r.loc, r.room)}`); return; }
  if (left <= 5 * 60e3 && !r.warned) { r.warned = true; toast(`5 minutes left in ${r.room}`); if (presenting) render(); }
  if (presenting) presBroadcast();
}, 4000);

// ----- On the room's display -----
const roomLive = { token: null, msg: null, ended: new Set(), timer: 0, fetching: "" };
function roomSwitch(ses) {
  if (roomLive.token && Backend.on) Backend.offBroadcast(roomTopic(roomLive.token));
  Object.assign(roomLive, { token: ses?.token || null, msg: null });
  if (ses && Backend.on) Backend.onBroadcast(roomMessage, roomTopic(ses.token));
}
function roomMessage(m) {
  if (!m?.room) return;
  if (m.ended) { roomLive.ended.add(m.room); if (m.room === roomLive.token) roomLive.msg = null; drawRoom(); return; }
  // In the preview, a new presentation's record arrives with its first slide: read it in.
  if (m.room !== roomLive.token && !Backend.on) { S.load(); drawRoom(); }
  if (m.room !== roomLive.token) return;
  roomLive.msg = m; drawRoom();
}
/** Loads a presentation the display hasn't got yet. */
function roomFetch(key) {
  if (roomLive.fetching === key) return;
  roomLive.fetching = key;
  const done = () => { drawRoom(); setTimeout(() => { if (roomLive.fetching === key) roomLive.fetching = ""; }, 10e3); };
  if (Backend.on) Backend.pull().then(done, done); else { S.load(); done(); }
}
const slideFor = (data, st) => st.black ? { kind: "black" } : st.logo ? { kind: "logo" } : timedSlide(liveAt(data.slides, st).cur, st.segAt);
/** The corner card that tells a teacher how to start: the room's name and a QR code to scan. */
function roomHint(d) {
  const loc = S.location(d.locationId), room = d.settings.room;
  return html`<div class="room-hint" aria-hidden="true"><div class="room-hint-qr">${raw(qrSvg(appLink(`roompresent-${roomKey(d.locationId, room)}`), { size: 132 }))}</div>
    <div><b>${room}</b>${roomSub(loc, room, false) ? html`<span>${roomSub(loc, room, false)}</span>` : ""}<span>Teaching here? Scan to present.</span></div></div>`;
}
function drawRoom() {
  const d = thisDevice(), app = $("#app");
  if (!d || d.type !== "room" || !location.hash.startsWith("#display-room")) return;
  applyBrand();
  const ses = activeRoomSession(d);
  if ((ses?.token || null) !== roomLive.token) roomSwitch(ses);
  let inner = "";
  if (ses) {
    const m = roomLive.msg, key = m?.key || ses.key, data = routeData(key || "");
    if (!data) roomFetch(key);
    inner = html`<div class="display"><div class="stage">${slideHtml(data ? slideFor(data, m || { index: 0 }) : { kind: "logo" })}</div></div>`;
  } else if (d.settings?.idle === "mirror") {
    const m = follow.msg, data = m && routeData(m.key);
    inner = data ? html`<div class="display"><div class="stage">${slideHtml(slideFor(data, { ...m, index: clamp(m.index || 0, 0, data.slides.length - 1) }))}</div></div>` : idleHtml("display", d.settings?.playlistId);
  } else inner = idleHtml("display", d.settings?.playlistId);
  const hint = !ses && d.settings?.hint !== false ? roomHint(d) : "";
  app.innerHTML = flat(html`${inner || html`<div class="display"><div class="stage">${slideHtml({ kind: "logo" })}</div></div>`}${hint}${deviceExitBtn()}`);
}
function startRoom() {
  document.body.classList.add("presenting");
  // The main screens (for "show what the main screens show"), and this room's presentation.
  followListen(drawRoom, roomMessage);
  if (roomLive.token && Backend.on) Backend.onBroadcast(roomMessage, roomTopic(roomLive.token));
  drawRoom();
  // Check every few seconds: a presenter's time running out, signage moving on.
  clearInterval(roomLive.timer);
  roomLive.timer = setInterval(() => { if (!location.hash.startsWith("#display-room")) { clearInterval(roomLive.timer); return; } drawRoom(); }, 5000);
}

// ----- Managing rooms: numbers, where they are, and their displays -----
AdminScreens.rooms = () => {
  if (!S.isMember() || !(S.can("manage.locations") || canDevices())) return guard("manage.locations");
  const c = S.church(), edit = S.can("manage.locations"), devs = canDevices() ? S.list("devices").filter((d) => d.type === "room") : null;
  return {
    title: "Rooms", back: canDevices() ? "devices" : "admin-locations",
    body: html`<p class="muted" style="margin-top:16px">Give each room its number and say where it is. Put a display in a room, and whoever is teaching there or has it booked can present to it from their phone.</p>
      ${c.locations.map((l) => html`<section class="sec"><h2 class="sec-head">${l.name}</h2><div class="rows">
        ${(l.rooms || []).map((r) => { const n = devs ? devs.filter((d) => d.locationId === l.id && sameRoom(d.settings?.room, r)) : [];
          return html`<button class="row" data-act="room-info" data-room="${roomKey(l.id, r)}"><span class="lead-ic">${icon("door")}</span><span class="body"><span class="t">${r}</span><span class="s">${[roomSub(l, r, false), devs ? (n.length ? plural(n.length, "display") : "No display") : ""].filter(Boolean).join(". ")}</span></span>
            ${n.some((d) => deviceStatus(d) === "Online") ? html`<span class="tag ok">Display on</span>` : icon("chev")}</button>`; })}
        ${!(l.rooms || []).length ? empty("No rooms yet.") : ""}</div>
        ${edit ? html`<div class="btns"><button class="btn ghost sm" data-act="room-info" data-loc="${l.id}">${icon("plus")}Add a room</button></div>` : ""}</section>`)}`,
  };
};
Actions["room-info"] = (el) => {
  const key = el.dataset.room, { loc: locId, room } = key ? parseRoomKey(key) : { loc: el.dataset.loc, room: "" };
  const l = S.location(locId); if (!l) return;
  const info = roomInfo(l, room), edit = S.can("manage.locations"), devs = canDevices() && room ? roomScreens(locId, room) : null;
  openSheet(room || `Add a room to ${l.name}`, html`<form data-form="room-info" novalidate><input type="hidden" name="loc" value="${locId}"><input type="hidden" name="old" value="${room}">
      <label class="field"><span>Name</span><input type="text" name="name" value="${room}" required maxlength="60" placeholder="Room 204" ${attr(!edit, "readonly")}></label>
      <div class="room-fields"><label class="field"><span>Room number</span><input type="text" name="number" value="${info.number || ""}" maxlength="12" placeholder="204" ${attr(!edit, "readonly")}></label>
        <label class="field"><span>Where it is</span><input type="text" name="where" value="${info.where || ""}" maxlength="80" placeholder="Education building, 2nd floor" ${attr(!edit, "readonly")}></label></div>
      ${edit ? html`${room ? html`<p class="faint" style="margin-top:0">Renaming it updates the bookings, classes, events and displays that use it.</p>` : ""}
        <div class="btns"><button class="btn">${room ? "Save room" : "Add room"}</button>${room && devs && !devs.length ? html`<button type="button" class="btn danger" data-act="room-info-delete" data-room="${key}">Delete room</button>` : ""}</div>` : ""}</form>
    ${devs ? html`<section class="sec"><h2 class="sec-head">Displays in this room</h2><div class="rows">${devs.map((d) => { const st = deviceStatus(d);
        return html`<button class="row" data-act="device-open" data-id="${d.id}"><span class="lead-ic">${icon("screen")}</span><span class="body"><span class="t">${d.name}</span><span class="s">${deviceSummary(d)}</span></span><span class="tag ${st === "Online" ? "ok" : ""}">${st}</span></button>`; })}
        ${!devs.length ? empty("No display yet. Add the room's TV or projector.") : ""}</div>
      <div class="btns"><button class="btn ghost sm" data-act="device-new" data-type="room" data-loc="${locId}" data-room="${room}">${icon("plus")}Add a display</button>${devs.length ? html`<a class="btn ghost sm" href="#roompresent-${key}">${icon("screen")}Present here</a>` : ""}</div></section>` : ""}`, { wide: true });
};
Forms["room-info"] = (d, f) => {
  if (!S.can("manage.locations")) return formError(f, "Your role doesn't include rooms.");
  const l = S.location(d.loc), name = (d.name || "").trim(), num = (d.number || "").trim(), where = (d.where || "").trim();
  if (!l) return;
  if (!name) return formError(f, "Name the room.");
  l.rooms ||= []; l.roomInfo ||= {};
  if (l.rooms.some((r) => sameRoom(r, name) && !sameRoom(r, d.old))) return formError(f, `${l.name} already has a room called ${name}.`);
  if (num && l.rooms.some((r) => !sameRoom(r, d.old) && String(roomInfo(l, r).number || "").toLowerCase() === num.toLowerCase())) return formError(f, `Room number ${num} is already used at ${l.name}.`);
  if (d.old) renameRoom(l, d.old, name); else l.rooms.push(name);
  Object.keys(l.roomInfo).filter((k) => sameRoom(k, d.old) || sameRoom(k, name)).forEach((k) => delete l.roomInfo[k]);
  if (num || where) l.roomInfo[name] = { number: num, where };
  S.save(); closeSheet(); toast(d.old ? "Room saved" : `${name} added`); render();
};
/** A new name for a room, carried through everything that uses it. */
function renameRoom(l, from, to) {
  if (from === to) return;
  l.rooms = l.rooms.map((r) => (sameRoom(r, from) ? to : r));
  if (sameRoom(l.serviceRoom, from)) l.serviceRoom = to;
  S.list("bookings").filter((b) => b.locationId === l.id && sameRoom(b.room, from)).forEach((b) => { b.room = to; });
  S.list("gatherings").filter((g) => (g.locationId || null) === l.id && sameRoom(g.room, from)).forEach((g) => { g.room = to; });
  S.list("events").filter((e) => e.locationId === l.id && sameRoom(e.location, from)).forEach((e) => { e.location = to; });
  S.list("devices").filter((x) => x.type === "room" && x.locationId === l.id && sameRoom(x.settings?.room, from)).forEach((x) => { x.settings.room = to; devicePing(x, { settings: x.settings }); });
}
Actions["room-info-delete"] = (el) => {
  const { loc, room } = parseRoomKey(el.dataset.room), l = S.location(loc); if (!l) return;
  if (roomScreens(loc, room).length) { toast("Move or remove its displays first"); return; }
  l.rooms = (l.rooms || []).filter((r) => !sameRoom(r, room));
  Object.keys(l.roomInfo || {}).filter((k) => sameRoom(k, room)).forEach((k) => delete l.roomInfo[k]);
  S.save(); closeSheet(); toast(`${room} deleted`); render();
};
