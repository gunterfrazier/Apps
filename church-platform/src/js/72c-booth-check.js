// ---------- Check this booth computer ----------
// Runs on the booth computer before Booth mode is set up: which displays it has and whether windows can be placed on
// them, whether OBS and Companion can be reached (Chrome asks once to allow local network access), MIDI and USB DMX,
// and how fast a command gets to the booth over the private control channel. Results can be copied to send to support.
// Nothing here changes a setting; it only tries things and reports.

const bcheck = { results: {}, screens: [], midi: "", wins: [] };
const BC_ITEMS = [
  ["browser", "Browser"], ["displays", "Displays"], ["place", "Windows on each display"], ["fullscreen", "One-step full screen"],
  ["obs", "OBS Studio"], ["companion", "Companion"], ["midi", "MIDI"], ["serial", "USB DMX (Web Serial)"], ["control", "Commands to the booth"],
];
const canBoothCheck = () => !!thisDevice() || (S.isMember() && S.canAny(["present", "manage.devices"]));
const bcSet = (k, ok, text) => { bcheck.results[k] = { ok, text, at: new Date().toISOString() }; render(); };
const isChromium = () => !!(navigator.userAgentData?.brands || []).some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));

function bcRow(k, label, body) {
  const r = bcheck.results[k];
  const tag = !r ? html`<span class="tag">Not checked</span>` : r.ok === true ? html`<span class="tag ok">Works</span>` : r.ok === false ? html`<span class="tag warn">Problem</span>` : html`<span class="tag">Note</span>`;
  return html`<section class="panel bc-item" data-check="${k}"><div class="bc-head"><b>${label}</b>${tag}</div>${r ? html`<p class="bc-result">${r.text}</p>` : ""}${body}</section>`;
}

Screens["booth-check"] = () => {
  if (!canBoothCheck()) return { redirect: "me" };
  if (!bcheck.results.browser) {
    const missing = [["getScreenDetails" in window, "Window Management"], ["requestMIDIAccess" in navigator, "Web MIDI"], ["serial" in navigator, "Web Serial"]].filter(([has]) => !has).map(([, n]) => n);
    bcheck.results.browser = { ok: isChromium() && !missing.length, text: isChromium() ? (missing.length ? `Chrome or Edge, but missing ${listJoin(missing)}. Update the browser.` : "Chrome or Edge with everything Booth mode uses.") : `This browser is missing ${listJoin(missing) || "some features"}. Booth mode needs Chrome or Edge on Windows or Mac; everything else in the app still works here.` };
  }
  const v = (k, d) => localStorage.getItem(`bc-${k}`) || d;
  return {
    title: "Check this booth computer", back: thisDevice() ? "booth" : "devices",
    body: html`<p class="muted" style="margin-top:16px">Run these on the computer that will run the screens, with its displays plugged in and OBS and Companion open if you use them. Chrome may ask to find devices on your local network: choose Allow. Nothing here changes a setting.</p>
      <div class="btns"><button class="btn" data-act="bc-copy">${icon("copy")}Copy results</button></div>
      ${bcRow("browser", "Browser", "")}
      ${bcRow("displays", "Displays", html`<div class="btns"><button class="btn ghost sm" data-act="bc-displays">Find displays</button></div>${bcheck.screens.length ? html`<div class="rows">${bcheck.screens.map((s, i) => html`<div class="row"><span class="lead-ic">${icon("screen")}</span><span class="body"><span class="t">${i + 1}. ${s.label || "Display"}${s.isPrimary ? " (main)" : ""}</span><span class="s">${s.width} × ${s.height} at ${s.left}, ${s.top}</span></span></div>`)}</div>` : ""}`)}
      ${bcRow("place", "Windows on each display", html`<label class="check"><input type="checkbox" id="bc-fs"><span>Also try opening them already full screen</span></label><div class="btns"><button class="btn ghost sm" data-act="bc-place" ${attr(!bcheck.screens.length, "disabled")}>Open a test window on each display</button><button class="btn ghost sm" data-act="bc-close">Close test windows</button></div>`)}
      ${bcheck.results.fullscreen ? bcRow("fullscreen", "One-step full screen", "") : ""}
      ${bcRow("obs", "OBS Studio", html`<form data-form="bc-obs" class="bc-form" novalidate><div class="bc-grid three"><label class="field"><span>Address</span><input name="host" value="${v("obs-host", "127.0.0.1")}"></label><label class="field"><span>Port</span><input name="port" inputmode="numeric" value="${v("obs-port", "4455")}"></label><label class="field"><span>Password</span><input name="password" type="password" autocomplete="off"></label></div><small class="faint">In OBS: Tools, WebSocket Server Settings. The password isn't saved.</small><div class="btns"><button class="btn ghost sm">Connect to OBS</button></div></form>`)}
      ${bcRow("companion", "Companion", html`<form data-form="bc-companion" class="bc-form" novalidate><div class="bc-grid"><label class="field"><span>Address</span><input name="host" value="${v("comp-host", "127.0.0.1")}"></label><label class="field"><span>Port</span><input name="port" inputmode="numeric" value="${v("comp-port", "8000")}"></label></div><small class="faint">Companion's web page address, shown in its launcher window.</small><div class="btns"><button class="btn ghost sm">Reach Companion</button></div></form>`)}
      ${bcRow("midi", "MIDI", html`<div class="btns"><button class="btn ghost sm" data-act="bc-midi">List MIDI devices</button></div>${bcheck.midi ? html`<p class="faint" aria-live="polite">Last message: ${bcheck.midi}</p>` : ""}`)}
      ${bcRow("serial", "USB DMX (Web Serial)", html`<div class="btns"><button class="btn ghost sm" data-act="bc-serial" ${attr(!("serial" in navigator), "disabled")}>Choose a USB DMX interface</button></div>`)}
      ${bcRow("control", "Commands to the booth", html`<p class="faint" style="margin:0">Sends a test command over the church's private control channel and times how long it takes to come back.</p><div class="btns"><button class="btn ghost sm" data-act="bc-control">Time a command</button></div>`)}`,
  };
};

// ----- Displays and windows -----
Actions["bc-displays"] = async () => {
  if (!("getScreenDetails" in window)) return bcSet("displays", false, "This browser can't list displays. Use Chrome or Edge.");
  try {
    const d = await window.getScreenDetails();
    bcheck.screens = d.screens.map((s) => ({ label: s.label, width: s.width, height: s.height, left: s.availLeft ?? s.left, top: s.availTop ?? s.top, isPrimary: s.isPrimary }));
    bcSet("displays", bcheck.screens.length > 1 ? true : null, bcheck.screens.length > 1 ? `${plural(bcheck.screens.length, "display")} found.` : "Only one display is connected. Plug in the projector or TVs and try again.");
  } catch (e) { bcSet("displays", false, `Permission to manage windows was refused (${e.name}). Allow it under the site settings (the icon left of the address), then try again.`); }
};
Actions["bc-place"] = () => {
  const tryFs = $("#bc-fs")?.checked;
  Actions["bc-close"]();
  bcheck.wins = bcheck.screens.map((s, i) => window.open(`${location.pathname}#boothwin-${i + 1}`, `bc-win-${i}`, `popup,left=${s.left},top=${s.top},width=${s.width},height=${s.height}${tryFs ? ",fullscreen" : ""}`));
  const opened = bcheck.wins.filter(Boolean).length;
  if (!opened) return bcSet("place", false, "The browser blocked the windows. Allow pop-ups for this site, then try again.");
  setTimeout(() => {
    const placed = bcheck.wins.map((w, i) => { try { const s = bcheck.screens.at(i); return w && !w.closed && Math.abs(w.screenX - s.left) < 40 && Math.abs(w.screenY - s.top) < 80; } catch { return false; } });
    const ok = placed.filter(Boolean).length;
    bcheck.results.place = { ok: ok === bcheck.screens.length, text: `${ok} of ${plural(bcheck.screens.length, "window")} landed on the right display.`, at: new Date().toISOString() };
    if (tryFs) {
      const full = bcheck.wins.filter((w) => { try { return !!w?.document?.fullscreenElement || (w && w.innerWidth >= w.screen.width - 2 && w.innerHeight >= w.screen.height - 2); } catch { return false; } }).length;
      bcheck.results.fullscreen = { ok: full === opened, text: full === opened ? "Windows opened full screen in one step." : `${full} of ${opened} opened full screen. Booth mode will show a Full screen button in each window instead.`, at: new Date().toISOString() };
    }
    render();
  }, 1500);
};
Actions["bc-close"] = () => { bcheck.wins.forEach((w) => { try { w?.close(); } catch { /* already closed */ } }); bcheck.wins = []; };
Screens.boothwin = (tail) => ({
  present: true,
  page: html`<div class="bc-window"><b>Display ${tail}</b><p>If this fills the screen, it worked.</p><button class="btn" data-act="bc-window-full">Full screen</button></div>`,
});
Actions["bc-window-full"] = async () => { try { await document.documentElement.requestFullscreen(); } catch { toast("Full screen isn't available here"); } };

// ----- OBS: obs-websocket version 5 (Hello, Identify with the password, then a request) -----
const sha256b64 = async (s) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))));
Forms["bc-obs"] = (d) => {
  localStorage.setItem("bc-obs-host", d.host); localStorage.setItem("bc-obs-port", d.port);
  let ws, done = false;
  const finish = (ok, text) => { if (done) return; done = true; try { ws?.close(); } catch { /* closed */ } bcSet("obs", ok, text); };
  try { ws = new WebSocket(`ws://${d.host}:${d.port}`); } catch (e) { return finish(false, `Couldn't start a connection: ${e.message}`); }
  const timer = setTimeout(() => finish(false, "No answer from OBS. Is it open, with its WebSocket server turned on (Tools, WebSocket Server Settings)? If Chrome asked about your local network, choose Allow."), 6000);
  ws.onerror = () => { clearTimeout(timer); finish(false, "Couldn't reach OBS. Check it's open with the WebSocket server on, and that local network access is allowed for this site."); };
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.op === 0) {
      const id = { rpcVersion: 1 };
      if (m.d.authentication) { if (!d.password) { clearTimeout(timer); return finish(false, "OBS wants a password. Enter it and try again."); } id.authentication = await sha256b64(await sha256b64(d.password + m.d.authentication.salt) + m.d.authentication.challenge); }
      ws.send(JSON.stringify({ op: 1, d: id }));
    } else if (m.op === 2) ws.send(JSON.stringify({ op: 6, d: { requestType: "GetSceneList", requestId: "scenes" } }));
    else if (m.op === 7 && m.d.requestId === "scenes") {
      clearTimeout(timer);
      const scenes = (m.d.responseData?.scenes || []).map((s) => s.sceneName);
      finish(true, `Connected. ${plural(scenes.length, "scene")}${scenes.length ? `: ${scenes.slice(0, 8).join(", ")}` : ""}.`);
    }
  };
  ws.onclose = (e) => { clearTimeout(timer); if (!done) finish(false, e.code === 4009 ? "OBS refused the password." : `OBS closed the connection (code ${e.code}).`); };
};

// ----- Companion: any answer from its web server means the booth can reach it -----
Forms["bc-companion"] = async (d) => {
  localStorage.setItem("bc-comp-host", d.host); localStorage.setItem("bc-comp-port", d.port);
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try { await fetch(`http://${d.host}:${d.port}/`, { mode: "no-cors", signal: ctl.signal }); bcSet("companion", true, `Reached Companion at ${d.host}:${d.port}.`); }
  catch (e) { bcSet("companion", false, e.name === "AbortError" ? "No answer. Is Companion running, and is this its address and port?" : "Couldn't reach Companion. Check it's running, and that local network access is allowed for this site."); }
  finally { clearTimeout(t); }
};

// ----- MIDI and USB DMX -----
Actions["bc-midi"] = async () => {
  if (!("requestMIDIAccess" in navigator)) return bcSet("midi", false, "This browser has no Web MIDI. Use Chrome or Edge.");
  try {
    const m = await navigator.requestMIDIAccess({ sysex: false });
    const ins = [...m.inputs.values()].map((p) => p.name), outs = [...m.outputs.values()].map((p) => p.name);
    m.inputs.forEach((p) => { p.onmidimessage = (e) => { bcheck.midi = `${p.name}: ${[...e.data].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`; render(); }; });
    bcSet("midi", ins.length || outs.length ? true : null, `${ins.length ? `In: ${ins.join(", ")}.` : "No MIDI inputs."} ${outs.length ? `Out: ${outs.join(", ")}.` : "No MIDI outputs."} ${ins.length ? "Press a pedal or key to see its message." : "Plug in a pedal, or set up a virtual port (loopMIDI on Windows, IAC on Mac), and try again."}`);
  } catch (e) { bcSet("midi", false, `MIDI access was refused (${e.name}).`); }
};
Actions["bc-serial"] = async () => {
  try {
    const port = await navigator.serial.requestPort();
    const { usbVendorId: v, usbProductId: p } = port.getInfo();
    const known = { 0x0403: "an FTDI chip, as in the Enttec DMX USB Pro and many compatible interfaces", 0x16c0: "a DMXking interface" }[v];
    bcSet("serial", known ? true : null, `Found a USB serial device${v ? ` (vendor ${v.toString(16).padStart(4, "0")}, product ${(p || 0).toString(16).padStart(4, "0")})` : ""}${known ? `: ${known}` : ""}. Lighting is planned for phase 3; this confirms the browser can reach it.`);
  } catch (e) { bcSet("serial", e.name === "NotFoundError" ? null : false, e.name === "NotFoundError" ? "No device was chosen." : `Couldn't open the device (${e.name}).`); }
};

// ----- A test command over the private control channel, timed there and back -----
Actions["bc-control"] = () => {
  if (!Backend.on || !Backend.ready) return bcSet("control", null, "This copy of the app isn't connected to the server (demo, training or preview), so there's nothing to time.");
  const topic = `control:${S.state.current}`, id = uid(), started = performance.now();
  let done = false;
  // The client keeps one channel per topic, so set aside the app's own control channel while this one hears itself.
  const own = Backend.chans[topic]; if (own) { delete Backend.chans[topic]; try { Backend.client.removeChannel(own); } catch { /* gone */ } }
  const ch = Backend.client.channel(topic, { config: { private: true, broadcast: { self: true, ack: true } } });
  const finish = (ok, text) => { if (done) return; done = true; try { Backend.client.removeChannel(ch); } catch { /* gone */ } if (Backend.ctlHeard) Backend.ctlChan(); bcSet("control", ok, text); };
  const timer = setTimeout(() => finish(false, "No answer in 8 seconds. The server's private channel rules may not be installed yet (upgrade-28.sql)."), 8000);
  ch.on("broadcast", { event: "check" }, ({ payload }) => { if (payload?.id !== id) return; clearTimeout(timer); const ms = Math.round(performance.now() - started); finish(ms < 600, `A command came back in ${ms} ms${ms < 600 ? "." : ", slower than the 600 ms Booth mode aims for. Check this computer's connection."}`); });
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") ch.send({ type: "broadcast", event: "check", payload: { id } });
    else if (status === "CHANNEL_ERROR") { clearTimeout(timer); finish(false, "The server refused the private control channel. Run upgrade-28.sql, and check this account can present."); }
  });
};

Actions["bc-copy"] = () => {
  const lines = [`Booth check, ${new Date().toLocaleString()}`, `Browser: ${navigator.userAgent}`, `Displays: ${bcheck.screens.map((s) => `${s.label || "?"} ${s.width}x${s.height}@${s.left},${s.top}`).join("; ") || "not checked"}`,
    ...BC_ITEMS.map(([k, label]) => { const r = bcheck.results[k]; return `${label}: ${!r ? "not checked" : r.ok === true ? "works" : r.ok === false ? "PROBLEM" : "note"}${r ? ` - ${r.text}` : ""}`; })];
  copyText(lines.join("\n"), "Results copied");
};
