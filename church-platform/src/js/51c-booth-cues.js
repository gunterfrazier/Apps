// ---------- Booth mode: cues on the parts of a service ----------
// Each part (segment) of a service plan can carry cues that run when its first slide goes live: switch the OBS
// scene, start or stop the stream or the recording, or put a message on the stage display. They're kept on the plan,
// so every booth computer runs the same ones. The Booth view has three settings:
//   Off        cues don't run
//   Rehearse   cues only say what they would do (the safe setting for a run-through; where every computer starts)
//   Armed      cues run
// Cues run when the live slide moves into a part, not when the presentation first opens.

const CUE_TYPES = [["scene", "Switch OBS scene"], ["stream", "Stream"], ["record", "Recording"], ["message", "Stage message"]];
const CUE_MODES = [["off", "Off"], ["rehearse", "Rehearse"], ["armed", "Armed"]];
try { pres.cueMode = localStorage.getItem("ofc-booth-cues") || "rehearse"; } catch { pres.cueMode = "rehearse"; }

const cueText = (c) => c.t === "scene" ? `OBS scene ${c.name}` : c.t === "stream" ? (c.on ? "Start the stream" : "Stop the stream")
  : c.t === "record" ? (c.on ? "Start recording" : "Stop recording") : c.text ? `Stage message "${c.text}"` : "Clear the stage message";
/** The plan and the cues of the part a slide belongs to. */
function segCues(key, slide) {
  const [kind, ...rest] = String(key || "").split("-");
  if (kind !== "service" || slide?.segIndex == null) return [];
  return S.get("services", rest.join("-"))?.segments?.[slide.segIndex]?.cues || [];
}

/** Called by the presenter when the live slide moves into another part of the service. */
function cuesOnEnter(slide) {
  if (pres.mode !== "booth" || pres.cueMode === "off") return;
  const cues = segCues(pres.key, slide);
  if (!cues.length) return;
  if (pres.cueMode === "rehearse") return toast(`Rehearsal. ${slide.section}: ${cues.map(cueText).join(", ")}`);
  const say = (e) => toast(`Cue didn't run: ${e.message}`);
  for (const c of cues) {
    if (c.t === "message") { pres.msg = String(c.text || "").slice(0, 80); presBroadcast(); continue; }
    if (!Obs.on) { toast(`${slide.section}: OBS isn't connected, so "${cueText(c)}" didn't run`); continue; }
    if (c.t === "scene") Obs.setScene(c.name).catch(say);
    else if (c.t === "stream" && c.on !== Obs.streaming) Obs.setStream(c.on).catch(say);
    else if (c.t === "record" && c.on !== Obs.recording) Obs.setRecord(c.on).catch(say);
  }
}

/** The Off / Rehearse / Armed switch in the Booth view. */
function cueModeSwitch() {
  return html`<div class="cue-mode" role="radiogroup" aria-label="Cues"><span class="faint">Cues</span>${CUE_MODES.map(([v, l]) => html`<button type="button" role="radio" class="chip ${pres.cueMode === v ? `on ${v}` : ""}" data-act="cue-mode" data-mode="${v}" aria-checked="${pres.cueMode === v}">${l}</button>`)}</div>`;
}
/** What going up from Preview will set off, for the Preview header. */
function cuesAhead(slides, cued, live) {
  if (!cued || cued.segIndex == null || cued.segIndex === live?.segIndex) return "";
  const cues = segCues(pres.key, cued);
  return cues.length ? html`<span class="cue-ahead ${pres.cueMode}" title="${cues.map(cueText).join(", ")}">${icon("bolt")}${pres.cueMode === "armed" ? "Runs" : pres.cueMode === "rehearse" ? "Rehearses" : "Off:"} ${cues.map(cueText).join(", ")}</span>` : "";
}
/** The cue button on a part's heading in the Booth view's slide list. */
function cueBadge(slide) {
  if (!pres.key.startsWith("service-") || slide.segIndex == null) return "";
  const n = segCues(pres.key, slide).length;
  return html`<button type="button" class="cue-badge ${n ? "has" : ""}" data-act="cue-edit" data-seg="${slide.segIndex}" aria-label="${n ? `${n} cue${n > 1 ? "s" : ""} for ${slide.section}` : `Add a cue to ${slide.section}`}">${icon("bolt")}${n ? n : "Cue"}</button>`;
}

Actions["cue-mode"] = (el) => { pres.cueMode = el.dataset.mode; try { localStorage.setItem("ofc-booth-cues", pres.cueMode); } catch { /* private mode */ } render(); };
Actions["cue-edit"] = (el) => {
  const id = pres.key.replace(/^service-/, ""), p = S.get("services", id), seg = +el.dataset.seg, s = p?.segments?.[seg];
  if (!s) return;
  const cues = s.cues || [];
  openSheet(`Cues for ${s.title}`, html`<p class="muted" style="margin-top:0">These run when the first slide of ${s.title} goes live, while cues are <b>Armed</b>. They're saved with the plan.</p>
    ${cues.length ? html`<div class="rows">${cues.map((c, i) => html`<div class="row"><span class="lead-ic">${icon("bolt")}</span><span class="body"><span class="t">${cueText(c)}</span></span><button type="button" class="btn ghost sm" data-act="cue-remove" data-seg="${seg}" data-i="${i}">Remove</button></div>`)}</div>` : html`<p class="faint">No cues yet.</p>`}
    <form data-form="cue-add" novalidate class="cue-add"><input type="hidden" name="seg" value="${seg}">
      <label class="field"><span>Add a cue</span><select name="t" data-change="cue-type">${CUE_TYPES.map(([v, l]) => html`<option value="${v}">${l}</option>`)}</select></label>
      <div class="cue-fields">${cueFields("scene")}</div>
      <div class="btns"><button class="btn">${icon("plus")}Add</button><button type="button" class="btn ghost" data-act="close-sheet">Done</button></div></form>`);
};
function cueFields(t) {
  if (t === "scene") return Obs.on && Obs.scenes.length
    ? html`<label class="field"><span>Scene</span><select name="name">${Obs.scenes.map((n) => html`<option>${n}</option>`)}</select></label>`
    : html`<label class="field"><span>Scene name, as it's spelled in OBS</span><input name="name" maxlength="80" required placeholder="Sermon"></label>`;
  if (t === "stream" || t === "record") return html`<label class="field"><span>${t === "stream" ? "The stream" : "The recording"}</span><select name="on"><option value="1">Start</option><option value="0">Stop</option></select></label>`;
  return html`<label class="field"><span>Message (leave empty to clear it)</span><input name="text" maxlength="80" placeholder="Pastor's on in 2 minutes"></label>`;
}
Inputs["cue-type"] = (el) => { const box = el.form.querySelector(".cue-fields"); box.innerHTML = flat(cueFields(el.value)); };
Forms["cue-add"] = (d, f) => {
  const id = pres.key.replace(/^service-/, ""), p = S.get("services", id), seg = +d.seg;
  if (!p?.segments?.[seg]) return;
  let cue;
  if (d.t === "scene") { if (!d.name?.trim()) return formError(f, "Name the OBS scene."); cue = { t: "scene", name: d.name.trim().slice(0, 80) }; }
  else if (d.t === "stream" || d.t === "record") cue = { t: d.t, on: d.on === "1" };
  else cue = { t: "message", text: String(d.text || "").trim().slice(0, 80) };
  const segments = p.segments.map((s, i) => i === seg ? { ...s, cues: [...(s.cues || []), cue] } : s);
  S.update("services", id, { segments }); Actions["cue-edit"]({ dataset: { seg } }); render();
};
Actions["cue-remove"] = (el) => {
  const id = pres.key.replace(/^service-/, ""), p = S.get("services", id), seg = +el.dataset.seg, i = +el.dataset.i;
  const segments = p.segments.map((s, k) => k === seg ? { ...s, cues: (s.cues || []).filter((_, j) => j !== i) } : s);
  S.update("services", id, { segments }); Actions["cue-edit"]({ dataset: { seg } }); render();
};
