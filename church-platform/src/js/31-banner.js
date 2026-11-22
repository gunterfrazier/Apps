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
  if (b.bg.type === "image" && b.bg.image) return "#ffffff";
  return onColor(b.bg.type === "color" ? b.bg.color || churchColor : churchColor);
}
function bannerBackground(b, color) {
  if (b.bg.type === "image" && b.bg.image) return `linear-gradient(rgba(0,0,0,${(b.bg.dim ?? 35) / 100}), rgba(0,0,0,${(b.bg.dim ?? 35) / 100})), url("${b.bg.image}") center / cover no-repeat`;
  if (b.bg.type === "color") return b.bg.color || color;
  return (BANNER_PRESETS[b.bg.preset] || BANNER_PRESETS.aurora).css;
}
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
    ${(b.graphics || []).map((g) => html`<img class="bn-graphic" alt="" src="${graphicSrc(g)}" style="left:${g.x}%;top:${g.y}%;width:${g.size}%;opacity:${(g.opacity ?? 100) / 100};transform:translate(-50%,-50%) rotate(${g.rotate || 0}deg)">`)}
    ${b.logo.align === "top" && !mini && logo ? html`<div class="bn-top">${logo}</div>` : ""}
    <div class="bn-content">
      ${!mini ? html`<div class="bn-text">${b.logo.align !== "top" ? logo : ""}
        ${name ? html`<p class="bn-name">${c.name}</p>` : ""}
        ${words.length ? html`<h2 class="bn-head st-${b.text.style} sz-${b.text.size} ${b.text.shadow ? "shadow" : ""}">${b.text.style === "stacked" ? words.map((w, i) => html`<span class="${i % 2 ? "thin" : ""}">${w}</span>`) : b.text.style === "highlight" ? html`<span class="mark">${b.text.headline}</span>` : b.text.headline}</h2>` : ""}
        ${b.text.sub ? html`<p class="bn-sub ${b.text.shadow ? "shadow" : ""}">${b.text.sub}</p>` : ""}</div>` : ""}</div>
  </div>`;
}

// ---------- The banner designer ----------
const BANNER_SECTIONS = { background: "Background", logo: "Logo", text: "Text", graphics: "Graphics", layout: "Layout" };
let bannerDraft = null, bannerDraftFor = "", bannerSection = "background", bannerPhonePreview = false;
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
  const range = (name, label, value, min, max, unit = "") => html`<label class="range"><span>${label}</span><input type="range" name="${name}" min="${min}" max="${max}" value="${value}"><output>${value}${unit}</output></label>`;
  return {
    title: "Home banner", back,
    body: html`<form data-form="banner-save" data-input="banner-live" class="banner-form" novalidate>
      <input type="hidden" name="returnTo" value="${back}">
      <div class="banner-workspace">
        <aside class="banner-preview-shell" aria-label="Banner preview">
          <div class="banner-preview-head"><h2>Live preview</h2>
            <div class="banner-preview-width" role="group" aria-label="Preview width">
              <button type="button" class="chip" data-act="banner-preview-width" data-width="phone" aria-pressed="${bannerPhonePreview}">Phone</button>
              <button type="button" class="chip" data-act="banner-preview-width" data-width="wide" aria-pressed="${!bannerPhonePreview}">Wide</button>
            </div>
          </div>
          <div class="banner-preview" id="banner-preview" data-width="${bannerPhonePreview ? "phone" : "wide"}">${bannerHtml(c, b)}</div>
          <p class="faint">Used on Home and your public landing page.</p>
        </aside>
        <div class="banner-tools">
          <nav class="banner-sections" aria-label="Banner settings">${Object.entries(BANNER_SECTIONS).map(([key, label]) =>
            html`<button type="button" class="chip" data-act="banner-section" data-section="${key}" aria-controls="banner-${key}" aria-pressed="${bannerSection === key}">${label}</button>`)}</nav>
        ${pane("text", html`<div class="panel">
          <label class="field" style="margin-top:0"><span>Headline</span><input type="text" name="headline" value="${b.text.headline}" maxlength="40"></label>
          <label class="field"><span>Smaller line</span><input type="text" name="sub" value="${b.text.sub}" maxlength="80" placeholder="Sundays at 9 and 11"></label>
          <fieldset class="field" style="border:0;padding:0"><legend>Style</legend><div class="style-picks">${Object.entries(TEXT_STYLES).map(([k, l]) => html`<label><input type="radio" name="style" value="${k}" ${attr(b.text.style === k, "checked")}><span class="st-${k}"><span class="${k === "highlight" ? "mark" : ""}">${l}</span></span></label>`)}</div></fieldset>
          <div class="two"><fieldset class="field" style="border:0;padding:0"><legend>Size</legend><div class="radios">${opt("size", "m", "M", b.text.size)}${opt("size", "l", "L", b.text.size)}${opt("size", "xl", "XL", b.text.size)}</div></fieldset>
            <fieldset class="field" style="border:0;padding:0"><legend>Line up</legend><div class="radios">${opt("align", "left", "Left", b.text.align)}${opt("align", "center", "Center", b.text.align)}</div></fieldset></div>
          <fieldset class="field" style="border:0;padding:0"><legend>Text color</legend><div class="radios">${opt("color", "auto", "Automatic", b.text.color)}${opt("color", "white", "White", b.text.color)}${opt("color", "dark", "Dark", b.text.color)}${opt("color", "brand", "Church color", b.text.color)}</div></fieldset>
          <label class="check"><input type="checkbox" name="shadow" ${attr(b.text.shadow, "checked")}><span>Soft shadow behind the text</span></label>
        </div>`)}

        ${pane("background", html`<div class="panel">
          <div class="radios">${opt("bgType", "gradient", "Gradient", b.bg.type)}${opt("bgType", "color", "Color", b.bg.type)}${opt("bgType", "image", "Photo", b.bg.type)}</div>
          <div class="preset-picks" ${attr(b.bg.type !== "gradient", "hidden")}>${Object.entries(BANNER_PRESETS).map(([k, p]) => html`<label><input type="radio" name="preset" value="${k}" ${attr(b.bg.preset === k, "checked")}><span style="--b:${c.color};background:${raw(esc(p.css))}"></span><small>${p.label}</small></label>`)}</div>
          <label class="field bg-color" ${attr(b.bg.type !== "color", "hidden")}><span>Color</span><input type="color" name="bgColor" value="${b.bg.color || c.color}"></label>
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
          <fieldset class="field"><legend>Size</legend><div class="radios">${opt("logoSize", "off", "Hide", b.logo.size)}${opt("logoSize", "sm", "Small", b.logo.size)}${opt("logoSize", "md", "Medium", b.logo.size)}${opt("logoSize", "lg", "Large", b.logo.size)}</div></fieldset>
          <fieldset class="field"><legend>Position</legend><div class="radios">${opt("logoAlign", "left", "With the text", b.logo.align)}${opt("logoAlign", "top", "Top of banner", b.logo.align)}</div></fieldset>
          <fieldset class="field" data-logo-frame ${attr(!bannerLogoSrc(c, b), "hidden")}><legend>Frame</legend><div class="radios">${opt("logoFrame", "none", "No frame", b.logo.frame || "tile")}${opt("logoFrame", "tile", "White tile", b.logo.frame || "tile")}</div></fieldset>
        </div>`)}

        ${pane("graphics", html`
          ${(b.graphics || []).map((g, i) => html`<div class="panel graphic-row"><div class="graphic-head"><img src="${graphicSrc({ ...g, color: g.kind === "builtin" ? (g.color === "#ffffff" ? "#667085" : g.color) : g.color })}" alt=""><b>${g.kind === "builtin" ? GRAPHICS[g.builtin]?.label : "Your graphic"}</b>
              <button type="button" class="icon-btn" data-act="banner-graphic-remove" data-i="${i}" aria-label="Remove graphic">${icon("trash")}</button></div>
            ${range(`g${i}_size`, "Size", g.size, 4, 120, "%")}${range(`g${i}_x`, "Left to right", g.x, 0, 100, "%")}${range(`g${i}_y`, "Top to bottom", g.y, 0, 100, "%")}${range(`g${i}_rotate`, "Turn", g.rotate || 0, -180, 180, "°")}${range(`g${i}_opacity`, "Strength", g.opacity ?? 100, 5, 100, "%")}
            ${g.kind === "builtin" ? html`<div class="radios">${[["#ffffff", "White"], ["#111827", "Dark"], [c.color, "Church color"], ["#f5c451", "Gold"]].map(([v, l]) => html`<label><input type="radio" name="g${i}_color" value="${v}" ${attr(g.color === v, "checked")}><span>${l}</span></label>`)}</div>` : ""}
          </div>`)}
          <div class="panel"><b>Add a graphic</b><div class="graphic-picks">${Object.entries(GRAPHICS).map(([k, g]) => html`<button type="button" data-act="banner-graphic-add" data-builtin="${k}" aria-label="Add ${g.label}"><img src="${graphicSrc({ kind: "builtin", builtin: k, color: "#475467" })}" alt=""><small>${g.label}</small></button>`)}</div>
            <label class="btn ghost sm" style="margin-top:10px">${icon("image")}Upload your own<input type="file" accept="image/*" class="sr" data-change="banner-graphic-upload"></label><small class="faint" style="display:block;margin-top:6px">PNG files with a see-through background work best.</small></div>
        `)}

        ${pane("layout", html`<div class="panel"><fieldset class="field"><legend>Banner height</legend><div class="radios">${opt("height", "compact", "Compact", b.height)}${opt("height", "tall", "Tall", b.height)}</div></fieldset></div>`)}
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
  b.text = { headline: v("headline") || "", sub: v("sub") || "", style: v("style") || "bold", size: v("size") || "l", align: v("align") || "left", color: v("color") || "auto", shadow: !!v("shadow") };
  b.bg = { type: v("bgType") || "gradient", preset: v("preset") || b.bg.preset, color: v("bgColor") || b.bg.color, image: v("bgImage") || "", dim: +(v("dim") ?? b.bg.dim) };
  b.logo = { assetId: v("logoAsset") || "", size: v("logoSize") || "md", align: v("logoAlign") || "left", frame: v("logoFrame") || b.logo.frame || "tile" };
  b.height = v("height") || "tall";
  b.graphics.forEach((g, i) => { ["size", "x", "y", "rotate", "opacity"].forEach((k) => { if (fd.has(`g${i}_${k}`)) g[k] = +fd.get(`g${i}_${k}`); }); if (fd.has(`g${i}_color`)) g.color = fd.get(`g${i}_color`); });
  return b;
}
Inputs["banner-live"] = (form, e) => {
  if (e?.target?.type === "range") { const o = e.target.nextElementSibling; if (o) o.textContent = e.target.value + (/opacity|size|_x|_y|dim/.test(e.target.name) ? "%" : /rotate/.test(e.target.name) ? "°" : ""); }
  const b = bannerFromForm(form);
  $(".preset-picks", form).hidden = b.bg.type !== "gradient"; $(".bg-color", form).hidden = b.bg.type !== "color"; $(".bg-image", form).hidden = b.bg.type !== "image";
  const c = S.church(), hasLogo = !!bannerLogoSrc(c, b);
  $("[data-logo-frame]", form).hidden = !hasLogo;
  $("[data-act=banner-logo-clean]", form).hidden = !hasLogo;
  $("[data-act=banner-logo-remove]", form).hidden = !bannerLogoAsset(b);
  $("#banner-preview").innerHTML = flat(bannerHtml(c, b));
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
  let failed = 0;
  for (const file of files) {
    try {
      const src = await readImage(file, 512, .94, { preserveTransparency: true });
      const name = file.name.replace(/\.[^.]+$/, "").trim().slice(0, 100) || "Uploaded logo";
      logos.push({ id: uid(), name, src });
    } catch { failed++; }
  }
  input.value = "";
  input.disabled = false;
  save.disabled = false;
  status.textContent = "";
  if (!activeBannerDraft(draft)) return;
  if (logos.length) addBannerLogos(draft, logos);
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

async function bannerLogoPixels(src) {
  const img = new Image();
  if (isUrl(src)) img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const scale = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx, original: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

const logoColorDistance = (pixels, offset, [r, g, b]) => Math.max(
  Math.abs(pixels[offset] - r), Math.abs(pixels[offset + 1] - g), Math.abs(pixels[offset + 2] - b),
);
function logoBackgroundColor({ data, width, height }) {
  const corners = [0, width - 1, width * (height - 1), width * height - 1];
  const colors = corners.map((i) => i * 4).filter((i) => data[i + 3] >= 240).map((i) => [...data.slice(i, i + 3)]);
  const matches = (c) => colors.filter((other) => logoColorDistance(other, 0, c) <= 20).length;
  const best = colors.sort((a, b) => matches(b) - matches(a))[0];
  return best && matches(best) >= 2 ? best : null;
}

/** Clear only matching pixels connected to an edge. Matching colors enclosed by the logo stay intact. */
function makeLogoTransparent(edit, tolerance) {
  const { canvas, ctx, original, background } = edit;
  const { width, height } = original, count = width * height;
  const output = ctx.createImageData(width, height), pixels = output.data;
  pixels.set(original.data);
  const queue = new Uint32Array(count), seen = new Uint8Array(count);
  let read = 0, end = 0, removed = 0;
  function visit(index) {
    if (seen[index]) return;
    seen[index] = 1;
    const offset = index * 4, alpha = pixels[offset + 3];
    if (alpha && logoColorDistance(pixels, offset, background) > tolerance) return;
    queue[end++] = index;
    if (alpha) { pixels[offset + 3] = 0; removed++; }
  }
  for (let x = 0; x < width; x++) { visit(x); visit(count - width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (read < end) {
    const i = queue[read++], x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < count - width) visit(i + width);
  }
  if (!removed || removed >= edit.visiblePixels) return "";
  ctx.putImageData(output, 0, 0);
  return canvas.toDataURL("image/webp", .94);
}

let bannerLogoEdit;
Actions["banner-logo-clean"] = async (button) => {
  const draft = bannerDraft;
  if (!activeBannerDraft(draft)) return;
  keepDraft();
  const asset = bannerLogoAsset(draft), src = bannerLogoSrc(S.church(), draft);
  if (!src) return;
  button.disabled = true;
  try {
    const edit = await bannerLogoPixels(src);
    if (!activeBannerDraft(draft) || !button.isConnected || bannerLogoSrc(S.church(), draft) !== src) return;
    const background = logoBackgroundColor(edit.original);
    if (!background) {
      toast("No solid background was detected. Transparent logos can use No frame.");
      return;
    }
    let visiblePixels = 0;
    for (let i = 3; i < edit.original.data.length; i += 4) {
      if (edit.original.data[i]) visiblePixels++;
    }
    bannerLogoEdit = { ...edit, draft, background, visiblePixels, src, result: "" };
    const name = asset?.name || "Account logo";
    openSheet("Remove logo background", html`<form data-form="banner-logo-copy">
      <div class="banner-logo-comparison">
        <figure><div class="banner-logo-swatch"><img src="${src}" alt="Original logo"></div><figcaption>Original</figcaption></figure>
        <figure><div class="banner-logo-swatch"><img alt="Transparent logo" hidden data-logo-result></div><figcaption>Transparent preview</figcaption></figure>
      </div>
      <label class="range"><span>Color tolerance</span><input type="range" min="4" max="75" value="24" data-input="banner-logo-tolerance"><output>24</output></label>
      <p class="faint" data-logo-copy-status role="status"></p>
      <label class="field"><span>Copy name</span><input type="text" name="name" value="${name.slice(0, 86)} (transparent)" maxlength="100" required></label>
      <button type="submit" class="btn">Save transparent copy</button>
    </form>`);
    Inputs["banner-logo-tolerance"]($('#scrim [data-input="banner-logo-tolerance"]'));
  } catch {
    if (activeBannerDraft(draft)) toast("This logo could not be edited. Try uploading the original image to the banner.");
  } finally { button.disabled = false; }
};

Inputs["banner-logo-tolerance"] = (input) => {
  const edit = bannerLogoEdit;
  if (!edit || !activeBannerDraft(edit.draft)) return;
  input.nextElementSibling.value = input.value;
  edit.result = makeLogoTransparent(edit, +input.value);
  const preview = $("[data-logo-result]", input.form);
  if (edit.result) preview.src = edit.result;
  preview.hidden = !edit.result;
  $('button[type="submit"]', input.form).disabled = !edit.result;
  $("[data-logo-copy-status]", input.form).textContent = edit.result ? "Solid colors connected to an edge are removed." : "Try a different tolerance to keep the logo visible.";
};
Forms["banner-logo-copy"] = (data, form) => {
  const edit = bannerLogoEdit;
  if (!edit?.result || !activeBannerDraft(edit.draft) || bannerLogoSrc(S.church(), edit.draft) !== edit.src) return;
  const name = data.name.trim();
  if (!name) return formError(form, "Name the transparent copy.");
  bannerLogoEdit = null;
  closeSheet(true);
  addBannerLogos(edit.draft, [{ id: uid(), name, src: edit.result }]);
};
