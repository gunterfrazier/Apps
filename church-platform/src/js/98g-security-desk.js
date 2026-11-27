// ---------- Security desk: the command center on a computer, and a toolbar that floats over the camera software ----------
// On a computer (the desktop layout), Security Command's home becomes a three-column desk for the head of security or a
// supervisor: the protocol status with its actions, doors and roll call on the left; the security channel in the middle;
// open incidents on the right.
//
// The floating toolbar is a small window that stays on top of every other program, so it sits over the CCTV software
// (Blue Iris, Milestone, a DVR's viewer) while the cameras fill the screen. Chrome and Edge open it as an always-on-top
// window (Document Picture-in-Picture); other browsers get a small ordinary window. From it: the protocol level and
// declaring or clearing one (levels above someone's limit still go for approval), the security channel's latest
// messages and sending one, reporting an incident, open incidents, and a button back to the full Security Command.
// It runs in this page, so it uses the same permissions and the same functions as the rest of Security Command.

// ----- The desk -----
function securityDesk(c) {
  const alert = c.activeAlert, protos = c.securityProtocols || defaultSecurityProtocols(), sections = securitySections();
  const proto = alert?.active && protos.find((p) => +p.level === +alert.level);
  const open = securityIncidentRows().filter((r) => !r.cleared);
  const doors = alert?.active && alert.requireDoorCheck ? requiredSecurityDoors(c) : [];
  const doorsDone = doors.filter((d) => doorCheckResult(c, d)?.status === "locked").length;
  const roll = alert?.active && alert.requireRollCall ? S.list("securityRollCall") : [];
  const safe = roll.filter((r) => r.status === "safe").length;
  const link = (sub, label, ic) => sections[sub] ? html`<a class="row" href="#security-${sub}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${label}</span></span>${icon("chev")}</a>` : "";
  return html`<div class="sec-desk">
    <aside class="sec-desk-col">
      <section class="panel sec-desk-status ${proto ? "live" : ""}" style="${proto ? `--lvl-col:${proto.color}` : ""}">
        ${proto ? html`<p class="sec-desk-level"><b>Level ${proto.level}</b> ${proto.code}: ${proto.name}${alert.isDrill ? " (drill)" : ""}</p>
            <p class="faint">Since ${fmtClock(new Date(alert.at || alert.startedAt || Date.now()))}${alert.byName ? `, declared by ${alert.byName}` : ""}</p>
            ${doors.length ? html`<p>Doors checked: <b>${doorsDone} of ${doors.length}</b></p>` : ""}
            ${roll.length ? html`<p>Accounted for: <b>${safe} of ${roll.length}</b></p>` : ""}
            <div class="btns">${(alert.isDrill ? canLeadSecurity() : canReviewSecurity()) ? html`<button type="button" class="btn" data-act="sec-all-clear">${icon("check")}<span>All clear</span></button>` : ""}<button type="button" class="btn ghost sm" data-act="sec-trigger-modal">Change level</button></div>`
          : html`<p class="sec-desk-level"><b>Normal operations</b></p><p class="faint">${plural(securityTeamUserIds().length, "person", "people")} on the security roster.</p>
            <div class="btns"><button type="button" class="btn danger" data-act="sec-trigger-modal">${icon("shield")}Declare protocol</button></div>`}
      </section>
      <section class="panel sec-desk-float">
        <p><b>Over the cameras</b></p>
        <p class="faint">A small toolbar that stays on top of your camera software: the level, the channel, reporting an incident.</p>
        <div class="btns"><button type="button" class="btn ghost" data-act="sec-toolbar">${icon("layers")}Floating toolbar</button></div>
      </section>
      <div class="rows">${link("doors", "Doors and entryways", "door")}${link("rollcall", "Roll call", "check")}${link("reunify", "Reunification", "kid")}${link("medical", "Medical and AEDs", "info")}${link("drill", "Drills", "bolt")}${link("protocols", "Protocols", "list")}</div>
    </aside>
    <div class="sec-desk-main">${renderSecurityComms(c)}</div>
    <aside class="sec-desk-col">
      <h2 class="sec-head">Open incidents <span class="faint">${open.length}</span></h2>
      ${open.length ? html`<div class="rows">${open.slice(0, 12).map((r) => html`<a class="row" href="#security-incidents-${r.inc.id}"><span class="lead-ic sec-pri-${r.priority}">${icon("shield")}</span>
          <span class="body"><span class="t">${r.inc.category || "Incident"}</span><span class="s">${[INCIDENT_PRIORITY[r.priority], r.inc.room, fmtClock(new Date(r.inc.at))].filter(Boolean).join(" · ")}</span></span></a>`)}</div>`
        : html`<p class="faint">Nothing open.</p>`}
      ${sections.incidents ? html`<p><a href="#security-incidents">All incidents</a></p>` : ""}
    </aside>
  </div>`;
}

// ----- The floating toolbar -----
const SecToolbar = { win: null, mode: "bar", level: 0, pip: false };
const SOS_CATEGORIES = [["suspicious", "Suspicious person or activity"], ["medical", "Medical help needed"], ["missing_child", "Missing child"], ["door", "Door won't lock"], ["disturbance", "Disturbance"], ["other", "Other"]];
Actions["sec-toolbar"] = () => openSecToolbar();
async function openSecToolbar() {
  if (!isSecurityMember()) return toast("The floating toolbar is for the security team.");
  if (SecToolbar.win && !SecToolbar.win.closed) { SecToolbar.win.focus?.(); return; }
  let w = null;
  if ("documentPictureInPicture" in window) {
    try { w = await documentPictureInPicture.requestWindow({ width: 520, height: 120 }); SecToolbar.pip = true; } catch { w = null; }
  }
  if (!w) { w = window.open("", "ofc-sec-toolbar", "popup,width=540,height=170"); SecToolbar.pip = false; }
  if (!w) return toast("The browser blocked the toolbar. Allow pop-ups for this site, then try again.");
  SecToolbar.win = w; SecToolbar.mode = "bar";
  const d = w.document;
  d.title = "Security toolbar";
  for (const el of document.querySelectorAll("style, link[rel=stylesheet]")) d.head.append(el.cloneNode(true));
  d.documentElement.dataset.theme = document.documentElement.dataset.theme || "";
  d.body.className = "sec-tb-body";
  d.body.innerHTML = '<div id="sec-tb"></div>';
  d.addEventListener("click", secToolbarClick);
  d.addEventListener("submit", secToolbarSubmit);
  w.addEventListener("pagehide", () => { if (SecToolbar.win === w) SecToolbar.win = null; });
  secToolbarDraw(true);
}
function secToolbarDraw(force) {
  const w = SecToolbar.win;
  if (!w || w.closed) { SecToolbar.win = null; return; }
  const box = w.document.getElementById("sec-tb"); if (!box) return;
  const a = w.document.activeElement;
  if (!force && a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;   // don't wipe a message being typed
  box.innerHTML = flat(secToolbarHtml());
}
setInterval(() => secToolbarDraw(), 4000);
function secToolbarHtml() {
  const c = S.church(); if (!c) return "";
  const alert = c.activeAlert, protos = c.securityProtocols || defaultSecurityProtocols(), proto = alert?.active && protos.find((p) => +p.level === +alert.level);
  const open = securityIncidentRows().filter((r) => !r.cleared);
  const msgs = [...S.list("securityMessages"), ...S.list("securityRadioMessages").filter(canReadRadioMessage)].sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const last = msgs[0], mode = SecToolbar.mode;
  const bar = html`<div class="sec-tb-bar">
    <span class="sec-tb-level ${proto ? "live" : ""}" style="${proto ? `--lvl-col:${proto.color}` : ""}" title="${proto ? `Level ${proto.level}: ${proto.name}` : "Normal operations"}">${proto ? `L${proto.level} ${proto.name}` : "Normal"}</span>
    <button type="button" class="sec-tb-btn ${open.length ? "warn" : ""}" data-tb="open" data-to="security-incidents" title="Open incidents">${icon("shield")}${open.length}</button>
    <button type="button" class="sec-tb-msg" data-tb="mode" data-mode="${mode === "radio" ? "bar" : "radio"}" title="Security channel">${last ? html`<b>${last.senderName || S.userName(last.by)}:</b> ${String(last.text || (last.voiceUrl ? "Voice message" : "Photo or video")).slice(0, 90)}` : "No messages yet"}</button>
    <button type="button" class="sec-tb-btn" data-tb="mode" data-mode="${mode === "report" ? "bar" : "report"}" title="Report an incident">${icon("plus")}<span>Report</span></button>
    ${proto && (alert.isDrill ? canLeadSecurity() : canReviewSecurity()) ? html`<button type="button" class="sec-tb-btn ok" data-tb="mode" data-mode="clear">${icon("check")}<span>All clear</span></button>` : ""}
    <button type="button" class="sec-tb-btn danger" data-tb="mode" data-mode="${mode === "levels" ? "bar" : "levels"}" title="Declare a protocol level">${icon("bolt")}<span>Level</span></button>
    <button type="button" class="sec-tb-btn" data-tb="open" data-to="security" title="Open Security Command">${icon("next")}</button>
  </div>`;
  let panel = "";
  if (mode === "levels") panel = html`<div class="sec-tb-panel sec-tb-levels">${protos.map((p) => html`<button type="button" class="sec-tb-lvl" style="--lvl-col:${p.color}" data-tb="level" data-level="${p.level}"><b>${p.level}</b> ${p.name}${+p.level > directSecurityLevel() ? html`<small>needs approval</small>` : ""}</button>`)}</div>`;
  else if (mode === "confirm") { const p = protos.find((x) => +x.level === SecToolbar.level), review = SecToolbar.level > directSecurityLevel();
    panel = html`<div class="sec-tb-panel"><p>${review ? `Ask for approval to go to Level ${p.level}: ${p.name}?` : `Activate Level ${p.level}: ${p.name} now?`}</p><div class="btns"><button type="button" class="btn ${review ? "" : "danger"} sm" data-tb="activate">${review ? "Ask for approval" : "Activate"}</button><button type="button" class="btn ghost sm" data-tb="mode" data-mode="bar">Cancel</button></div></div>`; }
  else if (mode === "clear") panel = html`<div class="sec-tb-panel"><p>Give the all clear and end ${proto ? `Level ${proto.level}` : "the protocol"}?</p><div class="btns"><button type="button" class="btn sm" data-tb="allclear">All clear</button><button type="button" class="btn ghost sm" data-tb="mode" data-mode="bar">Cancel</button></div></div>`;
  else if (mode === "radio") panel = html`<div class="sec-tb-panel"><div class="sec-tb-feed">${msgs.slice(0, 4).map((m) => html`<p><b>${m.senderName || S.userName(m.by)}</b> <span class="faint">${fmtClock(new Date(m.at))}</span> ${m.text || (m.voiceUrl ? "Voice message" : "Photo or video")}</p>`)}</div>
    <form data-tb-form="radio" class="sec-tb-form"><input name="text" maxlength="800" placeholder="Message the security team" aria-label="Message" autocomplete="off"><label class="sec-tb-urgent"><input type="checkbox" name="urgent"> Urgent</label><button class="btn sm">Send</button></form></div>`;
  else if (mode === "report") panel = html`<div class="sec-tb-panel"><form data-tb-form="report" class="sec-tb-form report">
    <select name="category" aria-label="What's happening">${SOS_CATEGORIES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select>
    <input name="room" maxlength="80" placeholder="Where (camera, door, room)" aria-label="Where">
    <input name="details" maxlength="500" placeholder="What you see" aria-label="What you see" required>
    <button class="btn danger sm block">Alert the team</button></form></div>`;
  return html`${bar}${panel}`;
}
function secToolbarResize() {
  const w = SecToolbar.win; if (!w) return;
  const want = { bar: 120, levels: 330, confirm: 210, clear: 200, radio: 330, report: 260 }[SecToolbar.mode] || 120;
  try { w.resizeTo(w.outerWidth, want + (SecToolbar.pip ? 0 : 50)); } catch { /* needs a click; the person can drag it bigger */ }
}
function secToolbarClick(e) {
  const el = e.target.closest("[data-tb]"); if (!el) return;
  const t = el.dataset.tb;
  if (t === "mode") { SecToolbar.mode = el.dataset.mode; secToolbarResize(); }
  else if (t === "level") { SecToolbar.level = +el.dataset.level; SecToolbar.mode = "confirm"; }
  else if (t === "activate") { activateSecurityProtocol(SecToolbar.level); SecToolbar.mode = "bar"; secToolbarResize(); }
  else if (t === "allclear") { clearSecurityProtocol(); SecToolbar.mode = "bar"; secToolbarResize(); }
  else if (t === "open") { window.focus(); go(el.dataset.to); }
  secToolbarDraw(true);
}
async function secToolbarSubmit(e) {
  const f = e.target.closest("[data-tb-form]"); if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  if (f.dataset.tbForm === "radio") {
    if (!String(d.text || "").trim()) return;
    const sent = await sendRadioMessage(f, { text: String(d.text).trim(), priority: d.urgent ? "urgent" : "routine" }, SecurityRadio.target);
    if (sent) { f.reset(); render(); }
  } else if (f.dataset.tbForm === "report") {
    if (!String(d.details || "").trim()) return;
    await Forms["sos-alert-security"]({ category: d.category, room: d.room, details: d.details, shareGps: false }, f);
    SecToolbar.mode = "bar"; secToolbarResize();
  }
  secToolbarDraw(true);
}
