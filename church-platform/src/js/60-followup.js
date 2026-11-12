// ---------- Newcomer follow-up ----------
// Everyone new lands here: connect cards, families checking in at the kiosk for the first time, and people who
// join in the app. Each gets the church's next steps as a checklist, someone to own it, and a notes log.

const FOLLOW_STATUS = { new: ["New", "warn"], contacted: ["Contacted", "brand"], connected: ["Connected", "ok"], closed: ["Closed", ""] };
const FOLLOW_SOURCE = { card: "Connect card", kiosk: "First visit at kids check-in", joined: "Joined in the app", manual: "Added by staff" };
const DEFAULT_FOLLOW_STEPS = ["Send a welcome text or email", "Pastor or staff phone call", "Invite to a newcomers lunch", "Help them join a group or team"];
const canFollow = () => S.isMember() && S.can("manage.followup");
const followSteps = (c = S.church()) => c.followupSteps?.length ? c.followupSteps : DEFAULT_FOLLOW_STEPS;
/** People at this church whose role lets them follow up. */
const followers = () => S.members().map((m) => m.userId).filter((u) => S.user(u) && S.role(S.state.current, u)?.perms["manage.followup"]);

/** Starts follow-up for someone new, or adds to the one already open for them. */
function startFollowup(rec) {
  const c = S.church(); if (!c) return null;
  const open = rec.personId && S.list("followups").find((f) => f.personId === rec.personId && f.status !== "closed");
  if (open) {
    open.notes.push({ id: uid(), by: null, at: new Date().toISOString(), text: `${FOLLOW_SOURCE[rec.source] || "Update"}: ${rec.reason}${rec.message ? `. "${rec.message}"` : ""}` });
    if (rec.cardId) open.cardId = rec.cardId;
    if (open.assignedTo) notify(open.assignedTo, { kind: "follow", title: `${open.name}: ${rec.reason}`, body: rec.message || FOLLOW_SOURCE[rec.source] || "", link: `#guest-${open.id}` });
    S.save(); return open;
  }
  const lead = c.followupLead && S.membership(c.id, c.followupLead) ? c.followupLead : c.ownerId;
  const f = S.add("followups", { status: "new", assignedTo: lead, notes: [], phone: "", email: "", message: "", personId: null, at: new Date().toISOString(),
    steps: followSteps(c).map((label) => ({ id: uid(), label, done: false, doneAt: null, by: null })), ...rec });
  if (f.assignedTo && f.assignedTo !== S.me().id) notify(f.assignedTo, { kind: "follow", title: `New: ${f.name}`, body: `${f.reason}${f.message ? `. "${f.message}"` : ""}`, link: `#guest-${f.id}` });
  emit("followup.created", { name: f.name, source: f.source, reason: f.reason, assignedTo: S.userName(f.assignedTo) });
  return f;
}
const stepsDone = (f) => f.steps.filter((s) => s.done).length;

let followView = "open";
Screens.followup = () => {
  if (!canFollow()) return { redirect: hasAdminTools() ? "admin" : "me" };
  const all = S.list("followups").sort((a, b) => new Date(b.at) - new Date(a.at)), me = S.me().id;
  const open = all.filter((f) => f.status === "new" || f.status === "contacted"), mine = open.filter((f) => f.assignedTo === me), done = all.filter((f) => f.status === "connected" || f.status === "closed");
  const list = { open, mine, done }[followView] || open;
  const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
  const newThisMonth = all.filter((f) => new Date(f.at) >= month).length, waiting = all.filter((f) => f.status === "new").length;
  const recent = all.filter((f) => Date.now() - new Date(f.at) < 90 * DAY && f.status !== "new"), connected = recent.filter((f) => f.status === "connected").length;
  return {
    title: "Follow-up", back: hasAdminTools() ? "admin" : "me",
    body: html`<div class="stat-tiles" style="margin-top:16px">
        <div class="stat-tile"><span class="lbl">New this month</span><b>${newThisMonth}</b></div>
        <div class="stat-tile"><span class="lbl">Waiting for a first contact</span><b>${waiting}</b></div>
        <div class="stat-tile"><span class="lbl">Connected, last 90 days</span><b>${recent.length ? Math.round((connected / recent.length) * 100) : 0}%</b><span class="sub">${connected} of ${recent.length}</span></div></div>
      <nav class="seg" aria-label="Show">${[["open", `Open (${open.length})`], ["mine", `Mine (${mine.length})`], ["done", `Done (${done.length})`]].map(([k, l]) => html`<a href="#followup" data-act="follow-view" data-v="${k}" ${attr(followView === k, 'aria-current="page"')}>${l}</a>`)}</nav>
      <div class="rows">${list.length ? list.map(followRow) : empty(followView === "done" ? "Nobody here yet." : "Everyone's been followed up. New connect cards, first-time families and new members show up here.")}</div>
      <div class="btns"><button class="btn" data-act="follow-new">${icon("plus")}Add someone</button><button class="btn ghost" data-act="follow-steps">${icon("list")}Next steps</button>${S.can("view.reports") ? html`<a class="btn ghost" href="#reports">${icon("calendar")}Reports</a>` : ""}</div>`,
  };
};
function followRow(f) {
  const [label, cls] = FOLLOW_STATUS[f.status];
  return html`<a class="row" href="#guest-${f.id}">${avatar({ id: f.personId || f.id, name: f.name })}<span class="body"><span class="t">${f.name}</span>
    <span class="s">${f.reason}, ${ago(f.at)}. ${stepsDone(f)} of ${f.steps.length} steps${f.assignedTo ? `, ${S.userName(f.assignedTo).split(" ")[0]}` : ""}</span></span><span class="tag ${cls}">${label}</span></a>`;
}
Actions["follow-view"] = (el) => { followView = el.dataset.v; render(); };

Screens.guest = (id) => {
  const f = S.get("followups", id);
  if (!f || !canFollow()) return { redirect: "followup" };
  const person = f.personId && S.user(f.personId);
  const visits = f.personId ? S.list("checkins").filter((x) => x.by === f.personId) : [];
  const days = [...new Set(visits.map((x) => x.serviceKey.slice(0, 10)))].sort();
  const kidsNames = person ? familyOf(person.id).filter((p) => p.kind === "child").map((p) => p.name.split(" ")[0]) : [];
  const phone = f.phone || person?.phone, email = f.email || person?.email;
  return {
    title: f.name, back: "followup",
    body: html`<div style="display:flex;gap:14px;align-items:center;margin-top:18px">${avatar({ id: f.personId || f.id, name: f.name }, "lg")}<div style="flex:1;min-width:0"><h1 style="font-size:1.5rem">${f.name}</h1>
        <p class="muted" style="margin:0">${FOLLOW_SOURCE[f.source] || "Added"}, ${fmtShort(f.at)}${kidsNames.length ? `. Kids: ${listJoin(kidsNames)}` : ""}</p></div></div>
      <div class="panel" style="margin-top:14px"><b>${f.reason}</b>${f.message ? html`<p style="margin:6px 0 0">"${f.message}"</p>` : ""}
        ${days.length ? html`<p class="faint" style="margin:8px 0 0">Kids checked in on ${plural(days.length, "Sunday")}, most recently ${fmtShort(fromIsoDay(days[days.length - 1]))}.</p>` : ""}</div>
      <div class="btns">${phone ? html`<a class="btn sm" href="tel:${digits(phone)}">${icon("phone")}Call</a><a class="btn ghost sm" href="sms:${digits(phone)}">${icon("chat")}Text</a>` : ""}${email ? html`<a class="btn ghost sm" href="mailto:${email}">${icon("mail")}Email</a>` : ""}
        ${!phone && !email ? html`<span class="faint">No phone or email on file.</span>` : ""}<button class="btn ghost sm" data-act="follow-edit" data-id="${f.id}">${icon("edit")}Edit</button></div>

      <section class="sec"><h2 class="sec-head">Status</h2>
        <nav class="seg" aria-label="Status" style="margin-top:0">${Object.entries(FOLLOW_STATUS).map(([k, [l]]) => html`<a href="#guest-${f.id}" data-act="follow-status" data-id="${f.id}" data-v="${k}" ${attr(f.status === k, 'aria-current="page"')}>${l}</a>`)}</nav>
        <label class="field"><span>Followed up by</span><select data-change="follow-assign" data-id="${f.id}"><option value="">Nobody yet</option>${followers().map((u) => html`<option value="${u}" ${attr(u === f.assignedTo, "selected")}>${S.userName(u)}${u === S.me().id ? " (you)" : ""}</option>`)}</select></label></section>

      <section class="sec"><h2 class="sec-head">Next steps</h2><div class="rows">${f.steps.map((s) => html`<button class="row step-row ${s.done ? "done" : ""}" data-act="follow-step" data-id="${f.id}" data-step="${s.id}" aria-pressed="${s.done}">
        <span class="tick">${s.done ? icon("check") : ""}</span><span class="body"><span class="t">${s.label}</span>${s.done ? html`<span class="s">${S.userName(s.by)}, ${ago(s.doneAt)}</span>` : ""}</span></button>`)}</div></section>

      <section class="sec"><h2 class="sec-head">Notes</h2>
        <form data-form="follow-note" class="panel" novalidate><input type="hidden" name="id" value="${f.id}"><label class="field" style="margin-top:0"><span class="sr">Add a note</span><textarea name="text" placeholder="What happened? What's next?" style="min-height:70px"></textarea></label><button class="btn sm">Add note</button></form>
        <div class="rows" style="margin-top:10px">${f.notes.length ? f.notes.slice().reverse().map((n) => html`<div class="row"><span class="body"><span class="s">${n.by ? S.userName(n.by) : "From the app"}, ${ago(n.at)}</span><span style="white-space:pre-line">${n.text}</span></span></div>`) : empty("No notes yet.")}</div></section>`,
  };
};
const findFollow = (el) => S.get("followups", el.dataset.id);
Actions["follow-status"] = (el) => { const f = findFollow(el); f.status = el.dataset.v; if (f.cardId && (f.status === "connected" || f.status === "closed")) S.update("cards", f.cardId, { handled: true }); S.save(); render(); };
Inputs["follow-assign"] = (el) => {
  const f = S.get("followups", el.dataset.id); f.assignedTo = el.value || null; S.save();
  if (f.assignedTo && f.assignedTo !== S.me().id) notify(f.assignedTo, { kind: "follow", title: `Please follow up with ${f.name}`, body: f.reason, link: `#guest-${f.id}` });
  toast(f.assignedTo ? `${S.userName(f.assignedTo)} will follow up` : "Unassigned"); render();
};
Actions["follow-step"] = (el) => {
  const f = findFollow(el), s = f.steps.find((x) => x.id === el.dataset.step);
  Object.assign(s, s.done ? { done: false, doneAt: null, by: null } : { done: true, doneAt: new Date().toISOString(), by: S.me().id });
  if (s.done && f.status === "new") f.status = "contacted";
  S.save(); render();
  if (s.done && f.steps.every((x) => x.done) && f.status !== "connected") toast(`All steps done. Mark ${f.name.split(" ")[0]} as connected when they've found their place.`);
};
Forms["follow-note"] = (d, f) => {
  if (!d.text) return formError(f, "Write a note first.");
  S.get("followups", d.id).notes.push({ id: uid(), by: S.me().id, at: new Date().toISOString(), text: d.text }); S.save(); render();
};
function followForm(f = {}) {
  return html`<form data-form="follow-save" novalidate><input type="hidden" name="id" value="${f.id || ""}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${f.name || ""}" required maxlength="60"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Phone</span><input type="tel" name="phone" value="${f.phone || ""}" maxlength="20"></label>
      <label class="field"><span>Email</span><input type="email" name="email" value="${f.email || ""}" maxlength="80"></label></div>
    <label class="field"><span>How we met</span><input type="text" name="reason" value="${f.reason || ""}" maxlength="80" placeholder="Visited the 11:00 service"></label>
    <label class="field"><span>Anything else</span><textarea name="message" style="min-height:70px">${f.message || ""}</textarea></label>
    <div class="btns"><button class="btn">${f.id ? "Save" : "Add"}</button>${f.id ? html`<button type="button" class="btn danger" data-act="follow-delete" data-id="${f.id}">Delete</button>` : ""}</div></form>`;
}
Actions["follow-new"] = () => openSheet("Add someone new", followForm());
Actions["follow-edit"] = (el) => openSheet("Edit", followForm(findFollow(el)));
Forms["follow-save"] = (d, form) => {
  if (!d.name) return formError(form, "Enter their name.");
  const rec = { name: d.name, phone: d.phone, email: d.email, reason: d.reason || "Met at church", message: d.message };
  if (d.id) { S.update("followups", d.id, rec); closeSheet(); render(); return; }
  const f = startFollowup({ ...rec, source: "manual" }); closeSheet(true); go(`guest-${f.id}`);
};
Actions["follow-delete"] = (el) => { S.remove("followups", el.dataset.id); closeSheet(true); toast("Deleted"); go("followup"); };
Actions["follow-steps"] = () => {
  const c = S.church();
  openSheet("Next steps for new people", html`<form data-form="follow-steps" novalidate>
    <label class="field"><span>Steps</span><textarea name="steps" style="min-height:140px">${followSteps(c).join("\n")}</textarea><small>One per line. New people get these steps. People already being followed up keep theirs.</small></label>
    <label class="field"><span>New people go to</span><select name="lead">${followers().map((u) => html`<option value="${u}" ${attr(u === (c.followupLead || c.ownerId), "selected")}>${S.userName(u)}</option>`)}</select></label>
    <button class="btn block">Save</button></form>`);
};
Forms["follow-steps"] = (d, f) => {
  const steps = d.steps.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!steps.length) return formError(f, "Add at least one step.");
  Object.assign(S.church(), { followupSteps: steps, followupLead: d.lead }); S.save(); closeSheet(); toast("Saved"); render();
};
