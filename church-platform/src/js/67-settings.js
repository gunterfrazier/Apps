// ---------- Settings: language, text size, contrast, motion, read aloud and notifications ----------
// Display settings belong to the device, so they live in S.state.prefs and apply before the first paint.

const DEFAULT_PREFS = { lang: "", text: "m", contrast: false, calm: false, voice: {}, rate: 1, notify: { news: true, chat: true, serve: true, event: true, staff: true }, push: false, quiet: false };
const prefs = () => { S.state.prefs ||= JSON.parse(JSON.stringify(DEFAULT_PREFS)); return S.state.prefs; };
const lang = () => S.state?.prefs?.lang || ((navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en");
const appLocale = () => (lang() === "es" ? "es-US" : undefined);
function applyDisplay() {
  const p = prefs(), root = document.documentElement;
  root.classList.toggle("text-l", p.text === "l"); root.classList.toggle("text-xl", p.text === "xl");
  root.classList.toggle("contrast", !!p.contrast); root.classList.toggle("calm", !!p.calm);
  root.lang = lang() === "es" ? "es" : "en";
}

Screens.settings = () => {
  const p = prefs(), staff = S.isMember() && S.canAny(["manage.followup", "manage.locations", "manage.content", "schedule.teams"]);
  const pushState = !Push.supported() ? "unsupported" : typeof Notification !== "undefined" && Notification.permission === "denied" ? "denied" : p.push ? "on" : "off";
  const toggle = (k, label, sub, on) => html`<label class="row switch-row"><span class="body"><span class="t">${label}</span>${sub ? html`<span class="s">${sub}</span>` : ""}</span><input type="checkbox" class="switch" data-change="pref" data-k="${k}" ${attr(on, "checked")}></label>`;
  return {
    title: "Settings", back: "me",
    body: html`<section class="sec"><h2 class="sec-head">Language</h2>
        <nav class="seg" aria-label="Language" style="margin-top:0">${[["en", "English"], ["es", "Español"]].map(([k, l]) => html`<a href="#settings" data-act="set-lang" data-v="${k}" lang="${k}" ${attr(lang() === k, 'aria-current="page"')}>${l}</a>`)}</nav>
        <p class="faint">Changes the app's buttons, menus and dates. Sermons, announcements and other things your church writes stay as they wrote them.</p></section>
      <section class="sec"><h2 class="sec-head">Display</h2>
        <fieldset class="field" style="border:0;padding:0;margin-top:0"><legend class="flabel">Text size</legend><div class="radios">${[["m", "Default"], ["l", "Large"], ["xl", "Largest"]].map(([k, l]) => html`<label><input type="radio" name="text" value="${k}" data-change="pref-text" ${attr(p.text === k, "checked")}><span style="font-size:${k === "m" ? 1 : k === "l" ? 1.12 : 1.25}em">${l}</span></label>`)}</div></fieldset>
        <div class="rows">${toggle("contrast", "More contrast", "Darker text and stronger outlines", p.contrast)}${toggle("calm", "Reduce motion", "Turn off animations and moving effects", p.calm)}</div></section>
      ${readAloudSection()}
      ${bibleSection()}
      <section class="sec"><h2 class="sec-head">Notifications</h2>
        <div class="rows">
          <div class="row"><span class="lead-ic">${icon("bell")}</span><span class="body"><span class="t">Push notifications</span><span class="s">${{ on: "On for this device", off: "Off. Turn on to get them even when the app is closed.", denied: "Blocked in your browser's settings for this site", unsupported: IN_PREVIEW ? "Work once the app is on your church's website" : "Not available in this browser. On iPhone, add the app to your Home Screen first." }[pushState]}</span></span>
            ${pushState === "off" ? html`<button class="btn sm" data-act="push-on">Turn on</button>` : pushState === "on" ? html`<button class="btn ghost sm" data-act="push-off">Turn off</button>` : ""}</div>
          ${toggle("notify.news", "Announcements", "When your church posts something important", p.notify.news)}
          ${toggle("notify.chat", "Messages", "New messages in your chats", p.notify.chat)}
          ${toggle("notify.serve", "Serving", "Requests to serve and reminders the day before", p.notify.serve)}
          ${toggle("notify.event", "Events and classes", "Reminders the day before something you signed up for", p.notify.event)}
          ${staff ? toggle("notify.staff", "Staff updates", "New people to follow up, room requests and form responses", p.notify.staff) : ""}
          ${toggle("quiet", "Quiet at night", "Hold push notifications from 9 PM to 7 AM", p.quiet)}</div></section>`,
  };
};
Inputs["pref"] = (el) => {
  const p = prefs(), [a, b] = el.dataset.k.split(".");
  if (b) p[a][b] = el.checked; else p[a] = el.checked;
  S.save(); applyDisplay();
};
Inputs["pref-text"] = (el) => { prefs().text = el.value; S.save(); applyDisplay(); };
Actions["set-lang"] = (el) => { prefs().lang = el.dataset.v; S.save(); applyDisplay(); render(); toast(el.dataset.v === "es" ? "Idioma: español" : "Language: English"); };

// ----- Read aloud -----
// Voices come from the phone or computer. Speech picks the most natural voice it can find for the text's language (or
// the one the person chose in Settings), rewrites the text the way a person would say it ("John chapter 3, verse 16",
// "Lord" rather than "L-O-R-D", no web addresses or emoji) and speaks a sentence or two at a time, which keeps
// browsers from cutting long readings short. In the Claude preview it uses the page's voice unless a device voice was chosen.

const SPEEDS = [[0.85, "Slower"], [1, "Normal"], [1.15, "Faster"], [1.3, "Fastest"]];
const VOICE_SAMPLE = {
  en: "Hello! This is how read aloud will sound. The Lord is my shepherd; I shall not want.",
  es: "¡Hola! Así sonará la lectura en voz alta. El Señor es mi pastor; nada me faltará.",
};
// Novelty voices (macOS) are left out; dated and robotic voices sink to the bottom; neural and network voices rise.
const VOICE_NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox)\b/i;
const VOICE_DATED = /^(fred|kathy|ralph|junior|agnes|bruce|princess|vicki|victoria|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b|compact|espeak|eloquence/i;
const VOICE_BEST = /natural|neural|premium|enhanced|wavenet|studio|journey|chirp/i;
const NATURAL_SCORE = 40;
const normLang = (l) => String(l || "").replace("_", "-").toLowerCase();
function voiceScore(v, code) {
  const n = v.name || "", l = normLang(v.lang);
  let s = 0;
  if (VOICE_BEST.test(n)) s += 60;
  if (/\bonline\b/i.test(n)) s += 25;     // Edge: "Microsoft Aria Online (Natural)"
  if (/^google\b/i.test(n)) s += 45;      // Chrome: "Google US English"
  if (/-network$/i.test(n)) s += 20;      // Android's network voices
  if (VOICE_DATED.test(n)) s -= 40;
  if (code === "en" ? l === "en-us" : l === "es-us" || l === "es-mx") s += 8;
  else if (code === "es" && l === "es-es") s += 4;
  if (v.localService === false) s += 4;
  if (v.default) s += 2;
  return s;
}
function voiceLabel(v) {
  if (!v) return "";
  const name = String(v.name).replace(/^Microsoft\s+/i, "").replace(/\s+Online\b/i, "").replace(/\s+-\s+[^-]+$/, "").trim();
  let region = "";
  try { const r = normLang(v.lang).split("-")[1]; if (r) region = new Intl.DisplayNames([lang()], { type: "region" }).of(r.toUpperCase()); } catch {}
  return region && !/^google\b|\b(US|UK)\b/i.test(name) && !name.toLowerCase().includes(region.toLowerCase()) ? `${name}, ${region}` : name;
}

/** "en" or "es", guessed from the words in the text. The Bible is English; sermons and announcements are whatever the church wrote. */
function textLang(s) {
  const t = ` ${String(s || "").slice(0, 4000).toLowerCase().replace(/[^\p{L}]+/gu, " ")} `;
  const count = (re) => (t.match(re) || []).length;
  const es = count(/ (?:el|la|los|las|que|de|del|y|en|es|por|para|con|una|su|sus|nuestro|nuestra|dios|señor|está|como|pero|más)(?= )/g) + count(/[ñáéíóú]/g);
  const en = count(/ (?:the|and|of|to|is|that|in|for|with|you|your|our|god|lord|he|his|this|are|was|will|be)(?= )/g);
  return !es && !en ? lang() : es > en ? "es" : "en";
}

// Scripture references, said the way a person reads them aloud.
const BOOKS_ES = ["Génesis","Éxodo","Levítico","Números","Deuteronomio","Josué","Jueces","Rut","1 Samuel","2 Samuel","1 Reyes","2 Reyes","1 Crónicas","2 Crónicas","Esdras","Nehemías","Ester","Job","Salmos","Proverbios","Eclesiastés","Cantares","Isaías","Jeremías","Lamentaciones","Ezequiel","Daniel","Oseas","Joel","Amós","Abdías","Jonás","Miqueas","Nahúm","Habacuc","Sofonías","Hageo","Zacarías","Malaquías","Mateo","Marcos","Lucas","Juan","Hechos","Romanos","1 Corintios","2 Corintios","Gálatas","Efesios","Filipenses","Colosenses","1 Tesalonicenses","2 Tesalonicenses","1 Timoteo","2 Timoteo","Tito","Filemón","Hebreos","Santiago","1 Pedro","2 Pedro","1 Juan","2 Juan","3 Juan","Judas","Apocalipsis"];
const REF_NAMES = (() => {
  const m = new Map(), base = (b) => b.replace(/^\d /, "");
  BOOKS.forEach((b, i) => { const info = { en: base(b), es: base(BOOKS_ES[i]), ot: i < 39 }; m.set(info.en, info); m.set(info.es, info); });
  for (const [k, full] of Object.entries(BOOK_ALIASES)) { const name = k[0].toUpperCase() + k.slice(1); if (!/\s/.test(k) && !m.has(name)) m.set(name, m.get(base(full))); }
  m.set("Song of Songs", m.get("Song of Solomon")); m.set("Salmo", m.get("Salmos"));
  return m;
})();
const REF_RE = new RegExp(`(?<![\\p{L}\\d])(?:([1-3])\\s?)?(${[...REF_NAMES.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/ /g, "\\s+")).join("|")})\\.?\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-–—]\\s*(\\d{1,3})(?::(\\d{1,3}))?)?)?(?!\\d|:\\d)(?!\\s*[aApP]\\.?[mM]\\b)`, "gu");
function sayRef(code, num, name, c, v, v2, c2) {
  const es = code === "es", info = REF_NAMES.get(name.replace(/\s+/g, " "));
  if (!info) return null;
  let book = info[es ? "es" : "en"];
  const psalm = /^(psalms|salmos)$/i.test(book);
  if (psalm) book = es ? "Salmo" : "Psalm";
  if (num) book = es ? `${["Primer", "Segund", "Tercer"][num - 1]}${info.ot ? "o" : "a"} de ${book}` : `${["First", "Second", "Third"][num - 1]} ${book}`;
  if (!v) return `${book} ${c}`;
  const ch = psalm ? `${book} ${c}` : `${book} ${es ? "capítulo" : "chapter"} ${c}`;
  if (c2) return es ? `${ch}, versículo ${v}, al capítulo ${v2}, versículo ${c2}` : `${ch}, verse ${v}, through chapter ${v2}, verse ${c2}`;
  if (v2 && v2 !== v) return es ? `${ch}, versículos ${v} al ${v2}` : `${ch}, verses ${v} through ${v2}`;
  return es ? `${ch}, versículo ${v}` : `${ch}, verse ${v}`;
}
const SHORT_WORDS = new Set("A AN AND ARE AS AT BE BUT BY DO FOR GO HE HER HIS IN IS IT ME MY NO NOT OF ON OR OUR SO THE TO UP US WAS WE WHO YOU ALL ONE NEW EL LA LOS LAS DE DEL Y EN ES SU".split(" "));
const unshout = (w) => w[0] + w.slice(1).toLowerCase();
/** Text rewritten for the ear: references spelled out, shouting and symbols calmed, links and emoji dropped. */
function speakable(text, code = lang()) {
  const es = code === "es";
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, es ? "enlace" : "link")
    .replace(REF_RE, (m, n, name, c, v, v2, c2) => sayRef(code, n ? +n : 0, name, c, v, v2, c2) ?? m)
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*•▪◦‣>][ \t]+/gm, "")
    .replace(/[*~`|]+|(?<![\p{L}\d])_+|_+(?![\p{L}\d])/gu, " ")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s*&\s*/g, es ? " y " : " and ")
    .replace(/\b(LORD|GOD)\b/g, unshout)
    .replace(/\b[A-Z]{2,}(?:[ \t,.'’-]+[A-Z]{2,})+\b/g, (run) => run.replace(/[A-Z]{2,}/g, (w) => (w.length > 3 || SHORT_WORDS.has(w) ? unshout(w) : w)))
    .replace(/\b[A-Z]{5,}\b/g, unshout)
    .replace(/(\d)\s*[–—]\s*(\d)/g, `$1 ${es ? "a" : "to"} $2`)
    .replace(/\s*—\s*|\s+[–-]\s+/g, ", ")
    .replace(/[ \t]+/g, " ").replace(/ +([,.;:!?])/g, "$1").replace(/([,;:])[,;:]+/g, "$1")
    .replace(/ *\n */g, "\n").trim();
}
/** Sentence-sized pieces, about ten seconds each. Every line ends with a stop so the voice drops at the end of it. */
function speechChunks(text, max = 200) {
  const sentences = [];
  for (const line of String(text).split(/\n+/)) {
    const l = line.trim(); if (!l) continue;
    sentences.push(...(/[.!?…:;,"”’)]$/.test(l) ? l : `${l}.`).split(/(?<=[.!?…]["”’)]?)\s+/));
  }
  const out = []; let cur = "";
  const add = (s) => { if (!s) return; if ((cur ? cur.length + 1 : 0) + s.length <= max) cur = cur ? `${cur} ${s}` : s; else { if (cur) out.push(cur); cur = s; } };
  for (const s of sentences) {
    if (s.length <= max) { add(s); continue; }
    for (const piece of s.split(/(?<=[,;:])\s+/)) { if (piece.length <= max) add(piece); else piece.split(/\s+/).forEach(add); }
  }
  if (cur) out.push(cur);
  return out;
}
/** "1 In the beginning 2 Now the earth..." -> the words alone. Only numbers in verse order are dropped, so "40 days" stays. */
function stripVerseNums(text, first = 1) {
  const lead = String(text).match(/^\s*(\d{1,3})\s/);
  let next = lead ? +lead[1] : first;
  return String(text).replace(/(^|\s)(\d{1,3})\s+(?=\S)/g, (m, pre, n) => (+n === next ? (next++, pre) : m)).trim();
}
/** Joins pieces into lines, each ending in a stop. */
const sayLines = (...xs) => xs.flat().map((x) => String(x ?? "").trim()).filter(Boolean).map((x) => (/[.!?…:;]$/.test(x) ? x : `${x}.`)).join("\n");

const Speech = {
  tts: undefined, current: null, token: 0, utt: null, primed: false, seen: -1, loaded: false,
  supported: () => typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined",
  all() { try { return window.speechSynthesis.getVoices() || []; } catch { return []; } },
  /** The device's voices for "en" or "es", most natural first. */
  voices(code = lang()) {
    if (!this.supported()) return [];
    return this.all().filter((v) => normLang(v.lang).startsWith(code) && !VOICE_NOVELTY.test(v.name))
      .map((v) => [v, voiceScore(v, code)]).sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name)).map(([v]) => v);
  },
  /** The voice chosen in Settings for this language, or the most natural one on the device. */
  voice(code = lang()) {
    const list = this.voices(code), want = prefs().voice?.[code];
    return (want && list.find((v) => v.voiceURI === want)) || list[0] || null;
  },
  rate() { const r = +prefs().rate; return r >= 0.5 && r <= 2 ? r : 1; },
  /** Voices load a moment after the page does in some browsers. */
  ready() {
    if (!this.supported() || this.all().length) return Promise.resolve();
    return new Promise((res) => { window.speechSynthesis.addEventListener?.("voiceschanged", () => res(), { once: true }); setTimeout(res, 1500); });
  },
  async engine() {
    if (IN_PREVIEW && !Object.keys(prefs().voice || {}).length) {
      if (this.tts === undefined) { try { this.tts = (await window.claude?.use?.("tts")) || null; } catch { this.tts = null; } }
      if (this.tts) return "tts";
    }
    return this.supported() ? "web" : null;
  },
  /** iPhone only lets a page speak after a tap. A silent word spoken during the tap lets the reading start once the text has loaded. */
  prime() {
    if (this.primed || !this.supported()) return;
    try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); this.primed = true; } catch {}
  },
  stop() { this.token++; this.utt = null; try { this.tts?.stop(); } catch {} try { window.speechSynthesis?.cancel(); } catch {} this.mark(null); },
  mark(src) {
    this.current = src;
    $$("[data-act=listen],[data-act=voice-preview]").forEach((b) => { const on = b.dataset.src === src; b.setAttribute("aria-pressed", on); const l = $(".lbl", b); if (l) l.textContent = on ? tr("Stop") : tr(b.dataset.label || "Listen"); });
  },
  /** Reads text aloud. code ("en" or "es") picks the voice; without it the language is worked out from the text. */
  async say(text, src, code) {
    this.stop();
    const token = this.token;
    code ||= textLang(text);
    const parts = speechChunks(speakable(text, code));
    if (!parts.length) return;
    const eng = await this.engine();
    if (token !== this.token) return;
    if (!eng) { toast("Read aloud isn't available in this browser"); return; }
    this.mark(src);
    try {
      if (eng === "tts") await this.tts.speak(parts.map((t) => ({ text: t })));
      else await this.speakWeb(parts, code, token);
    } catch (e) {
      if (e?.code === "not_granted") toast("Read aloud is turned off for this page");
      else if (e?.code === "rate_limited") toast("Too many requests. Try again in a minute.");
      else if (e?.error === "not-allowed") toast("Tap Listen again to start reading");
      else if (token === this.token) toast("Read aloud stopped. Try another voice in Settings.");
    }
    if (token === this.token && this.current === src) this.mark(null);
  },
  /** One piece at a time, each starting when the last ends, so Stop is instant and nothing gets cut off. */
  async speakWeb(parts, code, token) {
    await this.ready();
    let voice = this.voice(code);
    const synth = window.speechSynthesis, rate = this.rate();
    await new Promise((r) => setTimeout(r, 60)); // Chrome can drop a speak() that comes right after cancel()
    for (let i = 0; i < parts.length; i++) {
      if (token !== this.token) return;
      try { await this.utter(synth, parts[i], voice, code, rate); }
      catch (e) {
        // An online voice that can't be reached: carry on with a voice that lives on the device.
        const local = voice && !voice.localService && this.voices(code).find((v) => v.localService);
        if (!local || token !== this.token) throw e;
        voice = local; i--;
      }
    }
  },
  utter(synth, text, voice, code, rate) {
    return new Promise((res, rej) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = code === "es" ? "es-US" : "en-US";
      u.rate = rate; u.pitch = 1;
      // If a browser never reports the end, move on once the piece has had plenty of time.
      const guard = setTimeout(res, 5000 + (text.length * 180) / rate);
      u.onend = () => { clearTimeout(guard); res(); };
      u.onerror = (e) => { clearTimeout(guard); e.error === "interrupted" || e.error === "canceled" ? res() : rej(e); };
      this.utt = u; // Chrome forgets an utterance nothing holds on to, and then never says it ended
      synth.speak(u);
    });
  },
};
if (Speech.supported()) {
  Speech.all(); // starts loading the voices
  Speech.ready().then(() => { Speech.loaded = true; if (splitRoute().head === "settings" && !Speech.all().length) render(); });
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    const n = Speech.all().length;
    if (n === Speech.seen) return;
    Speech.seen = n;
    if (splitRoute().head === "settings" && !document.activeElement?.matches?.("select")) render();
  });
}

/** A Listen button. src says what to read: "passage:John 3:16", "sermon:ID", "news:ID", "doc:ID", "plan:ID|day". */
const listenBtn = (src, label = "Listen") => html`<button class="btn ghost sm listen" data-act="listen" data-src="${src}" data-label="${label}" aria-pressed="false">${icon("music")}<span class="lbl">${label}</span></button>`;
async function listenText(src) {
  const [kind, ...rest] = src.split(":"), id = rest.join(":");
  const verses = (ref) => Bible.text(ref, "BSB", false).catch(() => "");
  if (kind === "passage") { const t = await verses(id); return t ? sayLines(id, t) : ""; }
  if (kind === "sermon") { const s = S.get("sermons", id); return s ? sayLines(s.title, s.summary, s.outline || [], transcriptText(s)) : ""; }
  if (kind === "transcript") { const s = S.get("sermons", id); return s ? transcriptText(s) : ""; }
  if (kind === "news") { const n = S.get("news", id); return n ? sayLines(n.title, n.body) : ""; }
  if (kind === "doc") {
    const d = S.get("docs", id); if (!d) return "";
    const out = [d.title];
    for (const b of d.blocks.filter((x) => x.show && x.type !== "note")) {
      if (b.type === "scripture") out.push(b.ref, b.text ? stripVerseNums(b.text, parseRef(b.ref)?.verse || 1) : await verses(b.ref));
      else out.push(b.title, b.text, b.caption);
    }
    return sayLines(out);
  }
  if (kind === "plan") { const [pid, day] = id.split("|"), p = S.get("plans", pid); const refs = p?.days[+day] || []; return sayLines((await Promise.all(refs.map(async (r) => { const t = await verses(r); return t ? [r, t] : []; }))).flat()); }
  return "";
}
Actions["listen"] = async (el) => {
  const src = el.dataset.src;
  if (Speech.current === src) { Speech.stop(); return; }
  Speech.prime();
  const text = await listenText(src);
  if (!text) { toast("There's nothing to read here yet"); return; }
  Speech.say(text, src);
};
window.addEventListener("hashchange", () => { if (Speech.current) Speech.stop(); });

// ----- Read aloud settings: the voice for each language, the speed, and where to get better voices -----
function readAloudSection() {
  const head = html`<h2 class="sec-head">Read aloud</h2>`;
  if (!Speech.supported() && !IN_PREVIEW) return html`<section class="sec">${head}<p class="faint">Read aloud isn't available in this browser.</p></section>`;
  Speech.seen = Speech.all().length;
  const codes = lang() === "es" ? ["es", "en"] : ["en"], rate = Speech.rate();
  return html`<section class="sec" id="read-aloud">${head}
    ${codes.map((c) => voicePicker(c, codes.length > 1))}
    <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Speed</legend><div class="radios">${SPEEDS.map(([r, l]) => html`<label><input type="radio" name="rate" value="${r}" data-change="pref-rate" ${attr(Math.abs(rate - r) < 0.01, "checked")}><span>${l}</span></label>`)}</div></fieldset>
    <details class="voice-tips"><summary>Get more natural voices</summary>
      <p>Voices come from this phone or computer, so the list is different on each one.</p>
      <ul><li>iPhone and iPad: open Settings, then Accessibility, then Read & Speak (Spoken Content on older versions), then Voices. Download an Enhanced or Premium voice, then choose it here.</li>
        <li>Android: install or update Speech Services by Google from the Play Store.</li>
        <li>Computers: Microsoft Edge has voices marked Natural, and Google Chrome has Google voices.</li></ul></details></section>`;
}
function voicePicker(code, both) {
  const list = Speech.voices(code), chosen = prefs().voice?.[code] || "";
  const label = both ? (code === "es" ? "Spanish voice" : "English voice") : "Voice";
  const note = both && code === "en" ? html`<small>Reads the Bible and anything written in English</small>` : "";
  if (!list.length) return html`<div class="field voice-field"><span class="vlabel">${label}</span><small>${Speech.all().length || Speech.loaded ? (code === "es" ? "This device doesn't have a Spanish voice yet. You can add one in your device's settings." : "This device doesn't have an English voice yet. You can add one in your device's settings.") : "Looking for the voices on this device..."}</small></div>`;
  const natural = list.filter((v) => voiceScore(v, code) >= NATURAL_SCORE), other = list.filter((v) => voiceScore(v, code) < NATURAL_SCORE);
  const opt = (v) => html`<option value="${v.voiceURI}" ${attr(v.voiceURI === chosen, "selected")}>${voiceLabel(v)}</option>`;
  return html`<div class="field voice-field"><label class="vlabel" for="voice-${code}">${label}</label>
    <div class="voice-row"><select id="voice-${code}" data-change="pref-voice" data-lang="${code}" translate="no">
      <option value="">${tr("Best available")}: ${voiceLabel(list[0])}</option>
      ${natural.length ? html`<optgroup label="${tr("Most natural")}">${natural.map(opt)}</optgroup>` : ""}
      ${other.length ? html`<optgroup label="${tr(natural.length ? "Other voices" : "Voices on this device")}">${other.map(opt)}</optgroup>` : ""}
    </select><button type="button" class="btn ghost sm listen" data-act="voice-preview" data-lang="${code}" data-src="preview:${code}" data-label="Play a sample" aria-pressed="false">${icon("music")}<span class="lbl">Play a sample</span></button></div>${note}</div>`;
}
const previewVoice = (code) => { Speech.prime(); Speech.say(VOICE_SAMPLE[code] || VOICE_SAMPLE.en, `preview:${code}`, code); };
Actions["voice-preview"] = (el) => { const code = el.dataset.lang || lang(); if (Speech.current === `preview:${code}`) Speech.stop(); else previewVoice(code); };
Inputs["pref-voice"] = (el) => {
  const p = prefs(), code = el.dataset.lang; p.voice ||= {};
  if (el.value) p.voice[code] = el.value; else delete p.voice[code];
  S.save(); previewVoice(code);
};
Inputs["pref-rate"] = (el) => { prefs().rate = +el.value; S.save(); previewVoice(lang()); };

// ----- Push notifications (Web Push) -----
const Push = {
  supported() { return !IN_PREVIEW && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined"; },
  async enable() {
    if (!this.supported()) { toast("Push notifications aren't available here"); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { toast("Notifications are blocked. You can allow them in your browser's settings."); return false; }
    try {
      const reg = await navigator.serviceWorker.ready;
      if (PLATFORM.vapidPublicKey && typeof Backend !== "undefined" && Backend.on) {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey(PLATFORM.vapidPublicKey) });
        await Backend.savePush(sub.toJSON());
      }
    } catch (e) { console.warn("push subscribe", e); }
    prefs().push = true; S.save(); return true;
  },
  async disable() {
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription(); if (sub) { if (typeof Backend !== "undefined" && Backend.on) await Backend.removePush(sub.endpoint); await sub.unsubscribe(); } } catch {}
    prefs().push = false; S.save();
  },
  /** While the app is open in the background, show new notifications through the service worker. */
  async local(n) {
    const p = prefs();
    if (!p.push || typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    const h = new Date().getHours(); if (p.quiet && (h >= 21 || h < 7)) return;
    try { const reg = await navigator.serviceWorker.ready; reg.showNotification(n.title, { body: n.body, tag: n.id, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: `./${n.link || "#alerts"}` } }); } catch {}
  },
};
function vapidKey(b64) { const pad = "=".repeat((4 - (b64.length % 4)) % 4), raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); }
Actions["push-on"] = async () => { if (await Push.enable()) { toast("Push notifications are on"); render(); } };
Actions["push-off"] = async () => { await Push.disable(); toast("Push notifications are off"); render(); };

// Which setting covers each kind of notification.
const NOTIFY_GROUP = { serve: "serve", chat: "chat", news: "news", event: "event", group: "event", form: "staff", follow: "staff", room: "staff" };
const wantsNotify = (n) => { const g = NOTIFY_GROUP[n.kind]; return !g || prefs().notify[g] !== false; };

// ----- Reminders the day before -----
function runReminders() {
  if (!S.church() || !S.isMember()) return;
  const sent = (S.state.reminded ||= []), now = Date.now(), soon = (t) => t > now && t - now < 30 * 3600e3;
  const once = (key, n) => { if (sent.includes(key)) return; sent.push(key); if (sent.length > 300) sent.splice(0, sent.length - 300); notify(S.me().id, n); };
  myAssignments().filter(([p, a]) => a.status === "accepted" && soon(fromIsoDay(p.date, p.time || "09:00").getTime()))
    .forEach(([p, a]) => once(`serve:${a.id}`, { kind: "serve", title: `You're serving ${isoDay(fromIsoDay(p.date)) === isoDay(new Date()) ? "today" : "tomorrow"}`, body: `${a.position} on the ${a.team} team, ${planLabel(p)}`, link: "#serving" }));
  upcomingEvents().filter((e) => myRegistration(e) && soon(new Date(e.start).getTime()))
    .forEach((e) => once(`event:${e.id}`, { kind: "event", title: `Coming up: ${e.title}`, body: `${fmtWhen(e.start)}, ${placeText(e)}`, link: `#event-${e.id}` }));
  S.visible("gatherings", { ignoreCampus: true }).filter((g) => isIn(g) || myEntries(g).length).forEach((g) => {
    const t = nextMeeting(g); if (t && soon(t.getTime())) once(`g:${g.id}:${isoDay(t)}`, { kind: "event", title: `${g.name} meets ${isoDay(t) === isoDay(new Date()) ? "today" : "tomorrow"}`, body: `${fmtTime(t)}${g.room ? `, ${g.room}` : ""}`, link: `#gathering-${g.id}` });
  });
}
setInterval(runReminders, 30 * 60e3);
