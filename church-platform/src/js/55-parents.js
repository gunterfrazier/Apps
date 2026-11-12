// ---------- Parent portal: each child's classes, groups and events, this week's lessons, and check-in/out ----------

function childRegs(kid) {
  const gs = S.visible("gatherings", { ignoreCampus: true }).filter((g) => g.members.some((m) => m.userId === S.me().id && m.childId === kid.id));
  const evs = upcomingEvents().filter((e) => myRegistration(e)?.kids?.includes(kid.id));
  return { gs, evs };
}
function activeCheckin(kid) { return myActiveCheckins().find((x) => x.childId === kid.id) || null; }

Screens.parents = () => {
  if (!S.on("parents")) return { redirect: "me" };
  if (!S.isMember()) return { title: "Parent portal", back: "me", body: needMember("use the parent portal") };
  const list = kids();
  if (!list.length) return { title: "Parent portal", back: "me", body: html`<div class="panel" style="margin-top:16px"><p style="margin-top:0">Add your kids to your household, then register them for a class, group or event. Their schedule and check-in will show here.</p><a class="btn" href="#household">${icon("plus")}Add your kids</a></div>` };
  const any = list.some((k) => { const r = childRegs(k); return r.gs.length || r.evs.length; });
  return {
    title: "Parent portal", back: "me",
    body: html`${!any ? html`<div class="demo-note">${icon("info")}<div>Register your kids for a class, group or event and it will show up here, with the teacher, room and time.</div></div>` : ""}
      ${list.map((k) => childCard(k))}`,
  };
};
function childCard(k) {
  const c = S.church(), { gs, evs } = childRegs(k), live = activeCheckin(k), age = ageFrom(k.birth);
  const lessons = S.list("docs").filter((d) => d.kind === "lesson" && d.published && d.shareWithParents && gs.some((g) => g.id === d.gatheringId)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const suggestions = S.visible("gatherings").filter((g) => g.type === "class" && g.ageMin != null && age != null && age >= g.ageMin && age <= g.ageMax && !gs.includes(g)).slice(0, 3);
  return html`<section class="sec child">
    <div style="display:flex;gap:12px;align-items:center">${avatar(k, "lg")}<div style="flex:1"><h2>${k.name}</h2><p class="faint" style="margin:0">${age != null ? `Age ${age}, ` : ""}${roomFor(c, k.birth).name} room${k.notes ? html`. <b style="color:var(--warn)">${k.notes}</b>` : ""}</p></div></div>
    <div class="panel" style="margin-top:12px">
      ${live ? html`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><span class="tag ok">Checked in</span><p style="margin:6px 0 0">${live.room}, ${live.serviceName}. Since ${fmtTime(live.at)}.</p></div><div class="kidtag" style="padding:8px 12px"><div class="code">${live.code}</div></div></div>
          <div class="btns">${c.defaults.parentCheckout ? html`<button class="btn" data-act="parent-checkout" data-id="${live.id}">${icon("check")}Check out ${k.name}</button>` : html`<p class="faint" style="margin:0">Show the code at the classroom door to pick up.</p>`}</div>`
        : html`<p style="margin:0 0 10px"><span class="tag">Not checked in</span></p>${S.on("checkin") && S.can("use.checkin") ? html`<button class="btn" data-act="parent-checkin" data-id="${k.id}">${icon("kid")}Check in ${k.name}</button>` : ""}`}
    </div>
    ${gs.length ? html`<h3 style="margin-top:16px">Classes and groups</h3><div class="rows">${gs.map((g) => { const m = g.members.find((x) => x.childId === k.id), next = nextMeeting(g); return html`<a class="row" href="#gathering-${g.id}"><span class="lead-ic">${icon("door")}</span><span class="body"><span class="t">${g.name}</span>
        <span class="s">${scheduleText(g)}</span><span class="s">${placeText(g)}${g.leaders.length ? `. Teacher: ${listJoin(g.leaders.map((u) => S.userName(u)))}` : ""}</span>${next ? html`<span class="s">Next: ${fmtWhen(next)}</span>` : ""}</span>${m.status === "requested" ? html`<span class="tag">Waiting</span>` : icon("chev")}</a>`; })}</div>
      <div class="btns">${gs.filter((g) => S.on("chat") && S.can("use.chat") && g.ageMin != null).map((g) => html`<a class="btn ghost sm" href="#thread-p-${g.id}">${icon("chat")}Message ${g.name} teachers</a>`)}</div>` : ""}
    ${evs.length ? html`<h3 style="margin-top:16px">Events</h3><div class="rows">${evs.map(eventRow)}</div>` : ""}
    ${lessons.length ? html`<h3 style="margin-top:16px">What ${k.name}'s class is learning</h3><div class="rows">${lessons.map((d) => html`<a class="row" href="#outline-${d.id}"><span class="lead-ic">${icon("book")}</span><span class="body"><span class="t">${d.title}</span><span class="s">${d.passage ? `${d.passage}, ` : ""}${fmtShort(fromIsoDay(d.date))}</span></span>${icon("chev")}</a>`)}</div>` : ""}
    ${suggestions.length ? html`<h3 style="margin-top:16px">Classes for ${k.name}'s age</h3><div class="rows">${suggestions.map(gatheringRow)}</div>` : ""}
  </section>`;
}
Actions["parent-checkin"] = (el) => { checkinOnly = el.dataset.id; go("checkin"); };
Actions["parent-checkout"] = (el) => {
  const rec = S.get("checkins", el.dataset.id);
  openSheet(`Check out ${rec.childName}?`, html`<p>Only check out once ${rec.childName} is with you. The ${rec.room} teachers see that a parent checked them out.</p>
    <div class="btns"><button class="btn" data-act="parent-checkout-yes" data-id="${rec.id}">Yes, I have ${rec.childName}</button><button class="btn ghost" data-act="close-sheet">Not yet</button></div>`);
};
Actions["parent-checkout-yes"] = (el) => { const rec = S.get("checkins", el.dataset.id); checkOut([rec], "parent"); closeSheet(true); toast(`${rec.childName} checked out`); render(); };
