// ---------- Media library and finder ----------
// Every place that takes a picture (banners, events, sermon art, landing pages, slides, signage, map places...) gets
// "Find media" next to "Choose image". It opens one finder with:
//   - Library: the church's own saved photos and videos, shared by everyone who builds things.
//   - Free photos and Videos: searched right here. Openverse (public domain and CC0 only, so no credit is needed)
//     always works; Pexels and Pixabay work once the church adds its own free API key (Admin, Media library).
//   - Link: a picture or video file from any address.
//   - More sources: the church media sites FreeShow lists (freeshow.app/resources), with what each one costs and allows.
//     Those are separate sites with their own licences, many paid, so the app links to them rather than copying them:
//     download there, then add the file here.
// Whatever is picked from a search is saved in the library with who made it and where it came from.

if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("mediaLibrary")) RECORD_KINDS.push("mediaLibrary");
// A server that hasn't had upgrade-20.sql yet turns the library away; the picture itself still saves where it's used.
if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("mediaLibrary")) QUIET_KINDS.push("mediaLibrary");
{
  const prevLoad = S.load.bind(S);
  S.load = function () { prevLoad(); this.state.mediaLibrary ||= []; };
  if (S.state) S.state.mediaLibrary ||= [];
}

/** The sites listed at freeshow.app/resources, grouped by what they cost and what they let a church do. */
const MEDIA_SITES = [
  ["Free to use, no credit needed", [
    ["Pexels", "https://www.pexels.com/search/worship/", "Photos and videos. Search them here once you add a free API key."],
    ["Pixabay", "https://pixabay.com/images/search/church/", "Photos, illustrations and videos. Search them here once you add a free API key."],
    ["Unsplash", "https://unsplash.com/s/photos/church", "High-quality photos. Download one, then add it with Choose image."],
    ["MotionBolt", "https://www.motionbolt.com/", "Christian photos and images, released CC0 (public domain)."],
  ]],
  ["Free downloads, check each item's terms", [
    ["StoryLoop freebies", "https://storyloop.com/type/freebie/", "Free worship backgrounds, countdowns and mini movies."],
    ["Church Motion Graphics", "https://www.churchmotiongraphics.com/free-worship-media/", "Free worship backgrounds and slide templates. Also makes CMG Sans, a lyric font."],
    ["Church Media Drop", "https://churchmediadrop.com/", "Free church media, shared by churches."],
    ["CreationSwap", "https://www.creationswap.com/", "Church images, graphics and videos, free and paid."],
    ["Freepik worship backgrounds", "https://www.freepik.com/videos/free-worship-backgrounds", "Thousands of free worship background videos; some need credit."],
    ["The Virtual Bible Snapshot Project", "https://snapshots.vrbm.org/", "Bible scenes: photographs and artwork."],
  ]],
  ["Paid or subscription", [
    ["MotionWorship", "https://www.motionworship.com/browse-all-worship-videos/?orderby=menu_order", "Motion backgrounds, countdowns and sermon illustrations."],
    ["Ministry Designs", "https://ministrydesigns.media/collections/worship-motion-backgrounds", "Worship motion backgrounds."],
    ["Visual Revival", "https://www.visualrevival.com/", "Premium church media."],
    ["Sunday Screens", "https://sundayscreens.com/", "Visuals for a whole service."],
  ]],
];
const MEDIA_TOPICS = ["worship", "cross", "bible", "prayer", "sunrise", "mountains", "light", "community", "church", "christmas", "easter", "water"];

// ----- Searching the free libraries -----
// Kept on the church itself (not with the private integrations) so everyone who builds things can search.
const mediaKeys = (c = S.church()) => c?.mediaKeys || {};
const MEDIA_SOURCES = {
  openverse: { name: "Openverse", kinds: ["image"], needsKey: false, note: "Public domain and CC0 only" },
  pexels: { name: "Pexels", kinds: ["image", "video"], needsKey: true, keyUrl: "https://www.pexels.com/api/" },
  pixabay: { name: "Pixabay", kinds: ["image", "video"], needsKey: true, keyUrl: "https://pixabay.com/api/docs/" },
};
const mediaSourceOn = (k, c = S.church()) => !MEDIA_SOURCES[k].needsKey || !!mediaKeys(c)[k];
/** One search, normalised: [{ id, kind, thumb, full, w, h, title, credit: { name, url, source, license } }]. */
async function mediaSearch(source, kind, q, page = 1) {
  const enc = encodeURIComponent(q), key = mediaKeys()[source];
  const get = async (url, opts) => { const r = await fetch(url, opts); if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? `${MEDIA_SOURCES[source].name} didn't accept the API key.` : `${MEDIA_SOURCES[source].name} didn't answer (${r.status}).`); return r.json(); };
  if (source === "openverse") {
    const d = await get(`https://api.openverse.org/v1/images/?q=${enc}&license=cc0,pdm&page_size=24&page=${page}&mature=false`);
    return (d.results || []).map((x) => ({ id: `ov-${x.id}`, kind: "image", thumb: x.thumbnail || x.url, full: x.url, w: x.width, h: x.height, title: x.title || q,
      credit: { name: x.creator || "", url: x.foreign_landing_url || x.creator_url || "", source: `Openverse (${x.provider || x.source || "web"})`, license: (x.license || "").toUpperCase() === "PDM" ? "Public domain" : "CC0" } }));
  }
  if (source === "pexels") {
    if (kind === "video") {
      const d = await get(`https://api.pexels.com/videos/search?query=${enc}&per_page=24&page=${page}`, { headers: { Authorization: key } });
      return (d.videos || []).map((v) => { const files = (v.video_files || []).filter((f) => /mp4/.test(f.file_type || "mp4")).sort((a, b) => (a.width || 0) - (b.width || 0));
        const file = files.find((f) => (f.width || 0) >= 1280) || files[files.length - 1];
        return file && { id: `px-v${v.id}`, kind: "video", thumb: v.image, full: file.link, w: file.width, h: file.height, seconds: v.duration, title: q,
          credit: { name: v.user?.name || "", url: v.url || "", source: "Pexels", license: "Pexels license" } }; }).filter(Boolean);
    }
    const d = await get(`https://api.pexels.com/v1/search?query=${enc}&per_page=24&page=${page}`, { headers: { Authorization: key } });
    return (d.photos || []).map((p) => ({ id: `px-${p.id}`, kind: "image", thumb: p.src?.medium || p.src?.small, full: p.src?.large2x || p.src?.large || p.src?.original, w: p.width, h: p.height, title: p.alt || q,
      credit: { name: p.photographer || "", url: p.url || "", source: "Pexels", license: "Pexels license" } }));
  }
  if (source === "pixabay") {
    if (kind === "video") {
      const d = await get(`https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${enc}&per_page=24&page=${page}&safesearch=true`);
      return (d.hits || []).map((h) => { const f = h.videos?.medium?.url ? h.videos.medium : h.videos?.small || h.videos?.large;
        return f?.url && { id: `pb-v${h.id}`, kind: "video", thumb: f.thumbnail || h.videos?.tiny?.thumbnail || "", full: f.url, w: f.width, h: f.height, seconds: h.duration, title: h.tags || q,
          credit: { name: h.user || "", url: h.pageURL || "", source: "Pixabay", license: "Pixabay content license" } }; }).filter(Boolean);
    }
    const d = await get(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${enc}&image_type=photo&per_page=24&page=${page}&safesearch=true`);
    return (d.hits || []).map((h) => ({ id: `pb-${h.id}`, kind: "image", thumb: h.webformatURL || h.previewURL, full: h.largeImageURL || h.webformatURL, w: h.imageWidth, h: h.imageHeight, title: h.tags || q,
      credit: { name: h.user || "", url: h.pageURL || "", source: "Pixabay", license: "Pixabay content license" } }));
  }
  return [];
}

/** Brings a picture from the web into the app at the size the field wants. Pixabay asks that its pictures be copied,
 *  not linked; the others allow either. When a site doesn't let the browser copy it, the link is kept instead. */
async function mediaBringIn(item, max) {
  try {
    const r = await fetch(item.full, { mode: "cors" }); if (!r.ok) throw new Error("not ok");
    const blob = await r.blob();
    if (!/^image\//.test(blob.type)) throw new Error("not an image");
    return await readImage(new File([blob], "photo", { type: blob.type }), max || 1400);
  } catch {
    if (item.credit?.source === "Pixabay") throw new Error("Pixabay didn't let this browser copy the picture. Download it from Pixabay, then use Choose image.");
    return item.full;
  }
}

// ----- The library -----
const libraryItems = (kind) => S.list("mediaLibrary").filter((m) => !kind || kind === "any" || m.kind === kind).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
function libraryAdd(item) {
  const have = S.list("mediaLibrary").find((m) => (item.sourceId && m.sourceId === item.sourceId) || m.url === item.url);
  if (have) return have;
  const rec = { kind: item.kind || "image", url: item.url, thumb: item.thumb || (item.kind === "video" ? "" : item.url), title: String(item.title || "").slice(0, 120), tags: item.tags || "",
    credit: item.credit || null, sourceId: item.sourceId || "", by: S.me().id, at: new Date().toISOString() };
  try { return S.add("mediaLibrary", rec); } catch { return rec; }
}
const creditText = (cr) => cr ? [cr.name && `${cr.name}`, cr.source, cr.license].filter(Boolean).join(" · ") : "";

// ----- The finder -----
const mf = { field: "", form: null, kind: "image", max: 1400, tab: "library", source: "openverse", q: "", results: [], resultsFor: "", loading: false, error: "", page: 1, picking: "", onPick: null };
const mfKey = () => `${mf.tab}|${mf.source}|${mf.q}`;
const MF_TABS = [["library", "Library"], ["photos", "Free photos"], ["videos", "Videos"], ["link", "Link"], ["sources", "More sources"]];

/** The "Find media" button for a form field (a hidden input or a text box named field). kind: image, video or any. */
function mediaFindBtn(field, kind = "image", max = 1400, label = "") {
  return html`<button type="button" class="btn ghost sm" data-act="media-find" data-field="${field}" data-kind="${kind}" data-max="${max}">${icon("search")}${label || (kind === "video" ? "Find a video" : "Find media")}</button>`;
}
Actions["media-find"] = (el) => mediaFinderOpen({ form: el.closest("form") || el.closest(".sheet") || document, field: el.dataset.field, kind: el.dataset.kind || "image", max: +el.dataset.max || 1400 });

function mediaFinderOpen(opts) {
  Object.assign(mf, { field: opts.field || "", form: opts.form || null, kind: opts.kind || "image", max: opts.max || 1400, onPick: opts.onPick || null, error: "", picking: "" });
  if (mf.kind === "video" && mf.tab === "photos") mf.tab = "videos";
  if (mf.kind === "image" && mf.tab === "videos") mf.tab = "photos";
  if (!MEDIA_SOURCES[mf.source] || !mediaSourceOn(mf.source) || !MEDIA_SOURCES[mf.source].kinds.includes(mf.tab === "videos" ? "video" : "image")) mf.source = mf.tab === "videos" ? ["pexels", "pixabay"].find((k) => mediaSourceOn(k)) || "pexels" : "openverse";
  let dlg = document.getElementById("media-finder");
  if (!dlg) {
    dlg = document.createElement("dialog"); dlg.id = "media-finder"; dlg.className = "mf-dialog"; dlg.setAttribute("aria-labelledby", "mf-title");
    dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); mediaFinderClose(); } });
    dlg.addEventListener("cancel", (e) => e.preventDefault());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) mediaFinderClose(); });
    document.body.append(dlg);
  }
  if (mf.resultsFor !== mfKey()) { mf.results = []; mf.page = 1; }
  mfDraw();
  if (!dlg.open) dlg.showModal();
  if ((mf.tab === "photos" || mf.tab === "videos") && mf.q && !mf.results.length && mediaSourceOn(mf.source)) mfRun();
  $(".mf-tabs [aria-current=page]", dlg)?.focus();
}
// Moving to another screen closes the finder, so it never sits over a page it doesn't belong to.
window.addEventListener("hashchange", () => mediaFinderClose());
function mediaFinderClose() { const d = document.getElementById("media-finder"); if (d?.open) d.close(); }
Actions["media-finder-close"] = () => mediaFinderClose();

function mfTabs() {
  return MF_TABS.filter(([k]) => !(k === "videos" && mf.kind === "image") && !(k === "photos" && mf.kind === "video"));
}
function mfDraw() {
  const dlg = document.getElementById("media-finder"); if (!dlg) return;
  const c = S.church(), want = mf.tab === "videos" ? "video" : "image";
  const sources = Object.entries(MEDIA_SOURCES).filter(([, s]) => s.kinds.includes(want));
  const body = (() => {
    if (mf.tab === "library") {
      const items = libraryItems(mf.kind);
      return items.length ? html`<label class="field" style="margin-top:0"><span class="sr">Search the library</span><input type="search" placeholder="Search the library" data-input="filter-rows" data-target="#mf-lib" data-empty="#mf-lib-none" autocomplete="off"></label>
        <div class="mf-grid" id="mf-lib">${items.map((m) => mfTile({ id: m.id, kind: m.kind, thumb: m.thumb || m.url, full: m.url, title: m.title, credit: m.credit }, "lib", `${m.title} ${m.tags} ${m.credit?.name || ""} ${m.credit?.source || ""}`))}</div>
        <p class="faint" id="mf-lib-none" hidden>Nothing in the library matches.</p>`
        : html`<div class="mf-empty"><p><b>The library is empty.</b> Photos and videos you pick from a search are saved here, so everyone at ${c?.name || "your church"} can use them again.</p>
          <div class="btns">${mf.kind !== "video" ? html`<button class="btn sm" data-act="mf-tab" data-tab="photos">${icon("search")}Find free photos</button>` : ""}${mf.kind !== "image" ? html`<button class="btn ghost sm" data-act="mf-tab" data-tab="videos">${icon("play")}Find videos</button>` : ""}</div></div>`;
    }
    if (mf.tab === "photos" || mf.tab === "videos") {
      const on = mediaSourceOn(mf.source);
      return html`<form class="mf-search" data-form="mf-search" novalidate role="search">
          <label class="sr" for="mf-q">Search for ${want === "video" ? "videos" : "photos"}</label>
          <input id="mf-q" type="search" name="q" value="${mf.q}" placeholder="${want === "video" ? "Worship background, clouds, candles..." : "Cross, sunrise, open Bible..."}" autocomplete="off">
          <button class="btn sm" ${attr(!on, "disabled")}>Search</button></form>
        <div class="chips mf-sources" role="group" aria-label="Where to search">${sources.map(([k, s]) => html`<button type="button" class="chip" data-act="mf-source" data-k="${k}" aria-pressed="${k === mf.source}">${s.name}${mediaSourceOn(k) ? "" : html` <span class="faint">(key)</span>`}</button>`)}</div>
        ${!on ? html`<div class="panel mf-key"><p style="margin-top:0"><b>${MEDIA_SOURCES[mf.source].name} needs a free API key.</b> It takes a minute: make a free account, ask for a key, and paste it under Admin, Media library.</p>
            <div class="btns"><a class="btn ghost sm" href="${MEDIA_SOURCES[mf.source].keyUrl}" target="_blank" rel="noopener">${icon("globe")}Get a ${MEDIA_SOURCES[mf.source].name} key</a>${S.can("manage.church") ? html`<button class="btn ghost sm" data-act="mf-go-keys">Add the key</button>` : html`<span class="faint">Ask a church admin to add it.</span>`}</div></div>`
          : html`${!mf.q ? html`<div class="chips mf-topics" role="group" aria-label="Ideas">${MEDIA_TOPICS.map((t) => html`<button type="button" class="chip" data-act="mf-topic" data-q="${t}">${t}</button>`)}</div>` : ""}
          ${mf.error ? html`<p class="err" role="alert">${mf.error}</p>` : ""}
          ${mf.loading ? html`<p class="muted" role="status">Searching ${MEDIA_SOURCES[mf.source].name}...</p>` : ""}
          ${mf.results.length ? html`<div class="mf-grid">${mf.results.map((r) => mfTile(r, "web"))}</div>
            <div class="btns" style="justify-content:center"><button class="btn ghost sm" data-act="mf-more">More results</button></div>` : mf.q && !mf.loading && !mf.error ? html`<p class="muted">Nothing found for "${mf.q}". Try another word.</p>` : ""}
          <p class="faint">${MEDIA_SOURCES[mf.source].name}${mf.source === "openverse" ? ": public domain and CC0 pictures from museums, Flickr and more, free to use without credit." : mf.source === "pexels" ? ": free to use, no credit required (crediting the photographer is appreciated)." : ": free to use under the Pixabay content license, no credit required."} Who made it is saved with it in the library.</p>`}`;
    }
    if (mf.tab === "link") return html`<form data-form="mf-link" novalidate>
        <label class="field" style="margin-top:0"><span>Address of a ${mf.kind === "video" ? "video file (.mp4 or .webm)" : mf.kind === "any" ? "picture or video file" : "picture"}</span><input type="url" name="url" placeholder="https://" required></label>
        <label class="field"><span>Name (for the library)</span><input type="text" name="title" maxlength="120"></label>
        <label class="field"><span>Credit (optional)</span><input type="text" name="credit" maxlength="120" placeholder="Who made it, and the licence"></label>
        <p class="faint">Use pictures and videos you have the right to use. A picture is copied into the app when the site allows it; otherwise the link is kept, and it shows only while that site keeps it up.</p>
        <button class="btn block">Use it</button></form>`;
    return html`<p class="muted" style="margin-top:0">These are the church media sites listed by FreeShow. They're separate sites with their own terms, so download there (or buy, for the paid ones), then add the file with <b>Choose image</b> or the library's <b>Upload</b>.</p>
      ${MEDIA_SITES.map(([group, list]) => html`<h3 class="mf-h">${group}</h3><div class="rows">${list.map(([name, url, what]) => html`<a class="row" href="${url}" target="_blank" rel="noopener"><span class="lead-ic">${icon("globe")}</span><span class="body"><span class="t">${name}</span><span class="s">${what}</span></span>${icon("chev")}</a>`)}</div>`)}`;
  })();
  dlg.innerHTML = flat(html`<div class="mf-shell" role="document">
    <div class="sheet-head"><h2 id="mf-title">${mf.kind === "video" ? "Find a video" : mf.kind === "any" ? "Find a picture or video" : "Find a picture"}</h2><button class="icon-btn" data-act="media-finder-close" aria-label="Close">${icon("x")}</button></div>
    <div class="mf-tabs" role="tablist" aria-label="Where to look">${mfTabs().map(([k, l]) => html`<button type="button" role="tab" data-act="mf-tab" data-tab="${k}" aria-selected="${k === mf.tab}" ${attr(k === mf.tab, 'aria-current="page"')}>${l}</button>`)}</div>
    <div class="mf-body">${body}</div></div>`);
}
function mfTile(r, from, search = "") {
  const busy = mf.picking === r.id;
  return html`<button type="button" class="mf-tile ${r.kind === "video" ? "is-video" : ""}" data-act="mf-pick" data-from="${from}" data-id="${r.id}" ${search ? raw(`data-search="${esc(search)}"`) : ""} aria-label="Use ${r.title || (r.kind === "video" ? "this video" : "this picture")}${r.credit?.name ? `, by ${r.credit.name}` : ""}" ${attr(busy, "aria-busy=\"true\"")}>
    ${r.thumb ? html`<img src="${r.thumb}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : html`<span class="mf-noimg">${icon(r.kind === "video" ? "play" : "image")}</span>`}
    ${r.kind === "video" ? html`<span class="mf-badge">${icon("play")}${r.seconds ? `${Math.round(r.seconds)}s` : "Video"}</span>` : ""}
    ${r.credit?.name || r.credit?.source ? html`<span class="mf-credit">${r.credit.name || r.credit.source}</span>` : ""}
    ${busy ? html`<span class="mf-busy">Adding...</span>` : ""}</button>`;
}
Actions["mf-tab"] = (el) => {
  const was = mf.tab; mf.tab = el.dataset.tab; mf.error = "";
  if ((mf.tab === "videos" || mf.tab === "photos") && mf.tab !== was) {
    const want = mf.tab === "videos" ? "video" : "image";
    if (!MEDIA_SOURCES[mf.source].kinds.includes(want) || !mediaSourceOn(mf.source)) mf.source = want === "video" ? ["pexels", "pixabay"].find((k) => mediaSourceOn(k)) || "pexels" : "openverse";
    mf.results = []; mf.page = 1;
    if (mf.q && mediaSourceOn(mf.source)) { mfRun(); return; }
  }
  mfDraw(); $("#mf-q")?.focus();
};
Actions["mf-source"] = (el) => { mf.source = el.dataset.k; mf.results = []; mf.page = 1; mf.error = ""; mfDraw(); if (mf.q && mediaSourceOn(mf.source)) mfRun(); };
Actions["mf-topic"] = (el) => { mf.q = el.dataset.q; mf.page = 1; mf.results = []; mfRun(); };
Actions["mf-more"] = () => { mf.page++; mfRun(true); };
Actions["mf-go-keys"] = () => { mediaFinderClose(); closeSheet(true); go("medialib"); };
Forms["mf-search"] = (d) => { mf.q = String(d.q || "").trim(); mf.page = 1; mf.results = []; if (mf.q) mfRun(); else mfDraw(); };
async function mfRun(more = false) {
  mf.loading = true; mf.error = ""; mfDraw();
  try {
    const found = await mediaSearch(mf.source, mf.tab === "videos" ? "video" : "image", mf.q, mf.page);
    mf.results = more ? [...mf.results, ...found.filter((f) => !mf.results.some((r) => r.id === f.id))] : found;
    mf.resultsFor = mfKey();
  } catch (e) {
    mf.error = /fetch|network|load failed/i.test(e.message) ? `Couldn't reach ${MEDIA_SOURCES[mf.source].name}. Check you're online; in some previews outside sites are blocked.` : e.message;
  }
  mf.loading = false; mfDraw();
}
Actions["mf-pick"] = async (el) => {
  if (mf.picking) return;
  const id = el.dataset.id;
  if (el.dataset.from === "lib") { const m = S.get("mediaLibrary", id); if (m) mfUse(m.url, m.kind); return; }
  const r = mf.results.find((x) => x.id === id); if (!r) return;
  mf.picking = id; mfDraw();
  try {
    const url = r.kind === "video" ? r.full : await mediaBringIn(r, Math.max(mf.max, 1400));
    let thumb = r.thumb;
    if (r.kind === "image" && url.startsWith("data:")) thumb = url;
    libraryAdd({ kind: r.kind, url, thumb, title: r.title, credit: r.credit, sourceId: r.id });
    mf.picking = ""; mfUse(url, r.kind);
  } catch (e) { mf.picking = ""; mf.error = e.message; mfDraw(); }
};
Forms["mf-link"] = async (d, f) => {
  const url = String(d.url || "").trim();
  if (!isUrl(url)) return formError(f, "Paste an address that starts with https://");
  const isVideo = /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
  if (mf.kind === "video" && !isVideo) return formError(f, "That doesn't look like a video file. It should end in .mp4 or .webm.");
  if (mf.kind === "image" && isVideo) return formError(f, "That's a video. This spot takes a picture.");
  let use = url;
  if (!isVideo) { try { use = await mediaBringIn({ full: url, credit: null }, Math.max(mf.max, 1400)); } catch { use = url; } }
  libraryAdd({ kind: isVideo ? "video" : "image", url: use, thumb: isVideo ? "" : use, title: d.title || url.split("/").pop().split("?")[0], credit: d.credit ? { name: d.credit, source: "", license: "" } : null });
  mfUse(use, isVideo ? "video" : "image");
};
/** Puts the picked media into the field that asked for it, the same way choosing a file does. */
function mfUse(url, kind) {
  mediaFinderClose();
  if (mf.onPick) { mf.onPick(url, kind); return; }
  const scope = mf.form && mf.form.isConnected ? mf.form : document;
  const field = $(`[name="${mf.field}"]`, scope) || $(`[name="${mf.field}"]`);
  if (!field) return;
  field.value = url; field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true }));
  const prev = $(`[data-preview="${mf.field}"]`, scope);
  if (prev) prev.innerHTML = kind === "video" ? `<video src="${esc(url)}" muted playsinline loop autoplay></video>` : `<img src="${esc(url)}" alt="">`;
  if (kind !== "video" && field.form && typeof imageFieldChanged === "function") imageFieldChanged(field.form, mf.field, url);
  toast(kind === "video" ? "Video added" : "Picture added");
}

// ----- Admin, Media library -----
const canBuild = () => ["manage.content", "manage.church", "manage.sermons", "manage.devices", "manage.classes", "manage.locations", "manage.integrations"].some((p) => S.can(p));
Screens.medialib = () => {
  const c = S.church();
  if (!c || !canBuild()) return { redirect: "admin" };
  const items = libraryItems("any"), keys = mediaKeys(c);
  return {
    title: "Media library", back: "admin", tab: "home",
    body: html`<p class="muted" style="margin-top:14px">Photos and videos for anything you build: slides, signage, the Home banner, landing pages, events and sermon art. Every picture field has <b>Find media</b>, which searches the library and free photo sites.</p>
      <div class="btns"><button class="btn sm" data-act="medialib-find" data-kind="any">${icon("search")}Find free photos and videos</button>
        <label class="btn ghost sm">${icon("image")}Upload<input type="file" accept="image/*,video/mp4,video/webm" class="sr" data-change="medialib-upload"></label></div>
      <section class="sec"><div class="sec-head"><h2>In the library</h2><span class="faint">${plural(items.length, "item")}</span></div>
        ${items.length ? html`<div class="mf-grid lib-grid">${items.map((m) => html`<figure class="lib-item">
            <div class="lib-media">${m.kind === "video" ? html`<video src="${m.url}" muted playsinline preload="metadata"></video><span class="mf-badge">${icon("play")}Video</span>` : html`<img src="${m.thumb || m.url}" alt="" loading="lazy">`}</div>
            <figcaption><span class="t">${m.title || (m.kind === "video" ? "Video" : "Picture")}</span>${m.credit ? html`<span class="s">${m.credit.url ? html`<a href="${m.credit.url}" target="_blank" rel="noopener">${creditText(m.credit)}</a>` : creditText(m.credit)}</span>` : ""}
              <button class="linkish danger" data-act="medialib-remove" data-id="${m.id}">Remove</button></figcaption></figure>`)}</div>`
          : html`<div class="panel">${empty("Nothing yet. Find free photos and videos, or upload your own.")}</div>`}</section>
      <section class="sec"><h2 class="sec-head">Free photo and video sites</h2>
        <form data-form="media-keys" class="panel" novalidate>
          <p style="margin-top:0"><b>Openverse</b> works now: public domain and CC0 pictures. Add free keys to also search <b>Pexels</b> and <b>Pixabay</b>, which have photos and worship background videos.</p>
          <label class="field"><span>Pexels API key</span><input type="text" name="pexels" value="${keys.pexels || ""}" autocomplete="off" spellcheck="false" ${attr(!S.can("manage.church"), "disabled")}><small><a href="https://www.pexels.com/api/" target="_blank" rel="noopener">Get a free key</a> (sign up, then "Your API key").</small></label>
          <label class="field"><span>Pixabay API key</span><input type="text" name="pixabay" value="${keys.pixabay || ""}" autocomplete="off" spellcheck="false" ${attr(!S.can("manage.church"), "disabled")}><small><a href="https://pixabay.com/api/docs/" target="_blank" rel="noopener">Get a free key</a> (sign in; the key is shown on that page).</small></label>
          <p class="faint">These keys only search free stock media. Staff who build things use them from their own browsers.</p>
          ${S.can("manage.church") ? html`<button class="btn ghost sm">Save keys</button>` : html`<p class="faint">Ask a church admin to add keys.</p>`}</form></section>
      <section class="sec"><h2 class="sec-head">More church media</h2>
        <p class="muted" style="margin-top:0">From the list FreeShow keeps at <a href="https://freeshow.app/resources" target="_blank" rel="noopener">freeshow.app/resources</a>. Download there, then Upload here.</p>
        ${MEDIA_SITES.map(([group, list]) => html`<h3 class="mf-h">${group}</h3><div class="rows">${list.map(([name, url, what]) => html`<a class="row" href="${url}" target="_blank" rel="noopener"><span class="lead-ic">${icon("globe")}</span><span class="body"><span class="t">${name}</span><span class="s">${what}</span></span>${icon("chev")}</a>`)}</div>`)}
        <h3 class="mf-h">Tools that work alongside the app</h3><div class="rows">
          <a class="row" href="https://obsproject.com/" target="_blank" rel="noopener"><span class="lead-ic">${icon("live")}</span><span class="body"><span class="t">OBS Studio</span><span class="s">Free streaming software. Add a presentation's overlay screen as a Browser source for lyrics and lower thirds on your stream.</span></span>${icon("chev")}</a>
          <a class="row" href="https://freeshow.app/" target="_blank" rel="noopener"><span class="lead-ic">${icon("screen")}</span><span class="body"><span class="t">FreeShow</span><span class="s">Free, open-source presentation software for lyrics, media and stage displays, from ChurchApps. Can import lessons from Lessons.church.</span></span>${icon("chev")}</a>
          <a class="row" href="https://openlp.org/" target="_blank" rel="noopener"><span class="lead-ic">${icon("screen")}</span><span class="body"><span class="t">OpenLP</span><span class="s">Free worship presentation software for Windows, Mac and Linux, with phone remotes and a stage view in any browser.</span></span>${icon("chev")}</a>
          <a class="row" href="https://github.com/Church-Cap/Live-Church-Captions" target="_blank" rel="noopener"><span class="lead-ic">${icon("note")}</span><span class="body"><span class="t">Live Church Captions</span><span class="s">Free desktop app that captions the sermon live with speech recognition, for screens and your stream.</span></span>${icon("chev")}</a>
          <a class="row" href="https://bitfocus.io/companion" target="_blank" rel="noopener"><span class="lead-ic">${icon("screen")}</span><span class="body"><span class="t">Bitfocus Companion</span><span class="s">Stream Deck and button panels for your booth.</span></span>${icon("chev")}</a>
        </div></section>`,
  };
};
Actions["medialib-find"] = (el) => mediaFinderOpen({ kind: el.dataset.kind || "any", max: 1800, onPick: () => { toast("Saved in the library"); render(); } });
Actions["medialib-remove"] = (el) => { S.remove("mediaLibrary", el.dataset.id); toast("Removed from the library. Anything already using it keeps it."); render(); };
Inputs["medialib-upload"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  try {
    if (/^video\//.test(file.type)) {
      if (!Backend.on) { toast("Videos are uploaded on your church's live site. Here, add a video by its link."); return; }
      const url = await Backend.upload(file, `library/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-")}`);
      libraryAdd({ kind: "video", url, thumb: "", title: file.name });
    } else {
      const url = await readImage(file, 1800);
      libraryAdd({ kind: "image", url, thumb: url, title: file.name.replace(/\.[a-z0-9]+$/i, "") });
    }
    toast("Saved in the library"); render();
  } catch (e) { toast(e.message || "That file couldn't be added."); }
};
Forms["media-keys"] = (d) => {
  if (!S.can("manage.church")) return;
  const c = S.church(), clean = (v) => String(v || "").trim().replace(/\s+/g, "").slice(0, 120);
  S.updateChurch({ mediaKeys: { pexels: clean(d.pexels), pixabay: clean(d.pixabay) } });
  logActivity("Updated the free media sites' keys", "image");
  toast("Saved. Find media now searches these sites."); render();
};
