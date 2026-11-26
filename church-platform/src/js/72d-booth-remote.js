// ---------- Booth commands and the phone remote ----------
// Anything that drives the presenter from elsewhere (a phone remote now; Stream Deck, MIDI and Companion later) sends
// the same small commands. The presenter open on the booth runs them as if its own buttons were pressed:
//   { do: "next" | "prev" | "go" (i) | "section" (song, label) | "black" (on?) | "logo" (on?) | "clear" | "message" (text) | "ping",
//     key: the presentation it's meant for (optional), church }
// They travel on the private control:<church> channel (70-backend.js), and between tabs of one browser through a
// BroadcastChannel, which is also how the preview and tests work without a server.

let ctlLocal = null;
try { ctlLocal = "BroadcastChannel" in window ? new BroadcastChannel("our-faithful-control") : null; } catch { ctlLocal = null; }
const BOOTH_COMMANDS = ["next", "prev", "go", "section", "black", "logo", "clear", "message", "ping", "scene", "stream", "record"];
const OBS_COMMANDS = ["scene", "stream", "record"];

function sendBoothCommand(cmd) {
  const out = { ...cmd, church: S.state.current, from: S.me()?.name || "" };
  try { ctlLocal?.postMessage(out); } catch { /* closed */ }
  if (Backend.on) Backend.sendControl(out);
}

/** Runs one command on the presentation open here. Returns "" when it ran, or why it didn't. */
function boothCommand(cmd) {
  if (!cmd || !BOOTH_COMMANDS.includes(cmd.do)) return "unknown command";
  if (cmd.church !== S.state.current) return "another church";
  // OBS commands go to whichever booth window has OBS connected, presenting or not.
  if (OBS_COMMANDS.includes(cmd.do)) {
    if (!Obs.on) return "OBS isn't connected here";
    if (cmd.loc && pres.key && presLoc(pres.key) && presLoc(pres.key) !== cmd.loc) return "meant for another campus";
    const say = (e) => toast(`OBS: ${e.message}`);
    if (cmd.do === "scene") { const name = Obs.scenes.find((s) => s.toLowerCase() === String(cmd.name || "").trim().toLowerCase()); if (!name) return "no such scene"; Obs.setScene(name).catch(say); }
    else if (typeof cmd.on !== "boolean") return "say on or off";
    else (cmd.do === "stream" ? Obs.setStream(cmd.on) : Obs.setRecord(cmd.on)).catch(say);
    return "";
  }
  if (!pres.key || !location.hash.startsWith("#present-") || pres.room) return "nothing presenting here";
  if (cmd.key && cmd.key !== pres.key) return "meant for another presentation";
  if (cmd.loc && presLoc(pres.key) && presLoc(pres.key) !== cmd.loc) return "meant for another campus";
  const data = routeData(pres.key); if (!data) return "nothing presenting here";
  const { next } = liveAt(data.slides, pres);
  switch (cmd.do) {
    case "next": if (next) presMove(1); break;
    case "prev": if (pres.live || pres.index > 0) presMove(-1); break;
    case "go": { const i = +cmd.i; if (!Number.isInteger(i) || i < 0 || i >= data.slides.length) return "no such slide"; Actions["pres-jump"]({ dataset: { i } }); break; }
    case "section": {
      // A Stream Deck button names only the section ("Chorus"): it means the song on screen.
      const song = cmd.song || liveAt(data.slides, pres).cur?.songId || data.slides[pres.index]?.songId;
      const part = song && cmd.label && S.get("songs", song) && songParts(S.get("songs", song)).find((p) => sameLabel(p.label, cmd.label));
      if (!part) return "no such section";
      Actions["pres-section"]({ dataset: { song, label: part.label } }); break;
    }
    case "black": pres.black = typeof cmd.on === "boolean" ? cmd.on : !pres.black; if (pres.black) pres.logo = false; render(); break;
    case "logo": pres.logo = typeof cmd.on === "boolean" ? cmd.on : !pres.logo; if (pres.logo) pres.black = false; render(); break;
    case "clear": pres.black = pres.logo = false; if (pres.media) Actions["pres-media-off"](); else render(); break;
    case "message": pres.msg = String(cmd.text || "").slice(0, 80); presBroadcast(); render(); break;
    case "ping": presBroadcast(); break;
  }
  return "";
}
if (ctlLocal) ctlLocal.onmessage = (e) => boothCommand(e.data);
/** The presenter listens on the server's control channel once it opens (only people who can present may). */
function boothListen() { if (Backend.on && Backend.ready && !Backend.ctlHeard) Backend.onControl(boothCommand); }

// ----- The phone remote -----
// Follows the booth like a stage display does, and sends commands back. If more than one presentation is running
// (two campuses), it asks which one.
const remote = { heard: {}, pick: "", sentAt: 0, heardAt: 0, listening: false };
function remoteHeard(m) {
  if (!m?.key || m.room || m.church !== S.state.current || m.mediaNeed) return;
  if (m.ended) delete remote.heard[m.key];
  else { if (!routeData(m.key) && Backend.on) Backend.pull().then(remoteRedraw); remote.heard[m.key] = m; }
  remote.heardAt = Date.now();
  remoteRedraw();
}
function remoteRedraw() {
  if (location.hash !== "#remote") return;
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA/.test(a.tagName) && a.closest("#app")) return;   // don't wipe a message being typed
  render();
}
function remoteListen() {
  if (remote.listening) return; remote.listening = true;
  presChannel?.addEventListener("message", remote.local = (e) => remoteHeard(e.data));
  if (Backend.on) Backend.onBroadcast(remoteHeard);
  sendBoothCommand({ do: "ping" });
}
window.addEventListener("hashchange", (e) => {
  if (new URL(e.oldURL).hash !== "#remote" || location.hash === "#remote" || !remote.listening) return;
  remote.listening = false; presChannel?.removeEventListener("message", remote.local);
  if (Backend.on) Backend.offBroadcast(`present:${S.state.current}`);
});
function remoteSend(cmd) {
  const m = remote.heard[remote.pick]; if (!m) return;
  sendBoothCommand({ ...cmd, key: m.key });
  const at = remote.sentAt = Date.now();
  setTimeout(() => { if (remote.sentAt === at && remote.heardAt < at && location.hash === "#remote") toast("The booth didn't answer. Is the presenter still open?"); }, 3000);
}

Screens.remote = () => {
  if (!S.isMember() || !S.can("present")) return { redirect: "me" };
  const live = Object.values(remote.heard).filter((m) => routeData(m.key));
  if (!remote.heard[remote.pick]) remote.pick = live[0]?.key || "";
  const m = remote.heard[remote.pick], data = m && routeData(m.key);
  const body = !data
    ? html`<div class="panel remote-wait"><p><b>Waiting for the booth</b></p><p class="muted">Open a service plan or sermon in the presenter on the booth computer. This phone follows it and can move the slides.</p>
        <div class="btns"><button class="btn ghost" data-act="remote-ping">Look again</button></div></div>`
    : remotePanel(m, data, live);
  return { title: "Remote", back: "home", body: html`<div class="remote">${body}</div>`, after: remoteListen };
};
function remotePanel(m, data, live) {
  const st = { ...m, index: clamp(m.index || 0, 0, data.slides.length - 1) };
  const { cur, next } = liveAt(data.slides, st), L = st.live;
  const shown = st.black ? { kind: "black" } : st.logo ? { kind: "logo" } : timedSlide(cur, st.segAt);
  const song = cur?.songId && S.get("songs", cur.songId);
  let lastSection = null;
  return html`
    ${live.length > 1 ? html`<div class="chips remote-pick" role="group" aria-label="Which presentation">${live.map((x) => html`<button type="button" class="chip ${x.key === m.key ? "on" : ""}" data-act="remote-pick" data-key="${x.key}" aria-pressed="${x.key === m.key}">${x.loc ? locName(x.loc) : routeData(x.key).title}</button>`)}</div>` : ""}
    <p class="remote-title"><b>${data.title}</b> <span class="faint">${L ? `${L.label} ${L.i + 1} / ${L.slides.length}` : `${st.index + 1} / ${data.slides.length}`}</span></p>
    <div class="stage remote-now" aria-live="polite">${slideHtml(shown)}</div>
    <div class="remote-moves">
      <button class="btn ghost" data-act="remote-cmd" data-do="prev" aria-label="Previous slide" ${attr(!L && st.index === 0, "disabled")}>${icon("prev")}</button>
      <button class="btn remote-next" data-act="remote-cmd" data-do="next" ${attr(!next, "disabled")}>${icon("next")}Next</button>
    </div>
    <div class="btns remote-screen">
      <button class="btn ghost" data-act="remote-cmd" data-do="black" aria-pressed="${!!st.black}">${icon("black")}Black</button>
      <button class="btn ghost" data-act="remote-cmd" data-do="logo" aria-pressed="${!!st.logo}">${icon("church")}Logo</button>
      <button class="btn ghost" data-act="remote-cmd" data-do="clear" ${attr(!st.black && !st.logo && !st.media, "disabled")}>${icon("x")}Clear</button>
    </div>
    ${song ? html`<div class="song-bar remote-song" role="group" aria-label="Sections of ${song.title}"><span class="song-bar-t">${icon("music")}${song.title}</span>
      ${songParts(song).map((p) => { const on = sameLabel(p.label, cur.label); return html`<button type="button" class="sec-chip pt-${p.type} ${on ? "on" : ""}" data-act="remote-cmd" data-do="section" data-song="${song.id}" data-label="${p.label}" aria-pressed="${on}">${p.label}</button>`; })}</div>` : ""}
    ${next ? html`<p class="faint remote-next-t">Next: ${slideLabel(next)}</p>` : html`<p class="faint remote-next-t">This is the last slide.</p>`}
    <form class="stage-msg" data-form="remote-msg" novalidate><label for="remote-msg-in"><b>Message to the stage</b></label>
      <div class="copy-line"><input id="remote-msg-in" type="text" name="msg" maxlength="80" placeholder="Repeat the chorus"><button class="btn sm">Send</button></div>
      ${st.msg ? html`<button type="button" class="linkish" data-act="remote-cmd" data-do="message" data-text="">Clear "${st.msg}"</button>` : ""}</form>
    <details class="remote-list"><summary>All slides</summary><div class="slide-list">${data.slides.map((s, i) => html`${s.section && s.section !== lastSection ? (lastSection = s.section, html`<p class="slide-sec">${s.section}</p>`) : ""}<button class="slide-pick ${!L && i === st.index ? "on" : ""}" data-act="remote-cmd" data-do="go" data-i="${i}"><span>${i + 1}</span>${slideLabel(s)}</button>`)}</div></details>`;
}
Actions["remote-ping"] = () => { sendBoothCommand({ do: "ping" }); toast("Looking for the booth"); };
Actions["remote-pick"] = (el) => { remote.pick = el.dataset.key; render(); };
Actions["remote-cmd"] = (el) => {
  const { do: d, i, song, label, text } = el.dataset;
  remoteSend({ do: d, ...(i != null ? { i: +i } : {}), ...(song ? { song, label } : {}), ...(d === "message" ? { text: text || "" } : {}) });
};
Forms["remote-msg"] = (d, f) => { remoteSend({ do: "message", text: d.msg.slice(0, 80) }); f.reset(); toast(d.msg ? "Sent to the stage" : "Message cleared"); };

/** The presenter's "Phone remote" button: a code to scan with a phone signed in to the church. */
Actions["pres-remote"] = () => {
  const url = appLink("remote");
  openSheet("Phone remote", html`<div class="qr-card"><div class="qr-art">${raw(qrSvg(url, { size: 220 }))}</div>
    <p class="muted">Scan this with a phone signed in to ${S.church()?.name || "the church"} by someone who can present. It shows what's on screen and moves the slides from anywhere in the room.</p>
    <div class="btns" style="justify-content:center"><button class="btn ghost" data-act="copy" data-text="${url}" data-done="Link copied">${icon("copy")}Copy link</button></div></div>`);
};
