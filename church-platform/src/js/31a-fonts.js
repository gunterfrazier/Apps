// ---------- The font library: Google Fonts for banners, slides and screens ----------
// Each font loads only when it's used or shown in a picker. [id, name, CSS family, kind, weight to use, Google spec]

const FONT_LIBRARY = [
  ["inter", "Inter", "Inter", "Clean", 800, "Inter:wght@400;800"],
  ["montserrat", "Montserrat", "Montserrat", "Clean", 800, "Montserrat:wght@400;800"],
  ["poppins", "Poppins", "Poppins", "Clean", 700, "Poppins:wght@400;700"],
  ["raleway", "Raleway", "Raleway", "Clean", 800, "Raleway:wght@400;800"],
  ["nunito", "Nunito", "Nunito", "Clean", 800, "Nunito:wght@400;800"],
  ["worksans", "Work Sans", "Work Sans", "Clean", 700, "Work+Sans:wght@400;700"],
  ["outfit", "Outfit", "Outfit", "Clean", 700, "Outfit:wght@400;700"],
  ["dmsans", "DM Sans", "DM Sans", "Clean", 700, "DM+Sans:wght@400;700"],
  ["josefin", "Josefin Sans", "Josefin Sans", "Clean", 700, "Josefin+Sans:wght@400;700"],
  ["quicksand", "Quicksand", "Quicksand", "Clean", 700, "Quicksand:wght@400;700"],
  ["oswald", "Oswald", "Oswald", "Bold", 700, "Oswald:wght@400;700"],
  ["bebas", "Bebas Neue", "Bebas Neue", "Bold", 400, "Bebas+Neue"],
  ["anton", "Anton", "Anton", "Bold", 400, "Anton"],
  ["archivo", "Archivo Black", "Archivo Black", "Bold", 400, "Archivo+Black"],
  ["righteous", "Righteous", "Righteous", "Bold", 400, "Righteous"],
  ["alfaslab", "Alfa Slab One", "Alfa Slab One", "Bold", 400, "Alfa+Slab+One"],
  ["bungee", "Bungee", "Bungee", "Bold", 400, "Bungee"],
  ["abril", "Abril Fatface", "Abril Fatface", "Bold", 400, "Abril+Fatface"],
  ["playfair", "Playfair Display", "Playfair Display", "Classic", 800, "Playfair+Display:wght@400;800"],
  ["merriweather", "Merriweather", "Merriweather", "Classic", 700, "Merriweather:wght@400;700"],
  ["lora", "Lora", "Lora", "Classic", 700, "Lora:wght@400;700"],
  ["cormorant", "Cormorant Garamond", "Cormorant Garamond", "Classic", 700, "Cormorant+Garamond:wght@400;700"],
  ["baskerville", "Libre Baskerville", "Libre Baskerville", "Classic", 700, "Libre+Baskerville:wght@400;700"],
  ["cinzel", "Cinzel", "Cinzel", "Classic", 700, "Cinzel:wght@400;700"],
  ["garamond", "EB Garamond", "EB Garamond", "Classic", 700, "EB+Garamond:wght@400;700"],
  ["dmserif", "DM Serif Display", "DM Serif Display", "Classic", 400, "DM+Serif+Display"],
  ["crimson", "Crimson Text", "Crimson Text", "Classic", 700, "Crimson+Text:wght@400;700"],
  ["fraunces", "Fraunces", "Fraunces", "Classic", 700, "Fraunces:wght@400;700"],
  ["caveat", "Caveat", "Caveat", "Handwritten", 700, "Caveat:wght@400;700"],
  ["dancing", "Dancing Script", "Dancing Script", "Handwritten", 700, "Dancing+Script:wght@400;700"],
  ["greatvibes", "Great Vibes", "Great Vibes", "Handwritten", 400, "Great+Vibes"],
  ["pacifico", "Pacifico", "Pacifico", "Handwritten", 400, "Pacifico"],
  ["satisfy", "Satisfy", "Satisfy", "Handwritten", 400, "Satisfy"],
  ["kaushan", "Kaushan Script", "Kaushan Script", "Handwritten", 400, "Kaushan+Script"],
  ["sacramento", "Sacramento", "Sacramento", "Handwritten", 400, "Sacramento"],
  ["allura", "Allura", "Allura", "Handwritten", 400, "Allura"],
  ["parisienne", "Parisienne", "Parisienne", "Handwritten", 400, "Parisienne"],
  ["atkinson", "Atkinson Hyperlegible", "Atkinson Hyperlegible", "Easy to read", 700, "Atkinson+Hyperlegible:wght@400;700"],
  ["lexend", "Lexend", "Lexend", "Easy to read", 700, "Lexend:wght@400;700"],
];
const FONT_KINDS = ["Clean", "Bold", "Classic", "Handwritten", "Easy to read"];
const fontById = (id) => FONT_LIBRARY.find((f) => f[0] === id) || null;
const loadedFonts = new Set();
/** Loads a font from Google Fonts once. Each font is its own request, so one that can't load doesn't stop the rest. */
function ensureFont(id) {
  const f = fontById(id);
  if (!f || loadedFonts.has(id) || typeof document === "undefined") return;
  loadedFonts.add(id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f[5]}&display=swap`;
  document.head.appendChild(link);
}
/** CSS for a font: its family (with a fallback of the same kind) and the weight that looks right. */
function fontCss(id) {
  const f = fontById(id);
  if (!f) return "";
  ensureFont(id);
  const fallback = f[3] === "Classic" ? "Georgia, serif" : f[3] === "Handwritten" ? "cursive" : "system-ui, sans-serif";
  return `font-family:'${f[2]}', ${fallback};font-weight:${f[4]};`;
}
/** A font picker: cards showing sample text in each font, sorted by kind. name: the radio group's name. */
function fontPicker(name, current, sample = "Welcome home") {
  return html`<div class="font-picker" data-font-picker>
    <div class="fp-kinds" role="group" aria-label="Kinds of fonts">${["All", ...FONT_KINDS].map((k, i) => html`<button type="button" class="chip" data-act="font-kind" data-kind="${k}" aria-pressed="${i === 0}">${k}</button>`)}</div>
    <div class="fp-list" role="radiogroup" aria-label="Font">
      <label class="fp-card" data-kind="All"><input type="radio" name="${name}" value="" ${attr(!current, "checked")}><span class="fp-sample" style="font-weight:800">${sample}</span><small>Match the style</small></label>
      ${FONT_LIBRARY.map(([id, label, , kind]) => html`<label class="fp-card" data-kind="${kind}"><input type="radio" name="${name}" value="${id}" ${attr(current === id, "checked")}>
        <span class="fp-sample" style="${raw(esc(fontCss(id)))}">${sample}</span><small>${label}</small></label>`)}
    </div></div>`;
}
Actions["font-kind"] = (el) => {
  const box = el.closest("[data-font-picker]"), kind = el.dataset.kind;
  $$("[data-act=font-kind]", box).forEach((b) => b.setAttribute("aria-pressed", String(b === el)));
  $$(".fp-card", box).forEach((card) => { card.hidden = kind !== "All" && card.dataset.kind !== kind && !$("input", card).checked; });
};
