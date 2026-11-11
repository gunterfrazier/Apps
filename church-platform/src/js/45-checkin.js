// ---------- Kids check-in, volunteer check-in, household ----------

const kids = () => S.me().household.filter((p) => p.kind === "child");
const myActiveCheckins = () => {
  const today = isoDay(new Date());
  return S.list("checkins").filter((c) => c.by === S.me().id && !c.out && c.serviceKey.slice(0, 10) >= today).sort((a, b) => a.serviceKey.localeCompare(b.serviceKey));
};
let checkinOnly = null; // set by the parent portal to pre-select one child

function kidTags(active) {
  return [...new Set(active.map((a) => a.serviceKey))].map((key) => {
    const group = active.filter((a) => a.serviceKey === key);
    return html`<p class="faint" style="margin:10px 0 6px">${group[0].serviceName}</p>${group.map((a) => html`<div class="kidtag"><div><div class="nm">${a.childName}</div><div class="muted">${a.room}${a.notes ? html`<br><b style="color:var(--warn)">${a.notes}</b>` : ""}</div></div><div class="code" aria-label="Security code ${a.code.split("").join(" ")}">${a.code}</div></div>`)}
      <div class="kidtag" style="border-style:solid;border-color:var(--brand)"><div><div class="nm">Parent pickup</div><div class="muted">Show this code to pick up</div></div><div class="code">${group[0].code}</div></div>`;
  });
}

Screens.checkin = () => {
  const c = S.church();
  if (!S.on("checkin")) return { redirect: "home" };
  if (!S.isMember()) return { title: "Check in", back: "home", body: needMember("check in your kids") };
  if (!S.can("use.checkin")) return { title: "Check in", back: "home", body: noAccess("kids check-in") };
  const services = upcomingServices(c, 4);
  const active = myActiveCheckins();
  const list = kids();
  const only = checkinOnly; checkinOnly = null;
  return {
    title: "Check in", back: "home",
    body: html`
      ${active.length ? html`<section class="sec" style="margin-top:16px"><h2 class="sec-head">Checked in</h2>${kidTags(active)}
        <p class="faint">Show these at the kids check-in desk. Staff match the code before your kids leave.</p></section>` : ""}

      <section class="sec" style="margin-top:16px"><h2 class="sec-head">Check in kids</h2>
      ${!list.length ? html`<div class="panel"><p style="margin-top:0">Add your kids once, then check them in from your phone before you get to church.</p><a class="btn" href="#household">${icon("plus")}Add your kids</a></div>`
        : !services.length ? html`<div class="panel">${empty("No services are scheduled.")}</div>`
        : html`<form data-form="checkin" class="panel" novalidate>
          <fieldset class="field" style="border:0;padding:0;margin-top:0"><legend style="font-weight:700;margin-bottom:6px">Service</legend>
            ${services.map((s, i) => html`<label class="check" style="padding:6px 0"><input type="radio" name="service" value="${serviceKey(s)}" ${attr(i === 0, "checked")}><span>${serviceName(s)}${s.live ? html` <span class="tag warn">Now</span>` : ""}</span></label>`)}</fieldset>
          <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Who's coming?</legend>
            ${list.map((k) => { const room = roomFor(c, k.birth); return html`<label class="check"><input type="checkbox" name="kids" value="${k.id}" ${attr(!only || only === k.id, "checked")}><span><b>${k.name}</b><br><span class="faint">${room.name}${ageFrom(k.birth) != null ? `, age ${ageFrom(k.birth)}` : ""}${k.notes ? `. ${k.notes}` : ""}</span></span></label>`; })}</fieldset>
          <button class="btn block">Check in</button>
          <p class="faint" style="margin-bottom:0"><a href="#household">Edit your household</a>${S.on("parents") ? html`, or open the <a href="#parents">parent portal</a>` : ""}</p>
        </form>`}
      </section>

      <section class="sec"><div class="rows"><a class="row" href="#serve"><span class="lead-ic">${icon("hand")}</span><span class="body"><span class="t">Serving today?</span><span class="s">Check in for your volunteer team</span></span>${icon("chev")}</a></div></section>`,
  };
};
function findService(key, count = 6) { return upcomingServices(S.church(), count, "all").find((s) => serviceKey(s) === key); }
function checkInKids(ids, key) {
  const c = S.church(), me = S.me();
  const svc = findService(key);
  if (!svc) return { error: "Choose a service." };
  const existing = S.list("checkins").filter((x) => x.by === me.id && x.serviceKey === key && !x.out);
  const code = existing[0]?.code || securityCode();
  let added = 0;
  ids.forEach((id) => {
    const k = me.household.find((p) => p.id === id);
    if (!k || existing.some((x) => x.childId === id)) return;
    const rec = S.add("checkins", { by: me.id, parentName: me.name, childId: id, childName: k.name, notes: k.notes || "", room: roomFor(c, k.birth).name, code, serviceKey: key, serviceName: serviceName(svc), locationId: svc.location?.id || null, at: new Date().toISOString(), out: null });
    emit("checkin.created", { child: rec.childName, room: rec.room, service: rec.serviceName, parent: me.name });
    added++;
  });
  return { added, code };
}
Forms.checkin = (d, f, fd) => {
  const ids = fd.getAll("kids");
  if (!ids.length) return formError(f, "Choose at least one child.");
  const r = checkInKids(ids, d.service);
  if (r.error) return formError(f, r.error);
  toast(r.added ? `Checked in. Pickup code ${r.code}` : "Already checked in");
  render();
};
function checkOut(records, by) {
  const t = new Date().toISOString();
  records.forEach((x) => { x.out = t; x.outBy = by; emit("checkin.completed", { child: x.childName, room: x.room, service: x.serviceName, by }); });
  S.save();
}

Screens.serve = () => {
  const c = S.church();
  if (!S.isMember()) return { title: "Serve", back: "checkin", body: needMember("check in to serve") };
  const services = upcomingServices(c, 4);
  const mine = S.list("serving").filter((s) => s.by === S.me().id).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  return {
    title: "Check in to serve", back: "checkin",
    body: html`<form data-form="serve" class="panel" style="margin-top:16px" novalidate>
        <fieldset class="field" style="border:0;padding:0;margin-top:0"><legend style="font-weight:700;margin-bottom:6px">Team</legend>
          <div class="radios">${c.teams.map((t, i) => html`<label><input type="radio" name="team" value="${t}" ${attr(i === 0, "checked")}><span>${t}</span></label>`)}</div></fieldset>
        <label class="field"><span>Service</span><select name="service">${services.map((s) => html`<option value="${serviceKey(s)}">${serviceName(s)}</option>`)}</select></label>
        <button class="btn block">Check in</button></form>
      ${mine.length ? html`<section class="sec"><h2 class="sec-head">Your recent serving</h2><div class="rows">${mine.map((s) => html`<div class="row"><span class="lead-ic">${icon("check")}</span><span class="body"><span class="t">${s.team}</span><span class="s">${s.serviceName}</span></span></div>`)}</div></section>` : ""}`,
  };
};
Forms.serve = (d) => {
  const svc = findService(d.service);
  if (S.list("serving").some((s) => s.by === S.me().id && s.serviceKey === d.service && s.team === d.team)) { toast("You're already checked in"); return; }
  S.add("serving", { by: S.me().id, name: S.me().name, team: d.team, serviceKey: d.service, serviceName: svc ? serviceName(svc) : d.service, at: new Date().toISOString() });
  toast(`Checked in with ${d.team}. Thanks for serving!`); render();
};

Screens.household = () => {
  const people = S.me().household;
  return {
    title: "Your household", back: "me",
    body: html`<p class="muted" style="margin-top:16px">Kids added here can be registered for classes and events and checked in at any church you belong to. Care notes print on their name tag.</p>
      <div class="rows">${people.length ? people.map((p) => html`<button class="row" data-act="person-edit" data-id="${p.id}">${avatar(p)}<span class="body"><span class="t">${p.name}</span><span class="s">${p.kind === "child" ? `Child${ageFrom(p.birth) != null ? `, age ${ageFrom(p.birth)}` : ""}` : "Adult"}${p.notes ? `. ${p.notes}` : ""}</span></span>${icon("edit")}</button>`)
        : empty("Nobody added yet.")}</div>
      <div class="btns"><button class="btn" data-act="person-edit">${icon("plus")}Add someone</button>${kids().length && S.on("parents") ? html`<a class="btn ghost" href="#parents">Parent portal</a>` : ""}</div>`,
  };
};
Actions["person-edit"] = (el) => {
  const p = S.me().household.find((x) => x.id === el.dataset.id) || { kind: "child" };
  openSheet(p.id ? `Edit ${p.name}` : "Add to your household", html`<form data-form="person-save" novalidate><input type="hidden" name="id" value="${p.id || ""}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${p.name || ""}" required maxlength="60"></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">This person is</legend><div class="radios">
      <label><input type="radio" name="kind" value="child" ${attr(p.kind === "child", "checked")}><span>A child</span></label>
      <label><input type="radio" name="kind" value="adult" ${attr(p.kind === "adult", "checked")}><span>An adult</span></label></div></fieldset>
    <label class="field"><span>Birthday</span><input type="date" name="birth" value="${p.birth || ""}" max="${isoDay(new Date())}"><small>Used to find the right classes and kids room.</small></label>
    <label class="field"><span>Allergies or care notes</span><input type="text" name="notes" value="${p.notes || ""}" maxlength="80" placeholder="Peanut allergy"></label>
    <div class="btns"><button class="btn">${p.id ? "Save" : "Add"}</button>${p.id ? html`<button type="button" class="btn danger" data-act="person-remove" data-id="${p.id}">Remove</button>` : ""}</div></form>`);
};
Forms["person-save"] = (d, f) => {
  if (!d.name) return formError(f, "Enter a name.");
  const list = S.me().household;
  const rec = { name: d.name, kind: d.kind || "child", birth: d.birth || "", notes: d.notes || "" };
  if (d.id) Object.assign(list.find((x) => x.id === d.id), rec); else list.push({ id: uid(), ...rec });
  S.save(); closeSheet(); toast(d.id ? "Saved" : `${d.name} added`); render();
};
Actions["person-remove"] = (el) => { S.me().household = S.me().household.filter((x) => x.id !== el.dataset.id); S.save(); closeSheet(); render(); };
