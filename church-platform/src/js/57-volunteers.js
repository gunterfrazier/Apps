// ---------- Volunteer scheduling: teams, positions, who serves when, and dates away ----------
// Schedulers ask people to fill a position for a service plan. People accept or decline from #serving and
// add the dates they're away so nobody asks them. "Fill open spots" spreads the work across each team.

const canSchedule = () => S.isMember() && S.can("schedule.teams");
const teamsOf = (c = S.church()) => c.teams || [];
const positionsOf = (team, c = S.church()) => c.positions?.[team] || [];
const teamMembersOf = (team) => S.list("teamMembers").filter((m) => m.team === team && S.user(m.userId));
const myTeams = () => S.list("teamMembers").filter((m) => m.userId === S.me().id).map((m) => m.team);
const planLabel = (p) => `${p.title}, ${fmtShort(fromIsoDay(p.date))} at ${timeLabel(p.time)}`;
const upcomingPlans = () => { const t = isoDay(new Date()); return S.list("services").filter((p) => p.date >= t).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); };
const myAssignments = (userId = S.me().id) => upcomingPlans().flatMap((p) => (p.assignments || []).filter((a) => a.userId === userId).map((a) => [p, a]));
const pendingAsks = () => S.isMember() ? myAssignments().filter(([, a]) => a.status === "pending") : [];
/** Dates away apply at every church the person belongs to. */
const awayDates = (userId) => S.state.blockouts.filter((b) => b.userId === userId);
const isAway = (userId, day) => awayDates(userId).some((b) => b.from <= day && day <= (b.to || b.from));
/** How often someone was asked in the eight weeks either side of a date, so "Fill open spots" is fair. */
function recentLoad(userId, day) {
  const d = fromIsoDay(day).getTime();
  return S.list("services").filter((p) => Math.abs(fromIsoDay(p.date).getTime() - d) < 56 * DAY)
    .reduce((n, p) => n + (p.assignments || []).filter((a) => a.userId === userId && a.status !== "declined").length, 0);
}
const ASK_STATUS = { pending: ["Waiting", ""], accepted: ["Confirmed", "ok"], declined: ["Can't serve", "warn"] };
/** Every position on every team for one plan, with whoever has been asked. */
const spots = (p) => teamsOf().flatMap((team) => positionsOf(team).map((position) => ({ team, position, people: (p.assignments || []).filter((a) => a.team === team && a.position === position) })));
function fillStats(p) {
  const s = spots(p);
  return {
    total: s.length,
    confirmed: s.filter((x) => x.people.some((a) => a.status === "accepted")).length,
    waiting: (p.assignments || []).filter((a) => a.status === "pending").length,
    open: s.filter((x) => !x.people.some((a) => a.status !== "declined")).length,
  };
}
const fillText = (st) => `${st.confirmed} of ${st.total} confirmed${st.waiting ? `, ${st.waiting} waiting` : ""}${st.open ? `, ${st.open} open` : ""}`;

function askPerson(p, team, position, userId) {
  p.assignments ||= [];
  const self = userId === S.me().id;
  const a = { id: uid(), team, position, userId, status: self ? "accepted" : "pending", note: "", by: S.me().id, at: new Date().toISOString() };
  p.assignments.push(a);
  if (!self) notify(userId, { kind: "serve", title: "Can you serve?", body: `${position} on the ${team} team, ${planLabel(p)}`, link: "#serving" });
  emit("volunteer.scheduled", { service: planLabel(p), team, position, person: S.userName(userId) });
  return a;
}

// ----- The volunteer's own view -----
function askCard([p, a]) {
  const d = fromIsoDay(p.date), [label, cls] = ASK_STATUS[a.status];
  return html`<div class="ask-card ${a.status}"><div class="row" style="padding:0"><span class="date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span>
      <span class="body"><span class="t">${a.position}, ${a.team}</span><span class="s">${p.title} at ${timeLabel(p.time)}${p.locationId ? `, ${locName(p.locationId)}` : ""}</span>
      ${a.status !== "pending" ? html`<span class="tag ${cls}" style="margin-top:4px">${label}</span>` : ""}${a.note ? html`<span class="s">"${a.note}"</span>` : ""}</span></div>
    <div class="btns" style="margin-top:10px">${a.status === "pending" ? html`<button class="btn sm" data-act="ask-yes" data-plan="${p.id}" data-id="${a.id}">${icon("check")}Accept</button><button class="btn ghost sm" data-act="ask-no" data-plan="${p.id}" data-id="${a.id}">Decline</button>`
      : html`<button class="btn ghost sm" data-act="${a.status === "accepted" ? "ask-no" : "ask-yes"}" data-plan="${p.id}" data-id="${a.id}">${a.status === "accepted" ? "I can't make it" : "I can serve after all"}</button>`}</div></div>`;
}

Screens.serving = () => {
  if (!S.isMember()) return { title: "Serving", back: "me", body: needMember("serve on a team") };
  const me = S.me().id, today = isoDay(new Date());
  const mine = myAssignments(), pending = mine.filter(([, a]) => a.status === "pending"), rest = mine.filter(([, a]) => a.status !== "pending");
  const teams = myTeams(), away = awayDates(me).filter((b) => (b.to || b.from) >= today).sort((a, b) => a.from.localeCompare(b.from));
  return {
    title: "Serving", back: "me",
    body: html`
      ${pending.length ? html`<section class="sec"><h2 class="sec-head">Can you serve?</h2><div class="ask-list">${pending.map(askCard)}</div></section>` : ""}
      <section class="sec"><h2 class="sec-head">Your schedule</h2>${rest.length ? html`<div class="ask-list">${rest.map(askCard)}</div>` : html`<div class="rows">${empty(teams.length ? "You're not on the schedule yet. When a scheduler asks you to serve, it shows up here." : "Join a team below to be asked to serve.")}</div>`}</section>
      <section class="sec"><h2 class="sec-head">Teams</h2><div class="rows">${teamsOf().map((t, i) => {
        const on = teams.includes(t), n = teamMembersOf(t).length;
        return html`<div class="row"><span class="lead-ic">${icon(on ? "check" : "hand")}</span><a class="body" href="#team-${i}" style="color:inherit;text-decoration:none"><span class="t">${t}</span><span class="s">${plural(n, "person", "people")}${positionsOf(t).length ? `. ${positionsOf(t).join(", ")}` : ""}</span></a>
          <button class="btn ${on ? "ghost" : ""} sm" data-act="${on ? "team-leave" : "team-join"}" data-team="${t}">${on ? "Leave" : "Join"}</button></div>`;
      })}</div></section>
      <section class="sec"><div class="sec-head"><h2>Dates you're away</h2><button class="btn ghost sm" data-act="away-add">${icon("plus")}Add dates</button></div>
        <p class="faint" style="margin-top:-4px">Schedulers see that you're away and won't ask you to serve on these days.</p>
        <div class="rows">${away.length ? away.map((b) => html`<div class="row"><span class="lead-ic">${icon("calendar")}</span><span class="body"><span class="t">${b.to && b.to !== b.from ? `${fmtShort(fromIsoDay(b.from))} to ${fmtShort(fromIsoDay(b.to))}` : fmtDay(fromIsoDay(b.from))}</span>${b.note ? html`<span class="s">${b.note}</span>` : ""}</span>
          <button class="icon-btn" data-act="away-delete" data-id="${b.id}" aria-label="Remove these dates">${icon("trash")}</button></div>`) : empty("No dates added.")}</div></section>
      <div class="btns">${S.on("checkin") ? html`<a class="btn ghost" href="#serve">${icon("check")}Check in to serve</a>` : ""}${canSchedule() ? html`<a class="btn ghost" href="#teams">${icon("people")}Schedule teams</a>` : ""}</div>`,
  };
};
const findAsk = (el) => { const p = S.get("services", el.dataset.plan); return [p, p?.assignments?.find((a) => a.id === el.dataset.id)]; };
function answerAsk(p, a, status, note = "") {
  Object.assign(a, { status, note, respondedAt: new Date().toISOString() });
  const who = S.me().name;
  if (a.by && a.by !== S.me().id) notify(a.by, { kind: "serve", title: status === "accepted" ? `${who} will serve` : `${who} can't serve`, body: `${a.position}, ${planLabel(p)}${note ? `. "${note}"` : ""}`, link: `#crew-${p.id}` });
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
Actions["team-join"] = (el) => { if (!myTeams().includes(el.dataset.team)) S.add("teamMembers", { team: el.dataset.team, userId: S.me().id }); toast(`You joined ${el.dataset.team}`); render(); };
Actions["team-leave"] = (el) => { S.state.teamMembers = S.state.teamMembers.filter((m) => !(m.churchId === S.state.current && m.team === el.dataset.team && m.userId === S.me().id)); S.save(); toast(`You left ${el.dataset.team}`); render(); };
Actions["away-add"] = () => {
  const t = isoDay(new Date());
  openSheet("Dates you're away", html`<form data-form="away-save" novalidate>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>From</span><input type="date" name="from" value="${t}" min="${t}" required></label><label class="field"><span>To</span><input type="date" name="to" value="${t}" min="${t}"></label></div>
    <label class="field"><span>Note (optional)</span><input type="text" name="note" maxlength="80" placeholder="Vacation"></label>
    <button class="btn block">Add dates</button></form>`);
};
Forms["away-save"] = (d, f) => {
  if (!d.from) return formError(f, "Choose the first day you're away.");
  const to = d.to && d.to >= d.from ? d.to : d.from;
  S.state.blockouts.push({ id: uid(), churchId: S.state.current, userId: S.me().id, from: d.from, to, note: d.note });
  S.save(); closeSheet();
  const clash = myAssignments().filter(([p, a]) => a.status !== "declined" && p.date >= d.from && p.date <= to);
  toast(clash.length ? `You're on the schedule ${fmtShort(fromIsoDay(clash[0][0].date))}. Tap "I can't make it" on it to let the scheduler know.` : "Dates added");
  render();
};
Actions["away-delete"] = (el) => { S.state.blockouts = S.state.blockouts.filter((b) => b.id !== el.dataset.id); S.save(); render(); };

// ----- Schedulers -----
Screens.teams = () => {
  if (!canSchedule()) return { redirect: "serving" };
  const plans = upcomingPlans().slice(0, 8);
  return {
    title: "Volunteer teams", back: "ministry",
    body: html`<section class="sec"><h2 class="sec-head">Upcoming services</h2><div class="rows">${plans.length ? plans.map((p) => {
        const st = fillStats(p), d = fromIsoDay(p.date);
        return html`<a class="row" href="#crew-${p.id}"><span class="date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span><span class="body"><span class="t">${p.title} at ${timeLabel(p.time)}</span><span class="s">${fillText(st)}</span>
          <span class="meter" aria-hidden="true"><i style="width:${st.total ? Math.round((st.confirmed / st.total) * 100) : 0}%"></i><i class="w" style="width:${st.total ? Math.round((Math.min(st.waiting, st.total - st.confirmed) / st.total) * 100) : 0}%"></i></span></span>${icon("chev")}</a>`;
      }) : empty("Plan a service first, then schedule its teams here.", S.can("services.plan") ? html`<a class="btn" href="#services">Service plans</a>` : "")}</div></section>
      <section class="sec"><div class="sec-head"><h2>Teams</h2><button class="btn ghost sm" data-act="team-new">${icon("plus")}New team</button></div><div class="rows">${teamsOf().map((t, i) => html`<a class="row" href="#team-${i}"><span class="lead-ic">${icon("hand")}</span><span class="body"><span class="t">${t}</span><span class="s">${plural(teamMembersOf(t).length, "person", "people")}, ${plural(positionsOf(t).length, "position")}</span></span>${icon("chev")}</a>`)}</div></section>`,
  };
};

function planHead(p) {
  return html`<h1 style="margin-top:16px">${p.title}</h1>
    <p class="muted" style="margin-top:4px">${fmtDay(fromIsoDay(p.date))} at ${timeLabel(p.time)}${p.locationId ? `, ${locName(p.locationId)}` : ""}.</p>
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
      ${edit ? html`<div class="btns"><button class="btn sm" data-act="crew-fill" data-plan="${p.id}" ${attr(!st.open, "disabled")}>${icon("bolt")}Fill open spots</button>${st.waiting ? html`<button class="btn ghost sm" data-act="crew-remind" data-plan="${p.id}">${icon("bell")}Remind ${plural(st.waiting, "person", "people")} waiting</button>` : ""}<a class="btn ghost sm" href="#teams">${icon("people")}Teams</a></div>` : ""}
      ${teams.length ? teams.map((team) => html`<section class="sec"><h2 class="sec-head">${team}</h2><div class="rows">${positionsOf(team).map((position) => {
        const people = (p.assignments || []).filter((a) => a.team === team && a.position === position);
        return html`<div class="row crew-row"><span class="body"><span class="t">${position}</span>
          ${people.length ? html`<span class="crew-people">${people.map((a) => html`<button class="crew-person ${a.status}" data-act="crew-person" data-plan="${p.id}" data-id="${a.id}" ${attr(!edit, "disabled")}>${avatar(S.user(a.userId) || { id: a.userId, name: "?" }, "sm")}<span>${S.userName(a.userId)}</span><span class="tag ${ASK_STATUS[a.status][1]}">${ASK_STATUS[a.status][0]}</span></button>`)}</span>` : html`<span class="s">Open</span>`}</span>
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
    const why = [asked && `Already asked: ${ASK_STATUS[asked.status][0].toLowerCase()}`, away && "Away that day", busy && `Already serving as ${busy.position}`, load && `Asked ${plural(load, "time")} in the last two months`].filter(Boolean).join(". ");
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
  const [label] = ASK_STATUS[a.status];
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
      <section class="sec"><div class="sec-head"><h2>People</h2>${edit ? html`<button class="btn ghost sm" data-act="team-add" data-team="${team}">${icon("plus")}Add people</button>` : ""}</div>
        <div class="rows">${people.length ? people.map((m) => {
          const next = myAssignments(m.userId).find(([, a]) => a.team === team && a.status !== "declined"), away = awayDates(m.userId).filter((b) => (b.to || b.from) >= isoDay(new Date()));
          return html`<div class="row">${avatar(S.user(m.userId))}<span class="body"><span class="t">${S.userName(m.userId)}</span><span class="s">${next ? `Next: ${next[1].position}, ${fmtShort(fromIsoDay(next[0].date))}` : "Not scheduled"}${away.length ? `. Away ${fmtShort(fromIsoDay(away[0].from))}${away[0].to !== away[0].from ? ` to ${fmtShort(fromIsoDay(away[0].to))}` : ""}` : ""}</span></span>
            ${edit ? html`<button class="icon-btn" data-act="team-remove" data-id="${m.id}" aria-label="Take ${S.userName(m.userId)} off the team">${icon("x")}</button>` : ""}</div>`;
        }) : empty("Nobody on this team yet.")}</div></section>
      ${plans.length && positions.length ? html`<section class="sec"><h2 class="sec-head">Coming up</h2><div class="rows">${plans.map((p) => {
        const mine = (p.assignments || []).filter((a) => a.team === team && a.status !== "declined"), d = fromIsoDay(p.date);
        return html`<a class="row" href="#crew-${p.id}"><span class="date"><span>${fmtMonth(d)}</span><b>${d.getDate()}</b></span><span class="body"><span class="t">${p.title}</span><span class="s">${mine.length ? mine.map((a) => `${a.position}: ${S.userName(a.userId)}${a.status === "pending" ? " (waiting)" : ""}`).join(", ") : "Nobody scheduled"}</span></span>${icon("chev")}</a>`;
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
Actions["team-add-one"] = (el) => { S.add("teamMembers", { team: el.dataset.team, userId: el.dataset.user }); el.remove(); toast(`${S.userName(el.dataset.user)} added`); render(); };
Actions["team-remove"] = (el) => { S.remove("teamMembers", el.dataset.id); render(); };
