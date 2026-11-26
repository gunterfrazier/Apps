// ---------- OBS on the booth computer ----------
// A lasting connection to OBS Studio's WebSocket server (obs-websocket 5, built into OBS 28 and later) for the Booth
// view: see and switch scenes, start and stop the stream and the recording. It stays connected while the app is open,
// and tries again every few seconds if OBS closes or restarts. The address (and the password, if the operator asks)
// is kept on this computer only.
// Booth commands can drive it too: { do: "scene", name }, { do: "stream", on }, { do: "record", on }.

const OBS_KEY = "ofc-obs";
const Obs = {
  ws: null, state: "off", error: "", scenes: [], scene: "", streaming: false, recording: false,
  wanted: false, retry: null, pending: {}, n: 0,
  cfg() { try { return { host: "127.0.0.1", port: "4455", ...JSON.parse(localStorage.getItem(OBS_KEY) || "{}") }; } catch { return { host: "127.0.0.1", port: "4455" }; } },
  saveCfg(c) { try { localStorage.setItem(OBS_KEY, JSON.stringify(c)); } catch { /* private mode */ } },
  get on() { return this.state === "on"; },

  connect(password = this.cfg().password || "") {
    const { host, port } = this.cfg();
    this.wanted = true; clearTimeout(this.retry);
    try { this.ws?.close(); } catch { /* closed */ }
    this.state = "connecting"; this.error = ""; this.changed();
    let ws;
    try { ws = this.ws = new WebSocket(`ws://${host}:${port}`); } catch (e) { return this.fail(`Couldn't start a connection: ${e.message}`); }
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.op === 0) {   // Hello: identify, with the password if OBS asks for one
        const id = { rpcVersion: 1, eventSubscriptions: 1 | 4 | 64 };   // general, scenes, outputs
        if (m.d.authentication) {
          if (!password) { this.wanted = false; return this.fail("OBS wants its WebSocket password."); }
          id.authentication = await sha256b64(await sha256b64(password + m.d.authentication.salt) + m.d.authentication.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d: id }));
      } else if (m.op === 2) { this.state = "on"; this.lastPassword = password; this.refresh(); }
      else if (m.op === 5) this.event(m.d.eventType, m.d.eventData || {});
      else if (m.op === 7) { const p = this.pending[m.d.requestId]; delete this.pending[m.d.requestId]; if (p) m.d.requestStatus?.result ? p.ok(m.d.responseData || {}) : p.no(new Error(m.d.requestStatus?.comment || "OBS said no")); }
    };
    ws.onerror = () => { if (this.ws === ws) this.error = "Couldn't reach OBS. Is it open, with Tools, WebSocket Server Settings, Enable WebSocket server turned on?"; };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      Object.values(this.pending).forEach((p) => p.no(new Error("OBS disconnected"))); this.pending = {};
      if (e.code === 4009) { this.wanted = false; return this.fail("OBS refused the password."); }
      this.state = this.wanted ? "connecting" : "off"; if (this.wanted && !this.error) this.error = "OBS isn't answering. Trying again…";
      this.changed();
      if (this.wanted) this.retry = setTimeout(() => this.connect(password), 5000);
    };
  },
  disconnect() { this.wanted = false; clearTimeout(this.retry); this.state = "off"; this.error = ""; try { this.ws?.close(); } catch { /* closed */ } this.ws = null; this.changed(); },
  fail(msg) { this.state = "error"; this.error = msg; this.changed(); },

  request(requestType, requestData) {
    if (!this.on) return Promise.reject(new Error("OBS isn't connected"));
    const requestId = `r${++this.n}`;
    return new Promise((ok, no) => {
      this.pending[requestId] = { ok, no };
      this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, ...(requestData ? { requestData } : {}) } }));
      setTimeout(() => { if (this.pending[requestId]) { delete this.pending[requestId]; no(new Error("OBS didn't answer")); } }, 5000);
    });
  },
  async refresh() {
    try {
      const [list, stream, rec] = await Promise.all([this.request("GetSceneList"), this.request("GetStreamStatus"), this.request("GetRecordStatus")]);
      this.setScenes(list.scenes); this.scene = list.currentProgramSceneName || "";
      this.streaming = !!stream.outputActive; this.recording = !!rec.outputActive; this.error = "";
    } catch (e) { this.error = e.message; }
    this.changed();
  },
  // OBS lists scenes bottom first; show them in the order the operator sees in OBS.
  setScenes(scenes = []) { this.scenes = [...scenes].sort((a, b) => b.sceneIndex - a.sceneIndex).map((s) => s.sceneName); },
  event(type, d) {
    if (type === "CurrentProgramSceneChanged") this.scene = d.sceneName;
    else if (type === "SceneListChanged") this.setScenes(d.scenes);
    else if (type === "StreamStateChanged") this.streaming = !!d.outputActive;
    else if (type === "RecordStateChanged") this.recording = !!d.outputActive;
    else return;
    this.changed();
  },
  setScene(name) { return this.request("SetCurrentProgramScene", { sceneName: name }); },
  setStream(on) { return this.request(on ? "StartStream" : "StopStream"); },
  setRecord(on) { return this.request(on ? "StartRecord" : "StopRecord"); },
  changed() {
    const line = $("#scrim .obs-sheet-state");   // the settings sheet: update its status line in place
    if (line) { line.className = `obs-sheet-state ${this.state}`; line.textContent = obsStatusText(); }
    if (!/^#(present-|booth)/.test(location.hash) || line) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#app")) return;   // don't redraw under someone typing
    render();
  },
};
const obsStatusText = () => Obs.on ? `Connected. ${plural(Obs.scenes.length, "scene")}.` : Obs.state === "connecting" ? (Obs.error || "Connecting…") : Obs.error || "Not connected.";
/** Connect by itself in the Booth view when this computer was set to. */
function obsAuto() { const c = Obs.cfg(); if (c.auto && Obs.state === "off" && !Obs.wanted) Obs.connect(); }

/** The OBS strip in the Booth view. */
function obsStrip() {
  const c = Obs.cfg();
  if (!c.auto && Obs.state === "off" && !Obs.error) return "";
  return html`<div class="obs-strip" role="group" aria-label="OBS">
    <span class="obs-state ${Obs.state}"><b>OBS</b> ${Obs.on ? "connected" : Obs.state === "connecting" ? "connecting…" : Obs.error ? "not connected" : "off"}</span>
    ${Obs.on ? html`<span class="obs-scenes">${Obs.scenes.map((s) => html`<button type="button" class="chip ${s === Obs.scene ? "on" : ""}" data-act="obs-scene" data-name="${s}" aria-pressed="${s === Obs.scene}">${s}</button>`)}</span>
      <button type="button" class="btn ghost sm ${Obs.streaming ? "obs-live" : ""}" data-act="obs-stream" aria-pressed="${Obs.streaming}">${icon("live")}${Obs.streaming ? "Streaming" : "Start stream"}</button>
      <button type="button" class="btn ghost sm ${Obs.recording ? "obs-live" : ""}" data-act="obs-record" aria-pressed="${Obs.recording}">${icon("rec")}${Obs.recording ? "Recording" : "Record"}</button>`
    : Obs.error ? html`<span class="faint">${Obs.error}</span>` : ""}
    <button type="button" class="linkish" data-act="obs-setup">Settings</button></div>`;
}

Actions["obs-setup"] = () => {
  const c = Obs.cfg();
  openSheet("OBS on this computer", html`<form data-form="obs-setup" novalidate>
    <p class="muted" style="margin-top:0">In OBS, open <b>Tools, WebSocket Server Settings</b>, turn on <b>Enable WebSocket server</b>, and copy the port and password here. OBS 28 or later has this built in.</p>
    <p class="obs-sheet-state ${Obs.state}" role="status">${obsStatusText()}</p>
    <div class="bc-grid three"><label class="field"><span>Address</span><input name="host" value="${c.host}" autocomplete="off"></label><label class="field"><span>Port</span><input name="port" inputmode="numeric" value="${c.port}"></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="off" placeholder="${c.password ? "Saved" : ""}"></label></div>
    <label class="check"><input type="checkbox" name="remember" ${attr(!!c.password, "checked")}><span>Remember the password on this computer</span></label>
    <label class="check"><input type="checkbox" name="auto" ${attr(!!c.auto, "checked")}><span>Connect by itself when the Booth view opens</span></label>
    <small class="faint">OBS on this computer is 127.0.0.1. For OBS on another computer, use its address; Chrome asks once to allow local network access.</small>
    <div class="btns"><button class="btn">${Obs.on ? "Reconnect" : "Connect"}</button><button type="button" class="btn ghost" data-act="obs-done">Done</button>${Obs.state !== "off" ? html`<button type="button" class="btn ghost" data-act="obs-off">Disconnect</button>` : ""}</div></form>`);
};
Forms["obs-setup"] = (d) => {
  const old = Obs.cfg(), password = d.password || old.password || Obs.lastPassword || "";
  Obs.saveCfg({ host: d.host.trim() || "127.0.0.1", port: String(+d.port || 4455), auto: !!d.auto, ...(d.remember && password ? { password } : {}) });
  Obs.connect(password);
};
Actions["obs-off"] = () => { Obs.disconnect(); closeSheet(true); render(); };
Actions["obs-done"] = () => { closeSheet(true); render(); };
const obsSays = (e) => toast(`OBS: ${e.message}`);
Actions["obs-scene"] = (el) => Obs.setScene(el.dataset.name).catch(obsSays);
Actions["obs-record"] = () => Obs.setRecord(!Obs.recording).catch(obsSays);
Actions["obs-stream"] = () => {
  if (!Obs.streaming) return Obs.setStream(true).catch(obsSays);
  openSheet("Stop the stream?", html`<p>Viewers watching online will see the stream end.</p>
    <div class="btns"><button class="btn danger" data-act="obs-stream-stop">Stop the stream</button><button class="btn ghost" data-act="close-sheet">Keep streaming</button></div>`);
};
Actions["obs-stream-stop"] = () => { closeSheet(true); Obs.setStream(false).catch(obsSays); };
