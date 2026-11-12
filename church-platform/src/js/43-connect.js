// ---------- Connect: prayer wall, classes and Sunday school, small groups, directory ----------
const connectSeg = () => [["connect", "Prayer", S.on("prayer")], ["classes", "Classes", S.on("classes")], ["groups", "Groups", S.on("groups")], ["directory", "Directory", S.on("directory") && S.can("use.directory")], ["forms", "Forms", S.list("forms").some((f) => f.listed && formOpen(f))]];
let prayerFilter = "open";

function needMember(what) {
  const c = S.church();
  return html`<div class="panel" style="margin-top:14px"><p style="margin-top:0">Join ${c.name} to ${what}.</p><button class="btn" data-act="join-church" data-id="${c.id}">Join ${c.name}</button></div>`;
}
function noAccess(what) { return html`<div class="panel" style="margin-top:14px"><p style="margin:0">Your role at ${S.church().name} doesn't include ${what}. Ask a church admin if you need it.</p></div>`; }

Screens.connect = () => {
  if (!S.on("prayer")) return { redirect: S.on("classes") ? "classes" : S.on("groups") ? "groups" : "directory" };
  const me = S.me(), mod = S.can("manage.prayer");
  const all = S.list("prayers").filter((p) => !p.hidden && (!p.private || p.by === me.id || mod)).sort((a, b) => new Date(b.at) - new Date(a.at));
  const shown = all.filter((p) => prayerFilter === "answered" ? p.answered : prayerFilter === "mine" ? p.by === me.id : !p.answered);
  return {
    title: "Connect", tab: "connect",
    body: html`${seg(connectSeg(), "connect")}
      <div class="chips" role="group" aria-label="Filter requests" style="margin-top:14px">${[["open", "Requests"], ["answered", "Answered"], ["mine", "Mine"]].map(([k, l]) => html`<button class="chip" data-act="prayer-filter" data-f="${k}" aria-pressed="${k === prayerFilter}">${l}</button>`)}</div>
      ${!S.isMember() ? needMember("share prayer requests") : S.can("use.prayer") ? html`<button class="btn block" style="margin-top:8px" data-act="prayer-new">${icon("plus")}Share a prayer request</button>` : ""}
      <div class="rows" style="margin-top:14px">${shown.length ? shown.map(prayerItem) : empty(prayerFilter === "mine" ? "You haven't shared a request yet." : prayerFilter === "answered" ? "Answered prayers show up here." : "No requests right now.")}</div>`,
  };
};
function prayerItem(p) {
  const me = S.me(), prayed = p.prayedBy.includes(me.id), count = p.prayedCount + p.prayedBy.length;
  const mine = p.by === me.id;
  return html`<article class="prayer">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="who">${p.anonymous ? "Someone at church" : p.name}</span><span class="faint">${ago(p.at)}</span>
      ${p.private ? html`<span class="tag">Pastors only</span>` : ""}${p.answered ? html`<span class="tag ok">Answered</span>` : ""}</div>
    <p>${p.text}</p>
    ${p.answered && p.answer ? html`<p class="muted" style="border-left:3px solid var(--ok);padding-left:10px">${p.answer}</p>` : ""}
    <div class="acts">
      <button class="pray-btn" data-act="pray" data-id="${p.id}" aria-pressed="${prayed}">${icon("hand")}${prayed ? "Prayed" : "I prayed"}</button>
      <span class="faint">${count} ${count === 1 ? "person has" : "people have"} prayed</span>
      ${mine && !p.answered ? html`<button class="link-btn" data-act="prayer-answer" data-id="${p.id}">Mark answered</button>` : ""}
      ${mine || S.can("manage.prayer") ? html`<button class="link-btn" style="color:var(--warn)" data-act="prayer-delete" data-id="${p.id}">Remove</button>` : ""}
    </div></article>`;
}
Actions["prayer-filter"] = (el) => { prayerFilter = el.dataset.f; render(); };
Actions["pray"] = (el) => {
  const p = S.get("prayers", el.dataset.id), id = S.me().id;
  p.prayedBy = p.prayedBy.includes(id) ? p.prayedBy.filter((x) => x !== id) : [...p.prayedBy, id];
  S.save(); render();
};
Actions["prayer-new"] = () => openSheet("Share a prayer request", html`<form data-form="prayer-new" novalidate>
  <label class="field"><span>What can we pray for?</span><textarea name="text" maxlength="800" required></textarea></label>
  <label class="check"><input type="checkbox" name="anonymous"><span>Post without my name</span></label>
  <label class="check"><input type="checkbox" name="private" ${attr(S.church().defaults.prayerPrivate, "checked")}><span>Only pastors and the prayer team can see this</span></label>
  <button class="btn block">Share request</button></form>`);
Forms["prayer-new"] = (d, f) => {
  if (!d.text) return formError(f, "Write your request first.");
  S.add("prayers", { by: S.me().id, name: S.me().name, anonymous: !!d.anonymous, private: !!d.private, text: d.text, at: new Date().toISOString(), prayedBy: [], prayedCount: 0, answered: false, answer: "", hidden: false });
  emit("prayer.created", { name: d.anonymous ? null : S.me().name, private: !!d.private, text: d.text });
  prayerFilter = "open"; closeSheet(); toast(d.private ? "Sent to the pastors" : "Request shared"); render();
};
Actions["prayer-answer"] = (el) => openSheet("Mark as answered", html`<form data-form="prayer-answer" novalidate><input type="hidden" name="id" value="${el.dataset.id}">
  <label class="field"><span>Share how God answered (optional)</span><textarea name="answer" maxlength="500"></textarea></label><button class="btn block">Mark answered</button></form>`);
Forms["prayer-answer"] = (d) => { S.update("prayers", d.id, { answered: true, answer: d.answer || "" }); closeSheet(); toast("Marked answered"); render(); };
Actions["prayer-delete"] = (el) => openSheet("Remove this request?", html`<p>It will no longer show on the prayer wall.</p><div class="btns"><button class="btn danger" data-act="prayer-delete-yes" data-id="${el.dataset.id}">Remove</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
Actions["prayer-delete-yes"] = (el) => { S.remove("prayers", el.dataset.id); closeSheet(); toast("Request removed"); render(); };

// ----- Classes, Sunday school and groups -----
const gFilter = { class: "All", group: "All" };
function gatheringList(type) {
  const mod = type === "class" ? "classes" : "groups";
  if (!S.on(mod)) return { redirect: "connect" };
  const list = S.visible("gatherings").filter((g) => g.type === type).sort((a, b) => (nextMeeting(a) || 9e15) - (nextMeeting(b) || 9e15));
  const cats = ["All", ...new Set(list.map((g) => g.category))];
  if (!cats.includes(gFilter[type])) gFilter[type] = "All";
  const shown = list.filter((g) => gFilter[type] === "All" || g.category === gFilter[type]);
  const mine = list.filter((g) => isIn(g) || myEntries(g).length);
  return {
    title: "Connect", tab: "connect",
    body: html`${seg(connectSeg(), type === "class" ? "classes" : "groups")}
      <div style="margin-top:12px">${campusChip()}</div>
      ${mine.length ? html`<section class="sec" style="margin-top:12px"><h2 class="sec-head">Yours</h2><div class="rows">${mine.map(gatheringRow)}</div></section>` : ""}
      <section class="sec" style="margin-top:14px"><h2 class="sec-head">${type === "class" ? "Classes and Sunday school" : "Find a group"}</h2>
      ${cats.length > 2 ? html`<div class="chips" role="group" aria-label="Filter">${cats.map((k) => html`<button class="chip" data-act="g-filter" data-type="${type}" data-k="${k}" aria-pressed="${k === gFilter[type]}">${k}</button>`)}</div>` : ""}
      <div class="rows">${shown.length ? shown.map(gatheringRow) : empty(`No ${type === "class" ? "classes" : "groups"} yet.`)}</div></section>`,
  };
}
Screens.classes = () => gatheringList("class");
Screens.groups = () => gatheringList("group");
Actions["g-filter"] = (el) => { gFilter[el.dataset.type] = el.dataset.k; render(); };

function gatheringRow(g) {
  const kids = kidsIn(g).map((m) => m.name);
  const status = isLeader(g) ? html`<span class="tag brand">${g.type === "class" ? "Teacher" : "Leader"}</span>`
    : isIn(g) ? html`<span class="tag ok">Joined</span>`
    : kids.length ? html`<span class="tag ok">${listJoin(kids)}</span>`
    : myEntries(g).some((m) => m.status === "requested") ? html`<span class="tag">Requested</span>`
    : gFull(g) ? html`<span class="tag">Full</span>`
    : g.registration === "none" ? html`<span class="tag">Drop in</span>` : icon("chev");
  return html`<a class="row" href="#gathering-${g.id}"><span class="lead-ic">${icon(g.type === "class" ? "door" : "people")}</span><span class="body"><span class="t">${g.name}</span><span class="s">${scheduleText(g)}</span><span class="s">${placeText(g)}${g.ageMin != null ? `, ages ${g.ageMin} to ${g.ageMax}` : ""}</span></span>${status}</a>`;
}

Screens.gathering = (id) => {
  const g = S.get("gatherings", id);
  if (!g || !S.inScope(g, { ignoreCampus: true })) return { redirect: "connect" };
  const back = g.type === "class" ? "classes" : "groups";
  const next = nextMeeting(g);
  const entries = myEntries(g);
  const leaders = g.leaders.map((u) => S.userName(u));
  const canLead = isLeader(g) || S.can("manage.classes");
  const docs = S.list("docs").filter((d) => d.gatheringId === g.id && (d.published || d.authorId === S.me().id) && d.kind !== "sermon").sort((a, b) => b.date.localeCompare(a.date));
  const hasKid = kidsIn(g).length > 0;
  const loc = S.location(g.locationId);
  return {
    title: g.name, back, tab: "connect",
    body: html`<p style="margin:16px 0 4px"><span class="tag brand">${g.category}</span>${loc?.visibility === "private" ? html` <span class="tag">${icon("lock")}Private</span>` : ""}</p><h1>${g.name}</h1>
      <div class="meta">${icon("clock")}<span>${scheduleText(g)}${next ? html`<br><span class="faint">Next: ${fmtWhen(next)}</span>` : ""}</span>
        ${icon("pin")}<span>${placeText(g) || "Location to be announced"}${loc?.address || g.room ? html`<br><a href="${mapLink(fullAddress(g))}" target="_blank" rel="noopener">Directions</a>` : ""}</span>
        ${leaders.length ? html`${icon("user")}<span>${g.type === "class" ? "Taught" : "Led"} by ${listJoin(leaders)}</span>` : ""}
        ${icon("people")}<span>${plural(gCount(g), g.type === "class" ? "person" : "member", g.type === "class" ? "people" : "members")}${g.capacity ? ` of ${g.capacity}` : ""}${g.ageMin != null ? `, ages ${g.ageMin} to ${g.ageMax}` : ""}</span></div>
      ${g.description ? html`<p class="lead">${g.description}</p>` : ""}
      ${g.topic ? html`<p><span class="faint">Topic</span><br><b>${g.topic}</b></p>` : ""}
      ${registrationPanel(g, entries)}
      <div class="btns">
        ${next ? ext(gcalLink(g.name, next, new Date(next.getTime() + 90 * 60e3), g.description, fullAddress(g)), "Add to Google Calendar", "btn ghost sm", "calendar") : ""}
        ${(isIn(g) || isLeader(g)) && S.on("chat") && S.can("use.chat") ? html`<a class="btn ghost sm" href="#thread-g-${g.id}">${icon("chat")}${g.type === "class" ? "Class chat" : "Group chat"}</a>` : ""}
        ${(hasKid || (isLeader(g) && g.ageMin != null)) && S.on("chat") && S.can("use.chat") ? html`<a class="btn ghost sm" href="#thread-p-${g.id}">${icon("chat")}Parents chat</a>` : ""}
        ${S.can("qr.create") ? html`<button class="btn ghost sm" data-act="qr-for" data-target="${g.registration === "none" ? `gathering-${g.id}` : `register-gathering-${g.id}`}" data-label="${g.name}">${icon("qr")}QR code</button>` : ""}
      </div>
      ${canLead ? leaderPanel(g) : ""}
      ${docs.length ? html`<section class="sec"><h2 class="sec-head">${g.type === "class" ? "Lessons" : "Study guides"}</h2><div class="rows">${docs.map((d) => html`<a class="row" href="#outline-${d.id}"><span class="lead-ic">${icon("note")}</span><span class="body"><span class="t">${d.title}</span><span class="s">${d.passage ? `${d.passage}, ` : ""}${fmtShort(fromIsoDay(d.date))}${d.published ? "" : ", draft"}</span></span>${icon("chev")}</a>`)}</div></section>` : ""}
      ${g.study?.passage ? html`<section class="sec"><h2>What we're studying</h2><p class="scripture" style="font-size:1.15rem">${g.study.passage}</p>${veritasPanel(g.study.passage, g.study.topic, "Prepare")}</section>` : ""}`,
    after() { if (pendingRegister === g.id) { pendingRegister = null; if (g.registration !== "none" && !entries.length) Actions["g-register"]({ dataset: { id: g.id } }); } },
  };
};
function registrationPanel(g, entries) {
  if (!S.isMember()) return needMember(`register for this ${gLabel(g)}`);
  const kids = S.me().household.filter((p) => p.kind === "child");
  if (g.registration === "none") return html`<div class="panel" style="margin-top:14px"><p style="margin:0"><b>No registration needed.</b> Just come${g.ageMin != null ? " and bring your kids" : ""}.</p>
    ${g.ageMin != null && kids.length ? html`<p class="faint" style="margin-bottom:0">Want it in your parent portal? <button class="link-btn" data-act="g-register" data-id="${g.id}">Add your kids</button></p>` : ""}</div>`;
  return html`<div class="panel" style="margin-top:14px">
    ${entries.length ? html`${entries.map((m) => html`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:4px 0"><span><b>${m.childId ? m.name : "You"}</b> <span class="tag ${m.status === "in" ? "ok" : ""}">${m.status === "in" ? "Registered" : "Waiting for approval"}</span></span><button class="link-btn" style="color:var(--warn)" data-act="g-unregister" data-id="${g.id}" data-entry="${m.id}">Cancel</button></div>`)}
      <button class="btn ghost sm" style="margin-top:8px" data-act="g-register" data-id="${g.id}">Register someone else</button>`
      : gFull(g) ? html`<p style="margin:0"><b>This ${gLabel(g)} is full.</b></p>`
      : html`<p style="margin-top:0">${g.registration === "approval" ? `The ${g.type === "class" ? "teacher" : "leader"} approves each request.` : "Registration is required."}${g.capacity ? ` ${g.capacity - gCount(g)} spots left.` : ""}</p>
        <button class="btn block" data-act="g-register" data-id="${g.id}">${g.registration === "approval" ? "Ask to join" : "Register"}</button>`}
  </div>`;
}
Actions["g-register"] = (el) => {
  const g = S.get("gatherings", el.dataset.id), me = S.me();
  const taken = new Set(myEntries(g).map((m) => m.childId || "me"));
  const kids = me.household.filter((p) => p.kind === "child" && !taken.has(p.id));
  const fits = (k) => g.ageMin == null || (ageFrom(k.birth) != null && ageFrom(k.birth) >= g.ageMin && ageFrom(k.birth) <= g.ageMax);
  const kidsOnly = g.ageMin != null && g.ageMax < 18;
  openSheet(`Register for ${g.name}`, html`<form data-form="g-register" novalidate><input type="hidden" name="id" value="${g.id}">
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Who's coming?</legend>
      ${!kidsOnly && !taken.has("me") ? html`<label class="check"><input type="checkbox" name="who" value="me" checked><span>${me.name} (you)</span></label>` : ""}
      ${kids.map((k) => html`<label class="check"><input type="checkbox" name="who" value="${k.id}" ${attr(kidsOnly && fits(k), "checked")}><span>${k.name}${ageFrom(k.birth) != null ? `, age ${ageFrom(k.birth)}` : ""}${!fits(k) ? html` <span class="tag warn">Outside ages ${g.ageMin} to ${g.ageMax}</span>` : ""}</span></label>`)}
      ${!kids.length && kidsOnly ? html`<p class="muted">This ${gLabel(g)} is for kids. <a href="#household">Add your kids</a> first.</p>` : ""}
    </fieldset>
    <button class="btn block">${g.registration === "approval" ? "Send request" : "Register"}</button></form>`);
};
Forms["g-register"] = (d, f, fd) => {
  const g = S.get("gatherings", d.id), me = S.me(), who = fd.getAll("who");
  if (!who.length) return formError(f, "Choose who's coming.");
  if (g.capacity && gCount(g) + who.length > g.capacity) return formError(f, `Only ${g.capacity - gCount(g)} spots are left.`);
  const status = g.registration === "approval" ? "requested" : "in";
  who.forEach((w) => {
    const kid = w === "me" ? null : me.household.find((p) => p.id === w);
    g.members.push({ id: uid(), userId: me.id, childId: kid ? kid.id : null, name: kid ? kid.name : me.name, status, at: new Date().toISOString() });
  });
  emit("gathering.registered", { gathering: g.name, gatheringId: g.id, by: me.name, people: who.map((w) => w === "me" ? me.name : me.household.find((p) => p.id === w)?.name), status });
  S.save(); closeSheet(); toast(status === "in" ? "Registered" : "Request sent"); render();
};
Actions["g-unregister"] = (el) => { const g = S.get("gatherings", el.dataset.id); g.members = g.members.filter((m) => m.id !== el.dataset.entry); S.save(); toast("Cancelled"); render(); };

function leaderPanel(g) {
  const reqs = g.members.filter((m) => m.status === "requested"), ins = g.members.filter((m) => m.status === "in");
  const builder = g.type === "class" ? S.can("build.lessons") && (isLeader(g) || S.can("manage.classes")) : S.can("build.studies");
  return html`<section class="sec"><h2 class="sec-head">For ${g.type === "class" ? "teachers" : "leaders"}</h2><div class="panel">
    ${reqs.length ? html`<b>Asking to join</b>${reqs.map((m) => html`<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px"><span>${m.name}${m.childId ? html` <span class="faint">(${S.userName(m.userId)}'s child)</span>` : ""}</span><span class="btns" style="margin:0"><button class="btn sm" data-act="g-approve" data-id="${g.id}" data-entry="${m.id}">Approve</button><button class="btn ghost sm" data-act="g-unregister" data-id="${g.id}" data-entry="${m.id}">Decline</button></span></div>`)}<hr>` : ""}
    <b>Roster</b> <span class="faint">${plural(gCount(g), "person", "people")}${g.sampleCount ? `, ${g.sampleCount} from before this preview` : ""}</span>
    ${ins.length ? html`<ul style="margin:6px 0 0;padding-left:18px">${ins.map((m) => html`<li>${m.name}${m.childId ? html` <span class="faint">(${S.userName(m.userId)}'s child)</span>` : ""}</li>`)}</ul>` : html`<p class="faint" style="margin:4px 0 0">Nobody has registered through the app yet.</p>`}
    <div class="btns">
      ${builder ? html`<button class="btn sm" data-act="new-doc" data-kind="${g.type === "class" ? "lesson" : "study"}" data-gathering="${g.id}">${icon("plus")}${g.type === "class" ? "Plan a lesson" : "Write a study guide"}</button>` : ""}
      ${S.can("manage.classes") ? html`<a class="btn ghost sm" href="#admin-gatherings">${icon("edit")}Edit ${gLabel(g)}</a>` : ""}
    </div></div></section>`;
}
Actions["g-approve"] = (el) => { const g = S.get("gatherings", el.dataset.id); const m = g.members.find((x) => x.id === el.dataset.entry); if (m) m.status = "in"; S.save(); toast("Approved"); render(); };

// ----- Directory (members only; people choose to be listed) -----
function directoryEntries() {
  return S.members().filter((m) => m.listed).map((m) => {
    const u = S.user(m.userId) || {};
    const isMe = m.userId === S.me().id;
    return { id: m.userId, name: u.name || "Member", household: isMe ? (u.household?.length ? `${u.name} and family` : u.name) : u.household || u.name, phone: u.phone, email: u.email, isMe };
  }).sort((a, b) => a.name.split(" ").pop().localeCompare(b.name.split(" ").pop()));
}
Screens.directory = () => {
  if (!S.on("directory")) return { redirect: "connect" };
  if (!S.isMember()) return { title: "Connect", tab: "connect", body: html`${seg(connectSeg(), "directory")}${needMember("see the church directory")}` };
  if (!S.can("use.directory")) return { title: "Connect", tab: "connect", body: html`${seg(connectSeg(), "directory")}${noAccess("the directory")}` };
  const list = directoryEntries(), listed = !!S.membership().listed;
  return {
    title: "Connect", tab: "connect",
    body: html`${seg(connectSeg(), "directory")}
      <label class="check panel" style="margin-top:14px;padding:12px 16px"><input type="checkbox" data-change="directory-me" ${attr(listed, "checked")}><span><b>List me in the directory</b><br><span class="faint">Other members will see your name, phone and email.</span></span></label>
      <label class="field"><span class="sr">Search the directory</span><input type="search" placeholder="Search by name" data-input="filter-rows" data-target="#dir-list" data-empty="#dir-none"></label>
      <div class="rows" id="dir-list">${list.map((p) => html`<a class="row" href="#person-${p.id}" data-search="${p.name} ${p.household}">${avatar(p)}<span class="body"><span class="t">${p.name}${p.isMe ? " (you)" : ""}</span><span class="s">${p.household}</span></span>${icon("chev")}</a>`)}</div>
      <div id="dir-none" class="empty" ${attr(list.length, "hidden")}><p>${list.length ? "Nobody matches that name." : "Nobody is listed yet."}</p></div>`,
  };
};
Inputs["directory-me"] = (el) => { S.membership().listed = el.checked; S.save(); toast(el.checked ? "You're listed" : "You're no longer listed"); render(); };
Screens.person = (id) => {
  if (!S.isMember() || !S.can("use.directory")) return { redirect: "directory" };
  const p = directoryEntries().find((x) => x.id === id);
  if (!p) return { redirect: "directory" };
  return {
    title: p.name, back: "directory", tab: "connect",
    body: html`<div style="display:flex;gap:14px;align-items:center;margin-top:18px">${avatar(p, "lg")}<div><h1 style="font-size:1.5rem">${p.name}</h1><p class="muted" style="margin:0">${p.household}</p></div></div>
      <div class="rows" style="margin-top:18px">
        ${p.phone ? html`<a class="row" href="tel:${p.phone.replace(/[^\d+]/g, "")}"><span class="lead-ic">${icon("phone")}</span><span class="body"><span class="t">${p.phone}</span><span class="s">Call or text</span></span></a>` : ""}
        ${p.email ? html`<a class="row" href="mailto:${p.email}"><span class="lead-ic">${icon("mail")}</span><span class="body"><span class="t">${p.email}</span><span class="s">Email</span></span></a>` : ""}
        ${!p.phone && !p.email ? empty("No contact details listed.") : ""}
      </div>
      <div class="btns">${p.phone || p.email ? html`<button class="btn ghost sm" data-act="copy" data-done="Contact copied" data-text="${[p.name, p.phone, p.email].filter(Boolean).join("\n")}">${icon("copy")}Copy contact</button>` : ""}
        ${!p.isMe && S.on("chat") && S.can("use.chat") ? html`<button class="btn ghost sm" data-act="dm-start" data-user="${p.id}">${icon("chat")}Message</button>` : ""}</div>`,
  };
};
