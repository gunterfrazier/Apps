// ---------- Admin: the church account, roles, people, locations, content, Sunday tools and reports ----------
// Each section checks the viewer's permissions. List-and-edit sections share the ADMIN pattern below.

const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${isoDay(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fromLocalInput = (s) => s ? new Date(s).toISOString() : "";
const dateToIso = (s) => (s ? new Date(`${s}T10:00`) : new Date()).toISOString();
const allRooms = () => [...new Set(S.visibleLocations().flatMap((l) => l.rooms || []))];
const myRank = () => S.role()?.rank || 0;

const ADMIN = {
  news: {
    title: "Announcements", one: "announcement", icon: "bell", perm: "manage.content",
    sort: (a, b) => new Date(b.at) - new Date(a.at),
    row: (n) => [n.title, `${ago(n.at)}${n.urgent ? ", marked important" : ""}${n.locationId ? `, ${locName(n.locationId)}` : ""}`],
    fields: [
      { name: "title", label: "Headline", required: true, max: 90 },
      { name: "body", label: "Details", type: "textarea", required: true, max: 1000 },
      { name: "locationId", label: "Who sees it", type: "location" },
      { name: "urgent", label: "Important: show it as an alert at the top of Home", type: "checkbox" },
      { name: "push", label: "Also send it as a notification to everyone who can see it", type: "checkbox", get: () => false },
    ],
    save: (d, r) => ({ title: d.title, body: d.body, urgent: !!d.urgent, locationId: d.locationId || null, at: r?.at || new Date().toISOString() }),
    after: (n, d) => {
      if (!d.push) return;
      const people = S.members().filter((m) => !n.locationId || S.role(m.churchId, m.userId)?.id === "admin" || S.isPrimary(m.churchId, m.userId) || m.locations === "all" || S.location(n.locationId)?.visibility !== "private" || (Array.isArray(m.locations) && m.locations.includes(n.locationId)));
      people.forEach((m) => notify(m.userId, { kind: "news", title: n.title, body: n.body.slice(0, 140), link: "#alerts" }));
      toast(`Sent to ${plural(people.length, "person", "people")}`);
    },
  },
  events: {
    title: "Events", one: "event", icon: "calendar", perm: "manage.content",
    sort: (a, b) => new Date(a.start) - new Date(b.start),
    row: (e) => [e.title, `${fmtShort(e.start)} ${fmtTime(e.start)}, ${placeText(e)}${e.signup ? `, ${registeredCount(e)} signed up` : ""}${new Date(e.end) < new Date() ? ", past" : ""}`],
    fields: [
      { name: "title", label: "Title", required: true, max: 80 },
      { name: "category", label: "Category", max: 30, get: (r) => r.category || "Community", hint: "Used for the filter chips, like Kids, Serve or Worship." },
      { name: "start", label: "Starts", type: "datetime", required: true },
      { name: "end", label: "Ends", type: "datetime", required: true },
      { name: "locationId", label: "Location", type: "location", allLabel: "Off-site or church-wide" },
      { name: "location", label: "Room or place", type: "room", required: true, max: 120 },
      { name: "description", label: "Description", type: "textarea", max: 1000 },
      { name: "signup", label: "People sign up for this event", type: "checkbox" },
      { name: "kids", label: "Parents can register their kids", type: "checkbox" },
      { name: "capacity", label: "Spots available", type: "number", hint: "Leave at 0 for no limit.", get: (r) => r.capacity || 0 },
      { name: "tickets", label: "Tickets", type: "textarea", max: 600, get: (r) => (r.tickets || []).map((t) => [t.name, t.price, t.limit || ""].filter((x) => x !== "").join(", ")).join("\n"),
        hint: "For paid events, one ticket type per line: name, price, and how many there are (optional). Example: Adult, 15. Leave blank for a free sign-up." },
      { name: "formId", label: "Form to fill in after signing up", type: "select", options: () => [["", "None"], ...S.list("forms").map((f) => [f.id, f.title])], hint: "Use this for permission slips. Build forms under Admin, Forms." },
    ],
    check: (d, rec) => {
      if (new Date(d.end) <= new Date(d.start)) return "The event has to end after it starts.";
      const t = parseTickets(d.tickets, rec); if (t.error) return t.error;
      if (t.list.length && !d.signup) return "Turn on sign-ups to sell tickets.";
      if (d.locationId && d.location) {
        const hits = roomUses(d.locationId, d.location, new Date(d.start).getTime(), new Date(d.end).getTime()).filter((u) => !(u.kind === "event" && u.id === rec?.id));
        if (hits.length) return `${d.location} is in use then for ${hits[0].title} (${fmtTime(hits[0].start)} to ${fmtTime(hits[0].end)}). Choose another room or time.`;
      }
      return null;
    },
    save: (d, r) => ({ title: d.title, category: d.category || "Community", start: fromLocalInput(d.start), end: fromLocalInput(d.end), locationId: d.locationId || null, location: d.location, description: d.description, signup: !!d.signup, kids: !!d.kids, capacity: Math.max(0, +d.capacity || 0), registrations: r?.registrations || [], tickets: parseTickets(d.tickets, r).list, formId: d.formId || null }),
    after: (e) => { S.list("forms").forEach((f) => { if (f.id === e.formId) f.eventId = e.id; else if (f.eventId === e.id) f.eventId = null; }); },
    extra: (e) => e.signup && e.registrations.length ? html`<div class="panel" style="margin-bottom:8px"><div style="display:flex;gap:8px;align-items:center;justify-content:space-between"><b>${registeredCount(e)} signed up${e.tickets?.length ? `, ${money(e.registrations.reduce((n, r) => n + (r.paid && r.paid.status !== "refunded" ? r.total || 0 : 0), 0))} paid` : ""}</b><button type="button" class="btn ghost sm" data-act="event-csv" data-id="${e.id}">${icon("download")}CSV</button></div>
      ${e.registrations.map((r) => html`<p class="faint" style="margin:4px 0">${r.name}${r.count > 1 ? `, party of ${r.count}` : ""}${r.tickets ? `, ${ticketSummary(e, r)}` : ""}${r.kids?.length ? `, ${plural(r.kids.length, "child", "children")}` : ""}${r.total ? `, ${paidLabel(r.paid)}` : ""}${e.formId ? `, ${formsDoneText(e, r)}` : ""}${r.email ? `, ${r.email}` : ""}</p>`)}</div>` : "",
  },
  sermons: {
    title: "Sermons", one: "sermon", icon: "play", perm: "manage.sermons",
    sort: (a, b) => new Date(b.date) - new Date(a.date),
    row: (s) => [s.title, `${s.passage}, ${fmtShort(s.date)}${s.mediaUrl ? "" : ", no recording yet"}`],
    fields: [
      { name: "title", label: "Title", required: true, max: 90 },
      { name: "series", label: "Series", max: 60 },
      { name: "speaker", label: "Speaker", required: true, max: 60 },
      { name: "date", label: "Date preached", type: "date", get: (r) => r.date ? isoDay(r.date) : isoDay(new Date()) },
      { name: "time", label: "Service time", type: "time", get: (r) => r.time || "" },
      { name: "locationId", label: "Location", type: "location" },
      { name: "passage", label: "Main passage", required: true, max: 40, hint: "Like John 15:1-8. It links to Veritas Logos." },
      { name: "topic", label: "Topic for a study guide", max: 30, hint: "One or two words, like grace or forgiveness." },
      { name: "summary", label: "Summary", type: "textarea", max: 500 },
      { name: "outline", label: "Outline", type: "lines", hint: "One point per line." },
      { name: "docId", label: "Sermon builder outline", type: "select", options: () => [["", "None"], ...S.list("docs").filter((d) => d.kind === "sermon").map((d) => [d.id, `${d.title} (${fmtShort(fromIsoDay(d.date))})`])], hint: "Members can follow the on-screen parts of a built sermon." },
      { name: "videoUrl", label: "Video link", type: "url", get: (r) => sermonVideo(r), hint: "YouTube, Vimeo or Facebook. Add a transcript under Media and transcript on the sermon's page." },
      { name: "audioUrl", label: "Audio file for the podcast", type: "url", get: (r) => sermonAudio(r), hint: "An MP3 or M4A link." },
      { name: "minutes", label: "Length in minutes", type: "number", get: (r) => r.minutes || 35 },
    ],
    check: (d) => !parseRef(d.passage) ? "That passage doesn't look like a Bible reference. Try a form like John 15:1-8." : null,
    save: (d, r) => ({ title: d.title, series: d.series || "Messages", speaker: d.speaker, date: dateToIso(d.date), time: d.time, locationId: d.locationId || null, passage: d.passage, topic: d.topic, summary: d.summary, outline: d.outline, docId: d.docId || null, videoUrl: d.videoUrl, audioUrl: d.audioUrl, mediaUrl: d.videoUrl || d.audioUrl, minutes: +d.minutes || 35, transcript: r?.transcript || [], audioBytes: r?.audioBytes || 0 }),
    tools: () => html`<a class="btn ghost" href="#podcast">${icon("music")}Podcast feed</a>`,
  },
  plans: {
    title: "Reading plans", one: "reading plan", icon: "book", perm: "manage.sermons",
    sort: (a, b) => a.name.localeCompare(b.name),
    row: (p) => [p.name, `${p.days.length} days`],
    fields: [
      { name: "name", label: "Plan name", required: true, max: 60 },
      { name: "description", label: "Description", type: "textarea", max: 300 },
      { name: "days", label: "Readings", type: "lines", required: true, get: (r) => (r.days || []).map((d) => d.join("; ")), hint: "One day per line. Put two readings on one day with a semicolon: Psalm 1; Proverbs 1" },
    ],
    check: (d) => { const bad = d.days.flatMap((l) => l.split(";").map((x) => x.trim())).filter((x) => x && !parseRef(x)); return bad.length ? `These don't look like Bible references: ${bad.slice(0, 3).join(", ")}` : null; },
    save: (d) => ({ name: d.name, description: d.description, days: d.days.map((l) => l.split(";").map((x) => x.trim()).filter(Boolean)).filter((x) => x.length) }),
  },
  gatherings: {
    title: "Classes and groups", one: "class or group", many: "classes and groups", icon: "door", perm: "manage.classes",
    sort: (a, b) => a.type.localeCompare(b.type) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    row: (g) => [g.name, `${g.type === "class" ? "Class" : "Group"}, ${scheduleText(g)}, ${placeText(g) || "no room yet"}`],
    fields: [
      { name: "type", label: "This is a", type: "radios", options: [["class", "Class or Sunday school"], ["group", "Small group"]], get: (r) => r.type || "class" },
      { name: "name", label: "Name", required: true, max: 60, hint: "Name each class or section, like Preschool, 9:00." },
      { name: "category", label: "Category", type: "suggest", options: ["Sunday school", "Classes", "Small group", "Bible study", "Kids", "Youth", "Care"], get: (r) => r.category || "Sunday school" },
      { name: "description", label: "Description", type: "textarea", max: 600 },
      { name: "topic", label: "Topic", max: 60 },
      { name: "locationId", label: "Location", type: "location", allLabel: "Off-site" },
      { name: "room", label: "Room number or place", type: "room", max: 80 },
      { name: "kind", label: "Meets", type: "radios", options: [["weekly", "Every week"], ["once", "Once"]], get: (r) => r.schedule?.kind || "weekly" },
      { name: "days", label: "On (for weekly)", type: "days", get: (r) => r.schedule?.days || [0] },
      { name: "date", label: "Date (for one-time)", type: "date", get: (r) => r.schedule?.date || "" },
      { name: "time", label: "Starts at", type: "time", get: (r) => r.schedule?.time || "09:00" },
      { name: "endTime", label: "Ends at", type: "time", get: (r) => r.schedule?.endTime || "" },
      { name: "startDate", label: "First week (optional)", type: "date", get: (r) => r.schedule?.startDate || "" },
      { name: "endDate", label: "Last week (optional)", type: "date", get: (r) => r.schedule?.endDate || "" },
      { name: "registration", label: "Registration", type: "radios", options: [["none", "Not needed"], ["open", "Required"], ["approval", "Leader approves"]], get: (r) => r.registration || "open" },
      { name: "capacity", label: "Size limit", type: "number", hint: "Leave at 0 for no limit.", get: (r) => r.capacity || 0 },
      { name: "ageMin", label: "Youngest age (kids classes)", type: "number", get: (r) => r.ageMin ?? "" },
      { name: "ageMax", label: "Oldest age", type: "number", get: (r) => r.ageMax ?? "" },
      { name: "leaders", label: "Teachers or leaders", type: "people" },
      { name: "studyPassage", label: "Passage you're studying", max: 40, get: (r) => r.study?.passage || "", hint: "Members get Veritas Logos links to prepare." },
      { name: "studyTopic", label: "Study topic", max: 30, get: (r) => r.study?.topic || "" },
    ],
    check: (d) => d.kind === "once" && !d.date ? "Pick the date for a one-time class or group."
      : d.kind === "weekly" && !d.days.length ? "Pick at least one day it meets."
      : d.studyPassage && !parseRef(d.studyPassage) ? "The study passage doesn't look like a Bible reference." : null,
    save: (d, r) => ({ type: d.type || "class", name: d.name, category: d.category || "Classes", description: d.description, topic: d.topic, locationId: d.locationId || null, room: d.room,
      schedule: d.kind === "once" ? { kind: "once", date: d.date, time: d.time || "09:00", endTime: d.endTime } : { kind: "weekly", days: d.days.map(Number), time: d.time || "09:00", endTime: d.endTime, startDate: d.startDate, endDate: d.endDate },
      registration: d.registration || "open", capacity: Math.max(0, +d.capacity || 0), ageMin: d.ageMin === "" ? null : +d.ageMin, ageMax: d.ageMax === "" ? null : +d.ageMax, leaders: d.leaders,
      study: d.studyPassage ? { passage: d.studyPassage, topic: d.studyTopic } : null, members: r?.members || [], sampleCount: r?.sampleCount || 0 }),
  },
};

function adminField(f, rec) {
  const v = f.get ? f.get(rec) : rec[f.name];
  const hint = f.hint ? html`<small>${f.hint}</small>` : "";
  const req = attr(f.required, "required");
  switch (f.type) {
    case "textarea": return html`<label class="field"><span>${f.label}</span><textarea name="${f.name}" maxlength="${f.max || 2000}" ${req}>${v || ""}</textarea>${hint}</label>`;
    case "lines": return html`<label class="field"><span>${f.label}</span><textarea name="${f.name}" ${req}>${(v || []).join("\n")}</textarea>${hint}</label>`;
    case "checkbox": return html`<label class="check"><input type="checkbox" name="${f.name}" ${attr(v, "checked")}><span>${f.label}</span></label>`;
    case "datetime": return html`<label class="field"><span>${f.label}</span><input type="datetime-local" name="${f.name}" value="${toLocalInput(v)}" ${req}>${hint}</label>`;
    case "location": return html`<label class="field"><span>${f.label}</span><select name="${f.name}">${locationOptions(v, f.allLabel)}</select>${hint}</label>`;
    case "room": return html`<label class="field"><span>${f.label}</span><input type="text" name="${f.name}" value="${v || ""}" list="room-list" maxlength="${f.max || 80}" ${req}><datalist id="room-list">${allRooms().map((r) => html`<option value="${r}">`)}</datalist>${hint}</label>`;
    case "suggest": return html`<label class="field"><span>${f.label}</span><input type="text" name="${f.name}" value="${v || ""}" list="dl-${f.name}" maxlength="40"><datalist id="dl-${f.name}">${f.options.map((o) => html`<option value="${o}">`)}</datalist>${hint}</label>`;
    case "select": return html`<label class="field"><span>${f.label}</span><select name="${f.name}">${(typeof f.options === "function" ? f.options() : f.options).map(([k, l]) => html`<option value="${k}" ${attr(k === (v || ""), "selected")}>${l}</option>`)}</select>${hint}</label>`;
    case "radios": return html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">${f.label}</legend><div class="radios">${f.options.map(([k, l]) => html`<label><input type="radio" name="${f.name}" value="${k}" ${attr(k === v, "checked")}><span>${l}</span></label>`)}</div></fieldset>`;
    case "days": return html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">${f.label}</legend><div class="radios">${DAYS.map((d, i) => html`<label><input type="checkbox" name="${f.name}" value="${i}" ${attr((v || []).includes(i), "checked")}><span>${d.slice(0, 3)}</span></label>`)}</div></fieldset>`;
    case "people": {
      const chosen = rec.leaders || [];
      const people = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
      return html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">${f.label}</legend><div class="pick-list">${people.map((p) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="${f.name}" value="${p.id}" ${attr(chosen.includes(p.id), "checked")}><span>${p.name} <span class="faint">${S.role(S.state.current, p.id)?.name}</span></span></label>`)}</div><small>Assigned teachers can use the lesson builder for this class if their role allows it.</small></fieldset>`;
    }
    default: return html`<label class="field"><span>${f.label}</span><input type="${f.type || "text"}" name="${f.name}" value="${v ?? ""}" ${f.max ? raw(`maxlength="${f.max}"`) : ""} ${attr(f.type === "number", 'min="0"')} ${req}>${hint}</label>`;
  }
}

function guard(perm) {
  if (!S.isMember() || !S.can(perm)) return { title: "Admin", back: "me", body: html`<div class="panel" style="margin-top:16px"><p style="margin-top:0">Your role at ${S.church().name} doesn't include this. The primary account holder or an administrator can change that.</p><a class="btn ghost" href="#me">Back to Me</a></div>` };
  return null;
}

Screens.admin = (section) => {
  if (section && ADMIN[section]) return guard(ADMIN[section].perm) || adminList(section);
  if (section && AdminScreens[section]) return AdminScreens[section]();
  if (!hasAdminTools() && !S.can("checkin.station")) return guard("manage.church");
  const c = S.church();
  const count = (k) => S.visible(k, { ignoreCampus: true }).length;
  const openCards = S.list("cards").filter((x) => !x.handled).length;
  const row = (perm, hash, ic, t, s, tag) => S.can(perm) ? html`<a class="row" href="#${hash}"><span class="lead-ic">${icon(ic)}</span><span class="body"><span class="t">${t}</span><span class="s">${s}</span></span>${tag || icon("chev")}</a>` : "";
  const steps = [
    ["Add your locations and service times", c.locations.some((l) => l.services?.length && l.address), "admin-locations"],
    ["Set up roles and features", c.roles.length > 8 || Object.values(c.modules).some((v) => !v), "admin-roles"],
    ["Design your Home banner", !!c.banner, "admin-banner"],
    ["Build your landing page", c.landing.blocks.length > 0, "admin-page"],
    ["Post a first announcement", count("news") > 0, "admin-news"],
    ["Add your classes and groups", count("gatherings") > 0, "admin-gatherings"],
  ];
  const sec = (title, rows) => { const r = rows.filter((x) => x !== ""); return r.length ? html`<section class="sec"><h2 class="sec-head">${title}</h2><div class="rows">${r}</div></section>` : ""; };
  return {
    title: "Admin", back: "me",
    body: html`
      <div class="panel" style="margin-top:16px;display:flex;gap:14px;align-items:center">${churchMark(c, 48)}<div style="min-width:0"><b>${c.name}</b><br><span class="faint">Church ID: ${c.handle}. Primary: ${S.userName(c.ownerId)}${S.isPrimary() ? " (you)" : ""}. You: ${S.role().name}.</span></div></div>
      ${S.isPrimary() && steps.some((s) => !s[1]) ? html`<section class="sec"><h2 class="sec-head">Getting started</h2><div class="rows">${steps.map(([t, done, hash]) => html`<a class="row" href="#${hash}"><span class="lead-ic" style="${done ? "background:var(--ok-soft);color:var(--ok)" : ""}">${icon(done ? "check" : "plus")}</span><span class="body"><span class="t" style="${done ? "text-decoration:line-through;color:var(--ink-3)" : ""}">${t}</span></span>${icon("chev")}</a>`)}</div></section>` : ""}
      ${sec("Church account", [
        row("manage.church", "admin-account", "church", "Account details", "Name, church ID, contact, logo, website and social links"),
        row("manage.church", "admin-features", "gear", "Features and defaults", "Turn features on or off; choose what new members get"),
        row("manage.roles", "admin-roles", "key", "Roles and permissions", `${plural(c.roles.length, "role")}; choose what each can do`),
        S.canAny(["manage.people", "manage.roles"]) ? html`<a class="row" href="#admin-people"><span class="lead-ic">${icon("people")}</span><span class="body"><span class="t">People</span><span class="s">${plural(S.members().length, "member")}; roles and location access</span></span>${icon("chev")}</a>` : "",
        row("manage.locations", "admin-locations", "pin", "Campuses and locations", `${plural(c.locations.length, "location")}, rooms, service times and livestreams`),
        row("manage.page", "admin-banner", "star", "Home banner", "Background, logo, graphics and text art at the top of Home"),
        row("manage.page", "admin-page", "image", "Landing page", `${plural(c.landing.blocks.length, "block")}${c.landing.showOnHome ? ", shown on Home" : ""}`),
        row("manage.church", "admin-training", "book", "Training church", isTrainingChurch(c) ? "Invite your team, or start fresh" : trainingChurchOf(c) ? `${trainingChurchOf(c).name}: your team's shared practice church` : "A practice copy your whole team shares"),
        row("manage.integrations", "admin-integrations", "bolt", "Webhooks and embeds", `${plural(c.integrations.webhooks.length, "webhook")}, ${plural(c.integrations.embeds.length, "embedded page")}`),
      ])}
      ${sec("Sunday", [
        row("checkin.station", "admin-checkin", "kid", "Check-in roster", "Kids in each room, allergy alerts, pickup and volunteers on duty"),
        row("checkin.station", "kiosk", "screen", "Check-in kiosk", "A self check-in station that prints name tags"),
        row("manage.devices", "devices", "lock", "Screens and devices", (() => { const d = S.list("devices"), w = d.filter((x) => x.status !== "paired").length; return d.length ? `${plural(d.length - w, "device")} signed in${w ? `, ${w} waiting to pair` : ""}` : "Sign in kiosks, presentation screens, stage displays and booth computers"; })()),
        row("manage.devices", "signs", "image", "Digital signage", plural(S.list("signage").length, "playlist")),
        row("schedule.teams", "teams", "hand", "Volunteer scheduling", "Teams, positions and who serves when"),
        row("manage.locations", "rooms", "door", "Rooms", (() => { const n = S.list("bookings").filter((b) => b.status === "requested").length; return n ? `${plural(n, "request")} waiting for approval` : "Book rooms and see what's in use"; })(),
          (() => { const n = S.list("bookings").filter((b) => b.status === "requested").length; return n ? html`<span class="tag warn">${n}</span>` : null; })()),
        row("manage.prayer", "admin-cards", "inbox", "Connect cards", openCards ? `${openCards} waiting for follow-up` : "None waiting", openCards ? html`<span class="tag warn">${openCards}</span>` : null),
        row("manage.prayer", "admin-prayer", "pray", "Prayer requests", `${S.list("prayers").filter((p) => p.private).length} private, ${S.list("prayers").filter((p) => p.hidden).length} hidden`),
      ])}
      ${sec("Content", [...Object.entries(ADMIN).map(([k, a]) => row(a.perm, `admin-${k}`, a.icon, a.title, plural(count(k), a.one, a.many || a.one + "s"))),
        row("manage.content", "forms", "note", "Forms", `${plural(S.list("forms").length, "form")}: sign-ups, permission slips and applications`)])}
      ${sec("People", [
        row("manage.followup", "followup", "people", "Follow-up", (() => { const n = S.list("followups").filter((f) => f.status === "new").length; return n ? `${plural(n, "new person", "new people")} not reached yet` : "Everyone's been reached"; })(),
          (() => { const n = S.list("followups").filter((f) => f.status === "new").length; return n ? html`<span class="tag warn">${n}</span>` : null; })()),
      ])}
      ${sec("Reports", [
        S.can("view.reports") || S.can("view.giving") ? html`<a class="row" href="#reports"><span class="lead-ic">${icon("calendar")}</span><span class="body"><span class="t">Reports</span><span class="s">${S.can("view.reports") ? "Attendance, new people" : ""}${S.can("view.reports") && S.can("view.giving") ? " and giving" : S.can("view.giving") ? "Giving" : ""}, with charts and CSV downloads</span></span>${icon("chev")}</a>` : "",
        row("view.giving", "admin-giving", "give", "Gifts and funds", "Recent gifts, statements and funds")])}`,
  };
};

function adminList(kind) {
  const a = ADMIN[kind];
  const list = S.visible(kind, { ignoreCampus: true }).sort(a.sort);
  return {
    title: a.title, back: "admin",
    body: html`<div class="btns" style="margin-top:16px"><button class="btn" data-act="admin-edit" data-kind="${kind}">${icon("plus")}Add ${a.one}</button>${a.tools ? a.tools() : ""}</div>
      <div class="rows" style="margin-top:14px">${list.length ? list.map((r) => { const [t, s] = a.row(r); return html`<button class="row" data-act="admin-edit" data-kind="${kind}" data-id="${r.id}"><span class="body"><span class="t">${t}</span><span class="s">${s}</span></span>${icon("edit")}</button>`; })
        : empty(`No ${a.many || a.one + "s"} yet.`)}</div>`,
  };
}
Actions["admin-edit"] = (el) => {
  const kind = el.dataset.kind, a = ADMIN[kind];
  const rec = el.dataset.id ? S.get(kind, el.dataset.id) : {};
  openSheet(rec.id ? `Edit ${a.one}` : `New ${a.one}`, html`${rec.id && a.extra ? a.extra(rec) : ""}
    <form data-form="admin-save" novalidate><input type="hidden" name="_kind" value="${kind}"><input type="hidden" name="_id" value="${rec.id || ""}">
    ${a.fields.map((f) => adminField(f, rec))}
    <div class="btns"><button class="btn">${rec.id ? "Save changes" : `Add ${a.one}`}</button>${rec.id ? html`<button type="button" class="btn danger" data-act="admin-delete" data-kind="${kind}" data-id="${rec.id}">Delete</button>` : ""}</div></form>`);
};
Forms["admin-save"] = (d, f, fd) => {
  const kind = d._kind, a = ADMIN[kind], rec = d._id ? S.get(kind, d._id) : null;
  if (!S.can(a.perm)) return formError(f, "Your role can't change this.");
  a.fields.forEach((x) => {
    if (x.type === "lines") d[x.name] = String(d[x.name] || "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (x.type === "days" || x.type === "people") d[x.name] = fd.getAll(x.name);
  });
  const missing = a.fields.find((x) => x.required && (Array.isArray(d[x.name]) ? !d[x.name].length : !d[x.name]));
  if (missing) return formError(f, `Fill in "${missing.label}".`);
  const problem = a.check?.(d, rec);
  if (problem) return formError(f, problem);
  const data = a.save(d, rec);
  const saved = rec ? S.update(kind, rec.id, data) : S.add(kind, data);
  a.after?.(saved, d, rec);
  closeSheet(); toast(rec ? "Saved" : "Added"); render();
};
Actions["admin-delete"] = (el) => {
  const a = ADMIN[el.dataset.kind];
  openSheet(`Delete this ${a.one}?`, html`<p>This can't be undone.</p><div class="btns"><button class="btn danger" data-act="admin-delete-yes" data-kind="${el.dataset.kind}" data-id="${el.dataset.id}">Delete</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
};
Actions["admin-delete-yes"] = (el) => { S.remove(el.dataset.kind, el.dataset.id); closeSheet(); toast("Deleted"); render(); };

// ---------- Sections with their own layouts (AdminScreens is declared in 30-ui.js) ----------

AdminScreens.account = () => {
  const blocked = guard("manage.church"); if (blocked) return blocked;
  const c = S.church();
  return {
    title: "Account details", back: "admin",
    body: html`<form data-form="admin-account" novalidate style="margin-top:8px">
      <p class="muted">The church account is separate from any one person's account. ${S.userName(c.ownerId)} is its primary account holder.</p>
      <label class="field"><span>Church name</span><input type="text" name="name" value="${c.name}" required maxlength="60"></label>
      <label class="field"><span>Church ID</span><input type="text" name="handle" value="${c.handle}" maxlength="30"><small>Unique across ${PLATFORM.name}. People can search for it.</small></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label class="field"><span>Church email</span><input type="email" name="email" value="${c.email}"></label>
        <label class="field"><span>Church phone</span><input type="tel" name="phone" value="${c.phone}"></label></div>
      <label class="field"><span>City and state</span><input type="text" name="city" value="${c.city || ""}" maxlength="60"></label>
      <label class="field"><span>One line about your church</span><input type="text" name="tagline" value="${c.tagline}" maxlength="90"></label>
      ${imageField("logo", "Logo", c.logo, "Any shape works: the whole logo always shows. Shown on Home, the banner and in the church list.", 512)}
      <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Brand color</legend>
        <div class="swatches">${[...new Set([c.color, ...BRAND_COLORS])].map((col) => html`<label><input type="radio" name="color" value="${col}" ${attr(col === c.color, "checked")}><span style="background:${col}"></span><span class="sr">${col}</span></label>`)}</div></fieldset>
      <p class="faint">The Home banner's background, graphics and text art are under <a href="#admin-banner">Home banner</a>.</p>
      <h2 style="margin-top:22px">Website and social media</h2>
      ${SOCIAL.map(([k, label]) => html`<label class="field"><span>${label}</span><input type="url" name="s_${k}" value="${k === "website" ? c.website : c.social?.[k] || ""}" placeholder="https://"></label>`)}
      <h2 style="margin-top:22px">Licensing</h2>
      <label class="field"><span>CCLI license number</span><input type="text" name="ccli" value="${c.ccli || ""}" maxlength="20"><small>Shown on song slides, as CCLI requires when lyrics are projected.</small></label>
      <p class="field"><span>Volunteer teams</span><a class="btn ghost sm" href="#teams">${icon("hand")}${plural(c.teams.length, "team")}: edit teams and positions</a></p>
      <div class="btns"><button class="btn block">Save account details</button></div></form>`,
  };
};
Forms["admin-account"] = (d, f) => {
  if (!d.name) return formError(f, "Your church needs a name.");
  const c = S.church(), handle = slugify(d.handle || d.name);
  if (S.churches().some((x) => x.id !== c.id && x.handle === handle)) return formError(f, `The church ID "${handle}" is taken.`);
  const bad = SOCIAL.find(([k]) => d[`s_${k}`] && !isUrl(d[`s_${k}`]));
  if (bad) return formError(f, `The ${bad[1]} link should start with https://`);
  S.updateChurch({ name: d.name, handle, email: d.email, phone: d.phone, city: d.city, tagline: d.tagline, logo: d.logo, color: d.color || c.color,
    website: d.s_website, social: Object.fromEntries(SOCIAL.filter(([k]) => k !== "website").map(([k]) => [k, d[`s_${k}`]])), ccli: d.ccli });
  toast("Account details saved"); render();
};

AdminScreens.features = () => {
  const blocked = guard("manage.church"); if (blocked) return blocked;
  const c = S.church(), dft = c.defaults;
  return {
    title: "Features and defaults", back: "admin",
    body: html`<form data-form="admin-features" novalidate>
      <h2 style="margin-top:18px">Features</h2><p class="faint">Turned-off features disappear for everyone at ${c.name}.</p>
      <div class="panel">${MODULES.map(([k, label]) => html`<label class="check"><input type="checkbox" name="m_${k}" ${attr(c.modules[k] !== false, "checked")}><span>${label}</span></label>`)}</div>
      <h2 style="margin-top:22px">Defaults for new members</h2>
      <label class="field"><span>Role when someone joins</span><select name="roleId">${[...c.roles].sort((a, b) => a.rank - b.rank).map((r) => html`<option value="${r.id}" ${attr(r.id === dft.roleId, "selected")}>${r.name}</option>`)}</select><small>Start with the lowest level of access. You can give people more later.</small></label>
      ${c.locations.some((l) => l.visibility === "private") ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Private locations new members can see</legend>
        ${c.locations.filter((l) => l.visibility === "private").map((l) => html`<label class="check"><input type="checkbox" name="defLoc" value="${l.id}" ${attr(Array.isArray(dft.locations) && dft.locations.includes(l.id), "checked")}><span>${l.name} (${l.code})</span></label>`)}
        <small>Public locations are always visible.</small></fieldset>` : ""}
      <label class="check"><input type="checkbox" name="listInDirectory" ${attr(dft.listInDirectory, "checked")}><span>List new members in the directory (they can opt out)</span></label>
      <label class="check"><input type="checkbox" name="prayerPrivate" ${attr(dft.prayerPrivate, "checked")}><span>New prayer requests go to pastors only unless the person changes it</span></label>
      <label class="check"><input type="checkbox" name="parentCheckout" ${attr(dft.parentCheckout, "checked")}><span>Parents can check their kids out from the parent portal</span></label>
      <label class="field"><span>Fund selected first on the Give tab</span><select name="fundId">${c.funds.map((f) => html`<option value="${f.id}" ${attr(f.id === dft.fundId, "selected")}>${f.name}</option>`)}</select></label>
      <div class="btns"><button class="btn block">Save features and defaults</button></div></form>`,
  };
};
Forms["admin-features"] = (d, f, fd) => {
  const c = S.church();
  S.updateChurch({ modules: Object.fromEntries(MODULES.map(([k]) => [k, !!d[`m_${k}`]])),
    defaults: { ...c.defaults, roleId: d.roleId, locations: fd.getAll("defLoc"), listInDirectory: !!d.listInDirectory, prayerPrivate: !!d.prayerPrivate, parentCheckout: !!d.parentCheckout, fundId: d.fundId } });
  toast("Saved"); render();
};

// ----- Roles -----
const canEditRole = (r) => S.isPrimary() || (S.can("manage.roles") && r.rank < myRank());
AdminScreens.roles = () => {
  const blocked = guard("manage.roles"); if (blocked) return blocked;
  const c = S.church();
  const counts = (id) => S.members().filter((m) => m.roleId === id && !S.isPrimary(c.id, m.userId)).length;
  return {
    title: "Roles and permissions", back: "admin",
    body: html`<p class="muted" style="margin-top:16px">Roles run from most to least access. The primary account holder has everything. Administrators start with full access; only the primary can limit them. Everyone else can only manage roles below their own.</p>
      <div class="rows">
        <div class="row"><span class="lead-ic">${icon("star")}</span><span class="body"><span class="t">Primary account holder</span><span class="s">${S.userName(c.ownerId)}. All permissions, always.</span></span></div>
        ${[...c.roles].sort((a, b) => b.rank - a.rank).map((r) => html`<a class="row" href="#role-${r.id}"><span class="lead-ic">${icon(r.id === "admin" ? "shield" : "key")}</span><span class="body"><span class="t">${r.name}${r.id === c.defaults.roleId ? html` <span class="tag">Default</span>` : ""}</span><span class="s">${plural(Object.values(r.perms).filter(Boolean).length, "permission")}, ${plural(counts(r.id), "person", "people")}</span></span>${canEditRole(r) ? icon("edit") : icon("lock")}</a>`)}
      </div>
      <div class="btns"><button class="btn" data-act="role-new">${icon("plus")}Add a role</button><a class="btn ghost" href="#admin-people">Assign roles to people</a></div>`,
  };
};
Screens.role = (id) => {
  const blocked = guard("manage.roles"); if (blocked) return blocked;
  const c = S.church(), r = c.roles.find((x) => x.id === id);
  if (!r) return { redirect: "admin-roles" };
  const editable = canEditRole(r);
  const groups = [...new Set(PERMS.map((p) => p[0]))];
  return {
    title: r.name, back: "admin-roles",
    body: html`<form data-form="role-save" novalidate><input type="hidden" name="id" value="${r.id}">
      ${!editable ? html`<div class="demo-note">${icon("lock")}<div>${r.id === "admin" ? "Only the primary account holder can limit administrators." : "You can only change roles below your own."}</div></div>` : ""}
      <label class="field"><span>Role name</span><input type="text" name="name" value="${r.name}" maxlength="40" ${attr(!editable, "disabled")}></label>
      <label class="field"><span>Level</span><input type="number" name="rank" value="${r.rank}" min="1" max="${S.isPrimary() ? 99 : myRank() - 1}" ${attr(!editable || r.builtin, "disabled")}><small>Higher levels can manage lower ones. Administrator is 90; Member is 10.</small></label>
      ${groups.map((gname) => html`<h3 style="margin-top:18px">${gname}</h3><div class="panel">${PERMS.filter((p) => p[0] === gname).map(([, k, label]) => html`<label class="check"><input type="checkbox" name="p" value="${k}" ${attr(r.perms[k], "checked")} ${attr(!editable || (!S.isPrimary() && !S.can(k)), "disabled")}><span>${label}</span></label>`)}</div>`)}
      ${editable ? html`<div class="btns"><button class="btn">Save role</button>${!r.builtin ? html`<button type="button" class="btn danger" data-act="role-delete" data-id="${r.id}">Delete role</button>` : ""}</div>` : ""}
    </form>`,
  };
};
Forms["role-save"] = (d, f, fd) => {
  const c = S.church(), r = c.roles.find((x) => x.id === d.id);
  if (!canEditRole(r)) return formError(f, "You can't change this role.");
  if (!d.name) return formError(f, "Give the role a name.");
  const chosen = new Set(fd.getAll("p"));
  // People can't hand out permissions they don't have themselves.
  const perms = Object.fromEntries(PERMS.map(([, k]) => [k, S.isPrimary() || S.can(k) ? chosen.has(k) : !!r.perms[k]]));
  Object.assign(r, { name: d.name, perms, rank: r.builtin || !d.rank ? r.rank : clamp(+d.rank, 1, S.isPrimary() ? 99 : myRank() - 1) });
  S.save(); toast("Role saved"); go("admin-roles");
};
Actions["role-new"] = () => {
  const c = S.church();
  openSheet("Add a role", html`<form data-form="role-new" novalidate>
    <label class="field"><span>Role name</span><input type="text" name="name" maxlength="40" placeholder="Campus pastor" required></label>
    <label class="field"><span>Start from</span><select name="from">${[...c.roles].filter(canEditRole).sort((a, b) => b.rank - a.rank).map((r) => html`<option value="${r.id}">${r.name}</option>`)}</select></label>
    <button class="btn block">Add role</button></form>`);
};
Forms["role-new"] = (d, f) => {
  if (!d.name) return formError(f, "Give the role a name.");
  const c = S.church(), from = c.roles.find((r) => r.id === d.from) || c.roles[c.roles.length - 1];
  const r = { id: slugify(d.name) + "-" + uid().slice(-3), name: d.name, rank: Math.min(from.rank, S.isPrimary() ? 89 : myRank() - 1), perms: { ...from.perms } };
  c.roles.push(r); S.save(); closeSheet(); go(`role-${r.id}`);
};
Actions["role-delete"] = (el) => {
  const c = S.church();
  c.roles = c.roles.filter((r) => r.id !== el.dataset.id);
  S.members().forEach((m) => { if (m.roleId === el.dataset.id) m.roleId = c.defaults.roleId; });
  if (c.defaults.roleId === el.dataset.id) c.defaults.roleId = "member";
  S.save(); toast("Role deleted. Its people now have the default role."); go("admin-roles");
};

// ----- People: roles and location access -----
AdminScreens.people = () => {
  if (!S.canAny(["manage.people", "manage.roles"])) return guard("manage.people");
  const c = S.church();
  const list = S.members().map((m) => ({ m, u: S.user(m.userId) })).filter((x) => x.u).sort((a, b) => (S.role(c.id, b.m.userId).rank - S.role(c.id, a.m.userId).rank) || a.u.name.localeCompare(b.u.name));
  return {
    title: "People", back: "admin",
    body: html`<label class="field" style="margin-top:14px"><span class="sr">Search people</span><input type="search" placeholder="Search by name or role" data-input="filter-rows" data-target="#people-list" data-empty="#people-none"></label>
      <div class="rows" id="people-list">${list.map(({ m, u }) => { const r = S.role(c.id, m.userId); return html`<button class="row" data-act="member-edit" data-user="${u.id}" data-search="${u.name} ${r.name}">${avatar(u)}<span class="body"><span class="t">${u.name}${u.id === S.me().id ? " (you)" : ""}</span><span class="s">${r.name}${c.locations.length > 1 ? `, ${accessText(m)}` : ""}</span></span>${icon("edit")}</button>`; })}</div>
      <div id="people-none" class="empty" hidden><p>Nobody matches.</p></div>
      ${S.can("manage.people") ? html`<div class="btns"><button class="btn ghost" data-act="member-add">${icon("plus")}Add someone</button></div>` : ""}`,
  };
};
Actions["member-edit"] = (el) => {
  const c = S.church(), u = S.user(el.dataset.user), m = S.membership(c.id, u.id), r = S.role(c.id, u.id);
  const primary = S.isPrimary(c.id, u.id);
  const canRole = S.can("manage.roles") && !primary && (S.isPrimary() || r.rank < myRank()) && u.id !== S.me().id;
  const assignable = [...c.roles].filter((x) => S.isPrimary() || x.rank < myRank()).sort((a, b) => b.rank - a.rank);
  openSheet(u.name, html`<form data-form="member-save" novalidate><input type="hidden" name="user" value="${u.id}">
    <p class="muted" style="margin-top:0">${u.email || ""}${u.phone ? ` ${u.phone}` : ""}</p>
    ${primary ? html`<p><span class="tag brand">Primary account holder</span></p>` : canRole ? html`<label class="field"><span>Role</span><select name="roleId">${assignable.map((x) => html`<option value="${x.id}" ${attr(x.id === m.roleId, "selected")}>${x.name}</option>`)}</select><small>${r.id === "admin" || assignable.some((x) => x.id === "admin") ? "Administrators get full access unless the primary limits the Administrator role." : ""}</small></label>`
      : html`<p><b>Role:</b> ${r.name}</p>`}
    ${c.locations.length > 1 && !primary ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Location access</legend>
      <label class="check"><input type="radio" name="access" value="all" ${attr(m.locations === "all", "checked")} ${attr(!canRole, "disabled")}><span>All locations, including private ones</span></label>
      <label class="check"><input type="radio" name="access" value="some" ${attr(m.locations !== "all", "checked")} ${attr(!canRole, "disabled")}><span>Only these:</span></label>
      <div style="padding-left:34px">${c.locations.map((l) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="locs" value="${l.id}" ${attr(m.locations === "all" || l.visibility === "public" && !Array.isArray(m.locations) || (Array.isArray(m.locations) && m.locations.includes(l.id)) || l.visibility === "public", "checked")} ${attr(!canRole || l.visibility === "public", "disabled")}><span>${l.name} (${l.code})${l.visibility === "public" ? html` <span class="faint">public, everyone sees it</span>` : html` <span class="tag">Private</span>`}</span></label>`)}</div></fieldset>` : ""}
    <label class="check"><input type="checkbox" name="listed" ${attr(m.listed, "checked")} ${attr(!S.can("manage.people"), "disabled")}><span>Listed in the directory</span></label>
    <div class="btns">${canRole || S.can("manage.people") ? html`<button class="btn">Save</button>` : ""}
      ${S.can("manage.people") && !primary && u.id !== S.me().id ? html`<button type="button" class="btn danger" data-act="member-remove" data-user="${u.id}">Remove from church</button>` : ""}
      ${S.isPrimary() && !primary ? html`<button type="button" class="btn ghost" data-act="make-primary" data-user="${u.id}">Make primary account holder</button>` : ""}</div></form>`);
};
Forms["member-save"] = (d, f, fd) => {
  const c = S.church(), m = S.membership(c.id, d.user);
  if (d.roleId) {
    const target = c.roles.find((x) => x.id === d.roleId);
    if (!S.isPrimary() && (!S.can("manage.roles") || target.rank >= myRank())) return formError(f, "You can only give roles below your own.");
    m.roleId = d.roleId;
    if (d.access) m.locations = d.access === "all" ? "all" : fd.getAll("locs").filter((id) => S.location(id)?.visibility === "private");
  }
  if (S.can("manage.people")) m.listed = !!d.listed;
  S.save(); closeSheet(); toast("Saved"); render();
};
Actions["member-remove"] = (el) => { S.state.memberships = S.state.memberships.filter((m) => !(m.churchId === S.state.current && m.userId === el.dataset.user)); S.save(); closeSheet(); toast("Removed"); render(); };
Actions["make-primary"] = (el) => openSheet("Hand over the church account?", html`<p>${S.userName(el.dataset.user)} becomes the primary account holder, with full control of roles and settings. You'll become an administrator.</p>
  <div class="btns"><button class="btn danger" data-act="make-primary-yes" data-user="${el.dataset.user}">Hand it over</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
Actions["make-primary-yes"] = (el) => {
  const c = S.church();
  S.membership().roleId = "admin"; S.membership().locations = "all";
  c.ownerId = el.dataset.user; delete c.previousOwner;
  S.save(); closeSheet(true); toast("Handed over"); go("admin");
};
Actions["member-add"] = () => openSheet("Add someone", html`<form data-form="member-add" novalidate>
  <p class="muted" style="margin-top:0">For people who don't use the app yet. They start with the default role.</p>
  <label class="field"><span>Name</span><input type="text" name="name" required maxlength="60"></label>
  <label class="field"><span>Household name</span><input type="text" name="household" maxlength="80" placeholder="The Garcia family"></label>
  <label class="field"><span>Phone</span><input type="tel" name="phone"></label><label class="field"><span>Email</span><input type="email" name="email"></label>
  <label class="check"><input type="checkbox" name="listed" checked><span>List in the directory</span></label>
  <button class="btn block">Add</button></form>`);
Forms["member-add"] = (d, f) => {
  if (!d.name) return formError(f, "Enter a name.");
  const id = "u-" + uid();
  S.state.users[id] = { id, name: d.name, household: d.household || d.name, phone: d.phone, email: d.email };
  S.state.memberships.push({ churchId: S.state.current, userId: id, roleId: S.church().defaults.roleId, locations: [], listed: !!d.listed, joined: new Date().toISOString() });
  S.save(); closeSheet(); toast(`${d.name} added`); render();
};

// ----- Locations -----
AdminScreens.locations = () => {
  const blocked = guard("manage.locations"); if (blocked) return blocked;
  const c = S.church();
  return {
    title: "Campuses and locations", back: "admin",
    body: html`<p class="muted" style="margin-top:16px">Each location has a unique ID. Public locations show to everyone; private ones only to people given access under People.</p>
      <div class="rows">${c.locations.map((l) => html`<button class="row" data-act="loc-edit" data-id="${l.id}"><span class="lead-ic">${icon(l.visibility === "private" ? "lock" : "pin")}</span><span class="body"><span class="t">${l.name} <span class="tag">${l.code}</span></span><span class="s">${l.visibility === "private" ? "Private" : "Public"}, ${plural((l.rooms || []).length, "room")}, ${plural((l.services || []).length, "service")}${l.liveUrl ? ", livestream" : ""}</span></span>${icon("edit")}</button>`)}</div>
      <div class="btns"><button class="btn" data-act="loc-edit">${icon("plus")}Add a location</button></div>`,
  };
};
Actions["loc-edit"] = (el) => {
  const l = S.location(el.dataset.id) || { visibility: "public", rooms: [], services: [] };
  const svcs = [...(l.services || []), { day: 0, time: "", label: "" }];
  openSheet(l.id ? `Edit ${l.name}` : "Add a location", html`<form data-form="loc-save" novalidate><input type="hidden" name="id" value="${l.id || ""}">
    <div style="display:grid;grid-template-columns:1.6fr 1fr;gap:8px">
      <label class="field"><span>Name</span><input type="text" name="name" value="${l.name || ""}" required maxlength="40"></label>
      <label class="field"><span>Unique ID</span><input type="text" name="code" value="${l.code || ""}" maxlength="12" style="text-transform:uppercase" required></label></div>
    <label class="field"><span>Address</span><input type="text" name="address" value="${l.address || ""}" maxlength="120"></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Who can see it</legend><div class="radios">
      <label><input type="radio" name="visibility" value="public" ${attr(l.visibility !== "private", "checked")}><span>Public</span></label>
      <label><input type="radio" name="visibility" value="private" ${attr(l.visibility === "private", "checked")}><span>Private</span></label></div></fieldset>
    <label class="field"><span>Rooms</span><textarea name="rooms" placeholder="Room 104&#10;Fellowship hall">${(l.rooms || []).join("\n")}</textarea><small>One per line. Classes and events pick from these. ${l.id ? html`Give them numbers, say where they are and add displays under <a href="#admin-rooms">Rooms</a>.` : ""}</small></label>
    <label class="field"><span>Room where services meet</span><input type="text" name="serviceRoom" value="${l.serviceRoom ?? (l.rooms || [])[0] ?? ""}" maxlength="60"><small>Room booking keeps it free for 90 minutes from each service time. Leave blank to skip.</small></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Services</legend>
      ${svcs.map((s, i) => html`<div style="display:grid;grid-template-columns:1.1fr .9fr 1.4fr;gap:8px;margin-bottom:8px">
        <select name="day${i}" aria-label="Day">${DAYS.map((d, n) => html`<option value="${n}" ${attr(n === s.day, "selected")}>${d}</option>`)}</select>
        <input type="time" name="time${i}" value="${s.time}" aria-label="Time"><input type="text" name="label${i}" value="${s.label}" placeholder="${s.time ? "" : "Add a service"}" aria-label="Name" maxlength="30"></div>`)}
      <small>Clear a time to remove that service. Save to add another.</small></fieldset>
    <label class="field"><span>Livestream link</span><input type="url" name="liveUrl" value="${l.liveUrl || ""}" placeholder="https://youtube.com/@yourchurch/live"><small>YouTube, Vimeo, Facebook or a video file. Shown on Watch live.</small></label>
    <div class="btns"><button class="btn">Save location</button>${l.id && S.locations().length > 1 ? html`<button type="button" class="btn danger" data-act="loc-delete" data-id="${l.id}">Delete</button>` : ""}</div></form>`);
};
Forms["loc-save"] = (d, f) => {
  const c = S.church();
  const code = (d.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!d.name || !code) return formError(f, "Give the location a name and a unique ID.");
  if (c.locations.some((l) => l.code === code && l.id !== d.id)) return formError(f, `Another location already uses the ID ${code}.`);
  if (d.liveUrl && !isUrl(d.liveUrl)) return formError(f, "The livestream link should start with https://");
  const services = [];
  for (let i = 0; i < 30 && `time${i}` in d; i++) if (d[`time${i}`]) services.push(svc(+d[`day${i}`], d[`time${i}`], d[`label${i}`] || "Worship service"));
  const rooms = d.rooms.split("\n").map((x) => x.trim()).filter(Boolean), oldInfo = (d.id && S.location(d.id)?.roomInfo) || {};
  const roomInfo = Object.fromEntries(Object.entries(oldInfo).filter(([k]) => rooms.some((r) => sameRoom(r, k))));
  const rec = { name: d.name, code, address: d.address, visibility: d.visibility || "public", rooms, roomInfo, serviceRoom: d.serviceRoom, services: services.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), liveUrl: d.liveUrl };
  if (d.id) Object.assign(S.location(d.id), rec); else c.locations.push({ id: `${c.id}-${code.toLowerCase()}-${uid().slice(-3)}`, ...rec });
  S.save(); closeSheet(); toast("Location saved"); render();
};
Actions["loc-delete"] = (el) => { const c = S.church(); c.locations = c.locations.filter((l) => l.id !== el.dataset.id); S.save(); closeSheet(); toast("Location deleted"); render(); };

// ----- Prayer, connect cards -----
AdminScreens.prayer = () => {
  const blocked = guard("manage.prayer"); if (blocked) return blocked;
  const list = S.list("prayers").sort((a, b) => new Date(b.at) - new Date(a.at));
  return {
    title: "Prayer requests", back: "admin",
    body: html`<p class="muted" style="margin-top:16px">Private requests are only visible to people who moderate prayer. Hidden requests are off the public wall.</p>
      <div class="rows">${list.length ? list.map((p) => html`<article class="prayer"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="who">${p.anonymous ? `Anonymous${p.name ? ` (${p.name})` : ""}` : p.name}</span><span class="faint">${ago(p.at)}</span>
        ${p.private ? html`<span class="tag">Private</span>` : ""}${p.hidden ? html`<span class="tag warn">Hidden</span>` : ""}${p.answered ? html`<span class="tag ok">Answered</span>` : ""}</div><p>${p.text}</p>
        <div class="acts"><button class="btn ghost sm" data-act="prayer-hide" data-id="${p.id}">${p.hidden ? "Show on wall" : "Hide from wall"}</button><button class="btn danger sm" data-act="prayer-delete" data-id="${p.id}">Remove</button></div></article>`) : empty("No requests yet.")}</div>`,
  };
};
Actions["prayer-hide"] = (el) => { const p = S.get("prayers", el.dataset.id); S.update("prayers", p.id, { hidden: !p.hidden }); render(); };
AdminScreens.cards = () => {
  const blocked = guard("manage.prayer"); if (blocked) return blocked;
  const list = S.list("cards").sort((a, b) => a.handled - b.handled || new Date(b.at) - new Date(a.at));
  return {
    title: "Connect cards", back: "admin",
    body: html`<div class="rows" style="margin-top:16px">${list.length ? list.map((x) => html`<article class="prayer"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="who">${x.name}</span><span class="faint">${ago(x.at)}</span>${x.handled ? html`<span class="tag ok">Followed up</span>` : html`<span class="tag warn">New</span>`}</div>
      <p><b>${x.reason}</b>${x.message ? html`<br>${x.message}` : ""}</p><p class="faint">${x.contact}</p>
      ${!x.handled ? html`<button class="btn ghost sm" data-act="card-done" data-id="${x.id}">${icon("check")}Mark followed up</button>` : ""}</article>`) : empty("Connect cards people send from the app land here.")}</div>`,
  };
};
Actions["card-done"] = (el) => { S.update("cards", el.dataset.id, { handled: true }); toast("Marked followed up"); render(); };

// ----- Check-in roster -----
let rosterService = null;
AdminScreens.checkin = () => {
  const blocked = guard("checkin.station"); if (blocked) return blocked;
  const c = S.church();
  const services = upcomingServices(c, 8, "all");
  const visibleIds = new Set(S.visibleLocations().map((l) => l.id));
  const ins = S.list("checkins").filter((x) => !x.locationId || visibleIds.has(x.locationId));
  const keys = [...new Set([...services.map(serviceKey), ...ins.map((x) => x.serviceKey), ...S.list("serving").map((x) => x.serviceKey)])].sort();
  const today = isoDay(new Date());
  const current = keys.includes(rosterService) ? rosterService : keys.find((k) => k.slice(0, 10) >= today) || keys[keys.length - 1];
  const label = (k) => { const s = services.find((x) => serviceKey(x) === k); return s ? serviceName(s) : ins.find((x) => x.serviceKey === k)?.serviceName || k; };
  const kidsHere = ins.filter((x) => x.serviceKey === current);
  const vols = S.list("serving").filter((x) => x.serviceKey === current);
  return {
    title: "Check-in roster", back: S.can("manage.church") || hasAdminTools() ? "admin" : "ministry",
    body: html`<label class="field" style="margin-top:16px"><span>Service</span><select data-change="roster-service">${keys.map((k) => html`<option value="${k}" ${attr(k === current, "selected")}>${label(k)}</option>`)}</select></label>
      <form data-form="checkout" class="panel" novalidate><label class="field" style="margin-top:0"><span>Check out with a pickup code</span><div style="display:flex;gap:8px"><input type="text" name="code" maxlength="3" autocomplete="off" style="text-transform:uppercase;font-family:var(--serif);font-size:1.3rem;letter-spacing:.1em"><button class="btn">Check out</button></div></label></form>
      <div class="stat" style="margin-top:12px"><div><b>${kidsHere.filter((x) => !x.out).length}</b><span>Kids in rooms</span></div><div><b>${vols.length}</b><span>Volunteers on duty</span></div></div>
      <div class="btns"><a class="btn sm" href="#kiosk">${icon("screen")}Open the check-in kiosk</a></div>
      ${(() => { const al = kidsHere.filter((x) => !x.out && x.allergies); return al.length ? html`<div class="allergy-note" style="margin-top:12px">${icon("info")}<span><b>Allergy alerts.</b> ${al.map((x) => `${x.childName} (${x.room}): ${x.allergies}`).join(". ")}.</span></div>` : ""; })()}
      ${c.kidsRooms.map((r) => { const list = kidsHere.filter((x) => x.room === r.name); return list.length ? html`<section class="sec"><h2 class="sec-head">${r.name}</h2><div class="rows">${list.map((k) => html`<div class="row"><span class="body"><span class="t">${k.childName}</span><span class="s">Parent: ${k.parentName}${k.via === "kiosk" ? ", kiosk" : ""}</span>${careHtml(k)}</span>${k.out ? html`<span class="tag">${k.outBy === "parent" ? "Picked up (parent)" : k.outBy === "staff" ? "Picked up" : `Picked up by ${firstName(k.outBy)}`}</span>` : html`<span class="code tag brand" style="font-size:1rem">${k.code}</span>`}</div>`)}</div></section>` : ""; })}
      ${!kidsHere.length ? html`<div class="rows" style="margin-top:14px">${empty("No kids checked in for this service yet.")}</div>` : ""}
      ${vols.length ? html`<section class="sec"><h2 class="sec-head">Volunteers</h2><div class="rows">${vols.map((v) => html`<div class="row"><span class="body"><span class="t">${v.name}</span><span class="s">${v.team}</span></span></div>`)}</div></section>` : ""}
      ${S.can("qr.create") ? html`<div class="btns"><button class="btn ghost sm" data-act="qr-for" data-target="checkin-${c.id}" data-label="Check in your kids">${icon("qr")}QR code for the check-in desk</button></div>` : ""}`,
    after() { rosterService = current; },
  };
};
Inputs["roster-service"] = (el) => { rosterService = el.value; render(); };
Forms.checkout = (d, f) => {
  const code = (d.code || "").toUpperCase();
  const hits = S.list("checkins").filter((x) => x.serviceKey === rosterService && x.code === code && !x.out);
  if (!hits.length) return formError(f, `No kids checked in with code ${code || "(blank)"} for this service.`);
  f.reset(); releaseSheet(hits);
};

// ----- Giving -----
AdminScreens.giving = () => {
  const blocked = guard("view.giving"); if (blocked) return blocked;
  const c = S.church(), gifts = S.list("gifts");
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const sum = (list) => list.reduce((n, g) => n + g.amount, 0);
  const thisYear = gifts.filter((g) => new Date(g.at).getFullYear() === y);
  const thisMonth = thisYear.filter((g) => new Date(g.at).getMonth() === m);
  const recent = [...gifts].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);
  const funds = [...c.funds, { id: "", name: "", description: "" }];
  return {
    title: "Giving", back: "admin",
    body: html`${Pay.live() ? "" : demoNote("Totals include sample gifts and test gifts. No money has moved.")}
      <section class="sec" style="margin-top:12px"><h2 class="sec-head">Online payments</h2>${processorPanel(c)}</section>
      <section class="sec"><h2 class="sec-head">Another giving service</h2><form data-form="giving-link" class="panel" novalidate>
        <p style="margin-top:0">Already take gifts through Tithe.ly, Pushpay, Givelify or another service? Link your giving page and the Give screen leads with it.${Pay.provider() ? " Gifts made here still go through your processor." : ""}</p>
        <label class="field"><span>Service</span><select name="service">${GIVING_SERVICES.map(([k, l]) => html`<option value="${k}" ${attr((c.givingLink?.service || "tithely") === k, "selected")}>${l}</option>`)}</select></label>
        <label class="field"><span>Giving page address</span><input type="url" name="url" value="${c.givingLink?.url || ""}" placeholder="https://tithe.ly/give?c=..." inputmode="url"></label>
        <p class="faint">Gifts made there stay in that service, so they don't show in giving reports or statements here.</p>
        <div class="btns"><button class="btn ghost sm">Save link</button>${c.givingLink?.url ? html`<button type="button" class="btn ghost sm" data-act="giving-link-remove">Remove link</button>` : ""}</div></form></section>
      <section class="sec"><h2 class="sec-head">${isTrainingChurch(c) ? "Statements" : "Text to give and statements"}</h2><form data-form="give-settings" class="panel" novalidate>
          ${isTrainingChurch(c) ? html`<input type="hidden" name="number" value=""><input type="hidden" name="keyword" value="GIVE">` : html`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field" style="margin-top:0"><span>Text-to-give number</span><input type="tel" name="number" value="${c.textGive?.number || ""}" placeholder="(770) 555-0199"><small>A Twilio number pointed at your sms function.</small></label>
            <label class="field" style="margin-top:0"><span>Keyword</span><input type="text" name="keyword" value="${c.textGive?.keyword || "GIVE"}" maxlength="20"></label></div>`}
          <label class="field"><span>Tax ID (EIN) for statements</span><input type="text" name="taxId" value="${c.taxId || ""}" maxlength="20" placeholder="12-3456789"></label>
          <button class="btn ghost sm">Save</button></form></section>
      <section class="sec"><h2 class="sec-head">Year-end statements</h2><div class="panel">
        <label class="field" style="margin-top:0"><span>Year</span><select id="stmt-year">${[y, y - 1, y - 2].map((n) => html`<option ${attr(n === (now.getMonth() < 2 ? y - 1 : y), "selected")}>${n}</option>`)}</select></label>
        <div class="btns"><button class="btn sm" data-act="statements-all" data-year="${y}">${icon("download")}All statements (PDF)</button><button class="btn ghost sm" data-act="statements-csv">${icon("download")}Gifts (CSV)</button></div>
        <p class="faint">One page or more per giver, with the church's details and tax note. Members can download their own under Giving history.</p></div></section>
      <div class="stat"><div><b>${money(sum(thisMonth))}</b><span>This month</span></div><div><b>${money(sum(thisYear))}</b><span>This year</span></div></div>
      <section class="sec"><h2 class="sec-head">By fund this year</h2><div class="rows">${c.funds.map((f) => { const t = sum(thisYear.filter((g) => g.fundId === f.id)); return html`<div class="row"><span class="body"><span class="t">${f.name}</span><span class="progress" style="display:block;margin-top:6px"><i style="width:${sum(thisYear) ? Math.round(t / sum(thisYear) * 100) : 0}%"></i></span></span><b>${money(t)}</b></div>`; })}</div></section>
      <section class="sec"><h2 class="sec-head">Recent gifts</h2><div class="rows">${recent.length ? recent.map((g) => html`<div class="row"><span class="body"><span class="t">${g.name}</span><span class="s">${fundName(g.fundId)}, ${fmtShort(g.at)}${g.frequency !== "once" ? `, ${FREQ[g.frequency].toLowerCase()}` : ""}</span></span><b>${money(g.amount)}</b></div>`) : empty("No gifts yet.")}</div></section>
      <section class="sec"><h2 class="sec-head">Funds</h2><form data-form="admin-funds" class="panel" novalidate>
        ${funds.map((f, i) => html`<div style="display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-bottom:8px"><input type="hidden" name="id${i}" value="${f.id}">
          <input type="text" name="name${i}" value="${f.name}" placeholder="${f.id ? "" : "Add a fund"}" aria-label="Fund name" maxlength="40"><input type="text" name="desc${i}" value="${f.description}" aria-label="Description" maxlength="80"></div>`)}
        <p class="faint">Clear a name to remove that fund. Past gifts keep their fund.</p><button class="btn">Save funds</button></form></section>`,
  };
};
Forms["give-settings"] = (d, f) => {
  if (d.number && digits(d.number).length < 10) return formError(f, "Enter the full text-to-give number, with area code.");
  S.updateChurch({ textGive: d.number ? { number: d.number, keyword: (d.keyword || "GIVE").toUpperCase() } : null, taxId: d.taxId }); toast("Saved"); render();
};
// ----- Payment processors: each church connects its own Stripe, PayPal or Square (see 62-pay.js and SETUP.md) -----
const PROCESSOR_SETUP = {
  stripe: {
    blurb: "Cards, Apple Pay, Google Pay and bank accounts. Weekly and monthly gifts.",
    steps: [html`Sign in at <a href="https://dashboard.stripe.com" target="_blank" rel="noopener">dashboard.stripe.com</a> with the church's Stripe account, or create one. Stripe asks for the church's EIN and bank account.`,
      "Open Developers, then API keys.", "Next to Secret key, choose Reveal and copy it. It starts with sk_live_."],
    fields: () => passwordField("secret", "Secret key", "off"),
    test: "To try it first, switch Stripe to test mode and use the key that starts with sk_test_.",
  },
  paypal: {
    blurb: "PayPal, Pay Later and cards. Weekly and monthly gifts.",
    steps: [html`Sign in at <a href="https://developer.paypal.com" target="_blank" rel="noopener">developer.paypal.com</a> with the church's PayPal business account.`,
      "Open Apps and Credentials, choose Live at the top, then Create App.", "Copy the app's Client ID and Secret."],
    fields: () => html`<label class="field"><span>Client ID</span><input type="text" name="clientId" autocomplete="off" required spellcheck="false"></label>${passwordField("secret", "Secret", "off")}`,
    test: "Sandbox credentials work too, for a trial run.",
  },
  square: {
    blurb: "Cards, Apple Pay and Google Pay. One-time payments only.",
    steps: [html`Sign in at <a href="https://developer.squareup.com/apps" target="_blank" rel="noopener">developer.squareup.com</a> with the church's Square account.`,
      "Create an application (call it anything, such as Church app) and open it.", "On Credentials, choose Production and copy the Access token."],
    fields: () => html`${passwordField("token", "Access token", "off")}<label class="field"><span>Location ID (optional)</span><input type="text" name="locationId" autocomplete="off" spellcheck="false"><small>Leave it blank to use your main location that takes cards.</small></label>`,
    test: "A sandbox access token works too, for a trial run.",
  },
};
const canSetPayments = () => S.can("manage.church");
const processorChoices = () => html`<div class="rows proc-list">${Object.entries(PROCESSOR_SETUP).map(([k, p]) => html`<button type="button" class="row" data-act="processor-pick" data-p="${k}">
  <span class="proc-mark ${k}">${PROCESSORS[k].name}</span><span class="body"><span class="s">${p.blurb}</span></span>${icon("chev")}</button>`)}</div>`;
function processorPanel(c) {
  const p0 = practiceMode(c) ? c.practicePayments : c.payments, pay = p0?.ready && PROCESSORS[p0.provider] ? p0 : null;
  if (pay) {
    const name = PROCESSORS[pay.provider].name;
    return html`<div class="panel">
      <div class="proc-head"><span class="proc-mark ${pay.provider}">${name}</span>${pay.mode === "test" ? html`<span class="tag warn">Test mode</span>` : html`<span class="tag ok">Live</span>`}</div>
      <p>Gifts, tickets and form fees go ${pay.account ? html`to <b>${pay.account}</b> through ${name}` : `to ${c.name}'s ${name} account`}. ${name} sends receipts.${pay.recurring ? "" : ` Recurring gifts aren't available with ${name}, so givers choose one-time gifts.`}</p>
      ${pay.practice ? html`<p class="faint">Connected for practice: no keys were checked, and checkout stays a practice checkout.</p>`
        : pay.mode === "test" ? html`<p class="faint">These are test keys, so no real money moves. Connect your live keys when you're ready.</p>` : ""}
      ${canSetPayments() ? html`<div class="btns"><button type="button" class="btn ghost sm" data-act="processor-pick" data-p="${pay.provider}">Update keys</button>
        <button type="button" class="btn ghost sm" data-act="processor-choose">Use a different processor</button>
        <button type="button" class="btn danger sm" data-act="processor-disconnect" data-p="${pay.provider}">Disconnect</button></div>` : ""}</div>`;
  }
  if (c.stripe?.accountId) return html`<div class="panel">${c.stripe.chargesEnabled
    ? html`<p style="margin-top:0">${icon("check")} Stripe is connected. Gifts, tickets and form fees go straight to ${c.name}'s Stripe account${PLATFORM.platformFeePercent ? `, less a ${PLATFORM.platformFeePercent}% platform fee` : ""}.</p><button type="button" class="btn ghost sm" data-act="stripe-connect">${icon("link")}Open Stripe settings</button>`
    : html`<p style="margin-top:0">Stripe needs a few more details before gifts can come in.</p><button type="button" class="btn sm" data-act="stripe-connect">Finish setting up Stripe</button>`}
    ${canSetPayments() ? html`<p class="faint">Or connect the church's own processor instead:</p>${processorChoices()}` : ""}</div>`;
  return html`<div class="panel">
    <p style="margin-top:0">Choose the payment processor ${c.name} uses for gifts, event tickets and form fees. Money goes straight into the church's own account; the app never holds it.</p>
    ${canSetPayments() ? processorChoices() : html`<p class="faint" style="margin-bottom:0">Someone who manages the church account can set this up.</p>`}</div>`;
}
Actions["processor-choose"] = () => openSheet("Payment processor", html`<p style="margin-top:0">Gifts and payments made from now on go through the one you choose. Recurring gifts already set up keep going through the processor they started with.</p>${processorChoices()}`);
Actions["processor-pick"] = async (el) => {
  const k = el.dataset.p, p = PROCESSOR_SETUP[k], name = PROCESSORS[k].name;
  openSheet(`Connect ${name}`, html`<form data-form="processor-connect" novalidate><input type="hidden" name="provider" value="${k}">
    <p style="margin-top:0">${p.blurb}</p>
    <ol class="steps-list">${p.steps.map((s) => html`<li>${s}</li>`)}</ol>
    ${p.fields()}
    <p class="faint">${p.test} The app checks the keys with ${name}, sets up payment notices, and stores the keys encrypted where only its server can read them.</p>
    <button class="btn block">Connect ${name}</button>
    ${k === "stripe" ? html`<div id="stripe-connect-slot"></div>` : ""}</form>`);
  // A platform with Stripe Connect set up can also offer Stripe's own sign-up, with no keys to copy.
  if (k === "stripe" && typeof Backend !== "undefined" && Backend.on) {
    const o = await Backend.call("payments-setup", { action: "options", churchId: S.state.current }).catch(() => null);
    const slot = $("#stripe-connect-slot");
    if (o?.stripeConnect && slot) slot.innerHTML = String(html`<p class="faint" style="text-align:center">or</p><button type="button" class="btn ghost block" data-act="stripe-connect">Sign up through Stripe instead</button>`);
  }
};
Forms["processor-connect"] = async (d, f) => {
  const k = d.provider, name = PROCESSORS[k]?.name;
  const keys = k === "stripe" ? { secret: d.secret } : k === "paypal" ? { clientId: d.clientId, secret: d.secret } : { token: d.token, locationId: d.locationId };
  if (Object.entries(keys).some(([n, v]) => n !== "locationId" && !v)) return formError(f, "Fill in every box.");
  if (practiceMode()) {   // practice: it connects in name only, and checkout stays a practice checkout
    S.updateChurch({ practicePayments: { provider: k, ready: true, mode: "test", account: "", methods: PROCESSORS[k].methods.map(([v]) => v), recurring: PROCESSORS[k].recurring, practice: true } });
    closeSheet(true); toast(`${name} connected for practice. No keys were checked and no money moves.`); render(); return;
  }
  if (typeof Backend === "undefined" || !Backend.on) return formError(f, `Processors connect once the app is on your own website with Supabase set up (see SETUP.md). In this preview nothing connects, and no money moves.`);
  const btn = $("button.btn.block", f); btn.disabled = true; btn.textContent = `Checking with ${name}...`;
  try {
    await Backend.call("payments-setup", { action: "connect", churchId: S.state.current, provider: k, keys });
    await Backend.pull().catch(() => {});
    closeSheet(true); toast(`${name} connected`); render();
  } catch (e) { btn.disabled = false; btn.textContent = `Connect ${name}`; formError(f, e.message || "That didn't work. Try again."); }
};
Actions["processor-disconnect"] = (el) => {
  const k = el.dataset.p, name = PROCESSORS[k].name;
  openSheet(`Disconnect ${name}?`, html`<p style="margin-top:0">Online gifts, tickets and form fees stop until you connect a processor again. The app forgets the ${name} keys and stops hearing from ${name}, so recurring gifts set up through ${name} keep charging but no longer show here. Stop them in ${name} if you need to.</p>
    <div class="btns"><button class="btn danger" data-act="processor-disconnect-yes" data-p="${k}">Disconnect ${name}</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
};
Actions["processor-disconnect-yes"] = async (el) => {
  const k = el.dataset.p; el.disabled = true;
  if (practiceMode() || typeof Backend === "undefined" || !Backend.on) { S.updateChurch({ practicePayments: null }); closeSheet(true); toast(`${PROCESSORS[k].name} disconnected`); render(); return; }
  try { await Backend.call("payments-setup", { action: "disconnect", churchId: S.state.current, provider: k }); await Backend.pull().catch(() => {}); closeSheet(true); toast(`${PROCESSORS[k].name} disconnected`); render(); }
  catch (e) { el.disabled = false; toast(`Couldn't disconnect: ${e.message || "try again"}`); }
};
Forms["giving-link"] = (d, f) => {
  let url = d.url;
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  try { if (url) new URL(url); } catch { return formError(f, "Enter the full address of your giving page, starting with https://"); }
  if (url && !/^https:\/\//i.test(url)) return formError(f, "Use the secure address of your giving page, starting with https://");
  S.updateChurch({ givingLink: url ? { service: d.service, url } : null }); toast(url ? "Giving page linked" : "Link removed"); render();
};
Actions["giving-link-remove"] = () => { S.updateChurch({ givingLink: null }); toast("Link removed"); render(); };
Actions["stripe-connect"] = async () => {
  if (typeof Backend === "undefined" || !Backend.on) { openSheet("Connect Stripe", html`<p style="margin-top:0">Stripe connects once the app is on your own website with Supabase set up. SETUP.md walks through it: create a Stripe account for the platform, turn on Connect, and add the keys to your server functions.</p><p class="muted">After that, this button takes ${S.church().name} to Stripe to verify its bank account. It takes about ten minutes.</p><button class="btn block" data-act="close-sheet">OK</button>`); return; }
  try { toast("Opening Stripe..."); const { url } = await Backend.call("stripe-connect", { churchId: S.state.current, returnTo: location.href }); location.href = url; }
  catch (e) { toast(`Stripe couldn't open: ${e.message || "try again"}`); }
};
Forms["admin-funds"] = (d, f) => {
  const c = S.church(), funds = [];
  for (let i = 0; i <= c.funds.length; i++) if (d[`name${i}`]) funds.push({ id: d[`id${i}`] || slugify(d[`name${i}`]) || uid(), name: d[`name${i}`], description: d[`desc${i}`] || "" });
  if (!funds.length) return formError(f, "Keep at least one fund so people can give.");
  S.updateChurch({ funds }); toast("Funds saved"); render();
};
