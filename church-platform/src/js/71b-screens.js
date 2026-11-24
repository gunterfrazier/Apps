// ---------- Screens: schedules, playing without internet, a remote and screen health ----------
// Schedules: a screen can play different playlists at different times ("Sunday 8:30 to 10:30, the kids curriculum";
// "weekdays, the office loop"), falling back to its usual playlist the rest of the time.
// Offline: a screen saves the pictures and videos of every playlist it might play, so an internet outage doesn't
// leave it blank (the service worker keeps them in their own cache).
// Timing: where a playlist is in its loop is worked out from the clock, so every screen playing it is in step, and a
// remote can show what's on now and next without asking the screen.
// Remote: from a phone, see a screen's current and next slide, go back, pause, skip, or play another playlist for a
// while. Screen health: what each screen is playing and what needs attention.

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SCREEN_TYPES = ["signage", "room", "display", "stage"];
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** The playlist a screen plays when nothing else is going on ("" or null: the church's logo). */
function deviceBasePlaylist(d) {
  const s = d?.settings || {};
  return d?.type === "signage" || d?.type === "room" ? s.playlistId || null : s.idlePlaylistId || null;
}
/** The schedule entry in force now, if any. An entry that ends earlier than it starts runs overnight. */
function scheduleRuleNow(d, now = new Date()) {
  const t = hhmm(now), day = now.getDay(), prev = (day + 6) % 7;
  return (d?.settings?.schedule || []).find((r) => {
    if (!r.from || !r.to) return false;
    if (r.from < r.to) return r.days.includes(day) && t >= r.from && t < r.to;
    return (r.days.includes(day) && t >= r.from) || (r.days.includes(prev) && t < r.to);
  }) || null;
}
const controlLive = (c, now = Date.now()) => !!(c?.playlistId !== undefined && c.playlistId !== null && (!c.until || Date.parse(c.until) > now));
/** What a screen should play now: a playlist picked from the remote, then its schedule, then its usual playlist. */
function devicePlaylistNow(d, now = new Date()) {
  if (!d) return null;
  if (controlLive(d.control, +now)) return d.control.playlistId || null;
  const r = scheduleRuleNow(d, now);
  return r ? r.playlistId || null : deviceBasePlaylist(d);
}
/** Why it's playing that, in words. */
function devicePlaylistWhy(d, now = new Date()) {
  if (controlLive(d.control, +now)) return `picked from the remote${d.control.until ? ` until ${fmtTime(d.control.until)}` : ""}`;
  const r = scheduleRuleNow(d, now);
  if (r) return `on its schedule, ${scheduleRuleText(r)}`;
  return "its usual playlist";
}
function scheduleRuleText(r) {
  const days = r.days.length === 7 ? "every day" : r.days.join() === "1,2,3,4,5" ? "weekdays" : r.days.join() === "0,6" ? "weekends" : r.days.map((x) => DAY_SHORT[x]).join(", ");
  return `${days} ${timeLabel(r.from)} to ${timeLabel(r.to)}`;
}

// ----- Where a playlist is in its loop, from the clock -----
const PLAY_EPOCH = Date.UTC(2026, 0, 1);
/** { i, into, left }: which slide is showing, how far into it, and how long until the next. */
function playPosition(slides, now = Date.now(), ctl = null) {
  const secs = slides.map((s) => s.seconds || 10), total = secs.reduce((a, b) => a + b, 0);
  if (!total) return { i: 0, into: 0, left: 10 };
  const at = ctl?.pausedAt ? Date.parse(ctl.pausedAt) : now;
  let t = ((at - PLAY_EPOCH) / 1000 + (+ctl?.shift || 0)) % total; if (t < 0) t += total;
  for (let i = 0; i < secs.length; i++) { if (t < secs[i]) return { i, into: t, left: secs[i] - t }; t -= secs[i]; }
  return { i: 0, into: 0, left: secs[0] };
}

// ----- Schedule fields in a device's settings -----
function scheduleFields(d) {
  const rules = d.settings?.schedule || [];
  return html`<div class="dev-opt" data-for="signage room display stage overlay" ${attr(!["signage", "room", "display", "stage", "overlay"].includes(d.type), "hidden")}>
    <fieldset class="field dev-sched" style="border:0;padding:0"><legend class="flabel">Schedule</legend>
      <small class="faint" style="display:block;margin-bottom:8px">Play other playlists at set times. The rest of the time it plays the playlist above${d.type === "display" || d.type === "stage" ? " between services" : ""}.</small>
      <div class="sched-rules">${rules.map((r, i) => scheduleRow(i, r))}</div>
      <button type="button" class="btn ghost sm" data-act="dev-sched-add">${icon("plus")}Add a time</button></fieldset></div>`;
}
function scheduleRow(i, r = { playlistId: "", days: [0], from: "09:00", to: "10:30" }) {
  return html`<div class="sched-rule" data-i="${i}">
    <div class="sched-days" role="group" aria-label="Days">${DAY_SHORT.map((l, k) => html`<label class="day-chip"><input type="checkbox" name="sch${i}_d${k}" ${attr(r.days.includes(k), "checked")}><span>${l[0]}${l[1]}</span></label>`)}</div>
    <div class="sched-line"><input type="time" name="sch${i}_from" value="${r.from}" aria-label="From"><span>to</span><input type="time" name="sch${i}_to" value="${r.to}" aria-label="To">
      <select name="sch${i}_pl" aria-label="Plays"><option value="">The church's logo</option>${S.list("signage").map((p) => html`<option value="${p.id}" ${attr(p.id === r.playlistId, "selected")}>${p.name}</option>`)}</select>
      <button type="button" class="icon-btn" data-act="dev-sched-remove" aria-label="Remove this time">${icon("trash")}</button></div></div>`;
}
Actions["dev-sched-add"] = (el) => {
  const box = el.closest(".dev-sched").querySelector(".sched-rules"), i = Math.max(-1, ...[...box.children].map((r) => +r.dataset.i)) + 1;
  box.insertAdjacentHTML("beforeend", flat(scheduleRow(i)));
};
Actions["dev-sched-remove"] = (el) => el.closest(".sched-rule").remove();
/** Reads the schedule from the device form. Returns { rules } or { error }. */
function scheduleFromForm(d) {
  const rules = [];
  for (const k of Object.keys(d)) {
    const m = k.match(/^sch(\d+)_pl$/); if (!m) continue;
    const i = m[1], days = DAY_SHORT.map((_, n) => n).filter((n) => d[`sch${i}_d${n}`]), from = d[`sch${i}_from`], to = d[`sch${i}_to`];
    if (!days.length) return { error: "Each scheduled time needs at least one day." };
    if (!from || !to || from === to) return { error: "Each scheduled time needs a start and an end." };
    rules.push({ id: uid(), playlistId: d[k] || "", days, from, to });
  }
  return { rules };
}

// ----- Saving pictures and videos for playing without internet -----
const screenMedia = { key: "", at: 0, saved: null, total: null };
function playlistMedia(pl) {
  const out = [];
  for (const s of pl?.slides || []) for (const u of [s.bg, s.image, s.video]) if (u) out.push(u);
  return out;
}
/** Asks the service worker to save everything this screen might show. Reports back how much is saved. */
function cacheScreenMedia(d) {
  if (!d || !navigator.serviceWorker?.controller) return;
  const c = S.church(), ids = new Set([deviceBasePlaylist(d), ...(d.settings?.schedule || []).map((r) => r.playlistId), d.control?.playlistId].filter(Boolean));
  const urls = [...new Set([...[...ids].flatMap((id) => playlistMedia(S.get("signage", id))), c?.logo, c?.banner?.bg?.image].filter((u) => u && !/^(data|blob):/.test(u)))];
  const key = urls.join("|");
  if (key === screenMedia.key && Date.now() - screenMedia.at < 10 * 60e3) return;
  Object.assign(screenMedia, { key, at: Date.now() });
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => { screenMedia.saved = e.data.saved; screenMedia.total = e.data.total; };
  navigator.serviceWorker.controller.postMessage({ type: "ofc-cache", urls }, [ch.port2]);
}
/** What a screen reports about itself with its regular check-in. */
const screenReport = () => ({ online: navigator.onLine, saved: screenMedia.saved, total: screenMedia.total, at: new Date().toISOString() });
const offlineBadge = () => navigator.onLine ? "" : html`<div class="screen-offline" role="status">${icon("info")}No internet: playing saved content</div>`;
addEventListener("online", () => { if (thisDevice()) render(); });
addEventListener("offline", () => { if (thisDevice()) render(); });

// ----- Screen health -----
/** What a screen is doing and anything that needs attention: { warn: [...], info: [...], playing } */
function screenHealth(d, now = new Date()) {
  const warn = [], info = [], st = deviceStatus(d);
  if (d.status === "paired" && st !== "Online") warn.push(d.lastSeen ? `Offline since ${fmtShort(new Date(d.lastSeen))}, ${fmtTime(d.lastSeen)}` : "Hasn't checked in");
  const id = devicePlaylistNow(d, now), pl = id && S.get("signage", id);
  if (d.type === "signage" && !deviceBasePlaylist(d) && !scheduleRuleNow(d, now)) warn.push("No playlist chosen");
  if (id && !pl) warn.push("Its playlist was removed");
  if (pl && !signageSlides(pl).length) warn.push(`${pl.name} has nothing to show right now: its slides are outside their dates`);
  if (d.control?.pausedAt) info.push("Paused from the remote");
  if (d.health?.online === false) warn.push("No internet: playing saved content");
  if (d.health?.total) (d.health.saved < d.health.total ? warn : info).push(`Saved for offline: ${d.health.saved} of ${plural(d.health.total, "picture or video", "pictures and videos")}`);
  return { warn, info, playing: pl ? pl.name : "The church's logo", why: devicePlaylistWhy(d, now) };
}
function screenHealthPanel() {
  const screens = S.list("devices").filter((d) => SCREEN_TYPES.includes(d.type) && d.status === "paired");
  if (!screens.length) return "";
  const rows = screens.map((d) => ({ d, h: screenHealth(d) })), bad = rows.filter((x) => x.h.warn.length);
  return html`<section class="sec"><div class="sec-head"><h2>Screen health</h2><span class="tag ${bad.length ? "warn" : "ok"}">${bad.length ? `${bad.length} need${bad.length === 1 ? "s" : ""} attention` : "All good"}</span></div>
    <div class="rows">${rows.map(({ d, h }) => html`<a class="row" href="#screenremote-${d.id}"><span class="lead-ic">${icon(DEVICE_TYPES[d.type][1])}</span><span class="body"><span class="t">${d.name}</span>
      <span class="s">Playing ${h.playing}, ${h.why}</span>${[...h.warn.map((w) => html`<span class="s warn-text">${icon("info")}${w}</span>`), ...h.info.map((t) => html`<span class="s">${t}</span>`)]}</span>
      <span class="btn ghost sm" aria-hidden="true">${icon("screen")}Remote</span></a>`)}</div></section>`;
}

// ----- The remote -----
Screens.screenremote = (id) => {
  const d = S.get("devices", id);
  if (!d || !SCREEN_TYPES.includes(d.type) || !(canDevices() || S.can("present"))) return { redirect: canDevices() ? "devices" : "home" };
  const pid = devicePlaylistNow(d), pl = pid && S.get("signage", pid), slides = pl ? signageSlides(pl) : [], h = screenHealth(d);
  const pos = playPosition(slides, Date.now(), d.control), cur = slides[pos.i], next = slides.length > 1 ? slides[(pos.i + 1) % slides.length] : null;
  const busy = d.type === "room" && typeof activeRoomSession === "function" && activeRoomSession(d), follows = d.type === "display" || d.type === "stage";
  const paused = !!d.control?.pausedAt, lists = S.list("signage"), pick = remotePick.id === d.id ? remotePick : { playlistId: pid, for: "60" };
  return {
    title: d.name, back: canDevices() ? "devices" : "home",
    body: html`<p class="muted" style="margin-top:14px">${[d.locationId ? locName(d.locationId) : "", d.type === "room" ? d.settings?.room : "", deviceStatus(d)].filter(Boolean).join(" · ")}</p>
      ${busy ? html`<div class="demo-note">${icon("screen")}<div>Someone is presenting in this room. The remote runs the signage when they finish.</div></div>` : ""}
      ${follows ? html`<div class="demo-note">${icon("info")}<div>This screen shows the booth's slides during services. The remote runs what it plays between them.</div></div>` : ""}
      ${h.warn.map((w) => html`<p class="room-msg warn">${icon("info")}<span>${w}</span></p>`)}
      <section class="sec"><div class="sec-head"><h2>Now: ${pl ? pl.name : "the church's logo"}</h2><span class="faint">${h.why}</span></div>
        ${pl && cur ? html`<div class="remote-now"><div class="sign-preview">${signFrame(pl, cur)}</div>
            <p class="faint remote-count">Slide ${pos.i + 1} of ${slides.length}${paused ? " · paused" : ` · next in ${Math.ceil(pos.left)}s`}</p>
            ${next ? html`<div class="remote-next"><span class="faint">Next</span><div class="sign-preview">${signFrame(pl, next)}</div></div>` : ""}</div>
          <div class="remote-btns">
            <button class="btn ghost" data-act="remote" data-id="${d.id}" data-do="back" aria-label="Back">${icon("back")}Back</button>
            <button class="btn" data-act="remote" data-id="${d.id}" data-do="${paused ? "play" : "pause"}">${icon(paused ? "play" : "pause")}${paused ? "Play" : "Pause"}</button>
            <button class="btn ghost" data-act="remote" data-id="${d.id}" data-do="next">Next${icon("chev")}</button></div>`
        : html`<div class="rows">${empty(pl ? "Nothing to show from this playlist right now." : "Showing the church's logo.")}</div>`}</section>
      <section class="sec"><h2 class="sec-head">Play something else</h2>
        <form class="panel" data-form="remote-play" data-input="remote-pick" novalidate><input type="hidden" name="id" value="${d.id}">
          <label class="field" style="margin-top:0"><span>Playlist</span><select name="playlistId"><option value="">The church's logo</option>${lists.map((p) => html`<option value="${p.id}" ${attr(p.id === pick.playlistId, "selected")}>${p.name}</option>`)}</select></label>
          <fieldset class="field" style="border:0;padding:0"><legend class="flabel">For</legend><div class="radios">
            ${[["60", "An hour"], ["today", "The rest of today"], ["next", "Until its next scheduled change"]].map(([v, l], n) => html`<label><input type="radio" name="for" value="${v}" ${attr(v === pick.for, "checked")}><span>${l}</span></label>`)}</div></fieldset>
          <div class="btns"><button class="btn sm">Play it</button>${controlLive(d.control) || paused ? html`<button type="button" class="btn ghost sm" data-act="remote" data-id="${d.id}" data-do="schedule">Back to the schedule</button>` : ""}</div></form></section>`,
    after() {
      // Each second: the countdown ticks; when the slide (or what's playing) changes, the page redraws.
      clearInterval(Screens.screenremote.timer);
      Screens.screenremote.timer = setInterval(() => {
        if (location.hash !== `#screenremote-${id}`) { clearInterval(Screens.screenremote.timer); return; }
        const d2 = S.get("devices", id), p2 = devicePlaylistNow(d2), l2 = p2 && S.get("signage", p2), s2 = l2 ? signageSlides(l2) : [], q = playPosition(s2, Date.now(), d2?.control);
        if (p2 !== pid || q.i !== pos.i || !!d2?.control?.pausedAt !== paused) { if (!document.querySelector("#scrim .sheet")) render(); return; }
        const n = $(".remote-count"); if (n && !paused) n.textContent = `Slide ${q.i + 1} of ${s2.length} · next in ${Math.ceil(q.left)}s`;
      }, 1000);
    },
  };
};
/** What's picked in "Play something else", kept while the page redraws. */
const remotePick = { id: "", playlistId: "", for: "60" };
Inputs["remote-pick"] = (form) => { Object.assign(remotePick, { id: form.elements.id.value, playlistId: form.elements.playlistId.value, for: form.elements.for.value }); };
/** Sends a change to the screen (it's saved with the device, which the screen watches). */
function sendControl(d, control) {
  d.control = control; S.save(); devicePing(d, { control });
}
Actions["remote"] = (el) => {
  const d = S.get("devices", el.dataset.id); if (!d) return;
  const c = { ...(d.control || {}) }, pid = devicePlaylistNow(d), pl = pid && S.get("signage", pid), slides = pl ? signageSlides(pl) : [];
  const pos = playPosition(slides, Date.now(), c), now = Date.now();
  switch (el.dataset.do) {
    case "next": c.shift = (+c.shift || 0) + pos.left + 0.05; break;
    case "back": c.shift = (+c.shift || 0) - pos.into - (pos.into > 3 || !slides.length ? 0 : slides[(pos.i - 1 + slides.length) % slides.length].seconds || 10) + 0.05; break;
    case "pause": c.pausedAt = new Date(now).toISOString(); break;
    case "play": if (c.pausedAt) c.shift = (+c.shift || 0) - (now - Date.parse(c.pausedAt)) / 1000; delete c.pausedAt; break;
    case "schedule": sendControl(d, null); render(); toast("Back to its schedule"); return;
  }
  sendControl(d, c); render();
};
Forms["remote-play"] = (data) => {
  const d = S.get("devices", data.id); if (!d) return;
  const now = new Date();
  let until = null;
  if (data.for === "60") until = new Date(+now + 3600e3);
  else if (data.for === "today") { until = new Date(now); until.setHours(23, 59, 0, 0); }
  else {
    // The next time the schedule would change what plays: look ahead in 5-minute steps, up to a week.
    const was = scheduleRuleNow(d, now);
    for (let t = +now + 300e3; t < +now + 7 * 864e5; t += 300e3) if (scheduleRuleNow(d, new Date(t)) !== was) { until = new Date(t); break; }
  }
  remotePick.id = "";
  sendControl(d, { playlistId: data.playlistId || "", until: until ? until.toISOString() : null, shift: 0 });
  render(); toast(`${d.name} is playing ${S.get("signage", data.playlistId)?.name || "the logo"}${until ? ` until ${fmtTime(until)}` : ""}`);
};
