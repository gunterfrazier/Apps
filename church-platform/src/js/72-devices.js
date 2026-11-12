// ---------- Church devices: kiosks, signage, presentation screens, stage displays, overlays and the booth ----------
// Staff add a device and get a short pairing code. On the device, someone opens the app, chooses "Set up a church
// device" and types the code (or scans its QR code). The device then signs in as itself, not as a person, and is
// locked to its one job. With Supabase, each device gets its own account with only the access that job needs;
// removing the device signs it out everywhere.

const DEVICE_TYPES = {
  kiosk: ["Check-in kiosk", "kid", "Families check in their kids and print name tags"],
  signage: ["Signage screen", "image", "Plays a signage playlist in the lobby or a hallway"],
  display: ["Presentation screen", "screen", "Shows the slides the booth is presenting"],
  stage: ["Stage display", "music", "Words, what's next, timers and messages for the band and speaker"],
  overlay: ["Livestream overlay", "live", "Lyrics, Scripture and captions for the streaming computer"],
  booth: ["Booth computer", "list", "Runs service plans and sermon slides for the screens"],
};
const canDevices = () => S.isMember() && S.can("manage.devices");
const DEVICE_KEY = "our-faithful-device";

/** The device this browser is set up as, if any. With Supabase it's the device account; otherwise it's kept per tab. */
function thisDevice() {
  if (Backend.on) return Backend.user ? S.list("devices").find((d) => d.deviceUser === Backend.user.id) || null : null;
  let id = null; try { id = sessionStorage.getItem(DEVICE_KEY); } catch {}
  return id ? S.get("devices", id) : null;
}
/** Where a device is allowed to go, first one being its home screen. */
function deviceRoutes(d) {
  return { kiosk: ["kiosk"], signage: [`signage-${d.settings?.playlistId || ""}`], display: ["display-follow"], stage: ["stage-follow"], overlay: ["overlay-follow"],
    booth: ["booth", "present"] }[d.type] || ["home"];
}
// In the preview, devices are other tabs in the same browser. This keeps the admin's tab and the device's tab in step.
let devChannel = null;
try { devChannel = "BroadcastChannel" in window ? new BroadcastChannel("our-faithful-devices") : null; } catch { devChannel = null; }
function devicePing(d, patch) { if (!Backend.on) try { devChannel?.postMessage({ id: d.id, patch }); } catch {} }
if (devChannel) devChannel.onmessage = (e) => {
  const { id, patch } = e.data || {}, d = S.get("devices", id);
  if (!d || Backend.on) return;
  const mine = thisDevice()?.id === id;
  if (!patch) {
    S.state.devices = S.state.devices.filter((x) => x.id !== id);
    if (mine) { try { sessionStorage.removeItem(DEVICE_KEY); } catch {} document.body.classList.remove("device-mode"); toast("This device was removed"); go(S.me().name ? "home" : "welcome"); }
    return;
  }
  const was = d.status; Object.assign(d, patch);
  if (was !== "paired" && d.status === "paired" && $("#scrim .pair-code")) { closeSheet(true); toast(`${d.name} is paired`); }
  if (mine || (location.hash === "#devices" && !$("#scrim"))) render();
};
const pairCode = () => { const a = "ACDEFHJKLMNPQRTUVWXY34679"; return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join(""); };
const deviceStatus = (d) => d.status !== "paired" ? (new Date(d.codeExpires) > new Date() ? "Waiting to pair" : "Code expired") : d.lastSeen && Date.now() - new Date(d.lastSeen) < 5 * 60e3 ? "Online" : d.lastSeen ? `Last seen ${ago(d.lastSeen)}` : "Paired";

// ----- Managing devices -----
Screens.devices = () => {
  if (!canDevices()) return { redirect: hasAdminTools() ? "admin" : "me" };
  const list = S.list("devices").sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: "Screens and devices", back: hasAdminTools() ? "admin" : "ministry",
    body: html`<p class="muted" style="margin-top:16px">Sign in the church's shared screens and tablets as devices, not as people. Each one does one job and stays signed in. Remove a device to sign it out.</p>
      <div class="btns"><button class="btn" data-act="device-new">${icon("plus")}Add a device</button><a class="btn ghost" href="#signs">${icon("image")}Signage playlists</a></div>
      ${Object.entries(DEVICE_TYPES).map(([k, [label, ic]]) => { const ds = list.filter((d) => d.type === k); return ds.length ? html`<section class="sec"><h2 class="sec-head">${label}s</h2><div class="rows">${ds.map((d) => { const st = deviceStatus(d);
        return html`<button class="row" data-act="device-open" data-id="${d.id}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${d.name}</span><span class="s">${[d.locationId ? locName(d.locationId) : "", deviceSummary(d)].filter(Boolean).join(". ")}</span></span>
          <span class="tag ${st === "Online" ? "ok" : st === "Code expired" ? "warn" : st === "Waiting to pair" ? "brand" : ""}">${st}</span></button>`; })}</div></section>` : ""; })}
      ${!list.length ? html`<div class="rows" style="margin-top:14px">${empty("No devices yet. Add the lobby screen, a check-in tablet or the booth computer.")}</div>` : ""}`,
  };
};
function deviceSummary(d) {
  const s = d.settings || {};
  if (d.type === "signage") return S.get("signage", s.playlistId)?.name ? `Plays ${S.get("signage", s.playlistId).name}` : "No playlist chosen";
  if (["display", "stage", "overlay"].includes(d.type)) return `Follows the booth${s.idlePlaylistId && S.get("signage", s.idlePlaylistId) ? `, ${S.get("signage", s.idlePlaylistId).name} between services` : ""}`;
  if (d.type === "kiosk") return `${LABEL_SIZES[s.labelSize || "4x2"][0].split(" (")[0]} tags${s.exitPin ? ", exit code set" : ""}`;
  return "";
}
function deviceForm(d = { type: "signage", settings: {} }) {
  const s = d.settings || {}, lists = S.list("signage");
  return html`<form data-form="device-save" data-change="device-type" novalidate><input type="hidden" name="id" value="${d.id || ""}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${d.name || DEVICE_TYPES[d.type][0]}" required maxlength="50" placeholder="Lobby screen" ${attr(!d.id, 'data-auto="1"')}></label>
    ${d.id ? html`<input type="hidden" name="type" value="${d.type}"><p class="faint" style="margin:0">${DEVICE_TYPES[d.type][0]}</p>` : html`<fieldset class="field" style="border:0;padding:0"><legend class="flabel">What does it do?</legend>
      <div class="rows">${Object.entries(DEVICE_TYPES).map(([k, [l, ic, sub]]) => html`<label class="row" style="cursor:pointer"><input type="radio" name="type" value="${k}" ${attr(k === d.type, "checked")} style="accent-color:var(--brand)"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${l}</span><span class="s">${sub}</span></span></label>`)}</div></fieldset>`}
    <label class="field"><span>Location</span><select name="locationId">${locationOptions(d.locationId, "Any location")}</select></label>
    <div class="dev-opt" data-for="signage" ${attr(d.type !== "signage", "hidden")}><label class="field"><span>Playlist</span><select name="playlistId"><option value="">Choose a playlist</option>${lists.map((p) => html`<option value="${p.id}" ${attr(p.id === s.playlistId, "selected")}>${p.name}</option>`)}</select>${!lists.length ? html`<small><a href="#signs">Make a playlist first</a></small>` : ""}</label></div>
    <div class="dev-opt" data-for="display stage overlay" ${attr(!["display", "stage", "overlay"].includes(d.type), "hidden")}><label class="field"><span>Between services, show</span><select name="idlePlaylistId"><option value="">The church's logo</option>${lists.map((p) => html`<option value="${p.id}" ${attr(p.id === s.idlePlaylistId, "selected")}>${p.name} (signage)</option>`)}</select><small>Switches to the booth's slides as soon as it starts presenting${d.locationId ? "" : " at this location"}.</small></label></div>
    <div class="dev-opt" data-for="kiosk" ${attr(d.type !== "kiosk", "hidden")}><label class="field"><span>Label size</span><select name="labelSize">${Object.entries(LABEL_SIZES).map(([k, [l]]) => html`<option value="${k}" ${attr(k === (s.labelSize || "4x2"), "selected")}>${l}</option>`)}</select></label></div>
    <label class="field"><span>Exit code (optional)</span><input type="text" name="exitPin" inputmode="numeric" maxlength="6" value="${s.exitPin || ""}" autocomplete="off" placeholder="4 to 6 digits"><small>Needed to take the device out of its job on the device itself.</small></label>
    <div class="btns"><button class="btn">${d.id ? "Save" : "Add and get a pairing code"}</button>${d.id ? html`<button type="button" class="btn danger" data-act="device-remove" data-id="${d.id}">Remove device</button>` : ""}</div></form>`;
}
Inputs["device-type"] = (form, e) => {
  const el = e.target; if (el.name !== "type") return;
  $$(".dev-opt", form).forEach((o) => { o.hidden = !o.dataset.for.split(" ").includes(el.value); });
  const n = form.elements.name; if (!n.value || n.dataset.auto) { n.value = DEVICE_TYPES[el.value][0]; n.dataset.auto = "1"; }
  n.addEventListener("input", () => delete n.dataset.auto, { once: true });
};
Actions["device-new"] = () => openSheet("Add a device", deviceForm(), { wide: true });
Actions["device-open"] = (el) => {
  const d = S.get("devices", el.dataset.id);
  if (d.status !== "paired") return pairSheet(d);
  openSheet(d.name, deviceForm(d), { wide: true });
};
Forms["device-save"] = (d, f) => {
  if (!d.name) return formError(f, "Name the device.");
  if (d.exitPin && !/^\d{4,6}$/.test(d.exitPin)) return formError(f, "The exit code should be 4 to 6 digits.");
  if (d.type === "signage" && !d.playlistId) return formError(f, "Choose the playlist it plays.");
  const settings = { playlistId: d.playlistId || null, idlePlaylistId: d.idlePlaylistId || null, labelSize: d.labelSize || "4x2", exitPin: d.exitPin || "" };
  if (d.id) { const dev = S.get("devices", d.id); Object.assign(dev, { name: d.name, locationId: d.locationId || null, settings }); S.save(); devicePing(dev, { name: dev.name, locationId: dev.locationId, settings }); closeSheet(); toast("Saved"); render(); return; }
  const dev = S.add("devices", { name: d.name, type: d.type, locationId: d.locationId || null, settings, status: "waiting", code: pairCode(), codeExpires: new Date(Date.now() + 30 * 60e3).toISOString(), deviceUser: null, lastSeen: null, at: new Date().toISOString() });
  closeSheet(true); render(); pairSheet(dev);
};
function pairSheet(d) {
  const fresh = new Date(d.codeExpires) > new Date();
  openSheet(`Pair ${d.name}`, html`${fresh ? html`<p class="muted" style="margin-top:0">On the ${DEVICE_TYPES[d.type][0].toLowerCase()}, open ${PLATFORM.name}, choose <b>Set up a church device</b> and enter this code. It works for 30 minutes.</p>
      <div class="pair-code" aria-label="Pairing code ${d.code.split("").join(" ")}">${d.code}</div>
      <div class="pair-qr">${raw(qrSvg(appLink(`pair-${d.code}`), { size: 200 }))}<span>Or scan this with the device's camera</span></div>
      <div class="copy-line"><input type="text" readonly value="${appLink(`pair-${d.code}`)}" aria-label="Pairing link"><button class="btn sm" data-act="copy" data-text="${appLink(`pair-${d.code}`)}">${icon("copy")}Copy</button></div>`
    : html`<p style="margin-top:0">This pairing code has expired.</p>`}
    <div class="btns"><button class="btn ghost" data-act="device-code" data-id="${d.id}">${icon("bolt")}New code</button><button class="btn danger" data-act="device-remove" data-id="${d.id}">Remove</button></div>`);
}
Actions["device-code"] = (el) => { const d = S.get("devices", el.dataset.id); Object.assign(d, { code: pairCode(), codeExpires: new Date(Date.now() + 30 * 60e3).toISOString(), status: "waiting" }); S.save(); render(); pairSheet(d); };
Actions["device-remove"] = (el) => openSheet("Remove this device?", html`<p style="margin-top:0">It's signed out right away and goes back to the normal sign-in screen. You can pair it again with a new code.</p>
  <div class="btns"><button class="btn danger" data-act="device-remove-yes" data-id="${el.dataset.id}">Remove</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
Actions["device-remove-yes"] = async (el) => {
  const d = S.get("devices", el.dataset.id);
  if (Backend.on && d.deviceUser) { try { await Backend.call("device-pair", { action: "remove", deviceId: d.id, churchId: d.churchId }); } catch (e) { toast(`Couldn't sign it out: ${e.message}`); return; } }
  S.remove("devices", d.id); devicePing(d, null); closeSheet(true); toast(`${d.name} removed`); render();
};

// ----- On the device: pairing -----
/** #pair or #pair-CODE (from the QR code). Works signed out, since a device has no person's account. */
Screens.pair = (code = "") => ({
  page: html`<div class="welcome"><div class="wrap"><p class="brand-word">${PLATFORM.name}</p>
    <form data-form="pair" class="panel pair-form" novalidate><h1 style="font-size:1.5rem">Set up a church device</h1>
      <p class="muted">For a check-in kiosk, lobby screen, presentation or stage screen, or the booth computer. Ask a church admin to add the device under <b>Admin, Screens and devices</b> for a code.</p>
      <label class="field"><span>Pairing code</span><input type="text" name="code" value="${code.toUpperCase()}" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" class="pair-input" required></label>
      <button class="btn block">Pair this device</button>
      <a class="linkish" href="#${Backend.on ? "signin" : S.me().name ? "home" : "welcome"}">Back</a></form></div></div>`,
});
Forms.pair = async (d, f) => {
  const code = String(d.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return formError(f, "The code has 6 letters and numbers.");
  if (Backend.on) {
    try {
      if (Backend.user) await Backend.client.auth.signOut();
      const { email, password } = await Backend.call("device-pair", { action: "pair", code });
      const { data, error } = await Backend.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      Backend.user = data.user; await Backend.afterSignIn(); go(deviceRoutes(thisDevice() || {})[0]);
    } catch (e) { formError(f, e.message || "That code didn't work."); }
    return;
  }
  S.load(); // pick up a device the admin just added in another tab
  const dev = (S.state.devices || []).find((x) => x.code === code && x.status !== "paired" && new Date(x.codeExpires) > new Date());
  if (!dev) return formError(f, "That code didn't work. Codes last 30 minutes; ask for a new one.");
  const paired = { status: "paired", pairedAt: new Date().toISOString(), lastSeen: new Date().toISOString(), code: null };
  Object.assign(dev, paired); S.state.current = dev.churchId; S.save(); devicePing(dev, paired);
  try { sessionStorage.setItem(DEVICE_KEY, dev.id); } catch {}
  toast(`${dev.name} is set up`); go(deviceRoutes(dev)[0]);
};

// ----- On the device: staying in its lane -----
/** Called by render(). Sends a device to its home screen if it wanders, and keeps the screen awake. */
const DEVICE_EMAIL = /@devices\.our-faithful\.invalid$/;
function deviceGate(head, tail) {
  const d = thisDevice();
  document.body.classList.toggle("device-mode", !!d);
  // A device account whose device was removed signs itself out.
  if (!d && Backend.on && Backend.ready && DEVICE_EMAIL.test(Backend.user?.email || "")) { Backend.signOut(); return null; }
  if (!d) return null;
  const routes = deviceRoutes(d), here = tail ? `${head}-${tail}` : head;
  const ok = routes.some((r) => r === here || (!r.includes("-") && r === head));
  keepAwake();
  return ok ? null : routes[0];
}
let wake = null;
async function keepAwake() { try { if (!wake && "wakeLock" in navigator && document.visibilityState === "visible") { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => { wake = null; }); } } catch { wake = null; } }
document.addEventListener("visibilitychange", () => { if (thisDevice()) keepAwake(); });
// Let staff see each device is alive.
setInterval(() => { const d = thisDevice(); if (d) { d.lastSeen = new Date().toISOString(); S.save(); devicePing(d, { lastSeen: d.lastSeen }); } }, 2 * 60e3);
/** A small lock in the corner of every device screen: leave device mode with the exit code. */
const deviceExitBtn = () => thisDevice() ? html`<button class="device-exit" data-act="device-exit" aria-label="Device settings">${icon("lock")}</button>` : "";
Actions["device-exit"] = () => {
  const d = thisDevice(); if (!d) return;
  openSheet(d.name, html`<p class="muted" style="margin-top:0">${DEVICE_TYPES[d.type][0]}${d.locationId ? `, ${locName(d.locationId)}` : ""}.</p>
    <form data-form="device-leave" novalidate>${d.settings?.exitPin ? html`<label class="field"><span>Exit code</span><input type="password" name="pin" inputmode="numeric" maxlength="6" autocomplete="off"></label>` : ""}
      <div class="btns"><button class="btn danger">Stop being a device</button><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div></form>
    ${!Backend.on ? html`<p class="faint">In the preview, device mode lasts until this tab closes.</p>` : ""}`);
};
Forms["device-leave"] = async (d, f) => {
  const dev = thisDevice();
  if (dev?.settings?.exitPin && d.pin !== dev.settings.exitPin) return formError(f, "That's not the exit code.");
  closeSheet(true); document.body.classList.remove("device-mode");
  if (Backend.on) { await Backend.signOut(); return; }
  try { sessionStorage.removeItem(DEVICE_KEY); } catch {}
  toast("This is a normal browser again"); go("home");
};

// ----- Screens that follow the booth -----
// Presentation screens, stage displays and overlays listen for whatever the booth at their church (and location) presents.
const follow = { msg: null, at: 0 };
function followMatch(m) {
  const d = thisDevice();
  return m && m.church === S.state.current && (!d?.locationId || !m.loc || m.loc === d.locationId);
}
function followListen(draw) {
  const on = (m) => {
    if (!followMatch(m)) return;
    if (m.ended) { if (!follow.msg || follow.msg.key === m.key) follow.msg = null; }
    else {
      // A new plan or sermon: get the latest copy of it before drawing.
      if (m.key !== follow.msg?.key) { if (!Backend.on) { S.load(); S.state.current = m.church; } else if (!routeData(m.key)) { follow.msg = m; Backend.pull().then(draw); return; } }
      follow.msg = m;
    }
    follow.at = Date.now(); draw();
  };
  if (presChannel) presChannel.onmessage = (e) => on(e.data);
  if (Backend.on) Backend.onBroadcast(on);
}
/** What a following screen shows with nothing presenting: the idle playlist, or the church's logo. */
function idleHtml(kind) {
  const d = thisDevice(), pl = d?.settings?.idlePlaylistId && S.get("signage", d.settings.idlePlaylistId);
  if (kind === "overlay") return html`<div class="ov-frame"></div>`;
  if (pl) { const sl = signageSlides(pl); if (!sl.length) return ""; const i = Math.floor(Date.now() / 1000 / (pl.seconds || 10)) % sl.length; return html`<div class="sign-player">${signFrame(pl, sl[i], { live: true })}</div>`; }
  return html`<div class="display"><div class="stage">${slideHtml({ kind: "logo" })}</div></div>`;
}
function drawFollow(kind) {
  const m = follow.msg, data = m && routeData(m.key), app = $("#app");
  applyBrand();
  if (!data) { app.innerHTML = flat(html`${idleHtml(kind)}${deviceExitBtn()}`); return; }
  const st = { ...m, index: clamp(m.index || 0, 0, data.slides.length - 1) };
  if (kind === "stage") app.innerHTML = flat(html`${stageMonitor(data, st, true)}${deviceExitBtn()}`);
  else if (kind === "overlay") app.innerHTML = flat(html`<div class="ov-frame">${overlayHtml(liveAt(data.slides, st).cur, st)}</div>${deviceExitBtn()}`);
  else { const s = st.black ? { kind: "black" } : st.logo ? { kind: "logo" } : timedSlide(liveAt(data.slides, st).cur, st.segAt); app.innerHTML = flat(html`<div class="display"><div class="stage">${slideHtml(s)}</div></div>${deviceExitBtn()}`); }
}
let followTimer = 0;
function startFollow(kind) {
  document.body.classList.add("presenting");
  document.documentElement.classList.toggle("overlay-page", kind === "overlay");
  drawFollow(kind); followListen(() => drawFollow(kind));
  // Without the booth, keep idle signage moving.
  clearInterval(followTimer); followTimer = setInterval(() => { if (!location.hash.endsWith("-follow")) return clearInterval(followTimer); if (!follow.msg) drawFollow(kind); }, 5000);
}

// ----- The booth -----
Screens.booth = () => {
  const d = thisDevice(), loc = d?.locationId, today = isoDay(new Date());
  const plans = S.list("services").filter((p) => p.date >= today && !p._stubOnly && (!loc || !p.locationId || p.locationId === loc)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
  const docs = S.list("docs").filter((x) => x.kind === "sermon" && x.date >= isoDay(new Date(Date.now() - 7 * DAY))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const row = (href, ic, t, s) => html`<a class="row" href="${href}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${t}</span><span class="s">${s}</span></span>${icon("chev")}</a>`;
  return {
    present: true,
    page: html`<div class="present booth">
      <header class="present-bar">${churchMark(S.church(), 34)}<b class="present-title">${d?.name || "Booth"}${loc ? `, ${locName(loc)}` : ""}</b>${deviceExitBtn()}</header>
      <main class="booth-main"><h1>What are we presenting?</h1>
        <section class="sec"><h2 class="sec-head">Service plans</h2><div class="rows">${plans.length ? plans.map((p) => row(`#present-service-${p.id}`, "list", p.title, `${fmtDay(fromIsoDay(p.date))} at ${timeLabel(p.time)}, ${plural(p.segments.length, "segment")}`)) : empty("No service plans coming up.")}</div></section>
        ${docs.length ? html`<section class="sec"><h2 class="sec-head">Sermons from the builder</h2><div class="rows">${docs.map((x) => row(`#present-doc-${x.id}`, "word", x.title, `${x.passage || ""}${x.passage ? ", " : ""}${fmtShort(fromIsoDay(x.date))}`))}</div></section>` : ""}
        <p class="faint">Presentation screens, stage displays and overlays paired to ${loc ? locName(loc) : "this church"} follow what you present here.</p></main></div>`,
  };
};
