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
/** The banner itself. mini: no text (for church cards); slide: fills a presentation stage. */
function bannerHtml(c, b = bannerOf(c), { mini = false, name = false } = {}) {
  const color = b.bg.type === "color" ? b.bg.color || c.color : c.color;
  const ink = bannerTextColor(b, c.color);
  const words = String(b.text.headline || "").trim().split(/\s+/).filter(Boolean);
  const logo = b.logo.size !== "off" ? (c.logo ? html`<img class="bn-logo ${b.logo.size}" src="${c.logo}" alt="">` : html`<span class="bn-logo mono ${b.logo.size}" style="background:${onColor(c.color) === "#ffffff" ? "#ffffff" : "#111827"};color:${c.color}">${initials(c.name)}</span>`) : "";
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
let bannerDraft = null, bannerDraftFor = null;
AdminScreens.banner = () => {
  const blocked = guard("manage.page"); if (blocked) return blocked;
  const c = S.church();
  if (bannerDraftFor !== c.id || !bannerDraft) { bannerDraft = JSON.parse(JSON.stringify(bannerOf(c))); bannerDraftFor = c.id; }
  const b = bannerDraft;
  const opt = (name, value, label, cur) => html`<label><input type="radio" name="${name}" value="${value}" ${attr(cur === value, "checked")}><span>${label}</span></label>`;
  const range = (name, label, value, min, max, unit = "") => html`<label class="range"><span>${label}</span><input type="range" name="${name}" min="${min}" max="${max}" value="${value}"><output>${value}${unit}</output></label>`;
  return {
    title: "Home banner", back: "admin",
    body: html`<div class="banner-preview" id="banner-preview">${bannerHtml(c, b)}</div>
      <form data-form="banner-save" data-input="banner-live" class="banner-form" novalidate>
        <section class="sec"><h2 class="sec-head">Text art</h2><div class="panel">
          <label class="field" style="margin-top:0"><span>Headline</span><input type="text" name="headline" value="${b.text.headline}" maxlength="40"></label>
          <label class="field"><span>Smaller line</span><input type="text" name="sub" value="${b.text.sub}" maxlength="80" placeholder="Sundays at 9 and 11"></label>
          <fieldset class="field" style="border:0;padding:0"><legend>Style</legend><div class="style-picks">${Object.entries(TEXT_STYLES).map(([k, l]) => html`<label><input type="radio" name="style" value="${k}" ${attr(b.text.style === k, "checked")}><span class="st-${k}"><span class="${k === "highlight" ? "mark" : ""}">${l}</span></span></label>`)}</div></fieldset>
          <div class="two"><fieldset class="field" style="border:0;padding:0"><legend>Size</legend><div class="radios">${opt("size", "m", "M", b.text.size)}${opt("size", "l", "L", b.text.size)}${opt("size", "xl", "XL", b.text.size)}</div></fieldset>
            <fieldset class="field" style="border:0;padding:0"><legend>Line up</legend><div class="radios">${opt("align", "left", "Left", b.text.align)}${opt("align", "center", "Center", b.text.align)}</div></fieldset></div>
          <fieldset class="field" style="border:0;padding:0"><legend>Text color</legend><div class="radios">${opt("color", "auto", "Automatic", b.text.color)}${opt("color", "white", "White", b.text.color)}${opt("color", "dark", "Dark", b.text.color)}${opt("color", "brand", "Church color", b.text.color)}</div></fieldset>
          <label class="check"><input type="checkbox" name="shadow" ${attr(b.text.shadow, "checked")}><span>Soft shadow behind the text</span></label>
        </div></section>

        <section class="sec"><h2 class="sec-head">Background</h2><div class="panel">
          <div class="radios">${opt("bgType", "gradient", "Gradient", b.bg.type)}${opt("bgType", "color", "Color", b.bg.type)}${opt("bgType", "image", "Photo", b.bg.type)}</div>
          <div class="preset-picks" ${attr(b.bg.type !== "gradient", "hidden")}>${Object.entries(BANNER_PRESETS).map(([k, p]) => html`<label><input type="radio" name="preset" value="${k}" ${attr(b.bg.preset === k, "checked")}><span style="--b:${c.color};background:${raw(esc(p.css))}"></span><small>${p.label}</small></label>`)}</div>
          <label class="field bg-color" ${attr(b.bg.type !== "color", "hidden")}><span>Color</span><input type="color" name="bgColor" value="${b.bg.color || c.color}"></label>
          <div class="bg-image" ${attr(b.bg.type !== "image", "hidden")}>${imageField("bgImage", "Photo", b.bg.image, "A wide photo works best. It's resized so it loads fast.", 1800)}${range("dim", "Darken the photo", b.bg.dim ?? 35, 0, 75, "%")}</div>
        </div></section>

        <section class="sec"><h2 class="sec-head">Logo</h2><div class="panel">
          <div class="radios">${opt("logoSize", "off", "Hide", b.logo.size)}${opt("logoSize", "sm", "Small", b.logo.size)}${opt("logoSize", "md", "Medium", b.logo.size)}${opt("logoSize", "lg", "Large", b.logo.size)}</div>
          <div class="radios" style="margin-top:8px">${opt("logoAlign", "left", "With the text", b.logo.align)}${opt("logoAlign", "top", "Top corner", b.logo.align)}</div>
          <p class="faint" style="margin-bottom:0">${c.logo ? "Uses the logo from Account details." : html`No logo uploaded yet, so your initials show. <a href="#admin-account">Upload a logo</a>.`}</p>
        </div></section>

        <section class="sec"><h2 class="sec-head">Graphics</h2>
          ${(b.graphics || []).map((g, i) => html`<div class="panel graphic-row"><div class="graphic-head"><img src="${graphicSrc({ ...g, color: g.kind === "builtin" ? (g.color === "#ffffff" ? "#667085" : g.color) : g.color })}" alt=""><b>${g.kind === "builtin" ? GRAPHICS[g.builtin]?.label : "Your graphic"}</b>
              <button type="button" class="icon-btn" data-act="banner-graphic-remove" data-i="${i}" aria-label="Remove graphic">${icon("trash")}</button></div>
            ${range(`g${i}_size`, "Size", g.size, 4, 120, "%")}${range(`g${i}_x`, "Left to right", g.x, 0, 100, "%")}${range(`g${i}_y`, "Top to bottom", g.y, 0, 100, "%")}${range(`g${i}_rotate`, "Turn", g.rotate || 0, -180, 180, "°")}${range(`g${i}_opacity`, "Strength", g.opacity ?? 100, 5, 100, "%")}
            ${g.kind === "builtin" ? html`<div class="radios">${[["#ffffff", "White"], ["#111827", "Dark"], [c.color, "Church color"], ["#f5c451", "Gold"]].map(([v, l]) => html`<label><input type="radio" name="g${i}_color" value="${v}" ${attr(g.color === v, "checked")}><span>${l}</span></label>`)}</div>` : ""}
          </div>`)}
          <div class="panel"><b>Add a graphic</b><div class="graphic-picks">${Object.entries(GRAPHICS).map(([k, g]) => html`<button type="button" data-act="banner-graphic-add" data-builtin="${k}" aria-label="Add ${g.label}"><img src="${graphicSrc({ kind: "builtin", builtin: k, color: "#475467" })}" alt=""><small>${g.label}</small></button>`)}</div>
            <label class="btn ghost sm" style="margin-top:10px">${icon("image")}Upload your own<input type="file" accept="image/*" class="sr" data-change="banner-graphic-upload"></label><small class="faint" style="display:block;margin-top:6px">PNG files with a see-through background work best.</small></div>
        </section>

        <section class="sec"><h2 class="sec-head">Height</h2><div class="panel"><div class="radios">${opt("height", "compact", "Compact", b.height)}${opt("height", "tall", "Tall", b.height)}</div></div></section>
        <div class="btns sticky-save"><button class="btn">Save banner</button><button type="button" class="btn ghost" data-act="banner-discard">Discard changes</button></div>
      </form>`,
  };
};
/** Reads the designer form into the draft and refreshes the preview, without re-rendering the form. */
function bannerFromForm(f) {
  const fd = new FormData(f), v = (k) => fd.get(k), b = bannerDraft;
  b.text = { headline: v("headline") || "", sub: v("sub") || "", style: v("style") || "bold", size: v("size") || "l", align: v("align") || "left", color: v("color") || "auto", shadow: !!v("shadow") };
  b.bg = { type: v("bgType") || "gradient", preset: v("preset") || b.bg.preset, color: v("bgColor") || b.bg.color, image: v("bgImage") || "", dim: +(v("dim") ?? b.bg.dim) };
  b.logo = { size: v("logoSize") || "md", align: v("logoAlign") || "left" };
  b.height = v("height") || "tall";
  b.graphics.forEach((g, i) => { ["size", "x", "y", "rotate", "opacity"].forEach((k) => { if (fd.has(`g${i}_${k}`)) g[k] = +fd.get(`g${i}_${k}`); }); if (fd.has(`g${i}_color`)) g.color = fd.get(`g${i}_color`); });
  return b;
}
Inputs["banner-live"] = (form, e) => {
  if (e?.target?.type === "range") { const o = e.target.nextElementSibling; if (o) o.textContent = e.target.value + (/opacity|size|_x|_y|dim/.test(e.target.name) ? "%" : /rotate/.test(e.target.name) ? "°" : ""); }
  const b = bannerFromForm(form);
  $(".preset-picks", form).hidden = b.bg.type !== "gradient"; $(".bg-color", form).hidden = b.bg.type !== "color"; $(".bg-image", form).hidden = b.bg.type !== "image";
  $("#banner-preview").innerHTML = flat(bannerHtml(S.church(), b));
};
document.addEventListener("change", (e) => { const f = e.target.closest?.('form[data-input="banner-live"]'); if (f && e.target.type === "radio") Inputs["banner-live"](f, e); });
Forms["banner-save"] = (d, f) => {
  const b = bannerFromForm(f);
  if (b.bg.type === "image" && !b.bg.image) return formError(f, "Choose a photo, or pick a gradient or color.");
  S.updateChurch({ banner: JSON.parse(JSON.stringify(b)) }); bannerDraft = null; toast("Banner saved"); go("home");
};
Actions["banner-discard"] = () => { bannerDraft = null; render(); toast("Changes discarded"); };
const keepDraft = () => { const f = $('form[data-form="banner-save"]'); if (f) bannerFromForm(f); };
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
