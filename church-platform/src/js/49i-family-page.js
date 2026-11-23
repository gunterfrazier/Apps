// ---------- The family page: what a lesson sends home to parents ----------
// What reaches the parent portal is decided here, not by what's on screen in class. A lesson's family page has:
//   - What we learned: the teacher's summary, plus blocks marked "Send home" (a For parents note, the big idea)
//   - Ask your child: follow-up questions
//   - Take-home projects: projects to do or finish at home (a craft cue marked Send home, or lines the teacher adds)
//   - Print at home: coloring pages and other printable handouts
//   - Read together: passages and books
//   - Watch and explore: videos and links
// Parents of children in the class see it in the parent portal once the lesson is published and "Send the family
// page to parents" is on (Details). Blocks can be private in class (not on a slide) and still go home, which is how
// story lessons keep coloring pages and the For parents note off the screen but on the family page.

const homeFieldsOf = (d) => ({ summary: "", questions: "", projects: "", reading: "", links: "", ...(d.family || {}) });
const familyLines = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);
/** "Title https://link" per line; a bare link is titled by its site. */
function familyLinks(t) {
  return familyLines(t).map((line) => {
    const url = (line.match(/https?:\/\/\S+/) || [])[0];
    if (!url) return null;
    const label = line.replace(url, "").replace(/[\s:–—-]+$/, "").trim();
    let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
    return { label: label || host, url, host };
  }).filter(Boolean);
}
/** Everything the family page shows, gathered from the teacher's fields and the blocks marked Send home. */
function familyPage(d) {
  const f = homeFieldsOf(d), home = d.blocks.filter((b) => b.home && b.type !== "note");
  return {
    summary: [
      ...(f.summary ? [{ text: f.summary }] : []),
      ...home.filter((b) => b.type === "text").map((b) => ({ title: b.title, text: b.text })),
      ...home.filter((b) => b.type === "keynote" || b.type === "point").map((b) => ({ title: b.type === "keynote" ? "The big idea" : "", text: b.text })),
    ],
    questions: [...familyLines(f.questions), ...home.filter((b) => b.type === "question").map((b) => b.text)],
    projects: [...familyLines(f.projects).map((text) => ({ text })), ...home.filter((b) => b.type === "action").map((b) => ({ title: b.label, text: b.text }))],
    printables: home.filter((b) => b.type === "media" && b.image),
    // Passages are compared by what they point to, so "Luke 15:1–7" and "Luke 15:1-7" show once.
    reading: [...familyLines(f.reading), ...home.filter((b) => b.type === "scripture").map((b) => b.ref)]
      .map((r) => { const ref = parseRef(r); return ref ? refLabel(ref) : r; }).filter((r, i, all) => all.indexOf(r) === i),
    links: [...home.filter((b) => b.type === "media" && b.url).map((b) => { let host = ""; try { host = new URL(b.url).hostname.replace(/^www\./, ""); } catch {} return { label: b.caption || "Watch", url: b.url, host, video: true }; }),
      ...familyLinks(f.links)],
  };
}
const familyCount = (p) => p.summary.length + p.questions.length + p.projects.length + p.printables.length + p.reading.length + p.links.length;
const familySent = (d) => d.kind === "lesson" && d.published && d.shareWithParents;

/** Story lessons fill the family page's own fields; the rest comes from blocks marked Send home (storyBlocks). */
function storyFamily(s, age) {
  const vids = s.videos.slice(1), res = (s.resources[age] || []).filter((r) => !r.forTeachers);
  return {
    summary: "",
    questions: s.activity ? `${s.activity.prompt} (Answer: ${s.activity.options[s.activity.answer]})` : "",
    projects: "",
    reading: [s.reference, ...(s.reading || "").split(";")].map((x) => x.trim()).filter((x, i, all) => x && all.indexOf(x) === i).join("\n"),
    links: [...vids.map((v) => `${v.title} (${v.creator}) ${v.url}`), ...res.map((r) => `${r.title} (${r.provider}) ${r.url}`)].join("\n"),
  };
}
/** Adds a story's family fields to a lesson's, keeping what the teacher already wrote. */
function mergeFamily(d, add, replace) {
  const f = replace ? homeFieldsOf({}) : homeFieldsOf(d);
  for (const k of Object.keys(add)) if (add[k]) f[k] = [f[k], add[k]].filter(Boolean).filter((x, i, all) => all.indexOf(x) === i).join("\n");
  d.family = f;
}

// ----- In the lesson builder -----
function familyPanel(d) {
  const p = familyPage(d), n = familyCount(p), edit = canEditDoc(d);
  const chip = (count, label) => count ? html`<span class="tag">${plural(count, label)}</span>` : "";
  const state = !d.shareWithParents ? "Not sent to parents. Turn it on in Details." : d.published ? "Parents of children in this class can see it now." : "Parents will see it once you publish this lesson.";
  return html`<section class="sec family-panel"><div class="sec-head"><h2>Family page</h2><span class="faint">${n ? plural(n, "item") : "Empty"}</span></div>
    <p class="faint" style="margin-top:-4px">What goes home to parents: a summary, questions to ask, take-home projects, coloring pages to print, reading and links. ${state}</p>
    <div class="chips" style="margin:6px 0 10px">${chip(p.summary.length, "summary note")}${chip(p.questions.length, "question")}${chip(p.projects.length, "project")}${chip(p.printables.length, "printable")}${chip(p.reading.length, "reading")}${chip(p.links.length, "link")}</div>
    <div class="btns">${edit ? html`<button class="btn sm" data-act="family-edit" data-id="${d.id}">${icon("edit")}Edit family page</button>` : ""}
      <a class="btn ghost sm" href="#familypage-${d.id}">${icon("eye")}Preview</a>
      ${p.printables.length ? html`<button class="btn ghost sm" data-act="family-print" data-id="${d.id}" data-what="printables">${icon("print")}Print ${p.printables.length === 1 ? "the handout" : `${p.printables.length} handouts`}</button>` : ""}</div>
    <p class="faint" style="margin-bottom:0">Blocks marked <span class="tag home">${icon("home")}Send home</span> show on it too, even when they're private in class.</p></section>`;
}
Actions["family-edit"] = (el) => {
  const d = S.get("docs", el.dataset.id), f = homeFieldsOf(d);
  const area = (name, label, hint, rows = 3) => html`<label class="field"><span>${label}</span><textarea name="${name}" rows="${rows}">${f[name]}</textarea>${hint ? html`<small>${hint}</small>` : ""}</label>`;
  openSheet("Family page", html`<form data-form="family-save" novalidate><input type="hidden" name="id" value="${d.id}">
    ${area("summary", "What we learned", "A few sentences for parents about today's lesson.", 4)}
    ${area("questions", "Ask your child", "One question per line.")}
    ${area("projects", "Take-home projects", "One per line: something to make, do or finish at home this week.")}
    ${area("reading", "Read together", "One per line: a passage like Luke 15:3-7, or a book.")}
    ${area("links", "Videos and links", "One per line: a title, then the link. For example: The Lost Sheep song https://youtube.com/...")}
    <label class="check"><input type="checkbox" name="share" ${attr(d.shareWithParents, "checked")}><span>Send the family page to parents<small class="faint" style="display:block">Parents of children in ${d.gatheringId && S.get("gatherings", d.gatheringId) ? S.get("gatherings", d.gatheringId).name : "the class"} see it in the parent portal once the lesson is published.</small></span></label>
    <button class="btn block">Save</button></form>`);
};
Forms["family-save"] = (data, f) => {
  const d = S.get("docs", data.id); if (!d) return;
  const bad = familyLines(data.links).find((l) => !/https?:\/\/\S+/.test(l));
  if (bad) return formError(f, `Add a link (https://...) to “${bad.slice(0, 40)}”.`);
  d.family = { summary: data.summary.trim(), questions: data.questions.trim(), projects: data.projects.trim(), reading: data.reading.trim(), links: data.links.trim() };
  d.shareWithParents = Boolean(data.share);
  touch(d); closeSheet(); render(); toast("Family page saved");
};
Actions["block-home"] = (el) => { const d = S.get("docs", el.dataset.doc), b = d.blocks[+el.dataset.i]; b.home = !b.home; touch(d); render(); toast(b.home ? "Goes home on the family page" : "Not on the family page"); };

// ----- The family page itself (parents, the class's teachers) -----
Screens.familypage = (id) => {
  const d = S.get("docs", id);
  if (!d || d.kind !== "lesson" || !(canEditDoc(d) || (familySent(d) && S.isMember()))) return { redirect: S.on("parents") ? "parents" : "home" };
  const g = d.gatheringId && S.get("gatherings", d.gatheringId), p = familyPage(d);
  const sec = (title, ic, items, body) => items.length ? html`<section class="sec fam-sec"><h2 class="sec-head">${icon(ic)}${title}</h2>${body}</section>` : "";
  return {
    title: "Family page", back: canEditDoc(d) && !S.on("parents") ? `build-${d.id}` : S.on("parents") ? "parents" : `build-${d.id}`,
    body: html`<div class="fam-head"><p style="margin:16px 0 4px"><span class="tag brand">Take home</span>${g ? html` <span class="tag">${g.name}</span>` : ""}</p><h1>${d.title}</h1>
      <p class="muted" style="margin-top:4px">${[d.passage, (d.date ? fmtDay(fromIsoDay(d.date)) : "")].filter(Boolean).join(", ")}</p></div>
      ${canEditDoc(d) && !familySent(d) ? html`<div class="demo-note">${icon("info")}<div>Parents can't see this yet: ${!d.shareWithParents ? "sending it to parents is off" : "the lesson isn't published"}.</div></div>` : ""}
      <div class="btns">${p.printables.length ? html`<button class="btn sm" data-act="family-print" data-id="${d.id}" data-what="printables">${icon("print")}Print ${p.printables.length === 1 ? "the coloring page" : "the printables"}</button>` : ""}
        <button class="btn ghost sm" data-act="family-print" data-id="${d.id}" data-what="all">${icon("print")}Print this page</button>
        ${canEditDoc(d) ? html`<button class="btn ghost sm" data-act="family-edit" data-id="${d.id}">${icon("edit")}Edit</button>` : ""}</div>
      ${!familyCount(p) ? html`<div class="panel" style="margin-top:14px"><p style="margin:0">Nothing here yet. ${canEditDoc(d) ? "Add a summary, questions, projects, reading or links, or mark blocks Send home." : "Check back after class."}</p></div>` : ""}
      ${sec("What we learned", "book", p.summary, p.summary.map((x) => html`<div class="fam-text">${x.title ? html`<h3>${x.title}</h3>` : ""}<p class="pre">${x.text}</p></div>`))}
      ${sec("Ask your child", "ask", p.questions, html`<ol class="fam-list">${p.questions.map((q) => html`<li>${q}</li>`)}</ol>`)}
      ${sec("Take-home projects", "star", p.projects, html`<div class="fam-cards">${p.projects.map((x) => html`<div class="fam-card">${x.title ? html`<b>${x.title}</b>` : ""}<p class="pre">${x.text}</p></div>`)}</div>`)}
      ${sec("Print at home", "print", p.printables, html`<div class="fam-prints">${p.printables.map((b) => html`<figure class="fam-print"><img src="${b.image}" alt="${b.caption || "Printable page"}" loading="lazy"><figcaption>${b.caption || "Printable page"}</figcaption>
        <button class="btn ghost sm" data-act="family-print" data-id="${d.id}" data-what="one" data-block="${b.id}">${icon("print")}Print</button></figure>`)}</div>`)}
      ${sec("Read together", "word", p.reading, html`<div class="chips">${p.reading.map((r) => { const ref = parseRef(r); return ref ? html`<a class="chip" href="#bible-${refSlug(ref)}">${icon("word")}${refLabel(ref)}</a>` : html`<span class="chip">${r}</span>`; })}</div>`)}
      ${sec("Watch and explore", "play", p.links, html`<div class="rows">${p.links.map((l) => html`<a class="row" href="${l.url}" target="_blank" rel="noopener"><span class="lead-ic">${icon(l.video || /youtu|vimeo/.test(l.host) ? "play" : "link")}</span><span class="body"><span class="t">${l.label}</span><span class="s">${l.host}</span></span>${icon("chev")}</a>`)}</div>`)}`,
  };
};

// ----- Printing: coloring pages one to a sheet, and the family page as a handout -----
function printDoc(title, inner) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><base href="${esc(location.href.split("#")[0])}"><style>
    @page { margin: 12mm; } body { font: 12pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 0; }
    .page { break-after: page; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 92vh; }
    .page:last-child { break-after: auto; } .page img { max-width: 100%; max-height: 86vh; object-fit: contain; } .page p { margin: 8px 0 0; color: #555; }
    h1 { font-size: 20pt; margin: 0 0 2px; } h2 { font-size: 13pt; margin: 16px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; } .muted { color: #555; margin: 0 0 8px; }
    .sheet { break-after: page; } ul, ol { margin: 4px 0; padding-left: 22px; } a { color: #111; } .pre { white-space: pre-wrap; margin: 4px 0; }
  </style></head><body>${inner}</body></html>`;
  frame.onload = () => {
    const w = frame.contentWindow, imgs = [...w.document.images];
    Promise.all(imgs.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))).then(() => {
      w.focus(); w.print(); setTimeout(() => frame.remove(), 60000);
    });
  };
  document.body.appendChild(frame);
}
Actions["family-print"] = (el) => {
  const d = S.get("docs", el.dataset.id); if (!d) return;
  const p = familyPage(d), what = el.dataset.what;
  const pages = (list) => list.map((b) => `<div class="page"><img src="${esc(b.image)}" alt=""><p>${esc(b.caption || "")}</p></div>`).join("");
  if (what === "one") { const b = p.printables.find((x) => x.id === el.dataset.block); if (b) printDoc(b.caption || d.title, pages([b])); return; }
  if (what === "printables") { printDoc(`${d.title}: printables`, pages(p.printables)); return; }
  const g = d.gatheringId && S.get("gatherings", d.gatheringId);
  const list = (items, tag = "ul") => `<${tag}>${items.map((x) => `<li>${x}</li>`).join("")}</${tag}>`;
  const sheet = `<div class="sheet"><h1>${esc(d.title)}</h1><p class="muted">${esc([g?.name, d.passage, (d.date ? fmtDay(fromIsoDay(d.date)) : ""), S.church()?.name].filter(Boolean).join(" · "))}</p>
    ${p.summary.length ? `<h2>What we learned</h2>${p.summary.map((x) => `${x.title ? `<b>${esc(x.title)}</b>` : ""}<p class="pre">${esc(x.text)}</p>`).join("")}` : ""}
    ${p.questions.length ? `<h2>Ask your child</h2>${list(p.questions.map(esc), "ol")}` : ""}
    ${p.projects.length ? `<h2>Take-home projects</h2>${list(p.projects.map((x) => `${x.title ? `<b>${esc(x.title)}:</b> ` : ""}${esc(x.text)}`))}` : ""}
    ${p.reading.length ? `<h2>Read together</h2>${list(p.reading.map(esc))}` : ""}
    ${p.links.length ? `<h2>Watch and explore</h2>${list(p.links.map((l) => `${esc(l.label)}: <a href="${esc(l.url)}">${esc(l.url)}</a>`))}` : ""}</div>`;
  printDoc(d.title, sheet + pages(p.printables));
};
Actions["block-print"] = (el) => {
  const d = S.get("docs", el.dataset.doc), b = d?.blocks[+el.dataset.i];
  if (b?.image) printDoc(b.caption || d.title, `<div class="page"><img src="${esc(b.image)}" alt=""><p>${esc(b.caption || "")}</p></div>`);
};
