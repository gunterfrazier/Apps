// ---------- The management dashboard, and the fuller reports ----------
// Dashboard (#dashboard): the church at a glance for the people who run it. Each widget shows only to roles that may see
// what's in it, and each person chooses which widgets they see and in what order (kept with their preferences).
// Reports (#reports, #reports-people, -groups, -serving, -events, -giving): the overview in 61-reports.js, plus a page
// for each area with tables and CSV downloads. Everything follows the range and campus chosen at the top.

// ----- Pieces shared by the report pages -----
const REPORT_TABS = [["", "Overview", () => true], ["people", "People", () => S.can("view.reports")], ["groups", "Groups", () => S.can("view.reports")],
  ["serving", "Serving", () => S.can("view.reports")], ["events", "Events", () => S.can("view.reports")], ["giving", "Giving", () => S.can("view.giving")]];
const REPORT_CSV = {};
const csvLine = (cells) => cells.map((c) => (typeof c === "number" ? c : `"${String(c ?? "").replace(/"/g, '""')}"`)).join(",");
/** A table with a CSV download of every row; the page shows the first few. */
function reportTable(id, file, head, rows, { numeric = [], limit = 25, empty = "Nothing here in this range." } = {}) {
  REPORT_CSV[id] = { file: `${file}-${isoDay(new Date())}.csv`, text: [csvLine(head), ...rows.map(csvLine)].join("\n") + "\n" };
  if (!rows.length) return html`<p class="muted" style="margin:0">${empty}</p>`;
  return html`<div class="table-wrap"><table class="mini-table"><thead><tr>${head.map((h, i) => html`<th class="${numeric.includes(i) ? "num" : ""}">${h}</th>`)}</tr></thead>
    <tbody>${rows.slice(0, limit).map((r) => html`<tr>${r.map((c, i) => html`<td class="${numeric.includes(i) ? "num" : ""}">${typeof c === "number" ? c.toLocaleString() : c}</td>`)}</tr>`)}</tbody></table></div>
    <div class="table-foot">${rows.length > limit ? html`<span class="faint">Showing ${limit} of ${rows.length.toLocaleString()}. The download has them all.</span>` : html`<span></span>`}
      <button class="btn ghost sm" data-act="report-csv" data-id="${id}">${icon("download")}Download CSV</button></div>`;
}
Actions["report-csv"] = (el) => { const c = REPORT_CSV[el.dataset.id]; if (c) saveFile(c.file, c.text); };
const pct = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
const nameOf = (id) => S.user(id)?.name || "";
const roleName = (m) => (S.church().roles.find((r) => r.id === m.roleId) || {}).name || "Member";
const inGroups = (userId) => S.list("gatherings").filter((g) => (g.members || []).some((m) => m.userId === userId && m.status === "in") || (g.leaders || []).includes(userId));
const onTeams = (userId) => S.list("teamMembers").filter((m) => m.userId === userId && !m.status).map((m) => m.team);
const giverKey = (g) => g.by || g.name || "Anonymous";

const REPORT_PAGES = {
  people() {
    const { unit, keys, start } = reportBuckets(), members = S.members().filter((m) => S.user(m.userId));
    const joined = members.filter((m) => (m.joined || "").slice(0, 10) >= start);
    const grouped = members.filter((m) => inGroups(m.userId).length).length, serving = members.filter((m) => onTeams(m.userId).length).length;
    const byRole = Object.entries(members.reduce((o, m) => { const r = roleName(m); o[r] = (o[r] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]);
    const rows = members.map((m) => [nameOf(m.userId), roleName(m), (m.joined || "").slice(0, 10), inGroups(m.userId).length, onTeams(m.userId).join(", ")]).sort((a, b) => a[0].localeCompare(b[0]));
    return html`<section class="sec"><div class="sec-head"><h2>People</h2>${S.can("manage.people") ? html`<a href="#admin-people">Manage people</a>` : ""}</div>
      <div class="stat-tiles">${statTile("Members", members.length.toLocaleString(), "With an account here")}${statTile("Joined", joined.length.toLocaleString(), `Last ${REPORT_RANGES[reportRange][0]}`)}
        ${statTile("In a class or group", pct(grouped, members.length), plural(grouped, "person", "people"))}${statTile("On a serving team", pct(serving, members.length), plural(serving, "person", "people"))}</div>
      ${stackedColumns("ppl", { title: unit === "week" ? "People who joined each week" : "People who joined each month", labels: keys.map((k) => bucketLabel(k, unit)), series: [["Joined", keys.map((k) => joined.filter((m) => bucketOf(m.joined.slice(0, 10), unit) === k).length)]], csv: `joined-${isoDay(new Date())}.csv` })}
      <h3 class="sec-head" style="margin-top:18px">By role</h3>${hBarsT("By role", byRole, (n) => n.toLocaleString())}
      <h3 class="sec-head" style="margin-top:18px">Everyone</h3><div class="panel">${reportTable("people", "people", ["Name", "Role", "Joined", "Classes and groups", "Serving teams"], rows, { numeric: [3] })}</div></section>`;
  },
  groups() {
    const all = S.visible("gatherings"), members = S.members().filter((m) => S.user(m.userId));
    const inAny = members.filter((m) => inGroups(m.userId).length).length;
    const rows = all.map((g) => [g.name, g.type === "class" ? "Class" : "Group", (g.leaders || []).map(nameOf).filter(Boolean).join(", "), gCount(g), (g.members || []).filter((m) => m.status === "requested").length, g.capacity || ""]).sort((a, b) => b[3] - a[3]);
    return html`<section class="sec"><div class="sec-head"><h2>Classes and groups</h2></div>
      <div class="stat-tiles">${statTile("Groups", all.filter((g) => g.type !== "class").length.toLocaleString(), "Open now")}${statTile("Classes", all.filter((g) => g.type === "class").length.toLocaleString(), "Open now")}
        ${statTile("Members in one", pct(inAny, members.length), plural(inAny, "person", "people"))}${statTile("Not in any", (members.length - inAny).toLocaleString(), "Members to invite")}</div>
      ${rows.length ? html`<h3 class="sec-head" style="margin-top:18px">People in each</h3>${hBarsT("People in each", rows.slice(0, 12).map((r) => [r[0], r[3]]), (n) => n.toLocaleString())}` : ""}
      <h3 class="sec-head" style="margin-top:18px">All classes and groups</h3><div class="panel">${reportTable("groups", "classes-and-groups", ["Name", "Kind", "Led by", "People", "Waiting", "Room for"], rows, { numeric: [3, 4, 5], empty: "No classes or groups yet." })}</div></section>`;
  },
  serving() {
    const { start } = reportBuckets(), today = isoDay(new Date()), teams = teamsOf();
    const tm = S.list("teamMembers").filter((m) => !m.status && S.user(m.userId)), people = new Set(tm.map((m) => m.userId));
    const plans = S.list("services").filter((p) => p.date >= start && p.date <= today), coming = upcomingPlans();
    const open = coming.reduce((n, p) => n + fillStats(p).open, 0);
    const times = {};
    plans.forEach((p) => (p.assignments || []).filter((a) => a.status !== "declined").forEach((a) => { times[a.userId] = (times[a.userId] || 0) + 1; }));
    const rows = Object.entries(times).filter(([u]) => S.user(u)).map(([u, n]) => [nameOf(u), n, onTeams(u).join(", ")]).sort((a, b) => b[1] - a[1]);
    const sizes = teams.map((t) => [t, tm.filter((m) => m.team === t).length]).sort((a, b) => b[1] - a[1]);
    return html`<section class="sec"><div class="sec-head"><h2>Serving</h2>${S.can("schedule.teams") ? html`<a href="#teams">Teams and schedule</a>` : ""}</div>
      <div class="stat-tiles">${statTile("Volunteers", people.size.toLocaleString(), plural(teams.length, "team"))}${statTile("Services planned", coming.length.toLocaleString(), "Coming up")}
        ${statTile("Open spots", open.toLocaleString(), "In coming services")}${statTile("People who served", rows.length.toLocaleString(), `Last ${REPORT_RANGES[reportRange][0]}`)}</div>
      ${sizes.length ? html`<h3 class="sec-head" style="margin-top:18px">Team sizes</h3>${hBarsT("Team sizes", sizes, (n) => n.toLocaleString())}` : ""}
      <h3 class="sec-head" style="margin-top:18px">Times scheduled</h3><div class="panel">${reportTable("serving", "serving", ["Name", "Times scheduled", "Teams"], rows, { numeric: [1], empty: "Nobody was scheduled in this range." })}</div></section>`;
  },
  events() {
    const { start } = reportBuckets(), now = new Date().toISOString();
    const list = S.visible("events").filter((e) => e.start.slice(0, 10) >= start).sort((a, b) => a.start.localeCompare(b.start));
    const past = list.filter((e) => e.start < now), coming = list.filter((e) => e.start >= now), signups = list.filter((e) => e.signup);
    const total = signups.reduce((n, e) => n + registeredCount(e), 0);
    const rows = list.map((e) => [e.title, e.start.slice(0, 10), e.category || "", e.signup ? registeredCount(e) : "", e.capacity || "", e.start < now ? "Past" : "Coming up"]);
    return html`<section class="sec"><div class="sec-head"><h2>Events</h2><a href="#events">Calendar</a></div>
      <div class="stat-tiles">${statTile("Events held", past.length.toLocaleString(), `Last ${REPORT_RANGES[reportRange][0]}`)}${statTile("Coming up", coming.length.toLocaleString(), "On the calendar")}
        ${statTile("Sign-ups", total.toLocaleString(), plural(signups.length, "event with sign-up", "events with sign-up"))}</div>
      ${signups.length ? html`<h3 class="sec-head" style="margin-top:18px">Sign-ups by event</h3>${hBarsT("Sign-ups by event", signups.map((e) => [e.title, registeredCount(e)]).sort((a, b) => b[1] - a[1]).slice(0, 12), (n) => n.toLocaleString())}` : ""}
      <h3 class="sec-head" style="margin-top:18px">All events</h3><div class="panel">${reportTable("events", "events", ["Event", "Date", "Kind", "Signed up", "Room for", "When"], rows, { numeric: [3, 4], empty: "No events in this range." })}</div></section>`;
  },
  giving() {
    const { keys, start } = reportBuckets(), all = S.list("gifts"), gifts = all.filter((g) => g.at.slice(0, 10) >= start);
    // The stretch of the same length just before this one, to see who's new and who has stopped.
    const span = fromIsoDay(isoDay(new Date())) - fromIsoDay(start), before = isoDay(new Date(fromIsoDay(start).getTime() - span));
    const earlier = all.filter((g) => g.at.slice(0, 10) < start), prior = all.filter((g) => g.at.slice(0, 10) >= before && g.at.slice(0, 10) < start);
    const now = new Set(gifts.map(giverKey)), everBefore = new Set(earlier.map(giverKey)), lapsed = [...new Set(prior.map(giverKey))].filter((k) => !now.has(k));
    const fresh = [...now].filter((k) => !everBefore.has(k)), total = gifts.reduce((n, g) => n + g.amount, 0);
    const by = (f) => Object.entries(gifts.reduce((o, g) => { const k = f(g); o[k] = (o[k] || 0) + g.amount; return o; }, {})).sort((a, b) => b[1] - a[1]);
    const label = (s) => String(s || "Other").replace(/^./, (c) => c.toUpperCase());
    const regular = gifts.filter((g) => g.frequency && g.frequency !== "once").reduce((n, g) => n + g.amount, 0);
    const givers = Object.values(gifts.reduce((o, g) => { const k = giverKey(g), r = (o[k] ||= { name: g.name || nameOf(g.by) || "Anonymous", n: 0, total: 0, last: "" }); r.n++; r.total += g.amount; if (g.at > r.last) r.last = g.at; return o; }, {}))
      .sort((a, b) => b.total - a.total).map((r) => [r.name, r.n, Math.round(r.total * 100) / 100, r.last.slice(0, 10)]);
    const funds = S.church().funds.map((f) => [f.name, gifts.filter((g) => g.fundId === f.id).reduce((n, g) => n + g.amount, 0)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    return html`<section class="sec"><div class="sec-head"><h2>Giving in detail</h2><a href="#admin-giving">All gifts</a></div>
      <div class="stat-tiles">${statTile("Given", money(Math.round(total)), `Last ${REPORT_RANGES[reportRange][0]}`)}${statTile("Givers", now.size.toLocaleString(), plural(gifts.length, "gift"))}
        ${statTile("New givers", fresh.length.toLocaleString(), "First gift in this range")}${statTile("Stopped giving", lapsed.length.toLocaleString(), "Gave in the stretch before, not in this one")}</div>
      ${gifts.length ? html`<h3 class="sec-head" style="margin-top:18px">Regular and one-time</h3><div class="panel">${segBarT("Regular and one-time", [["Regular giving", Math.round(regular)], ["One-time gifts", Math.round(total - regular)]])}</div>` : ""}
      ${funds.length ? html`<h3 class="sec-head" style="margin-top:18px">By fund</h3>${hBarsT("By fund", funds, money)}` : ""}
      ${gifts.length ? html`<h3 class="sec-head" style="margin-top:18px">By how it was given</h3>${hBarsT("By how it was given", by((g) => label(g.method)), money)}` : ""}
      <h3 class="sec-head" style="margin-top:18px">By giver</h3><div class="panel">${reportTable("givers", "giving-by-giver", ["Name", "Gifts", "Total", "Last gift"], givers, { numeric: [1, 2], empty: "No gifts in this range." })}</div>
      ${lapsed.length ? html`<h3 class="sec-head" style="margin-top:18px">Stopped giving</h3><div class="panel">${reportTable("lapsed", "stopped-giving", ["Name", "Last gift"], lapsed.map((k) => { const l = prior.filter((g) => giverKey(g) === k).sort((a, b) => b.at.localeCompare(a.at))[0]; return [l.name || nameOf(l.by) || "Anonymous", l.at.slice(0, 10)]; }))}</div>` : ""}</section>`;
  },
};
const reportOverview = Screens.reports;
Screens.reports = (tab = "") => {
  if (!canReports()) return reportOverview();
  const tabs = REPORT_TABS.filter(([, , ok]) => ok()), here = tabs.some(([k]) => k === tab) ? tab : "";
  const nav = html`<nav class="seg report-tabs" aria-label="Reports">${tabs.map(([k, l]) => html`<a href="#reports${k ? `-${k}` : ""}" ${here === k ? raw('aria-current="page"') : ""}>${l}</a>`)}</nav>`;
  if (!here) { const v = reportOverview(); return v.body ? { ...v, body: html`${nav}${v.body}` } : v; }
  return { title: "Reports", back: hasAdminTools() ? "dashboard" : "ministry",
    body: html`${nav}<div class="report-filters"><label><span class="sr">Range</span><select data-change="report-range">${Object.entries(REPORT_RANGES).map(([k, [l]]) => html`<option value="${k}" ${attr(k === reportRange, "selected")}>Last ${l}</option>`)}</select></label>${campusChip()}</div>
      ${REPORT_PAGES[here]()}` };
};

// ----- The dashboard -----
const DASH = {
  numbers: ["Key numbers", () => true, () => {
    const members = S.members().filter((m) => S.user(m.userId)), month = isoDay(new Date()).slice(0, 7), cut = isoDay(new Date(Date.now() - 30 * DAY));
    const tiles = [statTile("Members", members.length.toLocaleString(), `${members.filter((m) => (m.joined || "").slice(0, 10) >= cut).length} joined in the last 30 days`)];
    if (S.can("view.reports")) {
      const from = isoDay(new Date(Date.now() - 28 * DAY)), svc = serviceAttendance().filter((r) => r.date >= from), weeks = new Set(svc.map((r) => weekOf(r.date))).size;
      tiles.push(statTile("Average attendance", (weeks ? Math.round(svc.reduce((n, r) => n + (+r.adults || 0) + (+r.kids || 0) + (+r.online || 0), 0) / weeks) : 0).toLocaleString(), "Per week, last 4 weeks"));
      tiles.push(statTile("New people", S.list("followups").filter((f) => f.at.slice(0, 10) >= cut).length.toLocaleString(), "Last 30 days"));
    }
    if (S.can("view.giving")) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const lastMonth = isoDay(d).slice(0, 7);
      const sum = (m) => S.list("gifts").filter((g) => g.at.slice(0, 7) === m).reduce((n, g) => n + g.amount, 0);
      tiles.push(statTile("Given this month", money(Math.round(sum(month))), `${money(Math.round(sum(lastMonth)))} last month`));
    }
    return html`<div class="stat-tiles">${tiles}</div>`;
  }],
  attention: ["Needs attention", () => true, () => {
    const w = waitingRequests(), items = [], c = S.church(), soon = isoDay(new Date(Date.now() + 14 * DAY));
    const add = (n, one, many, href) => { if (n) items.push(html`<a class="row" href="#${href}"><span class="body"><span class="t">${plural(n, one, many)}</span></span>${icon("chev")}</a>`); };
    if (c.ownerId === S.me().id && deactStatus(c) === "requested") add(1, "request to deactivate the church account", "", "admin-deactivate");
    add(w.rooms.length, "room request to approve", "room requests to approve", "rooms");
    add(w.volunteers.length, "person asking to join a team", "people asking to join a team", "teams");
    add(w.groups.length, "request to join a class or group", "requests to join a class or group", "admin-approvals");
    if (S.can("manage.followup")) add(S.list("followups").filter((f) => f.status === "new").length, "new person not reached yet", "new people not reached yet", "followup");
    if (S.can("schedule.teams")) add(upcomingPlans().filter((p) => p.date <= soon).reduce((n, p) => n + fillStats(p).open, 0), "open volunteer spot in the next two weeks", "open volunteer spots in the next two weeks", "teams");
    if (S.can("manage.devices")) add(S.list("devices").filter((d) => d.status !== "paired").length, "screen waiting to be paired", "screens waiting to be paired", "devices");
    return items.length ? html`<div class="rows">${items}</div>` : html`<p class="muted" style="margin:0">Nothing is waiting on you.</p>`;
  }],
  attendance: ["Attendance", () => S.can("view.reports"), () => {
    const { keys } = reportBuckets("8w"), svc = serviceAttendance().filter((r) => r.date >= keys[0]);
    const per = (f) => keys.map((k) => svc.filter((r) => weekOf(r.date) === k).reduce((n, r) => n + (+r[f] || 0), 0));
    return html`${stackedColumns("dash-att", { title: "People each week, last 8 weeks", labels: keys.map((k) => bucketLabel(k, "week")), series: [["In the room", per("adults")], ["Kids", per("kids")], ["Online", per("online")]] })}
      <a class="dash-more" href="#reports">Attendance report</a>`;
  }],
  giving: ["Giving", () => S.can("view.giving"), () => {
    const { keys } = reportBuckets("6m"), gifts = S.list("gifts").filter((g) => g.at.slice(0, 10) >= keys[0]);
    return html`${stackedColumns("dash-give", { title: "Given each month, last 6 months", labels: keys.map((k) => bucketLabel(k, "month")), series: [["Given", keys.map((k) => gifts.filter((g) => `${g.at.slice(0, 7)}-01` === k).reduce((n, g) => n + g.amount, 0))]], money: true })}
      <a class="dash-more" href="#reports-giving">Giving report</a>`;
  }],
  newcomers: ["New people", () => S.can("view.reports") || S.can("manage.followup"), () => {
    const cut = isoDay(new Date(Date.now() - 84 * DAY)), g = S.list("followups").filter((f) => f.at.slice(0, 10) >= cut), by = (k) => g.filter((f) => f.status === k).length;
    return html`${g.length ? html`<p style="margin-top:0"><b>${plural(g.length, "new person", "new people")}</b> in the last 12 weeks.</p>${segBar([["Connected", by("connected")], ["Contacted", by("contacted")], ["Not reached yet", by("new")], ["Closed", by("closed")]])}`
      : html`<p class="muted" style="margin:0">No new people in the last 12 weeks.</p>`}${S.can("manage.followup") ? html`<a class="dash-more" href="#followup">Follow-up</a>` : ""}`;
  }],
  events: ["Coming up", () => true, () => {
    const now = new Date().toISOString(), list = S.visible("events").filter((e) => e.start >= now).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 5);
    return html`${list.length ? html`<div class="rows">${list.map((e) => html`<a class="row" href="#event-${e.id}"><span class="body"><span class="t">${e.title}</span><span class="s">${fmt(e.start, { weekday: "short", month: "short", day: "numeric" })}${e.signup ? `, ${registeredCount(e)} signed up${e.capacity ? ` of ${e.capacity}` : ""}` : ""}</span></span>${icon("chev")}</a>`)}</div>`
      : html`<p class="muted" style="margin:0">Nothing on the calendar yet.</p>`}<a class="dash-more" href="#reports-events">Events report</a>`;
  }],
  serving: ["Volunteers", () => S.can("schedule.teams") || S.can("view.reports"), () => {
    const list = upcomingPlans().slice(0, 4);
    return html`${list.length ? html`<div class="rows">${list.map((p) => { const st = fillStats(p); return html`<a class="row" href="#teams"><span class="body"><span class="t">${fmt(fromIsoDay(p.date), { weekday: "short", month: "short", day: "numeric" })}${p.title ? `, ${p.title}` : ""}</span><span class="s">${fillText(st)}</span></span>${st.open ? html`<span class="tag warn">${st.open} open</span>` : html`<span class="tag brand">Full</span>`}</a>`; })}</div>`
      : html`<p class="muted" style="margin:0">No services planned yet.</p>`}<a class="dash-more" href="#reports-serving">Serving report</a>`;
  }],
  groups: ["Classes and groups", () => S.can("view.reports") || S.can("manage.classes"), () => {
    const all = S.visible("gatherings"), members = S.members().filter((m) => S.user(m.userId)), inAny = members.filter((m) => inGroups(m.userId).length).length;
    return html`<p style="margin-top:0"><b>${plural(all.length, "class or group", "classes and groups")}</b>. ${pct(inAny, members.length)} of members are in at least one.</p>
      ${all.length ? hBars(all.map((g) => [g.name, gCount(g)]).sort((a, b) => b[1] - a[1]).slice(0, 5), (n) => n.toLocaleString()) : ""}<a class="dash-more" href="#reports-groups">Groups report</a>`;
  }],
};
DASH.dates = ["Birthdays and milestones", () => canSeeDates(), () => {
  const list = datesComing(14);
  return list.length ? html`<div class="rows">${list.slice(0, 8).map((x) => html`<a class="row" href="#dates-${x.m.userId}"><span class="body"><span class="t">${x.m.name || nameOf(x.m.userId)}</span><span class="s">${dateLine(x)}</span></span><span class="tag ${x.inDays === 0 ? "brand" : ""}">${x.inDays === 0 ? "Today" : fmt(x.next, { month: "short", day: "numeric" })}</span></a>`)}</div>`
    : html`<p class="muted" style="margin:0">Nothing in the next two weeks. People add their dates under Me, My dates.</p>`;
}];
DASH.campaigns = ["Pledge campaigns", () => S.can("view.giving") && campaignsOpen().length > 0, () => html`<div style="display:grid;gap:10px">${campaignsOpen().map((c) => campaignCard(c, { manage: true }))}</div><a class="dash-more" href="#admin-campaigns">Campaigns</a>`];
/** This person's dashboard: the widgets they may see, in their order, with the ones they've hidden marked. */
function dashLayout() {
  const p = prefs().dash || {}, order = (p.order || []).filter((k) => DASH[k]), hide = p.hide || [];
  return [...order, ...Object.keys(DASH).filter((k) => !order.includes(k))].filter((k) => DASH[k][1]()).map((k) => ({ k, title: DASH[k][0], on: !hide.includes(k) }));
}
Screens.dashboard = () => {
  if (!S.isMember() || !hasAdminTools()) return { redirect: "me" };
  const shown = dashLayout().filter((w) => w.on);
  return { title: "Dashboard", back: "admin",
    body: html`<div class="report-filters"><span class="muted">${S.church().name}</span>${campusChip()}<button class="btn ghost sm" data-act="dash-edit">${icon("edit")}Customize</button></div>
      ${shown.map((w) => html`<section class="sec dash-widget" data-widget="${w.k}">${w.k === "numbers" ? "" : html`<div class="sec-head"><h2>${w.title}</h2></div>`}${["numbers", "attendance", "giving", "campaigns"].includes(w.k) ? DASH[w.k][2]() : html`<div class="panel">${DASH[w.k][2]()}</div>`}</section>`)}
      ${shown.length ? "" : html`<div class="panel" style="margin-top:16px"><p style="margin:0">Every widget is hidden. Choose Customize to bring some back.</p></div>`}
      ${canReports() ? html`<p style="text-align:center;margin-top:18px"><a class="btn ghost" href="#reports">All reports</a></p>` : ""}` };
};
function dashSheet() {
  const list = dashLayout();
  openSheet("Customize your dashboard", html`<p class="muted" style="margin-top:0">Choose what you see and in what order. This is your own view; it doesn't change anyone else's.</p>
    <div class="dash-edit">${list.map((w, i) => html`<div class="dash-edit-row"><label class="check"><input type="checkbox" data-change="dash-show" data-id="${w.k}" ${attr(w.on, "checked")}><span>${w.title}</span></label>
      <span><button class="btn ghost sm" data-act="dash-move" data-id="${w.k}" data-dir="-1" aria-label="Move ${w.title} up" ${attr(i === 0, "disabled")}>Up</button><button class="btn ghost sm" data-act="dash-move" data-id="${w.k}" data-dir="1" aria-label="Move ${w.title} down" ${attr(i === list.length - 1, "disabled")}>Down</button></span></div>`)}</div>
    <button class="btn block" data-act="dash-done">Done</button>`);
}
const dashSave = (change) => { const p = prefs(); p.dash = { order: dashLayout().map((w) => w.k), hide: [...(p.dash?.hide || [])] }; change(p.dash); S.save(); };
Actions["dash-edit"] = dashSheet;
Actions["dash-done"] = () => { closeSheet(true); render(); };
Inputs["dash-show"] = (el) => dashSave((d) => { d.hide = d.hide.filter((k) => k !== el.dataset.id); if (!el.checked) d.hide.push(el.dataset.id); });
Actions["dash-move"] = (el) => { dashSave((d) => { const i = d.order.indexOf(el.dataset.id), j = i + +el.dataset.dir; if (i < 0 || j < 0 || j >= d.order.length) return; [d.order[i], d.order[j]] = [d.order[j], d.order[i]]; }); dashSheet(); };
