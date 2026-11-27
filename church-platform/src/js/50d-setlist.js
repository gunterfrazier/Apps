// ---------- Set list mode: the band's page for a service plan ----------
// #setlist-<plan>, for anyone who plans services, presents, or is scheduled on that plan. Phone or tablet.
//   The list: each song in plan order with its key, tempo, time signature and the sections sung today.
//   Live follow: the song and section on screen in the room are highlighted, from the same broadcast the stage
//     display hears, so the page moves when the booth moves.
//   Parts, chosen per person and remembered on the device: Vocals (words, large), Chords (chords over words, in
//     the musician's own key or with a capo) and Rhythm (sections, tempo and a beat light).
//   Hands-free: page-turner pedals (arrow keys, Page Up/Down, Space) step through the musician's own copy without
//     moving the slides; "Back to live" returns to following.
//   Leader controls, for people who can present: tap a section to send the booth there (in the Booth view it comes
//     up in Preview for the operator to take), and quick cues (Repeat, Watch me, Last time…) that show on the stage
//     display and every musician's page.

const SL_KEY = "ofc-setlist";
const SL_PARTS = [["vocals", "Vocals"], ["chords", "Chords"], ["rhythm", "Rhythm"]];
const SL_CUES = ["Repeat", "Watch me", "Last time", "Key change", "Hold", "Out", "Build", "Down"];
const slPrefs = () => { try { return { part: "chords", keys: {}, capo: 0, ...JSON.parse(localStorage.getItem(SL_KEY) || "{}") }; } catch { return { part: "chords", keys: {}, capo: 0 }; } };
const slSave = (patch) => { try { localStorage.setItem(SL_KEY, JSON.stringify({ ...slPrefs(), ...patch })); } catch { /* private mode */ } };
// live: what the room sees (from the booth); mine: where this musician is when not following; open: the song shown.
const sl = { plan: "", live: null, msg: "", follow: true, mine: null, open: null, listening: false };

/** The songs of a plan in order, each with the sections sung today. */
function setlistSongs(p) {
  return p.segments.map((s, segIndex) => ({ s, segIndex, song: SEGMENT_TYPES[s.type]?.content === "song" ? S.get("songs", s.content?.songId) : null }))
    .filter((x) => x.song && x.s.show !== false)
    .map(({ s, segIndex, song }) => ({ segIndex, song, title: s.title || song.title, leader: s.leader || "", labels: s.content?.sections?.length ? s.content.sections : songOrder(song) }));
}
const canSetlist = (p) => !!p && S.isMember() && (canSeePlans() || (p.assignments || []).some((a) => a.userId === S.me().id));
const slLeader = () => S.can("present");

/** The song and section on screen, from a booth broadcast for this plan. */
function setlistHeard(m) {
  if (!m?.key || m.room || m.church !== S.state.current || m.key !== `service-${sl.plan}`) return;
  if (m.ended) { sl.live = null; sl.msg = ""; return setlistRedraw(); }
  const data = routeData(m.key); if (!data) return;
  const st = { ...m, index: clamp(m.index || 0, 0, data.slides.length - 1) };
  const cur = liveAt(data.slides, st).cur;
  const was = sl.msg;
  sl.live = cur?.songId ? { songId: cur.songId, label: cur.label, segIndex: cur.segIndex } : { songId: "", label: "", segIndex: cur?.segIndex };
  sl.msg = m.msg || "";
  if (sl.msg && sl.msg !== was) navigator.vibrate?.(120);
  setlistRedraw();
}
function setlistRedraw() {
  if (!location.hash.startsWith("#setlist-")) return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#app")) return;
  render();
}
function setlistListen() {
  if (sl.listening) return; sl.listening = true;
  presChannel?.addEventListener("message", sl.local = (e) => setlistHeard(e.data));
  if (Backend.on) Backend.onBroadcast(setlistHeard);
}
window.addEventListener("hashchange", (e) => {
  const was = new URL(e.oldURL).hash;
  if (!was.startsWith("#setlist-") || location.hash === was || !sl.listening) return;
  sl.listening = false; presChannel?.removeEventListener("message", sl.local);
  if (Backend.on) Backend.offBroadcast(`present:${S.state.current}`);
});

/** Where this page is: following the room, or the musician's own place. */
const slHere = () => (sl.follow ? sl.live : sl.mine) || null;

Screens.setlist = (id) => {
  const p = S.get("services", id);
  if (!canSetlist(p)) return { redirect: "home" };
  if (sl.plan !== id) Object.assign(sl, { plan: id, live: null, msg: "", follow: true, mine: null, open: null });
  const songs = setlistSongs(p), prefs = slPrefs(), here = slHere();
  const openSong = songs.find((x) => x.segIndex === (sl.open ?? here?.segIndex)) || songs.find((x) => x.song.id === here?.songId) || songs[0];
  return {
    title: "Set list", back: canSeePlans() ? `service-${id}` : "home",
    body: html`<div class="setlist" data-part="${prefs.part}">
      <p class="sl-head"><b>${p.title}</b> <span class="faint">${fmtDay(fromIsoDay(p.date))}${p.time ? ` at ${timeLabel(p.time, tzOf(p), p.date)}` : ""}</span>
        <span class="sl-state ${sl.live ? "live" : ""}">${sl.live ? (sl.follow ? "Following the room" : "On your own") : "Waiting for the booth"}</span></p>
      ${sl.msg ? html`<p class="sl-msg" role="alert">${sl.msg}</p>` : ""}
      <div class="sl-bar">
        <div class="seg sl-parts" role="radiogroup" aria-label="Your part">${SL_PARTS.map(([v, l]) => html`<button type="button" role="radio" data-act="sl-part" data-part="${v}" aria-checked="${prefs.part === v}" ${attr(prefs.part === v, 'aria-current="true"')}>${l}</button>`)}</div>
        ${!sl.follow ? html`<button type="button" class="btn sm" data-act="sl-live">${icon("live")}Back to live</button>` : ""}
      </div>
      ${!songs.length ? html`<div class="rows">${empty("This plan has no songs yet.")}</div>` : html`
      <ol class="sl-list">${songs.map((x) => {
        const isLive = sl.live?.segIndex === x.segIndex, isOpen = x === openSong;
        return html`<li class="sl-song ${isLive ? "live" : ""} ${isOpen ? "open" : ""}"><button type="button" class="sl-song-head" data-act="sl-open" data-seg="${x.segIndex}" aria-expanded="${isOpen}">
          <span class="sl-t">${x.title}</span><span class="sl-meta">${slKeyLabel(x.song, prefs)} · ${x.song.bpm || "?"} BPM · ${x.song.timeSig || "4/4"}</span></button>
          <div class="sl-arr" role="group" aria-label="Sections of ${x.title}">${x.labels.map((l) => {
            const on = here?.segIndex === x.segIndex && sameLabel(here?.label, l);
            return html`<button type="button" class="sec-chip ${on ? "on" : ""}" data-act="${slLeader() ? "sl-send" : "sl-go"}" data-seg="${x.segIndex}" data-song="${x.song.id}" data-label="${l}" aria-pressed="${on}" title="${slLeader() ? `Send the booth to ${l}` : `Go to ${l}`}">${l}</button>`; })}</div>
          ${isOpen ? slSongBody(x, prefs, here) : ""}</li>`; })}</ol>`}
      ${slLeader() && songs.length ? html`<section class="sl-leader" aria-label="Leader cues"><h2 class="sec-head">Cues to the band</h2>
        <div class="sl-cues">${SL_CUES.map((c) => html`<button type="button" class="btn ghost sm ${sl.msg === c ? "on" : ""}" data-act="sl-cue" data-text="${c}" aria-pressed="${sl.msg === c}">${c}</button>`)}
          ${sl.msg ? html`<button type="button" class="btn ghost sm" data-act="sl-cue" data-text="">${icon("x")}Clear</button>` : ""}</div>
        <p class="faint">Tapping a section sends the booth there; in the Booth view it comes up in Preview for the operator to take. Cues show on the stage display and every musician's set list.</p></section>` : ""}
      <p class="faint sl-pedals">Page-turner pedal: right or down for the next section, left or up to go back. That moves only your copy.</p>
    </div>`,
    after() { setlistListen(); const on = $(".sl-body .sl-sec.on"); if (on && sl.follow) on.scrollIntoView({ block: "center", behavior: "smooth" }); },
  };
};

function slKeyLabel(song, prefs) {
  const orig = song.key || "D", mine = prefs.keys?.[song.id];
  return prefs.part === "chords" && (mine || prefs.capo) ? `${mine || orig}${prefs.capo ? `, capo ${prefs.capo}` : ""} (written in ${orig})` : `Key of ${orig}`;
}
function slSongBody(x, prefs, here) {
  const song = x.song, parts = songParts(song), orig = song.key || "D", target = prefs.keys?.[song.id] || orig;
  const semi = semitonesBetween(orig, target, prefs.capo), flats = FLAT_KEYS.has(transposeNote(orig, semi, true));
  const sections = x.labels.map((l) => parts.find((p) => sameLabel(p.label, l))).filter(Boolean);
  return html`<div class="sl-body">
    ${prefs.part === "chords" ? html`<div class="sl-keys"><label>Key <select data-change="sl-key" data-song="${song.id}">${KEY_CHOICES.map((k) => html`<option value="${k}" ${attr(k === target, "selected")}>${k}${k === orig ? " (written)" : ""}</option>`)}</select></label>
      <label>Capo <select data-change="sl-capo">${[0, 1, 2, 3, 4, 5, 6, 7].map((c) => html`<option value="${c}" ${attr(+prefs.capo === c, "selected")}>${c || "None"}</option>`)}</select></label></div>` : ""}
    ${prefs.part === "rhythm" ? html`<p class="sl-tempo"><span class="sl-beat" style="--bpm:${+song.bpm || 76}" aria-hidden="true"></span><b>${song.bpm || 76} BPM</b> · ${song.timeSig || "4/4"}</p>` : ""}
    ${sections.map((pt, i) => { const on = here?.segIndex === x.segIndex && sameLabel(here?.label, pt.label);
      return html`<section class="sl-sec pt-${pt.type || ""} ${on ? "on" : ""}" data-i="${i}"><h3>${pt.label}</h3>
        ${prefs.part === "vocals" ? html`<div class="sl-words">${stripInlineChords(pt.lyrics)}</div>`
          : prefs.part === "chords" ? renderChordProLyrics(pt.lyrics, semi, flats)
          : html`<p class="faint">${plural(String(pt.lyrics || "").split("\n").filter(Boolean).length, "line")}${/\[[A-G]/.test(pt.lyrics) ? `: ${[...new Set([...pt.lyrics.matchAll(/\[([A-G][#b]?[^\]]*)\]/g)].map((m) => transposeChord(m[1], semi, flats)))].slice(0, 8).join(" ")}` : ""}</p>`}</section>`; })}
  </div>`;
}

Actions["sl-part"] = (el) => { slSave({ part: el.dataset.part }); render(); };
Actions["sl-open"] = (el) => { const seg = +el.dataset.seg; sl.open = sl.open === seg ? null : seg; render(); };
Actions["sl-live"] = () => { sl.follow = true; sl.mine = null; sl.open = null; render(); };
Actions["sl-go"] = (el) => { sl.follow = false; sl.mine = { songId: el.dataset.song, label: el.dataset.label, segIndex: +el.dataset.seg }; sl.open = +el.dataset.seg; render(); };
Actions["sl-send"] = (el) => {
  sendBoothCommand({ do: "section", song: el.dataset.song, label: el.dataset.label, seg: +el.dataset.seg, cue: true, key: `service-${sl.plan}` });
  toast(`Sent: ${el.dataset.label}`);
};
Actions["sl-cue"] = (el) => { sendBoothCommand({ do: "message", text: el.dataset.text, key: `service-${sl.plan}` }); toast(el.dataset.text ? `Cue: ${el.dataset.text}` : "Cue cleared"); };
Inputs["sl-key"] = (el) => { const keys = { ...slPrefs().keys, [el.dataset.song]: el.value }; slSave({ keys }); render(); };
Inputs["sl-capo"] = (el) => { slSave({ capo: +el.value || 0 }); render(); };

/** Pedals: step through this musician's own copy, section by section and on into the next song. */
document.addEventListener("keydown", (e) => {
  if (!location.hash.startsWith("#setlist-") || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
  const d = ["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key) ? 1 : ["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key) ? -1 : 0;
  if (!d) return;
  const p = S.get("services", sl.plan); if (!p) return;
  e.preventDefault();
  const flat = setlistSongs(p).flatMap((x) => x.labels.map((label) => ({ songId: x.song.id, label, segIndex: x.segIndex })));
  const here = slHere();
  let i = here ? flat.findIndex((f) => f.segIndex === here.segIndex && sameLabel(f.label, here.label)) : -1;
  i = clamp(i < 0 ? (d > 0 ? 0 : flat.length - 1) : i + d, 0, flat.length - 1);
  sl.follow = false; sl.mine = flat[i]; sl.open = flat[i]?.segIndex ?? null; render();
  requestAnimationFrame(() => $(".sl-body .sl-sec.on")?.scrollIntoView({ block: "center", behavior: "smooth" }));
});
