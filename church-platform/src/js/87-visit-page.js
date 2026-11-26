// ---------- Plan your visit: a page for first-time guests that each church arranges from blocks ----------
// church.visitPage = { blocks: [{ id, type, hidden, ...fields }] }. Until a church changes it, a suggested page built
// from what the app already knows is shown: the campus and its service times, someone to meet, what a service is like,
// kids' check-in with the kiosks and rooms, the campus map, amenities, classes, the staff and what the church believes.
// #visit opens it in the app. #visit-<churchId> opens it for anyone, even without an account: the public page and the
// QR code under Admin, Plan your visit page link there. Staff arrange it under Admin, Plan your visit page: add, edit,
// hide, remove and reorder blocks, including the landing page's text, image, buttons, embedded page, events and giving.

const AMENITIES = [["coffee", "Free coffee and snacks"], ["wifi", "Free Wi-Fi"], ["parking", "Visitor parking near the doors"], ["accessparking", "Accessible parking"],
  ["accessible", "Wheelchair accessible"], ["elevator", "Elevator"], ["nursery", "Nursery for babies and toddlers"], ["kidsclasses", "Kids' classes during the service"],
  ["checkin", "Secure kids check-in"], ["lactation", "Nursing room"], ["hearing", "Hearing assistance"], ["translation", "Translation"], ["largeprint", "Large-print Bibles"],
  ["livestream", "Watch online"], ["resources", "Resource table"]];
const VISIT_BLOCKS = {
  welcome: { label: "Welcome", icon: "star", hint: "A greeting, with a photo", fields: [["title", "Headline"], ["text", "Message", "textarea"], ["image", "Photo (optional)", "image"]] },
  video: { label: "Welcome video or presentation", icon: "play", hint: "YouTube, Vimeo, a video file, or slides from Google Slides or Canva", fields: [["title", "Title"], ["url", "Link to the video or presentation", "url"], ["text", "A few words under it (optional)", "textarea"]] },
  campus: { label: "Your campus: times and directions", icon: "pin", hint: "Address, service times and directions for the campus they pick", fields: [["title", "Heading"], ["parking", "Parking and arriving (optional)", "textarea"], ["notes", "Anything else about the campus (optional)", "textarea"]] },
  contact: { label: "Someone to meet you", icon: "people", hint: "A person who welcomes visitors, with a photo and ways to reach them", fields: [["title", "Heading"], ["userId", "Person", "person"], ["name", "Name, if they aren't in the app"], ["role", "Their role"], ["photo", "Photo", "image"], ["message", "A note from them", "textarea"], ["phone", "Phone (optional)"], ["email", "Email (optional)"]] },
  staff: { label: "Meet our staff", icon: "people", hint: "Photos and a little about each person", fields: [["title", "Heading"], ["text", "Introduction (optional)", "textarea"], ["people", "People", "staff"]] },
  expect: { label: "What to expect", icon: "clock", hint: "What a service is like: how long, the music, what to wear", fields: [["title", "Heading"], ["text", "Introduction (optional)", "textarea"], ["items", "Points", "pairs"]] },
  beliefs: { label: "What we believe", icon: "word", hint: "Your doctrine and core beliefs", fields: [["title", "Heading"], ["text", "Introduction (optional)", "textarea"], ["items", "Beliefs", "pairs"], ["url", "Full statement of faith (optional link)", "link"]] },
  classes: { label: "Classes and groups", icon: "door", hint: "What meets at their campus, and whether to sign up first", fields: [["title", "Heading"], ["text", "Requirements or notes (optional)", "textarea"]] },
  kids: { label: "Kids: registration and check-in", icon: "kid", hint: "How check-in and pickup work, with the kiosks and kids' rooms", fields: [["title", "Heading"], ["text", "How it works", "textarea"], ["kiosks", "List the check-in kiosks at their campus", "check"], ["rooms", "List the kids' rooms and ages", "check"]] },
  map: { label: "Campus map", icon: "pin", hint: "The map of their campus, with a link to find their way", fields: [["title", "Heading"]] },
  amenities: { label: "Amenities", icon: "check", hint: "Coffee, Wi-Fi, accessibility and more", fields: [["title", "Heading"], ["items", "What you have", "amenities"], ["custom", "Others, one per line (optional)", "textarea"]] },
  ...Object.fromEntries([["text", "A heading and words"], ["image", "A graphic or photo"], ["links", "Buttons to anywhere"], ["embed", "Another web page shown inside"], ["events", "What's coming up"], ["give", "A giving button"]]
    .map(([k, hint]) => [k, { ...BLOCK_TYPES[k], hint, generic: true }])),
};
const KIDS_HOW = "Before you come: add your children under My household in the app, with any allergies, so check-in takes seconds.\n\nWhen you arrive: check them in at a check-in kiosk or on your phone. A name tag prints for each child, and a matching pickup tag for you.\n\nAfter the service: bring your pickup tag to your child's room. We only release children to someone with the matching tag.";
const pairsText = (items) => (items || []).map((x) => `${x.title}\n${x.text}`).join("\n\n");
const pairsRead = (s) => String(s || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).slice(0, 30).map((p) => { const [title, ...rest] = p.split("\n"); return { title: title.trim().slice(0, 120), text: rest.join("\n").trim().slice(0, 2000) }; });

/** People on staff here: anyone whose role ranks above member. */
const staffMembers = (c = S.church()) => S.members(c.id).filter((m) => S.user(m.userId) && ((S.role(c.id, m.userId)?.rank || 0) > 10)).slice(0, 12);
/** The suggested page, from what the app already knows about the church. */
function visitDefaults(c = S.church()) {
  const staff = staffMembers(c), lead = staff.find((m) => S.isPrimary(c.id, m.userId)) || staff[0];
  const mapped = new Set(c.locations.flatMap((l) => (l.map?.items || []).map((i) => i.type)));
  const amen = ["parking", "accessible", ...(mapped.has("cafe") ? ["coffee"] : []), ...(mapped.has("elevator") ? ["elevator"] : []), ...(mapped.has("nursery") ? ["nursery"] : []),
    ...(S.on("checkin", c.id) ? ["kidsclasses", "checkin"] : []), ...(c.locations.some((l) => l.liveUrl) ? ["livestream"] : [])];
  return [
    { id: "v-welcome", type: "welcome", title: "We can't wait to meet you", text: `Whether you're new to church or looking for a church home, you're welcome at ${c.name}. Here's everything you need for your first visit.` },
    { id: "v-campus", type: "campus", title: "When and where", parking: "", notes: "" },
    { id: "v-contact", type: "contact", title: "Someone to meet you", userId: lead?.userId || "", role: lead ? S.role(c.id, lead.userId)?.name || "" : "", message: "I'd love to meet you and answer any questions. Let me know you're coming, and I'll look out for you!" },
    { id: "v-expect", type: "expect", title: "What to expect", text: "", items: [
      { title: "How long", text: "Services last about 75 minutes." }, { title: "Music and teaching", text: "We sing together, pray, and hear a message from the Bible." },
      { title: "What to wear", text: "Come as you are. You'll see everything from jeans to suits." }, { title: "When you arrive", text: "Look for the welcome desk. We'll show you around and help with check-in for your kids." }] },
    ...(S.on("checkin", c.id) ? [{ id: "v-kids", type: "kids", title: "Bringing kids?", text: KIDS_HOW, kiosks: true, rooms: true }] : []),
    ...(c.locations.some((l) => mapOf(l)) ? [{ id: "v-map", type: "map", title: "Find your way around" }] : []),
    { id: "v-amen", type: "amenities", title: "While you're here", items: amen, custom: "" },
    { id: "v-classes", type: "classes", title: "Classes and groups", text: "" },
    ...(staff.length ? [{ id: "v-staff", type: "staff", title: "Meet our staff", text: "", people: staff.map((m) => ({ id: uid(), userId: m.userId, name: S.user(m.userId).name, role: S.role(c.id, m.userId)?.name || "", bio: "", photo: "" })) }] : []),
    { id: "v-beliefs", type: "beliefs", title: "What we believe", text: "", items: [], url: "" },
  ];
}
const visitBlocks = (c = S.church()) => c.visitPage?.blocks || visitDefaults(c);

// ----- The page -----
let visitLoc = "";
const visitLocations = (c) => { const ls = (S.isMember(c.id) ? S.visibleLocations(c.id) : c.locations).filter((l) => l.visibility !== "private" || S.isMember(c.id));
  const withServices = ls.filter((l) => (l.services || []).length); return withServices.length ? withServices : ls; };   // campuses people visit, not offices
const personPhoto = (p, size = 72) => p.photo ? html`<img class="vp-photo" src="${p.photo}" alt="" style="width:${size}px;height:${size}px">` : html`<span class="vp-photo vp-initials" style="width:${size}px;height:${size}px;background:${personColor(p.userId || p.name)}">${initials(p.name || "?")}</span>`;
/** Ways to reach someone: in the app for members, and by phone or email if given. */
function reachButtons(p, c, ask = false) {
  const member = S.isMember(c.id), me = S.me().id, inApp = member && p.userId && p.userId !== me && S.user(p.userId);
  return html`<div class="btns vp-reach">
    ${inApp ? html`<button class="btn sm" data-act="dm-start" data-user="${p.userId}">${icon("chat")}Message</button>` : ""}
    ${inApp && typeof canMemberEmail === "function" && canMemberEmail() ? html`<a class="btn ghost sm" href="#email-${p.userId}">${icon("mail")}Email in the app</a>` : ""}
    ${p.phone ? html`<a class="btn ghost sm" href="tel:${p.phone.replace(/[^\d+]/g, "")}">${icon("phone")}Call</a><a class="btn ghost sm" href="sms:${p.phone.replace(/[^\d+]/g, "")}">${icon("chat")}Text</a>` : ""}
    ${p.email ? html`<a class="btn ghost sm" href="mailto:${p.email}">${icon("mail")}Email</a>` : ""}
    ${ask ? (member ? html`<button class="btn ghost sm" data-act="connect-card">${icon("inbox")}Ask a question</button>` : html`<a class="btn ghost sm" href="#church-${c.id}">${icon("inbox")}Join to send a question</a>`) : ""}</div>`;
}
function visitBlockHtml(b, c, loc) {
  const t = VISIT_BLOCKS[b.type]; if (!t) return "";
  if (t.generic) return landingBlocks({ ...c, landing: { blocks: [b] } });
  const head = (fallback) => html`<h2>${b.title || fallback}</h2>`, member = S.isMember(c.id);
  switch (b.type) {
    case "welcome": return html`<section class="block vp-welcome">${b.image ? html`<img class="vp-hero" src="${b.image}" alt="">` : ""}${head(`Welcome to ${c.name}`)}${b.text ? html`<p class="pre">${b.text}</p>` : ""}</section>`;
    case "video": return b.url ? html`<section class="block">${head("Welcome")}${embedView(b.url, b.title || "Welcome", { video: /youtu|vimeo|\.mp4|\.mov|\.webm/i.test(b.url), height: 420 })}${b.text ? html`<p class="pre" style="margin-top:10px">${b.text}</p>` : ""}</section>` : "";
    case "campus": {
      if (!loc) return "";
      const svcs = (loc.services || []).slice().sort((a, x) => a.day - x.day || a.time.localeCompare(x.time)), next = upcomingServices(c, 1, loc.id)[0];
      const tm = (s) => timeLabel(s.time, tz(loc.id));
      return html`<section class="block">${head("When and where")}
        ${next ? html`<p class="vp-next">${icon("calendar")}<span>Next service: <b>${serviceName(next)}</b></span></p>` : ""}
        ${svcs.length ? html`<ul class="vp-times">${svcs.map((s) => html`<li><b>${DAYS[s.day]} ${tm(s)}</b><span>${s.label || "Service"}</span></li>`)}</ul>` : html`<p class="muted">Service times are coming soon.</p>`}
        ${loc.address ? html`<p class="vp-addr">${icon("pin")}<span><b>${loc.name}</b><br>${loc.address}</span></p>` : ""}
        ${b.parking ? html`<h3>Parking and arriving</h3><p class="pre">${b.parking}</p>` : ""}${b.notes ? html`<p class="pre">${b.notes}</p>` : ""}
        <div class="btns">${loc.address ? html`<a class="btn" href="${mapLink(loc.address)}" target="_blank" rel="noopener">${icon("pin")}Directions</a>` : ""}${loc.liveUrl ? html`<a class="btn ghost" href="${loc.liveUrl}" target="_blank" rel="noopener">${icon("play")}Watch online</a>` : ""}</div></section>`;
    }
    case "contact": {
      const u = b.userId && S.user(b.userId), p = { ...b, name: b.name || u?.name || "", userId: b.userId };
      if (!p.name) return "";
      return html`<section class="block vp-contact">${head("Someone to meet you")}<div class="vp-person">${personPhoto(p, 88)}<div><b class="vp-name">${p.name}</b>${b.role ? html`<span class="muted">${b.role}</span>` : ""}</div></div>
        ${b.message ? html`<p class="pre vp-quote">${b.message}</p>` : ""}${reachButtons(p, c, true)}</section>`;
    }
    case "staff": {
      const people = (b.people || []).filter((p) => p.name);
      return people.length ? html`<section class="block">${head("Meet our staff")}${b.text ? html`<p class="pre">${b.text}</p>` : ""}<div class="vp-staff">${people.map((p) => html`<article class="vp-card">
        ${personPhoto(p, 96)}<b class="vp-name">${p.name}</b>${p.role ? html`<span class="muted">${p.role}</span>` : ""}
        ${p.bio ? html`<details class="vp-bio"><summary>About ${p.name.split(" ")[0]}</summary><p class="pre">${p.bio}</p></details>` : ""}${reachButtons(p, c)}</article>`)}</div></section>` : "";
    }
    case "expect": return (b.items || []).length || b.text ? html`<section class="block">${head("What to expect")}${b.text ? html`<p class="pre">${b.text}</p>` : ""}
      <div class="vp-points">${(b.items || []).map((x) => html`<div class="vp-point"><b>${x.title}</b>${x.text ? html`<p class="pre">${x.text}</p>` : ""}</div>`)}</div></section>` : "";
    case "beliefs": return (b.items || []).length || b.text ? html`<section class="block">${head("What we believe")}${b.text ? html`<p class="pre">${b.text}</p>` : ""}
      ${(b.items || []).map((x) => html`<details class="vp-belief"><summary>${x.title}</summary>${x.text ? html`<p class="pre">${x.text}</p>` : ""}</details>`)}
      ${b.url ? html`<p><a href="${b.url}" ${attr(!b.url.startsWith("#"), 'target="_blank" rel="noopener"')}>Read our full statement of faith</a></p>` : ""}</section>` : "";
    case "classes": {
      if (c.id !== S.state.current) return "";
      const list = S.visible("gatherings").filter((g) => !loc || !g.locationId || g.locationId === loc.id).sort((a, x) => (a.type === "class" ? 0 : 1) - (x.type === "class" ? 0 : 1) || a.name.localeCompare(x.name)).slice(0, 12);
      if (!list.length && !b.text) return "";
      const ages = (g) => g.ageMin != null || g.ageMax != null ? `Ages ${g.ageMin ?? 0}${g.ageMax != null ? ` to ${g.ageMax}` : "+"}` : "";
      return html`<section class="block">${head("Classes and groups")}${b.text ? html`<p class="pre">${b.text}</p>` : ""}<div class="rows">${list.map((g) => html`<a class="row" href="#gathering-${g.id}"><span class="lead-ic">${icon(g.type === "class" ? "door" : "people")}</span>
        <span class="body"><span class="t">${g.name}</span><span class="s">${[scheduleText(g), g.room, ages(g)].filter(Boolean).join(". ")}</span><span class="s"><b>${g.registration === "none" ? "Just come" : g.registration === "closed" ? "Full right now" : "Sign up first"}</b></span></span>${icon("chev")}</a>`)}</div></section>`;
    }
    case "kids": {
      const kiosks = b.kiosks && c.id === S.state.current ? S.list("devices").filter((d) => d.type === "kiosk" && d.settings?.kioskMode !== "wayfind" && (!loc || d.locationId === loc.id)) : [];
      const rooms = b.rooms ? (c.kidsRooms || []) : [];
      return html`<section class="block">${head("Bringing kids?")}${b.text ? html`<p class="pre">${b.text}</p>` : ""}
        ${kiosks.length ? html`<h3>Check-in kiosks</h3><ul class="vp-list">${kiosks.map((d) => { const sp = typeof mapSpotOf === "function" && mapSpotOf(d.settings?.mapSpot);
          return html`<li>${icon("kid")}<span><b>${d.name}</b>${sp ? html`<br><a href="#map-${sp.l.id}~${sp.it.id}">${placeName(sp.it)}, on the campus map</a>` : ""}</span></li>`; })}</ul>` : ""}
        ${rooms.length ? html`<h3>Kids' rooms</h3><ul class="vp-list">${rooms.map((r) => html`<li>${icon("door")}<span><b>${r.name}</b><br><span class="muted">Ages ${r.minAge} to ${r.maxAge}</span></span></li>`)}</ul>` : ""}
        <div class="btns">${member ? html`<a class="btn" href="#household">${icon("kid")}Add your kids now</a>` : ""}${member && S.on("checkin") !== false ? html`<a class="btn ghost" href="#checkin">Check in</a>` : ""}</div></section>`;
    }
    case "map": {
      const l = loc && mapOf(loc) ? loc : visitLocations(c).find(mapOf);
      if (!l || !mapItems(l.map).length) return "";
      return html`<section class="block">${head("Find your way around")}<a class="vp-map" href="#map-${l.id}" aria-label="Open the campus map">${mapSvg(l.map, 0, { guest: true })}</a>
        <div class="btns"><a class="btn" href="#map-${l.id}">${icon("pin")}Open the campus map</a></div></section>`;
    }
    case "amenities": {
      const items = [...(b.items || []).map((k) => AMENITIES.find((a) => a[0] === k)?.[1]).filter(Boolean), ...String(b.custom || "").split("\n").map((x) => x.trim()).filter(Boolean)];
      return items.length ? html`<section class="block">${head("While you're here")}<ul class="vp-amen">${items.map((x) => html`<li>${icon("check")}<span>${x}</span></li>`)}</ul></section>` : "";
    }
    default: return "";
  }
}
/** #visit in the app; #visit-<churchId> for anyone, even signed out. */
Screens.visit = (tail = "") => {
  const cid = tail || S.state.current;
  if (Backend.on && !Backend.user && cid && !S.church(cid)) {
    if (visitTry !== cid) { visitTry = cid; Backend.pullPublicChurch(cid).then(render).catch(render); }
    return { page: html`<div class="loading" role="status"><span class="ai-dot"></span>Opening...</div>` };
  }
  const c = S.church(cid); if (!c) return { redirect: "churches" };
  const locs = visitLocations(c);
  if (!locs.some((l) => l.id === visitLoc)) visitLoc = (locs.find((l) => l.id === S.campus(c.id)) || locs[0])?.id || "";
  const loc = locs.find((l) => l.id === visitLoc);
  const blocks = visitBlocks(c).filter((b) => !b.hidden);
  const picker = locs.length > 1 ? html`<div class="vp-pick"><p class="muted" style="margin:0 0 6px">Which campus are you visiting?</p><div class="chips" style="flex-wrap:wrap">${locs.map((l) => html`<button class="chip" data-act="visit-loc" data-id="${l.id}" aria-pressed="${l.id === visitLoc}">${l.name}</button>`)}</div></div>` : "";
  const body = html`${picker}<div class="landing vp">${blocks.map((b) => visitBlockHtml(b, c, loc))}</div>
    ${S.isMember(c.id) && S.can("manage.church") ? html`<p style="text-align:center"><a class="btn ghost" href="#admin-visitpage">${icon("edit")}Change this page</a></p>` : ""}`;
  if (S.isMember(c.id)) return { title: "Plan your visit", back: "home", body: html`<div style="margin-top:14px">${bannerHtml(c)}</div>${body}` };
  return { page: html`<div class="public-page" style="--brand:${c.color};--on-brand:${onColor(c.color)}"><header class="home-top"><div class="wrap"><div class="home-bar"><span class="switcher">${churchMark(c, 40)}<span><strong>${c.name}</strong><small>Plan your visit</small></span></span>
      ${Backend.on && !Backend.user ? html`<a class="btn sm" href="#signin">Sign in</a>` : html`<button class="btn sm" data-act="join-church" data-id="${c.id}">Join</button>`}</div>${bannerHtml(c)}</div></header>
    <main class="view">${body}<p class="faint" style="text-align:center;margin-top:30px">${c.name} on ${PLATFORM.name}</p></main></div>` };
};
let visitTry = "";
Actions["visit-loc"] = (el) => { visitLoc = el.dataset.id; render(); };

// ----- Admin, Plan your visit page -----
const visitEditable = () => { const c = S.church(); c.visitPage ||= { blocks: visitDefaults(c) }; return c.visitPage.blocks; };
const vpBlockSummary = (b) => b.title || b.caption || b.name || (b.text || "").slice(0, 50) || b.url || "";
AdminScreens.visitpage = () => {
  const stop = guard("manage.church"); if (stop) return stop;
  const c = S.church(), blocks = visitBlocks(c), custom = !!c.visitPage;
  return { title: "Plan your visit page", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">The page people see when they tap Plan your visit: in the app, on your public page, and from its own link and QR code (it works without an account). ${custom ? "" : "This is the suggested page, made from your campuses, staff, check-in and map. Change anything and it becomes yours."}</p>
    <div class="btns"><a class="btn ghost sm" href="#visit">${icon("eye")}See it</a>${S.can("qr.create") ? html`<button class="btn ghost sm" data-act="qr-for" data-target="visit-${c.id}" data-label="Plan your visit: ${c.name}">${icon("qr")}QR code</button>` : ""}
      <button class="btn ghost sm" data-act="copy" data-text="${appLink(`visit-${c.id}`)}" data-done="Link copied">${icon("link")}Copy link</button>${custom ? html`<button class="btn ghost sm" data-act="vp-reset">Start over from the suggested page</button>` : ""}</div>
    <section class="sec"><h2 class="sec-head">Blocks, top to bottom</h2>
      <div class="rows">${blocks.map((b, i) => { const t = VISIT_BLOCKS[b.type] || { label: b.type, icon: "note" };
        return html`<div class="row ${b.hidden ? "vp-hidden" : ""}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}${b.hidden ? " (hidden)" : ""}</span><span class="s">${vpBlockSummary(b)}</span></span>
          <span class="row-tools"><button class="icon-btn" data-act="vp-move" data-i="${i}" data-dir="-1" aria-label="Move up" ${attr(i === 0, "disabled")}>${icon("up")}</button><button class="icon-btn" data-act="vp-move" data-i="${i}" data-dir="1" aria-label="Move down" ${attr(i === blocks.length - 1, "disabled")}>${icon("down")}</button>
          <button class="icon-btn" data-act="vp-hide" data-i="${i}" aria-label="${b.hidden ? "Show" : "Hide"}">${icon(b.hidden ? "eye" : "lock")}</button><button class="icon-btn" data-act="vp-edit" data-i="${i}" aria-label="Edit">${icon("edit")}</button></span></div>`; })}</div>
      <div class="btns"><button class="btn" data-act="vp-add">${icon("plus")}Add a block</button></div></section>` };
};
Actions["vp-reset"] = () => openSheet("Start over?", html`<p>Your blocks are replaced with the suggested page. This can't be undone.</p><div class="btns"><button class="btn danger" data-act="vp-reset-yes">Start over</button><button class="btn ghost" data-act="close-sheet">Keep mine</button></div>`);
Actions["vp-reset-yes"] = () => { delete S.church().visitPage; S.save(); closeSheet(); toast("Back to the suggested page"); render(); };
Actions["vp-move"] = (el) => { const list = visitEditable(), i = +el.dataset.i, j = i + +el.dataset.dir; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; S.save(); render(); };
Actions["vp-hide"] = (el) => { const b = visitEditable()[+el.dataset.i]; b.hidden = !b.hidden; S.save(); toast(b.hidden ? "Hidden from visitors" : "Shown to visitors"); render(); };
Actions["vp-add"] = () => openSheet("Add a block", html`<div class="rows">${Object.entries(VISIT_BLOCKS).map(([k, t]) => html`<button class="row" data-act="vp-new" data-type="${k}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}</span><span class="s">${t.hint}</span></span>${icon("plus")}</button>`)}</div>`);
Actions["vp-new"] = (el) => { const type = el.dataset.type; vpForm({ id: uid(), type, ...(type === "kids" ? { text: KIDS_HOW, kiosks: true, rooms: true } : {}), ...(type === "staff" ? { people: [] } : {}) }, -1); };
Actions["vp-edit"] = (el) => vpForm({ ...visitEditable()[+el.dataset.i] }, +el.dataset.i);
let vpDraft = null;   // the block being edited, so the staff list can be changed in a second sheet and come back
function vpForm(b, i) {
  vpDraft = { b, i };
  const t = VISIT_BLOCKS[b.type], members = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, x) => a.name.localeCompare(x.name));
  const field = ([name, label, type]) => {
    if (type === "image") return imageField(name, label, b[name], "Pictures are resized so they load fast.", 1200);
    if (type === "textarea") return html`<label class="field"><span>${label}</span><textarea name="${name}" rows="4" maxlength="4000">${b[name] || ""}</textarea></label>`;
    if (type === "check") return html`<label class="check"><input type="checkbox" name="${name}" ${attr(b[name], "checked")}><span>${label}</span></label>`;
    if (type === "person") return html`<label class="field"><span>${label}</span><select name="${name}"><option value="">Someone not in the app</option>${members.map((u) => html`<option value="${u.id}" ${attr(u.id === b[name], "selected")}>${u.name}</option>`)}</select><small>Someone in the app can be messaged in the app.</small></label>`;
    if (type === "pairs") return html`<label class="field"><span>${label}</span><textarea name="${name}" rows="10" maxlength="20000" placeholder="The Bible&#10;We believe the Bible is God's word...&#10;&#10;Jesus&#10;We believe...">${pairsText(b[name])}</textarea><small>For each one, a title on the first line and the words under it. Leave a blank line between each.</small></label>`;
    if (type === "amenities") return html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:4px">${label}</legend><div class="vp-checks">${AMENITIES.map(([k, l]) => html`<label class="check"><input type="checkbox" name="${name}" value="${k}" ${attr((b[name] || []).includes(k), "checked")}><span>${l}</span></label>`)}</div></fieldset>`;
    if (type === "staff") return html`<div class="field"><span>${label}</span><div class="rows">${(b.people || []).length ? b.people.map((p, j) => html`<div class="row">${personPhoto(p, 40)}<span class="body"><span class="t">${p.name}</span><span class="s">${p.role || ""}${p.bio ? "" : ". No bio yet"}</span></span>
        <span class="row-tools"><button type="button" class="icon-btn" data-act="vp-person-move" data-j="${j}" data-dir="-1" aria-label="Move up" ${attr(j === 0, "disabled")}>${icon("up")}</button><button type="button" class="icon-btn" data-act="vp-person" data-j="${j}" aria-label="Edit">${icon("edit")}</button></span></div>`) : empty("Nobody yet.")}</div>
      <div class="btns"><button type="button" class="btn ghost sm" data-act="vp-person" data-j="-1">${icon("plus")}Add a person</button></div></div>`;
    if (type === "links") return html`<label class="field"><span>${label}</span><textarea name="${name}" placeholder="Our website | https://yourchurch.org&#10;Give | #give">${(b.links || []).map((l) => `${l.label} | ${l.url}`).join("\n")}</textarea><small>One per line: label | link.</small></label>`;
    return html`<label class="field"><span>${label}</span><input type="${type === "number" ? "number" : "text"}" name="${name}" value="${b[name] ?? ""}" ${attr(type === "url" || type === "link", 'inputmode="url"')}>${type === "link" ? html`<small>A web address, or an app screen like #give.</small>` : ""}</label>`;
  };
  openSheet(`${i < 0 ? "Add" : "Edit"}: ${t.label}`, html`<form data-form="vp-save" novalidate><p class="muted" style="margin-top:0">${t.hint}.</p>${t.fields.map(field)}
    <div class="btns"><button class="btn">${i < 0 ? "Add block" : "Save block"}</button>${i >= 0 ? html`<button type="button" class="btn danger" data-act="vp-delete" data-i="${i}">Remove</button>` : ""}</div></form>`, { wide: true });
}
/** Reads the block form into the draft. Returns an error message, or "". */
function vpRead(f) {
  const { b } = vpDraft, t = VISIT_BLOCKS[b.type], fd = new FormData(f), v = (n) => String(fd.get(n) ?? "").trim();
  for (const [name, label, type] of t.fields) {
    if (type === "staff") continue;
    if (type === "check") b[name] = fd.has(name);
    else if (type === "amenities") b[name] = fd.getAll(name);
    else if (type === "pairs") b[name] = pairsRead(fd.get(name));
    else if (type === "links") { b.links = v(name).split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0] && p[1]).map(([label, url]) => ({ label, url })); const bad = b.links.find((l) => !okLink(l.url)); if (bad) return `"${bad.url}" isn't a web address (https://...) or an app screen (#give).`; }
    else b[name] = v(name);
    if (type === "url" && b[name] && !isUrl(b[name])) return `${label} should start with https://`;
    if (type === "link" && b[name] && !okLink(b[name])) return `${label} should be a web address (https://...) or an app screen (#give).`;
  }
  if (b.type === "image" && !b.image) return "Choose an image.";
  if (b.type === "video" && !b.url) return "Add the link to the video or presentation.";
  return "";
}
Forms["vp-save"] = (d, f) => {
  const err = vpRead(f); if (err) return formError(f, err);
  const list = visitEditable(), { b, i } = vpDraft;
  if (i >= 0) list[i] = b; else list.push(b);
  vpDraft = null; S.save(); closeSheet(); toast("Saved"); render();
};
Actions["vp-delete"] = (el) => { visitEditable().splice(+el.dataset.i, 1); vpDraft = null; S.save(); closeSheet(); toast("Removed"); render(); };
// The staff list: each person in their own sheet, then back to the block.
Actions["vp-person"] = (el) => {
  const f = $("#scrim form[data-form=vp-save]"); if (f) vpRead(f);
  const j = +el.dataset.j, p = j >= 0 ? vpDraft.b.people[j] : { name: "", role: "", bio: "", photo: "", userId: "", email: "", phone: "" };
  const members = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, x) => a.name.localeCompare(x.name));
  openSheet(j >= 0 ? `Edit ${p.name}` : "Add a person", html`<form data-form="vp-person" novalidate><input type="hidden" name="j" value="${j}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${p.name}" maxlength="80" required></label>
    <label class="field"><span>Role</span><input type="text" name="role" value="${p.role || ""}" maxlength="80" placeholder="Lead pastor"></label>
    ${imageField("photo", "Photo", p.photo, "A friendly headshot works best.", 600)}
    <label class="field"><span>About them</span><textarea name="bio" rows="5" maxlength="2000" placeholder="Where they're from, their family, how they came to the church, what they love...">${p.bio || ""}</textarea></label>
    <label class="field"><span>Their account in the app (optional)</span><select name="userId"><option value="">Not linked</option>${members.map((u) => html`<option value="${u.id}" ${attr(u.id === p.userId, "selected")}>${u.name}</option>`)}</select><small>Linked, members can message them in the app.</small></label>
    <label class="field"><span>Email shown to visitors (optional)</span><input type="email" name="email" value="${p.email || ""}" maxlength="120"></label>
    <label class="field"><span>Phone shown to visitors (optional)</span><input type="tel" name="phone" value="${p.phone || ""}" maxlength="30"></label>
    <div class="btns"><button class="btn">Save person</button>${j >= 0 ? html`<button type="button" class="btn danger" data-act="vp-person-remove" data-j="${j}">Remove</button>` : ""}<button type="button" class="btn ghost" data-act="vp-back">Back</button></div></form>`, { wide: true });
};
Forms["vp-person"] = (d, f) => {
  const name = String(d.name || "").trim(); if (!name) return formError(f, "Add their name.");
  const p = { id: uid(), name: name.slice(0, 80), role: String(d.role || "").trim().slice(0, 80), photo: d.photo || "", bio: String(d.bio || "").trim().slice(0, 2000), userId: d.userId || "", email: String(d.email || "").trim(), phone: String(d.phone || "").trim() };
  const people = vpDraft.b.people ||= [], j = +d.j;
  if (j >= 0) people[j] = { ...people[j], ...p, id: people[j].id }; else people.push(p);
  vpForm(vpDraft.b, vpDraft.i);
};
Actions["vp-person-remove"] = (el) => { vpDraft.b.people.splice(+el.dataset.j, 1); vpForm(vpDraft.b, vpDraft.i); };
Actions["vp-person-move"] = (el) => { const f = $("#scrim form[data-form=vp-save]"); if (f) vpRead(f); const ps = vpDraft.b.people, j = +el.dataset.j, k = j + +el.dataset.dir; if (k < 0 || k >= ps.length) return; [ps[j], ps[k]] = [ps[k], ps[j]]; vpForm(vpDraft.b, vpDraft.i); };
Actions["vp-back"] = () => vpForm(vpDraft.b, vpDraft.i);

// ----- Where it shows up: Admin, and the public page links to it -----
{
  const page = Screens.page;
  Screens.page = (id) => { const v = page(id); const c = S.church(id || S.state.current);
    if (!v?.page || !c) return v;
    return { ...v, page: raw(flat(v.page).replace('<main class="view landing">', `<main class="view landing"><div class="btns" style="justify-content:center;margin:6px 0 14px"><a class="btn" href="#visit-${esc(c.id)}">Plan your visit</a></div>`)) };
  };
}
