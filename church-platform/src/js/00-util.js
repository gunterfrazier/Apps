// ---------- Platform settings ----------
// Rename the platform here. veritasUrl is where Bible links open; appUrl is what QR codes point to in the preview.
// On your own website, QR codes use that site's address automatically.
const PLATFORM = {
  name: "Our Faithful Church App",
  tagline: "Your church, in your pocket",
  veritasUrl: "https://veritaslogos.com/app/",
  appUrl: "https://claude.ai/artifact/Htwf4rcWd3CBDK1Yw97j25",
  storageKey: "our-faithful-v1",
  color: "#4250d6",
  // Filled in by config.js on your own website (see SETUP.md). Empty means the app keeps data in the browser.
  supabaseUrl: "", supabasePublishableKey: "", vapidPublicKey: "", platformFeePercent: 0,
  // When the app has its own domain: home is its one address, and movedFrom lists hosts it used to live at.
  home: "", movedFrom: [],
  // App email goes out from each sender's own name at this domain (wesparker@mail.ourfaithfulchurch.com), replies to them.
  emailDomain: "mail.ourfaithfulchurch.com",
  ...(typeof window !== "undefined" && window.OUR_FAITHFUL_CONFIG ? window.OUR_FAITHFUL_CONFIG : {}),
};
// Older config files call the publishable key the anon key.
PLATFORM.supabasePublishableKey ||= PLATFORM.supabaseAnonKey || "";
const BASE_STORAGE_KEY = PLATFORM.storageKey;
// A live site keeps its own copy in the browser, apart from anything tried in preview mode.
if (PLATFORM.supabaseUrl && !/claude/i.test(location.hostname)) PLATFORM.storageKey += "-live";
/** True inside the Claude preview frame, where other sites can't be framed and cameras, popups and service workers are off. */
const IN_PREVIEW = /claude/i.test(location.hostname);
// Running in the Our Faithful Screens TV app (or opened with ?tv=1 to try it in a browser).
const ON_TV = /[?&]tv=1\b/.test(location.search) || /OurFaithfulScreens\//.test(navigator.userAgent);

// ---------- One address ----------
// Sign-ins, the home-screen install and paired screens all belong to the address they were made at. So when the app
// has its own domain (config.js: home), every other way in forwards there: the www name at once, and an address the app
// has moved from (config.js: movedFrom) as soon as the new one is really serving the app, so a domain that's still
// being set up never strands anyone. The rest of the link (?demo, #pair-ABC123, a sign-in link's code) comes along.
// To keep using an old address, add ?stay to it.
const MOVED_KEY = "our-faithful-moved";
const ARRIVED = location.search;   // the link as it was opened: ?demo and ?training are taken off the address further down
function forwardHome() {
  let home; try { home = new URL(PLATFORM.home); } catch { return false; }
  if (IN_PREVIEW || !/^https?:$/.test(location.protocol) || location.origin === home.origin) return false;
  const go = () => { location.replace(home.origin + home.pathname + ARRIVED + location.hash); return true; };
  if (location.hostname === `www.${home.hostname}`) return go();
  if (![].concat(PLATFORM.movedFrom || []).includes(location.hostname) || /[?&]stay\b/.test(ARRIVED)) return false;
  try { if (localStorage.getItem(MOVED_KEY) === home.href) return go(); } catch { /* storage is off: ask each time */ }
  fetch(new URL("config.js", home), { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).then((text) => {
    if (!text.includes("OUR_FAITHFUL_CONFIG")) return;   // a parked domain or a half-finished setup answers differently
    try {
      localStorage.setItem(MOVED_KEY, home.href);
      if (/[?&](demo|training)\b/.test(ARRIVED)) localStorage.removeItem(SANDBOX_KEY);   // the link's demo goes with it
    } catch { /* fine */ }
    go();
  }).catch(() => { /* the new address isn't up yet: stay */ });
  return false;
}
/** True when this page is on its way to the app's one address, so nothing should start here. */
const FORWARDING = forwardHome();

// ---------- Church web addresses ----------
// Every church's landing page has a web address built from its church ID: ourfaithfulchurch.com/riverside, and, once
// the wildcard DNS record and the church-sites Worker are set up (SETUP.md, config.js: churchSubdomains),
// riverside.ourfaithfulchurch.com. A church without a website can use it as its website.
const SITE_DOMAIN = (() => { try { return (PLATFORM.siteDomain || (PLATFORM.home ? new URL(PLATFORM.home).hostname : "") || "ourfaithfulchurch.com").toLowerCase(); } catch { return "ourfaithfulchurch.com"; } })();
const SITE_HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
// Names a church can't use: the app's own pages and files, and subdomains kept for the platform.
const RESERVED_HANDLES = new Set(("www app apps admin api mail email help support status docs blog news about pricing plans " +
  "join signin sign-in signup sign-up login logout register start churches church page pages pair setup welcome settings " +
  "home give giving t go tv screens screen display stage overlay kiosk nfc qr link links site sites " +
  "privacy terms legal security abuse contact press careers store shop download downloads " +
  "icons kids bible hymns demo training vendor family-lib config manifest assets static media files cdn " +
  "our-faithful ourfaithful our-faithful-church veritas veritas-logos").split(" "));
/** The church this address is for: a subdomain (riverside.ourfaithfulchurch.com) or a path (/riverside). */
const CHURCH_SITE = (() => {
  if (IN_PREVIEW || FORWARDING || !/^https?:$/.test(location.protocol)) return null;
  const host = location.hostname.toLowerCase();
  if (host.endsWith(`.${SITE_DOMAIN}`)) {
    const sub = host.slice(0, -SITE_DOMAIN.length - 1);
    if (!sub.includes(".") && SITE_HANDLE_RE.test(sub) && !RESERVED_HANDLES.has(sub)) return { handle: sub, subdomain: true };
  }
  const m = location.pathname.match(/^\/([A-Za-z0-9-]+)$/), h = m?.[1].toLowerCase();
  return h && SITE_HANDLE_RE.test(h) && !RESERVED_HANDLES.has(h) ? { handle: h, subdomain: false } : null;
})();
/** The website's root (ourfaithfulchurch.com/): the app is at /app/ under it. Tag links and church addresses start here. */
const SITE_ROOT = (() => {
  if (CHURCH_SITE?.subdomain) return `${location.protocol}//${SITE_DOMAIN}${location.port ? `:${location.port}` : ""}/`;
  return location.origin + location.pathname.replace(/[^/]*$/, "").replace(/app\/$/, "");
})();
/** The app's own address (ourfaithfulchurch.com/app/), for links that leave a church subdomain (joining, signing in). */
const APP_HOME = (() => {
  if (!CHURCH_SITE) return location.origin + location.pathname;
  if (!CHURCH_SITE.subdomain) return `${location.origin}/`;
  return `${location.protocol}//${SITE_DOMAIN}${location.port ? `:${location.port}` : ""}/app/`;
})();

// ---------- Demo and training sandboxes ----------
// "Try the demo" and "Training" run the app on practice data kept in this browser only: nothing reaches a church's
// real data, no money moves, and Reset starts over. They open with ?demo or ?training and stay on until Exit
// (see 73-sandbox.js). Each keeps its own copy, apart from the live app's.
const SANDBOX_KEY = "our-faithful-sandbox";
const SANDBOX = (() => {
  try {
    const q = new URLSearchParams(location.search), want = q.has("demo") ? "demo" : q.has("training") ? "training" : "";
    if (want && !FORWARDING) {
      localStorage.setItem(SANDBOX_KEY, want);
      q.delete("demo"); q.delete("training");
      history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : "") + location.hash);
    }
    const mode = localStorage.getItem(SANDBOX_KEY);
    return mode === "demo" || mode === "training" ? mode : "";
  } catch { return ""; }
})();
if (SANDBOX) PLATFORM.storageKey = `${BASE_STORAGE_KEY}-sandbox-${SANDBOX}`;

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

// ---------- Time zones ----------
// Every date and time in the app is the church's: a church has a time zone (Admin, Church details), and a campus in
// another zone can have its own. Moments (an event's start, a gift, a check-in) are saved as UTC ISO strings; calendar
// days are "YYYY-MM-DD" and clock times "HH:MM", both read in the church's zone. Nothing reads the phone's own zone
// except to say "your time" when it differs. Use these helpers, never Date's getHours/getDate/setHours and friends.
const DEVICE_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
const _tzOk = new Map();
const validTz = (z) => {
  if (!z || typeof z !== "string") return false;
  if (!_tzOk.has(z)) { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); _tzOk.set(z, true); } catch { _tzOk.set(z, false); } }
  return _tzOk.get(z);
};
/** The zone for a location (by id), or, with no id, for whatever this screen is about: the paired device's location,
 *  else the campus the person picked, else the church. Falls back to the phone's zone if the church hasn't set one. */
let TZ_OVERRIDE = null;
/** Runs fn with every default zone set to z (used to build the demo churches' data on their own clock). */
const withZone = (z, fn) => { const o = TZ_OVERRIDE; TZ_OVERRIDE = z; try { return fn(); } finally { TZ_OVERRIDE = o; } };
function tz(locId) {
  if (TZ_OVERRIDE && locId === undefined) return TZ_OVERRIDE;
  try {
    const c = typeof S !== "undefined" && S.state && S.church?.();
    if (!c) return DEVICE_TZ;
    let id = locId;
    if (id === undefined) id = (typeof thisDevice === "function" && thisDevice()?.locationId) || S.campus?.();
    const l = id && id !== "all" ? (c.locations || []).find((x) => x.id === id) : null;
    return validTz(l?.timeZone) ? l.timeZone : validTz(c.timeZone) ? c.timeZone : DEVICE_TZ;
  } catch { return DEVICE_TZ; }
}
/** A church's own zone, for a church that may not be the current one (the church list, a public page). */
const churchTz = (c) => (validTz(c?.timeZone) ? c.timeZone : DEVICE_TZ);
/** The zone for something that may belong to a campus (a service plan, event, class, booking). */
const tzOf = (item) => tz(item?.locationId || null);
const _zfmt = new Map();
const zoneFormatter = (z, key, opts) => {
  const k = `${z}|${key}`;
  if (!_zfmt.has(k)) _zfmt.set(k, new Intl.DateTimeFormat("en-US", { timeZone: z, ...opts }));
  return _zfmt.get(k);
};
const WD3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** The wall-clock parts of a moment in a zone: { y, mo (1-12), d, h, mi, s, dow (0 = Sunday) }. */
function zp(d, z = tz()) {
  const t = new Date(d);
  if (isNaN(t)) return { y: NaN, mo: NaN, d: NaN, h: NaN, mi: NaN, s: NaN, dow: NaN };
  const o = {};
  for (const p of zoneFormatter(z, "parts", { hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", weekday: "short" }).formatToParts(t)) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, dow: WD3.indexOf(o.weekday) };
}
/** How far the zone's clock is ahead of UTC at that moment, in ms. */
function zoneOffset(d, z = tz()) {
  const t = Math.floor(new Date(d).getTime() / 1000) * 1000, p = zp(t, z);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t;
}
/** The moment a zone's clock reads y-mo-d h:mi. Days and months may overflow (d = 32 is next month's 1st).
 *  A time skipped by a clock change lands just after it; a repeated one takes the first. */
function zDate(y, mo, d, h = 0, mi = 0, z = tz()) {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (isNaN(wall)) return new Date(NaN);
  const a = wall - zoneOffset(wall, z), b = wall - zoneOffset(a, z);
  if (a === b) return new Date(a);
  const fits = [a, b].filter((t) => t + zoneOffset(t, z) === wall);
  return new Date(fits.length ? Math.min(...fits) : Math.max(a, b));
}
const pad2 = (n) => String(n).padStart(2, "0");
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoOf = (y, mo, d) => new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);   // normalizes overflow
const isoParts = (s) => String(s).slice(0, 10).split("-").map(Number);
/** Calendar arithmetic on "YYYY-MM-DD" strings, with no zone involved. */
const isoAdd = (s, n) => { const [y, m, d] = isoParts(s); return isoOf(y, m, d + n); };
const isoAddMonths = (s, n) => { const [y, m] = isoParts(s); return isoOf(y, m + n, 1); };
const isoDow = (s) => { const [y, m, d] = isoParts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const daysInMonth = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
const isoWeekStart = (s) => isoAdd(s, -isoDow(s));   // the Sunday of that week
/** The church's calendar day for a moment ("YYYY-MM-DD"). A "YYYY-MM-DD" string is already a day and comes back as is. */
const _isoDayCache = new Map();
const isoDay = (d, z = tz()) => {
  if (typeof d === "string") {
    if (ISO_DAY.test(d)) return d;
    if (!d) return "";
    const k = `${z}|${d}`, hit = _isoDayCache.get(k);
    if (hit !== undefined) return hit;
    if (_isoDayCache.size > 20000) _isoDayCache.clear();
    const v = isoDay(new Date(d), z); _isoDayCache.set(k, v); return v;
  }
  const p = zp(d, z); return isNaN(p.y) ? "" : `${p.y}-${pad2(p.mo)}-${pad2(p.d)}`;
};
/** The church's year (and month, 1-12) for a moment or a "YYYY-MM-DD" day. */
const yearOf = (d = new Date(), z = tz()) => +isoDay(d, z).slice(0, 4);
const monthOf = (d = new Date(), z = tz()) => +isoDay(d, z).slice(5, 7);
/** The church's month for a moment: "YYYY-MM". */
const isoMonth = (d, z = tz()) => isoDay(d, z).slice(0, 7);
const today = (z = tz()) => isoDay(new Date(), z);
/** The moment a calendar day (and optional "HH:MM") begins in the church's zone. */
function fromIsoDay(s, hhmm = "00:00", z = tz()) {
  if (!s) return new Date(NaN);
  const day = String(s).length > 10 ? isoDay(s, z) : String(s);
  const [y, m, d] = isoParts(day), [h, mi] = String(hhmm || "00:00").split(":").map(Number);
  return zDate(y, m, d, h || 0, mi || 0, z);
}
const startOfDay = (d, z = tz()) => fromIsoDay(isoDay(d, z), "00:00", z);
/** The same clock time `n` calendar days later (or months, with addMonths), in the church's zone. */
const addDays = (d, n, z = tz()) => { const p = zp(d, z); return zDate(p.y, p.mo, p.d + n, p.h, p.mi, z); };
const addMonths = (d, n, z = tz()) => { const p = zp(d, z), t = new Date(Date.UTC(p.y, p.mo - 1 + n, 1)), y = t.getUTCFullYear(), mo = t.getUTCMonth() + 1; return zDate(y, mo, Math.min(p.d, daysInMonth(y, mo)), p.h, p.mi, z); };
/** "HH:MM" of a moment, on the church's clock. */
const hhmmOf = (d, z = tz()) => { const p = zp(d, z); return `${pad2(p.h)}:${pad2(p.mi)}`; };
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
/** Is the phone's clock different from the zone's at that moment? Then times get a zone label. */
const tzDiffers = (d = new Date(), z = tz()) => z !== DEVICE_TZ && zoneOffset(d, z) !== zoneOffset(d, DEVICE_TZ);
/** A short name for the zone at that moment: "ET", "PT", "CT" where the browser knows one, else "EST" or "GMT+1". */
function tzLabel(d = new Date(), z = tz()) {
  const t = new Date(d); if (isNaN(t)) return "";
  for (const style of ["shortGeneric", "short"]) {
    try {
      const n = zoneFormatter(z, `name-${style}`, { timeZoneName: style }).formatToParts(t).find((p) => p.type === "timeZoneName")?.value;
      if (n) return n;
    } catch { /* older browser without shortGeneric */ }
  }
  return z;
}
/** A zone's long name, for settings: "Eastern Time (New York)". */
function tzLongName(z, d = new Date()) {
  let n = "";
  try { n = new Intl.DateTimeFormat(appLocale(), { timeZone: z, timeZoneName: "longGeneric" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value || ""; } catch { /* no longGeneric */ }
  const city = String(z).split("/").pop().replace(/_/g, " ");
  return n && !/^GMT/.test(n) ? `${n} (${city})` : `${city} (${tzLabel(d, z)})`;
}
const fmt = (d, o, z = tz()) => { const t = typeof d === "string" && ISO_DAY.test(d) ? fromIsoDay(d, "12:00", z) : new Date(d); return isNaN(t) ? "" : t.toLocaleDateString(appLocale(), { ...o, timeZone: z }); };
const fmtDay = (d, z = tz()) => fmt(d, { weekday: "long", month: "long", day: "numeric" }, z);
const fmtShort = (d, z = tz()) => fmt(d, { month: "short", day: "numeric", year: zp(typeof d === "string" && ISO_DAY.test(d) ? fromIsoDay(d, "12:00", z) : d, z).y !== zp(new Date(), z).y ? "numeric" : undefined }, z);
/** A clock time with no zone label, for screens at the church (slides, clocks) where the label would be noise. */
const fmtClock = (d, z = tz()) => { const t = new Date(d); return isNaN(t) ? "" : t.toLocaleTimeString(appLocale(), { hour: "numeric", minute: "2-digit", timeZone: z }); };
/** A clock time in the church's zone, labeled ("9:00 AM ET") when the phone is somewhere else. */
const fmtTime = (d, z = tz()) => { const s = fmtClock(d, z); return s && tzDiffers(d, z) ? `${s} ${tzLabel(d, z)}` : s; };
const fmtWhen = (d, z = tz()) => `${fmt(d, { weekday: "short", month: "short", day: "numeric" }, z)}, ${fmtTime(d, z)}`;
const fmtMonth = (d, z = tz()) => fmt(d, { month: "short" }, z);
const dayNum = (d, z = tz()) => (typeof d === "string" && ISO_DAY.test(d) ? isoParts(d)[2] : zp(d, z).d);
/** " (6:00 AM your time)" when the phone's zone differs, else "". Adds the day too when it falls on a different one. */
function yourTime(d, z = tz()) {
  const t = new Date(d);
  if (isNaN(t) || !tzDiffers(t, z)) return "";
  const sameDay = isoDay(t, z) === isoDay(t, DEVICE_TZ), es = lang() === "es";
  const when = sameDay ? fmtClock(t, DEVICE_TZ) : `${fmt(t, { weekday: "short" }, DEVICE_TZ)} ${fmtClock(t, DEVICE_TZ)}`;
  return es ? ` (${when}, tu hora)` : ` (${when} your time)`;
}
const COMMON_TZ = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "America/Puerto_Rico", "America/Halifax", "America/Toronto", "America/Winnipeg", "America/Edmonton", "America/Vancouver", "America/Mexico_City",
  "Europe/London", "Europe/Berlin", "Africa/Lagos", "Africa/Nairobi", "Asia/Manila", "Asia/Seoul", "Australia/Sydney"];
const allTimeZones = () => { try { return Intl.supportedValuesOf("timeZone"); } catch { return COMMON_TZ; } };
/** A <select> of time zones. `inherit` adds a first option that means "use the church's zone" (value ""). */
function tzSelect(name, value, { inherit = "", label = "Time zone", hint = "" } = {}) {
  const now = new Date(), cur = value && !COMMON_TZ.includes(value) && validTz(value) ? [value] : [];
  const opt = (z) => html`<option value="${z}" ${attr(z === value, "selected")}>${tzLongName(z, now)}</option>`;
  const rest = allTimeZones().filter((z) => !COMMON_TZ.includes(z) && !cur.includes(z));
  return html`<label class="field"><span>${label}</span><select name="${name}" data-tz-select>
      ${inherit ? html`<option value="" ${attr(!value, "selected")}>${inherit}</option>` : ""}
      <optgroup label="Common">${[...cur, ...COMMON_TZ].map(opt)}</optgroup>
      <optgroup label="All time zones">${rest.map((z) => html`<option value="${z}">${z.replace(/_/g, " ")}</option>`)}</optgroup>
    </select>${hint ? html`<small>${hint}</small>` : ""}</label>`;
}
/** A church clock time ("09:00") as "9:00 AM", labeled when the phone is in another zone. `day` anchors it for the label. */
function timeLabel(hhmm, z = tz(), day) {
  if (!hhmm) return "";
  return fmtTime(fromIsoDay(day || today(z), hhmm, z), z);
}
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000, es = lang() === "es";
  if (s < 60) return es ? "justo ahora" : "just now";
  if (s < 3600) return es ? `hace ${Math.floor(s / 60)} min` : `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return es ? `hace ${Math.floor(s / 3600)} h` : `${Math.floor(s / 3600)} hr ago`;
  if (s < 7 * 86400) { const n = Math.floor(s / 86400); return es ? (n === 1 ? "ayer" : `hace ${n} días`) : n === 1 ? "yesterday" : `${n} days ago`; }
  return fmtShort(d);
}
/** Next occurrence of weekday `dow` at hh:mm, `weeks` weeks out (0 = this coming one, including today if still ahead). */
function nextWeekday(dow, hhmm, weeks = 0, from = new Date(), z = tz()) {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number), p = zp(from, z);
  let add = (dow - p.dow + 7) % 7;
  if (add === 0 && zDate(p.y, p.mo, p.d, h, m, z) < new Date(from)) add = 7;
  return zDate(p.y, p.mo, p.d + add + weeks * 7, h, m, z);
}
function ageFrom(birth) {
  if (!birth) return null;
  const [by, bm, bd] = isoParts(isoDay(birth)), [ny, nm, nd] = isoParts(today());
  let a = ny - by;
  if (nm < bm || (nm === bm && nd < bd)) a--;
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
const personColor = (seed) => { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 40% 34%)`; };   // dark enough for white initials on any hue

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
  ["Sunday", "present.rooms", "Present on any room's display, at any time"],
  ["Sunday", "checkin.station", "Run check-in and see room rosters"],
  ["Sunday", "checkin.events", "Check people in and out of events by scanning tickets"],
  ["Sunday", "qr.create", "Make QR codes"],
  ["Sunday", "schedule.teams", "Schedule volunteer teams"],
  ["Sunday", "manage.devices", "Digital signage, kiosks and church screens"],
  ["Managing", "manage.content", "Announcements and events"],
  ["Managing", "manage.sermons", "Publish sermons and reading plans"],
  ["Managing", "manage.classes", "Create and schedule classes and groups"],
  ["Managing", "manage.prayer", "Moderate prayer and read connect cards"],
  ["Managing", "manage.people", "Members and the directory"],
  ["Managing", "manage.followup", "Follow up with new people"],
  ["Managing", "view.reports", "Attendance and new-people reports"],
  ["Managing", "view.giving", "Giving reports and funds"],
  ["Managing", "count.offering", "Count offerings: cash and checks in a counting batch, and verify someone else's count (no giving reports)"],
  ["Managing", "deposit.offering", "Record bank deposits for counted offerings (no giving reports)"],
  ["Managing", "manage.page", "Landing page, branding and links"],
  ["Managing", "manage.integrations", "Webhooks and embedded pages"],
  ["Managing", "manage.locations", "Campuses, locations and rooms"],
  ["Managing", "manage.roles", "Roles and who has them"],
  ["Managing", "manage.church", "Church account, features and defaults"],
  ["Managing", "send.email", "Email groups of people"],
  ["Managing", "take.payments", "Take cash and check payments for event tickets"],
  ["Managing", "send.texts", "Text groups of people (once the church turns texting on)"],
  ["Managing", "church.deactivate", "Ask to deactivate the church account (the primary account holder approves)"],
];
/** Privileges nobody gets by default, not even administrators, and that only the primary account holder can give a role. */
const PRIMARY_GRANTS = ["church.deactivate"];
const PERM_LABEL = Object.fromEntries(PERMS.map(([, k, l]) => [k, l]));
/** Permissions added after a church was created, and which built-in roles get them by default. */
const NEW_PERM_DEFAULTS = {
  "book.rooms": ["pastor", "staff", "teacher", "leader"], "schedule.teams": ["pastor", "staff", "media"],
  "manage.followup": ["pastor", "staff"], "view.reports": ["pastor", "staff"], "send.email": ["pastor", "staff"], "manage.devices": ["pastor", "staff", "media"],
  "present.rooms": ["pastor", "staff", "media"], "take.payments": ["pastor", "staff"], "send.texts": ["pastor", "staff"], "checkin.events": ["pastor", "staff"],
};
/** What each kind of signed-in church device may do. Devices never get a person's role. */
// A room display reads bookings ("rooms.view", a device-only permission) to know who has the room right now.
const DEVICE_PERMS = { kiosk: ["checkin.station", "use.checkin", "checkin.events"], gate: ["checkin.events"], signage: [], display: ["present"], room: ["present", "rooms.view"], stage: ["present"], overlay: ["present"], booth: ["present"], workstation: [] };
const mmss = (secs) => { const s = Math.max(0, Math.round(secs)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
/** Every feature a church can turn on or off: [key, name, what it is, group]. Groups organize Admin, Features. */
const MODULES = [
  ["sermons", "Sermons", "Messages with audio, video, notes and series", "Worship and teaching"],
  ["live", "Watch live", "Livestream, service recordings and audio playlists", "Worship and teaching"],
  ["podcast", "Podcasts", "A podcast feed of your sermons for Apple and Spotify", "Worship and teaching"],
  ["plans", "Reading plans", "Daily Bible reading plans", "Worship and teaching"],
  ["presentations", "Service plans and presenting", "Orders of service, songs, slides, stage display and booth", "Worship and teaching"],
  ["lessons", "Lesson, sermon and study builders", "Build sermons, Sunday school lessons and study guides", "Worship and teaching"],
  ["storylessons", "Lessons from Bible stories", "Start kids lessons from the Veritas Logos Family Library", "Worship and teaching"],
  ["kidsintro", "Veritas Logos Kids intro and credits", "Children's lessons open with the animated intro and their title, and close with credits", "Worship and teaching"],
  ["veritas", "Veritas Logos Bible links", "Links from passages to Veritas Logos study tools", "Worship and teaching"],
  ["events", "Events", "Calendar, registration and reminders", "Connect"],
  ["tickets", "Tickets and payments", "Paid events, tickets, payment kiosks and receipts", "Connect"],
  ["groups", "Small groups", "Groups people can find and join", "Connect"],
  ["classes", "Classes and Sunday school", "Classes, rosters and attendance", "Connect"],
  ["prayer", "Prayer wall", "Requests the church prays for", "Connect"],
  ["directory", "Directory", "Find and contact members", "Connect"],
  ["chat", "Chat", "Messages between members and groups", "Connect"],
  ["board", "Community board", "Posts, needs and offers from members", "Connect"],
  ["forms", "Forms and signups", "Registrations, surveys and signup forms", "Connect"],
  ["checkin", "Kids check-in", "Check-in stations, name tags and pickup codes", "Kids and families"],
  ["parents", "Parent portal", "What parents see about their kids", "Kids and families"],
  ["giving", "Giving", "Online giving, funds and campaigns", "Giving"],
  ["finance", "Treasurer", "Deposits, budgets and giving statements", "Giving"],
  ["volunteers", "Volunteer scheduling", "Teams, positions, schedules and blockout dates", "Serving and operations"],
  ["rooms", "Room booking", "Rooms, requests and approvals", "Serving and operations"],
  ["signage", "Digital signage", "Playlists for lobby and hallway screens", "Serving and operations"],
  ["media", "Media library", "Photos, videos and motion backgrounds for slides and screens", "Serving and operations"],
  ["visitors", "Visitor welcome and campus map", "Plan your visit page, first-visit cards, campus map and wayfinding", "Guests and safety"],
  ["safety", "Safety and security", "Security Command, alerts, drills, radio and reunification", "Guests and safety"],
];
/** The screens each feature owns. When a feature is off, its screens and the links to them go away. */
const FEATURE_ROUTES = {
  podcast: ["podcast"], presentations: ["services", "services-grid", "service", "songs", "presenter", "layouts", "hymns", "booth"],
  lessons: ["docs", "build", "lessonschurch", "storylesson", "storyplan"], storylessons: ["storylesson", "storyplan"],
  tickets: ["tickets", "ticket", "mytickets", "paykiosk", "paid"], board: ["board", "admin-boards"],
  forms: ["forms", "form", "formedit", "responses"], finance: ["treasurer", "offering"],
  volunteers: ["serving", "teams", "team", "crew", "schedule-blockouts", "schedule-calendar", "schedule-matrix"],
  rooms: ["rooms", "roompresent", "admin-rooms"], signage: ["signs", "signedit"], media: ["medialib", "graphics", "graphic"],
  visitors: ["visit", "map", "wayfind", "welcomeback", "admin-visitpage", "admin-map", "admin-welcome"],
  safety: ["security", "safety-status", "admin-security"],
  sermons: ["sermon", "listen"], plans: ["plans", "plan"], events: ["events", "event"], groups: ["groups"], classes: ["classes"],
  prayer: ["admin-prayer"], directory: ["directory"], chat: ["chat", "thread"], giving: ["give", "admin-giving", "admin-campaigns"],
  checkin: ["checkin", "kiosk", "admin-checkin"], parents: ["parents"], live: ["live"],
};
/** The feature that owns a route, like "services-plan" or "#admin-rooms", when it's turned off. */
function featureOffFor(route) {
  const r = String(route || "").replace(/^#/, "");
  if (!S.church()) return null;
  for (const [key, heads] of Object.entries(FEATURE_ROUTES)) {
    if (S.on(key)) continue;
    if (heads.some((h) => r === h || r.startsWith(h + "-"))) return key;
  }
  return null;
}

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
  /** Returns "1 I am the true vine... 2 ..." for a reference (without the verse numbers if numbered is false), or throws. */
  async text(ref, t = "BSB", numbered = true) {
    const r = parseRef(ref);
    if (!r) throw new Error("bad reference");
    const n = BOOKS.indexOf(r.book);
    const data = await this.load(t, n < 39 ? "ot" : "nt");
    const ch = data[n < 39 ? n : n - 39]?.[r.chapter - 1];
    if (!ch) throw new Error("no such chapter");
    const a = r.verse || 1, b = Math.min(r.verseEnd || (r.verse ? r.verse : ch.length), ch.length);
    if (a > ch.length) throw new Error("no such verse");
    const out = [];
    for (let v = a; v <= b; v++) out.push(numbered ? `${v} ${ch[v - 1]}` : ch[v - 1]);
    return out.join(" ");
  },
};

// ---------- Images (uploads are resized and kept as data URLs) ----------
function readImage(file, maxSide = 1400, quality = 0.82, { preserveTransparency = false, type = "" } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error("Choose an image file."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      const g = c.getContext("2d");
      const png = file.type === "image/png" || file.type === "image/svg+xml";
      if (!png && !preserveTransparency) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(type || (preserveTransparency ? "image/webp" : png ? "image/png" : "image/jpeg"), quality));
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
  print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7Z"/>',
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
  chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
  rec: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor"/>',
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
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  church: '<path d="M12 2.5v4M10 4.5h4M12 6.5 6 11v9.5h12V11Z"/><path d="M10 20.5v-4a2 2 0 0 1 4 0v4M3.5 20.5h17"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z"/><path d="M14.5 6.5v2M14.5 11v2M14.5 15.5v2"/>',
  printer: '<path d="M7 9V4.5h10V9"/><rect x="4" y="9" width="16" height="7.5" rx="1.5"/><path d="M7.5 14h9v6h-9z"/>',
  card: '<rect x="3" y="6" width="18" height="12.5" rx="2"/><path d="M3 10.5h18M7 15h3.5"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  screen: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20"/>',
  music: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5Z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  nfc: '<circle cx="5.5" cy="12" r="1.3"/><path d="M9 8.5a5 5 0 0 1 0 7"/><path d="M12.5 6a8.5 8.5 0 0 1 0 12"/><path d="M16 3.5a12 12 0 0 1 0 17"/>',
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
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  skipBack: '<path d="M11 5 7 8.5 11 12"/><path d="M7.5 8.5H12a6.5 6.5 0 1 1-5.8 9.5"/>',
  skipFwd: '<path d="m13 5 4 3.5L13 12"/><path d="M16.5 8.5H12a6.5 6.5 0 1 0 5.8 9.5"/>',
  cast: '<path d="M3 18.5a2.5 2.5 0 0 1 2.5 2.5M3 14.5a6.5 6.5 0 0 1 6.5 6.5M3 10.5a10.5 10.5 0 0 1 10.5 10.5"/><path d="M3 6.5V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2.5"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
};
const icon = (name, label) => raw(`<svg class="i" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${ICONS[name] || ""}</svg>`);
