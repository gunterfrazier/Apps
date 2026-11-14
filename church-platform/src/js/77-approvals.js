// ---------- Approvals: who hears about requests, and volunteers who don't have to wait ----------
// Three kinds of request wait for someone to approve them: room bookings, joining a volunteer team, and joining a class
// or group whose leader approves each request. Each one can notify everyone who's allowed to approve it (on by default;
// the person asking can turn it off for one request). Volunteers can be pre-approved: everyone, or chosen people.
// Anyone else's request to serve goes to everyone who schedules volunteer teams.

const APPROVALS = {
  rooms: { label: "Room requests", perm: "manage.locations", who: "Everyone who manages campuses, locations and rooms", link: "#rooms" },
  volunteers: { label: "Requests to join a volunteer team", perm: "schedule.teams", who: "Everyone who schedules volunteer teams", link: "#teams" },
  groups: { label: "Requests to join a class or group", perm: "manage.classes", who: "The class's teachers or the group's leaders, and everyone who manages classes and groups", link: "#classes" },
};
/** The church's approval settings, with the defaults filled in. */
function approvalSettings(c = S.church()) {
  const a = c?.approvals || {};
  return {
    notify: { rooms: a.notify?.rooms !== false, volunteers: a.notify?.volunteers !== false, groups: a.notify?.groups !== false },
    volunteers: { pre: ["all", "some"].includes(a.volunteers?.pre) ? a.volunteers.pre : "none", people: Array.isArray(a.volunteers?.people) ? a.volunteers.people : [] },
  };
}
/** Everyone who can approve this kind of request (plus anyone named, such as a group's leaders), except the person asking. */
function approversFor(kind, extra = []) {
  const perm = APPROVALS[kind].perm, c = S.church(), me = S.me().id;
  const withPerm = S.members().map((m) => m.userId).filter((u) => S.role(c.id, u)?.perms?.[perm]);
  return [...new Set([c.ownerId, ...withPerm, ...extra])].filter((u) => u && u !== me);
}
/** A volunteer who can join a team without waiting: schedulers, and people the church pre-approved. */
function volunteerPreApproved(userId = S.me().id) {
  if (S.role(S.state.current, userId)?.perms?.["schedule.teams"]) return true;
  const v = approvalSettings().volunteers;
  return v.pre === "all" || (v.pre === "some" && v.people.includes(userId));
}
/** The box on a request form: tell everyone who can approve it. */
function approvalNotifyField(kind, extra = []) {
  const n = approversFor(kind, extra).length;
  if (!n) return html`<p class="faint" style="margin:4px 0 0">${icon("info")} Nobody else can approve this yet, so it waits in the list until someone can.</p>`;
  return html`<label class="check"><input type="checkbox" name="notifyApprovers" ${attr(approvalSettings().notify[kind], "checked")}><span>Notify everyone who can approve this (${plural(n, "person", "people")})</span></label>`;
}
function notifyApprovers(kind, n, extra = []) { approversFor(kind, extra).forEach((u) => notify(u, { kind: kind === "rooms" ? "room" : kind === "volunteers" ? "serve" : "group", ...n })); }
/** Requests waiting now, for the approvals page and the Admin list. */
function waitingRequests() {
  const today = isoDay(new Date()), out = { rooms: [], volunteers: [], groups: [] };
  if (S.can("manage.locations")) out.rooms = S.list("bookings").filter((b) => b.status === "requested" && (b.repeat === "weekly" ? !b.until || b.until >= today : b.date >= today));
  if (S.can("schedule.teams")) out.volunteers = S.list("teamMembers").filter((m) => m.status === "requested" && S.user(m.userId));
  out.groups = S.list("gatherings").filter((g) => S.can("manage.classes") || isLeader(g)).flatMap((g) => (g.members || []).filter((m) => m.status === "requested").map((m) => ({ g, m })));
  return out;
}

// ----- Admin, Approvals -----
AdminScreens.approvals = () => {
  if (!S.isMember() || !S.canAny(["manage.church", "manage.locations", "schedule.teams", "manage.classes"])) return guard("manage.church");
  const st = approvalSettings(), edit = S.can("manage.church"), w = waitingRequests();
  const names = (ids) => { const n = ids.map((u) => S.userName(u)); return n.length > 3 ? `${n.slice(0, 3).join(", ")} and ${n.length - 3} more` : listJoin(n); };
  const people = S.members().filter((m) => S.user(m.userId)).map((m) => ({ id: m.userId, name: S.userName(m.userId) })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: "Approvals", back: "admin",
    body: html`<p class="muted" style="margin-top:16px">Choose who hears about requests, and which volunteers can join a team without waiting.</p>
      ${w.rooms.length || w.volunteers.length || w.groups.length ? html`<section class="sec"><h2 class="sec-head">Waiting now</h2><div class="rows">
        ${w.rooms.length ? html`<a class="row" href="#rooms"><span class="lead-ic">${icon("door")}</span><span class="body"><span class="t">${plural(w.rooms.length, "room request")}</span><span class="s">Approve or decline under Rooms</span></span><span class="tag warn">${w.rooms.length}</span></a>` : ""}
        ${w.volunteers.length ? html`<a class="row" href="#teams"><span class="lead-ic">${icon("hand")}</span><span class="body"><span class="t">${plural(w.volunteers.length, "request")} to serve</span><span class="s">${listJoin([...new Set(w.volunteers.map((m) => m.team))])}</span></span><span class="tag warn">${w.volunteers.length}</span></a>` : ""}
        ${w.groups.map(({ g, m }) => html`<a class="row" href="#gathering-${g.id}"><span class="lead-ic">${icon("people")}</span><span class="body"><span class="t">${m.name} asked to join ${g.name}</span><span class="s">${fmtShort(m.at)}</span></span>${icon("chev")}</a>`)}
      </div></section>` : ""}
      <form data-form="approvals-save" novalidate>
        <section class="sec"><h2 class="sec-head">Notify everyone who can approve</h2>
          <p class="faint" style="margin-top:-4px">When someone sends a request, everyone below gets a notification. The person asking can turn it off for one request.</p>
          <div class="rows">${Object.entries(APPROVALS).map(([k, a]) => { const ids = k === "groups" ? [] : approversFor(k);
            return html`<label class="row" style="cursor:pointer"><input type="checkbox" name="notify-${k}" ${attr(st.notify[k], "checked")} ${attr(!edit, "disabled")} style="accent-color:var(--brand)"><span class="body"><span class="t">${a.label}</span><span class="s">${a.who}${ids.length ? `: ${names(ids)}` : ""}</span></span></label>`; })}</div></section>
        <section class="sec"><h2 class="sec-head">Volunteer requests</h2>
          <p class="faint" style="margin-top:-4px">Pre-approved people join a team right away. Anyone else's request goes to everyone who schedules volunteer teams.</p>
          <div class="rows">${[["none", "Review every request", "Nobody is pre-approved"], ["all", "Pre-approve everyone", "Anyone who joins a team is on it right away"], ["some", "Pre-approve chosen people", "Pick the people below"]].map(([v, t, s]) => html`<label class="row" style="cursor:pointer"><input type="radio" name="pre" value="${v}" data-change="approvals-pre" ${attr(st.volunteers.pre === v, "checked")} ${attr(!edit, "disabled")} style="accent-color:var(--brand)"><span class="body"><span class="t">${t}</span><span class="s">${s}</span></span></label>`)}</div>
          <fieldset class="field pre-people" style="border:0;padding:0" ${attr(st.volunteers.pre !== "some", "hidden")}><legend class="flabel">Pre-approved people</legend>
            <input type="search" placeholder="Find someone" data-input="pre-find" aria-label="Find someone" style="margin-bottom:8px">
            <div class="pick-list">${people.map((p) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="people" value="${p.id}" ${attr(st.volunteers.people.includes(p.id), "checked")} ${attr(!edit, "disabled")}><span>${p.name}</span></label>`)}</div></fieldset></section>
        ${edit ? html`<div class="btns"><button class="btn">Save</button></div>` : html`<p class="faint">Only people who manage the church account can change these.</p>`}</form>`,
  };
};
Inputs["approvals-pre"] = (el) => { const box = $(".pre-people", el.form); if (box) box.hidden = el.value !== "some"; };
Inputs["pre-find"] = (el) => { const q = el.value.trim().toLowerCase(); $$(".pre-people .pick-list label", el.form).forEach((l) => { l.hidden = !!q && !l.textContent.toLowerCase().includes(q); }); };
Forms["approvals-save"] = (d, f, fd) => {
  if (!S.can("manage.church")) return formError(f, "Only people who manage the church account can change these.");
  const pre = ["all", "some"].includes(d.pre) ? d.pre : "none", people = fd.getAll("people");
  if (pre === "some" && !people.length) return formError(f, "Choose at least one person to pre-approve, or pick another option.");
  S.church().approvals = { notify: Object.fromEntries(Object.keys(APPROVALS).map((k) => [k, !!d[`notify-${k}`]])), volunteers: { pre, people: pre === "some" ? people : [] } };
  // Pre-approving people also lets in anyone already waiting who now qualifies.
  const now = S.list("teamMembers").filter((m) => m.status === "requested" && volunteerPreApproved(m.userId));
  now.forEach((m) => approveTeamRequest(m, true));
  S.save(); toast(now.length ? `Saved. ${plural(now.length, "waiting request")} approved.` : "Saved"); render();
};

// ----- Requests to join a volunteer team -----
const teamRequestsOf = (team) => S.list("teamMembers").filter((m) => m.status === "requested" && (!team || m.team === team) && S.user(m.userId));
const myTeamRequest = (team) => S.list("teamMembers").find((m) => m.team === team && m.userId === S.me().id && m.status === "requested");
function approveTeamRequest(m, quiet) {
  delete m.status; m.approvedBy = S.me().id; m.approvedAt = new Date().toISOString();
  notify(m.userId, { kind: "serve", title: `You're on the ${m.team} team`, body: quiet ? "Your request to serve was approved." : `${S.me().name} approved your request to serve.`, link: "#serving" });
  emit("volunteer.joined", { team: m.team, person: S.userName(m.userId) });
}
Actions["team-approve"] = (el) => {
  const m = S.get("teamMembers", el.dataset.id); if (!m || m.status !== "requested") return;
  approveTeamRequest(m); S.save(); toast(`${S.userName(m.userId)} is on the ${m.team} team`); render();
};
Actions["team-approve-all"] = (el) => {
  const list = teamRequestsOf(el.dataset.team || ""); list.forEach((m) => approveTeamRequest(m));
  S.save(); toast(`${plural(list.length, "request")} approved`); render();
};
Actions["team-decline"] = (el) => openSheet("Decline this request?", html`<form data-form="team-decline" novalidate><input type="hidden" name="id" value="${el.dataset.id}">
  <p class="muted" style="margin-top:0">${S.userName(S.get("teamMembers", el.dataset.id)?.userId)} asked to join the ${S.get("teamMembers", el.dataset.id)?.team} team.</p>
  <label class="field"><span>A note for them (optional)</span><input type="text" name="why" maxlength="160" placeholder="We're full for now. We'll reach out when a spot opens."></label><button class="btn block danger">Decline</button></form>`);
Forms["team-decline"] = (d) => {
  const m = S.get("teamMembers", d.id); if (!m) return;
  S.remove("teamMembers", m.id);
  notify(m.userId, { kind: "serve", title: `Your request to join ${m.team}`, body: `It wasn't approved this time${d.why ? `. "${d.why}"` : "."}`, link: "#serving" });
  closeSheet(); toast("Declined"); render();
};
/** A scheduler's list of people waiting to join, for one team or all of them. */
function teamRequestsSection(team) {
  if (!canSchedule()) return "";
  const list = teamRequestsOf(team); if (!list.length) return "";
  return html`<section class="sec"><div class="sec-head"><h2>Asking to serve</h2>${list.length > 1 ? html`<button class="btn sm" data-act="team-approve-all" data-team="${team || ""}">${icon("check")}Approve all ${list.length}</button>` : ""}</div>
    <div class="rows">${list.map((m) => html`<div class="row" style="align-items:flex-start">${avatar(S.user(m.userId))}<span class="body"><span class="t">${S.userName(m.userId)}</span><span class="s">${team ? "" : `${m.team} team. `}Asked ${ago(m.at)}${m.note ? `: "${m.note}"` : ""}</span>
      <span class="btns" style="margin-top:8px"><button class="btn sm" data-act="team-approve" data-id="${m.id}">${icon("check")}Approve</button><button class="btn ghost sm" data-act="team-decline" data-id="${m.id}">Decline</button></span></span></div>`)}</div></section>`;
}
