// ---------- Kids check-in kiosk and name tags ----------
// A shared tablet at the kids area. Families find themselves by phone number or last name, tap who's here,
// and get a name tag for each child plus a pickup tag with the same code. First-time families add themselves
// as guests, which also starts newcomer follow-up. Staff release kids against the family's pickup list.

const LABEL_SIZES = {
  "4x2": ["4 × 2 in (Dymo 30256, Brother DK-1202)", "4in", "2in"],
  "2.25x1.25": ["2.25 × 1.25 in (Dymo 30334)", "2.25in", "1.25in"],
  "62x29": ["62 × 29 mm (Brother DK-11209)", "62mm", "29mm"],
};
const kiosk = { step: "setup", serviceKey: "", size: "4x2", pin: "", q: "", family: null, picked: [], records: [], printed: false, touched: 0 };
const digits = (s) => String(s || "").replace(/\D/g, "");
const firstName = (n) => String(n || "").split(" ")[0];

/** Families this church can check in: members with kids, and guests who checked in here before. */
function kioskFamilies() {
  const c = S.church();
  const ids = new Set([...S.members().map((m) => m.userId), ...Object.values(S.state.users).filter((u) => u.guestOf?.includes(c.id)).map((u) => u.id)]);
  return [...ids].map((id) => S.user(id)).filter((u) => u && familyOf(u.id).some((p) => p.kind === "child"));
}
function kioskSearch(q) {
  const d = digits(q), words = q.toLowerCase().replace(/\d/g, "").split(/\s+/).filter(Boolean);
  if (d.length >= 4) return kioskFamilies().filter((u) => digits(u.phone).endsWith(d) || (d.length >= 7 && digits(u.phone).includes(d))).slice(0, 8);
  if (!words.length) return [];
  return kioskFamilies().filter((u) => {
    const hay = [u.name, typeof u.household === "string" ? u.household : "", ...familyOf(u.id).map((p) => p.name)].join(" ").toLowerCase().split(/[\s,]+/);
    return words.every((w) => hay.some((x) => x.startsWith(w)));
  }).slice(0, 8);
}
function kioskResults() {
  const q = kiosk.q.trim();
  if (!q) return html`<p class="kiosk-hint">Type the last four digits of your phone number, or your last name.</p>`;
  if (/^\d{1,3}$/.test(q)) return html`<p class="kiosk-hint">Keep going: ${4 - q.length} more ${q.length === 3 ? "digit" : "digits"}.</p>`;
  const hits = kioskSearch(q);
  if (!hits.length) return html`<p class="kiosk-hint">We couldn't find you. Try your phone number or last name, or check in as a guest below.</p>`;
  return html`<div class="kiosk-fams">${hits.map((u) => html`<button class="kiosk-fam" data-act="kiosk-pick" data-id="${u.id}">
    <span class="t">${typeof u.household === "string" && u.household !== u.name ? u.household : `${u.name}'s family`}</span>
    <span class="s">${listJoin(familyOf(u.id).filter((p) => p.kind === "child").map((p) => firstName(p.name)))}${u.phone ? `. Phone ending ${digits(u.phone).slice(-4)}` : ""}</span>${icon("chev")}</button>`)}</div>`;
}

// ----- Name tags -----
function labelsHtml(records) {
  if (!records.length) return "";
  const r0 = records[0], when = r0.serviceKey.slice(0, 10), time = r0.serviceKey.slice(11, 16);
  const day = fmt(fromIsoDay(when), { month: "short", day: "numeric" }), svc = timeLabel(time);
  return html`${records.map((r) => html`<div class="label kid-label">
      <div class="lb-row"><div class="lb-name">${firstName(r.childName)}<span>${r.childName.split(" ").slice(1).join(" ")}</span></div><div class="lb-code">${r.code}</div></div>
      ${r.allergies ? html`<div class="lb-alert">Allergy: ${r.allergies}</div>` : ""}
      ${r.notes ? html`<div class="lb-note">${r.notes}</div>` : ""}
      <div class="lb-foot"><b>${r.room}</b><span>${day}, ${svc}</span></div></div>`)}
    <div class="label pickup-label">
      <div class="lb-row"><div class="lb-name">Pickup tag<span>${r0.parentName}</span></div><div class="lb-code">${r0.code}</div></div>
      <div class="lb-kids">${listJoin(records.map((r) => firstName(r.childName)))}</div>
      <div class="lb-foot"><span>Show this tag to pick up.</span><span>${day}, ${svc}</span></div></div>`;
}
function printLabels(records) {
  if (!records.length) return;
  if (IN_PREVIEW) { toast("Tags print once the app is on your own website"); return; }
  const [, w, h] = LABEL_SIZES[kiosk.size] || LABEL_SIZES["4x2"];
  let page = $("#label-page");
  if (!page) { page = document.createElement("style"); page.id = "label-page"; document.head.appendChild(page); }
  page.textContent = `@page { size: ${w} ${h}; margin: 0; } @media print { #print-labels .label { width: ${w}; height: ${h}; } }`;
  $("#print-labels")?.remove();
  const box = document.createElement("div"); box.id = "print-labels"; box.innerHTML = flat(labelsHtml(records));
  document.body.appendChild(box); document.body.classList.add("print-labels");
  const done = () => { box.remove(); document.body.classList.remove("print-labels"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  try { window.print(); } catch { done(); toast("Printing isn't available on this device"); }
}

// ----- The kiosk -----
Screens.kiosk = () => {
  const blocked = guard("checkin.station"); if (blocked) return blocked;
  const c = S.church(), dev = thisDevice();
  // A paired kiosk starts itself: the service happening now or next at its location, with its own label size and exit code.
  if (dev && (kiosk.step === "setup" || !findService(kiosk.serviceKey, 10))) {
    const next = upcomingServices(c, 8, dev.locationId || "all")[0];
    if (next) Object.assign(kiosk, { serviceKey: serviceKey(next), size: dev.settings?.labelSize || "4x2", pin: "", step: "find", q: "", family: null, picked: [], records: [] });
  }
  const svc = findService(kiosk.serviceKey, 10);
  if (kiosk.step === "setup" || !svc) {
    if (dev) return { page: html`<div class="loading">${S.church().name}: no services are scheduled${dev.locationId ? ` at ${locName(dev.locationId)}` : ""} this week.${deviceExitBtn()}</div>` };
    kiosk.step = "setup";
    const services = upcomingServices(c, 8, "all");
    return {
      title: "Check-in kiosk", back: "admin-checkin",
      body: html`<form data-form="kiosk-start" class="panel" style="margin-top:16px" novalidate>
        <p style="margin-top:0">Turn this tablet into a self check-in station for families at the kids area. Parents find their family, tap who's here and get name tags.</p>
        ${services.length ? html`<label class="field"><span>Service</span><select name="service">${services.map((s) => html`<option value="${serviceKey(s)}" ${attr(serviceKey(s) === kiosk.serviceKey, "selected")}>${serviceName(s)}${s.live ? " (now)" : ""}</option>`)}</select></label>` : html`<p class="err">Add service times to a location first.</p>`}
        <label class="field"><span>Label size</span><select name="size">${Object.entries(LABEL_SIZES).map(([k, [l]]) => html`<option value="${k}" ${attr(k === kiosk.size, "selected")}>${l}</option>`)}</select><small>Tags print to the label printer connected to this tablet or computer.</small></label>
        <label class="field"><span>Exit code (optional)</span><input type="text" name="pin" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="4 to 6 digits"><small>Asked for before anyone can leave the kiosk.</small></label>
        <button class="btn block" ${attr(!services.length, "disabled")}>Start the kiosk</button></form>
        ${IN_PREVIEW ? demoNote("Try it with the last four digits 0142 (the Bell family) or the last name Alvarez.") : ""}`,
    };
  }
  const already = (fid) => S.list("checkins").filter((x) => x.by === fid && x.serviceKey === kiosk.serviceKey && !x.out);
  let main;
  if (kiosk.step === "find") {
    main = html`<h1>Welcome! Let's check in your kids.</h1>
      <form data-form="kiosk-find" class="kiosk-search" autocomplete="off" novalidate><label class="sr" for="kq">Phone number or last name</label>
        <input id="kq" name="q" value="${kiosk.q}" placeholder="Phone or last name" data-input="kiosk-q" autocomplete="off" autocapitalize="words" spellcheck="false"></form>
      <div class="keypad" aria-label="Number pad">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((k) => html`<button type="button" data-act="kiosk-key" data-k="${k}" aria-label="${k === "back" ? "Delete" : k === "clear" ? "Clear" : k}">${k === "back" ? icon("back") : k === "clear" ? "Clear" : k}</button>`)}</div>
      <div id="kiosk-results" aria-live="polite">${kioskResults()}</div>
      <button class="btn ghost kiosk-wide" data-act="kiosk-guest">${icon("plus")}First time here? Check in as a guest</button>`;
  } else if (kiosk.step === "kids") {
    const fam = familyOf(kiosk.family).filter((p) => p.kind === "child"), inIds = already(kiosk.family).map((x) => x.childId);
    main = html`<h1>Who's here today?</h1><p class="kiosk-sub">${S.userName(kiosk.family)}'s family. Tap to choose.</p>
      <div class="kid-tiles">${fam.map((k) => { const done = inIds.includes(k.id), on = kiosk.picked.includes(k.id), age = ageFrom(k.birth);
        return html`<button class="kid-tile ${on ? "on" : ""}" data-act="kiosk-kid" data-id="${k.id}" aria-pressed="${on}" ${attr(done, "disabled")}><span class="tick">${icon("check")}</span>${avatar(k, "lg")}
          <span class="nm">${firstName(k.name)}</span><span class="rm">${done ? "Already checked in" : `${roomFor(S.church(), k.birth).name}${age != null ? `, age ${age}` : ""}`}</span>
          ${k.allergies ? html`<span class="allergy">${icon("info")}${k.allergies}</span>` : ""}</button>`; })}</div>
      <div class="kiosk-actions"><button class="btn ghost" data-act="kiosk-reset">Back</button><button class="btn" data-act="kiosk-checkin" ${attr(!kiosk.picked.length, "disabled")}>${kiosk.picked.length ? `Check in ${plural(kiosk.picked.length, "child", "children")}` : "Choose who's here"}</button></div>
      ${inIds.length ? html`<button class="linkish kiosk-wide" data-act="kiosk-reprint">Print tags again for kids already checked in</button>` : ""}`;
  } else if (kiosk.step === "guest") {
    const kidRow = (i) => html`<fieldset class="guest-kid" ${attr(i > 0, "hidden")} data-row="${i}"><legend>Child ${i + 1}</legend>
      <label class="field"><span>Name</span><input type="text" name="kid${i}" maxlength="60" autocapitalize="words"></label>
      ${birthdayField(`birth${i}`, "Birthday")}
      <label class="field"><span>Allergies</span><input type="text" name="allergy${i}" maxlength="60" placeholder="None"></label></fieldset>`;
    main = html`<h1>Welcome! We're glad you're here.</h1><p class="kiosk-sub">Tell us a little about your family. It only takes a minute.</p>
      <form data-form="kiosk-guest" class="kiosk-form" novalidate>
        <label class="field"><span>Your name</span><input type="text" name="name" required maxlength="60" autocomplete="off" autocapitalize="words"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Phone</span><input type="tel" name="phone" required maxlength="20" autocomplete="off"></label>
          <label class="field"><span>Email (optional)</span><input type="email" name="email" maxlength="80" autocomplete="off"></label></div>
        ${[0, 1, 2, 3, 4].map(kidRow)}
        <button type="button" class="btn ghost sm" data-act="kiosk-more">${icon("plus")}Add another child</button>
        <div class="kiosk-actions"><button type="button" class="btn ghost" data-act="kiosk-reset">Cancel</button><button class="btn">Check in</button></div></form>`;
  } else {
    const recs = kiosk.records, alerts = recs.filter((r) => r.allergies);
    main = html`<div class="kiosk-done"><span class="big-check">${icon("check")}</span><h1>You're checked in!</h1>
      <p class="kiosk-sub">Your pickup code is <b class="code">${recs[0]?.code}</b>. Keep the pickup tag. You'll need it to pick up.</p>
      ${alerts.length ? html`<p class="allergy-note">${icon("info")}We've let ${listJoin([...new Set(alerts.map((r) => r.room))])} know about ${listJoin(alerts.map((r) => `${firstName(r.childName)}'s allergy (${r.allergies})`))}.</p>` : ""}
      <div class="label-sheet">${labelsHtml(recs)}</div>
      <div class="kiosk-actions"><button class="btn ghost" data-act="kiosk-print">${icon("download")}Print tags</button><button class="btn" data-act="kiosk-reset">Done</button></div></div>`;
  }
  return {
    kiosk: true,
    page: html`<div class="kiosk">
      <header class="kiosk-head">${churchMark(c, 46)}<div class="kh-t"><b>${c.name}</b><span>${serviceName(svc)}</span></div><button class="icon-btn" data-act="${dev ? "device-exit" : "kiosk-exit"}" aria-label="Exit the kiosk">${icon("lock")}</button></header>
      <main class="kiosk-main">${main}</main></div>`,
    after() {
      kiosk.touched = Date.now();
      if (kiosk.step === "find") $("#kq")?.focus({ preventScroll: true });
      if (kiosk.step === "done" && !kiosk.printed) { kiosk.printed = true; if (!IN_PREVIEW) setTimeout(() => printLabels(kiosk.records), 300); }
    },
  };
};
Forms["kiosk-start"] = (d, f) => {
  if (d.pin && !/^\d{4,6}$/.test(d.pin)) return formError(f, "The exit code should be 4 to 6 digits.");
  Object.assign(kiosk, { serviceKey: d.service, size: d.size, pin: d.pin, step: "find", q: "", family: null, picked: [], records: [] });
  render();
};
Inputs["kiosk-q"] = (el) => { kiosk.q = el.value; kiosk.touched = Date.now(); $("#kiosk-results").innerHTML = flat(kioskResults()); };
Forms["kiosk-find"] = () => { const hits = kioskSearch(kiosk.q); if (hits.length === 1) pickFamily(hits[0].id); };
Actions["kiosk-key"] = (el) => {
  const k = el.dataset.k, inp = $("#kq");
  kiosk.q = k === "clear" ? "" : k === "back" ? kiosk.q.slice(0, -1) : kiosk.q + k;
  inp.value = kiosk.q; Inputs["kiosk-q"](inp);
};
function pickFamily(id) {
  const inIds = S.list("checkins").filter((x) => x.by === id && x.serviceKey === kiosk.serviceKey && !x.out).map((x) => x.childId);
  Object.assign(kiosk, { step: "kids", family: id, picked: familyOf(id).filter((p) => p.kind === "child" && !inIds.includes(p.id)).map((p) => p.id) });
  render();
}
Actions["kiosk-pick"] = (el) => pickFamily(el.dataset.id);
Actions["kiosk-kid"] = (el) => { const id = el.dataset.id; kiosk.picked = kiosk.picked.includes(id) ? kiosk.picked.filter((x) => x !== id) : [...kiosk.picked, id]; render(); };
Actions["kiosk-checkin"] = () => {
  const r = checkInKids(kiosk.picked, kiosk.serviceKey, kiosk.family, "kiosk");
  if (r.error) { toast(r.error); return; }
  Object.assign(kiosk, { step: "done", records: r.records, printed: false }); render();
};
Actions["kiosk-reprint"] = () => {
  const recs = S.list("checkins").filter((x) => x.by === kiosk.family && x.serviceKey === kiosk.serviceKey && !x.out);
  Object.assign(kiosk, { step: "done", records: recs, printed: false }); render();
};
Actions["kiosk-print"] = () => printLabels(kiosk.records);
Actions["kiosk-reset"] = () => { Object.assign(kiosk, { step: "find", q: "", family: null, picked: [], records: [] }); render(); };
Actions["kiosk-guest"] = () => { kiosk.step = "guest"; render(); };
Actions["kiosk-more"] = (el) => { const next = $(".guest-kid[hidden]"); if (next) { next.hidden = false; $("input", next).focus(); } if (!$(".guest-kid[hidden]")) el.remove(); };
Forms["kiosk-guest"] = (d, f) => {
  for (const i of [0, 1, 2, 3, 4]) { const bad = d[`kid${i}`] && birthdayProblem(f, `birth${i}`); if (bad) return formError(f, `${d[`kid${i}`]}'s birthday: ${bad}`); }
  if (!d.name) return formError(f, "Enter your name.");
  if (digits(d.phone).length < 7) return formError(f, "Enter a phone number we can reach you at.");
  const c = S.church(), last = d.name.trim().split(/\s+/).slice(-1)[0];
  const family = [0, 1, 2, 3, 4].filter((i) => d[`kid${i}`]).map((i) => {
    const n = d[`kid${i}`].trim();
    return { id: uid(), name: n.includes(" ") ? n : `${n} ${last}`, kind: "child", birth: d[`birth${i}`] || "", allergies: /^(none|no|n\/a)$/i.test(d[`allergy${i}`] || "") ? "" : d[`allergy${i}`] || "", notes: "" };
  });
  if (!family.length) return formError(f, "Add at least one child.");
  // Same phone as a family already here: add to them instead of making a duplicate.
  const known = kioskFamilies().find((u) => digits(u.phone) === digits(d.phone)) || Object.values(S.state.users).find((u) => u.guestOf && digits(u.phone) === digits(d.phone));
  let id;
  if (known) {
    id = known.id; const fam = known.id === S.me().id ? S.me().household : (known.family ||= []);
    family.forEach((k) => { if (!fam.some((p) => p.name.toLowerCase() === k.name.toLowerCase())) fam.push(k); });
    if (known.guestOf && !known.guestOf.includes(c.id)) known.guestOf.push(c.id);
  } else {
    id = `g-${uid()}`;
    S.state.users[id] = { id, name: d.name, household: `The ${last} family`, phone: d.phone, email: d.email || "", family, pickups: [], guestOf: [c.id], firstVisit: new Date().toISOString() };
    startFollowup({ personId: id, name: d.name, phone: d.phone, email: d.email || "", source: "kiosk", reason: `First visit, checked in ${listJoin(family.map((k) => firstName(k.name)))}` });
  }
  S.save();
  const fam = familyOf(id), ids = family.map((k) => fam.find((p) => p.name.toLowerCase() === k.name.toLowerCase())?.id).filter(Boolean);
  const r = checkInKids(ids, kiosk.serviceKey, id, "kiosk");
  if (r.error) return formError(f, r.error);
  Object.assign(kiosk, { family: id, step: "done", records: r.records, printed: false }); render();
};
Actions["kiosk-exit"] = () => {
  if (!kiosk.pin) { openSheet("Leave the kiosk?", html`<div class="btns" style="margin-top:0"><button class="btn" data-act="kiosk-leave">Leave the kiosk</button><button class="btn ghost" data-act="close-sheet">Stay</button></div>`); return; }
  openSheet("Enter the exit code", html`<form data-form="kiosk-unlock" novalidate><label class="field"><span class="sr">Exit code</span><input type="password" name="pin" inputmode="numeric" maxlength="6" autocomplete="off"></label><button class="btn block">Leave the kiosk</button></form>`);
};
Forms["kiosk-unlock"] = (d, f) => { if (d.pin !== kiosk.pin) return formError(f, "That's not the exit code."); Actions["kiosk-leave"](); };
Actions["kiosk-leave"] = () => { closeSheet(true); Object.assign(kiosk, { step: "setup", family: null, picked: [], records: [], q: "" }); go("admin-checkin"); };
// Go back to the start if a family walks away part way through.
setInterval(() => {
  if (!document.body.classList.contains("kiosk-mode") || kiosk.step === "find" || kiosk.step === "setup" || $("#scrim")) return;
  if (Date.now() - kiosk.touched > (kiosk.step === "done" ? 45e3 : 120e3)) Actions["kiosk-reset"]();
}, 5000);
document.addEventListener("pointerdown", () => { if (document.body.classList.contains("kiosk-mode")) kiosk.touched = Date.now(); }, true);

// ----- Staff release: check the person picking up against the family's list -----
function releaseSheet(hits) {
  const fid = hits[0].by, parent = S.user(fid);
  const people = [{ id: fid, name: parent?.name || hits[0].parentName, relation: "Parent", phone: parent?.phone || "" },
    ...familyOf(fid).filter((p) => p.kind === "adult").map((p) => ({ ...p, relation: "Family" })), ...pickupsOf(fid)];
  const ids = hits.map((h) => h.id).join(",");
  openSheet(`Pick up ${listJoin(hits.map((x) => firstName(x.childName)))}`, html`<p class="muted" style="margin-top:0">Code ${hits[0].code} matches. Release only to someone on this list.</p>
    ${hits.some((h) => h.allergies) ? html`<p class="allergy-note">${icon("info")}${listJoin(hits.filter((h) => h.allergies).map((h) => `${firstName(h.childName)}: ${h.allergies}`))}</p>` : ""}
    <div class="rows">${people.map((p) => html`<button class="row" data-act="release" data-ids="${ids}" data-name="${p.name}">${pickupFace(p, "lg")}<span class="body"><span class="t">${p.name}</span><span class="s">${[p.relation, p.phone].filter(Boolean).join(", ")}</span></span><span class="btn sm" aria-hidden="true">Release</span></button>`)}</div>
    <p class="faint">Someone else? Don't release the kids. Call ${parent?.name ? firstName(parent.name) : "the parent"}${parent?.phone ? ` at ${parent.phone}` : ""}.</p>`, { wide: true });
}
Actions["release"] = (el) => {
  const recs = el.dataset.ids.split(",").map((id) => S.get("checkins", id)).filter(Boolean);
  checkOut(recs, el.dataset.name); closeSheet(true);
  toast(`${listJoin(recs.map((r) => firstName(r.childName)))} picked up by ${el.dataset.name}`); render();
};
