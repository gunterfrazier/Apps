// ---------- Home banner: background, logo, graphics and text art, designed by the church ----------
// The banner replaces the old letterboard. Admins with "Landing page, branding and links" design it with a live preview.

const BANNER_PRESETS = {
  aurora: { label: "Aurora", css: "radial-gradient(120% 90% at 8% 0%, color-mix(in srgb, var(--b) 50%, #8b7bff) 0%, transparent 60%), radial-gradient(90% 80% at 100% 18%, color-mix(in srgb, var(--b) 45%, #3fd0ff) 0%, transparent 55%), radial-gradient(100% 90% at 50% 125%, color-mix(in srgb, var(--b) 55%, #ff8fb1) 0%, transparent 60%), var(--b)" },
  sunrise: { label: "Sunrise", css: "linear-gradient(160deg, color-mix(in srgb, var(--b) 30%, #ffb36b) 0%, var(--b) 55%, color-mix(in srgb, var(--b) 65%, #241540) 100%)" },
  deep: { label: "Deep", css: "radial-gradient(85% 75% at 78% 12%, color-mix(in srgb, var(--b) 60%, #ffffff) 0%, transparent 55%), linear-gradient(180deg, var(--b), color-mix(in srgb, var(--b) 50%, #000))" },
  meadow: { label: "Meadow", css: "linear-gradient(135deg, color-mix(in srgb, var(--b) 40%, #8ee6b0) 0%, var(--b) 58%, color-mix(in srgb, var(--b) 70%, #0b2a22) 100%)" },
  dusk: { label: "Dusk", css: "linear-gradient(200deg, color-mix(in srgb, var(--b) 40%, #ff7a59) 0%, color-mix(in srgb, var(--b) 70%, #6c3fd1) 55%, color-mix(in srgb, var(--b) 55%, #000) 100%)" },
  plain: { label: "Solid", css: "var(--b)" },
};
const TEXT_STYLES = { bold: "Bold", serif: "Elegant", script: "Handwritten", outline: "Outline", stacked: "Stacked", glow: "Glow", highlight: "Highlight" };
const GRAPHICS = {
  cross: { label: "Cross", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M43 6h14v28h27v14H57v46H43V48H16V34h27z" fill="${c}"/></svg>` },
  sparkle: { label: "Sparkle", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 2C53 35 65 47 98 50 65 53 53 65 50 98 47 65 35 53 2 50 35 47 47 35 50 2Z" fill="${c}"/></svg>` },
  sunburst: { label: "Sunburst", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="${c}" stroke-width="3" stroke-linecap="round">${Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; const r1 = i % 2 ? 18 : 14, r2 = i % 2 ? 40 : 48; return `<line x1="${(50 + Math.cos(a) * r1).toFixed(1)}" y1="${(50 + Math.sin(a) * r1).toFixed(1)}" x2="${(50 + Math.cos(a) * r2).toFixed(1)}" y2="${(50 + Math.sin(a) * r2).toFixed(1)}"/>`; }).join("")}</g><circle cx="50" cy="50" r="9" fill="${c}"/></svg>` },
  rings: { label: "Rings", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="2.5">${[46, 36, 26, 16].map((r) => `<circle cx="50" cy="50" r="${r}"/>`).join("")}</svg>` },
  waves: { label: "Waves", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round">${[12, 30, 48].map((y) => `<path d="M2 ${y}c12-10 20-10 32 0s20 10 32 0 20-10 32 0"/>`).join("")}</svg>` },
  leaf: { label: "Leaves", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="${c}"><path d="M50 95V30" stroke="${c}" stroke-width="3" fill="none"/><path d="M50 60C30 58 20 45 22 28 40 30 50 42 50 60Z"/><path d="M50 45C68 43 78 30 76 14 58 16 50 28 50 45Z"/><path d="M50 80C70 79 82 66 80 50 62 51 50 62 50 80Z"/></svg>` },
  dots: { label: "Dots", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="${c}">${Array.from({ length: 49 }, (_, i) => `<circle cx="${8 + (i % 7) * 14}" cy="${8 + Math.floor(i / 7) * 14}" r="${2 + ((i % 7) + Math.floor(i / 7)) / 6}"/>`).join("")}</svg>` },
  dove: { label: "Dove", svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${c}" d="M14 52c10-2 20 0 27 6-2-14 6-30 22-38-4 10-3 19 2 27 7-5 16-7 26-5-6 3-10 8-12 14l10 4c-10 3-19 2-26-2-6 12-19 20-36 20 6-4 10-9 12-15-9 1-18-4-25-11z"/></svg>` },
};
const graphicSrc = (g) => g.kind === "builtin" ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(GRAPHICS[g.builtin]?.svg(g.color || "#ffffff") || "")}` : g.src;

/** A church's banner, built from its old sign the first time. */
function bannerOf(c) {
  if (c.banner) return c.banner;
  const lines = (c.sign || []).filter(Boolean);
  return {
    bg: { type: "gradient", preset: "aurora", color: c.color, image: "", dim: 35 },
    logo: { size: "md", align: "left" },
    text: { headline: lines[0] || "Welcome", sub: lines[1] || c.tagline || "", style: "bold", size: "l", align: "left", color: "auto", shadow: true },
    graphics: [{ id: "g1", kind: "builtin", builtin: "sparkle", color: "#ffffff", x: 86, y: 22, size: 16, rotate: 0, opacity: 70 }, { id: "g2", kind: "builtin", builtin: "rings", color: "#ffffff", x: 96, y: 92, size: 46, rotate: 0, opacity: 22 }],
    height: "tall",
  };
}
function bannerTextColor(b, churchColor) {
  if (b.text.color === "white") return "#ffffff";
  if (b.text.color === "dark") return "#111827";
  if (b.text.color === "brand") return churchColor;
  if (/^#[0-9a-f]{6}$/i.test(b.text.color || "")) return b.text.color; // a brand color from the logo
  if (b.bg.type === "image" && b.bg.image) return "#ffffff";
  return onColor(b.bg.type === "color" ? b.bg.color || churchColor : churchColor);
}
function bannerBackground(b, color) {
  if (b.bg.type === "image" && b.bg.image) return `linear-gradient(rgba(0,0,0,${(b.bg.dim ?? 35) / 100}), rgba(0,0,0,${(b.bg.dim ?? 35) / 100})), url("${b.bg.image}") center / cover no-repeat`;
  if (b.bg.type === "color") return b.bg.color || color;
  if (b.bg.preset === "logo" && b.bg.colors?.length >= 2) return logoGradient(b.bg.colors);
  return (BANNER_PRESETS[b.bg.preset] || BANNER_PRESETS.aurora).css;
}
/** A gradient from the logo's brand colors. */
const logoGradient = ([a, b2, c3]) => `radial-gradient(circle at 85% 15%, ${c3 || b2}55, transparent 45%), linear-gradient(135deg, ${a}, ${b2})`;
const bannerLogoAsset = (b) => (b.logos || []).find((logo) => logo.id === b.logo.assetId);
const bannerLogoSrc = (c, b) => bannerLogoAsset(b)?.src || c.logo || "";

/** The banner itself. mini: no text (for church cards). */
function bannerHtml(c, b = bannerOf(c), { mini = false, name = false } = {}) {
  const color = b.bg.type === "color" ? b.bg.color || c.color : c.color;
  const ink = bannerTextColor(b, c.color);
  const words = String(b.text.headline || "").trim().split(/\s+/).filter(Boolean);
  const logoSrc = bannerLogoSrc(c, b);
  const logo = b.logo.size !== "off" ? (logoSrc ? html`<img class="bn-logo ${b.logo.size} ${b.logo.frame === "none" ? "bare" : ""}" src="${logoSrc}" alt="">` : html`<span class="bn-logo mono ${b.logo.size}" style="background:${onColor(c.color) === "#ffffff" ? "#ffffff" : "#111827"};color:${c.color}">${initials(c.name)}</span>`) : "";
  return html`<div class="banner ${mini ? "mini" : b.height || "tall"} align-${b.text.align || "left"}" style="--b:${color};--bink:${ink};background:${raw(esc(bannerBackground(b, color)))}" role="img" aria-label="${[c.name, b.text.headline, b.text.sub].filter(Boolean).join(". ")}">
    ${(b.graphics || []).map((g) => html`<img class="bn-graphic" alt="" src="${graphicSrc(g)}" data-move="g:${g.id}" ${attr(g.locked || b.locked, "data-locked")} style="left:${g.x}%;top:${g.y}%;width:${g.size}%;opacity:${(g.opacity ?? 100) / 100};transform:translate(-50%,-50%) rotate(${g.rotate || 0}deg)">`)}
    ${!mini && logo && b.logo.pos ? html`<div class="bn-free bn-free-logo" data-move="logo" ${attr(b.logo.locked || b.locked, "data-locked")} style="left:${b.logo.pos.x}%;top:${b.logo.pos.y}%;zoom:${b.logo.scale || 1}">${logo}</div>` : ""}
    ${b.logo.align === "top" && !mini && logo && !b.logo.pos ? html`<div class="bn-top" data-move="logo" style="zoom:${b.logo.scale || 1}">${logo}</div>` : ""}
    <div class="bn-content">
      ${!mini ? html`<div class="bn-text ${b.text.pos ? "bn-free" : ""}" data-move="text" ${attr(b.text.locked || b.locked, "data-locked")} style="${raw(`zoom:${+(b.text.scale || 1)};${b.text.pos ? `left:${+b.text.pos.x}%;top:${+b.text.pos.y}%` : ""}`)}">${b.logo.align !== "top" && !b.logo.pos && logo ? html`<span class="bn-logo-wrap" data-move="logo" ${attr(b.logo.locked || b.locked, "data-locked")} style="zoom:${(b.logo.scale || 1) / (b.text.scale || 1)}">${logo}</span>` : ""}
        ${name ? html`<p class="bn-name">${c.name}</p>` : ""}
        ${words.length ? html`<h2 class="bn-head st-${b.text.style} sz-${b.text.size} ${b.text.shadow ? "shadow" : ""}" ${b.text.font ? raw(` style="${esc(fontCss(b.text.font))}"`) : ""}>${b.text.style === "stacked" ? words.map((w, i) => html`<span class="${i % 2 ? "thin" : ""}">${w}</span>`) : b.text.style === "highlight" ? html`<span class="mark">${b.text.headline}</span>` : b.text.headline}</h2>` : ""}
        ${b.text.sub ? html`<p class="bn-sub ${b.text.shadow ? "shadow" : ""}" ${b.text.subFont && b.text.font ? raw(` style="${esc(fontCss(b.text.font).replace(/font-weight:\d+;/, ""))}"`) : ""}>${b.text.sub}</p>` : ""}</div>` : ""}</div>
  </div>`;
}

// ---------- Arranging: drag pieces in the preview, then lock them ----------
/** The pieces of the banner, each with its lock and a way back to where the app puts it. */
function bannerArrangeList(b) {
  const pieces = [["text", "Headline and smaller line", !!b.text.pos, b.text.locked], ["logo", "Logo", !!b.logo.pos, b.logo.locked],
    ...(b.graphics || []).map((g) => [`g:${g.id}`, g.kind === "builtin" ? GRAPHICS[g.builtin]?.label || "Graphic" : "Your graphic", true, g.locked])];
  return html`<b>Arrange</b><p class="faint" style="margin:4px 0 10px">Drag the headline, logo and graphics in the preview to place them. Lock them when they're where you want, so they can't move by accident.</p>
    <div class="rows arrange-rows">${pieces.map(([key, label, placed, locked]) => html`<div class="row"><span class="lead-ic">${icon(locked || b.locked ? "lock" : "expand")}</span>
      <span class="body"><span class="t">${label}</span><span class="s">${locked || b.locked ? "Locked in place" : placed ? "Placed by you" : "Placed automatically"}</span></span>
      ${placed && !key.startsWith("g:") ? html`<button type="button" class="btn ghost sm" data-act="banner-place-auto" data-key="${key}" ${attr(locked || b.locked, "disabled")}>Automatic</button>` : ""}
      <button type="button" class="btn ${locked ? "" : "ghost "}sm" data-act="banner-lock" data-key="${key}" aria-pressed="${!!locked}" ${attr(b.locked, "disabled")}>${locked ? "Unlock" : "Lock"}</button></div>`)}</div>
    <div class="btns"><button type="button" class="btn ${b.locked ? "" : "ghost "}sm" data-act="banner-lock-all" aria-pressed="${!!b.locked}">${icon("lock")}${b.locked ? "Unlock everything" : "Lock everything"}</button></div>`;
}
function refreshBannerArrange() {
  const box = $("#banner-arrange"), c = S.church();
  if (box) box.innerHTML = flat(bannerArrangeList(bannerDraft));
  const prev = $("#banner-preview"); if (prev) prev.innerHTML = flat(bannerHtml(c, bannerDraft));
  if (bannerSelected) $$("#banner-preview [data-move]").forEach((x) => x.classList.toggle("sel", x.dataset.move === bannerSelected));
}
const bannerPiece = (b, key) => key === "text" ? b.text : key === "logo" ? b.logo : (b.graphics || []).find((g) => `g:${g.id}` === key);
Actions["banner-lock"] = (el) => {
  keepDraft(); const key = el.dataset.key, p = bannerPiece(bannerDraft, key); if (!p) return;
  p.locked = !p.locked; refreshBannerArrange(); syncBannerLocks();
  toast(p.locked ? "Locked in place" : "Unlocked");
};
/** Lock buttons everywhere show the same thing, and a locked graphic's place, size and turn can't be changed. */
function syncBannerLocks() {
  const f = bannerForm(); if (!f || !bannerDraft) return;
  $$("[data-act=banner-lock][data-key]", f).forEach((b) => {
    const p = bannerPiece(bannerDraft, b.dataset.key), on = !!p?.locked;
    b.setAttribute("aria-pressed", String(on));
    const label = b.querySelector(".lbl"); if (label) label.textContent = on ? "Locked" : "Lock";
    b.classList.toggle("on", on);
  });
  (bannerDraft.graphics || []).forEach((g, i) => ["size", "x", "y", "rotate"].forEach((k) => { const r = $(`input[name="g${i}_${k}"]`, f); if (r) r.disabled = !!(g.locked || bannerDraft.locked); }));
}
Actions["banner-lock-all"] = () => { keepDraft(); bannerDraft.locked = !bannerDraft.locked; refreshBannerArrange(); syncBannerLocks(); toast(bannerDraft.locked ? "Everything is locked in place" : "Unlocked"); };
Actions["banner-place-auto"] = (el) => { keepDraft(); const p = bannerPiece(bannerDraft, el.dataset.key); if (p) { delete p.pos; p.locked = false; } refreshBannerArrange(); };
// Dragging in the preview. Pieces move as a percentage of the banner, so they land in the same place at every width.
document.addEventListener("pointerdown", (e) => {
  const piece = e.target.closest?.("#banner-preview [data-move]");
  if (!piece || !bannerDraft || e.button > 0 || Pinch.active) return;
  // A locked piece can't move, but tapping it still picks it, so its settings come up.
  if (piece.hasAttribute("data-locked")) { selectBannerPiece(piece.dataset.move); return; }
  // Read the form first: it replaces the text and logo settings, and the drag has to move the current ones.
  keepDraft();
  const banner = piece.closest(".banner"), box = banner.getBoundingClientRect(), key = piece.dataset.move, p = bannerPiece(bannerDraft, key);
  if (!p) return;
  e.preventDefault();
  const r = piece.getBoundingClientRect();
  const start = key.startsWith("g:") ? { x: p.x, y: p.y } : p.pos || { x: ((r.left + r.width / 2) - box.left) / box.width * 100, y: ((r.top + r.height / 2) - box.top) / box.height * 100 };
  const x0 = e.clientX, y0 = e.clientY;
  let moved = false, pinched = false;
  piece.setPointerCapture?.(e.pointerId);
  piece.classList.add("dragging");
  const move = (ev) => {
    if (Pinch.active || pinched) { pinched = true; return; } // two fingers: that's a pinch, not a drag
    const x = Math.max(0, Math.min(100, start.x + (ev.clientX - x0) / box.width * 100)), y = Math.max(0, Math.min(100, start.y + (ev.clientY - y0) / box.height * 100));
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
    if (!moved && !key.startsWith("g:") && !p.pos) { p.pos = start; $("#banner-preview").innerHTML = flat(bannerHtml(S.church(), bannerDraft)); }
    moved = true;
    if (key.startsWith("g:")) { p.x = Math.round(x); p.y = Math.round(y); } else p.pos = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    const el = $(`#banner-preview [data-move="${key}"]`);
    if (el) { el.style.left = `${key.startsWith("g:") ? p.x : p.pos.x}%`; el.style.top = `${key.startsWith("g:") ? p.y : p.pos.y}%`; }
  };
  const up = () => {
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
    piece.classList.remove("dragging");
    if (!moved) { if (!pinched && !Pinch.active) selectBannerPiece(key); return; }
    // Graphics keep their sliders in step.
    if (key.startsWith("g:")) { const i = bannerDraft.graphics.indexOf(p), f = bannerForm(); ["x", "y"].forEach((k) => { const r = f && $(`input[name="g${i}_${k}"]`, f); if (r) { r.value = p[k]; if (r.nextElementSibling) r.nextElementSibling.textContent = `${p[k]}%`; } }); }
    refreshBannerArrange();
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
});

// ----- Picking a piece in the preview, and pinching it to resize (and twist a graphic to turn it) -----
let bannerSelected = "";
/** Tapping a piece in the preview opens its settings and marks it, so it's clear what's being changed. */
function selectBannerPiece(key) {
  bannerSelected = key;
  const f = bannerForm(); if (!f) return;
  $$("#banner-preview [data-move]").forEach((el) => el.classList.toggle("sel", el.dataset.move === key));
  showBannerSection(f, key === "text" ? "text" : key === "logo" ? "logo" : "graphics");
  const i = key.startsWith("g:") ? bannerDraft.graphics.findIndex((g) => `g:${g.id}` === key) : -1;
  $$(".graphic-row", f).forEach((row, n) => row.classList.toggle("sel", n === i));
  const target = i >= 0 ? $$(".graphic-row", f)[i] : $(`#banner-${key === "text" ? "text" : "logo"}`);
  target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Puts a value into its slider and the number beside it. */
function setBannerRange(name, value, unit = "%") {
  const r = bannerForm() && $(`input[name="${name}"]`, bannerForm());
  if (r) { r.value = value; if (r.nextElementSibling) r.nextElementSibling.textContent = `${value}${unit}`; }
}
onPinch("#banner-preview .banner", {
  start(target) {
    if (!bannerDraft || !bannerForm()) return null;
    keepDraft();
    const el = target.closest("[data-move]"), key = el?.dataset.move || bannerSelected;
    const p = key && bannerPiece(bannerDraft, key);
    if (!p) { toast("Tap a graphic, the headline or the logo first, then pinch it"); return null; }
    if (p.locked || bannerDraft.locked) { toast("That's locked. Unlock it to resize it."); return null; }
    selectBannerPiece(key);
    return key.startsWith("g:") ? { key, p, size: p.size, rotate: p.rotate || 0 } : { key, p, scale: p.scale || 1 };
  },
  change(st, scale, turn) {
    const el = $(`#banner-preview [data-move="${st.key}"]`);
    if (st.key.startsWith("g:")) {
      const i = bannerDraft.graphics.indexOf(st.p);
      st.p.size = Math.round(clampN(st.size * scale, 4, 120));
      // Turning snaps to straight within a few degrees, so a pinch doesn't tilt it by accident.
      let r = Math.round(st.rotate + turn); if (Math.abs(r % 90) < 5 || Math.abs(r % 90) > 85) r = Math.round(r / 90) * 90;
      st.p.rotate = ((r + 540) % 360) - 180;
      if (el) { el.style.width = `${st.p.size}%`; el.style.transform = `translate(-50%,-50%) rotate(${st.p.rotate}deg)`; }
      setBannerRange(`g${i}_size`, st.p.size); setBannerRange(`g${i}_rotate`, st.p.rotate, "°");
    } else {
      st.p.scale = Math.round(clampN(st.scale * scale, 0.5, 2.5) * 100) / 100;
      setBannerRange(st.key === "text" ? "textScale" : "logoScale", Math.round(st.p.scale * 100));
      $("#banner-preview").innerHTML = flat(bannerHtml(S.church(), bannerDraft));
      $$("#banner-preview [data-move]").forEach((x) => x.classList.toggle("sel", x.dataset.move === st.key));
    }
  },
  end() { refreshBannerArrange(); },
});

// ---------- The banner designer ----------
const BANNER_SECTIONS = { background: "Background", logo: "Logo", text: "Text", graphics: "Graphics", layout: "Layout" };
let bannerDraft = null, bannerDraftFor = "", bannerSection = "background", bannerPhonePreview = false, bannerPreviewSmall = false;
const bannerScope = () => JSON.stringify([S.church()?.id, S.me().id]);
const bannerForm = () => $('form[data-form="banner-save"]');
function renderBannerEditor(back = "admin") {
  const blocked = guard("manage.page"); if (blocked) return blocked;
  const c = S.church();
  if (bannerDraftFor !== bannerScope() || !bannerDraft) {
    bannerDraft = structuredClone(bannerOf(c));
    bannerDraft.logos ||= [];
    bannerDraftFor = bannerScope();
    bannerSection = "background";
  }
  const b = bannerDraft;
  const pane = (name, content) => html`<section class="banner-pane" id="banner-${name}" data-banner-pane="${name}" ${attr(bannerSection !== name, "hidden")}>
    <h2 class="sec-head">${BANNER_SECTIONS[name]}</h2>${content}</section>`;
  const opt = (name, value, label, cur) => html`<label><input type="radio" name="${name}" value="${value}" ${attr(cur === value, "checked")}><span>${label}</span></label>`;
  const range = (name, label, value, min, max, unit = "", off = false) => html`<label class="range"><span>${label}</span><input type="range" name="${name}" min="${min}" max="${max}" value="${value}" ${attr(off, "disabled")}><output>${value}${unit}</output></label>`;
  ensurePalette(c);
  const palette = brandPalette(c);
  // A lock button for a piece, the same everywhere it appears.
  const lockBtn = (key, locked) => html`<button type="button" class="btn ghost sm lock-btn ${locked ? "on" : ""}" data-act="banner-lock" data-key="${key}" aria-pressed="${!!locked}" ${attr(b.locked, "disabled")}>${icon("lock")}<span class="lbl">${locked ? "Locked" : "Lock"}</span></button>`;
  // Color choices as swatches: the fixed ones, then the logo's brand colors.
  const colorRadios = (name, choices, cur) => html`<div class="radios swatch-radios">${choices.map(([v, l]) => html`<label title="${l}"><input type="radio" name="${name}" value="${v}" ${attr(cur === v, "checked")}><span>${/^#/.test(v) ? html`<i style="background:${v}"></i>` : ""}${l}</span></label>`)}</div>`;
  const brandChoices = palette.map((col, n) => [col, n === 0 ? "Logo color" : `Logo color ${n + 1}`]);
  return {
    title: "Home banner", back,
    body: html`<form data-form="banner-save" data-input="banner-live" class="banner-form" novalidate>
      <input type="hidden" name="returnTo" value="${back}">
      <div class="banner-workspace">
        <aside class="banner-preview-shell ${bannerPreviewSmall ? "small" : ""}" aria-label="Banner preview">
          <div class="banner-preview-head"><h2>Live preview</h2>
            <button type="button" class="chip banner-preview-size" data-act="banner-preview-size" aria-pressed="${bannerPreviewSmall}">${bannerPreviewSmall ? "Bigger preview" : "Smaller preview"}</button>
            <div class="banner-preview-width" role="group" aria-label="Preview width">
              <button type="button" class="chip" data-act="banner-preview-width" data-width="phone" aria-pressed="${bannerPhonePreview}">Phone</button>
              <button type="button" class="chip" data-act="banner-preview-width" data-width="wide" aria-pressed="${!bannerPhonePreview}">Wide</button>
            </div>
          </div>
          <div class="banner-preview" id="banner-preview" data-width="${bannerPhonePreview ? "phone" : "wide"}">${bannerHtml(c, b)}</div>
          <p class="faint banner-preview-tip">Tap a piece to edit it, drag to move it, pinch to resize it${"ontouchstart" in window ? "" : " (or Ctrl and scroll)"}. Twist a graphic with two fingers to turn it.</p>
        </aside>
        <div class="banner-tools">
          <nav class="banner-sections" aria-label="Banner settings">${Object.entries(BANNER_SECTIONS).map(([key, label]) =>
            html`<button type="button" class="chip" data-act="banner-section" data-section="${key}" aria-controls="banner-${key}" aria-pressed="${bannerSection === key}">${label}</button>`)}</nav>
        ${pane("text", html`<div class="panel">
          <div class="pane-lock">${lockBtn("text", b.text.locked)}<span class="faint">Locking keeps the words where they are and at this size.</span></div>
          <label class="field" style="margin-top:0"><span>Headline</span><input type="text" name="headline" value="${b.text.headline}" maxlength="40"></label>
          <label class="field"><span>Smaller line</span><input type="text" name="sub" value="${b.text.sub}" maxlength="80" placeholder="Sundays at 9 and 11"></label>
          <fieldset class="field" style="border:0;padding:0"><legend>Style</legend><div class="style-picks">${Object.entries(TEXT_STYLES).map(([k, l]) => html`<label><input type="radio" name="style" value="${k}" ${attr(b.text.style === k, "checked")}><span class="st-${k}"><span class="${k === "highlight" ? "mark" : ""}">${l}</span></span></label>`)}</div></fieldset>
          <fieldset class="field" style="border:0;padding:0"><legend>Font</legend>${fontPicker("font", b.text.font, b.text.headline || "Welcome home")}
            <label class="check" style="margin-top:8px"><input type="checkbox" name="subFont" ${attr(b.text.subFont, "checked")}><span>Use this font for the smaller line too</span></label></fieldset>
          <div class="two"><fieldset class="field" style="border:0;padding:0"><legend>Size</legend><div class="radios">${opt("size", "m", "M", b.text.size)}${opt("size", "l", "L", b.text.size)}${opt("size", "xl", "XL", b.text.size)}</div></fieldset>
            <fieldset class="field" style="border:0;padding:0"><legend>Line up</legend><div class="radios">${opt("align", "left", "Left", b.text.align)}${opt("align", "center", "Center", b.text.align)}</div></fieldset></div>
          ${range("textScale", "Fine-tune the size", Math.round((b.text.scale || 1) * 100), 50, 250, "%", b.text.locked || b.locked)}
          <fieldset class="field" style="border:0;padding:0"><legend>Text color</legend>${colorRadios("color", [["auto", "Automatic"], ["white", "White"], ["dark", "Dark"], ["brand", "Church color"], ...brandChoices], b.text.color)}</fieldset>
          <label class="check"><input type="checkbox" name="shadow" ${attr(b.text.shadow, "checked")}><span>Soft shadow behind the text</span></label>
        </div>`)}

        ${pane("background", html`<div class="panel">
          <div class="radios">${opt("bgType", "gradient", "Gradient", b.bg.type)}${opt("bgType", "color", "Color", b.bg.type)}${opt("bgType", "image", "Photo", b.bg.type)}</div>
          <div class="preset-picks" ${attr(b.bg.type !== "gradient", "hidden")}>${palette.length >= 2 ? html`<label><input type="radio" name="preset" value="logo" ${attr(b.bg.preset === "logo", "checked")}><span style="background:${raw(esc(logoGradient(palette)))}"></span><small>Your logo's colors</small></label>` : ""}${Object.entries(BANNER_PRESETS).map(([k, p]) => html`<label><input type="radio" name="preset" value="${k}" ${attr(b.bg.preset === k, "checked")}><span style="--b:${c.color};background:${raw(esc(p.css))}"></span><small>${p.label}</small></label>`)}</div>
          <div class="field bg-color" ${attr(b.bg.type !== "color", "hidden")}><span>Color</span>${colorPicker("bgColor", b.bg.color || c.color, { sources: churchColorSources(c), label: "Banner color" })}</div>
          <div class="bg-image" ${attr(b.bg.type !== "image", "hidden")}>${imageField("bgImage", "Photo", b.bg.image, "A wide photo works best. It's resized so it loads fast.", 1800)}${range("dim", "Darken the photo", b.bg.dim ?? 35, 0, 75, "%")}</div>
        </div>`)}

        ${pane("logo", html`<div class="panel">
          <div class="banner-logo-library-head">
            <label class="btn sm banner-logo-upload">${icon("image")}Upload logos<input type="file" accept="image/*" multiple class="sr" data-change="banner-logo-upload"></label>
            <span class="faint" data-logo-status role="status"></span>
          </div>
          <fieldset class="banner-logo-library"><legend>Logo library</legend><div class="banner-logo-choices">
            ${[{ id: "", name: c.logo ? "Account logo" : "Church initials", src: c.logo || "" }, ...b.logos].map((asset) =>
              html`<label class="banner-logo-choice"><input type="radio" name="logoAsset" value="${asset.id}" ${attr((bannerLogoAsset(b)?.id || "") === asset.id, "checked")}>
                <span class="banner-logo-option">
                  <span class="banner-logo-swatch" aria-hidden="true">${asset.src ? html`<img src="${asset.src}" alt="">` : initials(c.name)}</span>
                  <span class="banner-logo-name">${asset.name}</span>
                </span>
              </label>`)}
          </div></fieldset>
          <div class="btns banner-logo-actions">
            <button type="button" class="btn ghost sm" data-act="banner-logo-clean" ${attr(!bannerLogoSrc(c, b), "hidden")}>Remove background</button>
            <button type="button" class="btn ghost sm" data-act="banner-logo-remove" ${attr(!bannerLogoAsset(b), "hidden")}>Remove from library</button>
          </div>
          <div class="pane-lock">${lockBtn("logo", b.logo.locked)}<span class="faint">Locking keeps the logo where it is and at this size.</span></div>
          <fieldset class="field"><legend>Size</legend><div class="radios">${opt("logoSize", "off", "Hide", b.logo.size)}${opt("logoSize", "sm", "Small", b.logo.size)}${opt("logoSize", "md", "Medium", b.logo.size)}${opt("logoSize", "lg", "Large", b.logo.size)}</div></fieldset>
          ${range("logoScale", "Fine-tune the size", Math.round((b.logo.scale || 1) * 100), 50, 250, "%", b.logo.locked || b.locked)}
          <fieldset class="field"><legend>Position</legend><div class="radios">${opt("logoAlign", "left", "With the text", b.logo.align)}${opt("logoAlign", "top", "Top of banner", b.logo.align)}</div></fieldset>
          <fieldset class="field" data-logo-frame ${attr(!bannerLogoSrc(c, b), "hidden")}><legend>Frame</legend><div class="radios">${opt("logoFrame", "none", "No frame", b.logo.frame || "tile")}${opt("logoFrame", "tile", "White tile", b.logo.frame || "tile")}</div></fieldset>
        </div>`)}

        ${pane("graphics", html`
          ${(b.graphics || []).map((g, i) => { const held = !!(g.locked || b.locked), fixed = [["#ffffff", "White"], ["#111827", "Dark"], [c.color, "Church color"], ["#f5c451", "Gold"], ...brandChoices].filter(([v], n, all) => all.findIndex(([w]) => w.toLowerCase() === v.toLowerCase()) === n);
            const custom = g.kind === "builtin" && !fixed.some(([v]) => v.toLowerCase() === (g.color || "").toLowerCase());
            return html`<div class="panel graphic-row ${bannerSelected === `g:${g.id}` ? "sel" : ""}"><div class="graphic-head"><img src="${graphicSrc({ ...g, color: g.kind === "builtin" ? (g.color === "#ffffff" ? "#667085" : g.color) : g.color })}" alt=""><b>${g.kind === "builtin" ? GRAPHICS[g.builtin]?.label : "Your graphic"}</b>
              ${lockBtn(`g:${g.id}`, g.locked)}
              <button type="button" class="icon-btn" data-act="banner-graphic-remove" data-i="${i}" aria-label="Remove graphic">${icon("trash")}</button></div>
            ${range(`g${i}_size`, "Size", g.size, 4, 120, "%", held)}${range(`g${i}_x`, "Left to right", g.x, 0, 100, "%", held)}${range(`g${i}_y`, "Top to bottom", g.y, 0, 100, "%", held)}${range(`g${i}_rotate`, "Turn", g.rotate || 0, -180, 180, "°", held)}${range(`g${i}_opacity`, "Strength", g.opacity ?? 100, 5, 100, "%")}
            ${g.kind === "builtin" ? html`${colorRadios(`g${i}_color`, [...fixed, ...(custom ? [[g.color, "Your color"]] : [])], g.color)}
              <label class="btn ghost sm g-any">${icon("edit")}Any color<input type="color" class="sr" value="${normHex(g.color, "#ffffff")}" data-input="g-any" data-i="${i}"></label>` : ""}
          </div>`; })}
          <div class="panel"><b>Add a graphic</b><div class="graphic-picks">${Object.entries(GRAPHICS).map(([k, g]) => html`<button type="button" data-act="banner-graphic-add" data-builtin="${k}" aria-label="Add ${g.label}"><img src="${graphicSrc({ kind: "builtin", builtin: k, color: "#475467" })}" alt=""><small>${g.label}</small></button>`)}</div>
            <label class="btn ghost sm" style="margin-top:10px">${icon("image")}Upload your own<input type="file" accept="image/*" class="sr" data-change="banner-graphic-upload"></label><small class="faint" style="display:block;margin-top:6px">PNG files with a see-through background work best.</small></div>
        `)}

        ${pane("layout", html`<div class="panel"><fieldset class="field"><legend>Banner height</legend><div class="radios">${opt("height", "compact", "Compact", b.height)}${opt("height", "tall", "Tall", b.height)}</div></fieldset></div>
          <div class="panel" id="banner-arrange">${bannerArrangeList(b)}</div>`)}
        </div>
      </div>
      <div class="btns sticky-save banner-save-bar"><button class="btn">Save banner</button><button type="button" class="btn ghost" data-act="banner-discard">Discard changes</button></div>
      </form>`,
  };
}
AdminScreens.banner = () => renderBannerEditor();
AdminScreens["banner-from-page"] = () => renderBannerEditor("admin-page");

function showBannerSection(form, section) {
  if (!Object.prototype.hasOwnProperty.call(BANNER_SECTIONS, section)) return;
  bannerSection = section;
  $$("[data-banner-pane]", form).forEach((pane) => { pane.hidden = pane.dataset.bannerPane !== section; });
  $$("[data-act=banner-section]", form).forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.section === section)));
}
Actions["banner-section"] = (button) => showBannerSection(button.form, button.dataset.section);
Actions["banner-preview-width"] = (button) => {
  bannerPhonePreview = button.dataset.width === "phone";
  $("#banner-preview").dataset.width = button.dataset.width;
  $$("[data-act=banner-preview-width]", button.form).forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
};
/** Reads the designer form into the draft and refreshes the preview, without re-rendering the form. */
function bannerFromForm(f) {
  const fd = new FormData(f), v = (k) => fd.get(k), b = bannerDraft;
  if (fd.has("textScale")) b.text.scale = +fd.get("textScale") / 100;
  if (fd.has("logoScale")) b.logo.scale = +fd.get("logoScale") / 100;
  b.text = { ...b.text, headline: v("headline") || "", sub: v("sub") || "", style: v("style") || "bold", size: v("size") || "l", align: v("align") || "left", color: v("color") || "auto", shadow: !!v("shadow"), font: v("font") || "", subFont: !!v("subFont") };
  b.bg = { type: v("bgType") || "gradient", preset: v("preset") || b.bg.preset, color: v("bgColor") || b.bg.color, image: v("bgImage") || "", dim: +(v("dim") ?? b.bg.dim), colors: b.bg.colors };
  // The logo gradient keeps the colors it was made with, so it doesn't change if the logo does.
  if (b.bg.preset === "logo") { const pal = brandPalette(S.church()); if (pal.length >= 2) b.bg.colors = pal.slice(0, 3); }
  b.logo = { ...b.logo, assetId: v("logoAsset") || "", size: v("logoSize") || "md", align: v("logoAlign") || "left", frame: v("logoFrame") || b.logo.frame || "tile" };
  b.height = v("height") || "tall";
  b.graphics.forEach((g, i) => { ["size", "x", "y", "rotate", "opacity"].forEach((k) => { if (fd.has(`g${i}_${k}`)) g[k] = +fd.get(`g${i}_${k}`); }); if (fd.has(`g${i}_color`)) g.color = fd.get(`g${i}_color`); });
  return b;
}
Inputs["banner-live"] = (form, e) => {
  if (e?.target?.type === "range") { const o = e.target.nextElementSibling; if (o) o.textContent = e.target.value + (/opacity|size|_x|_y|dim|Scale/.test(e.target.name) ? "%" : /rotate/.test(e.target.name) ? "°" : ""); }
  const b = bannerFromForm(form);
  $(".preset-picks", form).hidden = b.bg.type !== "gradient"; $(".bg-color", form).hidden = b.bg.type !== "color"; $(".bg-image", form).hidden = b.bg.type !== "image";
  const c = S.church(), hasLogo = !!bannerLogoSrc(c, b);
  $("[data-logo-frame]", form).hidden = !hasLogo;
  $("[data-act=banner-logo-clean]", form).hidden = !hasLogo;
  $("[data-act=banner-logo-remove]", form).hidden = !bannerLogoAsset(b);
  $("#banner-preview").innerHTML = flat(bannerHtml(c, b));
  if (bannerSelected) $$("#banner-preview [data-move]").forEach((x) => x.classList.toggle("sel", x.dataset.move === bannerSelected));
};
// "Any color" for a graphic: adds (or updates) a "Your color" choice and picks it.
Inputs["g-any"] = (el) => {
  const f = el.form, i = el.dataset.i, box = el.closest(".graphic-row").querySelector(".swatch-radios");
  let mine = $(`input[name="g${i}_color"][data-mine]`, box);
  if (!mine) { box.insertAdjacentHTML("beforeend", flat(html`<label title="Your color"><input type="radio" name="g${i}_color" data-mine value="${el.value}"><span><i style="background:${el.value}"></i>Your color</span></label>`)); mine = $(`input[name="g${i}_color"][data-mine]`, box); }
  mine.value = el.value; mine.nextElementSibling.querySelector("i").style.background = el.value; mine.checked = true;
  Inputs["banner-live"](f);
};
Actions["banner-preview-size"] = (button) => {
  bannerPreviewSmall = !bannerPreviewSmall;
  button.closest(".banner-preview-shell").classList.toggle("small", bannerPreviewSmall);
  button.setAttribute("aria-pressed", String(bannerPreviewSmall)); button.textContent = bannerPreviewSmall ? "Bigger preview" : "Smaller preview";
};
document.addEventListener("change", (e) => { const f = e.target.closest?.('form[data-input="banner-live"]'); if (f && e.target.type === "radio") Inputs["banner-live"](f, e); });
Forms["banner-save"] = (d, f) => {
  if (guard("manage.page") || bannerDraftFor !== bannerScope()) return;
  const b = bannerFromForm(f);
  if (b.bg.type === "image" && !b.bg.image) {
    showBannerSection(f, "background");
    return formError(f, "Choose a background photo, or pick a gradient or color.");
  }
  S.updateChurch({ banner: structuredClone(b) });
  bannerDraft = null;
  toast("Banner saved");
  go(d.returnTo === "admin-page" ? "admin-page" : "home");
};
Actions["banner-discard"] = () => { bannerDraft = null; render(); toast("Changes discarded"); };
const keepDraft = () => { const f = bannerForm(); if (f) bannerFromForm(f); };
Actions["banner-graphic-add"] = (el) => {
  keepDraft();
  bannerDraft.graphics.push({ id: uid(), kind: "builtin", builtin: el.dataset.builtin, color: "#ffffff", x: 80, y: 30, size: 22, rotate: 0, opacity: 80 });
  const y = window.scrollY; render(); window.scrollTo(0, y); toast(`${GRAPHICS[el.dataset.builtin].label} added`);
};
Actions["banner-graphic-remove"] = (el) => { keepDraft(); bannerDraft.graphics.splice(+el.dataset.i, 1); const y = window.scrollY; render(); window.scrollTo(0, y); };
Inputs["banner-graphic-upload"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  keepDraft();
  try { const src = await readImage(file, 900); bannerDraft.graphics.push({ id: uid(), kind: "upload", src, x: 78, y: 40, size: 30, rotate: 0, opacity: 100 }); const y = window.scrollY; render(); window.scrollTo(0, y); toast("Graphic added"); }
  catch (e) { toast(e.message); }
};

// ----- Logo library and transparent copies -----
function activeBannerDraft(draft) {
  return draft && draft === bannerDraft && bannerDraftFor === bannerScope() && S.isMember() && S.can("manage.page") && bannerForm();
}

function refreshBannerLogo(id) {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  const selector = id ? 'input[name="logoAsset"]:checked' : "[data-change=banner-logo-upload]";
  $(selector, bannerForm())?.focus({ preventScroll: true });
}

function addBannerLogos(draft, logos) {
  keepDraft();
  draft.logos.push(...logos);
  draft.logo.assetId = logos[0].id;
  draft.logo.frame = "none";
  if (draft.logo.size === "off") draft.logo.size = "md";
  refreshBannerLogo(logos[0].id);
}

Inputs["banner-logo-upload"] = async (input) => {
  const draft = bannerDraft, form = activeBannerDraft(draft), files = [...(input.files || [])];
  if (!form || !files.length) return;
  const status = $("[data-logo-status]", form), save = $(".banner-save-bar button:not([type])", form);
  input.disabled = true;
  save.disabled = true;
  status.textContent = "Reading logos…";
  const logos = [];
  let failed = 0, cleared = 0;
  for (const file of files) {
    try {
      const logo = await readLogo(file);
      const name = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 100) || "Uploaded logo";
      logos.push({ id: uid(), name, src: logo.src });
      if (logo.cleared) cleared++;
    } catch { failed++; }
  }
  input.value = "";
  input.disabled = false;
  save.disabled = false;
  status.textContent = "";
  if (!activeBannerDraft(draft)) return;
  if (logos.length) addBannerLogos(draft, logos);
  if (cleared && !failed) toast(cleared === logos.length && cleared === 1 ? "Background removed. Remove background lets you fine-tune it." : `Background removed from ${plural(cleared, "logo")}.`);
  if (failed) toast(logos.length ? `${plural(failed, "logo")} could not be read. The other logos were added.` : "Those logos could not be read. Choose image files.");
};
Actions["banner-logo-remove"] = () => {
  const draft = bannerDraft;
  if (!activeBannerDraft(draft)) return;
  keepDraft();
  if (!bannerLogoAsset(draft)) return;
  draft.logos = draft.logos.filter((logo) => logo.id !== draft.logo.assetId);
  draft.logo.assetId = "";
  refreshBannerLogo("");
};

async function bannerLogoPixels(src, max = 512) {
  const img = new Image();
  if (isUrl(src)) img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, original: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

// Color distance on the same 0-255 scale as one channel, so the tolerance slider means the same thing it did.
const logoColorDistance = (pixels, offset, [r, g, b]) => Math.hypot(pixels[offset] - r, pixels[offset + 1] - g, pixels[offset + 2] - b) / 1.732;
/**
 * The background colors, read from the whole border rather than the four corners, so a logo that touches a corner,
 * a speckled JPEG or a gentle gradient still has its background found. Up to three colors.
 */
function logoBackgroundColors({ data, width, height }) {
  const bins = new Map(); let total = 0, clear = 0;
  const sideLength = [width, width, height, height];
  const take = (x, y, side) => {
    const i = (y * width + x) * 4; total++;
    if (data[i + 3] < 200) { clear++; return; }
    const key = (data[i] >> 4) << 8 | (data[i + 1] >> 4) << 4 | (data[i + 2] >> 4);
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0, sides: [0, 0, 0, 0] };
    bin.n++; bin.r += data[i]; bin.g += data[i + 1]; bin.b += data[i + 2]; bin.sides[side]++; bins.set(key, bin);
  };
  for (let x = 0; x < width; x++) { take(x, 0, 0); take(x, height - 1, 1); }
  for (let y = 0; y < height; y++) { take(0, y, 2); take(width - 1, y, 3); }
  if (clear / total > 0.4) return { colors: [], transparent: true };
  const merged = [];
  for (const bin of [...bins.values()].sort((x, y) => y.n - x.n)) {
    const rgb = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    const near = merged.find((m) => Math.hypot(m.rgb[0] - rgb[0], m.rgb[1] - rgb[1], m.rgb[2] - rgb[2]) < 34);
    if (near) { near.n += bin.n; bin.sides.forEach((v, k) => { near.sides[k] += v; }); } else merged.push({ rgb, n: bin.n, sides: [...bin.sides] });
  }
  const opaque = total - clear;
  // A background shows along at least three sides. Artwork that runs into a corner touches only two.
  const onSides = (m) => m.sides.filter((v, k) => v >= sideLength[k] * 0.05).length;
  const colors = merged.filter((m, i) => m.n / opaque >= 0.08 && (onSides(m) >= 3 || (i === 0 && m.n / opaque >= 0.5))).slice(0, 3);
  return { colors: colors.map((m) => m.rgb.map(Math.round)), transparent: false };
}
const logoBackgroundColor = (img) => logoBackgroundColors(img).colors[0] || null;

/**
 * Clears the background. From the edges inward by default, so the same color inside the artwork stays; or every
 * matching pixel. Edges fade out instead of cutting off, and the background's tint is taken back out of the soft
 * edge pixels, so there's no white or dark fringe on a new background. A gentle gradient is followed from pixel to
 * pixel.
 */
function makeLogoTransparent(edit, tolerance, includeHoles) {
  const { canvas, ctx, original, backgrounds, tint } = edit;
  if (!backgrounds.length && !tint) return "";
  const { width, height } = original, count = width * height, src = original.data;
  const output = ctx.createImageData(width, height), pixels = output.data;
  pixels.set(src);
  const feather = Math.max(14, tolerance * 0.9);
  const nearest = (o) => { let best = Infinity, col = backgrounds[0]; for (const c of backgrounds) { const d = logoColorDistance(src, o, c); if (d < best) { best = d; col = c; } } return [best, col]; };
  let removed = 0;
  /** 2: cleared (and the fill carries on), 1: softened edge, 0: kept. */
  function clear(index, from = -1) {
    const o = index * 4;
    if (src[o + 3] === 0) return 2;
    let [d, bg] = nearest(o);
    // Follow a gradient: close to the pixel just cleared, and not far from the background.
    if (from >= 0 && d > tolerance && d <= tolerance * 3 && logoColorDistance(src, o, [src[from * 4], src[from * 4 + 1], src[from * 4 + 2]]) <= 6) { d = 0; bg = [src[from * 4], src[from * 4 + 1], src[from * 4 + 2]]; }
    if (d <= tolerance) { pixels[o + 3] = 0; removed++; return 2; }
    if (d < tolerance + feather) {
      const a = (d - tolerance) / feather;
      for (let k = 0; k < 3; k++) pixels[o + k] = Math.max(0, Math.min(255, Math.round((src[o + k] - bg[k] * (1 - a)) / a)));
      pixels[o + 3] = Math.round(src[o + 3] * a); removed += 1 - a;
      return 1;
    }
    return 0;
  }
  if (!backgrounds.length) { /* Only recoloring a logo that's already see-through. */ }
  else if (includeHoles) {
    for (let i = 0; i < count; i++) clear(i);
  } else {
    const queue = new Uint32Array(count), seen = new Uint8Array(count);
    let read = 0, end = 0;
    const visit = (index, from) => { if (seen[index]) return; seen[index] = 1; if (clear(index, from) === 2) queue[end++] = index; };
    for (let x = 0; x < width; x++) { visit(x, -1); visit(count - width + x, -1); }
    for (let y = 0; y < height; y++) { visit(y * width, -1); visit(y * width + width - 1, -1); }
    while (read < end) {
      const i = queue[read++], x = i % width;
      if (x > 0) visit(i - 1, i);
      if (x < width - 1) visit(i + 1, i);
      if (i >= width) visit(i - width, i);
      if (i < count - width) visit(i + width, i);
    }
  }
  if (backgrounds.length && (removed < 1 || removed >= edit.visiblePixels * 0.98)) return "";
  // One color: every pixel that shows becomes white or dark, keeping its see-through edges.
  if (tint) { const [r, g, b] = logoColorRgb(tint); for (let i = 0; i < pixels.length; i += 4) { pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; } }
  ctx.putImageData(output, 0, 0);
  return canvas.toDataURL("image/png");
}

const logoColorHex = (rgb) => "#" + rgb.map((value) => value.toString(16).padStart(2, "0")).join("");
const logoColorRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
let bannerLogoEdit;
/**
 * The "Remove logo background" sheet, for any logo: the banner's, or a graphic's. active() says whether the thing
 * being edited is still open; onSave(name, src) keeps the transparent copy.
 */
async function openLogoCleaner({ src, name, active, onSave, button, naming = true }) {
  if (!src) return;
  if (button) button.disabled = true;
  try {
    const edit = await bannerLogoPixels(src);
    if (!active() || (button && !button.isConnected)) return;
    const found = logoBackgroundColors(edit.original), background = found.colors[0] || null;
    if (found.transparent) toast("This logo's background is already see-through. You can still pick colors to clear.");
    let visiblePixels = 0;
    for (let i = 3; i < edit.original.data.length; i += 4) {
      if (edit.original.data[i]) visiblePixels++;
    }
    bannerLogoEdit = { ...edit, active, onSave, naming, backgrounds: found.colors, visiblePixels, src, result: "" };
    openSheet("Remove logo background", html`<form data-form="banner-logo-copy">
      <div class="banner-logo-comparison">
        <figure>
          <button type="button" class="banner-logo-swatch banner-logo-sample" data-act="banner-logo-sample" aria-label="Sample a background color from the original logo"><img src="${src}" alt="Original logo"></button>
          <figcaption>Original · Tap a background color</figcaption>
        </figure>
        <figure><div class="banner-logo-swatch"><img alt="Transparent logo" hidden data-logo-result></div><figcaption>Transparent preview</figcaption></figure>
      </div>
      <div class="banner-logo-colors">
        <label class="field"><span>Background color</span><input type="color" name="backgroundColor" value="${background ? logoColorHex(background) : "#ffffff"}"></label>
        <button type="button" class="btn ghost sm" data-act="banner-logo-add-color">Add color</button>
      </div>
      <div class="banner-logo-palette" data-logo-colors aria-label="Colors to remove"></div>
      <label class="check"><input type="checkbox" name="includeHoles" data-input="banner-logo-preview" checked><span>Clear inside closed letters<br><small class="faint">Turn off to protect matching colors enclosed by the artwork.</small></span></label>
      <fieldset class="field" style="border:0;padding:0"><legend>Logo color</legend><div class="radios">
        <label><input type="radio" name="tint" value="" checked data-change="banner-logo-preview"><span>Its own colors</span></label>
        <label><input type="radio" name="tint" value="#ffffff" data-change="banner-logo-preview"><span>All white</span></label>
        <label><input type="radio" name="tint" value="#111111" data-change="banner-logo-preview"><span>All dark</span></label></div>
        <small>All white works well on photos and dark slides.</small></fieldset>
      <label class="range"><span>Color tolerance</span><input type="range" name="tolerance" min="0" max="120" value="24" data-input="banner-logo-preview"><output>24</output></label>
      <p class="faint" data-logo-copy-status role="status"></p>
      ${naming ? html`<label class="field"><span>Copy name</span><input type="text" name="name" value="${String(name || "Logo").slice(0, 80)} (transparent)" maxlength="100" required></label>` : ""}
      <button type="submit" class="btn">${naming ? "Save transparent copy" : "Use this logo"}</button>
    </form>`);
    refreshLogoColors($('#scrim [data-form="banner-logo-copy"]'));
  } catch {
    if (active()) toast("This logo could not be edited. Try uploading the original image again.");
  } finally { if (button) button.disabled = false; }
}
Actions["banner-logo-clean"] = (button) => {
  const draft = bannerDraft;
  if (!activeBannerDraft(draft)) return;
  keepDraft();
  const asset = bannerLogoAsset(draft), src = bannerLogoSrc(S.church(), draft);
  openLogoCleaner({ src: logoOriginal(src), button, name: asset?.name || "Account logo",
    active: () => activeBannerDraft(draft) && bannerLogoSrc(S.church(), draft) === src,
    onSave: (name, result) => addBannerLogos(draft, [{ id: uid(), name, src: result }]) });
};

function refreshLogoPreview(form) {
  const edit = bannerLogoEdit;
  if (!edit || !edit.active()) return;
  const { tolerance, includeHoles, tint } = form.elements;
  tolerance.nextElementSibling.value = tolerance.value;
  edit.tint = tint.value;
  edit.result = makeLogoTransparent(edit, +tolerance.value, includeHoles.checked);
  const preview = $("[data-logo-result]", form);
  if (edit.result) preview.src = edit.result;
  preview.hidden = !edit.result;
  $('button[type="submit"]', form).disabled = !edit.result;
  $("[data-logo-copy-status]", form).textContent = edit.result ? "" : edit.backgrounds.length
    ? "Adjust the tolerance or sample another color to keep the logo visible."
    : "Sample a background color from the original, or pick a color and add it.";
}
function refreshLogoColors(form) {
  const edit = bannerLogoEdit;
  $("[data-logo-colors]", form).innerHTML = flat(edit.backgrounds.map((rgb, index) => {
    const color = logoColorHex(rgb);
    return html`<button type="button" class="chip" data-act="banner-logo-remove-color" data-i="${index}" aria-label="Remove color ${color}">
      <span class="banner-logo-color-sample" style="background:${color}" aria-hidden="true"></span>${color} ${icon("x")}
    </button>`;
  }));
  refreshLogoPreview(form);
}
function addLogoBackgroundColor(form, rgb) {
  const edit = bannerLogoEdit;
  if (!edit || !edit.active()) return;
  form.elements.backgroundColor.value = logoColorHex(rgb);
  if (!edit.backgrounds.some((color) => logoColorDistance(color, 0, rgb) === 0)) edit.backgrounds.push(rgb);
  refreshLogoColors(form);
}
Actions["banner-logo-add-color"] = (button) => addLogoBackgroundColor(button.form, logoColorRgb(button.form.elements.backgroundColor.value));
Actions["banner-logo-remove-color"] = (button) => {
  const edit = bannerLogoEdit, form = button.form;
  if (!edit || !edit.active()) return;
  edit.backgrounds.splice(+button.dataset.i, 1);
  refreshLogoColors(form);
  $("[data-act=banner-logo-add-color]", form).focus();
};
Actions["banner-logo-sample"] = (button, event) => {
  const edit = bannerLogoEdit;
  if (!edit || !edit.active()) return;
  if (!event.detail) { button.form.elements.backgroundColor.focus(); return; }
  const bounds = $("img", button).getBoundingClientRect();
  const { data, width, height } = edit.original;
  const x = Math.floor((event.clientX - bounds.left) * width / bounds.width);
  const y = Math.floor((event.clientY - bounds.top) * height / bounds.height);
  if (!bounds.width || !bounds.height || x < 0 || x >= width || y < 0 || y >= height) return;
  const offset = (y * width + x) * 4;
  if (data[offset + 3]) addLogoBackgroundColor(button.form, [...data.slice(offset, offset + 3)]);
};
Inputs["banner-logo-preview"] = (input) => refreshLogoPreview(input.form);
Forms["banner-logo-copy"] = (data, form) => {
  const edit = bannerLogoEdit;
  if (!edit?.result || !edit.active()) return;
  const name = String(data.name || "").trim();
  if (edit.naming && !name) return formError(form, "Name the transparent copy.");
  bannerLogoEdit = null;
  closeSheet(true);
  edit.onSave(name, edit.result);
};
