// ---------- Deactivating a church account ----------
// The primary account holder can deactivate the church's account. An administrator whose role includes the
// "church.deactivate" privilege can ask, and the primary decides. A deactivated church is hidden from everyone else and
// leaves the list of churches (S.church and S.churches in 20-store.js; the security rules on a live site). The primary
// can reactivate it for one year; after that its data is removed for good. Reminders go to the primary by email and in
// the app with 180, 90, 30, 14, 7, 3 and 1 days left.
// On a live site the server owns all of this (church_deactivation and church_lifecycle_tick in schema.sql, and the
// church-lifecycle function). In the preview, the demo and training, this file stands in for it.
const DEACT_MARKS = [180, 90, 30, 14, 7, 3, 1];
/** Screens the primary account holder can still open while the church they're in is deactivated. */
const DEACT_OPEN = ["deactivated", "reactivate", "churches", "church", "start", "signin", "setup", "welcome", "pair", "page", "bible"];
const deactOf = (c = S.church()) => c?.deactivation || {};
const deactStatus = (c = S.church()) => deactOf(c).status || "active";
const deactDaysLeft = (c) => Math.max(0, Math.ceil((new Date(deactOf(c).purgeAt) - Date.now()) / DAY));
const deactDue = (c) => DEACT_MARKS.filter((m) => m >= deactDaysLeft(c)).sort((a, b) => a - b)[0] || 0;
const longDay = (d) => fmt(d, { year: "numeric", month: "long", day: "numeric" });
const daysText = (n) => `${n} ${n === 1 ? "day" : "days"}`;
const primaryName = (c = S.church()) => (c.ownerId === S.me().id ? S.me().name : S.user(c.ownerId)?.name) || "the primary account holder";
/** Who sees the option at all: the primary, or someone whose role includes the privilege. Never for a training church. */
const canAskDeactivate = (c = S.church()) => !!c && !c.training && (S.isPrimary(c.id) || (S.isMember(c.id) && S.can("church.deactivate", c.id)));
const oneYearOn = (from = new Date()) => addMonths(from, 12);

/** What the server's church_deactivation() does, for when nothing leaves this browser. Throws with the reason it refused. */
function deactLocal(c, action, note = "") {
  const me = S.me(), d = deactOf(c), st = d.status || "active", now = new Date().toISOString(), primary = c.ownerId === me.id;
  const no = (m) => { throw new Error(m); };
  const reason = String(note || "").trim().slice(0, 500);
  let next;
  if (c.training) no("A training church is deleted under Admin, Training church, not deactivated");
  if (action === "request") {
    if (primary) no("You are the primary account holder: deactivate the account yourself");
    if (!S.can("church.deactivate", c.id)) no("Your role cannot ask to deactivate the church account");
    if (st === "requested") no("Someone has already asked. The primary account holder decides.");
    next = { status: "requested", requestedBy: me.id, requestedByName: me.name, requestedAt: now, reason };
    notify(c.ownerId, { kind: "account", title: `${me.name} asked to deactivate ${c.name}`, body: "Nothing changes unless you approve it. Review the request under Admin.", link: "#admin-deactivate" }, c.id);
  } else if (action === "withdraw") {
    if (st !== "requested" || (d.requestedBy !== me.id && !primary)) no("There is no request of yours to take back");
    next = { status: "active", withdrawnAt: now };
  } else if (action === "decline") {
    if (!primary) no("Only the primary account holder can decide this");
    if (st !== "requested") no("There is no request waiting");
    notify(d.requestedBy, { kind: "account", title: `${c.name} stays active`, body: "The primary account holder declined the request to deactivate the church account.", link: "#admin" }, c.id);
    next = { status: "active", declinedAt: now };
  } else if (action === "deactivate") {
    if (!primary) no("Only the primary account holder can deactivate the church account");
    if (st === "deactivated") return d;
    const purgeAt = oneYearOn().toISOString();
    next = { status: "deactivated", by: me.id, at: now, purgeAt };
    if (st === "requested") Object.assign(next, { requestedBy: d.requestedBy, requestedByName: d.requestedByName });
    if (reason || d.reason) next.reason = reason || d.reason;
    // Givers can't see or stop their recurring gifts once the church is hidden, so those stop now.
    (S.state.recurring || []).filter((r) => r.churchId === c.id && r.active).forEach((r) => Object.assign(r, { active: false, endedAt: now, endedBy: "deactivation" }));
    notify(me.id, { kind: "account", title: `${c.name} is deactivated`, body: `Only you can see it now. Reactivate it any time before ${longDay(purgeAt)}. After that, everything in it is permanently deleted.`, link: `#reactivate-${c.id}` }, c.id);
  } else if (action === "reactivate") {
    if (!primary) no("Only the primary account holder can reactivate the church account");
    if (st !== "deactivated") return d;
    if (new Date(d.purgeAt) <= new Date()) no("The year to reactivate this account has passed");
    next = { status: "active", reactivatedAt: now, wasDeactivatedAt: d.at };
  } else no("Unknown action");
  c.deactivation = next; S.save();
  return next;
}
/** Asks, takes back, declines, deactivates or reactivates. Says whether an email went to the primary account holder. */
async function deactAct(action, note = "", cid = S.state.current) {
  const c = S.state.churches[cid];
  if (!c) throw new Error("Church not found");
  if (!Backend.on) return { d: deactLocal(c, action, note), email: "off" };
  await Backend.push().catch(() => {});   // nothing of yours is left unsaved when the church goes quiet
  const { data, error } = await Backend.client.rpc("church_deactivation", { c: cid, action, note: String(note || "") });
  if (error) throw new Error(error.message);
  // Send the email now; if that can't happen this minute, the hourly schedule sends it.
  const mail = await Backend.call("church-lifecycle", { churchId: cid }).catch(() => null);
  await Backend.pull().catch(() => {});
  if (S.state.churches[cid] && !S.state.churches[cid].deactivation) S.state.churches[cid].deactivation = data;
  return { d: data, email: mail?.email || "off" };
}

// ----- Admin: the option, the warning, and the primary's decision -----
const deactEffects = (c) => html`<ul class="deact-list">
  <li><b>${c.name} will no longer be visible to all other users.</b> Members, staff and other administrators can't see or open it. Only ${S.isPrimary(c.id) ? "you, the primary account holder, can" : `the primary account holder, ${primaryName(c)}, can`}.</li>
  <li><b>It's removed from the list of available churches in the app.</b> Its public page, links and embedded pages stop working too.</li>
  <li>Online giving stops, including recurring gifts. Screens and kiosks are signed out.</li>
  <li>Nothing is deleted straight away. The primary account holder can reactivate the account for one year, and everything comes back as it was.</li>
  <li><b>After one year, all of the church's data is permanently deleted</b>: members, giving records, sermons, events, groups, photos and the rest.</li>
  <li>Before that happens, the primary account holder is reminded by email and in the app, with ${DEACT_MARKS.slice(0, -1).join(", ")} and 1 days left, each time with the option to reactivate.</li></ul>`;
AdminScreens.deactivate = () => {
  const c = S.church(), d = deactOf(c), st = deactStatus(c), primary = S.isPrimary();
  const page = (body) => ({ title: "Deactivate church account", back: "admin", body });
  if (c.training) return page(html`<div class="panel" style="margin-top:16px"><p style="margin-top:0">${c.name} is a training church. It isn't deactivated: delete it, or start it fresh, under Training church.</p><a class="btn ghost" href="#admin-training">Training church</a></div>`);
  if (!canAskDeactivate(c)) return page(html`<div class="panel" style="margin-top:16px"><p style="margin-top:0">Only the primary account holder, ${primaryName(c)}, can deactivate ${c.name}, or an administrator they've given that privilege to (Roles and permissions).</p><a class="btn ghost" href="#admin">Back to Admin</a></div>`);
  const waiting = st === "requested" ? html`<section class="sec panel" role="status"><h2 style="margin-top:0">${primary ? `${d.requestedByName || "An administrator"} asked to deactivate ${c.name}` : `Waiting for ${primaryName(c)}`}</h2>
      <p class="muted">${primary ? "" : `${d.requestedBy === S.me().id ? "You" : d.requestedByName || "An administrator"} asked to deactivate ${c.name}. `}Asked on ${longDay(d.requestedAt)}. ${primary ? "Nothing changes unless you approve it." : "Nothing changes until the primary account holder approves it."}</p>
      ${d.reason ? html`<p><span class="faint">Reason given:</span> ${d.reason}</p>` : ""}
      <div class="btns">${primary ? html`<button class="btn danger" data-act="deact-start">Review and deactivate</button><button class="btn ghost" data-act="deact-decline">Decline</button>`
        : d.requestedBy === S.me().id ? html`<button class="btn ghost" data-act="deact-withdraw">Take back the request</button>` : ""}</div></section>` : "";
  return page(html`${waiting}
    <section class="sec panel"><h2 style="margin-top:0">What deactivating does</h2>${deactEffects(c)}</section>
    ${st === "requested" ? "" : html`<section class="sec panel">
      <h2 style="margin-top:0">${primary ? `Deactivate ${c.name}` : `Ask to deactivate ${c.name}`}</h2>
      <p class="muted">${primary ? "You're the primary account holder, so this takes effect as soon as you confirm it." : `You can ask. ${primaryName(c)}, the primary account holder, has to approve it before anything changes.`}</p>
      <button class="btn danger" data-act="deact-start">${primary ? "Deactivate church account" : "Ask to deactivate"}</button></section>`}`);
};
/** The check before it happens: the warning, the church's name typed out, and a box to tick. */
Actions["deact-start"] = () => {
  const c = S.church(), primary = S.isPrimary(), d = deactOf(c);
  if (!canAskDeactivate(c)) return;
  openSheet(primary ? `Deactivate ${c.name}?` : `Ask to deactivate ${c.name}?`, html`<form data-form="deact-confirm" novalidate>
    <div class="room-msg warn" role="alert">${icon("info")}<div><b>${c.name} will no longer be visible to all other users, and it will be removed from the list of available churches in the app.</b>
      ${primary ? `Only you will be able to see it. You can reactivate it until ${longDay(oneYearOn())}. After that, all of its data is permanently deleted.`
        : `This needs the approval of the primary account holder, ${primaryName(c)}. Nothing changes until they approve.`}</div></div>
    <label class="field"><span>${primary ? "Reason (optional)" : "Why? The primary account holder sees this"}</span><textarea name="reason" rows="2" maxlength="500">${primary && d.status === "requested" ? d.reason || "" : ""}</textarea></label>
    <label class="field"><span>To confirm, type the church's name: <b>${c.name}</b></span><input type="text" name="confirmName" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
    <label class="check"><input type="checkbox" name="understand" value="1"><span>I understand that ${c.name} will be hidden from everyone else and removed from the list of churches.</span></label>
    <div class="btns"><button class="btn danger">${primary ? `Deactivate ${c.name}` : "Send the request"}</button><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div></form>`);
};
Forms["deact-confirm"] = async (d, f) => {
  const c = S.church(), primary = S.isPrimary(), tidy = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  if (tidy(d.confirmName) !== tidy(c.name)) return formError(f, `Type the church's name to confirm: ${c.name}`);
  if (!d.understand) return formError(f, "Tick the box to confirm you understand.");
  const btn = $("button.btn.danger", f);
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const { email } = await deactAct(primary ? "deactivate" : "request", d.reason);
    closeSheet(true);
    toast(primary ? `${c.name} is deactivated${email === "sent" ? ". We emailed you the details." : ""}` : `Request sent to ${primaryName(c)}`);
    go(primary ? `reactivate-${c.id}` : "admin-deactivate"); render();
  } catch (e) { btn.disabled = false; formError(f, e.message || "That didn't go through. Try again."); }
};
const deactSimple = (action, done) => async (el) => {
  el.disabled = true;
  try { await deactAct(action); toast(done(S.church() || {})); } catch (e) { toast(e.message || "That didn't go through. Try again."); }
  render();
};
Actions["deact-decline"] = deactSimple("decline", (c) => `Declined. ${c.name || "The church"} stays active.`);
Actions["deact-withdraw"] = deactSimple("withdraw", () => "Request taken back");

// ----- The primary's view of a deactivated church, and bringing it back -----
Screens.deactivated = () => {
  const c = S.church();
  if (!c || deactStatus(c) !== "deactivated") return { redirect: c ? "home" : "churches" };
  const d = deactOf(c), left = deactDaysLeft(c);
  return { page: html`<div class="welcome"><div class="wrap">${brandWord()}
    <main class="panel deact" id="main"><h1>${c.name} is deactivated</h1>
      <p class="muted">Since ${longDay(d.at)}, only you can see this church account. It isn't in the list of churches, and its members can't open it.</p>
      <div class="room-msg warn" role="status">${icon("info")}<div><b>${daysText(left)} left.</b> On ${longDay(d.purgeAt)}, everything in the account is permanently deleted: members, giving records, sermons, events, groups and photos. That can't be undone.</div></div>
      <p>Reactivate it and everything comes back as it was. Recurring gifts were stopped, so givers set those up again, and screens and kiosks need pairing again.</p>
      <button class="btn block" data-act="deact-reactivate" data-id="${c.id}">Reactivate ${c.name}</button>
      <div class="deact-links"><a class="linkish" href="#churches">${S.myChurches().length > 1 ? "Switch church" : "Find another church"}</a>${Backend.on ? html`<button type="button" class="linkish" data-act="sign-out">Sign out</button>` : ""}</div>
    </main></div></div>` };
};
/** #reactivate-<church>: where the reminder emails and notifications lead. */
Screens.reactivate = (id) => {
  const c = S.state.churches[id];
  if (c && c.ownerId === S.me().id && deactStatus(c) === "deactivated") {
    if (S.state.current !== id) { S.state.current = id; S.save(); }
    return Screens.deactivated();
  }
  if (c && !S.hidden(c) && S.isMember(id)) { if (S.state.current !== id) { S.state.current = id; S.save(); } return { redirect: "home" }; }   // already active again
  return { title: "Reactivate a church", back: S.church() ? "home" : "churches", body: html`<div class="panel" style="margin-top:16px"><p style="margin-top:0">This link is for the primary account holder of a deactivated church. Sign in with that account's email address to reactivate it.</p>
    <p class="muted">If a year has passed since it was deactivated, its data has been deleted and it can't be brought back. You're welcome to register the church again.</p><a class="btn ghost" href="#churches">Find a church</a></div>` };
};
Actions["deact-reactivate"] = (el) => {
  const c = S.state.churches[el.dataset.id];
  if (!c) return;
  openSheet(`Reactivate ${c.name}?`, html`<p style="margin-top:0">${c.name} goes back in the list of churches. Its members, staff and administrators can open it again, with everything as it was.</p>
    <div class="btns"><button class="btn" data-act="deact-reactivate-yes" data-id="${c.id}">Reactivate</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
};
Actions["deact-reactivate-yes"] = async (el) => {
  const id = el.dataset.id, name = S.state.churches[id]?.name || "The church";
  el.disabled = true;
  try { await deactAct("reactivate", "", id); S.state.current = id; S.save(); closeSheet(true); toast(`${name} is active again`); go("home"); render(); }
  catch (e) { el.disabled = false; toast(e.message || "That didn't go through. Try again."); }
};

// ----- In the app: reminders and requests the primary should see wherever they are -----
/** On Home and in Admin: a request waiting for you, and any church of yours that's deactivated, with its last day. */
function deactAlerts() {
  const me = S.me().id, c = S.church(), out = [];
  if (c && c.ownerId === me && deactStatus(c) === "requested") out.push(html`<a class="alert" href="#admin-deactivate">${icon("info")}<div><b>${deactOf(c).requestedByName || "An administrator"} asked to deactivate ${c.name}</b><span>Nothing changes unless you approve it. Review the request.</span></div></a>`);
  Object.values(S.state.churches).filter((x) => x.ownerId === me && deactStatus(x) === "deactivated" && x.id !== S.state.current)
    .forEach((x) => out.push(html`<a class="alert" href="#reactivate-${x.id}">${icon("info")}<div><b>${x.name} is deactivated</b><span>Everything in it is permanently deleted on ${longDay(deactOf(x).purgeAt)}, ${daysText(deactDaysLeft(x))} from now. Reactivate it to keep it.</span></div></a>`));
  return out;
}
/** Removes a church and everything in it from this browser's copy. */
function dropChurch(id) {
  Object.values(S.state.churches).filter((x) => x.training?.of === id).forEach((x) => dropChurch(x.id));
  delete S.state.churches[id];
  S.state.memberships = S.state.memberships.filter((m) => m.churchId !== id);
  for (const k of RECORD_KINDS) if (Array.isArray(S.state[k])) S.state[k] = S.state[k].filter((r) => r.churchId !== id);
  if (S.state.current === id) S.state.current = S.myChurches()[0]?.id || null;
}
/** Where there's no server (the preview, the demo, training), the browser does the hourly job: a reminder in the
 *  notifications at each mark, and the church removed once its year is up. */
function deactTick() {
  if (Backend.on) return;
  let changed = false;
  for (const c of Object.values(S.state.churches)) {
    const d = c.deactivation;
    if (d?.status !== "deactivated") continue;
    if (new Date(d.purgeAt) <= new Date()) { dropChurch(c.id); changed = true; continue; }
    const left = deactDaysLeft(c), mark = deactDue(c), id = `n-deact-${c.id}-${Math.floor(new Date(d.at) / 1000)}-${mark}`;
    if (!mark || S.state.notifications.some((n) => n.id === id)) continue;
    S.state.notifications.unshift({ id, churchId: c.id, userId: c.ownerId, at: new Date().toISOString(), read: false, kind: "account",
      title: `${c.name} will be deleted in ${daysText(left)}`, body: `The church account is deactivated. Everything in it is permanently deleted on ${longDay(d.purgeAt)}. Reactivate it to keep it.`, link: `#reactivate-${c.id}` });
    changed = true;
  }
  if (changed) S.save();
}
