// ---------- Who was here, people's dates, pledge campaigns, group email and the activity log ----------

// ===== Activity log: who did what, for the people who run the church account =====
/** Notes something in the church's activity log. Kept short: what happened, in words an administrator would use. */
function logActivity(what, area = "") {
  if (!S.church() || !S.isMember() || thisDevice()) return;
  S.state.activity.unshift({ id: uid(), churchId: S.state.current, by: S.me().id, name: S.me().name, what: String(what).slice(0, 240), area, at: new Date().toISOString() });
  const mine = S.state.activity.filter((a) => a.churchId === S.state.current);
  if (!Backend.on && mine.length > 500) S.state.activity = S.state.activity.filter((a) => a.churchId !== S.state.current || mine.indexOf(a) < 500);
  S.save();
}
const ACTIVITY_WORDS = { "gift.created": "Gave", "event.registered": "Signed up for an event", "event.payment": "Recorded a ticket payment", "attendance.recorded": "Recorded attendance", "volunteer.requested": "Asked to join a team", "volunteer.joined": "Joined a team",
  "followup.created": "Added a new person to follow up", "prayer.created": "Shared a prayer request", "form.submitted": "Sent in a form", "checkin.created": "Checked a child in", "member.joined": "Joined the church" };
/** Everything the app announces to outside systems is also worth a line in the log. */
function logEvent(event, data = {}) {
  const what = ACTIVITY_WORDS[event] || event.replace(/[._]/g, " ");
  const about = data.team || data.event || data.title || data.form || data.name || "";
  logActivity(about && typeof about === "string" ? `${what}: ${about}` : what, event.split(".")[0]);
}
AdminScreens.activity = () => {
  const stop = guard("manage.church"); if (stop) return stop;
  const list = S.list("activity").filter((a) => !a.hidden).sort((a, b) => b.at.localeCompare(a.at));
  return { title: "Activity log", back: "admin", body: html`<p class="muted" style="margin-top:14px">Who did what at ${S.church().name}, newest first.</p>
    <div class="panel">${reportTable("activity", "activity-log", ["When", "Who", "What"], list.map((a) => [fmt(a.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), a.name || nameOf(a.by) || "Someone", a.what]), { limit: 100, empty: "Nothing has been logged yet. Changes people make from now on show here." })}</div>` };
};

// ===== Who was here: people mark themselves, or are scanned or ticked off =====
const PRESENCE_ASK = "our-faithful-presence-asked";
/** The service going on now, from half an hour before it starts. */
function serviceNow() {
  return upcomingServices(S.church(), 3).find((s) => s.live || (s.start - Date.now() < 30 * 60e3 && s.start - Date.now() > -120 * 60e3)) || null;
}
const presentAt = (key, userId = S.me().id) => S.list("presence").some((p) => p.serviceKey === key && p.userId === userId);
const canTakeAttendance = () => S.isMember() && S.canAny(["checkin.station", "view.reports"]);
function markPresent(userId, svc, via) {
  const key = typeof svc === "string" ? svc : serviceKey(svc);
  if (presentAt(key, userId)) return false;
  const [date, rest] = key.split("T");
  S.add("presence", { userId, name: userId === S.me().id ? S.me().name : nameOf(userId), serviceKey: key, date, locationId: rest.split("@")[1] || null, via, by: S.me().id, at: new Date().toISOString() });
  return true;
}
/** Opening the app during a service: ask once whether they're here. */
function presencePrompt() {
  if (!S.church() || !S.isMember() || thisDevice() || $("#scrim") || location.hash.replace("#", "").split("-")[0] !== "home" || prefs().askPresence === false) return;
  const svc = serviceNow(); if (!svc) return;
  const key = serviceKey(svc);
  let asked = []; try { asked = JSON.parse(sessionStorage.getItem(PRESENCE_ASK) || "[]"); } catch {}
  if (presentAt(key) || asked.includes(key)) return;
  try { sessionStorage.setItem(PRESENCE_ASK, JSON.stringify([...asked, key])); } catch {}
  openSheet("Are you at church?", html`<p style="margin-top:0">It's time for <b>${serviceName(svc)}</b>. Let ${S.church().name} know you're here.</p>
    <div class="btns"><button class="btn" data-act="presence-yes" data-key="${key}">${icon("check")}Yes, I'm here</button><button class="btn ghost" data-act="close-sheet">Not today</button></div>
    <p style="margin-bottom:0"><button type="button" class="linkish" data-act="presence-never">Don't ask me this</button></p>`);
}
Actions["presence-yes"] = (el) => { markPresent(S.me().id, el.dataset.key, "self"); closeSheet(true); toast("Thanks. You're marked as here."); render(); };
Actions["presence-never"] = () => { prefs().askPresence = false; S.save(); closeSheet(true); toast("We won't ask. You can still mark yourself here under Me."); };
/** #here: your own card and history. #here-<person>: staff scanned that person's card. */
Screens.here = (who = "") => {
  if (!S.isMember()) return { redirect: "home" };
  const me = S.me(), svc = serviceNow(), key = svc && serviceKey(svc);
  if (who && who !== me.id) {
    const p = S.user(who), ok = canTakeAttendance() && p && S.membership(S.state.current, who);
    const done = ok && svc ? markPresent(who, svc, "scan") : false;
    return { title: "Attendance", back: "scan", body: html`<div class="panel" style="margin-top:16px" role="status">${!canTakeAttendance() ? html`<p style="margin:0">Your role doesn't include taking attendance.</p>`
      : !ok ? html`<p style="margin:0">That card isn't for a member of ${S.church().name}.</p>` : !svc ? html`<p style="margin:0"><b>${p.name}</b>: no service is going on right now, so nothing was marked.</p>`
      : html`<p style="margin:0;font-size:1.15rem"><b>${p.name}</b> ${done ? "is marked as here." : "was already marked as here."}</p><p class="muted" style="margin-bottom:0">${serviceName(svc)}</p>`}
      <div class="btns" style="margin-top:14px"><a class="btn" href="#scan">${icon("scan")}Scan the next card</a><a class="btn ghost" href="#rollcall">Tick people off a list</a></div></div>` };
  }
  const mine = S.list("presence").filter((p) => p.userId === me.id).sort((a, b) => b.serviceKey.localeCompare(a.serviceKey)).slice(0, 12);
  return { title: "My attendance", back: "me", body: html`
    <section class="sec panel" style="text-align:center"><div class="my-card">${raw(qrSvg(appLink(`here-${me.id}`), { size: 220 }))}</div>
      <p style="margin:10px 0 0"><b>${me.name}</b></p><p class="faint" style="margin:0">Your attendance card. A greeter can scan it at the door.</p></section>
    <section class="sec panel">${svc ? (presentAt(key) ? html`<p style="margin:0">${icon("check")} You're marked as here for <b>${serviceName(svc)}</b>.</p>`
        : html`<p style="margin-top:0">It's time for <b>${serviceName(svc)}</b>.</p><button class="btn block" data-act="presence-yes" data-key="${key}">${icon("check")}I'm here</button>`)
      : html`<p class="muted" style="margin:0">When a service is on, you can mark yourself as here from this screen.</p>`}
      <label class="check" style="margin-top:12px"><input type="checkbox" data-change="presence-ask" ${attr(prefs().askPresence !== false, "checked")}><span>Ask me when I open the app during a service</span></label></section>
    ${mine.length ? html`<section class="sec"><div class="sec-head"><h2>Recently</h2></div><div class="rows">${mine.map((p) => html`<div class="row"><span class="body"><span class="t">${fmt(fromIsoDay(p.date), { weekday: "long", month: "long", day: "numeric" })}</span><span class="s">${p.serviceKey.slice(11, 16)}</span></span></div>`)}</div></section>` : ""}
    ${canTakeAttendance() ? html`<p style="text-align:center"><a class="btn ghost" href="#rollcall">Take attendance</a></p>` : ""}` };
};
Inputs["presence-ask"] = (el) => { prefs().askPresence = el.checked; S.save(); };
let rollService = "";
Screens.rollcall = () => {
  if (!canTakeAttendance()) return { redirect: "me" };
  const now = serviceNow(), list = [...(now ? [now] : []), ...recentServiceTimes(21).filter((s) => !now || serviceKey(s) !== serviceKey(now))];
  if (!list.length) return { title: "Take attendance", back: "ministry", body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">No services in the last three weeks. Add service times under Admin, Locations.</p></div>` };
  const key = list.some((s) => serviceKey(s) === rollService) ? rollService : serviceKey(list[0]);
  const people = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)), here = people.filter((p) => presentAt(key, p.id)).length;
  return { title: "Take attendance", back: "ministry", body: html`<div class="report-filters"><label><span class="sr">Service</span><select data-change="roll-service">${list.map((s) => html`<option value="${serviceKey(s)}" ${attr(serviceKey(s) === key, "selected")}>${serviceName(s)}</option>`)}</select></label><a class="btn ghost sm" href="#scan">${icon("scan")}Scan cards</a></div>
    <p class="muted" role="status"><b>${here}</b> of ${people.length} marked as here.</p>
    <div class="pick-list roll-list">${people.map((p) => html`<label class="check"><input type="checkbox" data-change="roll-mark" data-id="${p.id}" data-key="${key}" ${attr(presentAt(key, p.id), "checked")}><span>${p.name}</span></label>`)}</div>` };
};
Inputs["roll-service"] = (el) => { rollService = el.value; render(); };
Inputs["roll-mark"] = (el) => {
  const { id, key } = el.dataset;
  if (el.checked) markPresent(id, key, "list");
  else { const p = S.list("presence").find((x) => x.serviceKey === key && x.userId === id); if (p) S.remove("presence", p.id); }
  S.save(); render();
};
REPORT_TABS.splice(1, 0, ["attendance", "Attendance", () => S.can("view.reports")]);
REPORT_PAGES.attendance = () => {
  const { start } = reportBuckets(), all = S.list("presence"), inRange = all.filter((p) => p.date >= start);
  const services = new Set(inRange.map((p) => p.serviceKey)).size, cut = isoDay(new Date(Date.now() - 28 * DAY));
  const people = S.members().map((m) => S.user(m.userId)).filter(Boolean);
  const rows = people.map((p) => { const mine = inRange.filter((x) => x.userId === p.id), last = all.filter((x) => x.userId === p.id).map((x) => x.date).sort().pop() || ""; return [p.name, mine.length, services ? `${Math.round((mine.length / services) * 100)}%` : "", last]; })
    .filter((r) => r[1] || r[3]).sort((a, b) => b[1] - a[1]);
  const away = people.map((p) => [p.name, all.filter((x) => x.userId === p.id).map((x) => x.date).sort().pop() || ""]).filter(([, last]) => last && last < cut).sort((a, b) => a[1].localeCompare(b[1]));
  const never = people.filter((p) => !all.some((x) => x.userId === p.id)).length;
  return html`<section class="sec"><div class="sec-head"><h2>Who was here</h2><a href="#rollcall">Take attendance</a></div>
    <div class="stat-tiles">${statTile("People marked here", new Set(inRange.map((p) => p.userId)).size.toLocaleString(), `Last ${REPORT_RANGES[reportRange][0]}`)}${statTile("Services counted", services.toLocaleString(), "With at least one person marked")}
      ${statTile("Not seen in 4 weeks", away.length.toLocaleString(), "Were here before")}${statTile("Never marked", never.toLocaleString(), "Members with no attendance yet")}</div>
    <p class="faint">People mark themselves when they open the app during a service, or are scanned or ticked off by a greeter. Head counts are under Overview.</p>
    <h3 class="sec-head" style="margin-top:18px">By person</h3><div class="panel">${reportTable("presence", "attendance-by-person", ["Name", "Times here", "Share of services", "Last here"], rows, { numeric: [1], empty: "Nobody has been marked as here in this range." })}</div>
    <h3 class="sec-head" style="margin-top:18px">Not seen in 4 weeks</h3><div class="panel">${reportTable("away", "not-seen-in-4-weeks", ["Name", "Last here"], away, { empty: "Everyone who has been here was here in the last 4 weeks." })}</div></section>`;
};

// ===== People's dates: birthdays, anniversaries, baptisms and other milestones =====
const DATE_KINDS = { birthday: "Birthday", anniversary: "Wedding anniversary", baptism: "Baptism", membership: "Became a member", other: "Other" };
const canSeeDates = () => S.isMember() && S.canAny(["manage.people", "manage.followup"]);
/** Milestones in the next `days`, soonest first, each with the date it falls on this time round. */
function datesComing(days = 14) {
  const today = fromIsoDay(isoDay(new Date()));
  return S.list("milestones").map((m) => {
    const [, mo, da] = m.date.split("-").map(Number), next = new Date(today.getFullYear(), mo - 1, da, 12);
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return { m, next, years: next.getFullYear() - +m.date.slice(0, 4), inDays: Math.round((next - today) / DAY) };
  }).filter((x) => x.inDays <= days).sort((a, b) => a.next - b.next);
}
const dateLine = (x) => `${DATE_KINDS[x.m.kind] || "Date"}${x.m.label ? ` (${x.m.label})` : ""}${x.m.kind !== "birthday" && x.years > 0 && x.years < 120 ? `, ${plural(x.years, "year")}` : ""}`;
Screens.dates = (who = "") => {
  if (!S.isMember()) return { redirect: "home" };
  const me = S.me().id, id = who && S.can("manage.people") ? who : me, person = id === me ? S.me() : S.user(id);
  if (!person) return { redirect: "me" };
  const list = S.list("milestones").filter((m) => m.userId === id).sort((a, b) => a.date.slice(5).localeCompare(b.date.slice(5)));
  return { title: id === me ? "My dates" : `${person.name}'s dates`, back: id === me ? "me" : "dashboard", body: html`
    <p class="muted" style="margin-top:14px">${id === me ? `Birthdays, anniversaries and milestones. The pastors and staff of ${S.church().name} see these so they can remember them; other members don't.` : "Only pastors and staff see these."}</p>
    ${list.length ? html`<div class="rows">${list.map((m) => html`<div class="row"><span class="body"><span class="t">${DATE_KINDS[m.kind] || "Date"}${m.label ? `: ${m.label}` : ""}</span><span class="s">${fmt(fromIsoDay(m.date), { month: "long", day: "numeric", year: "numeric" })}</span></span><button class="btn ghost sm" data-act="date-remove" data-id="${m.id}" aria-label="Remove ${DATE_KINDS[m.kind] || "date"}">Remove</button></div>`)}</div>` : ""}
    <form data-form="date-add" class="panel" style="margin-top:14px" novalidate><input type="hidden" name="userId" value="${id}">
      <label class="field"><span>What</span><select name="kind">${Object.entries(DATE_KINDS).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label class="field"><span>Date</span><input type="date" name="date" max="${isoDay(new Date())}" required></label>
      <label class="field"><span>Note (optional)</span><input type="text" name="label" maxlength="60" placeholder="For example, a spouse's name"></label>
      <button class="btn block">Add date</button></form>` };
};
Forms["date-add"] = (d, f) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || "")) return formError(f, "Choose the date.");
  const id = d.userId !== S.me().id && S.can("manage.people") ? d.userId : S.me().id;
  S.add("milestones", { userId: id, name: id === S.me().id ? S.me().name : nameOf(id), kind: DATE_KINDS[d.kind] ? d.kind : "other", date: d.date, label: String(d.label || "").trim().slice(0, 60), at: new Date().toISOString() });
  toast("Date added"); render();
};
Actions["date-remove"] = (el) => { const m = S.get("milestones", el.dataset.id); if (m && (m.userId === S.me().id || S.can("manage.people"))) { S.remove("milestones", m.id); S.save(); render(); } };
/** Pastors and staff get a note in their notifications on the day. */
function datesTick() {
  if (!S.church() || !canSeeDates() || thisDevice()) return;
  const year = new Date().getFullYear(); let changed = false;
  datesComing(0).forEach((x) => {
    const id = `n-date-${x.m.id}-${year}-${S.me().id}`;
    if (x.m.userId === S.me().id || S.state.notifications.some((n) => n.id === id)) return;
    S.state.notifications.unshift({ id, churchId: S.state.current, userId: S.me().id, at: new Date().toISOString(), read: false, kind: "care", title: `Today: ${x.m.name || nameOf(x.m.userId)}`, body: dateLine(x), link: "#dashboard" });
    changed = true;
  });
  if (changed) S.save();
}

// ===== Pledge campaigns =====
const campaignTotals = {};   // from the server, for members who can't see everyone's gifts: { [campaignId]: { given, pledged, pledges } }
const canCampaigns = () => S.isMember() && S.can("view.giving");
function campaignStats(c) {
  if (Backend.on && !S.can("view.giving")) return campaignTotals[c.id] || { given: 0, pledged: 0, pledges: 0 };
  const gifts = S.list("gifts").filter((g) => g.fundId === c.fundId && g.at.slice(0, 10) >= c.start && (!c.end || g.at.slice(0, 10) <= c.end)), pl = S.list("pledges").filter((p) => p.campaignId === c.id);
  return { given: gifts.reduce((n, g) => n + g.amount, 0), pledged: pl.reduce((n, p) => n + p.amount, 0), pledges: pl.length };
}
const campaignsOpen = () => S.list("campaigns").filter((c) => c.active !== false && (!c.end || c.end >= isoDay(new Date()))).sort((a, b) => (a.end || "9").localeCompare(b.end || "9"));
async function campaignRefresh() {
  if (!Backend.on || !Backend.ready || S.can("view.giving") || !campaignsOpen().length) return;
  const { data } = await Backend.client.rpc("campaign_totals", { c: S.state.current });
  let changed = false;
  (data || []).forEach((r) => { const t = { given: +r.given || 0, pledged: +r.pledged || 0, pledges: +r.pledges || 0 }; if (JSON.stringify(campaignTotals[r.campaign]) !== JSON.stringify(t)) { campaignTotals[r.campaign] = t; changed = true; } });
  if (changed && !$("#scrim")) render();
}
function campaignCard(c, { manage = false } = {}) {
  const st = campaignStats(c), fund = S.church().funds.find((f) => f.id === c.fundId), mine = S.list("pledges").find((p) => p.campaignId === c.id && p.userId === S.me().id);
  const share = c.goal ? clamp(st.given / c.goal, 0, 1) : 0, pledgedShare = c.goal ? clamp(st.pledged / c.goal, 0, 1) : 0;
  return html`<div class="panel campaign" data-campaign="${c.id}"><div class="sec-head" style="margin-bottom:4px"><h3 style="margin:0">${c.name}</h3>${manage ? html`<button class="btn ghost sm" data-act="campaign-edit" data-id="${c.id}">${icon("edit")}Edit</button>` : ""}</div>
    ${c.note ? html`<p class="muted" style="margin:0 0 8px">${c.note}</p>` : ""}
    <div class="campaign-bar" role="img" aria-label="${money(Math.round(st.given))} given of ${money(c.goal)}"><i class="pledged" style="width:${pledgedShare * 100}%"></i><i style="width:${share * 100}%"></i></div>
    <p style="margin:8px 0 0"><b>${money(Math.round(st.given))}</b> given of ${money(c.goal)} (${Math.round(share * 100)}%). ${st.pledges ? `${money(Math.round(st.pledged))} pledged by ${plural(st.pledges, "person", "people")}.` : "No pledges yet."}</p>
    <p class="faint" style="margin:2px 0 0">${fund ? `${fund.name}. ` : ""}${c.end ? `Ends ${fmt(fromIsoDay(c.end), { month: "long", day: "numeric", year: "numeric" })}.` : ""}${mine ? ` Your pledge: ${money(mine.amount)}.` : ""}</p>
    ${manage ? "" : html`<div class="btns" style="margin-top:10px"><button class="btn sm" data-act="pledge" data-id="${c.id}">${mine ? "Change my pledge" : "Make a pledge"}</button><a class="btn ghost sm" href="#give">Give now</a></div>`}</div>`;
}
Actions.pledge = (el) => {
  const c = S.get("campaigns", el.dataset.id), mine = c && S.list("pledges").find((p) => p.campaignId === c.id && p.userId === S.me().id);
  if (!c) return;
  if (!S.isMember()) { toast("Join the church to make a pledge"); return; }
  openSheet(`Pledge to ${c.name}`, html`<form data-form="pledge-save" novalidate><input type="hidden" name="id" value="${c.id}">
    <p class="muted" style="margin-top:0">A pledge is a promise of what you plan to give${c.end ? ` by ${fmt(fromIsoDay(c.end), { month: "long", day: "numeric", year: "numeric" })}` : ""}. Nothing is charged. Your gifts to this fund count toward it.</p>
    <label class="field"><span>Total you plan to give</span><input type="number" name="amount" min="1" max="10000000" step="1" inputmode="decimal" value="${mine?.amount || ""}" required></label>
    <div class="btns"><button class="btn">Save my pledge</button>${mine ? html`<button type="button" class="btn ghost" data-act="pledge-remove" data-id="${mine.id}">Remove it</button>` : ""}</div></form>`);
};
Forms["pledge-save"] = (d, f) => {
  const amount = Math.round(+d.amount * 100) / 100, c = S.get("campaigns", d.id);
  if (!c || !(amount > 0)) return formError(f, "Enter the total you plan to give.");
  const mine = S.list("pledges").find((p) => p.campaignId === c.id && p.userId === S.me().id);
  if (mine) Object.assign(mine, { amount, at: new Date().toISOString() }); else S.add("pledges", { campaignId: c.id, userId: S.me().id, name: S.me().name, amount, at: new Date().toISOString() });
  S.save(); emit("pledge.made", { name: S.me().name, campaign: c.name, amount }); logActivity(`Pledged to ${c.name}`, "giving"); closeSheet(); toast("Pledge saved. Thank you."); campaignRefresh(); render();
};
Actions["pledge-remove"] = (el) => { S.remove("pledges", el.dataset.id); S.save(); closeSheet(); toast("Pledge removed"); campaignRefresh(); render(); };
AdminScreens.campaigns = () => {
  const stop = guard("view.giving"); if (stop) return stop;
  const list = S.list("campaigns").sort((a, b) => (b.start || "").localeCompare(a.start || ""));
  const pledges = S.list("pledges").map((p) => [S.get("campaigns", p.campaignId)?.name || "", p.name || nameOf(p.userId), p.amount, p.at.slice(0, 10)]);
  return { title: "Pledge campaigns", back: "admin", body: html`<p class="muted" style="margin-top:14px">Set a goal for a fund, like a building fund. People pledge what they plan to give, and gifts to that fund count toward the goal.</p>
    <div class="btns"><button class="btn" data-act="campaign-edit">${icon("plus")}New campaign</button></div>
    <div style="display:grid;gap:12px;margin-top:14px">${list.map((c) => campaignCard(c, { manage: true }))}</div>
    ${list.length ? html`<h3 class="sec-head" style="margin-top:18px">Pledges</h3><div class="panel">${reportTable("pledges", "pledges", ["Campaign", "Name", "Pledged", "Date"], pledges, { numeric: [2], empty: "No pledges yet." })}</div>` : ""}` };
};
Actions["campaign-edit"] = (el) => {
  const c = S.get("campaigns", el.dataset.id || "") || {}, funds = S.church().funds;
  openSheet(c.id ? "Edit campaign" : "New campaign", html`<form data-form="campaign-save" novalidate><input type="hidden" name="id" value="${c.id || ""}">
    <label class="field"><span>Name</span><input type="text" name="name" maxlength="60" value="${c.name || ""}" required></label>
    <label class="field"><span>Fund the gifts go to</span><select name="fundId">${funds.map((f) => html`<option value="${f.id}" ${attr(f.id === c.fundId, "selected")}>${f.name}</option>`)}</select></label>
    <label class="field"><span>Goal</span><input type="number" name="goal" min="1" step="1" inputmode="decimal" value="${c.goal || ""}" required></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Starts</span><input type="date" name="start" value="${c.start || isoDay(new Date())}" required></label><label class="field"><span>Ends (optional)</span><input type="date" name="end" value="${c.end || ""}"></label></div>
    <label class="field"><span>A line about it (optional)</span><input type="text" name="note" maxlength="140" value="${c.note || ""}"></label>
    <label class="check"><input type="checkbox" name="active" value="1" ${attr(c.active !== false, "checked")}><span>Show it to the church</span></label>
    <div class="btns"><button class="btn">Save</button>${c.id ? html`<button type="button" class="btn danger" data-act="campaign-remove" data-id="${c.id}">Delete</button>` : ""}</div></form>`);
};
Forms["campaign-save"] = (d, f) => {
  if (!canCampaigns()) return;
  const name = String(d.name || "").trim(), goal = Math.round(+d.goal);
  if (!name || !(goal > 0) || !d.start) return formError(f, "Give the campaign a name, a goal and a start date.");
  if (d.end && d.end < d.start) return formError(f, "The end date is before the start.");
  const rec = { name, fundId: d.fundId, goal, start: d.start, end: d.end || "", note: String(d.note || "").trim(), active: !!d.active }, old = S.get("campaigns", d.id || "");
  if (old) Object.assign(old, rec); else S.add("campaigns", { ...rec, at: new Date().toISOString() });
  S.save(); logActivity(`${old ? "Changed" : "Started"} the campaign ${name}`, "giving"); closeSheet(); toast("Campaign saved"); render();
};
Actions["campaign-remove"] = (el) => {
  const c = S.get("campaigns", el.dataset.id); if (!c || !canCampaigns()) return;
  S.list("pledges").filter((p) => p.campaignId === c.id).forEach((p) => S.remove("pledges", p.id)); S.remove("campaigns", c.id); S.save();
  logActivity(`Deleted the campaign ${c.name}`, "giving"); closeSheet(); toast("Campaign deleted"); render();
};

// ===== Email to a group of people =====
const canEmail = () => S.isMember() && S.can("send.email");
/** Who a message can go to. Each gives the people it reaches; the server only emails members of this church. */
function emailAudiences() {
  const members = S.members().map((m) => m).filter((m) => S.user(m.userId)), ids = (l) => [...new Set(l)].filter((u) => S.user(u));
  const cut = isoDay(new Date(Date.now() - 28 * DAY)), seen = (u) => S.list("presence").filter((p) => p.userId === u).map((p) => p.date).sort().pop() || "";
  const out = [["all", "Everyone", ids(members.map((m) => m.userId))]];
  S.church().roles.forEach((r) => { const l = ids(members.filter((m) => m.roleId === r.id).map((m) => m.userId)); if (l.length) out.push([`role:${r.id}`, `Role: ${r.name}`, l]); });
  S.visible("gatherings").forEach((g) => { const l = ids([...(g.leaders || []), ...(g.members || []).filter((m) => m.status === "in").map((m) => m.userId)]); if (l.length) out.push([`group:${g.id}`, `${g.type === "class" ? "Class" : "Group"}: ${g.name}`, l]); });
  teamsOf().forEach((t) => { const l = ids(S.list("teamMembers").filter((m) => m.team === t && !m.status).map((m) => m.userId)); if (l.length) out.push([`team:${t}`, `Team: ${t}`, l]); });
  if (S.can("view.reports")) { const l = ids(members.map((m) => m.userId).filter((u) => { const s = seen(u); return s && s < cut; })); if (l.length) out.push(["away", "Not seen in 4 weeks", l]); }
  return out;
}
/** The group email form, on Admin, Email people and on Connect, Email. */
const emailGroupForm = (aud = emailAudiences()) => html`<form data-form="email-send" class="panel" novalidate>
      <label class="field"><span>To</span><select name="to" data-change="email-to">${aud.map(([k, l, ids]) => html`<option value="${k}">${l} (${ids.length})</option>`)}</select></label>
      <label class="field"><span>Subject</span><input type="text" name="subject" maxlength="120" required></label>
      <label class="field"><span>Message</span><textarea name="body" rows="8" maxlength="10000" required></textarea></label>
      ${emailFromNote()}
      <button class="btn block">Send email</button></form>`;
AdminScreens.email = () => {
  const stop = guard("send.email"); if (stop) return stop;
  const aud = emailAudiences(), sent = S.list("activity").filter((a) => a.area === "email").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return { title: "Email people", back: "admin", body: html`<p class="muted" style="margin-top:14px">Send an email to a group. Each person gets their own copy, replies come to you, and nobody sees anyone else's address. You can also do this from Connect, Email.</p>
    ${Backend.on ? "" : html`<p class="room-msg warn" role="note">${icon("info")}<span>This is ${practicePlace()}, so nothing is really sent. On your church's own site the email goes out through its email service.</span></p>`}
    ${emailGroupForm(aud)}
    ${sent.length ? html`<section class="sec"><div class="sec-head"><h2>Sent</h2></div><div class="rows">${sent.map((a) => html`<div class="row"><span class="body"><span class="t">${a.what}</span><span class="s">${a.name}, ${fmt(a.at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></span></div>`)}</div></section>` : ""}` };
};
Forms["email-send"] = async (d, f) => {
  if (!canEmail()) return;
  const aud = emailAudiences().find(([k]) => k === d.to), subject = String(d.subject || "").trim(), body = String(d.body || "").trim();
  if (!aud) return formError(f, "Choose who it goes to.");
  if (!subject || !body) return formError(f, "Write a subject and a message.");
  const btn = $("button.btn", f); if (btn.disabled) return;
  btn.disabled = true; btn.textContent = "Sending...";
  try {
    let n = aud[2].length;
    if (Backend.on) { const r = await Backend.call("send-email", { churchId: S.state.current, userIds: aud[2], subject, body, audience: aud[1] }); n = r.sent; await Backend.pull().catch(() => {}); }
    else logActivity(`Emailed ${plural(n, "person", "people")} (${aud[1]}): ${subject}`, "email");
    emit("email.sent", { audience: aud[1], subject, count: n, name: S.me().name });
    toast(Backend.on ? `Sent to ${plural(n, "person", "people")}` : `Practice: this would go to ${plural(n, "person", "people")}`); f.reset(); render();
  } catch (e) { btn.disabled = false; btn.textContent = "Send email"; formError(f, e.message || "The email couldn't be sent. Try again."); }
};

// ----- Where these show up: Home asks during a service, and Give leads with open campaigns -----
{
  const home = Screens.home;
  Screens.home = (t) => { const v = home(t); if (v && !v.redirect) { const after = v.after; v.after = () => { after?.(); setTimeout(presencePrompt, 700); }; } return v; };
  const give = Screens.give;
  Screens.give = (t) => { const v = give(t), open = S.church() ? campaignsOpen() : []; campaignRefresh();
    return v && v.body && open.length ? { ...v, body: html`<section class="sec"><div class="sec-head"><h2>${open.length === 1 ? "Campaign" : "Campaigns"}</h2></div><div style="display:grid;gap:12px">${open.map((c) => campaignCard(c))}</div></section>${v.body}` } : v; };
}
