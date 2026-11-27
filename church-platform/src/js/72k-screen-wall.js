// ---------- The screen wall: every screen at once ----------
// #wall, for people who present or look after the church's screens. A tile for every screen the church has paired,
// drawn live from what that screen itself shows, worked out the same way the screen works it out:
//   Presentation screens: audience displays in their own look (full slides, words only, or a lower third for a key),
//     stage displays (the words, what's next, the stage message, the clock) and livestream overlays, from the
//     booth's broadcast; between services, the signage they show when idle. Each presentation running also has a
//     booth tile with its Program (what the room sees) and its Preview (what goes up next in the Booth view).
//   Room displays: whoever is presenting in the room (their slides, from the room's own channel), or else the main
//     service (rooms set to mirror it) or their idle signage.
//   Digital signage: the slide each screen is on right now, from its schedule and the same clock the players use.
//   Other devices: check-in, payment and wayfinding kiosks, door check-in, the booth computer and workstations.
// Each tile says whether the screen is online. Filter by campus and kind; small, medium or large tiles; click a tile
// to see it big. Nothing here changes what a screen shows: it only watches.

const WALL_KINDS = [["", "Every screen"], ["present", "Presentation"], ["room", "Rooms"], ["signage", "Signage"], ["other", "Other devices"]];
const WALL_KIND_OF = { display: "present", stage: "present", overlay: "present", room: "room", signage: "signage", kiosk: "other", gate: "other", booth: "other", workstation: "other" };
const WALL_KEY = "ofc-wall";
const wallPrefs = () => { try { return { size: "m", loc: "", ...JSON.parse(localStorage.getItem(WALL_KEY) || "{}") }; } catch { return { size: "m", loc: "" }; } };
const wallSave = (p) => { try { localStorage.setItem(WALL_KEY, JSON.stringify({ ...wallPrefs(), ...p })); } catch { /* private mode */ } };
const wall = { heard: {}, rooms: {}, roomSubs: new Set(), listening: false, focus: "", tick: null, nextAt: 0 };
const canWall = () => S.isMember() && S.canAny(["manage.devices", "present"]);

function wallHeard(m) {
  if (!m?.key || m.church !== S.state.current || m.mediaNeed || m.type) return;
  if (m.room) { if (m.ended) delete wall.rooms[m.room]; else wall.rooms[m.room] = { ...m, heardAt: Date.now() }; return wallRedraw(); }
  if (m.ended) delete wall.heard[m.key]; else wall.heard[m.key] = { ...m, heardAt: Date.now() };
  wallRedraw();
}
let wallPending = 0;
function wallRedraw() {
  if (location.hash !== "#wall") return;
  if (wallPending) return;
  wallPending = requestAnimationFrame(() => { wallPending = 0; const g = $(".wall-grid"); if (g) g.outerHTML = flat(wallGrid()); else render(); });
}
function wallListen() {
  if (wall.listening) return; wall.listening = true;
  presChannel?.addEventListener("message", wall.local = (e) => wallHeard(e.data));
  if (Backend.on) Backend.onBroadcast(wallHeard);
  // Ask any booth that's presenting to say where it is (the same "ping" the phone remote uses).
  if (typeof sendBoothCommand === "function") sendBoothCommand({ do: "ping" });
}
/** Redraws when the next signage slide is due (or in 30 seconds, for the clocks and online status). */
function wallSchedule() {
  clearTimeout(wall.tick);
  const wait = Math.max(1000, Math.min(30e3, (wall.nextAt || Infinity) - Date.now() + 80));
  wall.tick = setTimeout(() => { if (location.hash === "#wall") wallRedraw(); }, wait);
}
/** A room in use is heard on its own channel (present.rooms people and room screens hear the same). */
function wallRoomListen(token) {
  if (!Backend.on || wall.roomSubs.has(token)) return;
  wall.roomSubs.add(token); Backend.onBroadcast((m) => wallHeard({ ...m, room: token }), roomTopic(token));
}
window.addEventListener("hashchange", (e) => {
  if (new URL(e.oldURL).hash !== "#wall" || location.hash === "#wall" || !wall.listening) return;
  wall.listening = false; clearTimeout(wall.tick); presChannel?.removeEventListener("message", wall.local);
  if (Backend.on) { Backend.offBroadcast(`present:${S.state.current}`); for (const t of wall.roomSubs) Backend.offBroadcast(roomTopic(t)); }
  wall.roomSubs.clear();
});

/** The live state a screen at this campus is showing: the most recent presentation it would follow. */
function wallStateFor(loc) {
  return Object.values(wall.heard).filter((m) => !loc || !m.loc || m.loc === loc).sort((a, b) => b.heardAt - a.heardAt)[0] || null;
}
function wallSlides(m) {
  const data = m && routeData(m.key); if (!data) return null;
  const st = { ...m, index: clamp(m.index || 0, 0, data.slides.length - 1) };
  const { cur, next } = liveAt(data.slides, st);
  const shown = st.black ? { kind: "black" } : st.logo ? { kind: "logo" } : timedSlide(cur, st.segAt);
  return { data, st, cur, next, shown };
}
const online = (d) => d.status === "paired" && d.lastSeen && Date.now() - new Date(d.lastSeen) < 5 * 60e3;

/** The signage slide a screen is on now (its schedule, the remote, the shared clock), as the player draws it. */
function wallSign(d, plId) {
  const pl = plId && S.get("signage", plId), slides = pl ? signageSlides(pl) : [];
  if (!slides.length) return null;
  const pos = playPosition(slides, Date.now(), d.control);
  if (!d.control?.pausedAt) wall.nextAt = Math.min(wall.nextAt || Infinity, Date.now() + pos.left * 1000);
  return { pl, html: html`<div class="wall-sign">${signFrame(pl, slides[pos.i], { live: true })}</div>`, sub: `${pl.name}, slide ${pos.i + 1} of ${slides.length}${d.control?.pausedAt ? ", paused" : ""}` };
}
const wallLogo = () => html`<div class="stage">${slideHtml({ kind: "logo" })}</div>`;
function wallDisplay(live, look) {
  if (look === "lower" || look === "green") return wallKey(live, look === "green" ? "green" : "black");
  return html`<div class="stage ${look === "words" ? "wall-words" : ""}">${slideHtml(look === "words" && live.shown?.bg ? { ...live.shown, bg: null } : live.shown)}</div>`;
}
/** What one device's screen shows now: [markup, a line about it]. */
function wallScreen(d) {
  const live = wallSlides(wallStateFor(d.locationId)), look = d.type === "display" ? d.settings?.look || "full" : "";
  const idle = () => { const sg = wallSign(d, devicePlaylistNow(d)); return sg ? [sg.html, `Between services: ${sg.sub}`] : [wallLogo(), "Between services: the church logo"]; };
  switch (d.type) {
    case "display": return live ? [wallDisplay(live, look), `${live.data.title}${look !== "full" ? `, ${lookName(look).toLowerCase()}` : ""}`] : look === "lower" || look === "green" ? [wallKey(null, look === "green" ? "green" : "black"), "Clear key between services"] : idle();
    case "stage": return [wallStage(live), live ? live.data.title : "Clock between services"];
    case "overlay": return [wallKey(live, "clear"), live ? `${live.data.title}, over the livestream` : "Clear between services"];
    case "signage": { const sg = wallSign(d, devicePlaylistNow(d)); return sg ? [sg.html, sg.sub] : [wallLogo(), "No playlist chosen"]; }
    case "room": {
      const ses = typeof activeRoomSession === "function" ? activeRoomSession(d) : null;
      if (ses) {
        wallRoomListen(ses.token);
        const m = wall.rooms[ses.token], data = routeData(m?.key || ses.key || "");
        const st = m || { index: 0 }, shown = data ? (st.black ? { kind: "black" } : st.logo ? { kind: "logo" } : timedSlide(liveAt(data.slides, { ...st, index: clamp(st.index || 0, 0, data.slides.length - 1) }).cur, st.segAt)) : { kind: "logo" };
        return [html`<div class="stage">${slideHtml(shown)}</div>`, `In use: ${S.userName(ses.by)}${data ? `, ${data.title}` : ""}, until ${fmtClock(new Date(ses.until))}`];
      }
      if (d.settings?.idle === "mirror" && live) return [html`<div class="stage">${slideHtml(live.shown)}</div>`, `Mirroring ${live.data.title}`];
      const [h, sub] = idle(); return [h, sub.replace("Between services", "Free")];
    }
    default: return [wallDevice(d), ""];
  }
}
/** A kiosk, door check-in, booth computer or workstation: what it's for, on a small card. */
function wallDevice(d) {
  const km = d.settings?.kioskMode, what = d.type === "kiosk" ? (km === "wayfind" ? "Find your way" : km === "pay" ? "Payments" : km === "both" ? "Check-in and find your way" : "Kids check-in")
    : d.type === "gate" ? "Door check-in" : d.type === "booth" ? "Runs the presentations" : d.type === "workstation" ? "Lock screen: sign in with your name and PIN" : "";
  return html`<div class="stage wall-note wall-dev"><p>${churchMark(S.church(), 40)}<b>${what}</b><span>${DEVICE_TYPES[d.type]?.[0] || ""}</span></p></div>`;
}
function wallKey(live, bg) {
  const words = live && !live.st.black && !live.st.logo && live.cur && ["lyrics", "scripture", "point", "keynote", "question"].includes(live.cur.kind) ? slideWords(live.cur) : "";
  return html`<div class="stage wall-key ${bg}">${words ? html`<div class="wall-lt">${words}</div>` : ""}</div>`;
}
function wallStage(live) {
  if (!live) return html`<div class="stage wall-stage"><p class="wall-clock">${fmtClock(new Date())}</p></div>`;
  const words = live.st.black ? "(Screen is black)" : live.st.logo ? "(Logo)" : slideWords(live.cur) || slideLabel(live.cur || {});
  return html`<div class="stage wall-stage">${live.st.msg ? html`<p class="wall-msg">${live.st.msg}</p>` : ""}
    <p class="wall-now">${words}</p><p class="wall-next">${live.next ? `Next: ${slideLabel(live.next)}` : "End"}</p><p class="wall-clock">${fmtClock(new Date())}</p></div>`;
}

function wallGrid() {
  const prefs = wallPrefs(); wall.nextAt = 0;
  const inLoc = (loc) => !prefs.loc || !loc || loc === prefs.loc, want = (kind) => !prefs.kind || prefs.kind === kind;
  const devices = S.list("devices").filter((d) => d.status === "paired" && WALL_KIND_OF[d.type] && want(WALL_KIND_OF[d.type]) && inLoc(d.locationId));
  const booths = want("present") ? Object.values(wall.heard).filter((m) => inLoc(m.loc)).sort((a, b) => (a.loc || "").localeCompare(b.loc || "")) : [];
  const dot = (on, text) => html`<span class="wall-status ${on ? "on" : "off"}">${text}</span>`;
  const tile = (id, title, sub, status, body, line = "") => html`<section class="wall-tile ${wall.focus === id ? "big" : ""}" aria-label="${title}">
    <header><button type="button" class="wall-name" data-act="wall-focus" data-id="${id}" aria-expanded="${wall.focus === id}" title="${wall.focus === id ? "Back to the grid" : "See it big"}"><b>${title}</b><span>${sub}</span></button>${status}</header>${body}${line ? html`<p class="wall-line">${line}</p>` : ""}</section>`;
  const boothTile = (m) => { const live = wallSlides(m); if (!live) return "";
    const cued = Number.isInteger(m.cueIdx) ? live.data.slides[m.cueIdx] : live.next;
    return tile(`booth-${m.key}`, `Booth: ${live.data.title}`, [m.loc ? locName(m.loc) : "", m.live ? `${m.live.label} ${m.live.i + 1}/${m.live.slides.length}` : `${live.st.index + 1}/${live.data.slides.length}`].filter(Boolean).join(" · "), dot(true, "Live"),
      html`<div class="wall-pair"><div><span class="wall-cap program">Program</span><div class="stage">${slideHtml(live.shown)}</div></div><div><span class="wall-cap preview">${Number.isInteger(m.cueIdx) ? "Preview (cued)" : "Next"}</span><div class="stage">${cued ? slideHtml(timedSlide(cued, Date.now())) : slideHtml({ kind: "black" })}</div></div></div>`); };
  const devTile = (d) => { const [screen, line] = wallScreen(d), on = online(d), look = d.type === "display" && d.settings?.look && d.settings.look !== "full" ? lookName(d.settings.look) : "";
    return tile(d.id, d.name, [DEVICE_TYPES[d.type]?.[0], d.locationId ? locName(d.locationId) : "", d.type === "room" ? d.settings?.room : "", look].filter(Boolean).join(" · "),
      dot(on, on ? "Online" : d.lastSeen ? `Last seen ${fmtWhen(d.lastSeen)}` : "Not seen yet"), html`<div class="wall-screen ${on ? "" : "is-off"}">${screen}</div>`, line); };
  const groups = [["present", "Presentation screens"], ["room", "Room displays"], ["signage", "Digital signage"], ["other", "Other devices"]]
    .map(([k, label]) => [k, label, devices.filter((d) => WALL_KIND_OF[d.type] === k)]).filter(([k, , list]) => list.length || (k === "present" && booths.length));
  const out = html`<div class="wall-grid size-${prefs.size}">
    ${groups.map(([k, label, list]) => html`<h2 class="wall-h">${label} <span class="faint">${plural(list.length + (k === "present" ? booths.length : 0), k === "other" ? "device" : "screen")}</span></h2>
      ${k === "present" ? booths.map(boothTile) : ""}${list.map(devTile)}`)}
    ${!groups.length ? html`<div class="panel wall-empty"><p><b>No screens to show${prefs.kind || prefs.loc ? " here" : " yet"}.</b></p><p class="muted">Paired presentation screens, stage displays, room displays, signage and kiosks appear here live.</p><a class="btn" href="#devices">${icon("lock")}Screens and devices</a></div>` : ""}
  </div>`;
  setTimeout(wallSchedule, 0);
  return out;
}

Screens.wall = () => {
  if (!canWall()) return { redirect: "home" };
  const prefs = wallPrefs(), locs = S.visibleLocations();
  return {
    title: "Screen wall", back: "devices", wide: true, after: wallListen,
    body: html`<div class="wall-bar">
        <p class="muted">What every screen in the building is showing right now: presentation, stage, room and signage screens, and kiosks. It only watches; nothing here changes a screen.</p>
        <div class="seg wall-kinds" role="radiogroup" aria-label="Which screens">${WALL_KINDS.map(([v, l]) => html`<button type="button" role="radio" data-act="wall-kind" data-kind="${v}" aria-checked="${(prefs.kind || "") === v}">${l}</button>`)}</div>
        ${locs.length > 1 ? html`<label class="wall-ctl"><span>Campus</span><select data-change="wall-loc">${locationOptions(prefs.loc, "Every campus")}</select></label>` : ""}
        <div class="seg wall-size" role="radiogroup" aria-label="Tile size">${[["s", "Small"], ["m", "Medium"], ["l", "Large"]].map(([v, l]) => html`<button type="button" role="radio" data-act="wall-size" data-size="${v}" aria-checked="${prefs.size === v}">${l}</button>`)}</div>
      </div>
      ${wallGrid()}`,
  };
};
Actions["wall-size"] = (el) => { wallSave({ size: el.dataset.size }); render(); };
Actions["wall-kind"] = (el) => { wallSave({ kind: el.dataset.kind }); render(); };
Inputs["wall-loc"] = (el) => { wallSave({ loc: el.value }); render(); };
Actions["wall-focus"] = (el) => { wall.focus = wall.focus === el.dataset.id ? "" : el.dataset.id; wallRedraw(); };
