// ---------- Kids check-in, volunteer check-in, household ----------

const kids = () => S.me().household.filter((p) => p.kind === "child");
/** A family's people: your own household, or another member's family (kiosk and staff use these). */
const familyOf = (userId) => (userId === S.me().id ? S.me().household : S.user(userId)?.family) || [];
const pickupsOf = (userId) => (userId === S.me().id ? S.me().pickups : S.user(userId)?.pickups) || [];
/** Allergy first and loud, then any other care notes. */
const careHtml = (k) => html`${k.allergies ? html`<b class="allergy">${icon("info")}Allergy: ${k.allergies}</b>` : ""}${k.notes ? html`<span class="care">${k.notes}</span>` : ""}`;
const myActiveCheckins = () => {
  const today = isoDay(new Date());
  return S.list("checkins").filter((c) => c.by === S.me().id && !c.out && c.serviceKey.slice(0, 10) >= today).sort((a, b) => a.serviceKey.localeCompare(b.serviceKey));
};
let checkinOnly = null; // set by the parent portal to pre-select one child

function kidTags(active) {
  return [...new Set(active.map((a) => a.serviceKey))].map((key) => {
    const group = active.filter((a) => a.serviceKey === key);
    return html`<p class="faint" style="margin:10px 0 6px">${group[0].serviceName}</p>${group.map((a) => html`<div class="kidtag"><div><div class="nm">${a.childName}</div><div class="muted">${a.room}</div>${careHtml(a)}</div><div class="code" aria-label="Security code ${a.code.split("").join(" ")}">${a.code}</div></div>`)}
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
            ${list.map((k) => { const room = roomFor(c, k.birth); return html`<label class="check"><input type="checkbox" name="kids" value="${k.id}" ${attr(!only || only === k.id, "checked")}><span><b>${k.name}</b><br><span class="faint">${room.name}${ageFrom(k.birth) != null ? `, age ${ageFrom(k.birth)}` : ""}</span>${careHtml(k)}</span></label>`; })}</fieldset>
          <button class="btn block">Check in</button>
          <p class="faint" style="margin-bottom:0"><a href="#household">Edit your household</a>${S.on("parents") ? html`, or open the <a href="#parents">parent portal</a>` : ""}</p>
        </form>`}
      </section>

      <section class="sec"><div class="rows"><a class="row" href="#serve"><span class="lead-ic">${icon("hand")}</span><span class="body"><span class="t">Serving today?</span><span class="s">Check in for your volunteer team</span></span>${icon("chev")}</a></div></section>`,
  };
};
function findService(key, count = 6) { return upcomingServices(S.church(), count, "all").find((s) => serviceKey(s) === key); }
/** Checks in kids from one family. via: "phone" (a parent's own phone), "kiosk" or "staff". */
function checkInKids(ids, key, familyId = S.me().id, via = "phone") {
  const c = S.church(), parent = S.user(familyId), fam = familyOf(familyId);
  const svc = findService(key, 10);
  if (!svc) return { error: "Choose a service." };
  const existing = S.list("checkins").filter((x) => x.by === familyId && x.serviceKey === key && !x.out);
  const code = existing[0]?.code || securityCode();
  const added = [];
  ids.forEach((id) => {
    const k = fam.find((p) => p.id === id);
    if (!k || existing.some((x) => x.childId === id)) return;
    const rec = S.add("checkins", { by: familyId, parentName: parent?.name || "Parent", childId: id, childName: k.name, birth: k.birth || "", allergies: k.allergies || "", notes: k.notes || "", room: roomFor(c, k.birth).name, code, serviceKey: key, serviceName: serviceName(svc), locationId: svc.location?.id || null, at: new Date().toISOString(), out: null, via });
    emit("checkin.created", { child: rec.childName, room: rec.room, service: rec.serviceName, parent: rec.parentName, allergies: rec.allergies });
    added.push(rec);
  });
  return { added: added.length, records: [...existing, ...added], code };
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
      <div class="rows">${people.length ? people.map((p) => html`<button class="row" data-act="person-edit" data-id="${p.id}">${avatar(p)}<span class="body"><span class="t">${p.name}</span><span class="s">${p.kind === "child" ? `Child${ageFrom(p.birth) != null ? `, age ${ageFrom(p.birth)}` : ""}` : "Adult"}</span>${careHtml(p)}</span>${icon("edit")}</button>`)
        : empty("Nobody added yet.")}</div>
      <div class="btns"><button class="btn" data-act="person-edit">${icon("plus")}Add someone</button>${kids().length && S.on("parents") ? html`<a class="btn ghost" href="#parents">Parent portal</a>` : ""}</div>
      ${kids().length ? html`<section class="sec"><div class="sec-head"><h2>Who can pick up your kids</h2><button class="btn ghost sm" data-act="pickup-edit">${icon("plus")}Add</button></div>
        <p class="faint" style="margin-top:-4px">You can always pick up your own kids. Add anyone else, with a photo, so staff can check who they're handing your kids to.</p>
        <div class="rows">${(S.me().pickups || []).length ? S.me().pickups.map((p) => html`<button class="row" data-act="pickup-edit" data-id="${p.id}">${pickupFace(p)}<span class="body"><span class="t">${p.name}</span><span class="s">${[p.relation, p.phone].filter(Boolean).join(", ")}</span></span>${icon("edit")}</button>`) : empty("Nobody else added.")}</div></section>` : ""}`,
  };
};
const pickupFace = (p, cls = "") => p.photo ? html`<img class="face ${cls}" src="${p.photo}" alt="">` : avatar(p, cls);
Actions["pickup-edit"] = (el) => {
  const p = (S.me().pickups || []).find((x) => x.id === el.dataset.id) || {};
  openSheet(p.id ? `Edit ${p.name}` : "Someone who can pick up", html`<form data-form="pickup-save" novalidate><input type="hidden" name="id" value="${p.id || ""}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${p.name || ""}" required maxlength="60"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Relationship</span><input type="text" name="relation" value="${p.relation || ""}" maxlength="30" placeholder="Grandmother"></label>
      <label class="field"><span>Phone</span><input type="tel" name="phone" value="${p.phone || ""}" maxlength="20"></label></div>
    ${imageField("photo", "Photo", p.photo, "A clear photo of their face. Staff see it at pickup.", 480)}
    <div class="btns"><button class="btn">${p.id ? "Save" : "Add"}</button>${p.id ? html`<button type="button" class="btn danger" data-act="pickup-remove" data-id="${p.id}">Remove</button>` : ""}</div></form>`);
};
Forms["pickup-save"] = (d, f) => {
  if (!d.name) return formError(f, "Enter their name.");
  const me = S.me(); me.pickups ||= [];
  const rec = { name: d.name, relation: d.relation, phone: d.phone, photo: d.photo };
  if (d.id) Object.assign(me.pickups.find((x) => x.id === d.id), rec); else me.pickups.push({ id: uid(), ...rec });
  S.save(); closeSheet(); toast("Saved"); render();
};
Actions["pickup-remove"] = (el) => { S.me().pickups = S.me().pickups.filter((x) => x.id !== el.dataset.id); S.save(); closeSheet(); render(); };
Actions["person-edit"] = (el) => {
  const p = S.me().household.find((x) => x.id === el.dataset.id) || { kind: "child" };
  openSheet(p.id ? `Edit ${p.name}` : "Add to your household", html`<form data-form="person-save" novalidate><input type="hidden" name="id" value="${p.id || ""}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${p.name || ""}" required maxlength="60"></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">This person is</legend><div class="radios">
      <label><input type="radio" name="kind" value="child" ${attr(p.kind === "child", "checked")}><span>A child</span></label>
      <label><input type="radio" name="kind" value="adult" ${attr(p.kind === "adult", "checked")}><span>An adult</span></label></div></fieldset>
    <label class="field"><span>Birthday</span><input type="date" name="birth" value="${p.birth || ""}" max="${isoDay(new Date())}"><small>Used to find the right classes and kids room.</small></label>
    <label class="field"><span>Allergies</span><input type="text" name="allergies" value="${p.allergies || ""}" maxlength="60" placeholder="Peanuts, tree nuts"><small>Printed in bold on name tags and shown to teachers.</small></label>
    <label class="field"><span>Other care notes</span><input type="text" name="notes" value="${p.notes || ""}" maxlength="80" placeholder="Has an inhaler in her bag"></label>
    <div class="btns"><button class="btn">${p.id ? "Save" : "Add"}</button>${p.id ? html`<button type="button" class="btn danger" data-act="person-remove" data-id="${p.id}">Remove</button>` : ""}</div></form>`);
};
Forms["person-save"] = (d, f) => {
  if (!d.name) return formError(f, "Enter a name.");
  const list = S.me().household;
  const rec = { name: d.name, kind: d.kind || "child", birth: d.birth || "", allergies: d.allergies || "", notes: d.notes || "" };
  if (d.id) Object.assign(list.find((x) => x.id === d.id), rec); else list.push({ id: uid(), ...rec });
  S.save(); closeSheet(); toast(d.id ? "Saved" : `${d.name} added`); render();
};
Actions["person-remove"] = (el) => { S.me().household = S.me().household.filter((x) => x.id !== el.dataset.id); S.save(); closeSheet(); render(); };
