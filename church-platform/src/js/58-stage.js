// ---------- Worship team screens: stage display, countdowns, livestream overlay and live captions ----------
// The stage display is a confidence monitor for the band and the preacher: the words now, what's next, the clock,
// time left in this part of the service and messages from the booth. The overlay is a see-through page for
// streaming software (OBS, vMix, Streamlabs) that shows lyrics, scripture and live captions as a lower third.
// Both follow the operator through BroadcastChannel on the same computer, and through Realtime once Supabase is connected.

/** 3:05, 1:02:09 or 2d 4h, for timers of any length. */
function cdText(secs) {
  const s = Math.max(0, Math.round(secs));
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return mmss(s);
}
const segLeftText = (left) => (left >= 0 ? `${cdText(left)} left` : `${cdText(-left)} over`);
/** A countdown slide ends at the service start time, or after its own minutes from when it came on screen. */
function timedSlide(s, segAt) {
  if (s?.kind !== "countdown") return s;
  return { ...s, end: s.to === "length" ? (segAt || Date.now()) + (s.minutes || 5) * 60e3 : s.startAt };
}
/** The words on a slide as plain text. */
function slideWords(s) {
  if (!s) return "";
  switch (s.kind) {
    case "lyrics": return s.body || "";
    case "scripture": return s.verses.map((v) => v.replace(/^\d+\s/, "")).join(" ");
    case "keynote": case "point": case "question": return s.body || "";
    case "title": return [s.title, s.body].filter(Boolean).join("\n");
    case "text": return [s.title, s.body].filter(Boolean).join("\n");
    case "qr": return `QR code: ${s.title}`;
    case "media": return s.body || "Picture or video";
    case "countdown": return s.body || "Countdown";
    case "logo": return "Logo";
    default: return "";
  }
}

// ----- Stage display -----
/** st = { index, black, logo, segAt, startedAt, msg } from the operator. */
function stageMonitor(data, st, full) {
  const slides = data?.slides || [], i = clamp(st.index || 0, 0, Math.max(0, slides.length - 1));
  const cur = timedSlide(slides[i], st.segAt), next = slides[i + 1];
  const now = Date.now();
  const timer = cur?.minutes != null
    ? html`<span class="sm-timer ${cur.minutes * 60 - (now - st.segAt) / 1000 < 0 ? "over" : ""}" data-seg-start="${st.segAt}" data-mins="${cur.minutes}" title="Time left in ${cur.section}">${segLeftText(cur.minutes * 60 - (now - (st.segAt || now)) / 1000)}</span>`
    : html`<span class="sm-timer" data-since="${st.startedAt || now}" title="Time since the presentation started">${cdText((now - (st.startedAt || now)) / 1000)}</span>`;
  const audience = st.black ? "Screen is black" : st.logo ? "Logo on screen" : "";
  const nowBody = !cur ? html`<span class="faint">No slides</span>`
    : cur.kind === "countdown" ? html`<span class="sm-count" data-cd-end="${cur.end}">${cdText((cur.end - now) / 1000)}</span>`
    : cur.kind === "scripture" ? html`${slideWords(cur)}<span class="sm-ref">${cur.ref}</span>` : slideWords(cur);
  return html`<div class="stage-mon ${full ? "full" : ""}" aria-label="Stage display">
    <div class="sm-top"><span class="sm-clock" data-clock>${fmtTime(now)}</span><span class="sm-sec">${cur?.section || data?.title || ""}${cur?.label ? `, ${cur.label}` : ""}</span>${timer}</div>
    ${st.msg ? html`<div class="sm-msg" role="status">${st.msg}</div>` : ""}
    ${audience ? html`<div class="sm-aud">${audience}</div>` : ""}
    <div class="sm-now ${cur?.kind === "lyrics" || cur?.kind === "scripture" ? "words" : ""}">${nowBody}</div>
    <div class="sm-next"><span class="sm-label">Next${next && next.section !== cur?.section ? `: ${next.section}` : ""}</span>${next ? slideWords(next).split("\n").slice(0, 2).join("\n") : "End of the service"}</div>
    ${cur?.notes ? html`<div class="sm-notes">${cur.notes}</div>` : ""}
  </div>`;
}
const routeData = (tail) => { const [kind, ...rest] = tail.split("-"); return slidesFor(kind, rest.join("-")); };

/** #stage-service-ID: a full-screen stage display for a second screen, following the operator. */
Screens.stage = (tail) => {
  let st = { index: 0, segAt: Date.now(), startedAt: Date.now() };
  const draw = () => { applyBrand(); $("#app").innerHTML = flat(stageMonitor(routeData(tail), st, true)); };
  document.body.classList.add("presenting");
  draw();
  if (Backend.on) Backend.onBroadcast((m) => presChannel?.onmessage?.({ data: m }));
  if (presChannel) presChannel.onmessage = (e) => { if (e.data?.key === tail && location.hash === `#stage-${tail}`) { S.load(); if (e.data.church) S.state.current = e.data.church; st = e.data; draw(); } };
};

// ----- Livestream overlay -----
const OVERLAY_KINDS = ["lyrics", "scripture", "keynote", "point", "question"];
function overlayHtml(s, st = {}) {
  const words = s && !st.black && !st.logo && OVERLAY_KINDS.includes(s.kind) ? slideWords(s) : "";
  return html`<div class="ov">${words ? html`<div class="ov-lt ${s.kind}"><div class="ov-text">${words}</div>${s.kind === "scripture" ? html`<div class="ov-ref">${s.ref}</div>` : ""}</div>` : ""}
    <div class="ov-cc" data-captions ${attr(!st.captions, "hidden")}>${st.captions || ""}</div></div>`;
}
/** #overlay-service-ID: see-through lower thirds for streaming software, following the operator. */
Screens.overlay = (tail) => {
  let st = { index: 0 };
  const draw = () => {
    const data = routeData(tail);
    $("#app").innerHTML = flat(html`<div class="ov-frame">${overlayHtml(data?.slides[clamp(st.index, 0, data.slides.length - 1)], st)}</div>`);
  };
  document.documentElement.classList.add("overlay-page");
  draw();
  if (Backend.on) Backend.onBroadcast((m) => presChannel?.onmessage?.({ data: m }));
  if (presChannel) presChannel.onmessage = (e) => {
    if (e.data?.key !== tail || location.hash !== `#overlay-${tail}`) return;
    S.load(); if (e.data.church) S.state.current = e.data.church;
    const words = e.data.index !== st.index || e.data.black !== st.black || e.data.logo !== st.logo;
    st = e.data;
    if (words) draw(); else { const cc = $("[data-captions]"); if (cc) { cc.textContent = st.captions || ""; cc.hidden = !st.captions; } }
  };
};
Actions["pres-overlay"] = (el) => {
  const key = el.dataset.key, data = routeData(key), cur = data?.slides[pres.index];
  const url = appLink(`overlay-${key}`);
  openSheet("Livestream overlay", html`<p class="muted" style="margin-top:0">Lyrics, scripture and live captions as a lower third over your video. The background is see-through.</p>
    <div class="ov-frame preview">${overlayHtml(cur?.kind && OVERLAY_KINDS.includes(cur.kind) ? cur : data?.slides.find((s) => s.kind === "lyrics" || s.kind === "scripture"), { captions: pres.cc ? pres.captions : "" })}</div>
    <ol class="steps-list"><li>In OBS, vMix or Streamlabs, add a <b>Browser</b> source.</li><li>Paste the address below and set the size to 1920 by 1080.</li><li>Run the slides from this screen on the same computer. The overlay follows along.</li></ol>
    <div class="copy-line"><input type="text" readonly value="${url}" aria-label="Overlay address"><button class="btn sm" data-act="copy" data-text="${url}">${icon("copy")}Copy</button></div>
    ${IN_PREVIEW ? demoNote("The overlay works once the app is on your own website. To follow along from another computer, connect Supabase (see the setup guide).") : html`<div class="btns"><button class="btn ghost" data-act="pres-open" data-route="overlay-${key}" data-name="koinonia-overlay">${icon("screen")}Open overlay window</button></div>`}`, { wide: true });
};
Actions["pres-open"] = (el) => {
  const w = window.open(`${location.pathname}#${el.dataset.route}`, el.dataset.name, "popup,width=1280,height=720");
  if (!w) toast("Allow pop-ups to open the window"); else setTimeout(presBroadcast, 800);
};

// ----- Messages to the stage -----
Forms["stage-msg"] = (d) => { pres.msg = d.msg.slice(0, 80); presBroadcast(); render(); toast(pres.msg ? "Sent to the stage" : "Message cleared"); };
Actions["stage-msg-clear"] = () => { pres.msg = ""; presBroadcast(); render(); };

// ----- Live captions from the microphone (Chrome, Edge and Safari) -----
let recog = null;
Actions["pres-captions"] = () => {
  if (recog) { pres.cc = false; const r = recog; recog = null; try { r.stop(); } catch {} pres.captions = ""; presBroadcast(); render(); toast("Captions off"); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("Live captions need Chrome, Edge or Safari"); return; }
  const r = new SR();
  r.continuous = true; r.interimResults = true; r.lang = lang() === "es" ? "es-US" : (navigator.language || "en-US");
  r.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) pres.transcript.push(t.trim()); else interim += t; }
    pres.captions = `${pres.transcript.slice(-2).join(" ")} ${interim}`.trim().slice(-160);
    $$("[data-captions]").forEach((x) => { x.textContent = pres.captions; x.hidden = !pres.captions; });
    presBroadcast();
  };
  const stop = (msg) => { if (recog !== r) return; pres.cc = false; recog = null; pres.captions = ""; try { r.stop(); } catch {} presBroadcast(); render(); toast(msg); };
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    stop({ "not-allowed": "Allow the microphone to turn on captions", "service-not-allowed": "Allow the microphone to turn on captions", "audio-capture": "No microphone found", network: "Captions need an internet connection" }[e.error] || "Captions stopped");
  };
  // Browsers end recognition after a pause; start again, but give up if it keeps stopping straight away.
  let quick = 0;
  r.onend = () => {
    if (!pres.cc || recog !== r) return;
    quick = Date.now() - r.startedAt < 2000 ? quick + 1 : 0;
    if (quick > 3) return stop("Captions stopped");
    try { r.startedAt = Date.now(); r.start(); } catch { stop("Captions stopped"); }
  };
  try { r.startedAt = Date.now(); r.start(); recog = r; pres.cc = true; render(); toast("Captions on. Speak near the microphone."); } catch { toast("Captions couldn't start"); }
};

// ----- One clock for every timer on screen -----
function tickTimers() {
  const now = Date.now();
  $$("[data-clock]").forEach((el) => { el.textContent = fmtTime(now); });
  $$("[data-cd-end]").forEach((el) => { el.textContent = cdText((+el.dataset.cdEnd - now) / 1000); });
  $$("[data-seg-start]").forEach((el) => { const left = +el.dataset.mins * 60 - (now - +el.dataset.segStart) / 1000; el.textContent = segLeftText(left); el.classList.toggle("over", left < 0); });
  $$("[data-since]").forEach((el) => { el.textContent = cdText((now - +el.dataset.since) / 1000); });
}
setInterval(tickTimers, 1000);
