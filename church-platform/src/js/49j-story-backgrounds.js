// ---------- Story backgrounds: illustrated slide backgrounds that match the story being taught ----------
// The Veritas Logos Kids background library (family-lib/backgrounds.json) has a set of scenes for each story, in story
// order, most ending with a reflection and memory verse scene. Each scene is labeled with where the words read best (left,
// right or center: the open part of the picture) and its tone (light pictures take dark words, dark ones take white).
// A lesson that uses a set gets one picture per slide: the story slides walk through the scenes in order, and the
// questions, big idea and prayer use the reflection scene. Each slide can be changed under Slide backgrounds.

/** The background set for a Family Library story, if the library has one. */
const storyBgSet = (storyId) => familyLib?.bgSets?.find((x) => x.story === storyId) || null;
const bgSceneUrl = (scene) => famPic(scene.file);
/** The scene a background picture comes from (so a picked picture keeps its text placement). */
function bgSceneFor(url) {
  if (!url || !familyLib?.bgSets || !url.startsWith("family-lib/backgrounds/")) return null;
  for (const set of familyLib.bgSets) { const scene = set.scenes.find((x) => bgSceneUrl(x) === url); if (scene) return scene; }
  return null;
}
const withScene = (slide, scene) => scene ? { ...slide, bg: bgSceneUrl(scene), bgZone: scene.zone, bgTone: scene.tone, bgScene: scene.id } : slide;

/** Gives a lesson's slides their story backgrounds. Called by docSlides before each slide's own choice is applied. */
function applyStoryBackgrounds(d, slides) {
  if (!familyLib && !familyLibFailed) { loadFamilyLib(); return slides; } // Loads once, then redraws with the pictures.
  const set = d.bgStory && storyBgSet(d.bgStory);
  if (!set || set.scenes.length < 2) return slides;
  // A set's reflection scene (Storytime Reflection & Memory Verse) is for questions and prayer, and the story walks the
  // rest. Sets without one walk every scene and reuse the closing scene for questions and prayer.
  const reflect = set.scenes.find((x) => x.reflection) || set.scenes[set.scenes.length - 1];
  const story = set.scenes.some((x) => x.reflection) ? set.scenes.filter((x) => x !== reflect) : set.scenes;
  const telling = ["title", "text", "scripture", "point", "lyrics"], thinking = ["question", "keynote"];
  const walk = slides.filter((s) => telling.includes(s.kind));
  return slides.map((s) => {
    if (thinking.includes(s.kind)) return withScene(s, reflect);
    const i = walk.indexOf(s);
    if (i < 0) return s;
    // Spread the story slides over the story scenes, first slide on the first scene, last on the last.
    return withScene(s, story[walk.length < 2 ? 0 : Math.round((i * (story.length - 1)) / (walk.length - 1))]);
  });
}

// ----- In the lesson builder -----
function storyBgPanel(d) {
  if (!familyLib && !familyLibFailed) loadFamilyLib();
  if (!familyLib?.bgSets?.length) return "";
  const set = d.bgStory && storyBgSet(d.bgStory), edit = canEditDoc(d);
  return html`<section class="sec bg-panel"><div class="sec-head"><h2>Story backgrounds</h2>${set ? html`<span class="faint">${plural(set.scenes.length, "scene")}</span>` : ""}</div>
    ${set ? html`<p class="faint" style="margin-top:-4px">Slides use the <b>${set.title}</b> pictures (${set.scripture}), in story order, with the words placed where each picture leaves room.</p>
      <div class="bg-strip">${set.scenes.map((x) => html`<figure title="${x.num}. ${x.title}"><img src="${bgSceneUrl(x)}" alt="" loading="lazy" decoding="async"><figcaption>${x.num}. ${x.title}</figcaption></figure>`)}</div>`
      : html`<p class="faint" style="margin-top:-4px">Illustrated Veritas Logos Kids pictures for ${plural(familyLib.bgSets.length, "story", "stories")}. Pick one and every slide gets a matching scene.</p>`}
    ${edit ? html`<div class="btns"><button class="btn ghost sm" data-act="bg-set-pick" data-id="${d.id}">${icon("image")}${set ? "Change pictures" : "Choose story pictures"}</button>
      <a class="btn ghost sm" href="#slides-doc-${d.id}">${icon("edit")}Change one slide</a>${set ? html`<button class="btn ghost sm" data-act="bg-set-use" data-id="${d.id}" data-story="">Turn off</button>` : ""}</div>` : ""}</section>`;
}
Actions["bg-set-pick"] = (el) => {
  const d = S.get("docs", el.dataset.id);
  openSheet("Story pictures", html`<p class="faint" style="margin-top:0">Each story has its own scenes, in order, and a reflection scene for questions and prayer.</p>
    <div class="bg-sets">${familyLib.bgSets.map((set) => html`<button type="button" class="bg-set ${d.bgStory === set.story ? "on" : ""}" data-act="bg-set-use" data-id="${d.id}" data-story="${set.story}" aria-pressed="${d.bgStory === set.story ? "true" : "false"}">
      <img src="${bgSceneUrl(set.scenes[0])}" alt="" loading="lazy"><span><b>${set.title}</b><span class="faint">${set.scripture}, ${plural(set.scenes.length, "scene")}</span></span></button>`)}</div>`);
};
Actions["bg-set-use"] = (el) => {
  const d = S.get("docs", el.dataset.id); if (!d) return;
  const story = el.dataset.story;
  if (story) d.bgStory = story; else delete d.bgStory;
  // Slides someone picked one by one keep their picture only if it isn't from the old set.
  touch(d); closeSheet(); render();
  toast(story ? `Slides use the ${storyBgSet(story).title} pictures` : "Story pictures turned off");
};

/** In a slide's Edit sheet: the lesson's scenes to choose from. */
function storyBgSceneField(item) {
  const sets = familyLib?.bgSets; if (!sets?.length || item.kind !== "lesson") return "";
  const set = storyBgSet(item.bgStory) || null;
  const list = set ? [set] : sets;
  return html`<div class="field"><span>${set ? `${set.title} scenes` : "Story pictures"}</span><div class="bg-scenes">${list.flatMap((st) => st.scenes).map((x) => html`<button type="button" class="bg-scene" data-act="bg-scene-pick" data-url="${bgSceneUrl(x)}" title="${x.title}"><img src="${bgSceneUrl(x)}" alt="${x.title}" loading="lazy"></button>`)}</div>
    <small>Tap a scene to use it on this slide. The words move to the open part of the picture.</small></div>`;
}
Actions["bg-scene-pick"] = (el) => {
  const form = el.closest("form"); form.elements.bg.value = el.dataset.url;
  const box = form.querySelector('[data-preview="bg"]'); if (box) box.innerHTML = `<img src="${esc(el.dataset.url)}" alt="">`;
  form.querySelectorAll(".bg-scene").forEach((b) => b.classList.toggle("on", b === el));
};
