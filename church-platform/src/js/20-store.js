// ---------- Data store ----------
// Everything goes through S. Today it keeps data in this browser (localStorage), which is enough to try the app.
// To go live, swap load/save and the add/update/remove calls for a backend; supabase/schema.sql has the matching tables.

const PRIMARY_ROLE = { id: "primary", name: "Primary account holder", rank: 100, perms: Object.fromEntries(PERMS.map(([, k]) => [k, true])), builtin: true };

/**
 * Three-way merge of the saved data, for two tabs saving at once without a server. base: what this tab last read or
 * wrote; theirs: what another tab has saved since; mine: what this tab is about to save. Lists of records (anything with
 * an id) and maps (churches, users, prefs) merge entry by entry: a record only one side changed takes that side's
 * version, one only one side added is kept, and one deleted on one side is dropped unless the other side changed it.
 * When both sides changed the same record or value, this tab's (the newer save) wins.
 */
function mergeSaved(base, theirs, mine) {
  const str = (x) => (x === undefined ? "\u0000" : JSON.stringify(x));
  const plain = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const records = (a) => Array.isArray(a) && a.every((x) => plain(x) && x.id != null);
  const pick = (b, t, m) => (str(m) === str(b) ? t : m); // a record both have: theirs if I didn't touch it, else mine
  const list = (b, t, m) => {
    const B = new Map(b.map((x) => [x.id, x])), T = new Map(t.map((x) => [x.id, x])), M = new Map(m.map((x) => [x.id, x]));
    const out = [];
    const keep = (id) => {
      const inB = B.has(id), inT = T.has(id), inM = M.has(id);
      if (inT && inM) return pick(B.get(id), T.get(id), M.get(id));
      if (inM) return !inB || str(M.get(id)) !== str(B.get(id)) ? M.get(id) : undefined; // they deleted it: gone, unless I changed it
      if (inT) return !inB || str(T.get(id)) !== str(B.get(id)) ? T.get(id) : undefined; // I deleted it: gone, unless they changed it
      return undefined;
    };
    t.forEach((x) => { const r = keep(x.id); if (r !== undefined) out.push(r); });
    m.forEach((x) => { if (!T.has(x.id)) { const r = keep(x.id); if (r !== undefined) out.push(r); } });
    return out;
  };
  const entry = (b, t, m, depth) => {
    if (str(m) === str(b)) return t;
    if (str(t) === str(b) || str(t) === str(m)) return m;
    if (records(b ?? []) && records(t) && records(m)) return list(b ?? [], t, m);
    if (depth < 2 && plain(t) && plain(m)) { // the whole saved file (depth 0), and maps such as churches and users (depth 1)
      const o = {}, bb = plain(b) ? b : {};
      new Set([...Object.keys(t), ...Object.keys(m)]).forEach((k) => {
        const inT = k in t, inM = k in m;
        const v = inT && inM ? entry(bb[k], t[k], m[k], depth + 1)
          : inM ? (!(k in bb) || str(m[k]) !== str(bb[k]) ? m[k] : undefined)
            : (!(k in bb) || str(t[k]) !== str(bb[k]) ? t[k] : undefined);
        if (v !== undefined) o[k] = v;
      });
      return o;
    }
    return m;
  };
  return entry(base, theirs, mine, 0);
}

const S = {
  state: null,
  _seen: null, // the saved text as this tab last read or wrote it, to notice another tab's save
  _rev: null, // its version
  _othersSaved: false, // another tab saved since this one last read: check before writing
  memory: null, // fallback when localStorage is unavailable

  load() {
    let saved = null;
    try { this._seen = localStorage.getItem(PLATFORM.storageKey); saved = JSON.parse(this._seen || "null"); this._rev = saved?._rev || null; this.remember(this._rev, this._seen); } catch { saved = this.memory; this._seen = null; }
    // A demo or training session (or the preview) on older sample data starts over on the newest, so it shows every
    // feature. You stay you; a practice copy of a real church and the live app are never rebuilt.
    if (saved && saved.v === 2 && (saved.seedVersion || 0) < SEED_VERSION && !saved.sandbox?.copyOf && !Backend.configured()
      && (SANDBOX || Object.values(saved.churches || {}).some((c) => c.sample))) {
      const fresh = buildSeed();
      fresh.me = { ...fresh.me, id: saved.me.id, name: saved.me.name, email: saved.me.email, phone: saved.me.phone };
      fresh.prefs = saved.prefs; fresh.refreshed = { from: saved.seedVersion || 0, to: SEED_VERSION };
      if (!SANDBOX && saved.current) { const m = saved.memberships.find((x) => x.userId === saved.me.id && x.churchId === saved.current); if (m && fresh.churches[saved.current]) { fresh.memberships.push(m); fresh.current = saved.current; } }
      saved = fresh;
    }
    if (saved && saved.v === 2) {
      this.state = saved;
      // Added after the first v2 release: named layouts and saved builder items.
      const seed = buildSeed();
      for (const k of ["layouts", "savedBlocks", "teamMembers", "blockouts", "notifications", "attendance", "followups", "forms", "formResponses", "bookings", "devices", "signage", "roomSessions", "presence", "milestones", "campaigns", "pledges", "activity", "customReports", "reportRuns", "ticketPayments", "eventCheckins"]) if (!saved[k]) saved[k] = seed[k];
      saved.me.pickups ||= []; saved.verseNotes ||= {}; saved.highlights ||= {};
      Object.values(seed.users).forEach((u) => { const mine = saved.users[u.id]; if (!mine) { if (u.guestOf) saved.users[u.id] = u; } else if (!mine.family) Object.assign(mine, { family: u.family, pickups: u.pickups }); });
      Object.values(saved.churches).forEach((c) => {
        c.positions ||= JSON.parse(JSON.stringify(DEFAULT_POSITIONS));
        // The first sample landing page sent "Plan your visit" back to the church's own page.
        (c.landing?.blocks || []).forEach((b) => (b.links || []).forEach((l) => { if (l.url === `#church-${c.id}` && /visit/i.test(l.label)) l.url = "#visit"; }));
        // Give built-in roles the permissions added in later versions.
        c.roles.forEach((r) => PERMS.forEach(([, k]) => { if (r.perms[k] === undefined && !PRIMARY_GRANTS.includes(k) && (r.id === "admin" || NEW_PERM_DEFAULTS[k]?.includes(r.id))) r.perms[k] = true; }));
      });
      // Sample sheet music, added after the first demo.
      const bless = saved.songs?.find((x) => x.id === "riverside-song-assurance"); if (bless && !bless.charts) bless.charts = sampleCharts();
      // Demo photos, added after the first demo (sample church only).
      try { applyDemoPhotos(saved); } catch { /* keep the saved demo as it was */ }
      saved.services.forEach((p) => { if (!p.assignments) p.assignments = seed.services.find((x) => x.id === p.id)?.assignments || []; });
      return;
    }
    // With Supabase, start empty and let the server fill it in; sample churches are only for trying the app.
    if (Backend.configured()) { this.state = blankState(); return; }
    this.state = buildSeed();
    // Test data saved under the app's old working name: clear it so it doesn't use up the browser's storage.
    try { Object.keys(localStorage).filter((k) => k.startsWith("koinonia-")).forEach((k) => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
  },
  _timer: 0,
  save() { clearTimeout(this._timer); this._timer = setTimeout(() => this.flush(), 150); },
  flush(skipSync) {
    clearTimeout(this._timer); this._timer = 0;
    if (!skipSync && typeof Backend !== "undefined" && Backend.on) Backend.sync();
    // Live security messages stay on the server and in the signed-in session.
    const own = typeof wsDemo !== "undefined" && wsDemo ? { ...this.state, me: wsDemo.orig } : this.state;   // see 72i-workstation.js
    const cached = Backend.configured() ? { ...own, securityRadioMessages: [], securityDoorChecks: [],
      notifications: own.notifications.filter((n) => n.kind !== "security-radio") } : own;
    // Without a server, every tab of the app (the booth's display windows included) shares this one copy. Each save
    // records its version (_rev) and the version it was based on (_parent). If another tab saved since this one last read
    // or wrote, merge instead of writing over their changes (mergeSaved, below).
    let out = cached, parent = this._rev;
    // Only after the browser said another tab saved (the storage event): a tab on its own saves just as before.
    if (!Backend.configured() && this._seen != null && this._othersSaved) {
      this._othersSaved = false;
      try {
        const now = localStorage.getItem(PLATFORM.storageKey);
        if (now && now !== this._seen) {
          const theirs = JSON.parse(now), merged = mergeSaved(this.ancestor(theirs), theirs, cached);
          out = merged; parent = theirs._rev || null;
          if (JSON.stringify(merged) !== JSON.stringify(cached)) {
            this.state = merged;
            if (typeof wsAfterLoad === "function") wsAfterLoad();
            const busy = document.getElementById("scrim") || document.activeElement?.matches?.("input, textarea, select, [contenteditable]");
            if (!busy && typeof render === "function") setTimeout(render);
          }
        }
      } catch { /* unreadable: save this tab's copy as before */ }
    }
    const rev = uid();
    const data = JSON.stringify({ ...out, _rev: rev, _parent: parent });
    try { localStorage.setItem(PLATFORM.storageKey, data); this._seen = data; this._rev = rev; this.remember(rev, data); }
    catch (e) {
      this.memory = JSON.parse(data);
      if (e && e.name === "QuotaExceededError") toast("This device is out of room. Remove some uploaded images.");
    }
  },
  // The last few versions this tab read or wrote, to find what two tabs' saves have in common.
  _revs: new Map(),
  remember(rev, text) { if (!rev || !text) return; this._revs.delete(rev); this._revs.set(rev, text); while (this._revs.size > 4) this._revs.delete(this._revs.keys().next().value); },
  /** What this tab and theirs both started from: this tab's last version if theirs was based on it, else the version
   *  theirs was based on if this tab saw it, else nothing known (then the merge keeps everything either side has). */
  ancestor(theirs) {
    const text = theirs._parent && theirs._parent === this._rev ? this._seen : this._revs.get(theirs._parent);
    return text ? JSON.parse(text) : null;
  },
  /** Another tab saved (the storage event). Take it as it is if it was based on this tab's last version; if it was
   *  saved without seeing that (browsers pass changes between tabs a moment late), merge so nothing this tab added is
   *  lost, and save the merge for the other tab to pick up. Returns false when there's nothing new. */
  incoming() {
    const now = localStorage.getItem(PLATFORM.storageKey);
    if (!now || now === this._seen) return false;
    let theirs; try { theirs = JSON.parse(now); } catch { return false; }
    if (!Backend.configured() && this._seen && theirs._parent !== this._rev && theirs._rev !== this._rev) {
      try {
        const mine = JSON.parse(this._seen), merged = mergeSaved(this.ancestor(theirs), theirs, mine);
        if (JSON.stringify(merged) !== JSON.stringify(theirs)) {
          const rev = uid(), data = JSON.stringify({ ...merged, _rev: rev, _parent: theirs._rev || null });
          localStorage.setItem(PLATFORM.storageKey, data); this.remember(theirs._rev, now);
        }
      } catch { /* fall back to taking theirs */ }
    }
    this.remember(theirs._rev, now);
    this.load(); this._othersSaved = false;
    return true;
  },
  reset() { const me = this.state.me; this.state = buildSeed(); this.state.me = { ...this.state.me, id: me.id }; this.save(); },

  // ----- people -----
  me() { return this.state.me; },
  user(id) { return id === this.state.me.id ? this.state.me : this.state.users[id] || null; },
  userName(id) { return this.user(id)?.name || "Someone"; },

  // ----- churches and membership -----
  /** A deactivated church account (see 78-deactivate.js). A training church goes quiet with the church it belongs to. */
  deactivated(c) { return !!c && (c.deactivation?.status === "deactivated" || (!!c.training?.of && this.state.churches[c.training.of]?.deactivation?.status === "deactivated")); },
  /** Deactivated means gone for everyone but the primary account holder, who can bring it back. */
  hidden(c) { return this.deactivated(c) && !(c.deactivation?.status === "deactivated" && c.ownerId === this.state.me.id); },
  church(id) { const c = this.state.churches[id || this.state.current] || null; return c && this.hidden(c) ? null : c; },
  churches() { return Object.values(this.state.churches).filter((c) => !this.hidden(c)); },
  membership(cid = this.state.current, userId = this.state.me.id) { return this.state.memberships.find((m) => m.churchId === cid && m.userId === userId) || null; },
  /** People at a church. Signed-in screens and kiosks have memberships too, but they aren't people. */
  members(cid = this.state.current) { return this.state.memberships.filter((m) => m.churchId === cid && !String(m.roleId || "").startsWith("device:")); },
  myChurches() { return this.state.memberships.filter((m) => m.userId === this.state.me.id).map((m) => this.church(m.churchId)).filter(Boolean); },
  isMember(cid) { return !!this.membership(cid); },
  isPrimary(cid, userId = this.state.me.id) { return this.church(cid)?.ownerId === userId; },
  role(cid = this.state.current, userId = this.state.me.id) {
    if (this.isPrimary(cid, userId)) return PRIMARY_ROLE;
    const m = this.membership(cid, userId); if (!m) return null;
    const c = this.church(cid);
    if (String(m.roleId || "").startsWith("device:")) { const t = m.roleId.slice(7); return { id: m.roleId, name: DEVICE_TYPES[t]?.[0] || "Device", rank: 5, perms: Object.fromEntries((DEVICE_PERMS[t] || []).map((p) => [p, true])) }; }
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
      startFollowup({ personId: this.me().id, name: this.me().name, email: this.me().email, phone: this.me().phone, source: "joined", reason: "Joined the church in the app" });
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
  const mine = userId === S.me().id;
  if (mine && !wantsNotify(n)) return;
  const rec = { id: uid(), churchId, userId, at: new Date().toISOString(), read: false, ...n };
  S.state.notifications.unshift(rec);
  S.state.notifications = S.state.notifications.slice(0, 600); S.save();
  if (mine) {
    ForegroundAlerts.show(rec);
    Push.local(rec);
  }
}
const myNotifications = () => S.state.notifications.filter((n) => n.userId === S.me().id && n.churchId === S.state.current);

// ---------- Webhooks ----------
// Each event an admin subscribes to is signed (HMAC-SHA256 over "timestamp.body") and logged.
// Delivery happens from a server so the signing secret stays private; see README.
// [event, what it means, group]. The groups are how the webhook form lists them.
const WEBHOOK_EVENTS = [
  ["news.created", "An announcement is posted", "News and events"], ["news.updated", "An announcement is changed", "News and events"], ["news.deleted", "An announcement is removed", "News and events"],
  ["event.created", "An event is added", "News and events"], ["event.updated", "An event is changed", "News and events"], ["event.deleted", "An event is removed", "News and events"],
  ["sermon.created", "A sermon is added", "News and events"], ["sermon.updated", "A sermon is changed", "News and events"],
  ["gathering.created", "A class or group is added", "News and events"], ["gathering.updated", "A class or group is changed", "News and events"], ["gathering.deleted", "A class or group is removed", "News and events"],
  ["member.joined", "Someone joins the church", "People"], ["member.left", "Someone leaves the church", "People"], ["card.created", "A connect card is sent", "People"],
  ["followup.created", "Someone new needs follow-up", "People"], ["form.submitted", "Someone fills in a form", "People"], ["email.sent", "A group email is sent", "People"],
  ["prayer.created", "A prayer request is shared", "Prayer"], ["prayer.answered", "A prayer is marked answered", "Prayer"],
  ["event.registered", "Someone signs up for an event", "Sign-ups and check-in"], ["gathering.registered", "Someone registers for a class or group", "Sign-ups and check-in"],
  ["checkin.created", "A child is checked in", "Sign-ups and check-in"], ["checkin.completed", "A child is checked out", "Sign-ups and check-in"], ["attendance.recorded", "Attendance is recorded for a service", "Sign-ups and check-in"],
  ["room.booked", "A room is booked or requested", "Sign-ups and check-in"],
  ["gift.created", "A gift is made", "Giving"], ["event.payment", "Someone pays for event tickets in person", "Giving"], ["pledge.made", "Someone pledges to a campaign", "Giving"],
  ["volunteer.scheduled", "Someone is asked to serve", "Volunteers"], ["volunteer.responded", "A volunteer accepts or declines", "Volunteers"],
  ["volunteer.requested", "Someone asks to join a volunteer team", "Volunteers"], ["volunteer.joined", "Someone joins a volunteer team", "Volunteers"],
];
/** News, events, sermons and classes: the events a website or social media account usually wants. */
const CONTENT_EVENTS = ["news.created", "news.updated", "event.created", "event.updated", "event.deleted", "sermon.created", "gathering.created"];
/** A one-line, readable description of an event, for chat apps (Slack, Discord, Teams) and social posts. */
function webhookSummary(event, d) {
  const when = d.start ? ` ${fmtShort(d.start)} at ${fmtTime(d.start)}` : "", where = d.location ? `, ${d.location}` : "";
  const [kind, act] = event.split("."), title = d.title || d.name || "";
  const what = { news: "announcement", event: "event", sermon: "sermon", gathering: d.type === "class" ? "class" : "group" }[kind];
  if (what && ["created", "updated", "deleted"].includes(act)) {
    const head = act === "created" ? `New ${what}: ${title}` : act === "updated" ? `Updated ${what}: ${title}` : `Removed ${what}: ${title}`;
    return [head + (kind === "event" && act !== "deleted" ? `,${when}${where}` : ""), act !== "deleted" ? String(d.body || d.description || "").slice(0, 500) : ""].filter(Boolean).join("\n");
  }
  const label = WEBHOOK_EVENTS.find((e) => e[0] === event)?.[1] || event;
  return `${label}${d.name ? `: ${d.name}` : title ? `: ${title}` : ""}`;
}
/** The shareable fields of a news item, event, sermon or class for a webhook: no people lists, uploads or private notes. */
function webhookItem(rec, extra = {}) {
  const out = {};
  for (const [k, v] of Object.entries(rec || {})) {
    if (/secret|token|private|notes?$|members|registr|churchId/i.test(k)) continue;
    if (["string", "number", "boolean"].includes(typeof v) && !(typeof v === "string" && (v.startsWith("data:") || v.length > 4000))) out[k] = v;
  }
  if (rec?.schedule) out.schedule = rec.schedule;
  return { ...out, ...extra };
}
async function hmacHex(secret, text) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch { return "unsigned"; }
}
/** A webhook can be limited to some locations. Events with no location (church-wide) always go. */
const hookPlaceOk = (h, d) => !h.locations?.length || !d?.locationId || h.locations.includes(d.locationId);
/** The body a webhook receives: the standard JSON, or a message in the shape Slack, Discord, Teams or Google Chat expects.
 *  Keep in step with supabase/functions/webhooks/index.ts. */
function hookBody(h, p) {
  const text = p.data?.summary || p.event, link = p.data?.link, line = link ? `${text}\n${link}` : text;
  switch (h.format) {
    case "slack": return { text: link ? `${text}\n<${link}|Open in the app>` : text };
    case "discord": return { content: line.slice(0, 2000), allowed_mentions: { parse: [] } };
    case "googlechat": return { text: line };
    case "teams": return { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
      body: [{ type: "TextBlock", text: p.church?.name || "", weight: "Bolder", size: "Small", isSubtle: true }, { type: "TextBlock", text, wrap: true }], ...(link ? { actions: [{ type: "Action.OpenUrl", title: "Open in the app", url: link }] } : {}) } }] };
    default: return p;
  }
}
async function emit(event, data, churchId) {
  const c = S.church(churchId);
  data = { ...data }; try { data.summary ||= webhookSummary(event, data); } catch { /* a summary is a nicety */ }
  try { if (c && c.id === S.state.current) logEvent(event, data); } catch { /* the log is never in the way */ }
  if (c?.training) return;   // a training church sends nothing to outside systems
  // With Supabase, the server signs and sends: the app only queues the event (see supabase/functions/webhooks).
  if (typeof Backend !== "undefined" && Backend.on) { if (c) { S.state.deliveries.unshift({ id: uid(), churchId: c.id, event, data, at: new Date().toISOString(), status: "queued", outbox: true }); S.save(); } return; }
  const hooks = (c?.integrations?.webhooks || []).filter((h) => h.active && h.events.includes(event) && hookPlaceOk(h, data));
  for (const h of hooks) {
    const body = JSON.stringify(hookBody(h, { id: uid(), event, church: { id: c.id, handle: c.handle, name: c.name }, at: new Date().toISOString(), data }));
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
    const z = tz(l.id), start = nextWeekday(s.day, s.time, w, new Date(now.getTime() - 90 * 60e3), z);
    if (start.getTime() + 90 * 60e3 > now.getTime()) out.push({ ...s, location: l, start, z, live: start <= now });
  }));
  const seen = new Set();
  return out.sort((a, b) => a.start - b.start).filter((x) => { const k = serviceKey(x); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, count);
}
const serviceKey = (svc) => `${isoDay(svc.start, svc.z || tz(svc.location?.id || null))}T${svc.time}@${svc.location?.id || ""}`;
const multiCampus = () => S.visibleLocations().length > 1;
const serviceName = (svc) => `${svc.label || "Service"}${multiCampus() && svc.location ? ` (${svc.location.name})` : ""}, ${fmt(svc.start, { weekday: "short", month: "short", day: "numeric" }, svc.z || tz(svc.location?.id || null))} at ${fmtTime(svc.start, svc.z || tz(svc.location?.id || null))}`;

function upcomingEvents() {
  const now = Date.now();
  return S.visible("events").filter((e) => new Date(e.end) > now).sort((a, b) => new Date(a.start) - new Date(b.start));
}
const myRegistration = (e) => e.registrations.find((r) => r.by === S.me().id);
// _count comes from the server for sign-ups other people can't see one by one.
const registeredCount = (e) => Math.max(e._count || 0, e.registrations.reduce((n, r) => n + (r.count || 1), 0));
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
  const z = tzOf(g);
  if (s.kind === "once") { const d = fromIsoDay(s.date, s.time || "00:00", z); const end = fromIsoDay(s.date, s.endTime || s.time || "23:59", z); return end >= from ? d : null; }
  const start = s.startDate ? fromIsoDay(s.startDate, "00:00", z) : null, end = s.endDate ? fromIsoDay(s.endDate, "23:59", z) : null;
  const base = new Date(Math.max(from.getTime() - 60 * 60e3, start ? start.getTime() : 0));
  const options = (s.days || []).map((d) => nextWeekday(d, s.time || "09:00", 0, base, z)).filter((d) => !end || d <= end).sort((a, b) => a - b);
  return options[0] || null;
}
function scheduleText(g) {
  const s = g.schedule; if (!s) return "";
  const z = tzOf(g), span = s.endTime ? ` to ${timeLabel(s.endTime, z, s.date)}` : "";
  if (s.kind === "once") return `${fmtDay(s.date, z)}, ${timeLabel(s.time, z, s.date)}${span}`;
  const startsLater = s.startDate && fromIsoDay(s.startDate, "00:00", z) > new Date();
  return `${dayNames(s.days || [])} at ${timeLabel(s.time, z)}${span}${startsLater ? `, starting ${fmtShort(s.startDate, z)}` : ""}${s.endDate ? `, through ${fmtShort(s.endDate, z)}` : ""}`;
}
const gCount = (g) => g.sampleCount + Math.max(g._count || 0, g.members.filter((m) => m.status === "in").length);
const gFull = (g) => g.capacity && gCount(g) >= g.capacity;
const myEntries = (g) => g.members.filter((m) => m.userId === S.me().id);
const isLeader = (g) => g.leaders.includes(S.me().id);
const isIn = (g) => isLeader(g) || g.members.some((m) => m.userId === S.me().id && !m.childId && m.status === "in");
const kidsIn = (g) => g.members.filter((m) => m.userId === S.me().id && m.childId && m.status === "in");
const gLabel = (g) => g.type === "class" ? "class" : "group";
