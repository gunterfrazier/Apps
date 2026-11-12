// ---------- Platform settings ----------
// Rename the platform here. veritasUrl is where Bible links open; appUrl is what QR codes point to in the preview.
// On your own website, QR codes use that site's address automatically.
const PLATFORM = {
  name: "Koinonia",
  tagline: "Your church, in your pocket",
  veritasUrl: "https://claude.ai/artifact/NNq1Q3MLHE93XzekkvdBtc",
  appUrl: "https://claude.ai/artifact/Htwf4rcWd3CBDK1Yw97j25",
  storageKey: "koinonia-v2",
  color: "#4250d6",
  // Filled in by config.js on your own website (see SETUP.md). Empty means the app keeps data in the browser.
  supabaseUrl: "", supabasePublishableKey: "", vapidPublicKey: "", platformFeePercent: 0,
  ...(typeof window !== "undefined" && window.KOINONIA_CONFIG ? window.KOINONIA_CONFIG : {}),
};
// Older config files call the publishable key the anon key.
PLATFORM.supabasePublishableKey ||= PLATFORM.supabaseAnonKey || "";
// A live site keeps its own copy in the browser, apart from anything tried in preview mode.
if (PLATFORM.supabaseUrl && !/claude/i.test(location.hostname)) PLATFORM.storageKey += "-live";
/** True inside the Claude preview frame, where other sites can't be framed and cameras, popups and service workers are off. */
const IN_PREVIEW = /claude/i.test(location.hostname);

// ---------- Safe HTML templating ----------
// Every interpolated value is escaped unless it is itself the result of html``.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const raw = (s) => new Raw(String(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const flat = (v) => v == null || v === false ? "" : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(flat).join("") : esc(v);
function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += flat(v) + strings[i + 1]; });
  return new Raw(out);
}
const attr = (cond, a) => cond ? raw(a) : "";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const initials = (name) => String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const listJoin = (xs) => xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
const isUrl = (s) => /^https?:\/\/[^\s]+$/i.test(String(s || "").trim());

// ---------- Dates ----------
const DAY = 864e5;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const fromIsoDay = (s, hhmm = "00:00") => new Date(`${s}T${hhmm}`);
const fmt = (d, o) => new Date(d).toLocaleDateString(appLocale(), o);
const fmtDay = (d) => fmt(d, { weekday: "long", month: "long", day: "numeric" });
const fmtShort = (d) => fmt(d, { month: "short", day: "numeric", year: new Date(d).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
const fmtWhen = (d) => `${fmt(d, { weekday: "short", month: "short", day: "numeric" })}, ${fmtTime(d)}`;
const fmtTime = (d) => new Date(d).toLocaleTimeString(appLocale(), { hour: "numeric", minute: "2-digit" });
const fmtMonth = (d) => fmt(d, { month: "short" });
function timeLabel(hhmm) { if (!hhmm) return ""; const [h, m] = hhmm.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return fmtTime(d); }
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000, es = lang() === "es";
  if (s < 60) return es ? "justo ahora" : "just now";
  if (s < 3600) return es ? `hace ${Math.floor(s / 60)} min` : `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return es ? `hace ${Math.floor(s / 3600)} h` : `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86400) { const n = Math.floor(s / 86400); return es ? (n === 1 ? "ayer" : `hace ${n} días`) : n === 1 ? "yesterday" : `${n} days ago`; }
  return fmtShort(d);
}
/** Next occurrence of weekday `dow` at hh:mm, `weeks` weeks out (0 = this coming one, including today if still ahead). */
function nextWeekday(dow, hhmm, weeks = 0, from = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(from); d.setHours(h, m, 0, 0);
  let add = (dow - d.getDay() + 7) % 7;
  if (add === 0 && d < from) add = 7;
  d.setDate(d.getDate() + add + weeks * 7);
  return d;
}
function ageFrom(birth) {
  if (!birth) return null;
  const b = new Date(birth), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}
const dayNames = (days) => listJoin(days.map((d) => DAYS[d] + "s"));

// ---------- Money ----------
const money = (n) => Number(n || 0).toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: Number(n) % 1 ? 2 : 0 });

// ---------- Color ----------
function luminance(hex) {
  const c = hex.replace("#", "").match(/.{2}/g).map((x) => parseInt(x, 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const onColor = (hex) => luminance(hex) > 0.33 ? "#16201b" : "#ffffff";
const BRAND_COLORS = ["#1f6f78", "#8c2f39", "#3d4fa0", "#2f5d50", "#7a4b94", "#b0561e", "#235a8c", "#5b6b2a"];
const personColor = (seed) => { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 38% 42%)`; };

// ---------- Permissions and features ----------
// Each role turns these on or off. The primary account holder always has all of them.
const PERMS = [
  ["Everyday", "use.prayer", "Share prayer requests"],
  ["Everyday", "use.directory", "See the member directory"],
  ["Everyday", "use.chat", "Use chat"],
  ["Everyday", "use.checkin", "Check in their own kids"],
  ["Leading", "lead.groups", "Lead the groups they're assigned to"],
  ["Leading", "teach.classes", "Teach the classes they're assigned to"],
  ["Leading", "build.studies", "Bible study guide builder"],
  ["Leading", "build.lessons", "Sunday school lesson builder, for their classes"],
  ["Leading", "build.sermons", "Sermon builder"],
  ["Leading", "chat.leaders", "Leadership chat"],
  ["Leading", "book.rooms", "Request rooms for their groups and events"],
  ["Sunday", "services.plan", "Plan services, segments and songs"],
  ["Sunday", "present", "Run presentations on the screens"],
  ["Sunday", "checkin.station", "Run check-in and see room rosters"],
  ["Sunday", "qr.create", "Make QR codes"],
  ["Sunday", "schedule.teams", "Schedule volunteer teams"],
  ["Managing", "manage.content", "Announcements and events"],
  ["Managing", "manage.sermons", "Publish sermons and reading plans"],
  ["Managing", "manage.classes", "Create and schedule classes and groups"],
  ["Managing", "manage.prayer", "Moderate prayer and read connect cards"],
  ["Managing", "manage.people", "Members and the directory"],
  ["Managing", "manage.followup", "Follow up with new people"],
  ["Managing", "view.reports", "Attendance and new-people reports"],
  ["Managing", "view.giving", "Giving reports and funds"],
  ["Managing", "manage.page", "Landing page, branding and links"],
  ["Managing", "manage.integrations", "Webhooks and embedded pages"],
  ["Managing", "manage.locations", "Campuses, locations and rooms"],
  ["Managing", "manage.roles", "Roles and who has them"],
  ["Managing", "manage.church", "Church account, features and defaults"],
];
const PERM_LABEL = Object.fromEntries(PERMS.map(([, k, l]) => [k, l]));
/** Permissions added after a church was created, and which built-in roles get them by default. */
const NEW_PERM_DEFAULTS = {
  "book.rooms": ["pastor", "staff", "teacher", "leader"], "schedule.teams": ["pastor", "staff", "media"],
  "manage.followup": ["pastor", "staff"], "view.reports": ["pastor", "staff"],
};
const mmss = (secs) => { const s = Math.max(0, Math.round(secs)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const MODULES = [
  ["sermons", "Sermons"], ["plans", "Reading plans"], ["events", "Events"], ["classes", "Classes and Sunday school"], ["groups", "Small groups"],
  ["prayer", "Prayer wall"], ["directory", "Directory"], ["giving", "Giving"], ["checkin", "Kids check-in"], ["parents", "Parent portal"],
  ["chat", "Chat"], ["live", "Watch live"], ["veritas", "Veritas Logos Bible links"],
];

// ---------- Scripture references, Bible text and Veritas Logos links ----------
const BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const BOOK_ALIASES = { psalm: "Psalms", ps: "Psalms", "song of songs": "Song of Solomon", songs: "Song of Solomon", gen: "Genesis", ex: "Exodus", matt: "Matthew", mt: "Matthew", mk: "Mark", lk: "Luke", jn: "John", rom: "Romans", rev: "Revelation", revelations: "Revelation", eph: "Ephesians", phil: "Philippians", heb: "Hebrews", prov: "Proverbs", isa: "Isaiah" };
/** "John 15:1-8" -> { book: "John", chapter: 15, verse: 1, verseEnd: 8 } or null. */
function parseRef(ref) {
  const m = String(ref || "").split(",")[0].trim().replace(/[–—]/g, "-").match(/^([1-3]?\s?[A-Za-z][A-Za-z ]*?)\.?\s*(\d+)(?:\s*:\s*(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!m) return null;
  const key = m[1].toLowerCase().replace(/\s+/g, " ").trim();
  const flatKey = key.replace(/\s/g, "");
  const norm = (b) => b.toLowerCase().replace(/\s/g, "");
  const book = BOOK_ALIASES[key] || BOOKS.find((b) => norm(b) === flatKey)
    || (flatKey.replace(/^\d/, "").length >= 3 ? BOOKS.find((b) => norm(b).startsWith(flatKey)) : null); // "1 Cor", "Gal", "Deut"
  if (!book) return null;
  return { book, chapter: +m[2], verse: m[3] ? +m[3] : undefined, verseEnd: m[4] ? +m[4] : undefined };
}
const refSlug = (r) => [r.book.toLowerCase().replace(/\s+/g, ""), r.chapter, r.verse, r.verseEnd].filter(Boolean).join("-");
const refLabel = (r) => `${r.book === "Psalms" ? "Psalm" : r.book} ${r.chapter}${r.verse ? `:${r.verse}${r.verseEnd && r.verseEnd !== r.verse ? `-${r.verseEnd}` : ""}` : ""}`;
function veritasBase() { const c = S.church(); return (c && c.veritasUrl) || PLATFORM.veritasUrl; }
const Veritas = {
  enabled: () => S.on("veritas"),
  read: (ref) => { const r = parseRef(ref); return r ? `${veritasBase()}#read-${refSlug(r)}` : null; },
  ask: (ref) => { const r = parseRef(ref); return r ? `${veritasBase()}#ask-${refSlug(r)}` : null; },
  guide: (topic) => { const t = slugify(topic); return t ? `${veritasBase()}#new-${t}` : `${veritasBase()}#guides`; },
  home: () => veritasBase(),
};

/** Public-domain Bible text (BSB and KJV), shipped with the app in bible/ and loaded on first use. */
const Bible = {
  translations: ["BSB", "KJV"],
  cache: {},
  async load(t, part) {
    const key = `${t}-${part}`;
    if (!this.cache[key]) this.cache[key] = fetch(`bible/${key}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
    try { return await this.cache[key]; } catch (e) { delete this.cache[key]; throw e; }
  },
  /** Returns "1 I am the true vine... 2 ..." for a reference, or throws. */
  async text(ref, t = "BSB") {
    const r = parseRef(ref);
    if (!r) throw new Error("bad reference");
    const n = BOOKS.indexOf(r.book);
    const data = await this.load(t, n < 39 ? "ot" : "nt");
    const ch = data[n < 39 ? n : n - 39]?.[r.chapter - 1];
    if (!ch) throw new Error("no such chapter");
    const a = r.verse || 1, b = Math.min(r.verseEnd || (r.verse ? r.verse : ch.length), ch.length);
    if (a > ch.length) throw new Error("no such verse");
    const out = [];
    for (let v = a; v <= b; v++) out.push(`${v} ${ch[v - 1]}`);
    return out.join(" ");
  },
};

// ---------- Images (uploads are resized and kept as data URLs) ----------
function readImage(file, maxSide = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const g = c.getContext("2d");
      const png = file.type === "image/png" || file.type === "image/svg+xml";
      if (!png) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(png ? "image/png" : "image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image couldn't be read.")); };
    img.src = url;
  });
}

// ---------- QR codes ----------
/** SVG markup for a QR code (qrcode-generator, inlined in the build). */
function qrSvg(text, { size = 240, dark = "#111", light = "#fff" } = {}) {
  const q = qrcode(0, "M"); q.addData(unescape(encodeURIComponent(text))); q.make();
  const n = q.getModuleCount(), quiet = 4, total = n + quiet * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
function qrCanvas(text, px = 8) {
  const q = qrcode(0, "M"); q.addData(unescape(encodeURIComponent(text))); q.make();
  const n = q.getModuleCount(), quiet = 4, total = (n + quiet * 2) * px;
  const c = document.createElement("canvas"); c.width = c.height = total;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, total, total); g.fillStyle = "#000";
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (q.isDark(r, col)) g.fillRect((col + quiet) * px, (r + quiet) * px, px, px);
  return c;
}

// ---------- Icons ----------
const ICONS = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  word: '<path d="M4 5.5C6.5 4 9 4 12 6c3-2 5.5-2 8-.5V19c-2.5-1.5-5-1.5-8 .5-3-2-5.5-2-8-.5Z"/><path d="M12 6v13.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.4c2.4-.4 4.5 1 5 4.1"/>',
  give: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  play: '<path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none"/>',
  live: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pray: '<path d="M12 3.5c-1 2.5-3.5 5-3.5 9.5V20h7v-7c0-4.5-2.5-7-3.5-9.5Z"/><path d="M12 9v11"/>',
  kid: '<circle cx="12" cy="6.5" r="2.7"/><path d="M8 21v-6.5L6 12m10 9v-6.5l2-2.5M8.5 11h7"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7.5h14V12"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c1-4 4-5.8 7.5-5.8s6.5 1.8 7.5 5.8"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  note: '<path d="M6 3.5h9l3.5 3.5v13.5H6Z"/><path d="M15 3.5V7h3.5M9 11.5h6M9 15h6"/>',
  book: '<path d="M5 4.5h11a2.5 2.5 0 0 1 2.5 2.5v13H7.5A2.5 2.5 0 0 1 5 17.5Z"/><path d="M5 17.5A2.5 2.5 0 0 1 7.5 15h11"/>',
  ask: '<path d="M4.5 5h15v11H10l-5.5 4Z"/><path d="M9.5 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.7-.9 1.4M12 14.3v.1"/>',
  chat: '<path d="M4 5.5h16v10.5H9.5L4 20Z"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V14c0 3.6-2.4 6.5-6 6.5-2.6 0-4-1.3-5.5-3.5L4 13.5a1.5 1.5 0 0 1 2.5-1.6L8 13.5"/>',
  bookmark: '<path d="M7 3.5h10v17l-5-3.5-5 3.5Z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16Z"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17Z"/><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  church: '<path d="M12 2.5v4M10 4.5h4M12 6.5 6 11v9.5h12V11Z"/><path d="M10 20.5v-4a2 2 0 0 1 4 0v4M3.5 20.5h17"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  screen: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20"/>',
  music: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M4 4l16 16M10 6c.6-.3 1.3-.5 2-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.6 7.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6Z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2.5 2.5M15 8l2 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  door: '<path d="M6 21V4h10v17M4 21h16M13 12.5v.1"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6Z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.1M4.5 12h.1M4.5 17.5h.1"/>',
  send: '<path d="M4 12 20 4l-5 16-3-7Z"/><path d="m12 13 8-9"/>',
  black: '<rect x="4" y="5" width="16" height="12" rx="1" fill="currentColor"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  prev: '<path d="M15 5 8 12l7 7"/>',
  grip: '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
};
const icon = (name, label) => raw(`<svg class="i" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[name] || ""}</svg>`);
