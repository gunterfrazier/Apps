// ---------- Data store ----------
// Everything goes through S. Today it keeps data in this browser (localStorage), which is enough to try the app.
// To go live, swap load/save and the add/update/remove calls for a backend; supabase/schema.sql has the matching tables.

const PRIMARY_ROLE = { id: "primary", name: "Primary account holder", rank: 100, perms: Object.fromEntries(PERMS.map(([, k]) => [k, true])), builtin: true };

const S = {
  state: null,
  memory: null, // fallback when localStorage is unavailable

  load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(PLATFORM.storageKey) || "null"); } catch { saved = this.memory; }
    if (saved && saved.v === 2) {
      this.state = saved;
      // Added after the first v2 release: named layouts and saved builder items.
      const seed = buildSeed();
      for (const k of ["layouts", "savedBlocks", "teamMembers", "blockouts", "notifications"]) if (!saved[k]) saved[k] = seed[k];
      Object.values(saved.churches).forEach((c) => {
        c.positions ||= JSON.parse(JSON.stringify(DEFAULT_POSITIONS));
        // Give built-in roles the permissions added in later versions.
        c.roles.forEach((r) => PERMS.forEach(([, k]) => { if (r.perms[k] === undefined && (r.id === "admin" || NEW_PERM_DEFAULTS[k]?.includes(r.id))) r.perms[k] = true; }));
      });
      saved.services.forEach((p) => { if (!p.assignments) p.assignments = seed.services.find((x) => x.id === p.id)?.assignments || []; });
      return;
    }
    this.state = buildSeed();
    // Carry the person's profile and household over from the first version.
    try {
      const old = JSON.parse(localStorage.getItem("koinonia-v1") || "null");
      if (old?.me) Object.assign(this.state.me, { name: old.me.name || "", email: old.me.email || "", phone: old.me.phone || "", household: old.me.household || [] });
    } catch { /* nothing to carry over */ }
  },
  _timer: 0,
  save() { clearTimeout(this._timer); this._timer = setTimeout(() => this.flush(), 150); },
  flush() {
    clearTimeout(this._timer); this._timer = 0;
    const data = JSON.stringify(this.state);
    try { localStorage.setItem(PLATFORM.storageKey, data); }
    catch (e) {
      this.memory = JSON.parse(data);
      if (e && e.name === "QuotaExceededError") toast("This device is out of room. Remove some uploaded images.");
    }
  },
  reset() { const me = this.state.me; this.state = buildSeed(); this.state.me = { ...this.state.me, id: me.id }; this.save(); },

  // ----- people -----
  me() { return this.state.me; },
  user(id) { return id === this.state.me.id ? this.state.me : this.state.users[id] || null; },
  userName(id) { return this.user(id)?.name || "Someone"; },

  // ----- churches and membership -----
  church(id) { return this.state.churches[id || this.state.current] || null; },
  churches() { return Object.values(this.state.churches); },
  membership(cid = this.state.current, userId = this.state.me.id) { return this.state.memberships.find((m) => m.churchId === cid && m.userId === userId) || null; },
  members(cid = this.state.current) { return this.state.memberships.filter((m) => m.churchId === cid); },
  myChurches() { return this.state.memberships.filter((m) => m.userId === this.state.me.id).map((m) => this.state.churches[m.churchId]).filter(Boolean); },
  isMember(cid) { return !!this.membership(cid); },
  isPrimary(cid, userId = this.state.me.id) { return this.church(cid)?.ownerId === userId; },
  role(cid = this.state.current, userId = this.state.me.id) {
    if (this.isPrimary(cid, userId)) return PRIMARY_ROLE;
    const m = this.membership(cid, userId); if (!m) return null;
    const c = this.church(cid);
    return c.roles.find((r) => r.id === m.roleId) || c.roles.find((r) => r.id === c.defaults.roleId) || c.roles[c.roles.length - 1];
  },
  /** Can the viewer do this at the current church? */
  can(perm, cid) { const r = this.role(cid); return !!r && !!r.perms[perm]; },
  canAny(perms, cid) { return perms.some((p) => this.can(p, cid)); },
  /** Is this feature turned on for the church? */
  on(module, cid) { const c = this.church(cid); return !!c && c.modules?.[module] !== false; },
  setCurrent(id) { this.state.current = id; this.save(); },
  join(id) {
    const c = this.church(id);
    if (!this.membership(id)) {
      this.state.memberships.push({ churchId: id, userId: this.me().id, roleId: c.defaults.roleId, locations: [...(c.defaults.locations || [])], listed: !!c.defaults.listInDirectory, joined: new Date().toISOString() });
      this.state.current = id;
      emit("member.joined", { name: this.me().name, email: this.me().email }, id);
    }
    this.state.current = id; this.save();
  },
  leave(id) {
    if (this.isPrimary(id)) return false;
    this.state.memberships = this.state.memberships.filter((m) => !(m.churchId === id && m.userId === this.me().id));
    if (this.state.current === id) this.state.current = this.myChurches()[0]?.id || null;
    this.save(); return true;
  },
  createChurch(c) {
    let handle = slugify(c.handle || c.name).slice(0, 30) || "church";
    while (this.churches().some((x) => x.handle === handle)) handle = `${handle.replace(/-\d+$/, "")}-${Math.floor(Math.random() * 900 + 100)}`;
    const id = `${handle.slice(0, 20)}-${uid().slice(-4)}`;
    const church = seedChurch({ ...c, id, handle, ownerId: this.me().id });
    church.locations = (c.locations || []).map((l) => ({ ...l, id: `${id}-${slugify(l.code) || uid()}` }));
    this.state.churches[id] = church;
    this.state.memberships.push({ churchId: id, userId: this.me().id, roleId: "admin", locations: "all", listed: true, joined: new Date().toISOString() });
    this.state.current = id; this.save();
    return church;
  },
  updateChurch(patch) { Object.assign(this.church(), patch); this.save(); },

  // ----- locations -----
  locations(cid) { return this.church(cid)?.locations || []; },
  location(id, cid) { return this.locations(cid).find((l) => l.id === id) || null; },
  /** Locations this person can see: every public one, plus private ones they've been given. The primary sees all. */
  visibleLocations(cid = this.state.current) {
    const all = this.locations(cid);
    if (this.isPrimary(cid)) return all;
    const acc = this.membership(cid)?.locations;
    return all.filter((l) => l.visibility !== "private" || acc === "all" || (Array.isArray(acc) && acc.includes(l.id)));
  },
  campus(cid = this.state.current) { const v = this.state.campus[cid] || "all"; return v === "all" || this.visibleLocations(cid).some((l) => l.id === v) ? v : "all"; },
  setCampus(id) { this.state.campus[this.state.current] = id; this.save(); },
  /** Is a location-tagged item visible here? Church-wide items (no location) always are. */
  inScope(item, { ignoreCampus = false } = {}) {
    if (!item.locationId) return true;
    if (!this.visibleLocations().some((l) => l.id === item.locationId)) return !this.location(item.locationId); // deleted location: show
    const campus = this.campus();
    return ignoreCampus || campus === "all" || campus === item.locationId;
  },

  // ----- per-church records -----
  list(kind, churchId) { const cid = churchId || this.state.current; return (this.state[kind] || []).filter((x) => x.churchId === cid); },
  visible(kind, opts) { return this.list(kind).filter((x) => this.inScope(x, opts)); },
  get(kind, id) { return (this.state[kind] || []).find((x) => x.id === id) || null; },
  add(kind, rec) { const r = { id: uid(), churchId: this.state.current, ...rec }; this.state[kind].push(r); this.save(); return r; },
  update(kind, id, patch) { const r = this.get(kind, id); if (r) Object.assign(r, patch); this.save(); return r; },
  remove(kind, id) { this.state[kind] = this.state[kind].filter((x) => x.id !== id); this.save(); },
};

// ---------- In-app notifications ----------
/** Adds a notification for one person. Their bell shows it; on the live app it is also sent as a push notification. */
function notify(userId, n, churchId = S.state.current) {
  S.state.notifications.unshift({ id: uid(), churchId, userId, at: new Date().toISOString(), read: false, ...n });
  S.state.notifications = S.state.notifications.slice(0, 300); S.save();
}
const myNotifications = () => S.state.notifications.filter((n) => n.userId === S.me().id && n.churchId === S.state.current);

// ---------- Webhooks ----------
// Each event an admin subscribes to is signed (HMAC-SHA256 over "timestamp.body") and logged.
// Delivery happens from a server so the signing secret stays private; see README.
const WEBHOOK_EVENTS = [
  ["member.joined", "Someone joins the church"], ["card.created", "A connect card is sent"], ["prayer.created", "A prayer request is shared"],
  ["event.registered", "Someone signs up for an event"], ["gathering.registered", "Someone registers for a class or group"],
  ["gift.created", "A gift is made"], ["checkin.created", "A child is checked in"], ["checkin.completed", "A child is checked out"],
  ["volunteer.scheduled", "Someone is asked to serve"], ["volunteer.responded", "A volunteer accepts or declines"],
];
async function hmacHex(secret, text) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return "unsigned"; }
}
async function emit(event, data, churchId) {
  const c = S.church(churchId);
  const hooks = (c?.integrations?.webhooks || []).filter((h) => h.active && h.events.includes(event));
  for (const h of hooks) {
    const body = JSON.stringify({ id: uid(), event, church: { id: c.id, handle: c.handle }, at: new Date().toISOString(), data });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await hmacHex(h.secret, `${ts}.${body}`);
    S.state.deliveries.unshift({ id: uid(), churchId: c.id, webhookId: h.id, url: h.url, event, body, signature: `t=${ts},v1=${sig}`, at: new Date().toISOString(), status: "queued" });
  }
  if (hooks.length) { S.state.deliveries = S.state.deliveries.slice(0, 60); S.save(); }
}

// ---------- Services and schedules ----------
/** The next service occurrences across the locations in view, soonest first. A service counts as "live" for 90 minutes after it starts. */
function upcomingServices(church = S.church(), count = 4, locationId) {
  if (!church) return [];
  const now = new Date(), out = [];
  const campus = locationId || S.campus(church.id);
  const locs = S.visibleLocations(church.id).filter((l) => campus === "all" || l.id === campus);
  for (let w = 0; w < 3; w++) locs.forEach((l) => (l.services || []).forEach((s) => {
    const start = nextWeekday(s.day, s.time, w, new Date(now.getTime() - 90 * 60e3));
    if (start.getTime() + 90 * 60e3 > now.getTime()) out.push({ ...s, location: l, start, live: start <= now });
  }));
  const seen = new Set();
  return out.sort((a, b) => a.start - b.start).filter((x) => { const k = serviceKey(x); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, count);
}
const serviceKey = (svc) => `${isoDay(svc.start)}T${svc.time}@${svc.location?.id || ""}`;
const multiCampus = () => S.visibleLocations().length > 1;
const serviceName = (svc) => `${svc.label || "Service"}${multiCampus() && svc.location ? ` (${svc.location.name})` : ""}, ${fmt(svc.start, { weekday: "short", month: "short", day: "numeric" })} at ${fmtTime(svc.start)}`;

function upcomingEvents() {
  const now = Date.now();
  return S.visible("events").filter((e) => new Date(e.end) > now).sort((a, b) => new Date(a.start) - new Date(b.start));
}
const myRegistration = (e) => e.registrations.find((r) => r.by === S.me().id);
const registeredCount = (e) => e.registrations.reduce((n, r) => n + (r.count || 1), 0);
const sermonsSorted = () => S.visible("sermons").sort((a, b) => new Date(b.date) - new Date(a.date));
const newsSorted = () => S.visible("news").sort((a, b) => new Date(b.at) - new Date(a.at));
const unreadNews = () => newsSorted().filter((n) => !S.state.seen.includes(n.id));
const locName = (id) => S.location(id)?.name || "";
const placeText = (item) => [item.room || item.location, multiCampus() && item.locationId ? locName(item.locationId) : ""].filter(Boolean).join(", ");

function roomFor(church, birth) {
  const a = ageFrom(birth);
  if (a == null) return church.kidsRooms[0];
  return church.kidsRooms.find((r) => a >= r.minAge && a <= r.maxAge) || church.kidsRooms[church.kidsRooms.length - 1];
}
function planState(plan) { return S.state.progress[plan.id] || null; }
function nextPlanDay(plan) { const p = planState(plan); if (!p) return 0; const i = plan.days.findIndex((_, d) => !p.done.includes(d)); return i < 0 ? null : i; }
function securityCode() { const a = "ACDEFHJKLMNPRTUVWXY", n = "2346789"; const p = (s) => s[Math.floor(Math.random() * s.length)]; return p(a) + p(n) + p(a); }

// ---------- Classes and groups ----------
function nextMeeting(g, from = new Date()) {
  const s = g.schedule; if (!s) return null;
  if (s.kind === "once") { const d = fromIsoDay(s.date, s.time || "00:00"); const end = fromIsoDay(s.date, s.endTime || s.time || "23:59"); return end >= from ? d : null; }
  const start = s.startDate ? fromIsoDay(s.startDate) : null, end = s.endDate ? fromIsoDay(s.endDate, "23:59") : null;
  const base = new Date(Math.max(from.getTime() - 60 * 60e3, start ? start.getTime() : 0));
  const options = (s.days || []).map((d) => nextWeekday(d, s.time || "09:00", 0, base)).filter((d) => !end || d <= end).sort((a, b) => a - b);
  return options[0] || null;
}
function scheduleText(g) {
  const s = g.schedule; if (!s) return "";
  const span = s.endTime ? ` to ${timeLabel(s.endTime)}` : "";
  if (s.kind === "once") return `${fmtDay(fromIsoDay(s.date))}, ${timeLabel(s.time)}${span}`;
  const startsLater = s.startDate && fromIsoDay(s.startDate) > new Date();
  return `${dayNames(s.days || [])} at ${timeLabel(s.time)}${span}${startsLater ? `, starting ${fmtShort(fromIsoDay(s.startDate))}` : ""}${s.endDate ? `, through ${fmtShort(fromIsoDay(s.endDate))}` : ""}`;
}
const gCount = (g) => g.sampleCount + g.members.filter((m) => m.status === "in").length;
const gFull = (g) => g.capacity && gCount(g) >= g.capacity;
const myEntries = (g) => g.members.filter((m) => m.userId === S.me().id);
const isLeader = (g) => g.leaders.includes(S.me().id);
const isIn = (g) => isLeader(g) || g.members.some((m) => m.userId === S.me().id && !m.childId && m.status === "in");
const kidsIn = (g) => g.members.filter((m) => m.userId === S.me().id && m.childId && m.status === "in");
const gLabel = (g) => g.type === "class" ? "class" : "group";
