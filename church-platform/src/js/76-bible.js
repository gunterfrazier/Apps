// ---------- The Bible: a reader with highlights and notes, cross-references, past sermons on a passage, and Logos links ----------
// The text is the public-domain Berean Standard Bible and King James Version already shipped in bible/. Cross-references
// come from OpenBible.info (CC BY), built into bible/xref/<book>.json by tools/xrefs.mjs. Highlights, notes and where
// you're reading are private to each person and sync with their account.

const CHAPTERS = [50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4,
  28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22];
const HIGHLIGHTS = [["yellow", "Yellow"], ["green", "Green"], ["blue", "Blue"], ["pink", "Pink"]];

// ----- References as spans of verses -----
const vkey = (b, c, v) => b * 1e6 + c * 1e3 + v;
/** "John 15:1-8; Romans 8:28-30, 35" -> verse spans. A chapter on its own covers the whole chapter. */
function refSpans(str) {
  const out = [];
  String(str || "").split(";").forEach((part) => {
    let last = null;
    part.split(",").forEach((bit) => {
      const t = bit.trim(); if (!t) return;
      let r = parseRef(t);
      // "John 15:1-8, 12" and "Psalms 1, 2": a bare number carries on from the reference before it.
      if (!r && last && /^\d+(\s*[-–]\s*\d+)?$/.test(t)) {
        const [a, z] = t.split(/[-–]/).map((x) => +x.trim());
        r = last.verse ? { ...last, verse: a, verseEnd: z || undefined } : { ...last, chapter: a, verse: undefined, verseEnd: undefined };
      }
      if (!r) return;
      last = r;
      const b = BOOKS.indexOf(r.book);
      out.push(r.verse ? { from: vkey(b, r.chapter, r.verse), to: vkey(b, r.chapter, r.verseEnd || r.verse) } : { from: vkey(b, r.chapter, 1), to: vkey(b, r.chapter, 999) });
    });
  });
  return out;
}
const spansMeet = (a, b) => a.some((x) => b.some((y) => x.from <= y.to && y.from <= x.to));
/** "John 3:16-18, 20" for verses picked in one chapter. */
function versesLabel(b, c, vs) {
  const runs = []; [...vs].sort((x, y) => x - y).forEach((v) => { const r = runs[runs.length - 1]; if (r && v === r[1] + 1) r[1] = v; else runs.push([v, v]); });
  return `${refLabel({ book: BOOKS[b], chapter: c })}:${runs.map(([a, z]) => (a === z ? a : `${a}-${z}`)).join(", ")}`;
}
/** A slug from a link (#bible-john-3-16) back to a reference. */
function slugToRef(slug) {
  const m = String(slug || "").toLowerCase().match(/^([1-3]?[a-z]+)-(\d+)(?:-(\d+)(?:-(\d+))?)?$/);
  const book = m && BOOKS.find((x) => x.toLowerCase().replace(/\s+/g, "") === m[1]);
  return book ? { book, chapter: +m[2], verse: m[3] ? +m[3] : undefined, verseEnd: m[4] ? +m[4] : undefined } : null;
}

// ----- Logos Bible: ref.ly links open the passage in the Logos app (phone, tablet or computer) or on the Logos website -----
const LOGOS_BOOKS = ["Ge", "Ex", "Le", "Nu", "Dt", "Jos", "Jdg", "Ru", "1Sa", "2Sa", "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Ne", "Es", "Job", "Ps", "Pr", "Ec", "So", "Is", "Je", "La", "Eze", "Da", "Ho", "Joe", "Am", "Ob", "Jon", "Mic", "Na", "Hab", "Zep", "Hag", "Zec", "Mal",
  "Mt", "Mk", "Lk", "Jn", "Ac", "Ro", "1Co", "2Co", "Ga", "Eph", "Php", "Col", "1Th", "2Th", "1Ti", "2Ti", "Tt", "Phm", "Heb", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn", "Jud", "Re"];
const Logos = {
  link(ref) {
    const r = parseRef(ref); if (!r) return null;
    return `https://ref.ly/${LOGOS_BOOKS[BOOKS.indexOf(r.book)]}${r.chapter}${r.verse ? `.${r.verse}${r.verseEnd && r.verseEnd !== r.verse ? `-${r.verseEnd}` : ""}` : ""}`;
  },
  /** People who preach and teach see "Open in Logos" unless they turn it off; anyone can turn it on in Settings. */
  shown() { const p = prefs().logos; return p === undefined ? S.isMember() && S.canAny(["build.sermons", "build.lessons", "build.studies", "present"]) : !!p; },
};
/** Where Read buttons and passage look-ups open: the Bible here (the default), Veritas Logos or Logos. */
const bibleOpen = () => { const p = prefs().bibleOpen; return p === "veritas" && Veritas.enabled() ? "veritas" : p === "logos" ? "logos" : "app"; };
function bibleHref(ref) {
  const r = parseRef(ref); if (!r) return null;
  const where = bibleOpen();
  return where === "veritas" ? Veritas.read(ref) : where === "logos" ? Logos.link(ref) : `#bible-${refSlug(r)}`;
}
function readLink(ref, label = "Read", cls = "btn sm") {
  const href = bibleHref(ref); if (!href) return "";
  return href.startsWith("#") ? html`<a class="${cls}" href="${href}">${icon("word")}${label}</a>` : ext(href, label, cls, "word");
}

// ----- Past sermons and lessons on a passage (like Logos's sermon markers) -----
/** Sermons, and lessons, studies and sermon outlines you can open, on any part of this passage. Newest first. */
function pastMessages(ref, { sermon, doc } = {}) {
  const want = refSpans(ref); if (!want.length) return [];
  const out = [], linked = new Set();
  S.list("sermons").filter((s) => s.id !== sermon && s.passage).forEach((s) => {
    const spans = refSpans(s.passage); if (!spansMeet(spans, want)) return;
    if (s.docId) linked.add(s.docId);
    out.push({ title: s.title, kind: "Sermon", passage: s.passage, date: String(s.date || ""), when: s.date ? fmtShort(s.date) : "", who: s.speaker, href: `#sermon-${s.id}`, spans });
  });
  S.list("docs").filter((d) => d.id !== doc && !linked.has(d.id) && d.passage).forEach((d) => {
    const spans = refSpans(d.passage); if (!spansMeet(spans, want)) return;
    const href = canEditDoc(d) ? `#build-${d.id}` : d.published ? `#outline-${d.id}` : null; if (!href) return;
    out.push({ title: d.title, kind: DOC_KINDS[d.kind]?.label || "Lesson", passage: d.passage, date: d.date || "", when: d.date ? fmtShort(fromIsoDay(d.date)) : "", who: d.authorId && d.authorId !== S.me().id ? S.userName(d.authorId) : "", href, spans });
  });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
function pastPanel(ref, opts = {}) {
  const list = pastMessages(ref, opts); if (!list.length) return "";
  const label = opts.label || "From our church on this passage", shown = list.slice(0, opts.max || 4);
  return html`<section class="past" aria-label="${label}"><h3>${icon("word")}${label}</h3>
    <div class="rows">${shown.map((m) => html`<a class="row" href="${m.href}"><span class="body"><span class="t">${m.title}</span><span class="s">${[m.kind, m.passage, m.when, m.who].filter(Boolean).join(", ")}</span></span>${icon("chev")}</a>`)}</div>
    ${list.length > shown.length ? html`<p class="faint" style="margin:6px 0 0">And ${list.length - shown.length} more.</p>` : ""}</section>`;
}

// ----- Cross-references (OpenBible.info, CC BY) -----
const xrefCache = {};
const loadXrefs = (b) => (xrefCache[b] ||= fetch(`bible/xref/${b}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch((e) => { delete xrefCache[b]; throw e; }));
/** "42.15.1-8" -> { label: "John 15:1-8", slug }. */
function decodeXref(code) {
  const [start, end] = code.split("-"), [b, c, v] = start.split(".").map(Number), book = BOOKS[b]; if (!book) return null;
  let label = `${refLabel({ book, chapter: c })}:${v}`, verseEnd;
  if (end) { const e = end.split(".").map(Number); if (e.length === 1) { verseEnd = e[0]; label += `-${e[0]}`; } else label += `-${e[0]}:${e[1]}`; }
  return { label, ref: { book, chapter: c, verse: v, verseEnd }, slug: refSlug({ book, chapter: c, verse: v }) };
}
/** Related passages for some verses of one chapter: the top ones for each verse first, then the rest. */
async function xrefsFor(b, c, verses, max = 12) {
  const data = await loadXrefs(b), lists = verses.map((v) => (data[`${c}.${v}`] || "").split(" ").filter(Boolean)), seen = new Set(), out = [];
  for (let i = 0; out.length < max && lists.some((l) => l[i]); i++) lists.forEach((l) => { const x = l[i]; if (x && !seen.has(x) && out.length < max) { seen.add(x); out.push(x); } });
  return out.map(decodeXref).filter(Boolean);
}
const xrefCredit = () => html`<p class="faint xref-credit">Cross-references from <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noopener">OpenBible.info</a>, CC BY.</p>`;
async function xrefList(b, c, verses) {
  const t = bibleT(), list = await xrefsFor(b, c, verses);
  if (!list.length) return html`<p class="muted">No cross-references for this passage yet.</p>${xrefCredit()}`;
  const preview = await Promise.all(list.map((x) => Bible.text(refLabel(x.ref), t, false).then((s) => s.slice(0, 140) + (s.length > 140 ? "..." : ""), () => "")));
  return html`<div class="rows">${list.map((x, i) => html`<button class="row" data-act="bible-go" data-to="${x.slug}"><span class="body"><span class="t">${x.label}</span>${preview[i] ? html`<span class="s">${preview[i]}</span>` : ""}</span>${icon("chev")}</button>`)}</div>${xrefCredit()}`;
}
/** "Related passages" under a passage, loaded when someone opens it. */
function xrefPanel(ref) {
  const r = parseRef(ref); if (!r) return "";
  return html`<details class="xref-panel" data-ref="${ref}"><summary>${icon("link")}Related passages</summary><div class="xref-box" aria-live="polite"><p class="faint">Finding related passages...</p></div></details>`;
}
document.addEventListener("toggle", (e) => {
  const d = e.target; if (!d.matches?.(".xref-panel") || !d.open || d.dataset.loaded) return;
  d.dataset.loaded = "1";
  const r = parseRef(d.dataset.ref), b = BOOKS.indexOf(r.book), verses = r.verse ? Array.from({ length: (r.verseEnd || r.verse) - r.verse + 1 }, (_, i) => r.verse + i) : Array.from({ length: 176 }, (_, i) => i + 1);
  xrefList(b, r.chapter, verses).then((h) => { $(".xref-box", d).innerHTML = flat(h); }, () => { d.dataset.loaded = ""; $(".xref-box", d).innerHTML = flat(html`<p class="muted">Related passages couldn't load. Check your connection.</p>`); });
}, true);

// ----- The reader -----
const bibleT = () => (Bible.translations.includes(prefs().bibleT) ? prefs().bibleT : "BSB");
const bibleData = {}, bibleWant = {};
/** A chapter's verses if they're loaded; otherwise starts loading them (and draws again when they arrive). */
function chapterVerses(t, b, c) {
  const part = b < 39 ? "ot" : "nt", key = `${t}-${part}`;
  if (bibleData[key]) return bibleData[key][b < 39 ? b : b - 39]?.[c - 1] || null;
  if (!bibleWant[key]) { bibleWant[key] = true; Bible.load(t, part).then((d) => { bibleData[key] = d; render(); }, () => { bibleWant[key] = "failed"; render(); }); }
  return bibleWant[key] === "failed" ? null : undefined;
}
let bibleSel = { at: "", verses: [], jumped: "" };
const noteSpan = (k) => { const m = String(k).match(/^(\d+)\.(\d+)\.(\d+)-(\d+)$/); return m ? { b: +m[1], c: +m[2], v1: +m[3], v2: +m[4] } : null; };
const spanLabel = (sp) => `${refLabel({ book: BOOKS[sp.b], chapter: sp.c })}:${sp.v1}${sp.v2 !== sp.v1 ? `-${sp.v2}` : ""}`;
const spanSlug = (sp) => refSlug({ book: BOOKS[sp.b], chapter: sp.c, verse: sp.v1, verseEnd: sp.v2 !== sp.v1 ? sp.v2 : undefined });
Screens.bible = (tail) => {
  const p = prefs(), t = bibleT();
  let r = slugToRef(tail) || slugToRef(p.bibleAt) || { book: "John", chapter: 1 };
  const b = BOOKS.indexOf(r.book), max = CHAPTERS[b];
  if (r.chapter > max || r.chapter < 1) r = { book: r.book, chapter: Math.min(Math.max(r.chapter, 1), max) };
  const here = refSlug({ book: r.book, chapter: r.chapter });
  if (p.bibleAt !== here) { p.bibleAt = here; S.save(); }
  if (bibleSel.at !== here) bibleSel = { at: here, verses: [], jumped: "" };
  const verses = chapterVerses(t, b, r.chapter), label = refLabel({ book: r.book, chapter: r.chapter });
  const prev = r.chapter > 1 ? { book: r.book, chapter: r.chapter - 1 } : b > 0 ? { book: BOOKS[b - 1], chapter: CHAPTERS[b - 1] } : null;
  const next = r.chapter < max ? { book: r.book, chapter: r.chapter + 1 } : b < 65 ? { book: BOOKS[b + 1], chapter: 1 } : null;
  const hl = S.state.highlights || {}, noteAt = {};
  Object.keys(S.state.verseNotes || {}).forEach((k) => { const sp = noteSpan(k); if (sp && sp.b === b && sp.c === r.chapter) noteAt[sp.v2] = k; });
  // Verses a sermon or lesson here has covered get a marker in the margin.
  const past = pastMessages(label), covered = new Set();
  past.forEach((m) => m.spans.forEach((s) => { for (let v = 1; v <= 176; v++) { const k = vkey(b, r.chapter, v); if (k >= s.from && k <= s.to) covered.add(v); } }));
  const nav = (x, ic, l) => x ? html`<a class="icon-btn" href="#bible-${refSlug(x)}" aria-label="${l}: ${refLabel(x)}">${icon(ic)}</a>` : html`<span class="icon-btn" aria-hidden="true"></span>`;
  return {
    title: "Bible", tab: "word",
    body: html`${seg(wordSeg(), "bible")}
      <div class="bible-bar">${nav(prev, "prev", "Previous chapter")}<button class="bible-where" data-act="bible-pick" aria-label="${label}. Choose a book and chapter">${label}${icon("down")}</button>${nav(next, "next", "Next chapter")}
        <div class="bible-t" role="group" aria-label="Translation">${Bible.translations.map((x) => html`<button data-act="bible-t" data-t="${x}" aria-pressed="${x === t}">${x}</button>`)}</div></div>
      ${verses === undefined ? html`<div class="loading" role="status" style="min-height:30vh"><span class="ai-dot"></span>Opening ${label}...</div>`
      : !verses ? html`<div class="panel" style="margin-top:14px"><p style="margin-top:0">${label} couldn't load. Check your connection and try again.</p><button class="btn" data-act="bible-retry">Try again</button></div>`
      : html`${past.length ? pastPanel(label, { label: `From our church on ${label}`, max: 3 }) : ""}
        <div class="btns bible-tools">${listenBtn(`passage:${label}`, "Listen")}${Logos.shown() ? ext(Logos.link(label), "Open in Logos", "btn ghost sm", "link") : ""}${Veritas.enabled() && Veritas.read(label) ? ext(Veritas.read(label), "Veritas Logos", "btn ghost sm", "book") : ""}</div>
        <article class="bible-text" aria-label="${label}, ${t}">${verses.map((txt, i) => { const v = i + 1, k = `${b}.${r.chapter}.${v}`, on = bibleSel.verses.includes(v);
          return html`<span class="bv${hl[k] ? ` hl-${hl[k]}` : ""}${on ? " sel" : ""}${covered.has(v) ? " preached" : ""}" id="v${v}" data-act="bible-verse" data-v="${v}" role="button" tabindex="0" aria-pressed="${on}"><sup>${v}</sup>${txt || "(This verse isn't in the earliest manuscripts.)"}</span>${noteAt[v] ? html`<button class="bv-note" data-act="bible-note-open" data-k="${noteAt[v]}" aria-label="Your note on ${spanLabel(noteSpan(noteAt[v]))}">${icon("note")}</button>` : ""} `; })}</article>
        <p class="faint bible-credit">${t === "BSB" ? "Berean Standard Bible." : "King James Version."} Public domain. Tap a verse to highlight it, write a note, copy, share or see related passages.</p>
        <div class="btns bible-pager">${prev ? html`<a class="btn ghost sm" href="#bible-${refSlug(prev)}">${icon("prev")}${refLabel(prev)}</a>` : ""}${next ? html`<a class="btn ghost sm" href="#bible-${refSlug(next)}">${refLabel(next)}${icon("next")}</a>` : ""}</div>`}
      ${verses && bibleSel.verses.length ? bibleBar(b, r.chapter) : ""}`,
    after() {
      // Arriving at a verse (#bible-john-3-16): bring it into view and mark it for a moment.
      if (!verses || !r.verse || bibleSel.jumped === tail) return;
      bibleSel.jumped = tail;
      const el = $(`#v${r.verse}`); if (!el) return;
      el.scrollIntoView({ block: "center" });
      for (let v = r.verse; v <= (r.verseEnd || r.verse); v++) $(`#v${v}`)?.classList.add("flash");
    },
  };
};
function bibleBar(b, c) {
  const label = versesLabel(b, c, bibleSel.verses), vs = [...bibleSel.verses].sort((x, y) => x - y);
  const range = `${refLabel({ book: BOOKS[b], chapter: c })}:${vs[0]}${vs.length > 1 ? `-${vs[vs.length - 1]}` : ""}`;
  return html`<div class="bible-actions" role="toolbar" aria-label="${label}">
    <div class="ba-top"><b>${label}</b><button class="icon-btn" data-act="bible-clear" aria-label="Clear the selection">${icon("x")}</button></div>
    <div class="ba-colors">${HIGHLIGHTS.map(([k, name]) => html`<button class="swatch hl-${k}" data-act="bible-hl" data-c="${k}" aria-label="Highlight ${name.toLowerCase()}"></button>`)}<button class="swatch clear" data-act="bible-hl" data-c="" aria-label="Remove the highlight">${icon("x")}</button></div>
    <div class="ba-btns"><button class="btn ghost sm" data-act="bible-note">${icon("note")}Note</button><button class="btn ghost sm" data-act="bible-copy">${icon("copy")}Copy</button><button class="btn ghost sm" data-act="bible-share">${icon("share")}Share</button><button class="btn ghost sm" data-act="bible-xref">${icon("link")}Related</button>${Logos.shown() ? ext(Logos.link(range), "Logos", "btn ghost sm", "link") : ""}</div></div>`;
}
const bibleHere = () => { const r = slugToRef(prefs().bibleAt) || { book: "John", chapter: 1 }; return { b: BOOKS.indexOf(r.book), c: r.chapter }; };
const selectedText = () => { const { b, c } = bibleHere(), vs = chapterVerses(bibleT(), b, c) || []; return [...bibleSel.verses].sort((x, y) => x - y).map((v) => `${v} ${vs[v - 1] || ""}`).join(" "); };
Actions["bible-verse"] = (el) => { const v = +el.dataset.v; bibleSel.verses = bibleSel.verses.includes(v) ? bibleSel.verses.filter((x) => x !== v) : [...bibleSel.verses, v]; render(); };
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".bv[data-act=bible-verse]")) { e.preventDefault(); e.target.click(); } });
Actions["bible-clear"] = () => { bibleSel.verses = []; render(); };
Actions["bible-t"] = (el) => { prefs().bibleT = el.dataset.t; S.save(); render(); };
Actions["bible-retry"] = () => { Object.keys(bibleWant).forEach((k) => { if (bibleWant[k] === "failed") delete bibleWant[k]; }); render(); };
Actions["bible-hl"] = (el) => {
  const { b, c } = bibleHere(), color = el.dataset.c; S.state.highlights ||= {};
  bibleSel.verses.forEach((v) => { const k = `${b}.${c}.${v}`; if (color) S.state.highlights[k] = color; else delete S.state.highlights[k]; });
  S.save(); toast(color ? "Highlighted" : "Highlight removed"); bibleSel.verses = []; render();
};
Actions["bible-copy"] = () => { const { b, c } = bibleHere(); copyText(`${versesLabel(b, c, bibleSel.verses)} (${bibleT()})\n${selectedText()}`, "Verses copied"); };
Actions["bible-share"] = async () => {
  const { b, c } = bibleHere(), label = versesLabel(b, c, bibleSel.verses), text = `${label} (${bibleT()})\n${selectedText()}`;
  if (navigator.share) { try { await navigator.share({ title: label, text }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  copyText(text, "Verses copied");
};
Actions["bible-xref"] = async () => {
  const { b, c } = bibleHere(), vs = [...bibleSel.verses].sort((x, y) => x - y), label = versesLabel(b, c, vs);
  openSheet(`Related to ${label}`, html`<div id="xref-sheet" aria-live="polite"><p class="faint">Finding related passages...</p></div>`);
  try { const h = await xrefList(b, c, vs); const box = $("#xref-sheet"); if (box) box.innerHTML = flat(h); }
  catch { const box = $("#xref-sheet"); if (box) box.innerHTML = flat(html`<p class="muted">Related passages couldn't load. Check your connection.</p>`); }
};
Actions["bible-go"] = (el) => { closeSheet(true); go(`bible-${el.dataset.to}`); };
function openVerseNote(k) {
  const sp = noteSpan(k); if (!sp) return;
  const n = (S.state.verseNotes || {})[k], vs = chapterVerses(bibleT(), sp.b, sp.c) || [], text = vs.slice(sp.v1 - 1, sp.v2).join(" ");
  openSheet(`Note on ${spanLabel(sp)}`, html`<form data-form="bible-note" novalidate><input type="hidden" name="k" value="${k}">
    ${text ? html`<p class="scripture" style="margin-top:0">${text}</p>` : ""}
    <label class="field"><span>Your note</span><textarea name="text" maxlength="4000" required placeholder="What stands out to you? A question, a prayer, something to remember...">${n?.text || ""}</textarea><small>Only you can see your notes.</small></label>
    <div class="btns"><button class="btn">Save note</button>${n ? html`<button type="button" class="btn danger" data-act="bible-note-delete" data-k="${k}">Delete note</button>` : ""}</div></form>`);
}
Actions["bible-note"] = () => { const { b, c } = bibleHere(), vs = [...bibleSel.verses].sort((x, y) => x - y); openVerseNote(`${b}.${c}.${vs[0]}-${vs[vs.length - 1]}`); };
Actions["bible-note-open"] = (el) => openVerseNote(el.dataset.k);
Forms["bible-note"] = (d, f) => {
  const text = String(d.text || "").trim(); if (!text) return formError(f, "Write your note first.");
  S.state.verseNotes ||= {}; S.state.verseNotes[d.k] = { text, at: new Date().toISOString() };
  S.save(); closeSheet(); bibleSel.verses = []; toast("Note saved"); render();
};
Actions["bible-note-delete"] = (el) => { delete (S.state.verseNotes || {})[el.dataset.k]; S.save(); closeSheet(); toast("Note deleted"); render(); };
// Going to a book and chapter, or straight to a reference.
Actions["bible-pick"] = () => {
  const books = (from, to) => BOOKS.slice(from, to).map((x, i) => html`<button class="bp-book" data-act="bible-book" data-b="${from + i}">${x === "Psalms" ? "Psalms" : x}</button>`);
  openSheet("Go to", html`<form class="bible-find" data-form="bible-find" novalidate><label class="field" style="margin-top:0"><span class="sr">Book or reference</span><input type="search" name="ref" placeholder="A book, or a reference like John 3:16" data-input="bible-find" autocomplete="off"></label></form>
    <div id="bp-chapters"></div><h3 class="bp-head">Old Testament</h3><div class="bp-books">${books(0, 39)}</div><h3 class="bp-head">New Testament</h3><div class="bp-books">${books(39, 66)}</div>`, { wide: true });
};
Actions["bible-book"] = (el) => {
  const b = +el.dataset.b, box = $("#bp-chapters"); if (!box) return;
  if (CHAPTERS[b] === 1) { closeSheet(true); go(`bible-${refSlug({ book: BOOKS[b], chapter: 1 })}`); return; }
  box.innerHTML = flat(html`<h3 class="bp-head">${BOOKS[b]}</h3><div class="bp-chapters">${Array.from({ length: CHAPTERS[b] }, (_, i) => html`<button class="bp-ch" data-act="bible-go" data-to="${refSlug({ book: BOOKS[b], chapter: i + 1 })}">${i + 1}</button>`)}</div>`);
  box.scrollIntoView({ block: "nearest" });
};
Inputs["bible-find"] = (el) => {
  const q = el.value.trim().toLowerCase().replace(/\s+/g, " ");
  $$(".bp-book").forEach((x) => { x.hidden = !!q && !x.textContent.toLowerCase().startsWith(q) && !x.textContent.toLowerCase().replace(/\s/g, "").startsWith(q.replace(/\s/g, "")); });
};
Forms["bible-find"] = (d) => {
  const r = parseRef(d.ref);
  if (r && r.chapter <= CHAPTERS[BOOKS.indexOf(r.book)]) { closeSheet(true); go(`bible-${refSlug(r)}`); return; }
  const only = $$(".bp-book").filter((x) => !x.hidden); if (only.length === 1) only[0].click(); else toast("Try a book name or a reference like John 3:16");
};

// ----- Settings: translation, where Read buttons open, and Logos buttons -----
function bibleSection() {
  const t = bibleT(), open = bibleOpen();
  const opts = [["app", "The Bible here", "Highlights, notes and related passages. Works offline once a book has been opened."],
    ...(Veritas.enabled() ? [["veritas", "Veritas Logos", "Hebrew and Greek, study tools and study guides"]] : []),
    ["logos", "Logos Bible", "Opens the Logos app, or the Logos website if you don't have the app"]];
  return html`<section class="sec" id="bible-settings"><h2 class="sec-head">Bible</h2>
    <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Translation</legend><div class="radios">${Bible.translations.map((x) => html`<label><input type="radio" name="bibleT" value="${x}" data-change="pref-bible" ${attr(x === t, "checked")}><span>${x === "BSB" ? "Berean Standard Bible" : "King James Version"}</span></label>`)}</div></fieldset>
    <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Read buttons and passage look-ups open in</legend><div class="rows">${opts.map(([k, l, sub]) => html`<label class="row" style="cursor:pointer"><input type="radio" name="bibleOpen" value="${k}" data-change="pref-bible" ${attr(k === open, "checked")} style="accent-color:var(--brand)"><span class="body"><span class="t">${l}</span><span class="s">${sub}</span></span></label>`)}</div></fieldset>
    <label class="check"><input type="checkbox" name="logos" data-change="pref-bible" ${attr(Logos.shown(), "checked")}><span>Show Open in Logos buttons next to passages</span></label></section>`;
}
Inputs["pref-bible"] = (el) => { const p = prefs(); if (el.name === "logos") p.logos = el.checked; else p[el.name] = el.value; S.save(); toast("Saved"); };

// ----- Reading plans from a topic (the AI suggests, a leader checks and saves) -----
Actions["plan-topic"] = () => openSheet("Draft a reading plan", html`<form data-form="plan-topic" novalidate>
  <label class="field" style="margin-top:0"><span>What's it about?</span><input type="text" name="topic" required maxlength="80" placeholder="Worry and God's peace"></label>
  <div class="room-fields"><label class="field"><span>Days</span><select name="days">${[5, 7, 10, 14, 21, 30].map((n) => html`<option ${attr(n === 7, "selected")}>${n}</option>`)}</select></label>
    <label class="field"><span>Readings each day</span><select name="per"><option value="1">One</option><option value="2">Two (Old and New Testament)</option></select></label></div>
  <p class="faint">Veritas Logos suggests the passages. Every reference is checked against the Bible, and you see the whole plan, and can change any day, before it's saved.</p>
  <div class="btns"><button class="btn">${icon("bolt")}Draft the plan</button></div></form>`);
Forms["plan-topic"] = async (d, f) => {
  const topic = String(d.topic || "").trim(); if (!topic) return formError(f, "Say what the plan is about.");
  const days = clamp(+d.days || 7, 3, 40), per = +d.per === 2 ? 2 : 1;
  aiSheet("Draft a reading plan", aiWorking("a reading plan"));
  try {
    const out = await AI.json(`${AI_RULES}

Make a ${days}-day Bible reading plan for a church about: "${topic}".
Each day has ${per === 2 ? "two readings, one from the Old Testament and one from the New Testament," : "one reading"} of about 5 to 30 verses, chosen because it speaks directly to the topic. Order the days so understanding builds from one day to the next. Don't repeat a passage.
Write each reading as a Bible reference with the full English book name, like "Philippians 4:4-9" or "Psalm 23".
Reply as JSON: {"name": "a short plan name", "description": "one or two sentences inviting people to read along", "days": [["reference"${per === 2 ? `, "reference"` : ""}]]}`);
    const plan = await checkPlan(out);
    if (!plan.days.length) throw { code: "empty" };
    closeSheet(true);
    adminEdit("plans", { name: plan.name || topic, description: plan.description || "", days: plan.days });
    toast(plan.dropped ? `Drafted ${plural(plan.days.length, "day")}. ${plural(plan.dropped, "suggested reading")} that didn't match a real passage ${plan.dropped === 1 ? "was" : "were"} left out.` : `Drafted ${plural(plan.days.length, "day")}. Check them, then add the plan.`);
  } catch (e) { aiSheet("Draft a reading plan", html`<p class="room-msg warn">${icon("info")}${e?.code === "empty" ? "None of the suggested readings matched a real passage. Try again, or say the topic another way." : aiError(e)}</p>`); }
};
/** Keeps only references that are real passages in the Bible here, written the standard way. */
async function checkPlan(out) {
  let dropped = 0; const days = [];
  for (const day of Array.isArray(out?.days) ? out.days.slice(0, 40) : []) {
    const keep = [];
    for (const x of (Array.isArray(day) ? day : [day]).slice(0, 3)) {
      const r = parseRef(x), ok = r && (await Bible.text(refLabel(r), "BSB", false).then(() => true, () => false));
      if (ok) keep.push(refLabel(r)); else dropped++;
    }
    if (keep.length) days.push(keep);
  }
  return { name: String(out?.name || "").slice(0, 60), description: String(out?.description || "").slice(0, 300), days, dropped };
}
