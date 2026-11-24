// ---------- The bottom of every page: Light, Dark and Sepia in one tap, and the Our Faithful sign-off ----------
// Like Veritas Logos, the look is one tap away instead of inside Settings. System and Sanctuary are still in
// Me, Settings, and "System" shows here as none of the three being picked.

const QUICK_THEMES = [["light", "Light", "sun"], ["dark", "Dark", "moon"], ["sepia", "Sepia", "book"]];
/** Light, Dark and Sepia as one control. */
function themeSwitch(label = "Appearance") {
  const cur = prefs().theme || "auto";
  return html`<div class="theme-switch" role="group" aria-label="${label}">${QUICK_THEMES.map(([k, l, ic]) =>
    html`<button type="button" data-act="quick-theme" data-v="${k}" aria-pressed="${cur === k}" class="ts-${k}">${icon(ic)}<span>${l}</span></button>`)}</div>`;
}
Actions["quick-theme"] = (el) => {
  const p = prefs();
  // Picking the one that's on goes back to following the phone.
  p.theme = p.theme === el.dataset.v ? "auto" : el.dataset.v;
  S.save(); applyDisplay(); render();
  toast(p.theme === "auto" ? "Following your device's light or dark setting" : `${QUICK_THEMES.find(([k]) => k === p.theme)[1]} appearance`);
};

/** The sign-off at the bottom of each page: the dove, and the app's name in the logo's colors. */
function pageFooter() {
  return html`<footer class="page-foot">
    ${themeSwitch()}
    <p class="pf-sign">${IN_PREVIEW ? html`${raw(OFC_MARK)}<span><b>Our Faithful</b> Church App</span>` : html`<a href="${SITE_ROOT}?home" aria-label="About Our Faithful Church App">${raw(OFC_MARK)}<span><b>Our Faithful</b> Church App</span></a>`}</p>
    <p class="pf-links"><a href="${IN_PREVIEW ? `https://${SITE_DOMAIN}/` : SITE_ROOT}privacy/">Privacy policy</a></p>
  </footer>`;
}
