// ---------- Geofenced Campus Triggers, Arrival Pop-Up Menus, and Volunteer & Staff Attendance Report ----------
// Uses device geolocation to prompt arriving groups to confirm service attendance,
// logs volunteer/staff punctuality for the Dashboard & Reports,
// and surfaces a customizable Campus Arrival Pop-Up (kids check-in, event tickets, volunteer post check-in, Sanctuary mode).

const GEOFENCE_SESSION_KEY = "our-faithful-geofence-arrived";
let lastGeoFix = null; // { lat, lng, accuracy, at }

/** Haversine distance in meters between two GPS coordinates. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Default geofence trigger settings for a campus location. */
function geoConfigOf(loc) {
  const g = loc?.geofence || {};
  return {
    enabled: g.enabled !== false,
    lat: typeof g.lat === "number" ? g.lat : (loc?.code === "EAST" ? 33.5412 : 33.5294),
    lng: typeof g.lng === "number" ? g.lng : (loc?.code === "EAST" ? -85.3125 : -85.3488),
    radiusMeters: clamp(+g.radiusMeters || 200, 40, 2000),
    autoAttendance: g.autoAttendance !== false,
    staffReport: g.staffReport !== false,
    popupMenu: g.popupMenu !== false,
    checkinPrompt: g.checkinPrompt !== false,
    ticketPopup: g.ticketPopup !== false,
    sanctuaryPrompt: g.sanctuaryPrompt !== false,
    welcomeTitle: g.welcomeTitle || `Welcome to ${loc?.name || S.church()?.name || "Church"}!`,
    welcomeMessage: g.welcomeMessage || "You're on campus. Here are your quick check-in tools, tickets, and service notes.",
    customActionLabel: g.customActionLabel || "",
    customActionHash: g.customActionHash || "",
  };
}

/** Determines whether a member holds a staff/leadership role at the current church. */
function isStaffMember(userId = S.me().id, cid = S.state.current) {
  if (S.isPrimary(cid, userId)) return true;
  const r = S.role(cid, userId);
  return !!r && (r.rank >= 50 || r.id === "admin" || r.id === "pastor" || r.id === "staff");
}

/** Finds any service plan matching a service occurrence or date, and checks if userId is scheduled. */
function scheduledAssignmentFor(userId, svcOrDate) {
  const day = typeof svcOrDate === "string" ? svcOrDate.slice(0, 10) : isoDay(svcOrDate?.start || new Date());
  const plans = S.list("services").filter((p) => p.date === day);
  for (const p of plans) {
    const a = (p.assignments || []).find((x) => x.userId === userId && x.status !== "declined");
    if (a) return { plan: p, assignment: a };
  }
  return null;
}

/** Records campus arrival in S.state.presence with roleType (staff/volunteer/member), punctuality, and service metadata. */
function recordGeofencePresence(loc, svc, extraHeadcount, guestHeadcount, staffReport) {
  const me = S.me();
  if (!me?.id || !S.isMember()) return null;
  const key = serviceKey(svc);
  const sched = scheduledAssignmentFor(me.id, svc);
  const staff = isStaffMember(me.id);
  const roleType = staff && sched ? "staff+volunteer" : staff ? "staff" : sched ? "volunteer" : "member";
  const nowMs = Date.now(), startMs = svc.start.getTime();
  const diffMin = Math.round((nowMs - startMs) / 60000);
  // Volunteers/staff are expected at least 10 minutes before start; <= +5 min from start is on-time
  const punctuality = diffMin <= -10 ? "early" : diffMin <= 5 ? "on-time" : "late";

  let rec = S.list("presence").find((p) => p.serviceKey === key && p.userId === me.id);
  if (!rec) {
    rec = S.add("presence", {
      id: presenceId(S.state.current, key, me.id),
      userId: me.id,
      name: me.name,
      serviceKey: key,
      date: key.slice(0, 10),
      locationId: loc.id,
      via: "geofence",
      extraHeadcount,
      guestHeadcount,
      by: me.id,
      at: new Date().toISOString(),
      roleType,
      team: sched?.assignment?.team || "",
      position: sched?.assignment?.position || (staff ? S.role()?.name || "Staff" : ""),
      punctuality,
      minutesFromStart: diffMin,
    });
  } else {
    Object.assign(rec, { extraHeadcount, guestHeadcount, roleType, team: sched?.assignment?.team || rec.team || "", position: sched?.assignment?.position || rec.position || "", punctuality: rec.punctuality || punctuality });
  }
  // If scheduled to serve and not yet in S.state.serving for this serviceKey, record volunteer check-in too
  if (staffReport && sched && !S.list("serving").some((v) => v.serviceKey === key && v.by === me.id)) {
    S.add("serving", { by: me.id, name: me.name, team: sched.assignment.team, position: sched.assignment.position, serviceKey: key, serviceName: serviceName(svc), locationId: loc.id, via: "geofence", at: new Date().toISOString() });
  }
  S.save();
  return { rec, activeSvc: svc, sched, staff, punctuality };
}

/** Finds any upcoming event today (or within 12 hours) where the current user holds a registration/ticket. */
function myCampusTickets(locId) {
  if (!S.isMember()) return [];
  const cutStart = new Date(Date.now() - 2 * 3600e3).toISOString();
  const cutEnd = new Date(Date.now() + 24 * 3600e3).toISOString();
  return S.visible("events")
    .filter((e) => e.start >= cutStart && e.start <= cutEnd && (!locId || !e.locationId || e.locationId === locId))
    .map((e) => [e, myRegistration(e)])
    .filter(([, r]) => r);
}

/** Opens the customizable Campus Arrival Sheet with one-tap check-in, tickets, Sanctuary mode, and custom links. */
function openCampusArrivalSheet(loc, arrivalInfo = {}) {
  const cfg = geoConfigOf(loc);
  const { activeSvc, sched, staff, rec, manualTest } = arrivalInfo;
  const kids = (S.me().household || []).filter((p) => p.kind === "child");
  const tickets = cfg.ticketPopup ? myCampusTickets(loc?.id) : [];
  const latestSermon = sermonsSorted()[0];
  const sanct = typeof prefs === "function" && prefs().theme === "sanctuary";

  openSheet(cfg.welcomeTitle, html`
    <div class="geo-arrival-sheet">
      <div class="geo-arrival-hero">
        <span class="geo-pulse-icon">${icon("pin")}</span>
        <div>
          <span class="tag ok">${manualTest ? "Test preview" : rec ? "Attendance confirmed" : "On campus"}</span>
          <p style="margin:6px 0 0" class="muted">${cfg.welcomeMessage}</p>
        </div>
      </div>

      ${activeSvc ? html`<div class="panel" style="margin-top:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div><span class="faint" style="font-size:.78rem">CURRENT SERVICE</span><br><b>${serviceName(activeSvc)}</b></div>
        <span class="tag brand">${staff ? "Staff" : sched ? sched.assignment.team : "Present"}</span>
      </div>` : ""}

      ${tickets.length ? html`<section class="sec" style="margin-top:14px">
        <h3 class="sec-head">Your event ticket${tickets.length > 1 ? "s" : ""} for today</h3>
        <div class="rows">
          ${tickets.map(([e, r]) => html`<button type="button" class="row" data-act="ticket-show" data-event="${e.id}" data-reg="${regIdOf(e, r)}">
            <span class="lead-ic">${icon("ticket")}</span>
            <span class="body"><span class="t">${e.title}</span><span class="s">Tap to pop up QR code (${plural(r.count || 1, "person", "people")})</span></span>
            <span class="tag ok">Pop up QR</span>
          </button>`)}
        </div>
      </section>` : ""}

      <section class="sec" style="margin-top:14px">
        <h3 class="sec-head">Quick campus actions</h3>
        <div class="rows">
          ${cfg.checkinPrompt && S.on("checkin") && kids.length ? html`<a class="row" href="#checkin" >
            <span class="lead-ic">${icon("kid")}</span>
            <span class="body"><span class="t">Check in ${listJoin(kids.map((k) => k.name))}</span><span class="s">Get your family security code &amp; room tags</span></span>
            ${icon("chev")}
          </a>` : ""}
          ${cfg.checkinPrompt && sched ? html`<a class="row" href="#serving" >
            <span class="lead-ic">${icon("hand")}</span>
            <span class="body"><span class="t">Serving today: ${sched.assignment.position} (${sched.assignment.team})</span><span class="s">Scheduled for this service</span></span>
            <span class="tag ${rec && cfg.staffReport ? "ok" : "brand"}">${rec && cfg.staffReport ? "Checked in" : "Scheduled"}</span>
          </a>` : cfg.checkinPrompt && S.on("checkin") ? html`<a class="row" href="#serve" >
            <span class="lead-ic">${icon("hand")}</span>
            <span class="body"><span class="t">Check in to serve</span><span class="s">Let your team leader know you're on campus</span></span>
            ${icon("chev")}
          </a>` : ""}
          ${cfg.sanctuaryPrompt ? html`<button type="button" class="row" data-act="geo-sanctuary-notes" data-sermon="${latestSermon?.id || ""}">
            <span class="lead-ic">${icon("moon")}</span>
            <span class="body"><span class="t">${sanct ? "Open today's sermon notes" : "Turn on Sanctuary Mode &amp; open sermon notes"}</span><span class="s">${latestSermon ? `${latestSermon.title} (${latestSermon.passage})` : "Zero-glare OLED dark mode for worship"}</span></span>
            ${icon("chev")}
          </button>` : ""}
          ${cfg.customActionLabel && cfg.customActionHash ? html`<a class="row" href="#${cfg.customActionHash.replace(/^#/, "")}" >
            <span class="lead-ic">${icon("star")}</span>
            <span class="body"><span class="t">${cfg.customActionLabel}</span><span class="s">Featured campus action</span></span>
            ${icon("chev")}
          </a>` : ""}
          <a class="row" href="#board" >
            <span class="lead-ic">${icon("people")}</span>
            <span class="body"><span class="t">Community board &amp; prayer wall</span><span class="s">See today's care needs, rides, and updates</span></span>
            ${icon("chev")}
          </a>
        </div>
      </section>

      <div class="btns" style="margin-top:14px;justify-content:space-between">
        <button type="button" class="btn block" data-act="close-sheet">Done</button>
      </div>
    </div>
  `, { wide: true });
}

Actions["geo-sanctuary-notes"] = (el) => {
  if (typeof prefs === "function" && prefs().theme !== "sanctuary") {
    prefs().theme = "sanctuary"; S.save(); applyDisplay();
  }
  closeSheet(true);
  if (el.dataset.sermon) go(`sermon-${el.dataset.sermon}`);
  else go("word");
};

/** Evaluates a GPS coordinate against all church locations and triggers arrival if within radius. */
function handleGeoPosition(lat, lng, accuracy = 25, { manualTest = false, forceLocId = "" } = {}) {
  lastGeoFix = { lat, lng, accuracy, at: new Date().toISOString() };
  const c = S.church();
  if (!c || !S.isMember() || thisDevice()) return;
  const locs = S.visibleLocations();
  let matchedLoc = null, minDist = Infinity;

  if (forceLocId) {
    matchedLoc = S.location(forceLocId) || locs[0];
    minDist = 12;
  } else {
    for (const l of locs) {
      const cfg = geoConfigOf(l);
      if (!cfg.enabled) continue;
      const dist = haversineMeters(lat, lng, cfg.lat, cfg.lng);
      if (dist <= cfg.radiusMeters && dist < minDist) {
        minDist = dist;
        matchedLoc = l;
      }
    }
  }
  if (!matchedLoc) {
    if (manualTest) toast("You are currently outside the configured campus geofence radius.");
    return;
  }

  const cfg = geoConfigOf(matchedLoc);
  const svc = upcomingServices(c, 16, matchedLoc.id).find((s) => s.start - Date.now() < 30 * 60e3 && s.start - Date.now() > -120 * 60e3);
  if (!manualTest && ((!svc && !prefs().geofenceAlways) || $("#scrim"))) return;
  const sessionKey = `${c.id}:${S.me().id}:${matchedLoc.id}:${svc ? serviceKey(svc) : isoDay(new Date())}`;
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem(GEOFENCE_SESSION_KEY) || "[]"); } catch {}
  if (!manualTest && seen.includes(sessionKey)) return;
  if (!manualTest) {
    try { sessionStorage.setItem(GEOFENCE_SESSION_KEY, JSON.stringify([...seen, sessionKey])); } catch {}
  }

  const info = { activeSvc: svc, sched: scheduledAssignmentFor(S.me().id, svc), staff: isStaffMember(), manualTest };
  if (svc && cfg.autoAttendance) openArrivalConfirmation(matchedLoc, info);
  else if (cfg.popupMenu || manualTest) openCampusArrivalSheet(matchedLoc, info);
}

let pendingArrival = null;
function openArrivalConfirmation(loc, info) {
  const key = serviceKey(info.activeSvc);
  pendingArrival = { loc, info, key, church: S.state.current, user: S.me().id };
  const previous = S.list("presence").find((r) => r.userId === S.me().id && r.serviceKey === key);
  const checkin = S.on("checkin") && S.can("use.checkin");
  openSheet("Confirm your attendance", html`<form data-form="geo-confirm" novalidate>
    <p>Are you attending <b>${serviceName(info.activeSvc)}</b> at ${loc.name}?</p>
    ${linkedFamilyUser === S.me().id && linkedFamily.length ? html`<p class="muted">Linked accounts check in separately: ${listJoin(linkedFamily.map((person) => person.name))}.</p>` : ""}
    <label class="field"><span>How many people are in your group, including you?</span>
      <input type="number" name="headcount" min="1" max="200" required value="${1 + (+previous?.extraHeadcount || 0)}">
      <small>Include guests without their own app login. Leave out anyone who can check in with their own account and children who will use kids check-in.</small>
    </label>
    <label class="field"><span>How many of that total are guests visiting with you?</span><input type="number" name="guests" min="0" max="199" value="${previous?.guestHeadcount || 0}"></label>
    ${checkin ? html`<fieldset class="field"><legend>Who needs kids check-in?</legend>
      ${kids().map((k) => html`<label class="check"><input type="checkbox" name="kids" value="${k.id}"><span>${k.name}</span></label>`)}
      <label class="check"><input type="checkbox" name="newChild"><span>A child needs to be added or registered for a class</span></label>
    </fieldset>` : ""}
    <div class="btns"><button class="btn">Confirm attendance</button><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div>
  </form>`);
}
Forms["geo-confirm"] = (d, f, fd) => {
  const arrival = pendingArrival;
  if (!arrival || arrival.church !== S.state.current || arrival.user !== S.me().id || !S.isMember()) return;
  const { loc, info, key } = arrival;
  const count = Number(d.headcount), guests = Number(d.guests);
  if (!Number.isInteger(count) || count < 1 || count > 200) return formError(f, "Enter a group size between 1 and 200.");
  if (!Number.isInteger(guests) || guests < 0 || guests >= count) return formError(f, "The guest count must fit within your group size.");
  const cfg = geoConfigOf(loc);
  if (info.manualTest) { pendingArrival = null; openCampusArrivalSheet(loc, info); return; }
  if (!cfg.autoAttendance || !findService(key, 16)) return formError(f, "That service is no longer available.");
  pendingArrival = null;
  const result = recordGeofencePresence(loc, info.activeSvc, count - 1, guests, cfg.staffReport);
  const selected = new Set(fd.getAll("kids"));
  const ids = kids().filter((k) => selected.has(k.id)).map((k) => k.id);
  closeSheet(true);
  if ((ids.length || d.newChild) && S.on("checkin") && S.can("use.checkin")) {
    arrivalCheckin = { church: arrival.church, user: arrival.user, key, kids: ids, addChild: !!d.newChild };
    go("checkin");
    toast("Attendance confirmed. Continue to kids check-in.");
  } else if (cfg.popupMenu) openCampusArrivalSheet(loc, result || info);
  else toast("Attendance confirmed.");
};

/** Starts or refreshes the passive campus geofence watcher when the member allows it. */
/** Whether this church uses arrival check-in at all, so Settings only offers the switch where it does something. */
function geofenceOffered() { const c = S.church(); return !!c && S.isMember() && !thisDevice() && !!c.locations?.some((l) => geoConfigOf(l).enabled); }
/** Prompts someone who opted in under "Ask me to confirm when I arrive" (Settings, Location). It's off until they do. */
async function startGeofenceMonitor(justTurnedOn = false) {
  if (typeof navigator === "undefined" || !("geolocation" in navigator) || thisDevice()) return;
  if (typeof prefs !== "function" || prefs().geofenceCheckin !== true) return;
  if (!geofenceOffered()) return;
  // Only during a service (or if they also chose to be checked whenever they're on campus).
  const svc = upcomingServices(S.church(), 30, "all").find((s) => s.start - Date.now() < 30 * 60e3);
  if (!svc && !prefs().geofenceAlways) { if (justTurnedOn) toast("We'll ask you to confirm when you arrive for a service."); return; }
  const church = S.state.current, user = S.me().id;
  await refreshLinkedFamily();
  if (church !== S.state.current || user !== S.me().id || !prefs().geofenceCheckin) return;
  try {
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (church === S.state.current && user === S.me().id && prefs().geofenceCheckin) handleGeoPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); },
      () => {},
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 }
    );
  } catch {}
}

// ----- Admin Screen: Campus Geofencing & Arrival Triggers (#admin-geofence) -----
let selectedGeoLocId = "";
AdminScreens.geofence = () => {
  const stop = guard("manage.locations"); if (stop) return stop;
  const c = S.church(), locs = c.locations || [];
  if (!selectedGeoLocId || !locs.some((l) => l.id === selectedGeoLocId)) selectedGeoLocId = locs[0]?.id || "";
  const loc = S.location(selectedGeoLocId) || locs[0];
  if (!loc) return { redirect: "admin-locations" };
  const cfg = geoConfigOf(loc);

  return {
    title: "Campus geofencing", back: "admin",
    body: html`
      <p class="muted" style="margin-top:14px">When a member, volunteer, or staff member arrives within a campus geofence during a service or event, the app asks them to confirm attendance, updates the Volunteer &amp; Staff Attendance Report, and opens your custom Campus Arrival Menu.</p>
      ${locs.length > 1 ? html`<div class="chips" style="margin-top:10px">${locs.map((l) => html`<button type="button" class="chip" data-act="geo-pick-loc" data-id="${l.id}" aria-pressed="${l.id === loc.id}">${l.name} (${l.code})</button>`)}</div>` : ""}

      <div class="panel" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <b>Test arrival experience for ${loc.name}</b>
          <div class="faint" style="font-size:.85rem">Simulate driving onto ${loc.name} right now to preview the pop-up menu, ticket QR, and staff attendance log.</div>
        </div>
        <div class="btns" style="margin:0">
          <button type="button" class="btn sm" data-act="geo-simulate" data-loc="${loc.id}">${icon("pin")}Simulate campus arrival</button>
          <a class="btn ghost sm" href="#reports-staff-attendance">${icon("list")}Staff &amp; volunteer report</a>
        </div>
      </div>

      <form data-form="geo-save" class="panel" style="margin-top:14px" novalidate>
        <input type="hidden" name="locId" value="${loc.id}">
        <label class="check"><input type="checkbox" name="enabled" ${attr(cfg.enabled, "checked")}><span><b>Enable geofenced triggers for ${loc.name}</b></span></label>
        <p class="faint" style="margin:6px 0 0">Each member chooses whether to be checked in by location: they turn on "Ask me to confirm when I arrive" in Settings, under Location. It's off until they do, and only works while the app is open.</p>

        <h3 style="margin-top:16px">Campus GPS coordinates &amp; radius</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px">
          <label class="field" style="margin:0"><span>Latitude</span><input type="number" step="any" name="lat" value="${cfg.lat}" required></label>
          <label class="field" style="margin:0"><span>Longitude</span><input type="number" step="any" name="lng" value="${cfg.lng}" required></label>
          <label class="field" style="margin:0"><span>Radius (meters)</span><input type="number" min="40" max="2000" name="radiusMeters" value="${cfg.radiusMeters}" required></label>
        </div>
        <div class="btns" style="margin-top:8px">
          <button type="button" class="btn ghost sm" data-act="geo-use-here">${icon("pin")}Use my current GPS coordinates</button>
        </div>

        <h3 style="margin-top:18px">What happens when someone arrives on campus</h3>
        <label class="check"><input type="checkbox" name="autoAttendance" ${attr(cfg.autoAttendance, "checked")}><span><b>Confirm service attendance</b><br><span class="faint">Ask each arriving group to confirm its headcount during a scheduled service</span></span></label>
        <label class="check"><input type="checkbox" name="staffReport" ${attr(cfg.staffReport, "checked")}><span><b>Log volunteer &amp; staff arrival times</b><br><span class="faint">Track On-Time vs. Late arrivals on the Dashboard and Volunteer &amp; Staff Attendance Report</span></span></label>
        <label class="check"><input type="checkbox" name="popupMenu" ${attr(cfg.popupMenu, "checked")}><span><b>Show Campus Arrival Pop-Up Menu</b><br><span class="faint">Open a welcome bottom sheet with personalized quick actions</span></span></label>
        <label class="check"><input type="checkbox" name="checkinPrompt" ${attr(cfg.checkinPrompt, "checked")}><span><b>One-tap Family Kids Check-In &amp; Volunteer Station Check-In</b><br><span class="faint">Surface household children check-in codes and scheduled serving positions</span></span></label>
        <label class="check"><input type="checkbox" name="ticketPopup" ${attr(cfg.ticketPopup, "checked")}><span><b>Auto-pop event tickets &amp; QR codes</b><br><span class="faint">Automatically surface event tickets when the member is registered for an event starting soon</span></span></label>
        <label class="check"><input type="checkbox" name="sanctuaryPrompt" ${attr(cfg.sanctuaryPrompt, "checked")}><span><b>Offer Sanctuary OLED Mode &amp; live sermon outline</b><br><span class="faint">Prompt arriving attendees to switch to zero-glare Sanctuary Mode and open today's notes</span></span></label>

        <h3 style="margin-top:18px">Custom welcome banner &amp; special button</h3>
        <label class="field"><span>Arrival pop-up headline</span><input type="text" name="welcomeTitle" maxlength="80" value="${cfg.welcomeTitle}"></label>
        <label class="field"><span>Welcome message</span><textarea name="welcomeMessage" rows="2" maxlength="280">${cfg.welcomeMessage}</textarea></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label class="field"><span>Custom action button label (optional)</span><input type="text" name="customActionLabel" maxlength="50" value="${cfg.customActionLabel}" placeholder="Open Christmas Eve Bulletin"></label>
          <label class="field"><span>Target screen hash</span><input type="text" name="customActionHash" maxlength="60" value="${cfg.customActionHash}" placeholder="#word or #board"></label>
        </div>

        <button class="btn block" style="margin-top:14px">Save geofence settings</button>
      </form>
    `,
  };
};
Actions["geo-pick-loc"] = (el) => { selectedGeoLocId = el.dataset.id; render(); };
Actions["geo-use-here"] = (el) => {
  const f = el.closest("form");
  if (!("geolocation" in navigator)) { toast("Geolocation is not supported in this browser."); return; }
  toast("Reading GPS coordinates...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $("input[name=lat]", f).value = pos.coords.latitude.toFixed(6);
      $("input[name=lng]", f).value = pos.coords.longitude.toFixed(6);
      toast("Coordinates filled from your current location");
    },
    () => toast("Couldn't read GPS location. Enter coordinates manually."),
    { enableHighAccuracy: true, timeout: 8000 }
  );
};
Actions["geo-simulate"] = (el) => {
  const loc = S.location(el.dataset.loc) || S.visibleLocations()[0];
  if (!loc) return;
  const cfg = geoConfigOf(loc);
  handleGeoPosition(cfg.lat, cfg.lng, 10, { manualTest: true, forceLocId: loc.id });
};
Forms["geo-save"] = (d) => {
  const loc = S.location(d.locId);
  if (!loc) return;
  loc.geofence = {
    enabled: !!d.enabled,
    lat: parseFloat(d.lat) || 33.5294,
    lng: parseFloat(d.lng) || -85.3488,
    radiusMeters: clamp(+d.radiusMeters || 200, 40, 2000),
    autoAttendance: !!d.autoAttendance,
    staffReport: !!d.staffReport,
    popupMenu: !!d.popupMenu,
    checkinPrompt: !!d.checkinPrompt,
    ticketPopup: !!d.ticketPopup,
    sanctuaryPrompt: !!d.sanctuaryPrompt,
    welcomeTitle: String(d.welcomeTitle || "").trim() || `Welcome to ${loc.name}!`,
    welcomeMessage: String(d.welcomeMessage || "").trim(),
    customActionLabel: String(d.customActionLabel || "").trim(),
    customActionHash: String(d.customActionHash || "").trim(),
  };
  S.save();
  logActivity(`Updated campus geofence settings for ${loc.name}`, "locations");
  toast("Geofence settings saved");
  render();
};

// ----- Volunteer & Staff Attendance Report + Dashboard Widget -----
/** Computes staff and scheduled volunteer attendance across services in the selected window. */
function computeStaffVolunteerAttendance(startDay) {
  const c = S.church();
  if (!c) return { rows: [], summary: { expectedTotal: 0, presentTotal: 0, onTimeTotal: 0, lateTotal: 0, missingTotal: 0, geofenceCount: 0 } };
  const today = isoDay(new Date());
  const plans = S.list("services").filter((p) => p.date >= startDay && p.date <= today).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const activePlans = plans.length ? plans : upcomingPlans().slice(0, 2);
  const staffMembers = S.members().filter((m) => isStaffMember(m.userId, c.id) && S.user(m.userId));
  const presenceAll = S.list("presence");
  const servingAll = S.list("serving");

  const rows = [];
  let expectedTotal = 0, presentTotal = 0, onTimeTotal = 0, lateTotal = 0, missingTotal = 0, geofenceCount = 0;

  activePlans.forEach((p) => {
    const dayPresence = presenceAll.filter((pr) => pr.date === p.date && (!p.locationId || !pr.locationId || pr.locationId === p.locationId));
    const dayServing = servingAll.filter((sv) => (sv.serviceKey || "").startsWith(p.date));
    const seenUsers = new Set();

    // 1. Scheduled volunteers for this plan
    (p.assignments || []).filter((a) => a.status !== "declined" && S.user(a.userId)).forEach((a) => {
      seenUsers.add(a.userId);
      expectedTotal++;
      const pr = dayPresence.find((x) => x.userId === a.userId);
      const sv = dayServing.find((x) => x.by === a.userId);
      const present = !!(pr || sv);
      const via = pr?.via || sv?.via || "";
      const punc = pr?.punctuality || (present ? "on-time" : "missing");
      if (present) {
        presentTotal++;
        if (punc === "late") lateTotal++; else onTimeTotal++;
        if (String(via).startsWith("geofence")) geofenceCount++;
      } else {
        missingTotal++;
      }
      rows.push({
        date: p.date,
        service: `${p.title} (${timeLabel(p.time, tzOf(p), p.date)})`,
        userId: a.userId,
        name: S.userName(a.userId),
        category: isStaffMember(a.userId, c.id) ? "Staff & Volunteer" : "Volunteer",
        roleOrTeam: `${a.team}: ${a.position}`,
        status: present ? (punc === "late" ? "Present (Late)" : "Present (On-Time)") : (p.date > today ? "Scheduled" : "No-Show / Missing"),
        via: present ? (String(via).startsWith("geofence") ? "Campus Geofence" : via || "App Check-In") : "—",
        at: pr?.at || sv?.at ? fmtTime(pr?.at || sv?.at) : "—",
        present,
      });
    });

    // 2. Staff members expected on Sundays/service days
    staffMembers.forEach((m) => {
      if (seenUsers.has(m.userId)) return;
      seenUsers.add(m.userId);
      expectedTotal++;
      const pr = dayPresence.find((x) => x.userId === m.userId);
      const present = !!pr;
      const punc = pr?.punctuality || (present ? "on-time" : "missing");
      if (present) {
        presentTotal++;
        if (punc === "late") lateTotal++; else onTimeTotal++;
        if (String(pr.via).startsWith("geofence")) geofenceCount++;
      } else {
        missingTotal++;
      }
      rows.push({
        date: p.date,
        service: `${p.title} (${timeLabel(p.time, tzOf(p), p.date)})`,
        userId: m.userId,
        name: S.userName(m.userId),
        category: "Staff / Leadership",
        roleOrTeam: S.role(c.id, m.userId)?.name || "Staff",
        status: present ? (punc === "late" ? "Present (Late)" : "Present (On-Time)") : (p.date > today ? "Expected" : "Not Checked In"),
        via: present ? (String(pr.via).startsWith("geofence") ? "Campus Geofence" : pr.via || "Manual") : "—",
        at: pr?.at ? fmtTime(pr.at) : "—",
        present,
      });
    });
  });

  return { rows, summary: { expectedTotal, presentTotal, onTimeTotal, lateTotal, missingTotal, geofenceCount } };
}

// Register Report Tab & Dashboard Widget
{
  if (typeof REPORT_TABS !== "undefined" && !REPORT_TABS.some(([k]) => k === "staff-attendance")) {
    REPORT_TABS.splice(4, 0, ["staff-attendance", "Staff & volunteers", () => S.can("view.reports") || S.can("schedule.teams")]);
  }
  if (typeof REPORT_PAGES !== "undefined") {
    REPORT_PAGES["staff-attendance"] = () => {
      const { start } = reportBuckets();
      const { rows, summary } = computeStaffVolunteerAttendance(start);
      const tableRows = rows.map((r) => [r.date, r.name, r.category, r.roleOrTeam, r.service, r.status, r.via, r.at]);
      return html`<section class="sec">
        <div class="sec-head">
          <h2>Volunteer &amp; staff attendance report</h2>
          <div class="btns" style="margin:0">
            ${S.can("manage.locations") ? html`<a class="btn ghost sm" href="#admin-geofence">${icon("pin")}Geofence settings</a>` : ""}
            <button type="button" class="btn sm" data-act="ping-missing-staff">${icon("bell")}Ping missing (${summary.missingTotal})</button>
          </div>
        </div>
        <div class="stat-tiles">
          ${statTile("Checked in", `${summary.presentTotal}/${summary.expectedTotal}`, pct(summary.presentTotal, summary.expectedTotal) + " attendance rate")}
          ${statTile("On-time arrivals", summary.onTimeTotal.toLocaleString(), `${summary.lateTotal} arrived after start`)}
          ${statTile("Via geofence", summary.geofenceCount.toLocaleString(), "Confirmed after GPS arrival")}
          ${statTile("Missing / unconfirmed", summary.missingTotal.toLocaleString(), "Scheduled but not checked in")}
        </div>
        <h3 class="sec-head" style="margin-top:18px">Attendance breakdown</h3>
        <div class="panel">
          ${segBarT("Volunteer & staff punctuality", [
            ["On-time", summary.onTimeTotal],
            ["Late", summary.lateTotal],
            ["Missing / not checked in", summary.missingTotal],
          ])}
        </div>
        <h3 class="sec-head" style="margin-top:18px">Detailed roster log</h3>
        <div class="panel">
          ${reportTable("staff-att", "volunteer-staff-attendance", ["Date", "Name", "Type", "Role / Position", "Service", "Status", "Check-in method", "Arrival time"], tableRows, { limit: 40, empty: "No volunteer or staff attendance records in this range yet." })}
        </div>
      </section>`;
    };
  }
  if (typeof DASH !== "undefined") {
    DASH.staffAttendance = ["Volunteer & staff attendance", () => S.can("view.reports") || S.can("schedule.teams"), () => {
      const cut = isoDay(new Date(Date.now() - 28 * DAY));
      const { rows, summary } = computeStaffVolunteerAttendance(cut);
      const recentMissing = rows.filter((r) => !r.present).slice(0, 4);
      return html`
        <div class="stat-tiles" style="margin-bottom:12px">
          ${statTile("Present", `${summary.presentTotal}/${summary.expectedTotal}`, `${pct(summary.presentTotal, summary.expectedTotal)} checked in`)}
          ${statTile("Geofence auto", summary.geofenceCount.toLocaleString(), `${summary.onTimeTotal} on-time · ${summary.lateTotal} late`)}
        </div>
        ${recentMissing.length ? html`<p class="faint" style="margin:6px 0"><b>Not checked in yet:</b> ${recentMissing.map((r) => `${r.name} (${r.roleOrTeam})`).join(", ")}</p>` : html`<p class="muted" style="margin:0">All scheduled staff and volunteers are accounted for.</p>`}
        <div class="btns" style="margin-top:10px">
          <a class="btn ghost sm" href="#reports-staff-attendance">${icon("list")}Full attendance report</a>
          <button type="button" class="btn ghost sm" data-act="geo-simulate">${icon("pin")}Test campus arrival</button>
        </div>`;
    }];
  }
}

Actions["ping-missing-staff"] = () => {
  const { start } = typeof reportBuckets === "function" ? reportBuckets() : { start: isoDay(new Date(Date.now() - 14 * DAY)) };
  const { rows } = computeStaffVolunteerAttendance(start);
  const missingIds = [...new Set(rows.filter((r) => !r.present).map((r) => r.userId))];
  if (!missingIds.length) { toast("Everyone scheduled is already checked in!"); return; }
  missingIds.forEach((u) => notify(u, { kind: "serve", title: "Are you on campus today?", body: `Tap to check in for your scheduled role at ${S.church().name}.`, link: "#here" }));
  toast(`Sent check-in ping to ${plural(missingIds.length, "person", "people")}`);
};

// Hook into Home screen render & Settings preferences
{
  const prevHome = Screens.home;
  Screens.home = (t) => {
    const v = prevHome(t);
    if (v && !v.redirect) {
      const prevAfter = v.after;
      v.after = () => { prevAfter?.(); setTimeout(startGeofenceMonitor, 500); };
    }
    return v;
  };
}
