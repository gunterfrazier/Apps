// ---------- Volunteer scheduling: teams, positions, who serves when, drag-and-drop matrix, calendar & dates away ----------
// Schedulers ask people to fill a position for a service plan or drag-and-drop volunteers into weekly service slots.
// People accept, decline, or request a sub from #serving and mark out-of-town blockout dates or recurring unavailability.

const canSchedule = () => S.isMember() && S.can("schedule.teams");
const teamsOf = (c = S.church()) => c.teams || [];
const positionsOf = (team, c = S.church()) => c.positions?.[team] || [];
// A request to join (status "requested") isn't on the team until a scheduler approves it, unless the person was pre-approved.
const teamMembersOf = (team) => S.list("teamMembers").filter((m) => m.team === team && m.status !== "requested" && S.user(m.userId));
const myTeams = () => S.list("teamMembers").filter((m) => m.userId === S.me().id && m.status !== "requested").map((m) => m.team);
const planLabel = (p) => `${p.title}, ${fmtShort(fromIsoDay(p.date))} at ${timeLabel(p.time, tzOf(p), p.date)}`;
const upcomingPlans = () => { const t = isoDay(new Date()); return S.list("services").filter((p) => p.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); };
const myAssignments = (userId = S.me().id) => upcomingPlans().flatMap((p) => (p.assignments || []).filter((a) => a.userId === userId).map((a) => [p, a]));
const pendingAsks = () => S.isMember() ? myAssignments().filter(([, a]) => a.status === "pending") : [];

/** Recurring unavailability patterns supported alongside date-range blockouts. */
const RECUR_BLOCKOUTS = [
  ["", "One-time date or range"],
  ["nth-1-0", "Every 1st Sunday of the month"],
  ["nth-2-0", "Every 2nd Sunday of the month"],
  ["nth-3-0", "Every 3rd Sunday of the month"],
  ["nth-4-0", "Every 4th Sunday of the month"],
  ["nth-5-0", "Every 5th Sunday of the month"],
  ["dow-3", "Every Wednesday"],
  ["dow-6", "Every Saturday"],
];
const recurLabel = (r) => (RECUR_BLOCKOUTS.find(([k]) => k === r) || ["", ""])[1];
function matchesRecurBlockout(b, dayIso) {
  if (!b.recur) return false;
  const dow = isoDow(dayIso), dom = isoParts(dayIso)[2];
  if (b.from && dayIso < b.from) return false;
  if (b.to && b.to !== b.from && dayIso > b.to) return false;
  if (b.recur.startsWith("dow-")) return dow === +b.recur.slice(4);
  if (b.recur.startsWith("nth-")) {
    const [, nth, want] = b.recur.split("-");
    return dow === +want && Math.ceil(dom / 7) === +nth;
  }
  return false;
}

/** Dates away apply at every church the person belongs to. */
const awayDates = (userId) => S.state.blockouts.filter((b) => b.userId === userId);
const isAway = (userId, day) => awayDates(userId).some((b) => (b.recur ? matchesRecurBlockout(b, day) : (b.from <= day && day <= (b.to || b.from))));
const awayReason = (userId, day) => {
  const b = awayDates(userId).find((x) => (x.recur ? matchesRecurBlockout(x, day) : (x.from <= day && day <= (x.to || x.from))));
  return b ? (b.note || (b.recur ? recurLabel(b.recur) : "Out of town")) : "";
};

/** How often someone was asked in the eight weeks either side of a date, so "Fill open spots" is fair. */
function recentLoad(userId, day) {
  const d = fromIsoDay(day).getTime();
  return S.list("services").filter((p) => Math.abs(fromIsoDay(p.date).getTime() - d) < 56 * DAY)
    .reduce((n, p) => n + (p.assignments || []).filter((a) => a.userId === userId && a.status !== "declined").length, 0);
}
const ASK_STATUS = { pending: ["Waiting", ""], accepted: ["Confirmed", "ok"], declined: ["Can't serve", "warn"], sub: ["Sub needed", "warn"] };
/** Every position on every team for one plan, with whoever has been asked. */
const spots = (p) => teamsOf().flatMap((team) => positionsOf(team).map((position) => ({ team, position, people: (p.assignments || []).filter((a) => a.team === team && a.position === position) })));
function fillStats(p) {
  const s = spots(p);
  return {
    total: s.length,
    confirmed: s.filter((x) => x.people.some((a) => a.status === "accepted")).length,
    waiting: (p.assignments || []).filter((a) => a.status === "pending" || a.status === "sub").length,
    open: s.filter((x) => !x.people.some((a) => a.status !== "declined")).length,
  };
}
const fillText = (st) => `${st.confirmed} of ${st.total} confirmed${st.waiting ? `, ${st.waiting} waiting` : ""}${st.open ? `, ${st.open} open` : ""}`;

function askPerson(p, team, position, userId) {
  p.assignments ||= [];
  const existing = p.assignments.find((a) => a.team === team && a.position === position && a.userId === userId && a.status !== "declined");
  if (existing) return existing;
  const self = userId === S.me().id;
  const a = { id: uid(), team, position, userId, status: self ? "accepted" : "pending", note: "", by: S.me().id, at: new Date().toISOString() };
  p.assignments.push(a);
  if (!self) notify(userId, { kind: "serve", title: "Can you serve?", body: `${position} on the ${team} team, ${planLabel(p)}`, link: "#serving" });
  emit("volunteer.scheduled", { service: planLabel(p), team, position, person: S.userName(userId) });
  return a;
}

// ----- Interactive Blockout Mini-Calendar on #serving -----
let servingCalMonth = isoDay(new Date()).slice(0, 7);
function renderBlockoutMiniCal(userId) {
  const [yr, mo] = servingCalMonth.split("-").map(Number);
  const first = new Date(yr, mo - 1, 1), daysInMonth = new Date(yr, mo, 0).getDate(), startDow = first.getDay();
  const today = isoDay(new Date());
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(html`<span class="bcal-empty"></span>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const blocked = isAway(userId, dayStr);
    const assigned = S.list("services").some((p) => p.date === dayStr && (p.assignments || []).some((a) => a.userId === userId && a.status !== "declined"));
    const isPast = dayStr < today;
    cells.push(html`<button type="button" class="bcal-day ${blocked ? "is-away" : ""} ${assigned ? "is-serving" : ""} ${dayStr === today ? "is-today" : ""}" data-act="bcal-toggle" data-day="${dayStr}" ${attr(isPast, "disabled")} title="${blocked ? `Blocked out: ${awayReason(userId, dayStr)}` : assigned ? "Scheduled to serve" : `Tap to mark ${dayStr} away`}"><span>${d}</span>${assigned ? html`<i class="bcal-dot ok"></i>` : blocked ? html`<i class="bcal-dot warn"></i>` : ""}</button>`);
  }
  const monthLabel = first.toLocaleDateString([], { month: "long", year: "numeric" });
  return html`<div class="panel bcal-panel">
    <div class="bcal-head">
      <button type="button" class="icon-btn sm" data-act="bcal-nav" data-dir="-1" aria-label="Previous month">${icon("back")}</button>
      <b>${monthLabel}</b>
      <button type="button" class="icon-btn sm" data-act="bcal-nav" data-dir="1" aria-label="Next month">${icon("chev")}</button>
    </div>
    <div class="bcal-weekdays">${["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => html`<span>${w}</span>`)}</div>
    <div class="bcal-grid">${cells}</div>
    <div class="bcal-legend"><span><i class="bcal-dot warn"></i>Out of town / blocked out</span><span><i class="bcal-dot ok"></i>Scheduled to serve</span><span class="faint">Tap any date to toggle</span></div>
  </div>`;
}
Actions["bcal-nav"] = (el) => {
  const [yr, mo] = servingCalMonth.split("-").map(Number);
  const d = new Date(yr, mo - 1 + (+el.dataset.dir), 1);
  servingCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  render();
};
Actions["bcal-toggle"] = (el) => {
  const day = el.dataset.day, me = S.me().id;
  const exact = S.state.blockouts.find((b) => b.userId === me && !b.recur && b.from === day && (b.to || b.from) === day);
  if (exact) {
    S.state.blockouts = S.state.blockouts.filter((b) => b.id !== exact.id);
    S.save(); toast(`Available on ${fmtShort(fromIsoDay(day))}`); render();
  } else if (isAway(me, day)) {
    openSheet("Manage blockout", html`<p style="margin-top:0">${fmtDay(fromIsoDay(day))} is covered by a multi-day or recurring blockout (${awayReason(me, day)}). Remove it under "Dates you're away" below.</p><button class="btn block" data-act="close-sheet">OK</button>`);
  } else {
    S.state.blockouts.push({ id: uid(), churchId: S.state.current, userId: me, from: day, to: day, note: "Out of town" });
    S.save(); toast(`Marked away on ${fmtShort(fromIsoDay(day))}`); render();
  }
};

// ----- The volunteer's own view -----
function askCard([p, a]) {
  const d = fromIsoDay(p.date), [label, cls] = ASK_STATUS[a.status] || ASK_STATUS.pending;
  const isMe = a.userId === S.me().id;
  return html`<div class="ask-card ${a.status}"><div class="row" style="padding:0"><span class="date"><span>${fmtMonth(d)}</span><b>${dayNum(d)}</b></span>
      <span class="body"><span class="t">${a.position}, ${a.team}</span><span class="s">${p.title} at ${timeLabel(p.time, tzOf(p), p.date)}${p.locationId ? `, ${locName(p.locationId)}` : ""}</span>
      ${a.status !== "pending" ? html`<span class="tag ${cls}" style="margin-top:4px">${label}</span>` : ""}${a.note ? html`<span class="s">"${a.note}"</span>` : ""}</span></div>
    <div class="btns" style="margin-top:10px">${isMe && a.status === "pending" ? html`<button class="btn sm" data-act="ask-yes" data-plan="${p.id}" data-id="${a.id}">${icon("check")}Accept</button><button class="btn ghost sm" data-act="ask-no" data-plan="${p.id}" data-id="${a.id}">Decline</button>`
      : isMe && a.status === "accepted" ? html`<button class="btn ghost sm" data-act="ask-sub" data-plan="${p.id}" data-id="${a.id}">${icon("people")}Request a sub</button><button class="btn ghost sm" data-act="ask-no" data-plan="${p.id}" data-id="${a.id}">I can't make it</button>`
      : isMe ? html`<button class="btn ghost sm" data-act="ask-yes" data-plan="${p.id}" data-id="${a.id}">I can serve after all</button>` : ""}</div></div>`;
}

Screens.serving = () => {
  if (!S.isMember()) return { title: "Serving", back: "me", body: needMember("serve on a team") };
  const me = S.me().id, today = isoDay(new Date());
  const mine = myAssignments(), pending = mine.filter(([, a]) => a.status === "pending"), rest = mine.filter(([, a]) => a.status !== "pending");
  const teams = myTeams(), away = awayDates(me).filter((b) => b.recur || (b.to || b.from) >= today).sort((a, b) => (a.from || "").localeCompare(b.from || ""));
  // Open sub requests on my teams that I could claim
  const openSubs = upcomingPlans().flatMap((p) => (p.assignments || []).filter((a) => a.status === "sub" && a.userId !== me && teams.includes(a.team) && !isAway(me, p.date)).map((a) => [p, a]));
  return {
    title: "Serving", back: "me",
    body: html`
      ${canSchedule() ? html`<div class="btns" style="margin-top:12px"><a class="btn sm" href="#schedule-matrix">${icon("calendar")}Drag &amp; drop scheduler</a><a class="btn ghost sm" href="#schedule-calendar">${icon("calendar")}Staffing calendar</a><a class="btn ghost sm" href="#teams">${icon("people")}Teams</a></div>` : ""}
      ${pending.length ? html`<section class="sec"><h2 class="sec-head">Can you serve?</h2><div class="ask-list">${pending.map(askCard)}</div></section>` : ""}
      ${openSubs.length ? html`<section class="sec"><h2 class="sec-head">Teammates needing a sub</h2><div class="rows">${openSubs.map(([p, a]) => html`<div class="row"><span class="body"><span class="t">${a.position} (${a.team})</span><span class="s">${planLabel(p)} · Covering for ${S.userName(a.userId)}${a.note ? ` ("${a.note}")` : ""}</span></span><button class="btn sm" data-act="sub-claim" data-plan="${p.id}" data-id="${a.id}">Claim spot</button></div>`)}</div></section>` : ""}
      <section class="sec"><h2 class="sec-head">Your schedule</h2>${rest.length ? html`<div class="ask-list">${rest.map(askCard)}</div>` : html`<div class="rows">${empty(teams.length ? "You're not on the schedule yet. When a scheduler asks you to serve, it shows up here." : "Join a team below to be asked to serve.")}</div>`}</section>
      <section class="sec"><div class="sec-head"><h2>Dates you're away &amp; availability</h2><button class="btn sm" data-act="away-add">${icon("plus")}Add blockout dates</button></div>
        <p class="faint" style="margin-top:-4px">Tap dates on your availability calendar or add vacation ranges and recurring blockouts so schedulers know when you're out of town.</p>
        ${renderBlockoutMiniCal(me)}
        <div class="rows" style="margin-top:10px">${away.length ? away.map((b) => html`<div class="row"><span class="lead-ic">${icon("calendar")}</span><span class="body"><span class="t">${b.recur ? recurLabel(b.recur) : b.to && b.to !== b.from ? `${fmtShort(fromIsoDay(b.from))} to ${fmtShort(fromIsoDay(b.to))}` : fmtDay(fromIsoDay(b.from))}</span>${b.note ? html`<span class="s">${b.note}</span>` : ""}</span>
          <button class="icon-btn" data-act="away-delete" data-id="${b.id}" aria-label="Remove these dates">${icon("trash")}</button></div>`) : empty("No blockout dates added.")}</div></section>
      <section class="sec"><h2 class="sec-head">Teams</h2><div class="rows">${teamsOf().map((t, i) => {
        const on = teams.includes(t), asked = !on && myTeamRequest(t), n = teamMembersOf(t).length;
        return html`<div class="row"><span class="lead-ic">${icon(on ? "check" : "hand")}</span><a class="body" href="#team-${i}" style="color:inherit;text-decoration:none"><span class="t">${t}</span><span class="s">${plural(n, "person", "people")}${positionsOf(t).length ? `. ${positionsOf(t).join(", ")}` : ""}</span></a>
          ${asked ? html`<span class="tag">Requested</span><button class="btn ghost sm" data-act="team-leave" data-team="${t}" aria-label="Cancel your request to join ${t}">Cancel</button>` : html`<button class="btn ${on ? "ghost" : ""} sm" data-act="${on ? "team-leave" : "team-join"}" data-team="${t}">${on ? "Leave" : "Join"}</button>`}</div>`;
      })}</div></section>
      <div class="btns">${S.on("checkin") ? html`<a class="btn ghost" href="#serve">${icon("check")}Check in to serve</a>` : ""}${canSchedule() ? html`<a class="btn ghost" href="#teams">${icon("people")}Schedule teams</a>` : ""}</div>`,
  };
};
const findAsk = (el) => { const p = S.get("services", el.dataset.plan); return [p, p?.assignments?.find((a) => a.id === el.dataset.id)]; };
function answerAsk(p, a, status, note = "") {
  Object.assign(a, { status, note, respondedAt: new Date().toISOString() });
  const who = S.me().name;
  if (a.by && a.by !== S.me().id) notify(a.by, { kind: "serve", title: status === "accepted" ? `${who} will serve` : status === "sub" ? `${who} requested a sub` : `${who} can't serve`, body: `${a.position}, ${planLabel(p)}${note ? `. "${note}"` : ""}`, link: `#crew-${p.id}` });
  emit("volunteer.responded", { service: planLabel(p), team: a.team, position: a.position, person: who, status, note });
  S.save();
}
Actions["ask-yes"] = (el) => { const [p, a] = findAsk(el); if (!a) return; answerAsk(p, a, "accepted"); toast("Thanks! You're on the schedule"); render(); };
Actions["ask-no"] = (el) => {
  const [p, a] = findAsk(el); if (!a) return;
  openSheet("Can't serve?", html`<form data-form="ask-decline" novalidate><input type="hidden" name="plan" value="${p.id}"><input type="hidden" name="id" value="${a.id}">
    <p class="muted" style="margin-top:0">${a.position} on the ${a.team} team, ${planLabel(p)}.</p>
    <label class="field"><span>A note for the scheduler (optional)</span><input type="text" name="note" maxlength="120" placeholder="Out of town that weekend"></label>
    <label class="check"><input type="checkbox" name="away" checked><span>Also mark me away that day</span></label>
    <button class="btn block">Decline</button></form>`);
};
Forms["ask-decline"] = (d) => {
  const p = S.get("services", d.plan), a = p?.assignments?.find((x) => x.id === d.id); if (!a) return;
  answerAsk(p, a, "declined", d.note);
  if (d.away && !isAway(S.me().id, p.date)) S.state.blockouts.push({ id: uid(), churchId: S.state.current, userId: S.me().id, from: p.date, to: p.date, note: d.note });
  S.save(); closeSheet(); toast("Thanks for letting us know"); render();
};
/** All ministry leaders / schedulers who should be notified when a sub or shift swap is requested or claimed. */
function teamLeadersToNotify(a) {
  const schedulers = S.members().filter((m) => S.can("schedule.teams", m.churchId) || S.role(m.churchId, m.userId)?.perms?.["schedule.teams"]).map((m) => m.userId);
  return [...new Set([a?.by, ...schedulers].filter((u) => u && u !== S.me().id && S.user(u)))];
}

Actions["ask-sub"] = (el) => {
  const [p, a] = findAsk(el); if (!a) return;
  const me = S.me().id;
  // Find qualified, non-blocked-out teammates on this team
  const eligibleMates = teamMembersOf(a.team).map((m) => m.userId).filter((u) => u !== me && !isAway(u, p.date) && !(p.assignments || []).some((x) => x.userId === u && x.status !== "declined"));
  // Find upcoming slots held by teammates on the same team that I am available to swap for
  const swapCandidates = upcomingPlans().filter((op) => op.id !== p.id && !isAway(me, op.date)).flatMap((op) =>
    (op.assignments || []).filter((oa) => oa.team === a.team && oa.userId !== me && oa.status !== "declined" && eligibleMates.includes(oa.userId))
      .map((oa) => ({ plan: op, assign: oa }))
  );

  openSheet("1-Tap Sub & Shift Swap", html`<form data-form="ask-sub" novalidate><input type="hidden" name="plan" value="${p.id}"><input type="hidden" name="id" value="${a.id}">
    <p class="muted" style="margin-top:0">We'll automatically message <b>${plural(eligibleMates.length, "qualified, available teammate")}</b> on the <b>${a.team}</b> team (skipping anyone blocked out or already scheduled). The first teammate to tap <b>Claim Spot</b> updates the roster and notifies your ministry leader.</p>
    ${swapCandidates.length ? html`<label class="field"><span>Sub or 1-for-1 shift swap?</span><select name="swapTarget">
      <option value="">Open Sub Request (anyone on ${a.team} can claim)</option>
      ${swapCandidates.map(({ plan: op, assign: oa }) => html`<option value="${op.id}~${oa.id}">Swap with ${S.userName(oa.userId)}: ${fmtShort(fromIsoDay(op.date))} (${oa.position})</option>`)}
    </select></label>` : html`<input type="hidden" name="swapTarget" value="">`}
    <label class="field"><span>Note for your team &amp; leader (optional)</span><input type="text" name="note" maxlength="120" placeholder="Last-minute family emergency — thank you for covering!"></label>
    <label class="check"><input type="checkbox" name="away" checked><span>Also mark me away on ${fmtShort(fromIsoDay(p.date))}</span></label>
    <button class="btn block">${icon("people")}Send 1-Tap Sub Request (${eligibleMates.length} available)</button></form>`);
};
Forms["ask-sub"] = (d) => {
  const p = S.get("services", d.plan), a = p?.assignments?.find((x) => x.id === d.id); if (!a) return;
  const me = S.me();
  let swapInfo = null;
  if (d.swapTarget) {
    const [opId, oaId] = d.swapTarget.split("~");
    const op = S.get("services", opId), oa = op?.assignments?.find((x) => x.id === oaId);
    if (op && oa) swapInfo = { planId: op.id, assignId: oa.id, targetUserId: oa.userId, date: op.date, position: oa.position, title: op.title };
  }
  a.swapOffer = swapInfo;
  a.subRequestedAt = new Date().toISOString();
  answerAsk(p, a, "sub", d.note);
  if (d.away && !isAway(me.id, p.date)) S.state.blockouts.push({ id: uid(), churchId: S.state.current, userId: me.id, from: p.date, to: p.date, note: d.note || "Sub requested" });
  const mates = teamMembersOf(a.team).map((m) => m.userId).filter((u) => u !== me.id && !isAway(u, p.date) && !(p.assignments || []).some((x) => x.userId === u && x.status !== "declined"));
  const targets = swapInfo ? [swapInfo.targetUserId] : mates;
  targets.forEach((u) => notify(u, {
    kind: "serve",
    title: swapInfo ? `Shift swap offer from ${me.name}` : `Sub needed: ${a.position} (${a.team})`,
    body: swapInfo
      ? `${me.name} will cover your ${fmtShort(fromIsoDay(swapInfo.date))} (${swapInfo.position}) if you cover ${planLabel(p)}. Tap to claim!`
      : `${me.name} needs a sub for ${a.position} at ${planLabel(p)}. First to tap Claim Spot takes it!`,
    link: "#serving",
  }));
  teamLeadersToNotify(a).forEach((lid) => notify(lid, {
    kind: "serve",
    title: `Sub requested: ${a.position} (${a.team})`,
    body: `${me.name} requested a sub for ${planLabel(p)}. Notified ${plural(targets.length, "available teammate")}.`,
    link: `#crew-${p.id}`,
  }));
  logActivity(`${me.name} requested a ${swapInfo ? "shift swap" : "sub"} for ${a.position} (${a.team}) on ${p.date}`, "serving");
  S.save(); closeSheet(); toast(`Notified ${plural(targets.length, "qualified, available teammate")}!`); render();
};
Actions["sub-claim"] = (el) => {
  const [p, a] = findAsk(el); if (!a || a.status !== "sub") { toast("This spot was already claimed."); render(); return; }
  const prevUser = a.userId, prevName = S.userName(prevUser), me = S.me();
  const swap = a.swapOffer;
  let swapMsg = "";
  if (swap) {
    const op = S.get("services", swap.planId), oa = op?.assignments?.find((x) => x.id === swap.assignId);
    if (op && oa) {
      Object.assign(oa, { userId: prevUser, status: "accepted", note: `Swapped with ${me.name} (${fmtShort(fromIsoDay(p.date))})`, respondedAt: new Date().toISOString() });
      swapMsg = ` and swapped your ${fmtShort(fromIsoDay(op.date))} shift to ${prevName}`;
    }
  }
  Object.assign(a, {
    userId: me.id,
    status: "accepted",
    coveredFor: prevUser,
    swapOffer: null,
    note: `Covering for ${prevName}${swap ? " (Shift Swap)" : ""}`,
    respondedAt: new Date().toISOString(),
  });
  // Notify the original volunteer
  notify(prevUser, {
    kind: "serve",
    title: `${me.name} claimed your ${a.position} spot!`,
    body: `${a.team} team at ${planLabel(p)}${swapMsg}.`,
    link: "#serving",
  });
  // Notify the ministry leader / team schedulers automatically
  teamLeadersToNotify(a).forEach((lid) => notify(lid, {
    kind: "serve",
    title: `Sub claimed: ${me.name} covering ${a.position}`,
    body: `${me.name} stepped in for ${prevName} on ${a.team} (${planLabel(p)})${swapMsg}. Roster updated automatically.`,
    link: `#crew-${p.id}`,
  }));
  emit("volunteer.sub_claimed", { service: planLabel(p), team: a.team, position: a.position, claimedBy: me.name, coveredFor: prevName });
  logActivity(`${me.name} claimed ${prevName}'s ${a.position} spot (${a.team}) for ${planLabel(p)}`, "serving");
  S.save(); toast(`You're confirmed for ${a.position}${swapMsg}! Ministry leader notified.`); render();
};

// Joining a team: pre-approved people (and schedulers) are on it right away; anyone else sends a request.
Actions["team-join"] = (el) => {
  const team = el.dataset.team;
  if (myTeams().includes(team) || myTeamRequest(team)) return;
  if (volunteerPreApproved()) { S.add("teamMembers", { team, userId: S.me().id, at: new Date().toISOString() }); emit("volunteer.joined", { team, person: S.me().name }); toast(`You're on the ${team} team. No approval needed.`); render(); return; }
  openSheet(`Ask to join ${team}`, html`<form data-form="team-request" novalidate><input type="hidden" name="team" value="${team}">
    <p class="muted" style="margin-top:0">Someone who schedules the teams approves each request. You'll get a notification when they do.</p>
    <label class="field"><span>A note for them (optional)</span><input type="text" name="note" maxlength="160" placeholder="I've run sound at my last church"></label>
    ${approvalNotifyField("volunteers")}
    <button class="btn block">Send request</button></form>`);
};
Forms["team-request"] = (d) => {
  const team = d.team; if (myTeams().includes(team) || myTeamRequest(team)) { closeSheet(); return; }
  S.add("teamMembers", { team, userId: S.me().id, status: "requested", note: String(d.note || "").trim(), at: new Date().toISOString() });
  if (d.notifyApprovers) notifyApprovers("volunteers", { title: `${S.me().name} wants to serve`, body: `${team} team${d.note ? `. "${String(d.note).trim()}"` : ""}`, link: "#teams" });
  emit("volunteer.requested", { team, person: S.me().name, note: d.note || "" });
  closeSheet(); toast("Request sent. You'll get a notification when you're approved."); render();
};
Actions["team-leave"] = (el) => {
  const asked = myTeamRequest(el.dataset.team);
  S.state.teamMembers = S.state.teamMembers.filter((m) => !(m.churchId === S.state.current && m.team === el.dataset.team && m.userId === S.me().id)); S.save();
  toast(asked ? "Request cancelled" : `You left ${el.dataset.team}`); render();
};
Actions["away-add"] = () => {
  const t = isoDay(new Date());
  openSheet("Dates you're away", html`<form data-form="away-save" novalidate>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>From</span><input type="date" name="from" value="${t}" min="${t}" required></label><label class="field"><span>To</span><input type="date" name="to" value="${t}" min="${t}"></label></div>
    <label class="field"><span>Recurring unavailability (optional)</span><select name="recur">${RECUR_BLOCKOUTS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
    <label class="field"><span>Note (optional)</span><input type="text" name="note" maxlength="80" placeholder="Out of town / family vacation"></label>
    <button class="btn block">Save blockout</button></form>`);
};
Forms["away-save"] = (d, f) => {
  if (!d.from) return formError(f, "Choose the first day you're away.");
  const to = d.to && d.to >= d.from ? d.to : d.from;
  S.state.blockouts.push({ id: uid(), churchId: S.state.current, userId: S.me().id, from: d.from, to, recur: d.recur || "", note: d.note });
  S.save(); closeSheet();
  const clash = myAssignments().filter(([p, a]) => a.status !== "declined" && isAway(S.me().id, p.date));
  toast(clash.length ? `You're on the schedule ${fmtShort(fromIsoDay(clash[0][0].date))}. Tap "Request a sub" or "I can't make it" to let your leader know.` : "Blockout dates saved");
  render();
};
Actions["away-delete"] = (el) => { S.state.blockouts = S.state.blockouts.filter((b) => b.id !== el.dataset.id); S.save(); render(); };

// ----- Scheduler Navigation & Staffing Dashboard Tabs -----
const scheduleSeg = (active) => seg([
  ["teams", "Overview & teams", true],
  ["schedule-matrix", "Drag & drop matrix", true],
  ["schedule-calendar", "Calendar", true],
  ["schedule-blockouts", "Blockouts", true],
], active);

// ----- Schedulers: Overview -----
Screens.teams = () => {
  if (!canSchedule()) return { redirect: "serving" };
  const plans = upcomingPlans().slice(0, 8);
  const totalSpots = plans.reduce((n, p) => n + fillStats(p).total, 0);
  const confirmedSpots = plans.reduce((n, p) => n + fillStats(p).confirmed, 0);
  const openSpots = plans.reduce((n, p) => n + fillStats(p).open, 0);
  const activeBlockouts = S.list("blockouts").filter((b) => b.recur || (b.to || b.from) >= isoDay(new Date())).length;
  return {
    title: "Volunteer scheduling", back: "ministry",
    body: html`${scheduleSeg("teams")}
      <div class="stat-tiles" style="margin-top:14px">
        ${statTile("Upcoming services", plans.length.toLocaleString(), "Next 8 services")}
        ${statTile("Confirmed spots", `${confirmedSpots}/${totalSpots}`, totalSpots ? `${Math.round((confirmedSpots / totalSpots) * 100)}% filled` : "No positions yet")}
        ${statTile("Open positions", openSpots.toLocaleString(), openSpots ? "Use Drag & Drop or Auto-Fill" : "All spots assigned")}
        ${statTile("Active blockouts", activeBlockouts.toLocaleString(), "Submitted by volunteers")}
      </div>
      ${teamRequestsSection("")}
      <section class="sec"><div class="sec-head"><h2>Upcoming services</h2><div class="btns" style="margin:0"><a class="btn sm" href="#schedule-matrix">${icon("hand")}Open Drag &amp; Drop Matrix</a></div></div>
        <div class="rows">${plans.length ? plans.map((p) => {
          const st = fillStats(p), d = fromIsoDay(p.date);
          return html`<a class="row" href="#crew-${p.id}"><span class="date"><span>${fmtMonth(d)}</span><b>${dayNum(d)}</b></span><span class="body"><span class="t">${p.title} at ${timeLabel(p.time, tzOf(p), p.date)}</span><span class="s">${fillText(st)}</span>
            <span class="meter" aria-hidden="true"><i style="width:${st.total ? Math.round((st.confirmed / st.total) * 100) : 0}%"></i><i class="w" style="width:${st.total ? Math.round((Math.min(st.waiting, st.total - st.confirmed) / st.total) * 100) : 0}%"></i></span></span>${icon("chev")}</a>`;
        }) : empty("Plan a service first, then schedule its teams here.", S.can("services.plan") ? html`<a class="btn" href="#services">Service plans</a>` : "")}</div></section>
      <section class="sec"><div class="sec-head"><h2>Teams</h2><button class="btn ghost sm" data-act="team-new">${icon("plus")}New team</button></div><div class="rows">${teamsOf().map((t, i) => html`<a class="row" href="#team-${i}"><span class="lead-ic">${icon("hand")}</span><span class="body"><span class="t">${t}</span><span class="s">${plural(teamMembersOf(t).length, "person", "people")}, ${plural(positionsOf(t).length, "position")}</span></span>${icon("chev")}</a>`)}</div></section>`,
  };
};

// ----- Multi-Week Drag-and-Drop Volunteer Matrix + Built-In Team Communication (#schedule-matrix) -----
let matrixTeamFilter = "ALL";
let selectedDragUser = ""; // Also supports tap-to-assign on mobile/touchscreens

Screens["schedule-matrix"] = () => {
  if (!canSchedule()) return { redirect: "serving" };
  const allTeams = teamsOf().filter((t) => positionsOf(t).length);
  if (matrixTeamFilter !== "ALL" && !allTeams.includes(matrixTeamFilter)) matrixTeamFilter = "ALL";
  const shownTeams = matrixTeamFilter === "ALL" ? allTeams : [matrixTeamFilter];
  const plans = upcomingPlans().slice(0, 4);
  const rosterPool = (matrixTeamFilter === "ALL"
    ? [...new Set(S.list("teamMembers").filter((m) => m.status !== "requested").map((m) => m.userId))]
    : teamMembersOf(matrixTeamFilter).map((m) => m.userId)
  ).filter((u) => S.user(u)).sort((a, b) => S.userName(a).localeCompare(S.userName(b)));

  return {
    title: "Drag & drop scheduler", back: "teams",
    body: html`${scheduleSeg("schedule-matrix")}
      <div class="chips" style="margin-top:12px" role="group" aria-label="Filter by team">
        <button type="button" class="chip" data-act="matrix-team" data-team="ALL" aria-pressed="${matrixTeamFilter === "ALL"}">All teams</button>
        ${allTeams.map((t) => html`<button type="button" class="chip" data-act="matrix-team" data-team="${t}" aria-pressed="${matrixTeamFilter === t}">${t}</button>`)}
      </div>
      ${!plans.length ? empty("Add upcoming service plans under Services to schedule volunteers across weeks.", html`<a class="btn" href="#services">Service plans</a>`) : html`
      <div class="sched-workbench">
        <aside class="sched-roster panel">
          <div class="sec-head" style="margin:0 0 6px"><h2 style="font-size:1rem">Volunteer roster</h2><span class="faint">${rosterPool.length}</span></div>
          <p class="faint" style="margin:0 0 10px;font-size:.82rem">Drag a volunteer onto any service slot, or tap a volunteer then tap a slot.</p>
          <div class="sched-chips">
            ${rosterPool.length ? rosterPool.map((u) => {
              const load = recentLoad(u, plans[0].date);
              const awayNext = plans.filter((p) => isAway(u, p.date)).length;
              const active = selectedDragUser === u;
              return html`<div class="vol-drag-chip ${active ? "is-picked" : ""}" draggable="true" data-drag-user="${u}" data-act="pick-drag-user" data-user="${u}" tabindex="0" role="button" aria-pressed="${active}">
                ${avatar(S.user(u), "sm")}
                <span class="vol-chip-info">
                  <b>${S.userName(u)}</b>
                  <small>${load}x in 8w${awayNext ? ` · Away ${awayNext} wk` : ""}</small>
                </span>
                <span class="tag ${awayNext ? "warn" : "ok"}" style="font-size:.7rem">${awayNext ? "Away dates" : "Ready"}</span>
              </div>`;
            }) : html`<p class="faint">No team members yet. Add people under Teams.</p>`}
          </div>
        </aside>

        <div class="sched-matrix-wrap">
          <div class="sched-toolbar panel">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between">
              <span><b>${plural(plans.length, "upcoming service")}</b>${selectedDragUser ? html` · Placing <span class="tag brand">${S.userName(selectedDragUser)}</span> <button type="button" class="link-btn" data-act="pick-drag-user" data-user="">Cancel</button>` : ""}</span>
              <div class="btns" style="margin:0">
                <button type="button" class="btn sm" data-act="matrix-autofill">${icon("bolt")}Auto-fill all open</button>
                <button type="button" class="btn ghost sm" data-act="matrix-remind-all">${icon("bell")}Remind waiting</button>
                <button type="button" class="btn ghost sm" data-act="crew-broadcast-open" data-plan="${plans[0].id}">${icon("chat")}Message crew</button>
              </div>
            </div>
          </div>

          <div class="matrix-scroll">
            <table class="sched-matrix-table">
              <thead>
                <tr>
                  <th class="pos-col">Team &amp; position</th>
                  ${plans.map((p) => {
                    const st = fillStats(p), d = fromIsoDay(p.date);
                    return html`<th>
                      <a href="#crew-${p.id}" style="text-decoration:none;color:inherit"><b>${fmt(d, { month: "short", day: "numeric" })}</b></a>
                      <div class="faint" style="font-weight:400;font-size:.78rem">${p.title} · ${timeLabel(p.time, tzOf(p), p.date)}</div>
                      <div style="margin-top:4px"><span class="tag ${st.open ? "warn" : "ok"}" style="font-size:.72rem">${st.confirmed}/${st.total} filled</span>
                        <button type="button" class="icon-btn sm" data-act="crew-broadcast-open" data-plan="${p.id}" title="Message crew for ${fmtShort(d)}" aria-label="Message crew">${icon("chat")}</button></div>
                    </th>`;
                  })}
                </tr>
              </thead>
              <tbody>
                ${shownTeams.flatMap((team) => positionsOf(team).map((pos) => html`
                  <tr>
                    <td class="pos-col"><b>${pos}</b><div class="faint" style="font-size:.78rem">${team}</div></td>
                    ${plans.map((p) => {
                      const assigned = (p.assignments || []).filter((a) => a.team === team && a.position === pos && a.status !== "declined");
                      return html`<td class="slot-dropzone ${selectedDragUser ? "drop-ready" : ""}" data-drop-plan="${p.id}" data-drop-team="${team}" data-drop-position="${pos}" data-act="slot-tap-assign" data-plan="${p.id}" data-team="${team}" data-position="${pos}">
                        <div class="slot-people">
                          ${assigned.map((a) => {
                            const away = isAway(a.userId, p.date);
                            const [, cls] = ASK_STATUS[a.status] || ASK_STATUS.pending;
                            return html`<span class="slot-pill ${a.status} ${away ? "clash" : ""}">
                              <button type="button" class="slot-pill-main" data-act="crew-person" data-plan="${p.id}" data-id="${a.id}" title="${ASK_STATUS[a.status]?.[0] || "Pending"}${away ? " (Blocked out!)" : ""}">
                                <i class="status-dot ${cls || "pending"}"></i>
                                <span>${S.userName(a.userId)}</span>
                              </button>
                              <button type="button" class="slot-pill-del" data-act="crew-remove" data-plan="${p.id}" data-id="${a.id}" aria-label="Remove ${S.userName(a.userId)}">×</button>
                            </span>`;
                          })}
                          <button type="button" class="slot-add-btn" data-act="crew-add" data-plan="${p.id}" data-team="${team}" data-position="${pos}" aria-label="Add volunteer to ${pos} on ${p.date}">+ Assign</button>
                        </div>
                      </td>`;
                    })}
                  </tr>
                `))}
              </tbody>
            </table>
          </div>
        </div>
      </div>`}`,
    after() { bindMatrixDragDrop(); },
  };
};

function assignWithGuardrails(planId, team, position, userId) {
  const p = S.get("services", planId);
  if (!p || !userId) return;
  if (isAway(userId, p.date)) {
    openSheet("Blockout date conflict", html`<p style="margin-top:0"><b>${S.userName(userId)}</b> has marked <b>${fmtDay(fromIsoDay(p.date))}</b> as away (${awayReason(userId, p.date)}).</p>
      <p class="muted">Would you still like to schedule them for <b>${position}</b> (${team})?</p>
      <div class="btns"><button class="btn warn" data-act="force-slot-assign" data-plan="${p.id}" data-team="${team}" data-position="${position}" data-user="${userId}">Schedule anyway</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
    return;
  }
  const otherSpot = (p.assignments || []).find((a) => a.userId === userId && a.status !== "declined" && !(a.team === team && a.position === position));
  askPerson(p, team, position, userId);
  S.save();
  toast(otherSpot ? `Assigned ${S.userName(userId)} (Note: also serving as ${otherSpot.position})` : `Assigned ${S.userName(userId)} to ${position}`);
  render();
}
Actions["force-slot-assign"] = (el) => {
  const p = S.get("services", el.dataset.plan);
  if (p) { askPerson(p, el.dataset.team, el.dataset.position, el.dataset.user); S.save(); }
  closeSheet(true); toast(`Scheduled ${S.userName(el.dataset.user)}`); render();
};
Actions["matrix-team"] = (el) => { matrixTeamFilter = el.dataset.team; render(); };
Actions["pick-drag-user"] = (el) => {
  const u = el.dataset.user;
  selectedDragUser = selectedDragUser === u ? "" : u;
  render();
};
Actions["slot-tap-assign"] = (el, ev) => {
  if (!selectedDragUser) return;
  if (ev?.target?.closest("button:not(.slot-dropzone)")) return;
  const userId = selectedDragUser;
  selectedDragUser = "";
  assignWithGuardrails(el.dataset.plan, el.dataset.team, el.dataset.position, userId);
};
Actions["matrix-autofill"] = () => {
  const plans = upcomingPlans().slice(0, 4);
  let totalAsked = 0;
  plans.forEach((p) => {
    spots(p).forEach(({ team, position, people }) => {
      if (matrixTeamFilter !== "ALL" && team !== matrixTeamFilter) return;
      if (people.some((a) => a.status !== "declined")) return;
      const saidNo = people.map((a) => a.userId);
      const pool = teamMembersOf(team).map((m) => m.userId).filter((u) => !saidNo.includes(u) && !isAway(u, p.date) && !(p.assignments || []).some((a) => a.userId === u && a.status !== "declined"));
      if (!pool.length) return;
      pool.sort((a, b) => recentLoad(a, p.date) - recentLoad(b, p.date) || S.userName(a).localeCompare(S.userName(b)));
      askPerson(p, team, position, pool[0]);
      totalAsked++;
    });
  });
  S.save(); render();
  toast(totalAsked ? `Auto-filled ${plural(totalAsked, "open spot")} across ${plural(plans.length, "service")}` : "No eligible available volunteers found for remaining spots");
};
Actions["matrix-remind-all"] = () => {
  const plans = upcomingPlans().slice(0, 4);
  let count = 0;
  plans.forEach((p) => (p.assignments || []).filter((a) => a.status === "pending").forEach((a) => {
    notify(a.userId, { kind: "serve", title: "Reminder: can you serve?", body: `${a.position} on the ${a.team} team, ${planLabel(p)}`, link: "#serving" });
    count++;
  }));
  toast(count ? `Sent reminders to ${plural(count, "waiting volunteer")}` : "Nobody is waiting to respond");
};

function bindMatrixDragDrop() {
  $$("[data-drag-user]").forEach((chip) => {
    chip.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", chip.dataset.dragUser);
      e.dataTransfer.effectAllowed = "copy";
      chip.classList.add("dragging");
    });
    chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
  });
  $$("[data-drop-plan]").forEach((zone) => {
    zone.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const userId = e.dataTransfer.getData("text/plain");
      if (userId) assignWithGuardrails(zone.dataset.dropPlan, zone.dataset.dropTeam, zone.dataset.dropPosition, userId);
    });
  });
}

// ----- Built-In Service Crew Communication (Push, In-App Chat, Email, SMS) -----
Actions["crew-broadcast-open"] = (el) => {
  const p = S.get("services", el.dataset.plan) || upcomingPlans()[0];
  if (!p) return;
  const crewIds = [...new Set((p.assignments || []).filter((a) => a.status !== "declined").map((a) => a.userId))];
  openSheet(`Message crew: ${p.title}`, html`<form data-form="crew-broadcast-send" novalidate><input type="hidden" name="planId" value="${p.id}">
    <p class="muted" style="margin-top:0">${fmtDay(fromIsoDay(p.date))} at ${timeLabel(p.time, tzOf(p), p.date)} · <b>${plural(crewIds.length, "volunteer")} scheduled</b>.</p>
    <label class="field"><span>Who on this service?</span><select name="filter">
      <option value="all">Everyone scheduled (${crewIds.length})</option>
      <option value="accepted">Confirmed only (${(p.assignments || []).filter((a) => a.status === "accepted").length})</option>
      <option value="pending">Waiting to confirm (${(p.assignments || []).filter((a) => a.status === "pending").length})</option>
      ${teamsOf().map((t) => html`<option value="team:${t}">${t} team only</option>`)}
    </select></label>
    <fieldset class="field" style="border:0;padding:0"><legend>Send via</legend>
      <div class="chips">
        <label class="chip-check"><input type="checkbox" name="ch" value="push" checked><span>${icon("bell")}App &amp; Push alert</span></label>
        <label class="chip-check"><input type="checkbox" name="ch" value="chat" checked><span>${icon("chat")}Service crew chat</span></label>
        ${S.can("send.email") ? html`<label class="chip-check"><input type="checkbox" name="ch" value="email"><span>${icon("mail")}Email</span></label>` : ""}
        ${typeof textingOn === "function" && textingOn() && S.can("send.texts") ? html`<label class="chip-check"><input type="checkbox" name="ch" value="text"><span>${icon("phone")}SMS Text</span></label>` : ""}
      </div>
    </fieldset>
    <label class="field"><span>Message</span><textarea name="body" rows="4" maxlength="1200" required placeholder="Rehearsal starts at 8:15 AM sharp in the Sanctuary! Let us know if you need chord charts."></textarea></label>
    <button class="btn block">${icon("send")}Send to crew</button></form>`);
};
Forms["crew-broadcast-send"] = async (d, f, fd) => {
  const p = S.get("services", d.planId); if (!p) return;
  const chans = fd.getAll("ch");
  if (!chans.length) return formError(f, "Choose at least one channel.");
  let list = (p.assignments || []).filter((a) => a.status !== "declined");
  if (d.filter === "accepted") list = list.filter((a) => a.status === "accepted");
  else if (d.filter === "pending") list = list.filter((a) => a.status === "pending");
  else if (String(d.filter).startsWith("team:")) list = list.filter((a) => a.team === d.filter.slice(5));
  const userIds = [...new Set(list.map((a) => a.userId))].filter((u) => S.user(u));
  if (!userIds.length) return formError(f, "Nobody matches that filter on this service.");
  const text = String(d.body || "").trim();
  if (chans.includes("push")) {
    userIds.forEach((u) => notify(u, { kind: "serve", title: `${p.title} (${fmtShort(fromIsoDay(p.date))})`, body: text.slice(0, 160), link: `#crew-${p.id}` }));
  }
  if (chans.includes("chat")) {
    const chId = `dm-crew-${p.id}`;
    let ch = S.state.channels.find((c) => c.id === chId);
    const members = [...new Set([S.me().id, ...userIds])];
    if (!ch) { ch = { id: chId, churchId: S.state.current, kind: "dm", members }; S.state.channels.push(ch); }
    else ch.members = [...new Set([...ch.members, ...members])];
    S.state.messages.push({ id: uid(), channelId: chId, by: S.me().id, text: `[${p.title} · ${fmtShort(fromIsoDay(p.date))}] ${text}`, at: new Date().toISOString() });
  }
  if (chans.includes("email") && Backend.on) {
    await Backend.call("send-email", { churchId: S.state.current, userIds, subject: `${p.title} — ${fmtShort(fromIsoDay(p.date))}`, body: text, audience: `Service crew: ${p.title}` }).catch(() => {});
  }
  if (chans.includes("text") && Backend.on && !S.church().texting?.practice) {
    await Backend.call("texting", { action: "send", churchId: S.state.current, userIds, body: text, audience: `Service crew: ${p.title}` }).catch(() => {});
  }
  logActivity(`Messaged ${plural(userIds.length, "volunteer")} for ${planLabel(p)}`, "serving");
  S.save(); closeSheet(true); toast(`Sent to ${plural(userIds.length, "volunteer")}`); render();
};

// ----- Interactive Monthly Staffing & Volunteer Calendar (#schedule-calendar) -----
let staffCalMonth = isoDay(new Date()).slice(0, 7);
Screens["schedule-calendar"] = () => {
  if (!canSchedule()) return { redirect: "serving" };
  const [yr, mo] = staffCalMonth.split("-").map(Number);
  const first = new Date(yr, mo - 1, 1), daysInMonth = new Date(yr, mo, 0).getDate(), startDow = first.getDay();
  const monthPrefix = `${yr}-${String(mo).padStart(2, "0")}`;
  const plans = S.list("services").filter((p) => p.date.startsWith(monthPrefix)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(html`<div class="scal-cell empty"></div>`);
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${monthPrefix}-${String(d).padStart(2, "0")}`;
    const dayPlans = plans.filter((p) => p.date === dayStr);
    const awayUsers = S.members().map((m) => m.userId).filter((u) => isAway(u, dayStr));
    cells.push(html`<div class="scal-cell ${dayPlans.length ? "has-plans" : ""}">
      <div class="scal-day-top"><b>${d}</b>${awayUsers.length ? html`<span class="tag warn" style="font-size:.66rem" title="Away: ${awayUsers.map((u) => S.userName(u)).join(", ")}">${awayUsers.length} away</span>` : ""}</div>
      ${dayPlans.map((p) => {
        const st = fillStats(p);
        return html`<a class="scal-plan ${st.open ? "open" : "full"}" href="#crew-${p.id}">
          <b>${timeLabel(p.time, tzOf(p), p.date)} ${p.title}</b>
          <span>${st.confirmed}/${st.total} confirmed${st.open ? ` · ${st.open} open` : ""}</span>
        </a>`;
      })}
    </div>`);
  }
  const monthLabel = first.toLocaleDateString([], { month: "long", year: "numeric" });
  return {
    title: "Staffing calendar", back: "teams",
    body: html`${scheduleSeg("schedule-calendar")}
      <div class="panel" style="margin-top:14px">
        <div class="bcal-head">
          <button type="button" class="icon-btn sm" data-act="scal-nav" data-dir="-1" aria-label="Previous month">${icon("back")}</button>
          <h2 style="font-size:1.15rem">${monthLabel}</h2>
          <button type="button" class="icon-btn sm" data-act="scal-nav" data-dir="1" aria-label="Next month">${icon("chev")}</button>
        </div>
        <div class="scal-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => html`<span>${w}</span>`)}</div>
        <div class="scal-grid">${cells}</div>
      </div>`,
  };
};
Actions["scal-nav"] = (el) => {
  const [yr, mo] = staffCalMonth.split("-").map(Number);
  const d = new Date(yr, mo - 1 + (+el.dataset.dir), 1);
  staffCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  render();
};

// ----- Team Blockouts Overview (#schedule-blockouts) -----
Screens["schedule-blockouts"] = () => {
  if (!canSchedule()) return { redirect: "serving" };
  const today = isoDay(new Date());
  const list = S.state.blockouts.filter((b) => S.membership(S.state.current, b.userId) && (b.recur || (b.to || b.from) >= today)).sort((a, b) => (a.from || "").localeCompare(b.from || ""));
  return {
    title: "Volunteer blockouts", back: "teams",
    body: html`${scheduleSeg("schedule-blockouts")}
      <section class="sec"><div class="sec-head"><h2>Upcoming dates away &amp; recurring rules</h2><button class="btn ghost sm" data-act="admin-away-add">${icon("plus")}Add for volunteer</button></div>
        <div class="rows">${list.length ? list.map((b) => html`<div class="row">${avatar(S.user(b.userId) || { id: b.userId, name: "?" })}
          <span class="body"><span class="t">${S.userName(b.userId)}</span>
          <span class="s">${b.recur ? recurLabel(b.recur) : b.to && b.to !== b.from ? `${fmtShort(fromIsoDay(b.from))} to ${fmtShort(fromIsoDay(b.to))}` : fmtDay(fromIsoDay(b.from))}${b.note ? ` · "${b.note}"` : ""}</span>
          <span class="s faint">Teams: ${onTeams(b.userId).join(", ") || "All"}</span></span>
          <button class="icon-btn" data-act="away-delete" data-id="${b.id}" aria-label="Remove blockout">${icon("trash")}</button></div>`) : empty("No upcoming volunteer blockouts recorded.")}</div></section>`,
  };
};
Actions["admin-away-add"] = () => {
  const t = isoDay(new Date()), people = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  openSheet("Add volunteer blockout", html`<form data-form="admin-away-save" novalidate>
    <label class="field"><span>Volunteer</span><select name="userId" required>${people.map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>From</span><input type="date" name="from" value="${t}" required></label><label class="field"><span>To</span><input type="date" name="to" value="${t}"></label></div>
    <label class="field"><span>Recurring unavailability</span><select name="recur">${RECUR_BLOCKOUTS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
    <label class="field"><span>Reason / note</span><input type="text" name="note" maxlength="80" placeholder="Out of town"></label>
    <button class="btn block">Save blockout</button></form>`);
};
Forms["admin-away-save"] = (d) => {
  const to = d.to && d.to >= d.from ? d.to : d.from;
  S.state.blockouts.push({ id: uid(), churchId: S.state.current, userId: d.userId, from: d.from, to, recur: d.recur || "", note: d.note });
  S.save(); closeSheet(); toast(`Blockout added for ${S.userName(d.userId)}`); render();
};

function planHead(p) {
  return html`<h1 style="margin-top:16px">${p.title}</h1>
    <p class="muted" style="margin-top:4px">${fmtDay(fromIsoDay(p.date))} at ${timeLabel(p.time, tzOf(p), p.date)}${p.locationId ? `, ${locName(p.locationId)}` : ""}.</p>
    ${seg([[`service-${p.id}`, "Order of service"], [`crew-${p.id}`, "Volunteers", S.isMember() && S.canAny(["schedule.teams", "services.plan"])]], location.hash.slice(1))}`;
}
Screens.crew = (id) => {
  const p = S.get("services", id);
  if (!p || !canSeePlans()) return { redirect: "services" };
  const edit = canSchedule(), st = fillStats(p), teams = teamsOf().filter((t) => positionsOf(t).length);
  return {
    title: p.title, back: "services",
    body: html`${planHead(p)}
      <p style="margin-top:12px"><b>${fillText(st)}.</b></p>
      ${edit ? html`<div class="btns">
        <button class="btn sm" data-act="crew-fill" data-plan="${p.id}" ${attr(!st.open, "disabled")}>${icon("bolt")}Fill open spots</button>
        ${st.waiting ? html`<button class="btn ghost sm" data-act="crew-remind" data-plan="${p.id}">${icon("bell")}Remind ${plural(st.waiting, "person", "people")} waiting</button>` : ""}
        <button class="btn ghost sm" data-act="crew-broadcast-open" data-plan="${p.id}">${icon("chat")}Message crew</button>
        <a class="btn ghost sm" href="#schedule-matrix">${icon("calendar")}Drag &amp; drop matrix</a>
      </div>` : ""}
      ${teams.length ? teams.map((team) => html`<section class="sec"><h2 class="sec-head">${team}</h2><div class="rows">${positionsOf(team).map((position) => {
        const people = (p.assignments || []).filter((a) => a.team === team && a.position === position);
        return html`<div class="row crew-row"><span class="body"><span class="t">${position}</span>
          ${people.length ? html`<span class="crew-people">${people.map((a) => html`<button class="crew-person ${a.status}" data-act="crew-person" data-plan="${p.id}" data-id="${a.id}" ${attr(!edit, "disabled")}>${avatar(S.user(a.userId) || { id: a.userId, name: "?" }, "sm")}<span>${S.userName(a.userId)}</span><span class="tag ${ASK_STATUS[a.status]?.[1] || ""}">${ASK_STATUS[a.status]?.[0] || a.status}</span></button>`)}</span>` : html`<span class="s">Open</span>`}</span>
          ${edit ? html`<button class="icon-btn" data-act="crew-add" data-plan="${p.id}" data-team="${team}" data-position="${position}" aria-label="Ask someone to serve as ${position}">${icon("plus")}</button>` : ""}</div>`;
      })}</div></section>`) : html`<div class="rows" style="margin-top:14px">${empty("Add positions to your teams to start scheduling.", edit ? html`<a class="btn" href="#teams">Teams</a>` : "")}</div>`}`,
  };
};
Actions["crew-add"] = (el) => {
  const p = S.get("services", el.dataset.plan), { team, position } = el.dataset;
  const onTeam = teamMembersOf(team).map((m) => m.userId);
  const others = S.members().map((m) => m.userId).filter((u) => !onTeam.includes(u) && S.user(u));
  const cand = (u) => {
    const asked = (p.assignments || []).find((a) => a.userId === u && a.team === team && a.position === position);
    const busy = (p.assignments || []).find((a) => a.userId === u && a.status !== "declined" && a !== asked);
    const away = isAway(u, p.date), load = recentLoad(u, p.date);
    const why = [asked && `Already asked: ${ASK_STATUS[asked.status]?.[0]?.toLowerCase() || "pending"}`, away && `Away (${awayReason(u, p.date)})`, busy && `Already serving as ${busy.position}`, load && `Asked ${plural(load, "time")} in the last two months`].filter(Boolean).join(". ");
    return html`<button class="row" data-act="crew-assign" data-plan="${p.id}" data-team="${team}" data-position="${position}" data-user="${u}" data-search="${S.userName(u)}" ${attr(asked, "disabled")}>${avatar(S.user(u))}<span class="body"><span class="t">${S.userName(u)}</span>${why ? html`<span class="s ${away || busy ? "warn-text" : ""}">${why}</span>` : ""}</span>${asked ? icon("check") : icon("plus")}</button>`;
  };
  openSheet(`${position}, ${team}`, html`<label class="field" style="margin-top:0"><span class="sr">Search people</span><input type="search" placeholder="Search by name" data-input="filter-rows" data-target="#cand-list" data-empty="#cand-none"></label>
    <div id="cand-list">${onTeam.length ? html`<h3 class="sec-head" style="margin-top:6px">On the ${team} team</h3><div class="rows">${onTeam.map(cand)}</div>` : ""}
    ${others.length ? html`<h3 class="sec-head">Everyone else</h3><div class="rows">${others.map(cand)}</div>` : ""}</div><p id="cand-none" class="faint" hidden>Nobody matches.</p>`, { wide: true });
};
Actions["crew-assign"] = (el) => {
  const p = S.get("services", el.dataset.plan), u = el.dataset.user;
  askPerson(p, el.dataset.team, el.dataset.position, u); S.save(); closeSheet(true);
  toast(u === S.me().id ? "You're on the schedule" : `Asked ${S.userName(u)}`); render();
};
Actions["crew-fill"] = (el) => {
  const p = S.get("services", el.dataset.plan); let asked = 0; const stuck = [];
  spots(p).forEach(({ team, position, people }) => {
    if (people.some((a) => a.status !== "declined")) return;
    const said_no = people.map((a) => a.userId);
    const pool = teamMembersOf(team).map((m) => m.userId).filter((u) => !said_no.includes(u) && !isAway(u, p.date) && !(p.assignments || []).some((a) => a.userId === u && a.status !== "declined"));
    if (!pool.length) { stuck.push(position); return; }
    pool.sort((a, b) => recentLoad(a, p.date) - recentLoad(b, p.date) || S.userName(a).localeCompare(S.userName(b)));
    askPerson(p, team, position, pool[0]); asked++;
  });
  S.save(); render();
  if (!stuck.length) toast(`Asked ${plural(asked, "person", "people")}`);
  else openSheet(asked ? `Asked ${plural(asked, "person", "people")}` : "Nobody free", html`<p style="margin-top:0">Nobody on the team is free for ${stuck.join(", ")}. Everyone left is away, already serving or has said no.</p>
    <p class="muted">Tap ${icon("plus")} beside a position to ask someone from another team.</p><button class="btn block" data-act="close-sheet">OK</button>`);
};
Actions["crew-remind"] = (el) => {
  const p = S.get("services", el.dataset.plan), waiting = (p.assignments || []).filter((a) => a.status === "pending");
  waiting.forEach((a) => notify(a.userId, { kind: "serve", title: "Reminder: can you serve?", body: `${a.position} on the ${a.team} team, ${planLabel(p)}`, link: "#serving" }));
  toast(`Reminded ${plural(waiting.length, "person", "people")}`);
};
Actions["crew-person"] = (el) => {
  const [p, a] = findAsk(el); if (!a) return;
  const [label] = ASK_STATUS[a.status] || ASK_STATUS.pending;
  openSheet(S.userName(a.userId), html`<p class="muted" style="margin-top:0">${a.position} on the ${a.team} team. ${label}${a.respondedAt ? ` ${ago(a.respondedAt)}` : a.at ? `, asked ${ago(a.at)}` : ""}.${a.note ? ` "${a.note}"` : ""}</p>
    <div class="rows">
      ${a.status !== "accepted" ? html`<button class="row" data-act="crew-set" data-plan="${p.id}" data-id="${a.id}" data-status="accepted"><span class="lead-ic">${icon("check")}</span><span class="body"><span class="t">Mark as confirmed</span><span class="s">For when they told you in person</span></span></button>` : ""}
      ${a.status === "pending" ? html`<button class="row" data-act="crew-set" data-plan="${p.id}" data-id="${a.id}" data-status="declined"><span class="lead-ic">${icon("x")}</span><span class="body"><span class="t">Mark as can't serve</span></span></button>` : ""}
      ${S.on("chat") && S.can("use.chat") && a.userId !== S.me().id ? html`<button class="row" data-act="dm-start" data-user="${a.userId}"><span class="lead-ic">${icon("chat")}</span><span class="body"><span class="t">Message ${S.userName(a.userId).split(" ")[0]}</span></span></button>` : ""}
      <button class="row" data-act="crew-remove" data-plan="${p.id}" data-id="${a.id}"><span class="lead-ic" style="color:var(--warn)">${icon("trash")}</span><span class="body"><span class="t">Take off this service</span></span></button></div>`);
};
Actions["crew-set"] = (el) => { const [, a] = findAsk(el); if (!a) return; Object.assign(a, { status: el.dataset.status, respondedAt: new Date().toISOString() }); S.save(); closeSheet(true); render(); };
Actions["crew-remove"] = (el) => { const [p, a] = findAsk(el); if (!a) return; p.assignments = p.assignments.filter((x) => x !== a); S.save(); closeSheet(true); toast(`${S.userName(a.userId)} taken off`); render(); };

Screens.team = (i) => {
  const team = teamsOf()[+i];
  if (!team || !S.isMember()) return { redirect: "serving" };
  const edit = canSchedule(), people = teamMembersOf(team), positions = positionsOf(team);
  const plans = upcomingPlans().slice(0, 6);
  return {
    title: team, back: edit ? "teams" : "serving",
    body: html`<section class="sec"><div class="sec-head"><h2>Positions</h2>${edit ? html`<button class="btn ghost sm" data-act="team-edit" data-i="${i}">${icon("edit")}Edit team</button>` : ""}</div>
        <div class="chips">${positions.length ? positions.map((x) => html`<span class="tag">${x}</span>`) : html`<span class="faint">No positions yet.</span>`}</div></section>
      ${teamRequestsSection(team)}
      <section class="sec"><div class="sec-head"><h2>People</h2>${edit ? html`<button class="btn ghost sm" data-act="team-add" data-team="${team}">${icon("plus")}Add people</button>` : ""}</div>
        <div class="rows">${people.length ? people.map((m) => {
          const next = myAssignments(m.userId).find(([, a]) => a.team === team && a.status !== "declined"), away = awayDates(m.userId).filter((b) => b.recur || (b.to || b.from) >= isoDay(new Date()));
          return html`<div class="row">${avatar(S.user(m.userId))}<span class="body"><span class="t">${S.userName(m.userId)}</span><span class="s">${next ? `Next: ${next[1].position}, ${fmtShort(fromIsoDay(next[0].date))}` : "Not scheduled"}${away.length ? `. Away ${away[0].recur ? recurLabel(away[0].recur) : fmtShort(fromIsoDay(away[0].from))}${away[0].to && away[0].to !== away[0].from ? ` to ${fmtShort(fromIsoDay(away[0].to))}` : ""}` : ""}</span></span>
            ${edit ? html`<button class="icon-btn" data-act="team-remove" data-id="${m.id}" aria-label="Take ${S.userName(m.userId)} off the team">${icon("x")}</button>` : ""}</div>`;
        }) : empty("Nobody on this team yet.")}</div></section>
      ${plans.length && positions.length ? html`<section class="sec"><h2 class="sec-head">Coming up</h2><div class="rows">${plans.map((p) => {
        const mine = (p.assignments || []).filter((a) => a.team === team && a.status !== "declined"), d = fromIsoDay(p.date);
        return html`<a class="row" href="#crew-${p.id}"><span class="date"><span>${fmtMonth(d)}</span><b>${dayNum(d)}</b></span><span class="body"><span class="t">${p.title}</span><span class="s">${mine.length ? mine.map((a) => `${a.position}: ${S.userName(a.userId)}${a.status === "pending" ? " (waiting)" : ""}`).join(", ") : "Nobody scheduled"}</span></span>${icon("chev")}</a>`;
      })}</div></section>` : ""}`,
  };
};
Actions["team-new"] = () => openSheet("New team", html`<form data-form="team-save" novalidate><input type="hidden" name="i" value="">
  <label class="field"><span>Team name</span><input type="text" name="name" required maxlength="40" placeholder="Hospitality"></label>
  <label class="field"><span>Positions</span><textarea name="positions" placeholder="One per line"></textarea></label><button class="btn block">Create team</button></form>`);
Actions["team-edit"] = (el) => {
  const i = +el.dataset.i, team = teamsOf()[i];
  openSheet(`Edit ${team}`, html`<form data-form="team-save" novalidate><input type="hidden" name="i" value="${i}">
    <label class="field"><span>Team name</span><input type="text" name="name" value="${team}" required maxlength="40"></label>
    <label class="field"><span>Positions</span><textarea name="positions">${positionsOf(team).join("\n")}</textarea><small>One per line. People already scheduled keep their spot.</small></label>
    <div class="btns"><button class="btn">Save</button><button type="button" class="btn danger" data-act="team-delete" data-i="${i}">Delete team</button></div></form>`);
};
Forms["team-save"] = (d, f) => {
  const c = S.church(), name = d.name.trim(), i = d.i === "" ? -1 : +d.i;
  if (!name) return formError(f, "Name the team.");
  if (c.teams.some((t, j) => j !== i && t.toLowerCase() === name.toLowerCase())) return formError(f, "There's already a team with that name.");
  const positions = [...new Set(d.positions.split("\n").map((x) => x.trim()).filter(Boolean))];
  c.positions ||= {};
  if (i < 0) c.teams.push(name);
  else {
    const old = c.teams[i]; c.teams[i] = name;
    if (old !== name) {
      delete c.positions[old];
      S.list("teamMembers").forEach((m) => { if (m.team === old) m.team = name; });
      S.list("services").forEach((p) => (p.assignments || []).forEach((a) => { if (a.team === old) a.team = name; }));
    }
  }
  c.positions[name] = positions; S.save(); closeSheet(true); toast("Team saved"); go(`team-${c.teams.indexOf(name)}`);
};
Actions["team-delete"] = (el) => {
  const c = S.church(), team = c.teams[+el.dataset.i];
  c.teams.splice(+el.dataset.i, 1); delete c.positions?.[team];
  S.state.teamMembers = S.state.teamMembers.filter((m) => !(m.churchId === c.id && m.team === team));
  S.save(); closeSheet(true); toast(`${team} deleted`); go("teams");
};
Actions["team-add"] = (el) => {
  const team = el.dataset.team, on = teamMembersOf(team).map((m) => m.userId);
  const people = S.members().map((m) => m.userId).filter((u) => !on.includes(u) && S.user(u)).sort((a, b) => S.userName(a).localeCompare(S.userName(b)));
  openSheet(`Add to ${team}`, html`<label class="field" style="margin-top:0"><span class="sr">Search people</span><input type="search" placeholder="Search by name" data-input="filter-rows" data-target="#team-cand" data-empty="#team-none"></label>
    <div class="rows" id="team-cand">${people.map((u) => html`<button class="row" data-act="team-add-one" data-team="${team}" data-user="${u}" data-search="${S.userName(u)}">${avatar(S.user(u))}<span class="body"><span class="t">${S.userName(u)}</span></span>${icon("plus")}</button>`)}</div>
    <p id="team-none" class="faint" ${attr(people.length, "hidden")}>Everyone's already on this team.</p>`, { wide: true });
};
Actions["team-add-one"] = (el) => {
  // Someone already asking to join: approve their request rather than adding them twice.
  const asked = S.list("teamMembers").find((m) => m.team === el.dataset.team && m.userId === el.dataset.user && m.status === "requested");
  if (asked) approveTeamRequest(asked); else S.add("teamMembers", { team: el.dataset.team, userId: el.dataset.user });
  S.save(); el.remove(); toast(`${S.userName(el.dataset.user)} added`); render();
};
Actions["team-remove"] = (el) => { S.remove("teamMembers", el.dataset.id); render(); };
