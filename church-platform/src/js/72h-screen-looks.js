// ---------- Looks per screen ----------
// The same slides can look different on different screens. Each audience screen (a paired display, or a window the
// booth opens with Open my screens) picks a look:
//   full     the slides as designed (the default)
//   words    the words on plain black: no photo or motion backgrounds (side TVs, or screens that struggle with video)
//   lower    the words as a lower third on black, for a video switcher's luma key or a confidence feed
//   green    the same lower third on green, for a chroma key
// Logos, media and title slides stay off the lower-third looks; they show only words.

const SCREEN_LOOKS = [["full", "Full slides"], ["words", "Words only, on black"], ["lower", "Lower third, on black"], ["green", "Lower third, on green"]];
const lookName = (k) => SCREEN_LOOKS.find(([v]) => v === k)?.[1] || SCREEN_LOOKS[0][1];
/** This screen's look: a window the booth opened carries it in its name; a paired display has it in its settings. */
function screenLook() {
  const fromWindow = typeof screenWindowLook === "function" ? screenWindowLook() : "";
  const look = fromWindow || thisDevice()?.settings?.look || "full";
  return SCREEN_LOOKS.some(([v]) => v === look) ? look : "full";
}
/** The audience screen's markup for one slide in a look. */
function lookHtml(look, s, st) {
  if (look === "lower" || look === "green") return html`<div class="look-key look-${look}"><div class="ov-frame">${overlayHtml(s, st)}</div></div>`;
  if (look === "words") {
    const plain = s && !["logo", "black", "media"].includes(s.kind) ? { ...s, bg: null, bgVideo: null, image: s.kind === "image" ? s.image : null } : s;
    return html`<div class="display look-words"><div class="stage">${slideHtml(plain)}</div></div>`;
  }
  return html`<div class="display"><div class="stage">${slideHtml(s)}</div></div>`;
}
