// ---------- Booth mode: the operator view ----------
// For churches that turn on "Try Booth mode" (Admin, Features). The presenter gets a Booth view built like a video
// switcher: Preview on the left is what goes up next, Program on the right is what the room sees now, and Take (or
// Enter) sends Preview to Program. Nothing cued means Preview is simply the next slide, so Take works like Next.
// Click a slide in the list to cue it; double-click to send it straight up. Take can cut or fade; the audience
// screens do the fade.

const boothOn = () => S.church()?.labs?.booth === true;
const FADES = [[0, "Cut"], [300, "Quick fade"], [700, "Slow fade"]];
try { pres.fade = +localStorage.getItem("ofc-booth-fade") || 0; } catch { pres.fade = 0; }

function boothOperator({ data, slides, at, shown, next, L, tail, noStage }) {
  if (pres.cue != null && (pres.cue < 0 || pres.cue >= slides.length || (!L && pres.cue === pres.index))) pres.cue = null;
  const cued = pres.cue != null ? slides[pres.cue] : next;
  const cueLabel = pres.cue != null ? `Slide ${pres.cue + 1}, cued` : next ? (L ? `Next in ${L.label}` : `Slide ${pres.index + 2}, next`) : "End of the plan";
  let lastSection = null;
  return html`<div class="booth-op">
    <div class="booth-panes">
      <section class="booth-pane preview" aria-label="Preview">
        <header><b>Preview</b><span class="faint">${cueLabel}</span>${pres.cue != null ? html`<button type="button" class="linkish" data-act="booth-uncue">Back to next</button>` : ""}</header>
        <div class="stage">${cued ? slideHtml(timedSlide(cued, Date.now())) : slideHtml({ kind: "black" })}</div>
      </section>
      <div class="booth-take">
        <button class="btn booth-take-btn" data-act="booth-take" ${attr(!cued, "disabled")} title="Take (Enter)">${icon("next")}Take</button>
        <label class="booth-fade"><span class="faint">Take with</span><select data-change="booth-fade" aria-label="Transition">${FADES.map(([v, l]) => html`<option value="${v}" ${attr(pres.fade === v, "selected")}>${l}</option>`)}</select></label>
      </div>
      <section class="booth-pane program ${pres.black || pres.logo ? "held" : ""}" aria-label="Program">
        <header><b>Program</b><span class="live-dot">Live</span><span class="faint">${L ? `${L.label} ${L.i + 1} / ${L.slides.length}` : `${pres.index + 1} / ${slides.length}`}</span></header>
        <div class="stage" id="stage" aria-live="polite">${slideHtml(shown)}</div>
      </section>
    </div>
    <div class="present-controls booth-controls">
      <button class="btn ghost" data-act="pres-go" data-d="-1" aria-label="Previous slide" ${attr(!L && pres.index === 0, "disabled")}>${icon("prev")}Back</button>
      <button class="btn ghost" data-act="pres-black" aria-pressed="${pres.black}" title="Black screen (B)">${icon("black")}Black</button>
      <button class="btn ghost" data-act="pres-logo" aria-pressed="${pres.logo}" title="Logo screen (L)">${icon("church")}Logo</button>
      <button class="btn ghost" data-act="booth-clear" ${attr(!pres.black && !pres.logo && !pres.media, "disabled")} title="Back to the slides">${icon("x")}Clear</button>
      <button class="btn ghost" data-act="pres-media" aria-pressed="${!!pres.media}">${icon("play")}Media</button>
      <button class="btn ghost" data-act="pres-screens" title="Open the audience and stage screens on their displays">${icon("screen")}Screens</button>
      <button class="btn ghost" data-act="pres-remote" title="Move the slides from a phone">${icon("phone")}Remote</button>
      <button class="btn ghost" data-act="pres-captions" aria-pressed="${pres.cc}">${icon("chat")}Captions</button>
      ${obsStrip() ? "" : html`<button class="btn ghost" data-act="obs-setup" title="Switch scenes and start the stream from here">${icon("live")}OBS</button>`}
    </div>
    ${obsStrip()}
    ${songBar(slides, at.cur)}
    ${pres.cc ? html`<p class="cc-live" aria-live="polite"><b>Captions</b> <span data-captions>${pres.captions || "Listening..."}</span></p>` : ""}
    <div class="booth-lower">
      <div class="slide-list booth-list" role="listbox" aria-label="Slides: click to cue, double-click to take">${slides.map((s, i) => html`${s.section && s.section !== lastSection ? (lastSection = s.section, html`<p class="slide-sec">${s.section}</p>`) : ""}<button class="slide-pick ${!L && i === pres.index ? "on" : ""} ${i === pres.cue ? "cued" : ""}" data-act="booth-cue" data-i="${i}" aria-selected="${i === pres.cue}"><span>${i + 1}</span>${slideLabel(s)}</button>`)}</div>
      <div class="booth-side">
        <div class="present-notes"><b>Notes</b><p>${at.cur?.notes || "No notes for this slide."}</p></div>
        ${noStage ? "" : html`<form class="stage-msg" data-form="stage-msg" novalidate><label for="stage-msg-in"><b>Message to the stage</b></label>
          <div class="copy-line"><input id="stage-msg-in" type="text" name="msg" value="${pres.msg}" maxlength="80" placeholder="Repeat the chorus"><button class="btn sm">Send</button></div>
          ${pres.msg ? html`<button type="button" class="linkish" data-act="stage-msg-clear">Clear "${pres.msg}"</button>` : ""}</form>`}
      </div>
    </div></div>`;
}

function boothTake() {
  if (pres.cue != null) { const i = pres.cue; pres.cue = null; Actions["pres-jump"]({ dataset: { i } }); }
  else if (liveAt(routeData(pres.key)?.slides || [], pres).next) presMove(1);
}
let boothClickTimer = null;
Actions["booth-cue"] = (el) => {
  const i = +el.dataset.i;
  // A second click on the same slide within a moment takes it.
  if (boothClickTimer && boothClickTimer.i === i) { clearTimeout(boothClickTimer.t); boothClickTimer = null; pres.cue = i; return boothTake(); }
  clearTimeout(boothClickTimer?.t); boothClickTimer = { i, t: setTimeout(() => { boothClickTimer = null; }, 350) };
  pres.cue = i; render();
};
Actions["booth-uncue"] = () => { pres.cue = null; render(); };
Actions["booth-take"] = boothTake;
Actions["booth-clear"] = () => { pres.black = pres.logo = false; if (pres.media) Actions["pres-media-off"](); else render(); };
Inputs["booth-fade"] = (el) => { pres.fade = +el.value || 0; try { localStorage.setItem("ofc-booth-fade", String(pres.fade)); } catch { /* private mode */ } presBroadcast(); };

/** Puts a new slide on an audience screen, fading from the old one when the booth asks for a fade. */
function swapWithFade(app, out, fade) {
  const before = app.querySelector(".display .stage");
  const old = fade > 0 && app.dataset.shown && out !== app.dataset.shown && before && !before.querySelector("video, iframe") ? before.innerHTML : null;
  app.innerHTML = out; app.dataset.shown = out;
  const stage = app.querySelector(".display .stage");
  if (old == null || !stage) return;
  const layer = document.createElement("div");
  layer.className = "xfade-old"; layer.innerHTML = old; layer.style.animationDuration = `${fade}ms`;
  stage.append(layer); setTimeout(() => layer.remove(), fade + 60);
}
