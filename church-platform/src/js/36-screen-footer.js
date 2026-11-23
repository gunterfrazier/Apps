// ---------- Logo and information on slides and screens ----------
// A church can put its logo, its website or phone, and a line of its own on every presentation slide and signage
// screen, in the corner or along the edge it chooses, or nowhere. Admin, Slides and screens footer sets it.

const FOOTER_POSITIONS = [
  ["top-left", "Top left"], ["top-center", "Top center"], ["top-right", "Top right"],
  ["bottom-left", "Bottom left"], ["bottom-center", "Bottom center"], ["bottom-right", "Bottom right"],
];
const screenFooterOf = (c) => ({
  slides: false, signage: false, logo: "church", text: "", website: true, phone: false,
  position: "bottom-right", size: "m", hideOnMedia: true, ...(c?.screenFooter || {}),
});
/** The logos a footer can use: the account logo and every logo in the banner's library (including clear and white copies). */
function footerLogoChoices(c) {
  const list = [];
  if (c.logo) list.push(["church", "Account logo", c.logo]);
  (bannerOf(c).logos || []).forEach((l) => list.push([l.id, l.name, l.src]));
  return list;
}
function footerLogoSrc(c, f) {
  if (f.logo === "none") return "";
  return footerLogoChoices(c).find(([id]) => id === f.logo)?.[2] || (f.logo === "church" ? c.logo || "" : "");
}
/** The footer itself. where: "slides" or "signage". kind: the slide's kind, to stay off full-screen media. */
function screenFooterHtml(c, where, kind = "", f = screenFooterOf(c)) {
  if (!c || !f[where] || kind === "black" || kind === "logo" || kind === "kids" || (f.hideOnMedia && (kind === "media" || kind === "video"))) return "";
  const src = footerLogoSrc(c, f);
  const lines = [f.text, f.website && c.website ? c.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "", f.phone && c.phone ? c.phone : ""].filter(Boolean);
  if (!src && !lines.length) return "";
  // "custom": the logo and the words each sit where they were dragged (centre point, % of the screen), at their own size.
  if (f.position === "custom") {
    const at = (p, z) => `left:${+p.x}%;top:${+p.y}%;zoom:${+z || 1}`;
    return html`<div class="sfoot custom sz-${f.size} in-${where}" aria-hidden="true">
      ${src ? html`<img class="sfoot-logo sfoot-free" data-part="logo" src="${src}" alt="" style="${at(f.logoAt || { x: 88, y: 88 }, f.logoZoom)}">` : ""}
      ${lines.length ? html`<div class="sfoot-text sfoot-free" data-part="text" style="${at(f.textAt || { x: 50, y: 92 }, f.textZoom)}">${lines.map((l) => html`<span>${l}</span>`)}</div>` : ""}</div>`;
  }
  return html`<div class="sfoot ${f.position} sz-${f.size} in-${where}" aria-hidden="true">
    ${src ? html`<img class="sfoot-logo" src="${src}" alt="">` : ""}
    ${lines.length ? html`<div class="sfoot-text">${lines.map((l) => html`<span>${l}</span>`)}</div>` : ""}</div>`;
}

AdminScreens.screenfooter = () => {
  const c = S.church();
  if (!S.can("manage.church") && !S.can("manage.devices")) return { redirect: "admin" };
  const f = screenFooterOf(c), logos = footerLogoChoices(c);
  const preview = (ff) => html`<div class="sfoot-previews">
    <div><b class="faint">A slide</b><div class="stage">${slideHtml({ kind: "title", title: "Grace upon grace", body: "John 1:16" }, { ...c, screenFooter: { ...ff, slides: false } })}${screenFooterHtml(c, "slides", "title", { ...ff, slides: true })}</div></div>
    <div><b class="faint">A lobby screen</b><div class="sg-stage theme-brand" style="--b:${c.color}"><div class="sg-slide sg-welcome" style="background:${raw(esc(bannerBackground(bannerOf(c), c.color)))}"><div class="sg-pad sg-center"><div class="sg-big">Welcome</div></div></div>${screenFooterHtml(c, "signage", "welcome", { ...ff, signage: true })}</div></div>
  </div>`;
  return {
    title: "Slides and screens footer", back: "admin-appearance", tab: "home",
    body: html`<p class="muted" style="margin-top:14px">Show your logo and a line or two of information on every presentation slide and lobby screen. Choose where it sits, or leave it off.</p>
      <form data-form="screen-footer" data-input="screen-footer-live" novalidate>
        <div id="sfoot-preview">${preview(f)}</div>
        <section class="sec"><h2 class="sec-head">Show it on</h2><div class="rows">
          <label class="row switch-row"><span class="body"><span class="t">Presentation slides</span><span class="s">Sermons, songs and service plans, on every screen they play on</span></span><input type="checkbox" class="switch" name="slides" ${attr(f.slides, "checked")}></label>
          <label class="row switch-row"><span class="body"><span class="t">Digital signage</span><span class="s">Lobby and hallway playlists</span></span><input type="checkbox" class="switch" name="signage" ${attr(f.signage, "checked")}></label>
          <label class="row switch-row"><span class="body"><span class="t">Leave photos and videos clear</span><span class="s">Not on slides that are a full-screen picture or video</span></span><input type="checkbox" class="switch" name="hideOnMedia" ${attr(f.hideOnMedia, "checked")}></label>
        </div></section>
        <section class="sec"><h2 class="sec-head">Where</h2>
          <div class="pos-grid" role="radiogroup" aria-label="Where on the screen">${FOOTER_POSITIONS.map(([k, l]) => html`<label class="pos-cell ${k}"><input type="radio" name="position" value="${k}" ${attr(f.position === k, "checked")}><span>${l}</span></label>`)}</div>
          <label class="pos-own"><input type="radio" name="position" value="custom" ${attr(f.position === "custom", "checked")}><span>${icon("grip")}Your own spot: drag the logo and the words on the slide above, and pinch (or Ctrl and scroll) to resize them</span></label>
          <input type="hidden" name="lx" value="${f.logoAt?.x ?? 88}"><input type="hidden" name="ly" value="${f.logoAt?.y ?? 88}"><input type="hidden" name="lz" value="${f.logoZoom || 1}">
          <input type="hidden" name="tx" value="${f.textAt?.x ?? 50}"><input type="hidden" name="ty" value="${f.textAt?.y ?? 92}"><input type="hidden" name="tz" value="${f.textZoom || 1}"></section>
        <section class="sec"><h2 class="sec-head">Logo</h2>
          <div class="logo-picks"><label class="logo-pick"><input type="radio" name="logo" value="none" ${attr(f.logo === "none", "checked")}><span class="lp-img">${icon("x")}</span><small>No logo</small></label>
            ${logos.map(([id, name, src]) => html`<label class="logo-pick"><input type="radio" name="logo" value="${id}" ${attr(f.logo === id, "checked")}><span class="lp-img"><img src="${src}" alt=""></span><small>${name}</small></label>`)}</div>
          <p class="faint">For a logo without its background, or all in white for dark slides, open <a href="#admin-banner">Home banner</a>, Logo, then Remove background. Copies you save there show up here.</p>
          <fieldset class="field" style="border:0;padding:0"><legend>Size</legend><div class="radios">${[["s", "Small"], ["m", "Medium"], ["l", "Large"]].map(([k, l]) => html`<label><input type="radio" name="size" value="${k}" ${attr(f.size === k, "checked")}><span>${l}</span></label>`)}</div></fieldset></section>
        <section class="sec"><h2 class="sec-head">Information</h2>
          <label class="field"><span>Your own line (optional)</span><input type="text" name="text" value="${f.text}" maxlength="70" placeholder="Wi-Fi: Guest, password grace2024"></label>
          <label class="check"><input type="checkbox" name="website" ${attr(f.website, "checked")}><span>Website${c.website ? html` <small class="faint">(${c.website.replace(/^https?:\/\//, "")})</small>` : html` <small class="faint">(add one in Account details)</small>`}</span></label>
          <label class="check"><input type="checkbox" name="phone" ${attr(f.phone, "checked")}><span>Phone${c.phone ? html` <small class="faint">(${c.phone})</small>` : ""}</span></label></section>
        <div class="btns"><button class="btn">Save</button></div>
      </form>`,
  };
};
const footerFromForm = (form) => {
  const fd = new FormData(form);
  return { slides: fd.has("slides"), signage: fd.has("signage"), hideOnMedia: fd.has("hideOnMedia"), position: fd.get("position") || "bottom-right",
    logo: fd.get("logo") || "none", size: fd.get("size") || "m", text: (fd.get("text") || "").trim().slice(0, 70), website: fd.has("website"), phone: fd.has("phone"),
    logoAt: { x: Math.round(+fd.get("lx")), y: Math.round(+fd.get("ly")) }, textAt: { x: Math.round(+fd.get("tx")), y: Math.round(+fd.get("ty")) },
    logoZoom: Math.round(+fd.get("lz") * 100) / 100 || 1, textZoom: Math.round(+fd.get("tz") * 100) / 100 || 1 };
};
Inputs["screen-footer-live"] = (form) => {
  const c = S.church(), f = footerFromForm(form), box = $("#sfoot-preview");
  if (!box) return;
  $$(".sfoot", box).forEach((el) => el.remove());
  const [slide, sign] = $$(".stage, .sg-stage", box);
  slide?.insertAdjacentHTML("beforeend", flat(screenFooterHtml(c, "slides", "title", { ...f, slides: true })));
  sign?.insertAdjacentHTML("beforeend", flat(screenFooterHtml(c, "signage", "welcome", { ...f, signage: true })));
};
document.addEventListener("change", (e) => { const f = e.target.closest?.('form[data-form="screen-footer"]'); if (f) Inputs["screen-footer-live"](f); });
Forms["screen-footer"] = (d, form) => {
  S.updateChurch({ screenFooter: footerFromForm(form) });
  toast("Saved. Screens update the next time they change slides.");
  render();
};

// ----- Your own spot: drag the logo or the words on the slide preview; pinch to resize -----
/** Starting your own spot from a corner: the pieces start where that corner put them. */
function footerToCustom(form) {
  const stage = $("#sfoot-preview .stage"), r = stage?.getBoundingClientRect(); if (!r) return;
  [["logo", ".sfoot-logo", "lx", "ly"], ["text", ".sfoot-text", "tx", "ty"]].forEach(([, sel, kx, ky]) => {
    const el = $(`.sfoot ${sel}`, stage); if (!el) return; const b = el.getBoundingClientRect();
    form.elements[kx].value = Math.round(((b.left + b.width / 2 - r.left) / r.width) * 100);
    form.elements[ky].value = Math.round(((b.top + b.height / 2 - r.top) / r.height) * 100);
  });
  form.elements.position.value = "custom";
}
document.addEventListener("pointerdown", (e) => {
  const part = e.target.closest?.("#sfoot-preview .stage .sfoot-logo, #sfoot-preview .stage .sfoot-text");
  if (!part || Pinch.active || e.button > 0) return;
  const form = part.closest("form"), stage = part.closest(".stage"); e.preventDefault();
  if (form.elements.position.value !== "custom") { footerToCustom(form); Inputs["screen-footer-live"](form); }
  const logo = part.classList.contains("sfoot-logo"), [kx, ky] = logo ? ["lx", "ly"] : ["tx", "ty"];
  const r = stage.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, sx = +form.elements[kx].value, sy = +form.elements[ky].value;
  const move = (ev) => {
    if (Pinch.active) return;
    form.elements[kx].value = Math.max(2, Math.min(98, sx + ((ev.clientX - x0) / r.width) * 100));
    form.elements[ky].value = Math.max(3, Math.min(97, sy + ((ev.clientY - y0) / r.height) * 100));
    Inputs["screen-footer-live"](form);
  };
  const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
});
onPinch("#sfoot-preview .stage", {
  start(target, stage) {
    const form = stage.closest("form"), part = target.closest(".sfoot-logo, .sfoot-text") || $(".sfoot-logo, .sfoot-text", stage);
    if (!part) return null;
    if (form.elements.position.value !== "custom") { footerToCustom(form); Inputs["screen-footer-live"](form); }
    const k = part.classList.contains("sfoot-logo") ? "lz" : "tz";
    return { form, k, z: +form.elements[k].value || 1 };
  },
  change(st, scale) { st.form.elements[st.k].value = Math.max(0.4, Math.min(3, st.z * scale)); Inputs["screen-footer-live"](st.form); },
});
