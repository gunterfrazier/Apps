// ---------- Hymn library ----------
// 282 public-domain hymns from the Open Hymnal Project (openhymnal.org), built into hymns/hymns.json by
// tools/hymns.mjs: words split into verses and refrains, with the key, time signature, topics and Scripture
// references. Songs and lyrics opens it with "Hymn library"; Add copies a hymn into the church's songs, marked public
// domain, where it can be edited and given chords like any other song. Nothing is shared back.

let hymnLib = null, hymnLibLoading = null, hymnLibFailed = false;
function loadHymnLib() {
  if (hymnLib || hymnLibLoading) return hymnLibLoading;
  hymnLibLoading = fetch("hymns/hymns.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { hymnLib = d.hymns || []; render(); return hymnLib; })
    .catch(() => { hymnLibFailed = true; hymnLibLoading = null; render(); });
  return hymnLibLoading;
}
const hymnById = (id) => (hymnLib || []).find((h) => h.id === id);
/** The church's song already copied from this hymn, if any. */
const hymnSong = (h) => S.list("songs").find((s) => s.hymnId === h.id || (s.publicDomain && s.title.toLowerCase() === h.title.toLowerCase()));
const hymnAuthor = (h) => h.words.replace(/\s+/g, " ").replace(/\.$/, "");

Screens.hymns = () => {
  if (!canSeePlans()) return { redirect: "ministry" };
  if (!hymnLib) {
    if (!hymnLibFailed) loadHymnLib();
    return { title: "Hymn library", back: "songs", body: hymnLibFailed
      ? html`<div class="panel" style="margin-top:16px"><p>The hymn library couldn't load. Check your connection.</p><button class="btn ghost sm" data-act="hymns-retry">Try again</button></div>`
      : html`<div class="loading" role="status"><span class="ai-dot"></span>Loading hymns...</div>` };
  }
  const topics = [...new Set(hymnLib.map((h) => h.category).filter(Boolean))].sort();
  return {
    title: "Hymn library", back: "songs",
    body: html`<p class="muted" style="margin-top:14px">${hymnLib.length} public-domain hymns from the <a href="https://openhymnal.org/" target="_blank" rel="noopener">Open Hymnal Project</a>, free to sing, project and print. Add one to your songs to put it in a service plan, then edit it or add chords like any other song.</p>
      <label class="field"><span class="sr">Search hymns</span><input type="search" placeholder="Search by title, author, topic or Scripture" data-input="filter-rows" data-target="#hymn-list" data-empty="#hymn-none"></label>
      <div class="chips" role="group" aria-label="Topics">${topics.map((t) => html`<button type="button" class="chip" data-act="hymns-topic" data-topic="${t}">${t.toLowerCase().replace(/^./, (c) => c.toUpperCase())}</button>`)}</div>
      <div class="rows" id="hymn-list">${hymnLib.map((h) => { const have = hymnSong(h); return html`<button class="row" data-act="hymn-open" data-id="${h.id}" data-search="${h.title} ${h.words} ${h.tune} ${h.category} ${h.topics.join(" ")} ${h.scripture}"><span class="lead-ic">${icon("music")}</span><span class="body"><span class="t">${h.title}</span><span class="s">${hymnAuthor(h)}${have ? " · In your songs" : ""}</span></span>${icon(have ? "check" : "chev")}</button>`; })}</div>
      <div id="hymn-none" class="empty" hidden><p>No hymns match.</p></div>`,
  };
};
Actions["hymns-retry"] = () => { hymnLibFailed = false; loadHymnLib(); render(); };
Actions["hymns-topic"] = (el) => {
  const box = $("#main input[data-target='#hymn-list']");
  if (!box) return;
  box.value = box.value === el.dataset.topic ? "" : el.dataset.topic;
  Inputs["filter-rows"](box);
};
Actions["hymn-open"] = (el) => {
  const h = hymnById(el.dataset.id);
  if (!h) return;
  const have = hymnSong(h);
  openSheet(h.title, html`<p class="muted" style="margin-top:0">Words: ${hymnAuthor(h)}${h.music ? html`<br>Music: ${h.music.replace(/\s+/g, " ")}` : ""}<br>Key ${h.key || "?"}, ${h.timeSig || "4/4"}${h.meter ? `, meter ${h.meter.replace(/ /g, ".")}` : ""}${h.scripture ? html`<br>Scripture: ${h.scripture}` : ""}</p>
    ${h.parts.map((p) => html`<h3 class="mf-h">${p.label}</h3><p style="white-space:pre-line;margin-top:4px">${p.lyrics}</p>`)}
    <p class="faint">Public domain. From the Open Hymnal Project.</p>
    <div class="btns">${have ? html`<button class="btn ghost" data-act="close-sheet">${icon("check")}Already in your songs</button>` : canPlan() ? html`<button class="btn" data-act="hymn-add" data-id="${h.id}">${icon("plus")}Add to our songs</button>` : html`<span class="faint">Ask a worship planner to add it.</span>`}</div>`);
};
Actions["hymn-add"] = (el) => {
  const h = hymnById(el.dataset.id);
  if (!h || !canPlan() || hymnSong(h)) return;
  const parts = h.parts.map((p) => ({ id: uid(), type: p.type, label: p.label, lyrics: p.lyrics }));
  const straight = h.order.join("\n") === parts.map((p) => p.label).join("\n");
  S.add("songs", { title: h.title, author: hymnAuthor(h), ccliSong: "", copyright: "Public domain", publicDomain: true, hymnId: h.id,
    key: (h.key || "D").replace(/min$|m$/, "m"), bpm: 76, timeSig: h.timeSig || "4/4", parts, order: straight ? [] : h.order, lyrics: partsToLyrics(parts), charts: [] });
  closeSheet(); toast(`${h.title} added to your songs`); render();
};
