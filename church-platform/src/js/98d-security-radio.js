// ---------- Security Command live radio and messages ----------
function radioTone(audio, type, at = audio?.currentTime || 0) {
  if (audio?.state !== "running") return;
  const notes = { start: [980, 1320], end: [660], busy: [390, 330], message: [880, 1175] }[type] || [];
  notes.forEach((frequency, i) => {
    const oscillator = audio.createOscillator(), gain = audio.createGain(), time = at + i * .07;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(.065, time);
    gain.gain.exponentialRampToValueAtTime(.001, time + .06);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(time);
    oscillator.stop(time + .065);
  });
}

const SecurityRadio = {
  key: "", channel: null, connected: false, enabled: false, audio: null, module: null,
  target: "", people: [], rosterAt: 0, rosterRequest: null,
  tx: null, rx: null, rxTimer: 0, nextAudio: 0, sounds: new Set(),
  dock: null, connectionText: "", notice: "",
  allowed() {
    const hosted = Backend.on || Backend.configured();
    return !Backend.failed && S.on("safety") && isSecurityMember() &&
      (!hosted || Backend.ready && Backend.user?.id === S.me().id) && !thisDevice();
  },
  async rpc(method, args, timeout = 0) {
    const query = Backend.client.rpc(method, args);
    if (timeout && typeof AbortSignal.timeout === "function") query.abortSignal(AbortSignal.timeout(timeout));
    const { data, error } = await query;
    if (error) throw Error(error.message);
    return data;
  },
  sync(head) {
    const key = this.allowed() ? `${S.state.current}:${S.me().id}` : "";
    if (key !== this.key) {
      if ($('#foreground-alert [data-radio]:not([hidden])')) ForegroundAlerts.hide();
      this.disconnect();
      this.key = key;
      if (key) this.connect(S.state.current, S.me().id);
    }
    if (key) this.ensureDock();
    const visible = !!key && !["display", "stage", "overlay", "station", "pair", "setup"].includes(head) && !document.body.matches(".presenting, .kiosk-mode") &&
      !document.documentElement.classList.contains("overlay-page");
    if (this.dock) this.dock.hidden = !visible;
    if (!visible) {
      this.release(true);
      this.stopPlayback();
      if ($('#foreground-alert [data-radio]:not([hidden])')) ForegroundAlerts.hide();
    }
    document.body.classList.toggle("has-security-radio", visible);
    this.paint();
  },
  connect(c, user) {
    const key = this.key;
    if (Backend.on) {
      this.channel = Backend.client.channel(`security-radio:${c}:${user}`, { config: { private: true } })
        .on("broadcast", { event: "radio" }, ({ payload }) => {
          if (this.key === key) this.receive(payload);
        }).subscribe((status) => {
          if (this.key !== key) return;
          this.connected = status === "SUBSCRIBED";
          this.connectionText = this.connected ? "" : "Radio offline";
          if (!this.connected) this.release(true);
          this.paint();
        });
    } else if (typeof BroadcastChannel === "function") {
      this.channel = new BroadcastChannel("our-faithful-security-radio-demo");
      this.channel.onmessage = ({ data }) => {
        if (this.key === key && data?.c === c && data.by !== user && (!data.target || data.target === user) &&
          isSecurityMember(data.by, c)) this.receive(data);
      };
      this.connected = true;
    }
    this.refreshRoster();
  },
  disconnect() {
    this.release(true);
    const channel = this.channel;
    this.channel = null;
    if (channel?.close) channel.close();
    else if (channel) Backend.client?.removeChannel(channel).catch(() => {});
    this.connected = false;
    this.enabled = false;
    this.module = null;
    this.audio?.close().catch(() => {});
    this.audio = null;
    this.stopPlayback();
    this.target = ""; this.people = []; this.rosterAt = 0; this.rosterRequest = null;
    this.connectionText = ""; this.notice = "";
  },
  async refreshRoster(force = false) {
    if (!this.allowed()) return [];
    if (!force && Date.now() - this.rosterAt < 15000) return this.people;
    if (this.rosterRequest) return this.rosterRequest;
    const c = S.state.current, me = S.me().id, key = this.key;
    const request = (async () => {
      try {
        const people = Backend.on ? await this.rpc("security_radio_roster", { c })
          : S.members(c).filter((m) => isSecurityMember(m.userId, c)).map((m) => ({ id: m.userId, name: S.userName(m.userId) }));
        if (this.key !== key || !this.allowed()) return [];
        this.people = people.filter((person) => person.id !== me);
        this.rosterAt = Date.now();
        this.paint();
        return this.people;
      } catch { return this.people; }
    })();
    this.rosterRequest = request;
    request.finally(() => { if (this.rosterRequest === request) this.rosterRequest = null; });
    return request;
  },
  async enable() {
    if (!this.allowed()) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return toast("Live audio is unavailable on this device.");
    const key = this.key;
    try {
      if (!this.audio) {
        const audio = this.audio = new Context();
        audio.onstatechange = () => {
          if (this.audio !== audio || audio.state === "running") return;
          this.enabled = false;
          this.release(true);
          this.stopPlayback();
          this.paint();
        };
      }
      const audio = this.audio;
      await audio.resume();
      if (key !== this.key || audio !== this.audio) return;
      this.enabled = audio.state === "running";
      this.notice = "";
      if (audio.audioWorklet) this.module ||= audio.audioWorklet.addModule("./security-radio-processor.js").then(() => true, () => false);
      this.paint();
    } catch { toast("Tap Enable radio again to allow audio."); }
  },
  ensureDock() {
    if (this.dock) return;
    const node = document.createElement("aside");
    node.id = "security-radio-dock";
    node.setAttribute("aria-label", "Security radio");
    node.innerHTML = flat(html`<div class="radio-dock-top">
      <span class="radio-state" role="status" aria-live="polite"></span>
      <button type="button" class="btn ghost sm" data-act="radio-compose">Message</button>
    </div><div class="radio-dock-controls">
      <select aria-label="Radio recipient" data-change="radio-target"><option value="">All security</option></select>
      <button type="button" class="btn sm" data-act="radio-enable">Enable radio</button>
      <button type="button" class="btn sm radio-hold" aria-label="Hold to talk" hidden>Hold to talk</button>
    </div>`);
    document.body.append(node);
    this.dock = node;
    const ptt = $(".radio-hold", node);
    ptt.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      event.preventDefault();
      ptt.setPointerCapture(event.pointerId);
      this.press();
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) ptt.addEventListener(type, () => this.release());
    ptt.addEventListener("contextmenu", (event) => event.preventDefault());
    ptt.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (!event.repeat) this.press();
    });
    ptt.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") { event.preventDefault(); this.release(); }
    });
    ptt.addEventListener("blur", () => this.release());
    $("select", node).addEventListener("focus", () => this.refreshRoster());
  },
  paint() {
    if (!this.dock || this.dock.hidden) return;
    const state = this.tx?.held ? this.tx.id ? "You’re broadcasting" : "Connecting microphone…" :
      this.rx ? `${this.rx.name} is broadcasting${this.rx.direct ? " to you" : ""}` :
      this.notice || this.connectionText || (this.enabled ? "Radio ready" : "Security radio · Enable audio");
    const label = $(".radio-state", this.dock);
    if (label.textContent !== state) label.textContent = state;
    this.dock.dataset.transmitting = String(!!this.tx?.held && !!this.tx.id);
    const ptt = $(".radio-hold", this.dock);
    ptt.hidden = !this.enabled;
    ptt.setAttribute("aria-pressed", String(!!this.tx?.held));
    $('[data-act="radio-enable"]', this.dock).hidden = this.enabled;
    const select = $("select", this.dock);
    const person = this.people.find((person) => person.id === this.target);
    const unavailable = this.target && !person ? this.target : "";
    const options = JSON.stringify([this.people, unavailable]);
    if (select.dataset.options !== options) {
      select.dataset.options = options;
      select.innerHTML = flat(html`${radioTargetOptions(this.people)}
        ${unavailable ? html`<option value="${unavailable}" disabled>Recipient unavailable</option>` : ""}`);
    }
    select.value = this.target;
    select.disabled = !!this.tx;
    const feedRecipient = $("#security-message-recipient");
    if (feedRecipient) feedRecipient.textContent = person?.name || (unavailable ? "Recipient unavailable" : "All security");
  },
  async press() {
    if (!this.allowed() || this.tx || !this.enabled) return;
    if (!this.connected) return this.report("Radio offline. Try again when connected.");
    if (this.target && !this.people.some((person) => person.id === this.target)) return this.report("Choose an available radio recipient.");
    if (this.rx) return this.report("Radio busy. Wait for the speaker to finish.", true);
    if (!navigator.mediaDevices?.getUserMedia || !this.module) return this.report("Live microphone access is unavailable. You can still send messages.");
    const tx = { key: this.key, c: S.state.current, by: S.me().id, name: S.me().name,
      live: Backend.on, target: this.target, held: true, queue: [], seq: 0 };
    this.tx = tx;
    this.notice = "";
    this.paint();
    try {
      if (!await this.module) throw Error("Live microphone access is unavailable.");
      if (!tx.held) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!tx.held || tx.key !== this.key) { stream.getTracks().forEach((track) => track.stop()); return; }
      tx.stream = stream;
      tx.channel = this.channel;
      const id = tx.live ? (await this.rpc("security_radio_start", { c: tx.c, target: tx.target || null }, 3000)).id : uid();
      if (!tx.held || tx.key !== this.key) {
        if (tx.live) this.rpc("security_radio_frame", { c: tx.c, transmission_id: id, seq: null, encoded: null }, 1800).catch(() => {});
        return;
      }
      tx.id = id;
      const audio = this.audio;
      tx.source = audio.createMediaStreamSource(stream);
      tx.node = new AudioWorkletNode(audio, "security-radio");
      tx.silent = audio.createGain();
      tx.silent.gain.value = 0;
      tx.source.connect(tx.node).connect(tx.silent).connect(audio.destination);
      tx.node.port.onmessage = ({ data }) => {
        if (data.audio?.length && !tx.drop && !tx.closed) this.enqueue(tx, data.audio);
        if (data.final) this.finishCapture(tx);
      };
      tx.timer = setTimeout(() => { this.release(); this.report("30-second radio limit. Hold again to continue."); }, 28500);
      radioTone(audio, "start");
      this.paint();
    } catch (error) {
      if (tx.held && this.tx === tx) {
        this.report(error.name === "NotAllowedError" ? "Allow microphone access to talk." : error.message, true);
        this.release(true);
      }
    }
  },
  release(drop = false) {
    const tx = this.tx;
    if (!tx) return;
    tx.drop ||= drop;
    tx.held = false;
    clearTimeout(tx.timer);
    tx.stream?.getTracks().forEach((track) => track.stop());
    tx.stream = null;
    if (tx.drop) tx.queue.length = 0;
    if (tx.node && !tx.closed && !tx.drop) {
      tx.node.port.postMessage("flush");
      tx.flushTimer ||= setTimeout(() => this.finishCapture(tx), 180);
    } else this.finishCapture(tx);
    this.paint();
  },
  finishCapture(tx) {
    if (tx.closed) return;
    tx.closed = true;
    clearTimeout(tx.flushTimer);
    tx.source?.disconnect();
    tx.node?.disconnect();
    tx.node?.port.close();
    tx.silent?.disconnect();
    if (tx.id && !tx.drop) radioTone(this.audio, "end");
    this.pump(tx);
  },
  enqueue(tx, bytes) {
    // Keep speech current on a slow connection instead of replaying a backlog after release.
    if (tx.queue.length >= 3) tx.queue.shift();
    const encoded = btoa(String.fromCharCode(...bytes));
    tx.queue.push({ seq: tx.seq++, encoded });
    this.pump(tx);
  },
  async frame(tx, seq, encoded) {
    if (tx.live) {
      await this.rpc("security_radio_frame", { c: tx.c, transmission_id: tx.id, seq, encoded }, 1800);
    } else if (tx.channel && tx.key === this.key) {
      tx.channel.postMessage({ c: tx.c, by: tx.by, name: tx.name, id: tx.id, direct: !!tx.target,
        target: tx.target, seq, audio: encoded, ended: encoded === null });
    }
  },
  async pump(tx) {
    if (tx.sending || tx.done) return;
    tx.sending = true;
    try {
      while (tx.queue.length && tx.key === this.key && !tx.drop) {
        const { seq, encoded } = tx.queue.shift();
        await this.frame(tx, seq, encoded);
      }
    } catch (error) {
      if (this.tx === tx) {
        this.report(error.message || "Transmission interrupted.", true);
        this.release(true);
      }
    } finally {
      if (tx.closed) {
        tx.done = true;
        if (tx.id) await this.frame(tx, null, null).catch(() => {});
        if (this.tx === tx) { this.tx = null; this.paint(); }
      }
      tx.sending = false;
    }
  },
  receive(packet) {
    if (document.hidden || this.dock?.hidden || !this.allowed() || !packet?.id || packet.by === S.me().id) return;
    if (packet.ended) {
      if (packet.id === this.rx?.id) this.endIncoming();
      return;
    }
    if (typeof packet.audio !== "string" || packet.audio.length > 2136 || !Number.isInteger(packet.seq)) return;
    const started = this.rx?.id !== packet.id;
    if (!started && packet.seq <= this.rx.seq) return;
    this.rx = { ...packet, audio: undefined };
    clearTimeout(this.rxTimer);
    this.rxTimer = setTimeout(() => this.endIncoming(), 1400);
    if (this.enabled && this.audio?.state === "running" && !this.tx?.id) this.playFrame(packet.audio, started);
    this.paint();
  },
  playFrame(encoded, started) {
    const audio = this.audio;
    let bytes;
    try { bytes = atob(encoded); } catch { return; }
    if (!bytes.length || bytes.length > 1600) return;
    const now = audio.currentTime;
    if (this.nextAudio > now + .7) return;
    if (started) { radioTone(audio, "start", Math.max(now, this.nextAudio)); this.nextAudio = Math.max(now, this.nextAudio) + .15; }
    const buffer = audio.createBuffer(1, bytes.length, 8000), samples = buffer.getChannelData(0);
    for (let i = 0; i < bytes.length; i++) {
      const value = bytes.charCodeAt(i) / 127.5 - 1;
      samples[i] = Math.sign(value) * (Math.pow(256, Math.abs(value)) - 1) / 255;
    }
    const sound = audio.createBufferSource();
    sound.buffer = buffer;
    sound.connect(audio.destination);
    sound.onended = () => { sound.disconnect(); this.sounds.delete(sound); };
    this.sounds.add(sound);
    const start = Math.max(now + .045, this.nextAudio);
    sound.start(start);
    this.nextAudio = start + buffer.duration;
  },
  endIncoming(tone = true) {
    if (tone && this.rx && this.enabled && this.audio) {
      const at = Math.max(this.audio.currentTime, this.nextAudio);
      radioTone(this.audio, "end", at);
      this.nextAudio = at + .065;
    }
    clearTimeout(this.rxTimer);
    this.rx = null;
    this.paint();
  },
  stopPlayback() {
    this.endIncoming(false);
    this.nextAudio = 0;
    for (const sound of this.sounds) { try { sound.stop(); } catch {} }
    this.sounds.clear();
  },
  report(message, busy = false) {
    this.notice = message;
    if (busy) radioTone(this.audio, "busy");
    this.paint();
    toast(message);
  },
};

const radioTargetOptions = (people) => html`<option value="">All security</option>${people.map((person) => html`<option value="${person.id}">${person.name}</option>`)}`;
Inputs["radio-target"] = (el) => { SecurityRadio.target = el.value; SecurityRadio.notice = ""; SecurityRadio.paint(); };
Actions["radio-enable"] = () => SecurityRadio.enable();
window.addEventListener("blur", () => SecurityRadio.release());
window.addEventListener("hashchange", () => SecurityRadio.release());
window.addEventListener("pagehide", () => SecurityRadio.release(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { SecurityRadio.release(true); SecurityRadio.stopPlayback(); }
});

function canReadRadioMessage(message) {
  return !!message && SecurityRadio.allowed() && message.churchId === S.state.current &&
    (!message.recipientId || message.recipientId === S.me().id || message.by === S.me().id);
}

async function sendRadioMessage(form, body, target, replyTo = null) {
  if (!SecurityRadio.allowed() || form.dataset.sending) return false;
  const c = S.state.current, by = S.me().id, key = SecurityRadio.key;
  if (!body.text && !body.voiceUrl && !body.mediaUrl) return false;
  if (body.text?.length > 800) { formError(form, "Keep messages to 800 characters."); return false; }
  if ((body.voiceUrl?.length || 0) + (body.mediaUrl?.length || 0) > 4000000) {
    formError(form, "Use an attachment smaller than 3 MB.");
    return false;
  }
  const signature = JSON.stringify([target, body, replyTo]);
  if (form.radioSignature !== signature) { form.radioSignature = signature; form.radioMessageId = uid(); }
  const id = form.radioMessageId, submit = $("[type=submit]", form);
  form.dataset.sending = "true";
  if (submit) submit.disabled = true;
  try {
    let message;
    if (Backend.on) message = await SecurityRadio.rpc("security_radio_message", { c, message_id: id, target: target || null, body, reply_to: replyTo });
    else {
      const recipients = S.members(c).map((m) => m.userId).filter((u) => u !== by && isSecurityMember(u, c) && (!target || u === target));
      if (target && !recipients.length) throw Error("Choose an assigned security team member.");
      message = { ...body, id, by, senderName: S.me().name, recipientId: target || null, replyTo, at: new Date().toISOString() };
      for (const user of recipients) notify(user, { kind: "security-radio", title: `Security message · ${message.senderName}`,
        body: body.text?.slice(0, 140) || "Sent an attachment", link: `#security-message-${id}`, radioMessageId: id, senderId: by });
    }
    if (S.state.current !== c || S.me().id !== by || SecurityRadio.key !== key) return false;
    if (!S.get("securityRadioMessages", id)) S.add("securityRadioMessages", message);
    if (!Backend.on) { S.flush(); broadcastSafetyUpdate(); }
    return true;
  } catch (error) {
    if (form.isConnected) formError(form, error.message || "Could not send the message.");
    else toast(error.message || "Could not send the message.");
    return false;
  } finally {
    delete form.dataset.sending;
    if (submit) submit.disabled = false;
  }
}

async function openRadioComposer({ target = SecurityRadio.target, replyTo = "" } = {}) {
  if (!SecurityRadio.allowed()) return;
  const scope = `${SecurityRadio.key}:${location.hash}`;
  const people = await SecurityRadio.refreshRoster(true);
  if (!SecurityRadio.allowed() || `${SecurityRadio.key}:${location.hash}` !== scope) return;
  const person = people.find((item) => item.id === target);
  if (target && !person) return toast(replyTo ? "The sender no longer has Security Command access." : "Choose an available radio recipient.");
  openSheet(replyTo ? "Reply to security message" : "Security message", html`<form data-form="radio-compose">
    <input type="hidden" name="replyTo" value="${replyTo}">
    ${replyTo ? html`<input type="hidden" name="target" value="${person.id}"><p>To ${person.name}</p>`
      : html`<label class="field"><span>Send to</span><select name="target">${radioTargetOptions(people)}</select></label>`}
    <label class="field"><span>Message</span><textarea name="text" required maxlength="800" rows="4"></textarea></label>
    <button class="btn" type="submit">Send message</button>
  </form>`, { focus: "textarea" });
  if (!replyTo) $("#scrim select").value = person?.id || "";
}

Actions["radio-compose"] = () => openRadioComposer();
Actions["radio-reply"] = (el) => {
  const message = S.get("securityRadioMessages", el.dataset.id);
  if (canReadRadioMessage(message) && message.by !== S.me().id) openRadioComposer({ target: message.by, replyTo: message.id });
};
Actions["radio-notice-reply"] = (el) => {
  const notice = myNotifications().find((n) => n.id === el.dataset.id && n.kind === "security-radio");
  if (!notice || !SecurityRadio.allowed()) return;
  ForegroundAlerts.hide();
  if (Player.dialogue?.open) Player.minimize(false);
  openRadioComposer({ target: notice.senderId, replyTo: notice.radioMessageId });
};
Forms["radio-compose"] = async (d, f) => {
  const text = d.text.trim();
  if (!text) return formError(f, "Enter a message.");
  if (!await sendRadioMessage(f, { text, priority: "routine" }, d.target, d.replyTo || null)) return;
  if (d.replyTo) markRadioMessageRead(d.replyTo);
  if (f.isConnected) closeSheet(true);
  render();
  toast("Message sent.");
};

function markRadioMessageRead(id) {
  const notices = myNotifications().filter((n) => n.kind === "security-radio" && n.radioMessageId === id && !n.read);
  if (notices.length) { notices.forEach((n) => { n.read = true; }); S.save(); }
}

function renderRadioMessage(id) {
  if (!SecurityRadio.allowed()) return { redirect: "home" };
  const message = S.get("securityRadioMessages", id);
  const notice = myNotifications().find((n) => n.kind === "security-radio" && n.radioMessageId === id);
  const allowed = canReadRadioMessage(message);
  if (allowed) markRadioMessageRead(id);
  return {
    title: "Security message", back: "security",
    body: allowed ? html`<section class="sec"><div class="panel">${securityMessageCard(message)}
      ${message.by !== S.me().id ? html`<button type="button" class="btn" data-act="radio-reply" data-id="${id}">Reply privately</button>` : ""}
    </div></section>` : html`<section class="sec"><p>${notice?.body || "This message is unavailable."}</p>
      ${notice ? html`<p class="muted">Waiting for the full message to sync.</p><button type="button" class="btn" data-act="radio-notice-reply" data-id="${notice.id}">Reply privately</button>` : ""}
    </section>`,
  };
}
