// ---------- Song files: import from OpenLP and OpenSong, export for OpenLP ----------
// Songs and lyrics has "Import songs", which takes files from other worship software:
//   - OpenLyrics XML (.xml): what OpenLP exports, and what many other programs read and write. Chords written as
//     <chord name="G"/> (or root/structure) become inline [G] chords.
//   - OpenSong song files (often with no extension): <lyrics> with [V1] headings, chord lines starting with "." and
//     lyric lines starting with a space. Chord lines become inline chords over the words below them.
//   - Plain text or ChordPro (.txt, .cho, .chordpro, .pro): read like pasted lyrics, with {title:} and {artist:}.
// Each song opens nothing: it's added straight to the church's songs, skipped if a song with the same title is
// already there. Importing needs the planner's word that the church may use the songs (CCLI or public domain); the
// copyright line and CCLI number come across when the file has them.
// The song editor's "Export for OpenLP" saves a song as OpenLyrics XML.

const SONG_FILE_ACCEPT = ".xml,.txt,.cho,.chordpro,.pro,.crd,application/xml,text/xml,text/plain";

/** OpenSong / OpenLyrics section codes -> our labels: V1 -> Verse 1, C -> Chorus, B2 -> Bridge 2, P -> Pre-chorus. */
function sectionLabel(code) {
  const m = String(code || "").trim().match(/^([a-z]+)\s*(\d*)([a-z]?)$/i);
  if (!m) return String(code || "Verse").trim();
  const names = { v: "Verse", c: "Chorus", b: "Bridge", p: "Pre-chorus", t: "Tag", e: "Ending", o: "Outro", i: "Intro", r: "Chorus" };
  const name = names[m[1][0].toLowerCase()] || m[1];
  return `${name}${m[2] ? ` ${m[2]}` : ""}${m[3] || ""}`;
}

/** An OpenSong chord line over a lyric line -> one line with inline chords, by column. */
function mergeChordLine(chords, words) {
  const marks = [];
  chords.replace(/\S+/g, (c, at) => { marks.push([at, c]); return c; });
  let out = words;
  for (const [at, c] of marks.reverse()) {
    const pos = Math.min(at, out.length);
    out = `${out.slice(0, pos).padEnd(pos, " ")}[${c}]${out.slice(pos)}`;
  }
  return out.replace(/\s+$/, "");
}

/** OpenSong <lyrics> text -> parts. */
function openSongParts(text) {
  const parts = [];
  let cur = null, chordLine = null;
  const flush = () => { if (chordLine != null && cur) cur.lines.push(mergeChordLine(chordLine, "")); chordLine = null; };
  for (const raw of String(text).replace(/\r/g, "").split("\n")) {
    const h = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (h) { flush(); cur = { label: sectionLabel(h[1]), lines: [] }; parts.push(cur); continue; }
    if (raw.startsWith(";")) continue; // comment
    if (raw.startsWith(".")) { flush(); chordLine = raw.slice(1); continue; }
    if (!cur) { cur = { label: "Verse 1", lines: [] }; parts.push(cur); }
    // Lyric lines start with a space, or a digit for one of several verses sung to the same music.
    const multi = raw.match(/^(\d)(.*)$/);
    let line = multi ? raw.slice(1) : raw.replace(/^ /, "");
    line = line.replace(/\|\|?/g, "").replace(/_/g, "");
    if (chordLine != null && !multi) { line = mergeChordLine(chordLine, line); chordLine = null; }
    if (multi) {
      const label = `${cur.label.replace(/\s*\d+$/, "")} ${multi[1]}`;
      let p = parts.find((x) => x.label === label);
      if (!p) { p = { label, lines: [] }; parts.push(p); }
      p.lines.push(line.trim());
      continue;
    }
    cur.lines.push(line.trimEnd());
  }
  flush();
  return parts.filter((p) => p.lines.some((l) => l.trim())).map((p) => ({ label: p.label, lyrics: p.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() }));
}

/** An OpenLyrics <lines> element -> text, with <br/> as new lines and chords inline. */
function openLyricsLines(el) {
  let out = "";
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue.replace(/\s+/g, " ");
      else if (c.nodeType === 1) {
        const tag = c.localName;
        if (tag === "br") out += "\n";
        else if (tag === "chord") { const name = c.getAttribute("name") || [c.getAttribute("root"), c.getAttribute("structure") === "min" ? "m" : ""].join(""); if (name) out += `[${name}]`; walk(c); }
        else if (tag === "comment") continue;
        else walk(c);
      }
    }
  };
  walk(el);
  return out.split("\n").map((l) => l.trim()).join("\n").trim();
}

/** One file's text -> a song record (without id), or null if it isn't a song we can read. */
function songFromFile(name, text) {
  const base = name.replace(/\.[^.]+$/, "");
  const trimmed = text.replace(/^﻿/, "").trim();
  if (trimmed.startsWith("<")) {
    const doc = new DOMParser().parseFromString(trimmed, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const rootTag = doc.documentElement.localName;
    const q = (sel) => doc.getElementsByTagName(sel)[0];
    if (rootTag === "song" && q("lyrics") && !q("verse")) { // OpenSong
      const parts = openSongParts(q("lyrics").textContent);
      const order = (q("presentation")?.textContent || "").trim().split(/\s+/).filter(Boolean).map(sectionLabel);
      return { title: q("title")?.textContent.trim() || base, author: q("author")?.textContent.trim() || "", copyright: q("copyright")?.textContent.trim() || "",
        ccliSong: q("ccli")?.textContent.trim() || "", key: q("key")?.textContent.trim() || "", parts, order };
    }
    if (rootTag === "song") { // OpenLyrics
      const titleEl = q("title"), authors = [...doc.getElementsByTagName("author")].map((a) => a.textContent.trim()).filter(Boolean);
      const parts = [...doc.getElementsByTagName("verse")].map((v) => ({ label: sectionLabel(v.getAttribute("name")), lyrics: [...v.getElementsByTagName("lines")].map(openLyricsLines).join("\n\n") }));
      const order = (q("verseOrder")?.textContent || "").trim().split(/\s+/).filter(Boolean).map(sectionLabel);
      return { title: titleEl?.textContent.trim() || base, author: authors.join(", "), copyright: q("copyright")?.textContent.trim() || "",
        ccliSong: q("ccliNo")?.textContent.trim() || "", key: q("key")?.textContent.trim() || "", bpm: parseInt(q("tempo")?.textContent, 10) || 0, parts, order };
    }
    return null;
  }
  // Plain text or ChordPro.
  const dir = (k) => (trimmed.match(new RegExp(`^\\{\\s*(?:${k})\\s*:\\s*(.*?)\\s*\\}\\s*$`, "im")) || [])[1] || "";
  const body = trimmed.split("\n").map((l) => {
    const sec = l.match(/^\{\s*(?:start_of_|so)(chorus|verse|bridge|c|v|b)\s*(?::\s*(.*?))?\s*\}/i);
    if (sec) return `[${sec[2] || { c: "Chorus", v: "Verse", b: "Bridge" }[sec[1][0].toLowerCase()] || sec[1]}]`;
    return /^\{.*\}\s*$/.test(l) || l.startsWith("#") ? "" : l;
  }).join("\n");
  const parts = parseLyrics(body, customPartNames()).map((p) => ({ label: p.label, lyrics: p.lyrics }));
  if (!parts.length) return null;
  return { title: dir("title|t") || base, author: dir("artist|composer|lyricist") || "", copyright: dir("copyright") || "", ccliSong: dir("ccli") || "", key: dir("key") || "", parts, order: [] };
}

Inputs["songs-import"] = async (el) => {
  const files = [...(el.files || [])];
  el.value = "";
  if (!files.length || !canPlan()) return;
  const added = [], skipped = [], unread = [];
  for (const f of files) {
    let song = null;
    try { song = songFromFile(f.name, await f.text()); } catch { song = null; }
    if (!song || !song.parts.some((p) => p.lyrics.trim())) { unread.push(f.name); continue; }
    if (S.list("songs").some((s) => s.title.trim().toLowerCase() === song.title.trim().toLowerCase())) { skipped.push(song.title); continue; }
    const parts = [];
    for (const p of song.parts) {
      if (parts.some((x) => sameLabel(x.label, p.label))) continue;
      parts.push({ id: uid(), type: partTypeOf(p.label), label: p.label, lyrics: p.lyrics });
    }
    const order = song.order.filter((l) => parts.some((p) => sameLabel(p.label, l)));
    const straight = !order.length || order.join("\n") === parts.map((p) => p.label).join("\n");
    const pd = /public domain/i.test(song.copyright);
    S.add("songs", { title: song.title, author: song.author, ccliSong: song.ccliSong.replace(/\D/g, ""), copyright: song.copyright || (pd ? "Public domain" : ""), publicDomain: pd,
      key: song.key || "D", bpm: song.bpm || 76, timeSig: "4/4", parts, order: straight ? [] : order, lyrics: partsToLyrics(parts), charts: [], imported: true });
    added.push(song.title);
  }
  const msg = [added.length ? `${plural(added.length, "song")} imported` : "", skipped.length ? `${plural(skipped.length, "song")} already here` : "", unread.length ? `${plural(unread.length, "file")} not readable` : ""].filter(Boolean).join("; ");
  toast(msg || "Nothing to import");
  if (added.length && S.list("songs").some((s) => s.imported && !s.publicDomain && !s.copyright && !s.ccliSong)) toast("Add each imported song's copyright line or CCLI number before projecting it.");
  render();
};

// ----- Export for OpenLP (OpenLyrics XML) -----
function openLyricsCode(label, used) {
  const m = label.trim().match(/^(\S+)(?:\s+(\d+[a-z]?))?/i);
  const letter = ({ verse: "v", chorus: "c", refrain: "c", bridge: "b", "pre-chorus": "p", prechorus: "p", tag: "e", ending: "e", outro: "e", intro: "i" })[(m?.[1] || "").toLowerCase()] || "o";
  let code = `${letter}${m?.[2] || 1}`;
  while (used.has(code)) code = `${letter}${parseInt(code.slice(1), 10) + 1}`;
  used.add(code);
  return code;
}
function songToOpenLyrics(song) {
  const used = new Set(), codes = new Map();
  const parts = songParts(song);
  parts.forEach((p) => codes.set(p.label.toLowerCase(), openLyricsCode(p.label, used)));
  const order = songOrder(song).map((l) => codes.get(l.toLowerCase())).filter(Boolean).join(" ");
  const lines = (text) => xmlEsc(text).split("\n").map((l) => l.replace(/\[([^\]\s]+)\]/g, (_, c) => `<chord name="${c}"/>`)).join("<br/>");
  return `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="Our Faithful Church App">
  <properties>
    <titles><title>${xmlEsc(song.title)}</title></titles>
    ${song.author ? `<authors><author>${xmlEsc(song.author)}</author></authors>` : ""}
    ${song.copyright ? `<copyright>${xmlEsc(song.copyright)}</copyright>` : ""}
    ${song.ccliSong ? `<ccliNo>${xmlEsc(song.ccliSong)}</ccliNo>` : ""}
    ${song.key ? `<key>${xmlEsc(song.key)}</key>` : ""}
    ${song.bpm ? `<tempo type="bpm">${song.bpm}</tempo>` : ""}
    <verseOrder>${order}</verseOrder>
  </properties>
  <lyrics>
${parts.map((p) => `    <verse name="${codes.get(p.label.toLowerCase())}">${p.lyrics.split(/\n\s*\n/).map((slide) => `<lines>${lines(slide.trim())}</lines>`).join("")}</verse>`).join("\n")}
  </lyrics>
</song>
`.replace(/\n\s*\n(?=\s*<)/g, "\n");
}
Actions["song-export"] = async (el) => {
  const song = S.get("songs", el.dataset.id);
  if (!song) return;
  await saveFile(`${song.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "song"}.xml`, new Blob([songToOpenLyrics(song)], { type: "application/xml" }));
};
