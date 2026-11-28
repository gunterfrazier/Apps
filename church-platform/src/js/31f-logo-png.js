// ---------- Logos: kept as PNG files, with a plain background removed automatically ----------
// A logo with a solid background (white, black or any one color) has it cleared from the edges inward, the same way
// "Remove logo background" does at its usual setting. Colors enclosed by the artwork (the inside of an O, white
// letters on a colored badge) stay, so nothing inside the logo disappears; that sheet can clear those too.

const LOGO_AUTO_TOLERANCE = 24;
/** For this session, each cleared logo's original (cleared → original), so the removal can be undone or redone by hand. */
const LogoOriginal = new Map();
const logoOriginal = (src) => LogoOriginal.get(src) || src;

/** True when nearly the whole border is the background colors, so clearing it is safe. A photo's border isn't one color. */
function logoBorderIsPlain({ data, width, height }, colors) {
  let opaque = 0, match = 0;
  const check = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 200) return;
    opaque++;
    if (colors.some((c) => logoColorDistance(data, i, c) <= LOGO_AUTO_TOLERANCE + 16)) match++;
  };
  for (let x = 0; x < width; x++) { check(x, 0); check(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { check(0, y); check(width - 1, y); }
  return opaque > 0 && match / opaque >= 0.9;
}

/** A picture as a PNG, the same size and look. */
async function logoAsPng(src, max = 1024) {
  if (/^data:image\/png/.test(src)) return src;
  return (await bannerLogoPixels(src, max)).canvas.toDataURL("image/png");
}

/** A logo as a PNG with a plain background cleared. { src, cleared }. A logo that's already see-through, or a photo, is only converted. */
async function logoToPng(src, max = 512) {
  const edit = await bannerLogoPixels(src, max);
  const found = logoBackgroundColors(edit.original);
  if (!found.transparent && found.colors.length && logoBorderIsPlain(edit.original, found.colors)) {
    let visiblePixels = 0;
    for (let i = 3; i < edit.original.data.length; i += 4) if (edit.original.data[i]) visiblePixels++;
    const out = makeLogoTransparent({ ...edit, backgrounds: found.colors, visiblePixels, tint: "" }, LOGO_AUTO_TOLERANCE, false);
    if (out) return { src: out, cleared: true };
  }
  return { src: /^data:image\/png/.test(src) ? src : edit.canvas.toDataURL("image/png"), cleared: false };
}

/** An uploaded logo file, read as a PNG with a plain background cleared. */
async function readLogo(file, max = 512) {
  const original = await readImage(file, max, 1, { preserveTransparency: true, type: "image/png" }), out = await logoToPng(original, max);
  if (out.cleared) LogoOriginal.set(out.src, original);
  return out;
}

/** Puts a logo into a logo field (Account details): PNG, background cleared, with Undo kept for the original. */
async function logoFieldPut(form, name, src) {
  const field = $(`input[name="${name}"]`, form); if (!field) return;
  let out = { src, cleared: false };
  try { out = await logoToPng(src); } catch { /* A picture from a site that won't let the browser read it stays a link. */ }
  if (!form.isConnected) return;
  if (out.cleared) LogoOriginal.set(out.src, await logoAsPng(src).catch(() => src));
  imageFieldSet(form, name, out.src);
  toast(out.cleared ? "Logo added. Its background was removed." : "Logo added");
}

Actions["logo-undo"] = (el) => {
  const form = el.closest("form"), name = el.dataset.field, field = $(`input[name="${name}"]`, form);
  if (!field || !LogoOriginal.has(field.value)) return;
  imageFieldSet(form, name, LogoOriginal.get(field.value));
  toast("Background put back");
  $(`[data-act="logo-clean"][data-field="${name}"]`, form)?.focus();
};
/** "Remove background" on a logo field opens the full sheet: pick colors, tolerance, inside letters, white or dark. */
Actions["logo-clean"] = (el) => {
  const form = el.closest("form"), name = el.dataset.field, field = $(`input[name="${name}"]`, form);
  if (!field?.value) return;
  const src = logoOriginal(field.value);
  openLogoCleaner({ src, button: el, naming: false, name: S.church()?.name ? `${S.church().name} logo` : "Logo",
    active: () => form.isConnected,
    onSave: (_name, result) => { LogoOriginal.set(result, src); imageFieldSet(form, name, result); toast("Background removed"); } });
};
