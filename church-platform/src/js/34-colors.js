// ---------- Colors: an easier picker, and church colors taken from the logo and photos ----------
// colorPicker() is one control for every color in the app: a row of ready colors, colors pulled from the church's
// logo and banner photo, a hex box and the device's full picker, with a note when text on the color would be hard to
// read. Any image field also offers the colors in its picture as church colors.

const PICKER_COLORS = [
  "#254ffe", "#2563eb", "#1e40af", "#0e7490", "#0f766e", "#15803d", "#2f5d50", "#4d7c0f",
  "#a16207", "#b45309", "#c2410c", "#b91c1c", "#8c2f39", "#be185d", "#7c3aed", "#5b21b6",
  "#334155", "#1f2937", "#57534e", "#111111",
];

/** The images a church's colors can come from: its logo, its banner's logos and its banner photo. */
function churchColorSources(c = S.church()) {
  if (!c) return [];
  const b = bannerOf(c), out = [];
  if (c.logo) out.push(["From your logo", c.logo]);
  (b.logos || []).forEach((l) => { if (l.src && l.src !== c.logo) out.push([`From ${l.name || "a banner logo"}`, l.src]); });
  if (b.bg?.type === "image" && b.bg.image) out.push(["From your banner photo", b.bg.image]);
  return out.slice(0, 4);
}

/**
 * A color control. name: the form field it fills. opts.sources: [[label, imageSrc]] to offer colors from.
 * opts.apply: what picking does right away ("look" previews the church color in Admin, Appearance).
 */
function colorPicker(name, value, { sources = [], apply = "", label = "Color", church = false } = {}) {
  const v = normHex(value, PLATFORM.color);
  const swatch = (col) => html`<button type="button" class="cp-swatch" data-act="cp-pick" data-color="${col}" style="background:${col}" aria-label="${col}" aria-pressed="${col === v}"></button>`;
  return html`<div class="cpick" data-cpick ${attr(apply, `data-apply="${apply}"`)} ${attr(church, "data-church-color")}>
    <div class="cp-top">
      <span class="cp-now" style="background:${v}" aria-hidden="true"></span>
      <label class="cp-hexbox"><span class="sr">${label} hex code</span><input type="text" name="${name}" value="${v}" maxlength="7" spellcheck="false" autocomplete="off" data-input="cp-hex" pattern="#[0-9a-fA-F]{6}"></label>
      <label class="btn ghost sm cp-any">${icon("edit")}Any color<input type="color" value="${v}" data-input="cp-native" class="sr"></label>
    </div>
    <div class="cp-grid" role="group" aria-label="${label}">${[...new Set([v, ...PICKER_COLORS])].map(swatch)}</div>
    ${sources.map(([l, src]) => html`<div class="cp-suggest" data-suggest-src="${src}" data-suggest-label="${l}"></div>`)}
    <p class="cp-note" role="status">${contrastWords(v)}</p>
  </div>`;
}
/** How readable white or dark text is on a color, in a few words. */
function contrastWords(hex) {
  const lum = (h) => { const x = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2]; };
  const L = lum(hex), white = 1.05 / (L + 0.05), black = (L + 0.05) / 0.05, best = Math.max(white, black);
  return best >= 7 ? `Very easy to read: ${white >= black ? "white" : "dark"} text on this color.`
    : best >= 4.5 ? `Easy to read: ${white >= black ? "white" : "dark"} text on this color.`
    : "Hard to read text on this color. A slightly darker or lighter shade works better for buttons.";
}
/** Sets a picker to a color: its box, its swatch, its note, and whatever listens to the form. */
function setPickerColor(box, col) {
  col = normHex(col, null);
  if (!box || !col) return;
  const input = $("[data-input=cp-hex]", box);
  input.value = col;
  $(".cp-now", box).style.background = col;
  $("[data-input=cp-native]", box).value = col;
  $(".cp-note", box).textContent = contrastWords(col);
  $$("[data-act=cp-pick]", box).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.color.toLowerCase() === col)));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  if (box.dataset.apply === "look" && typeof lookChange === "function") lookChange({ color: col });
}
Actions["cp-pick"] = (el) => setPickerColor(el.closest("[data-cpick]"), el.dataset.color);
Inputs["cp-native"] = (el) => setPickerColor(el.closest("[data-cpick]"), el.value);
Inputs["cp-hex"] = (el, e) => {
  // Typing: follow along once it's a whole color. A picked color arrives here too (not typed): pass it on to
  // whatever the form listens with, such as the banner's live preview.
  if (e?.isTrusted) {
    const v = el.value.trim().replace(/^([0-9a-f]{6})$/i, "#$1");
    if (/^#[0-9a-fA-F]{6}$/.test(v)) setPickerColor(el.closest("[data-cpick]"), v);
    return;
  }
  const outer = el.parentElement.closest("[data-input]");
  if (outer) Inputs[outer.dataset.input]?.(outer, e);
};

// ----- Colors in a picture -----
const imageColorCache = new Map();
/** The main colors in an image, most important first: a handful of distinct, usable colors, not the white page. */
function imageColors(src, count = 6) {
  if (imageColorCache.has(src)) return imageColorCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 96, scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data, bins = new Map();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
          const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          bin.n++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
        }
        const colors = [...bins.values()].map((x) => {
          const r = x.r / x.n, g = x.g / x.n, b = x.b / x.n, max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max ? (max - min) / max : 0, light = (max + min) / 510;
          // Weight by how much of the picture it covers, favoring real colors over near-white and near-black.
          const score = x.n * (0.35 + sat) * (light > 0.94 || light < 0.06 ? 0.25 : 1);
          return { rgb: [r, g, b], score };
        }).sort((a, b) => b.score - a.score);
        const picked = [];
        for (const c of colors) {
          if (picked.every((p) => Math.hypot(p.rgb[0] - c.rgb[0], p.rgb[1] - c.rgb[1], p.rgb[2] - c.rgb[2]) > 52)) picked.push(c);
          if (picked.length >= count) break;
        }
        resolve(picked.map((c) => "#" + c.rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")));
      } catch { resolve([]); } // A picture from another site that doesn't allow reading its pixels.
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
  imageColorCache.set(src, p);
  return p;
}
/** Fills in every "colors from" row on the page. Runs after each render. */
function hydrateColorSuggestions(root = document) {
  $$("[data-suggest-src]:not([data-ready])", root).forEach(async (box) => {
    box.dataset.ready = "1";
    const colors = await imageColors(box.dataset.suggestSrc);
    if (!colors.length || !box.isConnected) { box.hidden = true; return; }
    const inPicker = box.closest("[data-cpick]"), manager = S.can("manage.church") || S.can("manage.page");
    if (!inPicker && !manager) { box.hidden = true; return; }
    box.innerHTML = flat(html`<span class="cp-suggest-k">${box.dataset.suggestLabel}</span><span class="cp-suggest-row">${colors.map((col) =>
      html`<button type="button" class="cp-swatch" style="background:${col}" data-act="${inPicker ? "cp-pick" : "use-church-color"}" data-color="${col}" aria-label="${inPicker ? col : `Use ${col} as the church color`}"></button>`)}</span>
      ${inPicker ? "" : html`<small class="faint">Tap one to try it as your church color.</small>`}`);
  });
}
/** A color from a picture becomes the church color: in this form's picker if it has one, otherwise as a draft look. */
Actions["use-church-color"] = (el) => {
  const form = el.closest("form"), picker = form && $("[data-cpick][data-church-color]", form);
  if (picker) { setPickerColor(picker, el.dataset.color); picker.scrollIntoView({ block: "center", behavior: "smooth" }); toast("Church color set. Save to keep it."); return; }
  const c = S.church();
  S.updateChurch({ themeDraft: { ...(c.themeDraft || {}), color: el.dataset.color } });
  appearancePreview = true; applyBrand();
  toast("Previewing it as your church color. Publish it in Admin, Appearance.");
};
