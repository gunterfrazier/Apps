// ---------- Supabase backend ----------
// When config.js names a Supabase project (and the app isn't in the preview), this takes over storage and sign-in.
// The rest of the app keeps using S exactly as before. This file:
//   1. signs people in with a code sent to their email,
//   2. pulls everything they're allowed to see into S.state (row-level security decides what that is),
//   3. after each save, works out which records changed and writes only those,
//   4. listens for other people's changes and presentation moves in real time.
// Tables are in supabase/schema.sql. Server functions (payments, push, AI, podcast) are in supabase/functions.

const Backend = {
  on: false, client: null, user: null, aiEnabled: true, ready: false, snap: new Map(), pending: false, warned: false, channel: null, present: null,
  configured() { return !IN_PREVIEW && !!PLATFORM.supabaseUrl && !!PLATFORM.supabasePublishableKey; },

  async start() {
    if (!this.configured()) return;
    this.on = true;
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
      this.client = createClient(PLATFORM.supabaseUrl, PLATFORM.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    } catch (e) { console.error("Supabase didn't load", e); this.failed = true; render(); return; }
    const { data } = await this.client.auth.getSession();
    this.client.auth.onAuthStateChange((evt, session) => { if (evt === "SIGNED_OUT") { this.user = null; this.ready = false; this.synced = false; this.snap = new Map(); S.state = blankState(); S.flush(); go("signin"); } else if (session?.user && !this.user) { this.user = session.user; this.afterSignIn(); } });
    if (data.session?.user) { this.user = data.session.user; await this.afterSignIn(); }
    else render();
  },
  /** Runs once per sign-in, even if the sign-in event and the sign-in form both ask. */
  afterSignIn() {
    return this.starting ||= (async () => {
      try { await this.pull(); } catch (e) { console.error(e); toast("Couldn't load your churches. Check your connection."); }
      this.ready = true; this.subscribe(); render();
      if (pendingRoute) { const r = pendingRoute; pendingRoute = null; go(r); }
    })().finally(() => { this.starting = null; });
  },
  async signOut() { await this.client?.auth.signOut(); },

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
    Object.assign(st, { prefs: p.prefs || st.prefs, notes: p.notes || {}, saved: p.saved || [], progress: p.progress || {}, seen: p.seen || [], chatSeen: p.chatSeen || {}, reminded: p.reminded || [], campus: p.campus || {}, current: look || (p.current && mine.includes(p.current) ? p.current : mine[0] || null) });
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
    row("profile_private", uid, { user_id: uid, data: { prefs: st.prefs, notes: st.notes, saved: st.saved, progress: st.progress, seen: st.seen, chatSeen: st.chatSeen, reminded: st.reminded, campus: st.campus, current: st.current } });
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
    clearTimeout(this.refetch); this.refetch = setTimeout(() => this.pull().then(() => this.rerender()), 600);
  },
  rerender() {
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#app") && a.value) { a.addEventListener("blur", () => render(), { once: true }); return; }
    if (!$("#scrim")) render();
  },
  /** Presentation moves for stage displays and overlays on other devices. */
  broadcast(msg) {
    if (!this.ready) return;
    if (!this.present) this.present = this.client.channel(`present:${S.state.current}`).subscribe();
    this.present.send({ type: "broadcast", event: "slide", payload: msg });
  },
  onBroadcast(cb) {
    if (!this.ready) return;
    this.present?.unsubscribe();
    this.present = this.client.channel(`present:${S.state.current}`).on("broadcast", { event: "slide" }, ({ payload }) => cb(payload)).subscribe();
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
  "checkins", "serving", "teamMembers", "blockouts", "notifications", "attendance", "followups", "forms", "formResponses", "bookings", "deliveries", "devices", "signage"];
/** Lists inside a record that belong to one person each, stored as their own rows so security can follow the person. */
const SPLIT = {
  events: { field: "registrations", kind: "event_regs", owner: (r) => r.by },
  gatherings: { field: "members", kind: "gathering_regs", owner: (m) => m.userId },
  services: { field: "assignments", kind: "assignments", owner: (a) => a.userId, stub: (p) => ({ title: p.title, date: p.date, time: p.time, locationId: p.locationId, segments: [] }) },
};
/** Who a record belongs to, for "your own" security rules. */
function ownerOf(kind, r) {
  return { prayers: r.by, gifts: r.by, recurring: r.by, docs: r.authorId, cards: r.by, checkins: r.by, serving: r.by, teamMembers: r.userId, blockouts: r.userId, notifications: r.userId,
    formResponses: r.by, bookings: r.by, messages: r.by, followups: r.assignedTo, devices: r.deviceUser }[kind] || null;
}
/** A fresh state with no sample churches, for signed-in use. */
function blankState() {
  const s = buildSeed();
  for (const k of Object.keys(s)) { if (Array.isArray(s[k])) s[k] = []; else if (k !== "me" && s[k] && typeof s[k] === "object") s[k] = {}; }
  return Object.assign(s, { current: null, me: { id: Backend.user?.id || "", name: "", email: Backend.user?.email || "", phone: "", household: [], pickups: [] } });
}

// ----- Sign in with a code sent by email -----
let signinEmail = "";
Screens.signin = () => {
  if (!Backend.on) return { redirect: "welcome" };
  if (Backend.user) return { redirect: "home" };
  return {
    page: html`<div class="welcome"><div class="wrap"><p class="brand-word">${PLATFORM.name}</p>${bannerHtml(PLATFORM_CHURCH, PLATFORM_BANNER)}<div style="margin-top:18px">
      ${!signinEmail ? html`<form data-form="signin-email" class="panel" novalidate><label class="field" style="margin-top:0"><span>Your email</span><input type="email" name="email" autocomplete="email" required></label>
          <button class="btn block">Email me a sign-in code</button><p class="faint">New here? The same code creates your account.</p></form>`
        : html`<form data-form="signin-code" class="panel" novalidate><p style="margin-top:0">We sent a 6-digit code to <b>${signinEmail}</b>.</p>
          <label class="field"><span>Code</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required style="font-size:1.4rem;letter-spacing:.3em;text-align:center"></label>
          <button class="btn block">Sign in</button><button type="button" class="linkish" data-act="signin-back">Use a different email</button></form>`}
      <p style="text-align:center;margin-top:12px"><a class="linkish" href="#pair">${icon("lock")}Set up a church device</a></p></div></div></div>`,
  };
};
Forms["signin-email"] = async (d, f) => {
  if (!/^\S+@\S+\.\S+$/.test(d.email)) return formError(f, "Enter your email address.");
  const { error } = await Backend.client.auth.signInWithOtp({ email: d.email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) return formError(f, error.message);
  signinEmail = d.email; render();
};
Forms["signin-code"] = async (d, f) => {
  const { data, error } = await Backend.client.auth.verifyOtp({ email: signinEmail, token: d.code, type: "email" });
  if (error) return formError(f, "That code didn't work. Check it, or ask for a new one.");
  Backend.user = data.user; signinEmail = ""; await Backend.afterSignIn();
  if (!S.me().name) go("welcome");
};
Actions["signin-back"] = () => { signinEmail = ""; render(); };
Actions["sign-out"] = () => Backend.signOut();
