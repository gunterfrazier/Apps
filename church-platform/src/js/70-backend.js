// ---------- Supabase backend ----------
// When config.js names a Supabase project (and the app isn't in the preview), this takes over storage and sign-in.
// The rest of the app keeps using S exactly as before. This file:
//   1. signs people in with a code sent to their email,
//   2. pulls everything they're allowed to see into S.state (row-level security decides what that is),
//   3. after each save, works out which records changed and writes only those,
//   4. listens for other people's changes and presentation moves in real time.
// Tables are in supabase/schema.sql. Server functions (payments, push, AI, podcast) are in supabase/functions.

// ----- Church devices stay signed in -----
// A paired device keeps its own sign-in (the device-only account device-pair made for it) on the device. If its session
// is ever lost (a power cut while it was being renewed, storage cleared, a long time offline), it signs itself back in,
// so nobody has to type a new code. Removing the device under Screens and devices deletes that account, which ends it.
const DEVICE_SIGNIN = "our-faithful-device-signin";
const DeviceSignin = {
  get() { try { return JSON.parse(localStorage.getItem(DEVICE_SIGNIN) || "null"); } catch { return null; } },
  set(v) { try { localStorage.setItem(DEVICE_SIGNIN, JSON.stringify(v)); } catch {} },
  clear() { try { localStorage.removeItem(DEVICE_SIGNIN); } catch {} },
};
let pairNotice = "";

const Backend = {
  on: false, client: null, user: null, aiEnabled: true, ready: false, snap: new Map(), pending: false, warned: false, channel: null,
  configured() { return !IN_PREVIEW && !SANDBOX && !!PLATFORM.supabaseUrl && !!PLATFORM.supabasePublishableKey; },

  async start() {
    if (!this.configured()) return;
    this.on = true;
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
      this.client = createClient(PLATFORM.supabaseUrl, PLATFORM.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    } catch (e) { console.error("Supabase didn't load", e); this.failed = true; render(); return; }
    const { data } = await this.client.auth.getSession(); // also finishes a sign-in from an email link
    // A device sign-in saved here means this browser is a church device (it may have been paired from the demo or
    // training, see Forms.pair): its own account takes over from a person's session left in this browser.
    const cred = DeviceSignin.get();
    if (cred && data.session?.user && data.session.user.email !== cred.email) { try { await this.client.auth.signOut({ scope: "local" }); } catch {} data.session = null; }
    // An email link that didn't work comes back with an error in the address. Say what happened, and tidy the address.
    const back = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
    if (back.get("error") || back.get("error_description")) {
      signinNotice = { email: "", text: back.get("error_code") === "otp_expired" ? "That sign-in link has expired or was already used. Choose how to sign in to get a new one." : `Signing in from the email link didn't work (${back.get("error_description") || back.get("error")}). Choose how to sign in to try again.` };
      history.replaceState(null, "", location.pathname);
    } else if (/^#(access_token|refresh_token)=/.test(location.hash)) history.replaceState(null, "", location.pathname);
    this.client.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_OUT") {
        this.user = null; this.ready = false; this.synced = false; this.snap = new Map(); S.state = blankState(); S.flush();
        // A church device that lost its session signs itself back in (render shows that it's reconnecting).
        if (DeviceSignin.get()) render(); else go(pairNotice ? "pair" : "signin");
      } else if (session?.user && !this.user) { this.user = session.user; this.afterSignIn(); }
    });
    if (data.session?.user) { this.user = data.session.user; await this.afterSignIn(); }
    else render();
  },
  /** Runs once per sign-in, even if the sign-in event and the sign-in form both ask. */
  afterSignIn() {
    return this.starting ||= (async () => {
      try { await this.pull(); } catch (e) {
        console.error(e);
        // A church device keeps showing what it last had and tries again until the connection is back.
        if (DeviceSignin.get()) { const retry = () => this.pull().then(() => { this.subscribe(); render(); }).catch(() => setTimeout(retry, 30e3)); setTimeout(retry, 15e3); }
        else toast("Couldn't load your churches. Check your connection.");
      }
      this.ready = true; this.subscribe(); render();
      if (pendingRoute) { const r = pendingRoute; pendingRoute = null; go(r); }
    })().finally(() => { this.starting = null; });
  },
  async signOut() { await this.client?.auth.signOut(); },
  /** Signs a church device back in with the sign-in it saved when it was paired. Keeps trying while it's offline. */
  resumeDevice() {
    const cred = DeviceSignin.get();
    if (!cred || !this.client || this.user) return Promise.resolve(false);
    return this.resuming ||= (async () => {
      for (let wait = 5e3; ; wait = Math.min(wait * 2, 60e3)) {
        const { data, error } = await this.client.auth.signInWithPassword({ email: cred.email, password: cred.password }).catch((e) => ({ error: e }));
        if (!error && data?.user) { this.user = data.user; await this.afterSignIn(); return true; }
        // The device was removed (its account is gone) or paired again somewhere else: it needs a new code.
        if (error?.code === "invalid_credentials" || error?.status === 400) { DeviceSignin.clear(); pairNotice = "This screen was removed or set up again somewhere else. Ask a church admin for a new code."; go("pair"); render(); return false; }
        await new Promise((r) => setTimeout(r, wait));
        if (DeviceSignin.get()?.email !== cred.email) return false;
      }
    })().finally(() => { this.resuming = null; });
  },

  // ----- Reading -----
  async all(q) { const out = []; for (let from = 0; ; from += 1000) { const { data, error } = await q().range(from, from + 999); if (error) throw error; out.push(...data); if (data.length < 1000) return out; } },
  loaded: new Set(),
  /** Loads everything for the churches you belong to, plus the one you're looking at. */
  async pull(extra = S.state?.current) {
    // Send anything not saved yet first: loading replaces what's on this device, and a change made in the last
    // moment (a church just registered, an edit when someone else's update arrives) would otherwise be lost.
    if (this.synced) await this.push();
    const sb = this.client, uid = this.user.id;
    const [{ data: prof }, { data: priv }, { data: fam }] = await Promise.all([
      sb.from("profiles").select("*").eq("id", uid).maybeSingle(), sb.from("profile_private").select("*").eq("user_id", uid).maybeSingle(), sb.from("families").select("*").eq("user_id", uid).maybeSingle()]);
    const memberships = await this.all(() => sb.from("memberships").select("*"));
    const churches = await this.all(() => sb.from("churches").select("*").order("name"));
    const mine = [...new Set(memberships.filter((m) => m.user_id === uid).map((m) => m.church_id))];
    const look = extra && churches.some((c) => c.id === extra) ? extra : null;
    const ids = [...new Set([...mine, look].filter(Boolean))].concat(mine.length || look ? [] : ["-"]);
    this.loaded = new Set(ids);
    const [roles, locations, records, counts] = await Promise.all([
      this.all(() => sb.from("roles").select("*").in("church_id", ids)), this.all(() => sb.from("locations").select("*")),   // public locations of every church, for the directory and church pages
      this.all(() => sb.from("records").select("kind,id,church_id,location_id,owner,data").in("church_id", ids)),
      sb.rpc("child_counts", { churches: ids }).then((r) => r.data || [])]);
    const people = [...new Set(memberships.map((m) => m.user_id))];
    const [profiles, families, contacts] = people.length ? await Promise.all([this.all(() => sb.from("profiles").select("*").in("id", people)), this.all(() => sb.from("families").select("*").in("user_id", people)), this.all(() => sb.from("contacts").select("*").in("user_id", people))]) : [[], [], []];
    const contact = Object.fromEntries(contacts.map((x) => [x.user_id, x]));

    const st = blankState(), p = priv?.data || {};
    st.me = { id: uid, name: prof?.name || "", email: contact[uid]?.email || this.user.email || "", phone: contact[uid]?.phone || "", household: fam?.family || [], pickups: fam?.pickups || [] };
    if (p.training && !p.training.base) st.training = p.training;   // your training checklists, on every device
    Object.assign(st, { prefs: p.prefs || st.prefs, notes: p.notes || {}, verseNotes: p.verseNotes || {}, highlights: p.highlights || {}, saved: p.saved || [], progress: p.progress || {}, seen: p.seen || [], chatSeen: p.chatSeen || {}, reminded: p.reminded || [], campus: p.campus || {}, current: look || (p.current && mine.includes(p.current) ? p.current : mine[0] || null) });
    profiles.filter((x) => x.id !== uid).forEach((x) => { st.users[x.id] = { id: x.id, name: x.name, email: contact[x.id]?.email || "", phone: contact[x.id]?.phone || "", household: x.household || x.name, family: [], pickups: [] }; });
    families.forEach((f) => { if (st.users[f.user_id]) Object.assign(st.users[f.user_id], { family: f.family || [], pickups: f.pickups || [] }); });
    st.memberships = memberships.map((m) => ({ churchId: m.church_id, userId: m.user_id, roleId: m.role_key, locations: m.locations, listed: m.listed, joined: m.joined }));
    churches.forEach((c) => { st.churches[c.id] = { ...c.data, id: c.id, name: c.name, handle: c.handle, ownerId: c.owner_id, roles: [], locations: [] }; });
    roles.forEach((r) => st.churches[r.church_id]?.roles.push({ id: r.key, name: r.name, rank: r.rank, perms: r.perms, builtin: r.builtin }));
    locations.forEach((l) => st.churches[l.church_id]?.locations.push({ ...l.data, id: l.id, visibility: l.visibility }));
    Object.values(st.churches).forEach((c) => { c.roles.sort((a, b) => b.rank - a.rank); c.locations.sort((a, b) => (a.data?.order || 0) - (b.data?.order || 0)); });
    // Records: parents first, then the child rows (sign-ups, registrations, assignments) put back inside them.
    const kids = [];
    records.forEach((r) => {
      if (r.kind === "integrations") { if (st.churches[r.church_id]) st.churches[r.church_id].integrations = r.data; return; }
      if (r.kind === "guests") { st.users[r.id] = { ...r.data, id: r.id }; return; }
      const child = Object.entries(SPLIT).find(([, v]) => v.kind === r.kind);
      if (child) { kids.push([child[0], r]); return; }
      const kind = r.kind === "outlines" ? "docs" : r.kind;
      if (!st[kind]) return;
      if (r.kind === "outlines" && records.some((x) => x.kind === "docs" && x.id === r.id)) return;
      st[kind].push({ ...r.data, id: r.id, churchId: r.church_id });
    });
    kids.forEach(([kind, r]) => {
      const spec = SPLIT[kind]; let parent = st[kind].find((x) => x.id === r.data._parent);
      if (!parent && spec.stub && r.data._stub) { parent = { ...r.data._stub, id: r.data._parent, churchId: r.church_id, _stubOnly: true, [spec.field]: [] }; st[kind].push(parent); }
      if (parent) { parent[spec.field] ||= []; const { _parent, _stub, ...item } = r.data; parent[spec.field].push(item); }
    });
    counts.forEach((c) => { const x = st[c.kind]?.find((r) => r.id === c.parent); if (x) x._count = c.n; });
    for (const [kind, spec] of Object.entries(SPLIT)) st[kind].forEach((x) => { x[spec.field] ||= []; });
    S.state = st; S.flush(true);
    this.snap = new Map(this.rows().map((r) => [r.key, r.json])); this.synced = true;
  },
  /** Sends local changes now, waiting for a send already under way. */
  async push() {
    clearTimeout(this.timer);
    for (let i = 0; this.pushing && i < 200; i++) await new Promise((r) => setTimeout(r, 50));
    await this.flush();
  },

  // ----- Writing: only what changed since the last pull or sync -----
  rows() {
    const st = S.state, uid = this.user?.id, out = [];
    const row = (table, key, value) => out.push({ table, key: `${table}:${key}`, value, json: JSON.stringify(value) });
    if (!uid) return out;
    const me = st.me, { household, pickups, id, ...meRest } = me;
    row("profiles", uid, { id: uid, name: meRest.name, household: `${meRest.name}${household.length ? " and family" : ""}` });
    row("contacts", uid, { user_id: uid, email: meRest.email, phone: meRest.phone });
    row("families", uid, { user_id: uid, family: household, pickups: pickups || [] });
    row("profile_private", uid, { user_id: uid, data: { prefs: st.prefs, notes: st.notes, verseNotes: st.verseNotes || {}, highlights: st.highlights || {}, saved: st.saved, progress: st.progress, seen: st.seen, chatSeen: st.chatSeen, reminded: st.reminded, campus: st.campus, current: st.current, training: st.training || null } });
    st.memberships.forEach((m) => row("memberships", `${m.churchId}|${m.userId}`, { church_id: m.churchId, user_id: m.userId, role_key: m.roleId, locations: m.locations, listed: !!m.listed, joined: m.joined }));
    Object.values(st.churches).forEach((c) => {
      const { roles, locations, integrations, ownerId, previousOwner, ...data } = c;
      row("churches", c.id, { id: c.id, owner_id: ownerId, name: c.name, handle: c.handle, data });
      (roles || []).forEach((r) => row("roles", `${c.id}|${r.id}`, { church_id: c.id, key: r.id, name: r.name, rank: r.rank, perms: r.perms, builtin: !!r.builtin }));
      (locations || []).forEach((l, i) => { const { id: lid, visibility, ...ld } = l; row("locations", lid, { id: lid, church_id: c.id, visibility: visibility || "public", data: { ...ld, order: i } }); });
      if (integrations) row("records", `integrations|${c.id}`, { kind: "integrations", id: c.id, church_id: c.id, location_id: null, owner: null, data: integrations });
    });
    Object.values(st.users).filter((u) => u.guestOf).forEach((u) => { const { id: gid, ...data } = u; row("records", `guests|${gid}`, { kind: "guests", id: gid, church_id: u.guestOf[0], location_id: null, owner: null, data }); });
    for (const kind of RECORD_KINDS) (st[kind] || []).forEach((r) => {
      if (!r.churchId) return;
      const spec = SPLIT[kind], { id: rid, churchId, _count, _stubOnly, ...rest } = r;
      const data = spec ? { ...rest, [spec.field]: [] } : rest;
      if (!_stubOnly) row("records", `${kind}|${rid}`, { kind, id: rid, church_id: churchId, location_id: r.locationId || null, owner: ownerOf(kind, r), data });
      if (kind === "docs" && r.published) row("records", `outlines|${rid}`, { kind: "outlines", id: rid, church_id: churchId, location_id: r.locationId || null, owner: r.authorId, data: { ...data, blocks: data.blocks.filter((b) => b.show && b.type !== "note").map(({ notes, ...b }) => b), resource: "" } });
      if (spec) (r[spec.field] || []).forEach((item, i) => {
        const cid = item.id || `${rid}~${spec.owner(item) || i}`;
        row("records", `${spec.kind}|${cid}`, { kind: spec.kind, id: cid, church_id: churchId, location_id: r.locationId || null, owner: spec.owner(item) || null, data: { ...item, _parent: rid, ...(spec.stub ? { _stub: spec.stub(r) } : {}) } });
      });
    });
    return out;
  },
  timer: 0,
  /** Called after every local save. Writes the differences a moment later, in one batch per table. */
  sync() { if (!this.ready) return; clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 400); },
  async flush() {
    if (!this.ready || this.pushing) { this.pending = true; return; }
    this.pushing = true;
    try { await this.send(); } finally { this.pushing = false; }
    if (this.pending) { this.pending = false; this.sync(); }
  },
  /** Writes what's waiting right now, and says whether one record has reached the server as it stands here.
   *  For things another device depends on at once, like a pairing code. */
  async saved(kind, id) {
    if (!this.ready) return false;
    clearTimeout(this.timer);
    const key = `records:${kind}|${id}`, done = () => { const r = this.rows().find((x) => x.key === key); return !!r && this.snap.get(key) === r.json; };
    for (let i = 0; i < 3 && !done(); i++) {
      for (let n = 0; this.pushing && n < 200; n++) await new Promise((r) => setTimeout(r, 50));
      await this.flush();
    }
    return done();
  },
  async send() {
    const rows = this.rows(), now = new Map(rows.map((r) => [r.key, r])), ups = {}, dels = [];
    rows.forEach((r) => { if (this.snap.get(r.key) !== r.json) (ups[r.table] ||= []).push(r); });
    for (const key of this.snap.keys()) if (!now.has(key)) dels.push(key);
    const conflict = { profiles: "id", contacts: "user_id", families: "user_id", profile_private: "user_id", memberships: "church_id,user_id", churches: "id", roles: "church_id,key", locations: "id", records: "kind,id" };
    let failed = 0;
    const ORDER = ["profiles", "contacts", "families", "profile_private", "churches", "roles", "locations", "memberships", "records"];
    dels.sort((a, b) => ORDER.indexOf(b.split(":")[0]) - ORDER.indexOf(a.split(":")[0]));
    for (const table of ORDER.filter((t) => ups[t])) { const list = ups[table];
      const { error } = await this.client.from(table).upsert(list.map((r) => r.value), { onConflict: conflict[table] });
      if (!error) { list.forEach((r) => this.snap.set(r.key, r.json)); continue; }
      // One row the role can't write fails the batch, so save the rest one at a time.
      for (const r of list) { const { error: e } = await this.client.from(table).upsert(r.value, { onConflict: conflict[table] }); if (e) { failed++; console.warn(table, r.key, e.message); } else this.snap.set(r.key, r.json); }
    }
    for (const key of dels) {
      const [table, k] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      let q = this.client.from(table).delete();
      if (table === "records") { const [kind, id] = k.split("|"); q = q.eq("kind", kind).eq("id", id); }
      else if (table === "memberships") { const [c, u] = k.split("|"); q = q.eq("church_id", c).eq("user_id", u); }
      else if (table === "roles") { const [c, r] = k.split("|"); q = q.eq("church_id", c).eq("key", r); }
      else q = q.eq(conflict[table].split(",")[0], k);
      const { error } = await q; if (error) { failed++; console.warn("delete", key, error.message); } else this.snap.delete(key);
    }
    if (failed && !this.warned) { this.warned = true; toast("Some changes weren't saved. Your role may not allow them."); }
  },

  // ----- Live updates -----
  subscribe() {
    const c = S.state.current; if (!c || this.channel?.topic?.endsWith(c)) return;
    this.channel?.unsubscribe();
    this.channel = this.client.channel(`records:${c}`).on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `church_id=eq.${c}` }, (p) => this.applyChange(p)).subscribe();
  },
  applyChange({ eventType, new: n, old }) {
    const r = n?.kind ? n : old; if (!r?.kind) return;
    const key = `records:${r.kind}|${r.id}`;
    if (eventType !== "DELETE" && this.snap.get(key) === JSON.stringify({ kind: n.kind, id: n.id, church_id: n.church_id, location_id: n.location_id, owner: n.owner, data: n.data })) return; // our own write
    clearTimeout(this.refetch); this.refetch = setTimeout(() => this.pull().then(() => { trainingRemote = true; this.rerender(); }), 600);
  },
  rerender() {
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#app") && a.value) { a.addEventListener("blur", () => render(), { once: true }); return; }
    if (!$("#scrim")) render(); else pairSheetCheck();
  },
  /** Presentation moves for screens on other devices. The main screens use present:<church>; a room's screen gets its own topic. */
  chans: {},
  broadcast(msg, topic = `present:${S.state.current}`) {
    if (!this.ready) return;
    (this.chans[topic] ||= this.client.channel(topic).subscribe()).send({ type: "broadcast", event: "slide", payload: msg });
  },
  onBroadcast(cb, topic = `present:${S.state.current}`) {
    if (!this.ready) return;
    this.offBroadcast(topic);
    this.chans[topic] = this.client.channel(topic).on("broadcast", { event: "slide" }, ({ payload }) => cb(payload)).subscribe();
  },
  offBroadcast(topic) {
    const ch = this.chans[topic]; if (!ch) return;
    delete this.chans[topic];
    try { this.client.removeChannel(ch); } catch { try { ch.unsubscribe(); } catch {} }
  },

  // ----- Server functions -----
  async call(name, body) {
    const { data, error } = await this.client.functions.invoke(name, { body });
    if (error) { let msg = error.message; try { msg = (await error.context?.json())?.error || msg; } catch {} throw new Error(msg); }
    return data;
  },
  async checkout(o) { const { url } = await this.call("checkout", { ...o, origin: location.origin + location.pathname }); location.href = url; return new Promise(() => {}); },
  refund(ref) { return this.call("refund", { ref, churchId: S.state.current }).catch((e) => toast(`Refund failed: ${e.message}`)); },
  ai(prompt) { return this.call("ai", { prompt, churchId: S.state.current }); },
  async upload(file, path) {
    const full = `${S.state.current}/${path}`;
    const { error } = await this.client.storage.from("media").upload(full, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return this.client.storage.from("media").getPublicUrl(full).data.publicUrl;
  },
  podcastUrl(churchId) { return `${PLATFORM.supabaseUrl}/functions/v1/podcast?church=${encodeURIComponent(churchId)}`; },
  async savePush(sub) { await this.client.from("push_subscriptions").upsert({ endpoint: sub.endpoint, user_id: this.user.id, keys: sub.keys }, { onConflict: "endpoint" }); },
  async removePush(endpoint) { await this.client.from("push_subscriptions").delete().eq("endpoint", endpoint); },
};

/** Collections kept in the records table, one row per item. */
const RECORD_KINDS = ["sermons", "events", "news", "prayers", "gatherings", "plans", "gifts", "recurring", "docs", "songs", "library", "services", "layouts", "savedBlocks", "channels", "messages", "cards",
  "checkins", "serving", "teamMembers", "blockouts", "notifications", "attendance", "followups", "forms", "formResponses", "bookings", "deliveries", "devices", "signage", "roomSessions"];
/** Lists inside a record that belong to one person each, stored as their own rows so security can follow the person. */
const SPLIT = {
  events: { field: "registrations", kind: "event_regs", owner: (r) => r.by },
  gatherings: { field: "members", kind: "gathering_regs", owner: (m) => m.userId },
  services: { field: "assignments", kind: "assignments", owner: (a) => a.userId, stub: (p) => ({ title: p.title, date: p.date, time: p.time, locationId: p.locationId, segments: [] }) },
};
/** Who a record belongs to, for "your own" security rules. */
function ownerOf(kind, r) {
  return { prayers: r.by, gifts: r.by, recurring: r.by, docs: r.authorId, cards: r.by, checkins: r.by, serving: r.by, teamMembers: r.userId, blockouts: r.userId, notifications: r.userId,
    formResponses: r.by, bookings: r.by, messages: r.by, followups: r.assignedTo, devices: r.deviceUser, roomSessions: r.by }[kind] || null;
}
/** A fresh state with no sample churches, for signed-in use. */
function blankState() {
  const s = buildSeed();
  for (const k of Object.keys(s)) { if (Array.isArray(s[k])) s[k] = []; else if (k !== "me" && s[k] && typeof s[k] === "object") s[k] = {}; }
  return Object.assign(s, { current: null, me: { id: Backend.user?.id || "", name: "", email: Backend.user?.email || "", phone: "", household: [], pickups: [] } });
}

// ----- Signing in: new people confirm their email with a code, then choose a name and password; after that, email and password -----
let signinMode = "", signinEmail = "", signinNotice = { text: "", email: "" };
/** The address an email link brings people back to. It has to be listed under Redirect URLs in Supabase (SETUP.md). */
const appAddress = () => location.origin + location.pathname;
// Someone resetting a password signs in with a code first; this remembers to ask for the new password, even after an email link reloads the page.
const RESET_KEY = "our-faithful-reset";
const resetting = () => { try { return !!Backend.user && localStorage.getItem(RESET_KEY) === Backend.user.email; } catch { return false; } };
/** A signed-in person who hasn't chosen a password yet (or is resetting it) finishes their account first. Church devices never do. */
const needsAccountSetup = () => Backend.on && Backend.ready && !!Backend.user && !DEVICE_EMAIL.test(Backend.user.email || "") && (!Backend.user.user_metadata?.password_set || resetting());
const tooSoon = (e) => /rate|security purposes|seconds/i.test(e?.message || "");
const passwordField = (name, label, auto) => html`<label class="field"><span>${label}</span><span class="pw-wrap"><input type="password" name="${name}" autocomplete="${auto}" required minlength="8">
  <button type="button" class="icon-btn sm pw-eye" data-act="pw-toggle" aria-label="Show password" aria-pressed="false">${icon("eye")}</button></span></label>`;
Actions["pw-toggle"] = (el) => {
  const show = el.getAttribute("aria-pressed") !== "true";
  $$("input[type=password], input[data-pw]", el.closest("form")).forEach((i) => { i.type = show ? "text" : "password"; i.dataset.pw = "1"; });
  $$("[data-act=pw-toggle]", el.closest("form")).forEach((b) => { b.setAttribute("aria-pressed", String(show)); b.setAttribute("aria-label", show ? "Hide password" : "Show password"); b.innerHTML = flat(icon(show ? "eyeoff" : "eye")); });
};

Screens.signin = () => {
  if (!Backend.on) return { redirect: "welcome" };
  if (Backend.user) return { redirect: "home" };
  const email = signinEmail || signinNotice.email || "";
  const back = html`<button type="button" class="linkish" data-act="signin-mode" data-mode="">${icon("back")}Back</button>`;
  let body;
  if (signinEmail) {
    const heading = signinMode === "new" ? "Confirm your email" : signinMode === "reset" ? "Reset your password" : "Sign in with a code";
    body = html`<form data-form="signin-code" class="panel" novalidate><h2 class="signin-h">${heading}</h2>
      <p style="margin-top:0">We emailed a 6-digit code to <b>${signinEmail}</b>. Enter it here.</p>
      <label class="field"><span>Code from the email</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required class="code-input"></label>
      <button class="btn block">${signinMode === "new" ? "Confirm" : "Continue"}</button>
      <p class="faint">Or tap the link in the email on this phone or computer. Nothing yet? Check spam, or <button type="button" class="linkish" data-act="signin-resend">send another email</button>.</p>
      <button type="button" class="linkish" data-act="signin-back">Use a different email</button></form>`;
  } else if (signinMode === "existing") {
    body = html`<form data-form="signin-password" class="panel" novalidate>${back}<h2 class="signin-h">Sign in</h2>
      <label class="field" style="margin-top:0"><span>Email</span><input type="email" name="email" autocomplete="email" required value="${email}"></label>
      ${passwordField("password", "Password", "current-password")}
      <button class="btn block">Sign in</button>
      <p class="signin-alt"><button type="button" class="linkish" data-act="signin-forgot">Forgot your password?</button><button type="button" class="linkish" data-act="signin-code-instead">Email me a code instead</button></p>
      <p class="faint">New here? <button type="button" class="linkish" data-act="signin-mode" data-mode="new">Create an account</button></p></form>`;
  } else if (signinMode === "new" || signinMode === "reset") {
    const isNew = signinMode === "new";
    body = html`<form data-form="signin-email" class="panel" novalidate>${back}<h2 class="signin-h">${isNew ? "Create your account" : "Reset your password"}</h2>
      <p style="margin-top:0">${isNew ? "First, confirm your email. We'll send a 6-digit code; then you'll add your name and choose a password." : "We'll email you a 6-digit code. Then you'll choose a new password."}</p>
      <label class="field"><span>Your email</span><input type="email" name="email" autocomplete="email" required value="${email}"></label>
      <button class="btn block">Email me a code</button>
      ${isNew ? html`<p class="faint">Already have an account? <button type="button" class="linkish" data-act="signin-mode" data-mode="existing">Sign in</button></p>` : ""}</form>`;
  } else {
    body = html`<div class="panel signin-choice"><h2 class="signin-h">Welcome</h2><p style="margin-top:0">Are you new here, or do you already have an account?</p>
      <button type="button" class="choice" data-act="signin-mode" data-mode="existing"><span class="lead-ic">${icon("user")}</span><span><b>I have an account</b><small>Sign in with your email and password</small></span>${icon("chev")}</button>
      <button type="button" class="choice" data-act="signin-mode" data-mode="new"><span class="lead-ic">${icon("plus")}</span><span><b>I'm new here</b><small>Create an account. It takes a minute.</small></span>${icon("chev")}</button></div>`;
  }
  return {
    page: html`<div class="welcome"><div class="wrap"><p class="brand-word">${PLATFORM.name}</p>${bannerHtml(PLATFORM_CHURCH, PLATFORM_BANNER)}<div style="margin-top:18px">
      ${signinNotice.text ? html`<p class="panel notice" role="alert" style="margin-bottom:12px">${signinNotice.text}</p>` : ""}
      ${body}
      ${!signinMode ? html`<p class="signin-try">Just looking? <a href="?demo">Try the demo</a> or <a href="?training">practice in training</a>. No account needed, and nothing you do there is real.</p>` : ""}
      <p style="text-align:center;margin-top:12px"><a class="linkish" href="#pair">${icon("lock")}Set up a church device</a></p></div></div></div>`,
  };
};
const setNotice = (text, email = "") => { signinNotice = { text, email }; };
Actions["signin-mode"] = (el) => { signinMode = el.dataset.mode; signinEmail = ""; setNotice(""); render(); $("#app input[type=email]")?.focus(); };
Actions["signin-back"] = () => { signinEmail = ""; setNotice(""); render(); };
Actions["signin-forgot"] = () => { const e = $("#app input[name=email]")?.value.trim() || ""; signinMode = "reset"; signinEmail = ""; setNotice("", e); render(); };
async function sendCode(email, f) {
  // New accounts are only made from "I'm new here"; signing in with a code or resetting a password needs an account already.
  const { error } = await Backend.client.auth.signInWithOtp({ email, options: { emailRedirectTo: appAddress(), shouldCreateUser: signinMode === "new" } });
  if (error) {
    const msg = tooSoon(error) ? "An email was just sent. Wait a minute before asking for another."
      : /signups? not allowed|not found|otp_disabled/i.test(error.message + (error.code || "")) ? "There's no account with that email yet. Choose Create an account." : error.message;
    if (f) formError(f, msg); else toast(msg);
    return false;
  }
  try { if (signinMode === "reset") localStorage.setItem(RESET_KEY, email); else localStorage.removeItem(RESET_KEY); } catch {}
  signinEmail = email; setNotice(""); render(); $("#app input[name=code]")?.focus();
  return true;
}
Forms["signin-email"] = async (d, f) => {
  const email = String(d.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return formError(f, "Enter your email address.");
  await sendCode(email, f);
};
Actions["signin-code-instead"] = async () => {
  const email = $("#app input[name=email]")?.value.trim().toLowerCase() || "";
  if (!/^\S+@\S+\.\S+$/.test(email)) { toast("Enter your email first"); $("#app input[name=email]")?.focus(); return; }
  await sendCode(email, $("#app form"));
};
Actions["signin-resend"] = async (el) => {
  el.disabled = true;
  const { error } = await Backend.client.auth.signInWithOtp({ email: signinEmail, options: { emailRedirectTo: appAddress(), shouldCreateUser: signinMode === "new" } });
  toast(error ? (tooSoon(error) ? "Wait a minute before asking for another email" : error.message) : "Sent. Use the newest email.");
  setTimeout(() => { el.disabled = false; }, 60e3);
};
Forms["signin-code"] = async (d, f) => {
  const code = String(d.code || "").replace(/\D/g, "");
  if (code.length < 6) return formError(f, "Enter the code from the email.");
  const { data, error } = await Backend.client.auth.verifyOtp({ email: signinEmail, token: code, type: "email" });
  if (error) return formError(f, /expired/i.test(error.message) ? "That code has expired. Send a new one and use the newest email." : "That code didn't work. Check it, or send a new one.");
  const wasNew = signinMode === "new";
  Backend.user = data.user; signinEmail = ""; signinMode = "";
  if (wasNew && data.user?.user_metadata?.password_set) toast("You already have an account, so you're signed in");
  await Backend.afterSignIn();
};
Forms["signin-password"] = async (d, f) => {
  const email = String(d.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return formError(f, "Enter your email address.");
  if (!d.password) return formError(f, "Enter your password.");
  const { data, error } = await Backend.client.auth.signInWithPassword({ email, password: d.password });
  if (error) {
    return formError(f, /invalid login|invalid_credentials/i.test(error.message + (error.code || ""))
      ? "That email and password don't match. Check them, or choose Forgot your password. (If you signed up before passwords were added, choose Email me a code instead.)"
      : tooSoon(error) ? "Too many tries. Wait a minute and try again." : error.message);
  }
  Backend.user = data.user; signinMode = ""; await Backend.afterSignIn();
};

// ----- Finishing an account: name and password (or a new password after a reset) -----
Screens.setup = () => {
  if (!needsAccountSetup()) return { redirect: S.church() ? "home" : "churches" };
  const reset = resetting() && Backend.user.user_metadata?.password_set;
  return {
    page: html`<div class="welcome"><div class="wrap"><p class="brand-word">${PLATFORM.name}</p><div style="margin-top:18px">
      <form data-form="account-setup" class="panel" novalidate><h2 class="signin-h">${reset ? "Choose a new password" : "Finish creating your account"}</h2>
        <p style="margin-top:0">${reset ? html`For <b>${Backend.user.email}</b>.` : html`Your email <b>${Backend.user.email}</b> is confirmed. Next time, sign in with it and this password.`}</p>
        ${reset ? "" : html`<label class="field"><span>Your name</span><input type="text" name="name" autocomplete="name" required maxlength="80" value="${S.me().name || ""}"></label>`}
        ${passwordField("password", reset ? "New password" : "Choose a password", "new-password")}
        ${passwordField("password2", "Type it again", "new-password")}
        <small class="faint">At least 8 characters. A short phrase is easy to remember.</small>
        <label class="field" id="nonce-field" hidden><span>Code from the email</span><input type="text" name="nonce" inputmode="numeric" autocomplete="one-time-code" maxlength="12" class="code-input"></label>
        <button class="btn block" style="margin-top:12px">${reset ? "Save new password" : "Create account"}</button>
        <button type="button" class="linkish" data-act="sign-out">Use a different email</button></form></div></div></div>`,
  };
};
Forms["account-setup"] = async (d, f) => {
  const reset = resetting() && Backend.user.user_metadata?.password_set;
  if (!reset && !String(d.name || "").trim()) return formError(f, "Enter your name.");
  if (String(d.password || "").length < 8) return formError(f, "Choose a password with at least 8 characters.");
  if (d.password !== d.password2) return formError(f, "The two passwords don't match.");
  const attrs = { password: d.password, data: { password_set: true } };
  if (d.nonce) attrs.nonce = String(d.nonce).replace(/\D/g, "");
  const { data, error } = await Backend.client.auth.updateUser(attrs);
  if (error) {
    // Supabase may ask people who signed in a while ago to confirm it's them before changing a password.
    if (/reauthenticat/i.test(error.message + (error.code || "")) && !d.nonce) {
      await Backend.client.auth.reauthenticate();
      $("#nonce-field", f).hidden = false; $("input[name=nonce]", f).focus();
      return formError(f, "To keep your account safe, we emailed you a code. Enter it, then save again.");
    }
    return formError(f, /same.?password|should be different/i.test(error.message + (error.code || "")) ? "That's already your password. Choose a different one."
      : /weak|pwned|leaked/i.test(error.message + (error.code || "")) ? `Choose a stronger password. ${error.message}` : error.message);
  }
  Backend.user = data.user;
  try { localStorage.removeItem(RESET_KEY); } catch {}
  if (!reset) { S.me().name = String(d.name).trim(); S.save(); }
  toast(reset ? "Password changed" : "Your account is ready");
  const r = pendingRoute; pendingRoute = null;
  go(r && r !== "setup" ? r : S.church() ? "home" : "churches");
};
Actions["sign-out"] = () => { try { localStorage.removeItem(RESET_KEY); } catch {} signinMode = ""; Backend.signOut(); };
