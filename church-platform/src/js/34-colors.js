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
/**
 * The colors in an image that a church would use as brand colors, most important first. White, black and greys are
 * left out (they're the page, the outline or anti-aliasing), unless the picture has no real colors at all. Small but
 * strong accents count: a gold cross on a navy logo shows up even though it covers little of the picture.
 */
function imageColors(src, count = 6) {
  if (imageColorCache.has(src)) return imageColorCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 160, scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data, bins = new Map();
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          total++;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
          const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          bin.n++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin);
        }
        const all = [...bins.values()].filter((x) => x.n >= Math.max(2, total * 0.002)).map((x) => {
          const rgb = [x.r / x.n, x.g / x.n, x.b / x.n], [hue, sat, light] = rgbToHsl(rgb);
          // A real color: enough saturation, not so light or dark that it reads as white or black.
          const colorful = sat >= 0.22 && light > 0.1 && light < 0.85 && (Math.max(...rgb) - Math.min(...rgb)) > 28;
          // Coverage counts, but with a square root, so a small strong accent isn't drowned by a big field.
          return { rgb, hue, sat, light, n: x.n, colorful, score: Math.sqrt(x.n) * (0.4 + sat) };
        });
        const pick = (list) => {
          const out = [];
          for (const c of list.sort((a, b) => b.score - a.score)) {
            // Distinct: a different hue, or the same hue clearly lighter or darker.
            const near = out.some((o) => { const dh = Math.min(Math.abs(o.hue - c.hue), 360 - Math.abs(o.hue - c.hue)); return dh < 22 && Math.abs(o.light - c.light) < 0.18; });
            if (!near) out.push(c);
            if (out.length >= count) break;
          }
          return out;
        };
        // Edges between two colors (teal fading into white, say) aren't colors of their own: drop any color that sits
        // on the line between two of the picture's main colors, white or black.
        const big = [...all].sort((a, b) => b.n - a.n).slice(0, 24).concat([{ rgb: [255, 255, 255], n: Infinity }, { rgb: [0, 0, 0], n: Infinity }]);
        const blend = (c) => big.some((p, i) => p !== c && p.n > c.n && big.slice(i + 1).some((q) => {
          if (q === c || q.n <= c.n) return false;
          const d = q.rgb.map((v, k) => v - p.rgb[k]), len = d.reduce((a, v) => a + v * v, 0); if (!len) return false;
          const t = c.rgb.reduce((a, v, k) => a + (v - p.rgb[k]) * d[k], 0) / len;
          if (t < 0.12 || t > 0.88) return false;
          return Math.hypot(...c.rgb.map((v, k) => v - (p.rgb[k] + d[k] * t))) < 16;
        }));
        let picked = pick(all.filter((c) => c.colorful && !blend(c)));
        // Nothing colorful (a black and white logo): offer its greys, still not pure white or black.
        if (!picked.length) picked = pick(all.filter((c) => c.light > 0.06 && c.light < 0.94));
        resolve(picked.map((c) => "#" + c.rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")));
      } catch { resolve([]); } // A picture from another site that doesn't allow reading its pixels.
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
  imageColorCache.set(src, p);
  return p;
}
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// ----- Brand colors: the logo's colors, kept with the church for the banner and landing page -----
const paletteKey = (src) => src ? `${src.length}:${src.slice(-40)}` : "";
/** The church's brand colors from its logo (may be empty until worked out). */
const brandPalette = (c = S.church()) => (c?.logo && c.paletteKey === paletteKey(c.logo) ? c.palette || [] : []);
/** Works out the brand colors when the logo is new or changed, then redraws. Only managers save them. */
function ensurePalette(c = S.church()) {
  if (!c?.logo || c.paletteKey === paletteKey(c.logo) || ensurePalette.busy === c.logo) return;
  if (!(S.can("manage.church") || S.can("manage.page"))) return;
  ensurePalette.busy = c.logo;
  imageColors(c.logo).then((colors) => {
    ensurePalette.busy = "";
    if (S.church()?.id !== c.id) return;
    S.updateChurch({ palette: colors, paletteKey: paletteKey(c.logo) });
    if (/^#admin-(banner|page|account)/.test(location.hash)) { keepDraftIfBanner(); const y = scrollY; render(); scrollTo(0, y); }
  });
}
const keepDraftIfBanner = () => { if (typeof keepDraft === "function" && typeof bannerDraft !== "undefined" && bannerDraft) keepDraft(); };
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
      ${inPicker ? "" : html`<small class="faint">Tap one to try it as your church color. ${box.dataset.suggestSrc === S.church()?.logo ? "They're also your brand colors: you can use them in the home banner and the landing page." : ""}</small>`}`);
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
