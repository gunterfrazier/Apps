// ---------- Veritas Logos Kids intro and credits on children's lessons ----------
// A children's lesson opens with the animated Veritas Logos Kids intro, its ribbon and title card showing the lesson's
// title and passage, and closes with the credits, which name the lesson, its teacher, its class and the church.
// The player is kids/intro.html (from Veritas Logos); a slide plays it full screen with the lesson's details.
// Lessons for younger classes get them by default; each lesson can turn them off (Details), and a church can turn
// the feature off (Admin, Features).

const KIDS_SECS = { intro: 14, outro: 25 };
/** Whether this lesson opens and closes with the kids intro and credits. */
function kidsBookendsOn(d) {
  if (!d || d.kind !== "lesson" || !S.on("kidsintro")) return false;
  if (typeof d.kidsBookends === "boolean") return d.kidsBookends;
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  return classAge(g) !== "teen"; // On for children's classes; youth and adult classes can switch it on.
}
function kidsCredits(d) {
  const c = S.church(), g = d.gatheringId && S.get("gatherings", d.gatheringId), teacher = d.authorId && S.user(d.authorId) ? S.userName(d.authorId) : "";
  return [
    ["TODAY'S LESSON", d.title], ["SCRIPTURE", d.passage], ["TEACHER", teacher], ["CLASS", g?.name], ["PRESENTED BY", c?.name],
    ["STORIES & SCRIPTURE", "Veritas Logos Kids"], ["WATCH MORE AT", "veritaslogos.com"],
  ].filter(([, v]) => v).map(([r, v]) => `${r} : ${String(v).replace(/\n/g, " ")}`).join("\n");
}
/** The first and last slides of a lesson that has them. */
function kidsBookendSlides(d) {
  const base = { kind: "kids", title: d.title, body: d.passage || "", section: "" };
  return [
    { ...base, part: "intro", notes: `The Veritas Logos Kids intro plays (about ${KIDS_SECS.intro} seconds) and ends on today's title.` },
    { ...base, part: "outro", credits: kidsCredits(d), notes: `The closing credits play (about ${KIDS_SECS.outro} seconds).` },
  ];
}
function kidsPlayerUrl(s) {
  const q = new URLSearchParams({ play: s.part, title: s.title || "", ref: s.body || "" });
  if (s.credits) q.set("credits", s.credits);
  return `kids/intro.html?${q}`;
}
/** A kids intro or credits slide: the picture in previews, the player on the live slide (see startSlideVideos). */
function kidsSlideHtml(s) {
  const intro = s.part === "intro";
  return html`<div class="slide-video kids-bookend ${intro ? "is-intro" : "is-outro"}" data-embed="${kidsPlayerUrl(s)}" data-kids="1" data-title="${intro ? `Intro: ${s.title}` : "Closing credits"}">
    <img src="kids/${intro ? "episode-card" : "outro-endcard"}.jpg" alt="">
    ${intro ? html`<div class="kids-card"><small>Today's Story</small><b>${s.title}</b>${s.body ? html`<span>${s.body}</span>` : ""}</div>` : ""}
    <span class="slide-video-play">${icon("play")}</span></div>`;
}
/** In the lesson builder: what the lesson opens and closes with, and a switch. */
function kidsBookendsPanel(d) {
  const on = kidsBookendsOn(d), edit = canEditDoc(d);
  return html`<div class="kids-ends ${on ? "" : "off"}">
    ${on ? html`<div class="kids-ends-pics"><div class="stage mini">${kidsSlideHtml(kidsBookendSlides(d)[0])}</div><div class="stage mini">${kidsSlideHtml(kidsBookendSlides(d)[1])}</div></div>` : ""}
    <div class="kids-ends-text"><b>${on ? "Opens with the Veritas Logos Kids intro" : "No Veritas Logos Kids intro"}</b>
      <span class="faint">${on ? `The first slide plays the intro with “${d.title}”${d.passage ? ` and ${d.passage}` : ""}; the last slide plays the credits.` : "Turn it on to open this lesson with the animated intro and its title, and close with the credits."}</span></div>
    ${edit ? html`<button type="button" class="btn ghost sm" data-act="kids-ends" data-id="${d.id}">${on ? "Turn off" : "Turn on"}</button>` : ""}</div>`;
}
Actions["kids-ends"] = (el) => {
  const d = S.get("docs", el.dataset.id); if (!d) return;
  d.kidsBookends = !kidsBookendsOn(d); touch(d); render();
  toast(d.kidsBookends ? "The intro and credits are on this lesson's slides" : "Intro and credits removed from the slides");
};
