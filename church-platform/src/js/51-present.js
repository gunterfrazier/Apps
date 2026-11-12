// ---------- Presentation: slides from a service plan or a built sermon/lesson ----------
// Slideshow mode drives the screen one slide at a time; scroll mode lets someone move through at their own pace.
// On your own website, "Open display window" puts the slides on a second screen, kept in step with the operator.

/** "1 In the beginning... 2 Now the earth..." -> ["1 In the beginning...", "2 Now the earth..."], splitting only at the next expected verse number. */
function splitVerses(text) {
  const m = String(text || "").match(/^(\d+)\s/);
  if (!m) return text ? [text] : [];
  let n = +m[1], cur = text; const out = [];
  for (;;) { const i = cur.indexOf(` ${n + 1} `); if (i < 0) { out.push(cur.trim()); break; } out.push(cur.slice(0, i).trim()); cur = cur.slice(i + 1); n++; }
  return out;
}
function scriptureSlides(ref, text, title, translation, notes) {
  const verses = splitVerses(text);
  if (!verses.length) return [{ kind: "title", title: title || ref || "Scripture", body: title ? ref : "", notes }];
  const chunks = []; let cur = [];
  verses.forEach((v) => { if (cur.length && (cur.join(" ").length + v.length) > 300) { chunks.push(cur); cur = []; } cur.push(v); });
  if (cur.length) chunks.push(cur);
  return chunks.map((c, i) => ({ kind: "scripture", verses: c, ref: `${ref}${translation ? ` ${translation}` : ""}`, title, notes: i === 0 ? notes : "" }));
}
const textSlides = (title, text, notes, kind = "text") => { const parts = String(text || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean); return (parts.length ? parts : [""]).map((p, i) => ({ kind, title, body: p, notes: i === 0 ? notes : "" })); };

function docSlides(d, withTitle = true) {
  const out = withTitle ? [{ kind: "title", title: d.title, body: d.passage, notes: d.resource || "" }] : [];
  let pending = [];
  const flush = (slides) => { if (pending.length && slides[0]) slides[0].notes = [slides[0].notes, ...pending].filter(Boolean).join("\n"); pending = []; return slides; };
  d.blocks.forEach((b) => {
    if (!b.show || b.type === "note") { pending.push(`${b.type === "note" ? "Note" : b.label || "Cue"}: ${b.text || b.title || ""}${b.notes ? ` (${b.notes})` : ""}`); return; }
    let slides;
    switch (b.type) {
      case "scripture": slides = scriptureSlides(b.ref, b.text, "", b.translation, b.notes); break;
      case "keynote": slides = [{ kind: "keynote", body: b.text, notes: b.notes }]; break;
      case "point": slides = [{ kind: "point", body: b.text, notes: b.notes }]; break;
      case "question": slides = [{ kind: "question", body: b.text, notes: b.notes }]; break;
      case "text": slides = textSlides(b.title, b.text, b.notes); break;
      case "media": slides = [{ kind: "media", image: b.image, url: b.url, body: b.caption, notes: b.notes }]; break;
      case "action": slides = b.target ? [{ kind: "qr", title: b.text || b.label, url: appLink(b.target), notes: b.notes }] : [{ kind: "text", title: b.label, body: b.text, notes: b.notes }]; break;
      default: slides = [];
    }
    out.push(...flush(slides));
  });
  if (pending.length && out.length) out[out.length - 1].notes = [out[out.length - 1].notes, ...pending].filter(Boolean).join("\n");
  return out;
}
function serviceSlides(p) {
  const c = S.church(), out = [{ kind: "logo", section: "Before the service", notes: p.notes || "" }];
  const startAt = fromIsoDay(p.date, p.time || "10:00").getTime();
  p.segments.forEach((s, segIndex) => {
    const cnt = s.content || {}, lead = [s.leader ? `Led by ${s.leader}` : "", s.notes].filter(Boolean).join(". ");
    let slides = [];
    if (!s.show) { const last = out[out.length - 1]; last.notes = [last.notes, `Next, not on screen: ${s.title}${lead ? ` (${lead})` : ""}`].filter(Boolean).join("\n"); return; }
    const t = SEGMENT_TYPES[s.type]?.content;
    if (t === "song") { const song = S.get("songs", cnt.songId); slides = song ? songSlides(song, cnt.sections) : [{ kind: "title", title: s.title }]; if (slides[0]) slides[0].notes = lead; }
    else if (t === "scripture") slides = cnt.text || cnt.ref ? scriptureSlides(cnt.ref, cnt.text, s.title, cnt.translation, lead) : textSlides(s.title, "", lead, "title");
    else if (t === "sermon") { const d = cnt.blocks ? { title: cnt.title || s.title, passage: "", resource: "", blocks: cnt.blocks } : S.get("docs", cnt.docId); slides = d ? docSlides(d) : [{ kind: "title", title: s.title, notes: lead }]; if (slides[0]) slides[0].notes = [lead, slides[0].notes].filter(Boolean).join("\n"); }
    else if (t === "media") slides = [{ kind: "media", image: cnt.image, url: cnt.url, body: cnt.caption, notes: lead }];
    else if (t === "none") { const news = newsSorted().slice(0, 5); slides = news.length ? news.map((n, i) => ({ kind: "text", title: n.title, body: n.body, notes: i === 0 ? lead : "" })) : [{ kind: "title", title: s.title, notes: lead }]; }
    else if (t === "countdown") slides = [{ kind: "countdown", title: s.title, body: cnt.text, to: cnt.to || "start", startAt, notes: lead }];
    else if (s.type === "offering") slides = [{ kind: "qr", title: s.title, body: cnt.text, url: appLink(`give-${S.state.current}`), notes: lead }];
    else slides = textSlides(s.title, cnt.text, lead, cnt.text ? "text" : "title");
    slides.forEach((x) => { Object.assign(x, { section: s.title, segIndex, minutes: +s.minutes || 0 }); });
    out.push(...slides);
  });
  out.push({ kind: "logo", section: "After the service", notes: "" });
  void c; return out;
}
function slidesFor(kind, id) {
  if (kind === "doc") { const d = S.get("docs", id); return d ? { title: d.title, slides: docSlides(d).map((s) => ({ ...s, section: s.section || d.title })), back: canEditDoc(d) ? `build-${d.id}` : "ministry" } : null; }
  const p = S.get("services", id); return p ? { title: p.title, slides: serviceSlides(p), back: `service-${p.id}` } : null;
}

function slideHtml(s, c = S.church()) {
  if (!s) return html`<div class="slide k-black"></div>`;
  const body = (() => {
    switch (s.kind) {
      case "logo": return html`<div class="slide-center">${c.logo ? html`<img class="slide-logo" src="${c.logo}" alt="">` : html`<div class="slide-mono">${initials(c.name)}</div>`}<div class="slide-church">${c.name}</div></div>`;
      case "title": return html`<div class="slide-center"><div class="slide-title">${s.title}</div>${s.body ? html`<div class="slide-sub">${s.body}</div>` : ""}</div>`;
      case "lyrics": return html`<div class="slide-center"><div class="slide-lyrics">${s.body}</div></div>`;
      case "scripture": return html`<div class="slide-scripture">${s.title ? html`<div class="slide-kicker">${s.title}</div>` : ""}<div class="slide-verses">${s.verses.map((v) => { const m = v.match(/^(\d+)\s([\s\S]*)$/); return m ? html`<sup>${m[1]}</sup>${m[2]} ` : html`${v} `; })}</div><div class="slide-ref">${s.ref}</div></div>`;
      case "keynote": return html`<div class="slide-center"><div class="slide-keynote">${s.body}</div></div>`;
      case "point": return html`<div class="slide-center"><div class="slide-point">${s.body}</div></div>`;
      case "question": return html`<div class="slide-center"><div class="slide-kicker">Think about it</div><div class="slide-point">${s.body}</div></div>`;
      case "text": return html`<div class="slide-text">${s.title ? html`<div class="slide-title small">${s.title}</div>` : ""}<div class="slide-body">${s.body}</div></div>`;
      case "media": return s.image ? html`<img class="slide-image" src="${s.image}" alt="${s.body || ""}">${s.body ? html`<div class="slide-caption">${s.body}</div>` : ""}` : html`<div class="slide-center"><div class="slide-mono">${icon("play")}</div><div class="slide-sub">${s.body || "Video"}</div></div>`;
      case "countdown": { const end = s.end || s.startAt; return html`<div class="slide-center"><div class="slide-countdown" data-cd-end="${end}">${cdText((end - Date.now()) / 1000)}</div>${s.body ? html`<div class="slide-sub">${s.body}</div>` : ""}</div>`; }
      case "qr": return html`<div class="slide-qr"><div class="qr-box">${raw(qrSvg(s.url, { size: 400 }))}</div><div><div class="slide-title small">${s.title}</div>${s.body ? html`<div class="slide-body">${s.body}</div>` : ""}<div class="slide-sub">Scan with your phone's camera</div></div></div>`;
      default: return "";
    }
  })();
  const bg = s.kind === "logo" ? raw(` style="--b:${esc(c.color)};background:${esc(bannerBackground(bannerOf(c), c.color))}"`) : "";
  return html`<div class="slide k-${s.kind}"${bg}>${body}${s.footer ? html`<div class="slide-foot">${s.footer}</div>` : ""}</div>`;
}

const pres = { key: "", index: 0, black: false, logo: false, mode: "slideshow", segKey: "", segAt: 0, startedAt: 0, msg: "", cc: false, captions: "", transcript: [] };
let presChannel = null;
try { presChannel = "BroadcastChannel" in window ? new BroadcastChannel("koinonia-present") : null; } catch { presChannel = null; }
function presBroadcast() {
  try { presChannel?.postMessage({ key: pres.key, index: pres.index, black: pres.black, logo: pres.logo, church: S.state.current, segAt: pres.segAt, startedAt: pres.startedAt, msg: pres.msg, captions: pres.cc ? pres.captions : "" }); } catch {}
}

Screens.present = (tail) => {
  const [kind, ...rest] = tail.split("-"); const id = rest.join("-");
  const data = slidesFor(kind, id);
  if (!data || !S.isMember() || !(S.can("present") || (kind === "doc" && canEditDoc(S.get("docs", id))))) return { redirect: "ministry" };
  if (pres.key !== tail) Object.assign(pres, { key: tail, index: 0, black: false, logo: false, msg: "", startedAt: Date.now(), segKey: "" });
  const { slides } = data;
  pres.index = clamp(pres.index, 0, slides.length - 1);
  // Each part of the service gets its own timer, starting when its first slide comes up.
  const segKey = `${tail}:${slides[pres.index]?.segIndex ?? slides[pres.index]?.section}`;
  if (pres.segKey !== segKey) Object.assign(pres, { segKey, segAt: Date.now() });
  const cur = timedSlide(slides[pres.index], pres.segAt), next = slides[pres.index + 1];
  const shown = pres.black ? { kind: "black" } : pres.logo ? { kind: "logo" } : cur;
  const stageMode = pres.mode === "stage";
  let lastSection = null;
  return {
    present: true,
    page: html`<div class="present ${pres.mode}">
      <header class="present-bar"><a class="icon-btn" href="#${data.back}" aria-label="Back">${icon("back")}</a><b class="present-title">${data.title}</b>
        <nav class="seg" style="margin:0;flex:none" aria-label="Mode"><a href="#present-${tail}" data-act="pres-mode" data-mode="slideshow" ${attr(pres.mode === "slideshow", 'aria-current="page"')}>Slideshow</a><a href="#present-${tail}" data-act="pres-mode" data-mode="scroll" ${attr(pres.mode === "scroll", 'aria-current="page"')}>Scroll</a><a href="#present-${tail}" data-act="pres-mode" data-mode="stage" ${attr(stageMode, 'aria-current="page"')}>Stage</a></nav></header>
      ${pres.mode === "scroll" ? html`<div class="scroll-slides">${slides.map((s, i) => html`${s.section && s.section !== lastSection ? (lastSection = s.section, html`<h2 class="sec-head" style="color:#fff;margin-top:22px">${s.section}</h2>`) : ""}<div class="stage" aria-label="Slide ${i + 1}">${slideHtml(s)}</div>${s.notes ? html`<p class="scroll-notes">${icon("lock")} ${s.notes}</p>` : ""}`)}</div>`
      : html`<div class="present-main">
        ${stageMode ? stageMonitor(data, pres) : html`<div class="stage" id="stage" aria-live="polite" aria-label="Slide ${pres.index + 1} of ${slides.length}">${slideHtml(shown)}</div>`}
        <div class="present-controls">
          <button class="btn ghost" data-act="pres-go" data-d="-1" aria-label="Previous slide" ${attr(pres.index === 0, "disabled")}>${icon("prev")}</button>
          <span class="present-count">${pres.index + 1} / ${slides.length}</span>
          <button class="btn" data-act="pres-go" data-d="1" aria-label="Next slide" ${attr(pres.index >= slides.length - 1, "disabled")}>${icon("next")}Next</button>
          <button class="btn ghost" data-act="pres-black" aria-pressed="${pres.black}" aria-label="Black screen" title="Black screen (B)">${icon("black")}<span class="lbl">Black</span></button>
          <button class="btn ghost" data-act="pres-logo" aria-pressed="${pres.logo}" aria-label="Logo screen" title="Logo screen (L)">${icon("church")}<span class="lbl">Logo</span></button>
          <button class="btn ghost" data-act="pres-full" aria-label="Full screen" title="Full screen (F)">${icon("expand")}<span class="lbl">Full screen</span></button>
          ${!IN_PREVIEW && presChannel ? html`<button class="btn ghost" data-act="pres-window" data-key="${tail}" aria-label="Open display window">${icon("screen")}<span class="lbl">Display window</span></button>
            <button class="btn ghost" data-act="pres-open" data-route="stage-${tail}" data-name="koinonia-stage" aria-label="Open stage display">${icon("music")}<span class="lbl">Stage window</span></button>` : ""}
          <button class="btn ghost" data-act="pres-overlay" data-key="${tail}" aria-label="Livestream overlay">${icon("live")}<span class="lbl">Overlay</span></button>
          <button class="btn ghost" data-act="pres-captions" aria-pressed="${pres.cc}" aria-label="Live captions">${icon("chat")}<span class="lbl">Captions</span></button>
        </div>
        ${pres.cc ? html`<p class="cc-live" aria-live="polite"><b>Captions</b> <span data-captions>${pres.captions || "Listening..."}</span></p>` : ""}
        <div class="present-side">
          ${stageMode ? html`<div><b class="faint">The audience sees</b><div class="stage mini">${slideHtml(shown)}</div></div>` : html`<div class="present-notes"><b>Notes</b><p>${cur?.notes || "No notes for this slide."}</p></div>`}
          <form class="stage-msg" data-form="stage-msg" novalidate><label for="stage-msg-in"><b>Message to the stage</b></label>
            <div class="copy-line"><input id="stage-msg-in" type="text" name="msg" value="${pres.msg}" maxlength="80" placeholder="Repeat the chorus"><button class="btn sm">Send</button></div>
            ${pres.msg ? html`<button type="button" class="linkish" data-act="stage-msg-clear">Clear "${pres.msg}"</button>` : html`<small class="faint">Shows on the stage display, not the audience screen.</small>`}</form>
          ${stageMode ? "" : next ? html`<div><b class="faint">Next</b><div class="stage mini">${slideHtml(next)}</div></div>` : html`<p class="faint">This is the last slide.</p>`}
        </div>
        <div class="slide-list">${slides.map((s, i) => html`${s.section && s.section !== lastSection ? (lastSection = s.section, html`<p class="slide-sec">${s.section}</p>`) : ""}<button class="slide-pick ${i === pres.index ? "on" : ""}" data-act="pres-jump" data-i="${i}"><span>${i + 1}</span>${slideLabel(s)}</button>`)}</div>
      </div>`}</div>`,
    after() {
      presBroadcast();
      // Keep the current slide visible in the list without scrolling the whole page.
      const list = $(".slide-list"), on = $(".slide-pick.on");
      if (list && on && (on.offsetTop < list.scrollTop || on.offsetTop + on.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = on.offsetTop - list.clientHeight / 2;
    },
  };
};
function slideLabel(s) {
  return s.kind === "logo" ? "Logo" : s.kind === "lyrics" ? `${s.label}: ${s.body.split("\n")[0]}` : s.kind === "scripture" ? s.ref : s.kind === "qr" ? `QR: ${s.title}` : s.kind === "media" ? s.body || "Picture" : (s.title || s.body || "").split("\n")[0].slice(0, 60);
}
const presMove = (d) => { pres.index += d; pres.black = pres.logo = false; render(); };
Actions["pres-go"] = (el) => presMove(+el.dataset.d);
Actions["pres-jump"] = (el) => { pres.index = +el.dataset.i; pres.black = pres.logo = false; render(); };
Actions["pres-black"] = () => { pres.black = !pres.black; pres.logo = false; render(); };
Actions["pres-logo"] = () => { pres.logo = !pres.logo; pres.black = false; render(); };
Actions["pres-mode"] = (el) => { pres.mode = el.dataset.mode; render(); };
Actions["pres-full"] = async () => { const st = $("#stage"); try { await st.requestFullscreen(); } catch { toast("Full screen isn't available here"); } };
Actions["pres-window"] = (el) => {
  const w = window.open(`${location.pathname}#display-${el.dataset.key}`, "koinonia-display", "popup,width=1280,height=720");
  if (!w) toast("Allow pop-ups to open the display window"); else setTimeout(presBroadcast, 800);
};
document.addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("presenting") || pres.mode === "scroll" || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); if ($('[data-act="pres-go"][data-d="1"]:not([disabled])')) presMove(1); }
  else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); if (pres.index > 0) presMove(-1); }
  else if (e.key.toLowerCase() === "b") Actions["pres-black"]();
  else if (e.key.toLowerCase() === "l") Actions["pres-logo"]();
  else if (e.key.toLowerCase() === "f") Actions["pres-full"]();
});
let touchX = null;
document.addEventListener("touchstart", (e) => { if (e.target.closest("#stage")) touchX = e.touches[0].clientX; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (touchX == null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null;
  if (Math.abs(dx) > 50) { if (dx < 0 && $('[data-act="pres-go"][data-d="1"]:not([disabled])')) presMove(1); else if (dx > 0 && pres.index > 0) presMove(-1); }
});

// The audience display: just the slide, kept in step with the operator through BroadcastChannel.
Screens.display = (tail) => {
  const [kind, ...rest] = tail.split("-"); const id = rest.join("-");
  const draw = (state = { index: 0 }) => {
    const data = slidesFor(kind, id);
    const s = !data ? null : state.black ? { kind: "black" } : state.logo ? { kind: "logo" } : timedSlide(data.slides[clamp(state.index, 0, data.slides.length - 1)], state.segAt);
    applyBrand();
    $("#app").innerHTML = flat(html`<div class="display"><div class="stage">${slideHtml(s)}</div></div>`);
  };
  document.body.classList.add("presenting");
  draw();
  if (presChannel) presChannel.onmessage = (e) => { if (e.data?.key === tail && location.hash === `#display-${tail}`) { S.load(); if (e.data.church) S.state.current = e.data.church; draw(e.data); } };
};
