// ---------- Sample data for the newest features, in Riverside Community Church ----------
// Added to buildSeed after the version 15 samples, so the demo and training open with every recent feature already
// showing something: the church's own look (Appearance) and Home layout, a Sunday school lesson built from a Veritas
// Logos Family Library story, a media library of the church's photos, an audio playlist, and a setup guide partly done.
//
// SEED_VERSION says which sample data a demo or training session was built from. When it goes up, sessions on the
// older sample data start over on the new one (20-store.js), so everyone trying the app sees the latest features.
// Raise it whenever new sample data is added here or in the other seed files.
const SEED_VERSION = 23;

/**
 * What's new, for the card on Home in the demo and training. Newest first. Each row says who may open it (the same
 * check its screen makes), so people only see what their role and privileges let them use.
 */
const WHATS_NEW = [
  ["storylesson", "book", "Lessons from Bible stories", "Plan a kids lesson from the Family Library in a few taps", "docs-lesson", () => S.on("storylessons") && S.can("build.lessons")],
  ["appearance", "image", "Your app, your look", "Colors, fonts, Home sections and tabs", "admin-appearance", () => S.can("manage.church")],
  ["medialib", "layers", "Media library", "Free photos, videos and motion backgrounds for slides and screens", "medialib", () => canBuild()],
  ["watch", "play", "Watch and listen", "Past services and your own audio playlist", "live", () => true],
  ["setup", "list", "Setup guide", "A checklist for getting your church ready", "admin-setupguide", () => S.can("manage.church")],
  ["radio", "shield", "Security radio", "Push-to-talk and private messages for the safety team", "security", () => isSecurityMember()],
];
/** The What's new rows this person can open: allowed by their role, and the feature is on for this church. */
const whatsNewFor = () => WHATS_NEW.filter(([, , , , route, can]) => !featureOffFor(route) && can());

{
  const featureSeed = buildSeed;
  buildSeed = function () {
    const st = featureSeed();
    try { addShowcase(st); } catch (e) { console.error("Sample data for the newest features wasn't added", e); }
    st.seedVersion = SEED_VERSION;
    return st;
  };
}

function addShowcase(st) {
  const R = "riverside", c = st.churches[R];
  if (!c) return;
  const now = Date.now(), ago = (d, h = 0) => new Date(now - d * DAY - h * 3600e3).toISOString();
  const here = (k) => (st[k] ||= []);
  const MAIN = "riverside-main";

  // ----- Appearance: the published look, the greeting on Home, and the default tabs -----
  c.theme = { font: "modern", corners: "round", header: "light", canvas: "plain", mode: "auto" };
  const layout = homeLayout(c).map((x) => (x.id === "greeting" ? { ...x, on: true } : x));
  c.homeLayout = [layout.find((x) => x.id === "greeting"), ...layout.filter((x) => x.id !== "greeting")];

  // ----- Your audio playlist: the two newest messages -----
  const recent = st.sermons.filter((s) => s.churchId === R && (s.audioUrl || s.videoUrl)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  st.audioPlaylists = { ...(st.audioPlaylists || {}), [R]: recent.map((s) => s.id) };

  // ----- Media library: photos the church saved, ready for slides, screens and the landing page -----
  const lib = here("mediaLibrary"), demo = (f) => `demo/${f}.jpg`;
  [
    ["worship-crowd", "Worship night", "worship, crowd, music"],
    ["campus-cross", "Campus cross at sunrise", "campus, cross, outdoors"],
    ["hands-on-bible", "Open Bible", "bible, study"],
    ["potluck", "Fellowship meal", "food, fellowship"],
    ["chapel", "The chapel", "building, quiet"],
  ].forEach(([f, title, tags], i) => lib.push({ id: `riverside-media-${f}`, churchId: R, kind: "image", url: demo(f), thumb: demo(f), title, tags,
    credit: { name: "Riverside Community Church", source: "Our photos", license: "" }, sourceId: "", by: "u-marcus", at: ago(12 - i) }));

  // ----- A Sunday school lesson from the Family Library. Its blocks are filled from the story when the app loads it. -----
  const elem = st.gatherings.find((g) => g.id === "riverside-elem9");
  if (elem) {
    const next = new Date(); next.setDate(next.getDate() + ((7 - next.getDay()) % 7 || 7));
    st.docs.push({ id: "riverside-doc-story", churchId: R, kind: "lesson", title: "The lost sheep", passage: "Luke 15:3-7", topic: "", date: isoDay(next), time: "09:00",
      locationId: MAIN, gatheringId: elem.id, authorId: elem.leaders?.[0] || "u-linda", published: true, shareWithParents: true, resource: "", blocks: [],
      storyId: "lost-sheep", storyPending: { id: "lost-sheep", age: "young", len: 45 }, updated: ago(1) });
    // A second lesson the week after, with the Zacchaeus story pictures behind every slide.
    const after = new Date(next); after.setDate(after.getDate() + 7);
    st.docs.push({ id: "riverside-doc-zacchaeus", churchId: R, kind: "lesson", title: "Zacchaeus", passage: "Luke 19:1-10", topic: "", date: isoDay(after), time: "09:00",
      locationId: MAIN, gatheringId: elem.id, authorId: elem.leaders?.[0] || "u-linda", published: false, shareWithParents: true, resource: "", blocks: [], bgStory: "zacchaeus",
      storyId: "zacchaeus", storyPending: { id: "zacchaeus", age: "young", len: 45 }, updated: ago(1) });
    // An unassigned draft (no class, date or time), as if a lesson had been replaced on the calendar.
    st.docs.push({ id: "riverside-doc-draft", churchId: R, kind: "lesson", title: "The vine and the branches", passage: "John 15:1-8", topic: "", date: "", time: "",
      locationId: MAIN, gatheringId: null, formerGatheringId: elem.id, authorId: elem.leaders?.[0] || "u-linda", published: false, shareWithParents: true, resource: "",
      blocks: [{ id: "rdd-1", type: "scripture", ref: "John 15:1-8", translation: "BSB", text: "", show: true, notes: "" }, { id: "rdd-2", type: "point", text: "Stay connected to Jesus", show: true, notes: "" }], updated: ago(3) });
  }

  // ----- Setup guide: the first topics done, so the checklist shows progress -----
  try {
    const selected = setupSelection(c);
    c.setupGuide = { selected, done: Object.fromEntries(selected.slice(0, 4).map((id) => [id, setupTopic(id).steps.map((_, i) => i)])) };
  } catch { /* the setup guide isn't in this build */ }

}

/** The demo's Family Library lesson gets its blocks once the stories have loaded (49f-story-lessons.js). */
function fillPendingStoryLessons() {
  const pending = (S.state.docs || []).filter((d) => d.storyPending);
  if (!pending.length || !familyLib) return;
  for (const d of pending) {
    const s = familyLib.stories.find((x) => x.id === d.storyPending.id);
    if (s) {
      d.blocks = storyBlocks(s, d.storyPending.age, d.storyPending.len, new Set(["game", "scripture", "story", "video", "questions", "craft", "coloring", "pray", "parents", "resources"]));
      d.topic ||= s.topic;
      mergeFamily(d, storyFamily(s, d.storyPending.age), true);
      d.blocks.filter((b) => b.type === "scripture" && !b.text).forEach((b) => fillScripture(b).then(() => S.save()).catch(() => {}));
    }
    delete d.storyPending;
  }
  S.save();
}
setTimeout(() => {
  if (S.state?.docs?.some((d) => d.storyPending)) loadFamilyLib();
  // Say so once when older practice data was rebuilt on the newest sample church.
  if (S.state?.refreshed) { delete S.state.refreshed; S.save(); toast("The sample church was rebuilt with the newest features"); }
}, 0);
