// ---------- Sermon media: player, transcripts, a searchable archive and a podcast feed ----------
// Each sermon can have a video link (YouTube, Vimeo or a file), an audio file for the podcast, and a transcript.
// Transcripts come from a pasted or uploaded text, VTT or SRT file, or from the live captions of the presentation.

const isAudioUrl = (u) => /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u || "");
const sermonVideo = (s) => s.videoUrl || (s.mediaUrl && !isAudioUrl(s.mediaUrl) ? s.mediaUrl : "");
const sermonAudio = (s) => s.audioUrl || (isAudioUrl(s.mediaUrl) ? s.mediaUrl : "");
const canMedia = () => S.isMember() && S.can("manage.sermons");

// ----- Transcripts -----
const tc = (secs) => { const s = Math.max(0, Math.round(secs)), h = Math.floor(s / 3600); return `${h ? `${h}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`; };
/** WebVTT, SRT or plain text into [{ t, text }] paragraphs. Timed cues are joined into paragraphs of about 40 seconds. */
function parseTranscript(raw) {
  const text = String(raw || "").replace(/\r/g, "").trim();
  if (!text) return [];
  const cue = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[.,]\d{1,3}\s*-->/;
  // "0:12  words" paragraphs, the way an opened file is shown for editing, keep their times.
  if (!cue.test(text) && /^\d{1,2}:\d{2}(:\d{2})?\s{2}/m.test(text)) return text.split(/\n\s*\n/).map((p) => {
    const m = p.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s{2}([\s\S]*)$/);
    return m ? { t: (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3], text: m[4].replace(/\s*\n\s*/g, " ").trim() } : { t: null, text: p.trim() };
  }).filter((p) => p.text);
  if (!cue.test(text)) return text.split(/\n\s*\n/).map((p) => ({ t: null, text: p.replace(/\s*\n\s*/g, " ").trim() })).filter((p) => p.text);
  const cues = [];
  text.split(/\n\s*\n/).forEach((block) => {
    const lines = block.split("\n"), i = lines.findIndex((l) => cue.test(l)); if (i < 0) return;
    const m = lines[i].match(cue), t = (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3];
    const words = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim(); if (words) cues.push({ t, text: words });
  });
  const out = [];
  cues.forEach((c) => { const last = out[out.length - 1]; if (last && c.t - last.t < 40 && last.text.length < 600) last.text += ` ${c.text}`; else out.push({ ...c }); });
  return out;
}
const transcriptText = (s) => (s.transcript || []).map((p) => p.text).join("\n\n");
const transcriptEditText = (s) => (s.transcript || []).map((p) => (p.t != null ? `${tc(p.t)}  ` : "") + p.text).join("\n\n");
function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i < 0) return text;
  return html`${text.slice(0, i)}<mark>${text.slice(i, i + q.length)}</mark>${highlight(text.slice(i + q.length), q)}`;
}

// ----- Searching every sermon -----
/** Full-text search over titles, passages, speakers, series, summaries, outlines and transcripts. */
function searchSermons(q, list = sermonsSorted()) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean); if (!words.length) return [];
  return list.map((s) => {
    const fields = [[s.title, 6], [s.passage, 5], [s.series, 3], [s.speaker, 3], [s.topic || "", 3], [s.summary || "", 2], [(s.outline || []).join(" "), 2], [transcriptText(s), 1]];
    let score = 0;
    for (const w of words) { const hit = fields.reduce((n, [f, wt]) => n + (f.toLowerCase().includes(w) ? wt : 0), 0); if (!hit) return null; score += hit; }
    const from = [s.summary || "", ...(s.transcript || []).map((p) => p.text)].find((f) => f.toLowerCase().includes(words[0]));
    let snippet = "";
    if (from) { const i = from.toLowerCase().indexOf(words[0]), a = Math.max(0, i - 60); snippet = `${a ? "..." : ""}${from.slice(a, i + 120)}${i + 120 < from.length ? "..." : ""}`; }
    return { s, score, snippet };
  }).filter(Boolean).sort((a, b) => b.score - a.score || new Date(b.s.date) - new Date(a.s.date));
}
let sermonQuery = "", sermonBook = "";
function sermonResults() {
  const list = sermonsSorted().filter((s) => !sermonBook || parseRef(s.passage)?.book === sermonBook);
  if (!sermonQuery.trim()) {
    if (!list.length) return html`<div class="empty"><p>${sermonsSorted().length ? "No sermons on that book yet." : "No sermons have been posted yet."}</p></div>`;
    const series = [...new Set(list.map((s) => s.series))];
    return html`${series.map((name) => html`<section class="sec" style="margin-top:18px"><h2 class="sec-head">${name}</h2><div class="rows">${list.filter((s) => s.series === name).map(sermonRow)}</div></section>`)}`;
  }
  const hits = searchSermons(sermonQuery, list);
  return hits.length ? html`<p class="faint" style="margin:14px 0 6px">${plural(hits.length, "sermon")}</p><div class="rows">${hits.map(({ s, snippet }) => html`<a class="row" href="#sermon-${s.id}"><span class="lead-ic">${icon("play")}</span><span class="body"><span class="t">${highlight(s.title, sermonQuery.split(/\s+/)[0])}</span><span class="s">${s.passage}, ${s.speaker}, ${fmtShort(s.date)}</span>${snippet ? html`<span class="s snippet">${highlight(snippet, sermonQuery.split(/\s+/)[0])}</span>` : ""}</span>${icon("chev")}</a>`)}</div>`
    : html`<div class="empty"><p>No sermons mention "${sermonQuery}". Try a passage like Romans 8, a speaker or a word from the message.</p></div>`;
}
Inputs["sermon-search"] = (el) => { sermonQuery = el.value; $("#sermon-list").innerHTML = flat(sermonResults()); };
Actions["sermon-book"] = (el) => { sermonBook = el.dataset.book === sermonBook ? "" : el.dataset.book; render(); };

// ----- Player and transcript on the sermon page -----
function sermonMedia(s) {
  const video = sermonVideo(s), audio = sermonAudio(s);
  return html`${video ? html`<div class="sermon-video">${embedView(video, s.title, { video: true })}</div>` : ""}
    ${audio ? (IN_PREVIEW ? html`<a class="embed-card" href="${audio}" target="_blank" rel="noopener"><span class="lead-ic">${icon("play")}</span><span class="body"><span class="t">Listen</span><span class="s">Audio, ${s.minutes} minutes. Plays in the app once it's on your own website.</span></span>${icon("chev")}</a>`
      : html`<div class="audio-player"><audio id="sermon-audio" src="${audio}" controls preload="none"></audio>
        <div class="speeds" role="group" aria-label="Playback speed">${[1, 1.25, 1.5, 2].map((r) => html`<button class="chip" data-act="audio-rate" data-r="${r}" aria-pressed="${r === 1}">${r}×</button>`)}</div></div>`) : ""}
    ${!video && !audio ? html`<div class="player"><span class="play" aria-disabled="true">${icon("play")}</span><div><b>Recording not posted</b><small>${s.minutes} minutes.${canMedia() ? html` <a href="#media-${s.id}">Add video, audio or a transcript</a>` : ""}</small></div></div>` : ""}`;
}
function transcriptSection(s) {
  if (!s.transcript?.length) return "";
  const timed = s.transcript.some((p) => p.t != null);
  return html`<section class="sec"><details class="transcript"><summary><h2>Transcript</h2><span class="faint">${plural(s.transcript.reduce((n, p) => n + p.text.split(/\s+/).length, 0), "word")}</span></summary>
    <label class="field"><span class="sr">Search the transcript</span><input type="search" placeholder="Search the transcript" data-input="transcript-search"></label>
    <div class="tx-body">${s.transcript.map((p) => html`<p data-text="${p.text}">${timed && p.t != null ? html`<button class="tx-t" data-act="seek" data-t="${p.t}" aria-label="Play from ${tc(p.t)}">${tc(p.t)}</button>` : ""}<span>${p.text}</span></p>`)}</div>
    <p class="faint tx-none" hidden>No matches.</p></details></section>`;
}
Inputs["transcript-search"] = (el) => {
  const box = el.closest(".transcript"), q = el.value.trim(); let shown = 0;
  $$(".tx-body p", box).forEach((p) => { const t = p.dataset.text, hit = !q || t.toLowerCase().includes(q.toLowerCase()); p.hidden = !hit; if (hit) shown++; $("span", p).innerHTML = flat(highlight(t, q)); });
  $(".tx-none", box).hidden = shown > 0;
};
Actions["seek"] = (el) => { const a = $("#sermon-audio"); if (!a) { toast("Seeking works with the audio player"); return; } a.currentTime = +el.dataset.t; a.play().catch(() => {}); };
Actions["audio-rate"] = (el) => { const a = $("#sermon-audio"); if (a) a.playbackRate = +el.dataset.r; $$("[data-act=audio-rate]").forEach((b) => b.setAttribute("aria-pressed", b === el)); };

// ----- Media editor for staff -----
Screens.media = (id) => {
  const s = S.get("sermons", id);
  if (!s || !canMedia()) return { redirect: `sermon-${id}` };
  const live = typeof Backend !== "undefined" && Backend.on;
  const captions = pres.transcript.length ? pres.transcript.join(" ") : "";
  return {
    title: "Media and transcript", back: `sermon-${s.id}`,
    body: html`<h1 style="margin-top:16px">${s.title}</h1><p class="muted" style="margin-top:4px">${s.speaker}, ${fmtShort(s.date)}</p>
      <form data-form="media-save" class="panel" novalidate><input type="hidden" name="id" value="${s.id}">
        <label class="field" style="margin-top:0"><span>Video link</span><input type="url" name="videoUrl" value="${sermonVideo(s)}" placeholder="https://youtu.be/..."><small>YouTube, Vimeo or Facebook, or an MP4 file.</small></label>
        <label class="field"><span>Audio file for the podcast</span><input type="url" name="audioUrl" value="${sermonAudio(s)}" placeholder="https://.../sermon.mp3"><small>An MP3 or M4A link. Podcast apps need one.</small></label>
        <div class="btns"><label class="btn ghost sm">${icon("download")}Upload audio or video<input type="file" class="sr" accept="audio/*,video/*" data-change="media-upload" data-id="${s.id}"></label></div>
        ${live ? "" : html`<p class="faint">Uploads go to your own storage once the app is on your website with Supabase connected. Until then, paste a link.</p>`}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Length in minutes</span><input type="number" name="minutes" min="1" max="300" value="${s.minutes || 35}"></label>
          <label class="field"><span>Audio file size (MB)</span><input type="number" name="audioMb" min="0" step="0.1" value="${s.audioBytes ? (s.audioBytes / 1048576).toFixed(1) : ""}"><small>Podcast apps ask for it. Filled in for uploads.</small></label></div>
        <label class="field"><span>Transcript</span><textarea name="transcript" style="min-height:180px" placeholder="Paste the transcript, or a VTT or SRT captions file">${transcriptEditText(s)}</textarea><small>Blank lines start a new paragraph. Timed captions (VTT or SRT) let people jump to that spot.</small></label>
        <div class="btns"><label class="btn ghost sm">${icon("note")}Open a transcript file<input type="file" class="sr" accept=".txt,.vtt,.srt,text/plain,text/vtt" data-change="transcript-file"></label>
          ${captions ? html`<button type="button" class="btn ghost sm" data-act="transcript-captions">${icon("chat")}Use captions from the last presentation</button>` : ""}</div>
        <button class="btn block" style="margin-top:14px">Save</button></form>
      ${AI.possible() ? html`<section class="sec"><h2 class="sec-head">Write with Veritas Logos</h2><div class="panel">
        <p style="margin-top:0">Draft a summary and outline for this sermon from its passage${s.transcript?.length ? " and transcript" : ""}. You can edit it before anyone sees it.</p>
        <button class="btn ghost sm" data-act="ai-recap" data-id="${s.id}">${icon("bolt")}Draft a summary and outline</button></div></section>` : ""}`,
  };
};
Forms["media-save"] = (d, f) => {
  for (const k of ["videoUrl", "audioUrl"]) if (d[k] && !isUrl(d[k])) return formError(f, "Links should start with https://");
  const s = S.get("sermons", d.id);
  Object.assign(s, { videoUrl: d.videoUrl, audioUrl: d.audioUrl, mediaUrl: d.videoUrl || d.audioUrl, minutes: Math.max(1, +d.minutes || s.minutes), audioBytes: d.audioMb ? Math.round(+d.audioMb * 1048576) : s.audioBytes || 0, transcript: parseTranscript(d.transcript) });
  S.save(); toast("Saved"); go(`sermon-${s.id}`);
};
Inputs["transcript-file"] = (el) => {
  const file = el.files?.[0]; if (!file) return;
  if (file.size > 2e6) { toast("That file is too big for a transcript"); return; }
  const r = new FileReader();
  r.onload = () => { const ta = $('textarea[name="transcript"]', el.form); const parts = parseTranscript(r.result); ta.value = parts.map((p) => (p.t != null ? `${tc(p.t)}  ` : "") + p.text).join("\n\n"); ta.dataset.raw = r.result; toast(`${plural(parts.length, "paragraph")} read`); };
  r.readAsText(file);
};
Actions["transcript-captions"] = (el) => { const ta = $('textarea[name="transcript"]', el.closest("form")); ta.value = pres.transcript.join(" ").replace(/([.?!])\s+/g, "$1 ").replace(/(.{500,}?[.?!])\s/g, "$1\n\n"); toast("Captions added"); };
Inputs["media-upload"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  if (typeof Backend === "undefined" || !Backend.on) { toast("Uploading needs Supabase. Paste a link for now."); el.value = ""; return; }
  const form = el.closest("form"), isAudio = file.type.startsWith("audio/");
  try {
    toast("Uploading..."); const url = await Backend.upload(file, `sermons/${el.dataset.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "-")}`);
    form[isAudio ? "audioUrl" : "videoUrl"].value = url; if (isAudio) form.audioMb.value = (file.size / 1048576).toFixed(1);
    toast("Uploaded. Save to keep it.");
  } catch (e) { toast(`Upload failed: ${e.message || "try again"}`); }
};
// ----- Podcast feed -----
const xmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const podcastOf = (c = S.church()) => ({ title: `${c.name} sermons`, author: c.name, description: c.tagline || `Sunday messages from ${c.name}.`, email: c.email || "", category: "Christianity", artwork: c.logo || "", language: "en-us", ...(c.podcast || {}) });
const feedUrl = (c = S.church()) => (typeof Backend !== "undefined" && Backend.on ? Backend.podcastUrl(c.id) : "");
/** An RSS 2.0 feed with the Apple Podcasts tags Spotify and others also read. */
function podcastXml(c = S.church()) {
  const p = podcastOf(c), eps = S.list("sermons", c.id).filter((s) => sermonAudio(s)).sort((a, b) => new Date(b.date) - new Date(a.date));
  const site = c.website || appLink(`church-${c.id}`), art = isUrl(p.artwork) ? p.artwork : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xmlEsc(p.title)}</title>
  <link>${xmlEsc(site)}</link>
  <language>${xmlEsc(p.language)}</language>
  <description>${xmlEsc(p.description)}</description>
  <itunes:author>${xmlEsc(p.author)}</itunes:author>
  <itunes:owner><itunes:name>${xmlEsc(p.author)}</itunes:name><itunes:email>${xmlEsc(p.email)}</itunes:email></itunes:owner>
  <itunes:explicit>false</itunes:explicit>
  <itunes:type>episodic</itunes:type>
  <itunes:category text="Religion &amp; Spirituality"><itunes:category text="${xmlEsc(p.category)}"/></itunes:category>${art ? `
  <itunes:image href="${xmlEsc(art)}"/>
  <image><url>${xmlEsc(art)}</url><title>${xmlEsc(p.title)}</title><link>${xmlEsc(site)}</link></image>` : ""}${feedUrl(c) ? `
  <atom:link href="${xmlEsc(feedUrl(c))}" rel="self" type="application/rss+xml"/>` : ""}
${eps.map((s) => { const audio = sermonAudio(s), type = /\.m4a(\?|$)/i.test(audio) ? "audio/x-m4a" : "audio/mpeg";
  return `  <item>
    <title>${xmlEsc(s.title)}</title>
    <description>${xmlEsc([s.summary, `${s.passage}. ${s.speaker}.`, s.series ? `Series: ${s.series}.` : ""].filter(Boolean).join(" "))}</description>
    <enclosure url="${xmlEsc(audio)}" length="${s.audioBytes || 0}" type="${type}"/>
    <guid isPermaLink="false">${xmlEsc(`${c.id}:${s.id}`)}</guid>
    <pubDate>${new Date(s.date).toUTCString()}</pubDate>
    <itunes:duration>${(s.minutes || 35) * 60}</itunes:duration>
    <itunes:author>${xmlEsc(s.speaker)}</itunes:author>
    <link>${xmlEsc(appLink(`sermon-${s.id}`))}</link>${s.transcript?.length ? `
    <podcast:transcript url="${xmlEsc(appLink(`sermon-${s.id}`))}" type="text/html"/>` : ""}
  </item>`; }).join("\n")}
</channel>
</rss>
`;
}
function podcastChecks(c = S.church()) {
  const p = podcastOf(c), all = S.list("sermons", c.id), eps = all.filter((s) => sermonAudio(s));
  return [
    [eps.length > 0, eps.length ? `${plural(eps.length, "episode")} with audio` : "No sermons have an audio file yet"],
    [isUrl(p.artwork), isUrl(p.artwork) ? "Cover art is online" : "Cover art needs to be a web link (3000 × 3000 pixels is best). Upload it once Supabase is connected, or paste a link"],
    [!!p.email, p.email ? `Owner email: ${p.email}` : "Add an owner email. Apple Podcasts uses it to confirm the show is yours"],
    [!!feedUrl(c), feedUrl(c) ? "The feed has a public address" : "The feed gets a public address once Supabase is connected. Until then, download it to check it"],
    [eps.every((s) => s.audioBytes), eps.every((s) => s.audioBytes) ? "Every episode has its file size" : `${plural(eps.filter((s) => !s.audioBytes).length, "episode")} without a file size. Most apps still play them`],
  ];
}
Screens.podcast = () => {
  if (!canMedia()) return { redirect: "admin" };
  const c = S.church(), p = podcastOf(c), url = feedUrl(c);
  return {
    title: "Podcast", back: "admin-sermons",
    body: html`<form data-form="podcast-save" class="panel" style="margin-top:16px" novalidate>
        <label class="field" style="margin-top:0"><span>Show name</span><input type="text" name="title" value="${p.title}" required maxlength="100"></label>
        <label class="field"><span>Description</span><textarea name="description" maxlength="1000" style="min-height:70px">${p.description}</textarea></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Author</span><input type="text" name="author" value="${p.author}" maxlength="80"></label>
          <label class="field"><span>Owner email</span><input type="email" name="email" value="${p.email}" maxlength="80"></label></div>
        <label class="field"><span>Cover art link</span><input type="url" name="artwork" value="${isUrl(p.artwork) ? p.artwork : ""}" placeholder="https://.../cover.jpg"><small>Square, 1400 to 3000 pixels, JPG or PNG.</small></label>
        <button class="btn">Save</button></form>
      <section class="sec"><h2 class="sec-head">Ready for podcast apps?</h2><div class="rows">${podcastChecks(c).map(([ok, t]) => html`<div class="row"><span class="lead-ic" style="${ok ? "background:var(--ok-soft);color:var(--ok)" : "background:var(--warn-soft);color:var(--warn)"}">${icon(ok ? "check" : "info")}</span><span class="body"><span class="s" style="color:var(--ink)">${t}</span></span></div>`)}</div></section>
      <div class="btns">${url ? html`<button class="btn" data-act="copy" data-text="${url}" data-done="Feed address copied">${icon("link")}Copy feed address</button>` : ""}<button class="btn ghost" data-act="podcast-download">${icon("download")}Download feed.xml</button></div>
      <p class="faint">Submit the feed address once in Apple Podcasts Connect and Spotify for Podcasters. New sermons with audio show up on their own.</p>`,
  };
};
Forms["podcast-save"] = (d, f) => {
  if (!d.title) return formError(f, "Name the show.");
  if (d.artwork && !isUrl(d.artwork)) return formError(f, "The cover art link should start with https://");
  S.church().podcast = { title: d.title, description: d.description, author: d.author, email: d.email, artwork: d.artwork }; S.save(); toast("Saved"); render();
};
Actions["podcast-download"] = () => saveFile("feed.xml", podcastXml());
