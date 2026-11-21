// ---------- Campus Safety, Security Command & 5-Level Automated Protocol Generator (#security, #admin-security) ----------
// Provides:
//   1. An on-site Emergency SOS button for all users: choose between Calling 911 (dials 911 + automatically alerts all
//      security staff with the caller's identity and live GPS coordinates) or Alerting the Security Team (with text,
//      recorded voice message, photo/video capture, and GPS location).
//   2. A dedicated Security Staff Interface (#security) with a multimodal tactical communication channel (text, voice
//      walkie-talkie clips, photos, videos, GPS pins), incident triage, assigned door lock verification, and live roll call.
//   3. A Church-Specific Protocol Generator (#security-protocols) with 5 customizable escalation levels (from Level 1
//      Door/Maintenance Advisory to Level 5 Campus-Wide Lockdown), role-specific step-by-step checklists, automated
//      assigned-door verification (Level 4), and full-screen Emergency Broadcast Override across all church displays +
//      Live Classroom Headcount & Unaccounted Individuals Report (Level 5).

const SECURITY_ROLES_DEFAULT = ["admin", "pastor", "staff"];

function isSecurityMember(userId = S.me().id, cid = S.state.current) {
  if (S.isPrimary(cid, userId)) return true;
  if (!S.membership(cid, userId)) return false;
  if (securityAssignment(userId, cid)?.role) return true;
  const r = S.role(cid, userId);
  // Matches on_security_team() in upgrade-15.sql: the Security team permission, church admins, or a security,
  // safety, medical, first aid, greeter or usher team.
  if (r && (r.perms?.["security.team"] || r.perms?.["manage.church"] || r.id === "admin")) return true;
  const teams = S.list("teamMembers").filter((m) => m.userId === userId && m.status !== "requested").map((m) => m.team.toLowerCase());
  return teams.some((t) => /security|safety|medical|first.?aid|greeter|usher/.test(t));
}

const securityAssignment = (userId, cid) => S.list("securityAccessAssignments", cid).find((a) => a.userId === userId);
const securityAdmin = (userId = S.me().id, cid = S.state.current) => {
  const role = S.role(cid, userId);
  return S.isPrimary(cid, userId) || role?.id === "admin" || !!role?.perms?.["manage.church"];
};
const securityLevel = (userId = S.me().id, cid = S.state.current) => {
  if (!S.membership(cid, userId) && !S.isPrimary(cid, userId)) return 0;
  if (securityAdmin(userId, cid)) return 3;
  const role = securityAssignment(userId, cid)?.role;
  if (role === "head") return 3;
  if (role === "supervisor") return 2;
  return isSecurityMember(userId, cid) ? 1 : 0;
};
const canLeadSecurity = () => securityLevel() === 3;
const canSuperviseSecurity = () => securityLevel() >= 2;
const directSecurityLevel = () => canLeadSecurity() ? 5 : Math.max(0, Math.min(5, +securityAssignment(S.me().id, S.state.current)?.maxLevel || 0));

function securitySections() {
  return {
    drill: canLeadSecurity(),
    incidents: canSuperviseSecurity(),
    doors: canSuperviseSecurity() || S.can("checkin.station"),
    rollcall: canViewUnaccountedReport(),
    reunify: canSuperviseSecurity() || S.can("checkin.station"),
    medical: canSuperviseSecurity(),
    protocols: canLeadSecurity(),
    access: canSuperviseSecurity(),
  };
}

function canViewUnaccountedReport(userId = S.me().id, cid = S.state.current) {
  return securityLevel(userId, cid) >= 2 || S.can("view.reports", cid) || S.can("checkin.station", cid) || S.can("manage.classes", cid);
}

// Protocols and drill settings start from the app's standard ones. Doors, AEDs and medical responders are the church's
// own building and people, so they start empty and the security team adds them; the sample church has its own
// (12-seed-features.js). defaultSecurityDoors and the others below are examples kept for reference.
const SAFETY_DEFAULTS = {
  securityProtocols: () => defaultSecurityProtocols(), securityDoors: () => [], securityAeds: () => [],
  medicalResponders: () => [], drillPlanner: (id) => defaultDrillPlannerConfig(id),
};
const safetyDefaultJson = new Map();
/** Fills in a church's missing safety settings with defaults. In the demo they're ordinary settings, saved in the browser.
 *  On the live app they're hidden from saving (not enumerable), and Backend.rows sends one only after it's changed. */
let fillingSafetyDefaults = false;
function safetyDefaults(c) {
  // Some defaults look up the church's people, which reads the church again: fill each in once, not over and over.
  if (!c || typeof c !== "object" || fillingSafetyDefaults) return c;
  fillingSafetyDefaults = true;
  try { fillSafetyDefaults(c); } finally { fillingSafetyDefaults = false; }
  return c;
}
function fillSafetyDefaults(c) {
  for (const [k, make] of Object.entries(SAFETY_DEFAULTS)) {
    if (Object.prototype.hasOwnProperty.call(c, k)) continue;
    const v = make(c.id), live = Backend.configured();
    if (live) safetyDefaultJson.set(`${c.id}:${k}`, JSON.stringify(v));
    Object.defineProperty(c, k, { value: v, writable: true, configurable: true, enumerable: !live });
  }
}

function securityTeamUserIds(cid = S.state.current) {
  const members = S.members(cid).map((m) => m.userId).filter((u) => S.user(u));
  const sec = members.filter((u) => isSecurityMember(u, cid));
  // With no security team set up, alerts go to the church's admins and primary account holder, not to everyone.
  return sec.length ? [...new Set(sec)] : members.filter((u) => S.isPrimary(cid, u) || S.role(cid, u)?.perms?.["manage.church"]);
}

function staffAndVolunteersUserIds(cid = S.state.current) {
  const members = S.members(cid).map((m) => m.userId).filter((u) => S.user(u));
  const out = members.filter((u) => {
    if (isSecurityMember(u, cid) || isStaffMember(u, cid)) return true;
    return S.list("teamMembers").some((m) => m.userId === u && m.status !== "requested");
  });
  return out.length ? [...new Set(out)] : members;
}

/** Default 5-Level Protocol Sequence Chart (church admins can edit every level or add custom levels). */
function defaultSecurityProtocols() {
  return [
    {
      level: 1,
      code: "LEVEL 1",
      name: "Facility & Door Lock Advisory",
      color: "#2563eb",
      tagCls: "brand",
      notifyScope: "security",
      requireDoorCheck: false,
      overrideDisplays: false,
      requireRollCall: false,
      summary: "Low-level alert to Security Team only (e.g., an exterior door latch will not lock properly or a minor facility hazard).",
      broadcastText: "",
      stepsByRole: {
        security: [
          "Acknowledge the advisory in the Security Tactical Channel.",
          "Closest security rover proceeds to inspect the reported door or facility area.",
          "Attempt to secure the latch or post a rover until maintenance resolves the issue.",
          "Mark the door status in the Door Verification tab.",
        ],
        staff: [
          "No disruption to classes or worship services.",
          "Keep interior office and classroom doors closed as normal.",
        ],
        teachers: [
          "Continue classroom activities normally.",
        ],
        members: [
          "No action required.",
        ],
      },
    },
    {
      level: 2,
      code: "LEVEL 2",
      name: "Suspicious Individual / Targeted Investigation",
      color: "#d97706",
      tagCls: "warn",
      notifyScope: "security",
      assignedTeam: "Security",
      requireDoorCheck: false,
      overrideDisplays: false,
      requireRollCall: false,
      summary: "Assigns the Security / Safety Response Team to discreetly investigate a suspicious individual or vehicle.",
      broadcastText: "",
      stepsByRole: {
        security: [
          "Review uploaded photo, video, or GPS pin in the Security Tactical Channel.",
          "Two-person Security Response pair makes calm, non-confrontational contact or observes from a safe distance.",
          "Second team member maintains radio/app comms with the Command Lead and watches exits.",
          "Escalate to Level 4 (Perimeter Lockout) or call 911 immediately if weapons or threats are observed.",
        ],
        staff: [
          "Remain at assigned posts and keep lobby pathways clear.",
          "Report any additional sightings in the Security Channel.",
        ],
        teachers: [
          "Keep classroom doors closed and verify parent pickup codes strictly.",
        ],
        members: [
          "Continue worship or activities as normal; use the Emergency SOS button if you observe anything concerning.",
        ],
      },
    },
    {
      level: 3,
      code: "LEVEL 3",
      name: "Code Adam — Missing Child Alert",
      color: "#ea580c",
      tagCls: "warn",
      notifyScope: "staff_volunteers",
      assignedTeam: "Welcome",
      requireDoorCheck: true,
      overrideDisplays: false,
      requireRollCall: true,
      summary: "Missing child reported: alerts all Security, Staff, and Volunteers to monitor all exits and conduct a systematic campus search.",
      broadcastText: "CODE ADAM: Please remain at your doors and assist staff with a quick campus check.",
      stepsByRole: {
        security: [
          "Immediately post a security or volunteer guard at every exterior door and parking lot exit.",
          "Obtain the child's name, age, photo/clothing description, and last known room in the Security Channel.",
          "Assign rovers to search restrooms, hallways, closets, and parking areas systematically from the outside in.",
          "If the child is not located within 5 minutes or abduction is suspected, dial 911 immediately.",
        ],
        staff: [
          "Proceed to your assigned exterior door in the Door Verification tab and confirm you are stationed there.",
          "Monitor anyone exiting the building with a child; assign a pastor to stay with and support the parents.",
        ],
        teachers: [
          "Hold all children inside classrooms and lock/secure classroom doors.",
          "Complete the live Classroom Headcount Checklist on your screen immediately to verify every child in your care.",
        ],
        members: [
          "Please keep hallways clear so volunteers and staff can complete a safety check.",
        ],
      },
    },
    {
      level: 4,
      code: "LEVEL 4",
      name: "Perimeter Lockout — Secure All Doors & Entryways",
      color: "#dc2626",
      tagCls: "warn",
      notifyScope: "staff_volunteers",
      assignedTeam: "Security",
      requireDoorCheck: true,
      overrideDisplays: false,
      requireRollCall: false,
      summary: "Suspicious individual identified on campus grounds outside buildings. Alerts all staff, volunteers, and security to lock and verify every assigned door.",
      broadcastText: "PERIMETER LOCKOUT: All exterior doors are secured. Please remain inside the building.",
      stepsByRole: {
        security: [
          "Monitor the Door & Entryway Verification Matrix as assignees lock and verify each exterior door.",
          "Immediately dispatch a rover to any door marked 'ISSUE / UNSECURED'.",
          "Maintain visual observation of campus grounds via cameras or safe interior vantage points; coordinate with 911.",
        ],
        staff: [
          "Go immediately to your assigned door in the Door Verification tab.",
          "Physically lock and pull-test the door, then tap 'Verify Locked & Secured' (or 'Report Issue / Unsecured' if it will not lock).",
          "Do not open exterior doors for anyone without Security Command clearance.",
        ],
        teachers: [
          "Move any outdoor youth or kids classes inside immediately.",
          "Lock classroom doors and keep children away from exterior windows.",
        ],
        members: [
          "Remain inside the building until Security announces All Clear.",
        ],
      },
    },
    {
      level: 5,
      code: "LEVEL 5",
      name: "Campus-Wide Lockdown & Safe-Zone Barricade",
      color: "#991b1b",
      tagCls: "warn",
      notifyScope: "everyone",
      assignedTeam: "Security",
      requireDoorCheck: true,
      overrideDisplays: true,
      requireRollCall: true,
      summary: "CRITICAL EMERGENCY: Campus-wide alert to all users, full-screen Emergency Broadcast on all displays, safe-zone barricade, and live roll call / unaccounted report.",
      broadcastText: "EMERGENCY LOCKDOWN IN EFFECT: Move immediately to the nearest Designated Safe Zone. Lock and barricade doors, turn off lights, silence phones, stay out of sight, and mark yourself SAFE in the app.",
      stepsByRole: {
        security: [
          "Ensure 911 has been called and provide real-time threat location updates in the Tactical Channel.",
          "Monitor the Live Roll Call & Unaccounted Report to see which rooms and individuals need assistance.",
          "Coordinate law enforcement arrival at the designated First Responder Staging Entrance.",
        ],
        staff: [
          "Direct everyone nearby into the nearest Designated Safe Zone and barricade the door.",
          "Turn off room lights, silence mobile devices, and keep everyone away from doors and windows.",
          "Mark yourself and anyone with you as SAFE in the app once barricaded.",
        ],
        teachers: [
          "Move all children into the classroom's Designated Safe Zone, lock and barricade the door, and cover door glass.",
          "Open the Live Classroom Headcount screen and check off each child present in your safe area.",
          "Any child not checked off is automatically flagged on the Security Team's Unaccounted Report.",
        ],
        members: [
          "Move immediately into the nearest room or Designated Safe Zone and barricade the door.",
          "Silence your phone ringer, stay low and out of sight, and tap 'I Am Safe in a Safe Zone' on your screen.",
          "Do not open the door until uniform law enforcement or verified Church Leadership gives the All Clear.",
        ],
      },
    },
  ];
}

function defaultSecurityDoors(cid) {
  return [
    { id: `${cid}-door-1`, name: "Main Lobby North Glass Doors", zone: "Sanctuary Building", safeZone: "Sanctuary Choir Room / Green Room", assignedTo: "", status: "unlocked", verifiedBy: "", verifiedAt: "", issueNote: "", mapX: 12, mapY: 2 },
    { id: `${cid}-door-2`, name: "Kids Wing East Check-In Entrance", zone: "Children's Wing", safeZone: "Kids Storage & Interior Rooms 102–106", assignedTo: "u-elena", status: "locked", verifiedBy: "Elena Morales", verifiedAt: new Date(Date.now() - 1800e3).toISOString(), issueNote: "", mapX: 21, mapY: 10 },
    { id: `${cid}-door-3`, name: "Fellowship Hall Kitchen & Loading Door", zone: "Fellowship Hall", safeZone: "Pantry & Interior Hallway", assignedTo: "u-marcus", status: "unlocked", verifiedBy: "", verifiedAt: "", issueNote: "", mapX: 21, mapY: 22 },
    { id: `${cid}-door-4`, name: "Youth Annex West Side Entry", zone: "Youth Annex", safeZone: "Youth Media Booth & Office", assignedTo: "", status: "unlocked", verifiedBy: "", verifiedAt: "", issueNote: "", mapX: 2, mapY: 16 },
    { id: `${cid}-door-5`, name: "Church Office & Staff South Door", zone: "Admin Wing", safeZone: "Inner Conference Room", assignedTo: "", status: "locked", verifiedBy: "", verifiedAt: "", issueNote: "", mapX: 12, mapY: 27 },
  ];
}

function defaultSecurityAeds(cid) {
  return [
    { id: `${cid}-aed-1`, name: "Main Sanctuary Foyer AED & Trauma Kit", room: "Welcome Desk / Main Lobby", floor: 0, mapX: 14, mapY: 5, status: "Ready (Pads exp. 2028-04)", pediatricPads: true },
    { id: `${cid}-aed-2`, name: "Children's Wing Hallway AED & Choking Rescue Device", room: "Kids Check-In Desk", floor: 0, mapX: 19, mapY: 12, status: "Ready (Pads exp. 2027-11)", pediatricPads: true },
    { id: `${cid}-aed-3`, name: "Fellowship Hall Kitchen First-Aid & Burn Kit", room: "Fellowship Hall North Wall", floor: 0, mapX: 18, mapY: 21, status: "Ready (Inspected Monthly)", pediatricPads: false },
  ];
}

function defaultMedicalResponders(cid) {
  return [
    { id: `${cid}-med-1`, userId: "u-elena", name: "Elena Morales", cert: "CPR / AED & First Aid Certified", role: "Kids Ministry Lead", onSite: true, phone: "555-0142" },
    { id: `${cid}-med-2`, userId: "u-marcus", name: "Marcus Vance", cert: "EMT-B / Tactical Trauma & AED", role: "Safety & Security Team", onSite: true, phone: "555-0188" },
  ];
}

function defaultDrillPlannerConfig(cid) {
  const staffIds = staffAndVolunteersUserIds(cid);
  return {
    levelMode: "random", // "random" | "1" | "2" | "3" | "4" | "5"
    scenarioId: "random",
    participationMode: "hybrid", // "real_only" | "hybrid" | "sim_only"
    includedRealStaffIds: staffIds.slice(0, 6),
    roleModes: {
      security: "hybrid",   // "real" | "hybrid" | "simulated"
      doors: "hybrid",      // "real" | "hybrid" | "simulated"
      teachers: "simulated",// "real" | "hybrid" | "simulated"
      members: "simulated", // "real" | "hybrid" | "simulated"
      medical: "simulated", // "real" | "hybrid" | "simulated"
    },
    functions: {
      notifications: true,
      displays: false,       // Excluded by default so silent staff drills don't interrupt live sanctuary screens unless toggled on
      homeBanner: true,
      doors: true,
      rollCall: true,
      reunification: true,
      medical: true,
      randomInjects: true,
    },
    simCadenceSec: 12,
    complicationRate: 30, // % chance a simulated door check or classroom check injects a complication
  };
}

// Register security collections & seed defaults
{
  if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("securityIncidents")) {
    RECORD_KINDS.push("securityIncidents", "securityMessages", "securityRollCall", "securityDrills", "securityReunifications");
  }
  if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("securityIncidents")) {
    QUIET_KINDS.push("securityIncidents", "securityMessages", "securityRollCall", "securityDrills", "securityReunifications");
  }
  const lists = (st) => { for (const k of ["securityIncidents", "securityMessages", "securityRollCall", "securityDrills", "securityReunifications", "securityProtocolRequests", "securityAccessAssignments", "securityIncidentEvents", "securityIncidentFormTemplates", "securityIncidentReports"]) st[k] ||= []; };
  const prevLoad = S.load.bind(S);
  S.load = function () { prevLoad(); lists(this.state); };
  if (S.state) lists(S.state);
  // Each church starts with default protocols, doors, AEDs, responders and drill settings. They're filled in when the
  // church is read (see safetyDefaults) rather than written into it, so opening the app never changes the church's
  // settings. On the live app they're only saved once someone changes them.
  const church = S.church.bind(S);
  S.church = (...a) => safetyDefaults(church(...a));
  const rows = Backend.rows.bind(Backend);
  Backend.rows = function () {
    const out = rows();
    for (const r of out) {
      if (r.table !== "churches") continue;
      const c = S.state.churches[r.value.id]; if (!c) continue;
      let changed = false;
      for (const k of Object.keys(SAFETY_DEFAULTS)) {
        const d = Object.getOwnPropertyDescriptor(c, k);
        if (d && !d.enumerable && JSON.stringify(d.value) !== safetyDefaultJson.get(`${c.id}:${k}`)) { r.value.data[k] = d.value; changed = true; }
      }
      if (changed) r.json = JSON.stringify(r.value);
    }
    return out;
  };
}

// Cross-tab & Supabase Realtime broadcast channel for instant emergency display takeover & tactical updates
let safetyChannel = null;
try { safetyChannel = "BroadcastChannel" in window ? new BroadcastChannel("our-faithful-safety") : null; } catch { safetyChannel = null; }
if (safetyChannel) {
  safetyChannel.onmessage = (e) => {
    const c = S.church();
    if (!c || e.data?.churchId !== c.id) return;
    S.load();
    render();
  };
}
// ----- On the live app: alerts and the live sermon reach every member's phone right away -----
// The church's own channel carries safety alerts and drills (and the live sermon from 41-word.js). Changes to the church's
// settings only reach other devices the next time they load, so these go out on this channel as they happen.
const churchTopic = (id) => `church:${id}`;
async function heardOnChurchChannel(m) {
  const c = S.church(); if (!c || m?.churchId !== c.id) return;
  if (m.type === "safety-alert") {
    // A broadcast is a refresh signal. A sender cannot set another device's live alert.
    const { data, error } = await Backend.client.from("churches").select("data").eq("id", c.id).maybeSingle();
    if (error || !data || S.church() !== c) return;
    const key = `churches:${c.id}`;
    const saved = JSON.parse(Backend.snap.get(key) || "null");
    for (const field of ["activeAlert", "activeDrill"]) {
      if (Object.prototype.hasOwnProperty.call(data.data, field)) {
        c[field] = data.data[field];
        if (saved) saved.data[field] = c[field];
      } else {
        delete c[field];
        if (saved) delete saved.data[field];
      }
    }
    if (saved) Backend.snap.set(key, JSON.stringify(saved));
  }
  else if (m.type === "pew-sync") c.livePew = m.pew || null;
  else return;
  render();
}
{
  const subscribe = Backend.subscribe.bind(Backend);
  Backend.subscribe = function () { subscribe(); const c = S.state.current; if (c && this.listening !== c) { this.listening = c; this.onBroadcast(heardOnChurchChannel, churchTopic(c)); } };
}
/** Settings a person's role can't change are sent back as they last came from the server, so a value heard on the
 *  church channel (an alert, the live sermon) isn't sent back as a change their role would be refused. */
const CHURCH_KEY_ROLES = {
  activeAlert: canSuperviseSecurity, activeDrill: canLeadSecurity, securityDoors: canSuperviseSecurity, drillPlanner: canLeadSecurity,
  securityProtocols: canLeadSecurity, securityAeds: canLeadSecurity, medicalResponders: canLeadSecurity,
  livePew: () => S.canAny(["present", "manage.sermons"]), giftCategories: () => S.can("view.giving"),
};
{
  const rows = Backend.rows.bind(Backend);
  Backend.rows = function () {
    const out = rows();
    for (const r of out) {
      if (r.table !== "churches" || r.value.id !== S.state.current) continue;
      let last = null; try { last = JSON.parse(this.snap.get(r.key) || "null"); } catch { /* not synced yet */ }
      if (!last) continue;
      let changed = false;
      for (const [k, may] of Object.entries(CHURCH_KEY_ROLES)) {
        if (S.isPrimary() || may()) continue;
        if (JSON.stringify(r.value.data[k]) === JSON.stringify(last.data?.[k])) continue;
        if (last.data && k in last.data) r.value.data[k] = last.data[k]; else delete r.value.data[k];
        changed = true;
      }
      if (changed) r.json = JSON.stringify(r.value);
    }
    return out;
  };
}
let secEarpieceMode = false;
let lastSpokenMsgId = "";

function playEarpieceCallout(text, voiceUrl = "") {
  if (!secEarpieceMode) return;
  try {
    if (voiceUrl) {
      const a = new Audio(voiceUrl);
      a.play().catch(() => {});
      return;
    }
    if ("speechSynthesis" in window && text) {
      window.speechSynthesis.cancel();
      const clean = String(text).replace(/[🚨⚠️📍✅🧪🛡️]/g, "").trim();
      const u = new SpeechSynthesisUtterance("Security Channel: " + clean);
      u.rate = 1.08;
      window.speechSynthesis.speak(u);
    }
  } catch {}
}

function broadcastSafetyUpdate(payload = {}) {
  const c = S.church(); if (!c) return;
  const msg = { type: "safety-alert", churchId: c.id, activeAlert: c.activeAlert, activeDrill: c.activeDrill, ...payload, at: Date.now() };
  try { safetyChannel?.postMessage(msg); } catch {}
  try { presChannel?.postMessage(msg); } catch {}
  // Screens following the booth hear it on the presentation channel; members' phones on the church's own channel.
  if (Backend.on) {
    Backend.push().then(() => {
      Backend.broadcast(msg, `present:${c.id}`);
      Backend.broadcast(msg, churchTopic(c.id));
    }).catch(() => toast("Security Command could not sync. Check your connection."));
  }
  if (secEarpieceMode && payload.spokenText && payload.msgId !== lastSpokenMsgId) {
    lastSpokenMsgId = payload.msgId || String(Date.now());
    playEarpieceCallout(payload.spokenText, payload.voiceUrl || "");
  }
}

// ----- 1. On-Site Emergency SOS Button (Call 911 + Auto-GPS Dispatch OR Alert Security with Text/Voice/Photo/Video) -----
let sosVoiceDataUrl = "";
let sosMediaDataUrl = "";
let sosMediaKind = ""; // "image" | "video"
let mediaRec = null;
let mediaChunks = [];

function getQuickGpsFix(timeoutMs = 3500) {
  return new Promise((resolve) => {
    if (typeof lastGeoFix === "object" && lastGeoFix?.lat) {
      resolve(lastGeoFix);
      return;
    }
    if (!("geolocation" in navigator)) {
      const loc = S.visibleLocations()[0];
      const cfg = typeof geoConfigOf === "function" && loc ? geoConfigOf(loc) : null;
      resolve(cfg ? { lat: cfg.lat, lng: cfg.lng, accuracy: 50, simulated: true } : null);
      return;
    }
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    setTimeout(() => {
      const loc = S.visibleLocations()[0];
      const cfg = typeof geoConfigOf === "function" && loc ? geoConfigOf(loc) : null;
      finish(cfg ? { lat: cfg.lat, lng: cfg.lng, accuracy: 65, fallback: true } : null);
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 15) }),
      () => finish(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: timeoutMs }
    );
  });
}

Actions["sos-open"] = () => {
  const c = S.church(); if (!c) return;
  sosVoiceDataUrl = ""; sosMediaDataUrl = ""; sosMediaKind = "";
  const rooms = allRooms();
  openSheet("Campus Emergency & Security Assistance", html`
    <div class="sos-sheet">
      <div class="sos-911-box">
        <div style="display:flex;align-items:center;gap:12px">
          <span class="sos-911-badge">911</span>
          <div>
            <b style="font-size:1.05rem">Life-Threatening Emergency?</b>
            <p class="muted" style="margin:2px 0 0;font-size:.86rem">${practiceMode() ? "Practice: in the real app this calls 911 from your phone. Here it only alerts the security team, so you can see what they get." : "Calls 911 immediately from your phone AND automatically alerts the Church Security Team with your name and live GPS coordinates."}</p>
          </div>
        </div>
        <button type="button" class="btn danger block" style="margin-top:12px;font-size:1.05rem;padding:13px" data-act="sos-call-911">
          ${icon("phone")}Call 911 &amp; Alert Security with My GPS
        </button>
      </div>

      <form data-form="sos-alert-security" class="panel" style="margin-top:14px" novalidate>
        <h3 style="margin:0 0 4px">Alert Campus Security Team</h3>
        <p class="faint" style="margin:0 0 12px">Send a direct alert to all assigned security staff with a text description, voice recording, photo/video, and your GPS coordinates.</p>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label class="field" style="margin:0"><span>Issue type</span><select name="category">
            <option value="suspicious">Suspicious individual / activity</option>
            <option value="medical">Medical assistance needed</option>
            <option value="missing_child">Missing / lost child (Code Adam)</option>
            <option value="door">Door / entryway won't lock</option>
            <option value="disturbance">Disturbance / safety concern</option>
            <option value="other">Other security issue</option>
          </select></label>
          <label class="field" style="margin:0"><span>Room or campus area</span><input type="text" name="room" list="sos-rooms" placeholder="e.g., Main Lobby / North Lot"><datalist id="sos-rooms">${rooms.map((r) => html`<option value="${r}">`)}</datalist></label>
        </div>

        <label class="field" style="margin-top:10px"><span>What is happening?</span><textarea name="details" rows="3" maxlength="1000" placeholder="Describe the person, medical need, or door issue..."></textarea></label>

        <div class="sos-media-tools">
          <div class="btns" style="margin:6px 0">
            <button type="button" class="btn ghost sm" id="sos-rec-btn" data-act="sos-voice-toggle">🎙️ Record voice message</button>
            <label class="btn ghost sm" style="cursor:pointer">📷 Take / upload photo or video<input type="file" accept="image/*,video/*" capture="environment" data-change="sos-media-file" class="sr"></label>
          </div>
          <div id="sos-voice-preview"></div>
          <div id="sos-media-preview"></div>
        </div>

        <label class="check" style="margin-top:8px"><input type="checkbox" name="shareGps" checked><span>Include my live GPS coordinates so Security can locate me</span></label>

        <div class="btns" style="margin-top:12px">
          <button class="btn block">${icon("shield")}Send Alert to Security Team</button>
          ${isSecurityMember() ? html`<a class="btn ghost block" href="#security" data-act="go" data-to="security">Open Security Command Center</a>` : ""}
        </div>
      </form>
    </div>
  `, { wide: true });
};

Actions["sos-call-911"] = (el) => {
  // Dial first, while the tap still counts as the person's own action: phones may refuse to dial from a page after a
  // delay. The alert to the security team goes out at once without a location, and the location follows when the phone
  // finds it. In the demo and in training nothing dials: the rest happens so it can be practiced.
  const practice = practiceMode();
  if (!practice) {
    const a = document.createElement("a");
    a.href = "tel:911";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  el.disabled = true;
  el.textContent = practice ? "Practice: alerting security..." : "Calling 911. Alerting security...";
  const me = S.me(), c = S.church(), at = new Date().toISOString();
  const inc = S.add("securityIncidents", {
    kind: "911_CALL", category: "911 Emergency Call", severity: "critical", by: me.id,
    reporterName: me.name || "Campus Visitor", reporterPhone: me.phone || "", room: "Finding location...",
    details: `${me.name || "A user on site"} pressed CALL 911 from the app.`, gps: null, mapUrl: "", status: "open", at,
  });
  const msg = S.add("securityMessages", {
    by: me.id, senderName: me.name || "Emergency SOS", priority: "urgent",
    text: `🚨 911 CALLED by ${me.name || "On-Site User"}${me.phone ? ` (${me.phone})` : ""}! Finding their location...`,
    gps: null, mapUrl: "", incidentId: inc.id, at,
  });
  securityTeamUserIds().forEach((u) => notify(u, {
    kind: "security", title: `🚨 911 CALLED BY ${(me.name || "USER").toUpperCase()}`,
    body: "Tap to open Security Command & dispatch team. Their location follows when their phone finds it.", link: "#security-incidents",
  }));
  logActivity(`Emergency 911 button activated by ${me.name}`, "security");
  S.save();
  if (Backend.on) Backend.flush();   // don't wait: the phone may pause this page during the call
  broadcastSafetyUpdate({ incidentId: inc.id });
  closeSheet(true);
  toast(practice ? "Practice only: 911 wasn't called. The security team got the alert." : "Calling 911. Security has been alerted.");
  render();
  getQuickGpsFix().then((gps) => {
    if (!gps) return;
    const where = `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`, mapUrl = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
    S.update("securityIncidents", inc.id, { gps, mapUrl, room: "GPS Location Attached", details: `${inc.details} GPS: ${where} (±${gps.accuracy || 20}m)` });
    S.update("securityMessages", msg.id, { gps, mapUrl, text: `🚨 911 CALLED by ${me.name || "On-Site User"}${me.phone ? ` (${me.phone})` : ""}! GPS: ${where}` });
    S.save(); if (Backend.on) Backend.flush();
    broadcastSafetyUpdate({ incidentId: inc.id });
  });
};

// Voice recording helper (works in both SOS modal and Security Tactical Channel)
async function toggleVoiceRecorder(btnEl, previewSel, onSaved) {
  if (mediaRec && mediaRec.state === "recording") {
    mediaRec.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    // Fallback simulated voice clip in environments without a physical microphone
    const synth = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    onSaved(synth);
    const box = $(previewSel);
    if (box) box.innerHTML = flat(html`<div class="voice-chip"><span>🎙️ Voice message attached (ready to send)</span></div>`);
    toast("Voice note attached");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaChunks = [];
    mediaRec = new MediaRecorder(stream);
    mediaRec.ondataavailable = (e) => { if (e.data.size > 0) mediaChunks.push(e.data); };
    mediaRec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(mediaChunks, { type: mediaRec.mimeType || "audio/webm" });
      const dataUrl = await readAsDataUrl(blob);
      onSaved(dataUrl);
      if (btnEl) btnEl.textContent = "🎙️ Re-record voice message";
      const box = $(previewSel);
      if (box) box.innerHTML = flat(html`<div class="voice-chip"><audio controls src="${dataUrl}" style="height:32px;max-width:240px"></audio><span class="tag ok">Recorded</span></div>`);
    };
    mediaRec.start();
    if (btnEl) btnEl.textContent = "⏹️ Stop recording...";
  } catch {
    toast("Microphone permission needed to record audio.");
  }
}

Actions["sos-voice-toggle"] = (el) => {
  toggleVoiceRecorder(el, "#sos-voice-preview", (url) => { sosVoiceDataUrl = url; });
};

Inputs["sos-media-file"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  const box = $("#sos-media-preview");
  if (file.type.startsWith("image/")) {
    sosMediaDataUrl = await readImage(file, 1280);
    sosMediaKind = "image";
    if (box) box.innerHTML = flat(html`<div style="margin-top:8px"><img src="${sosMediaDataUrl}" alt="Attached photo" style="max-height:140px;border-radius:10px"></div>`);
  } else if (file.type.startsWith("video/")) {
    if (file.size > 8 * 1024 * 1024) { toast("Keep video clips under 8 MB for instant dispatch."); return; }
    sosMediaDataUrl = await readAsDataUrl(file);
    sosMediaKind = "video";
    if (box) box.innerHTML = flat(html`<div style="margin-top:8px"><video src="${sosMediaDataUrl}" controls style="max-height:140px;border-radius:10px"></video></div>`);
  }
};

Forms["sos-alert-security"] = async (d, f) => {
  const details = String(d.details || "").trim();
  if (!details && !sosVoiceDataUrl && !sosMediaDataUrl) {
    return formError(f, "Describe the issue, record a voice message, or attach a photo/video.");
  }
  const btn = $("button.btn.block", f);
  if (btn) { btn.disabled = true; btn.textContent = "Sending to Security Team..."; }
  const gps = d.shareGps ? await getQuickGpsFix() : null;
  const mapUrl = gps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : "";
  const me = S.me();
  const catLabels = {
    suspicious: "Suspicious Individual / Activity",
    medical: "Medical Assistance Needed",
    missing_child: "Missing / Lost Child (Code Adam)",
    door: "Door / Entryway Won't Lock",
    disturbance: "Campus Disturbance",
    other: "Security Assistance Request",
  };
  const catTitle = catLabels[d.category] || "Security Alert";
  const suggestedLevel = { door: 1, suspicious: 2, missing_child: 3, disturbance: 4, medical: 2, other: 1 }[d.category] || 1;

  const inc = S.add("securityIncidents", {
    kind: "MEMBER_ALERT",
    category: catTitle,
    rawCategory: d.category,
    suggestedLevel,
    severity: ["missing_child", "medical", "disturbance"].includes(d.category) ? "high" : "medium",
    by: me.id,
    reporterName: me.name || "On-Site Member",
    reporterPhone: me.phone || "",
    room: String(d.room || "").trim() || "On Campus",
    details: details || "(Voice / Media attachment)",
    voiceUrl: sosVoiceDataUrl || "",
    mediaUrl: sosMediaDataUrl || "",
    mediaKind: sosMediaKind || "",
    gps,
    mapUrl,
    status: "open",
    at: new Date().toISOString(),
  });

  S.add("securityMessages", {
    by: me.id,
    senderName: me.name || "On-Site Member",
    priority: "urgent",
    text: `⚠️ [${catTitle}] ${d.room ? `(${d.room}) ` : ""}${details || "Sent voice/media alert"}`,
    voiceUrl: sosVoiceDataUrl || "",
    mediaUrl: sosMediaDataUrl || "",
    mediaKind: sosMediaKind || "",
    gps,
    mapUrl,
    incidentId: inc.id,
    at: new Date().toISOString(),
  });

  securityTeamUserIds().forEach((u) => notify(u, {
    kind: "security",
    title: `Security Alert: ${catTitle}`,
    body: `${me.name}${d.room ? ` at ${d.room}` : ""}: ${details.slice(0, 100) || "Voice/photo attached"}`,
    link: "#security-incidents",
  }));

  logActivity(`Security alert submitted by ${me.name}: ${catTitle}`, "security");
  S.save();
  broadcastSafetyUpdate({ incidentId: inc.id });
  closeSheet(true);
  toast("Security Team has been alerted and received your report.");
  render();
};

// ----- 2. Automated Protocol Activation Engine (Levels 1 to 5 & Drill Mode Support) -----
let protocolTransitionPending = false;
async function activateSecurityProtocol(levelNum, { customNote = "", incidentId = "", isDrill = false, drillFunctions = null, drillRealStaffIds = null, request = null } = {}) {
  let c = S.church();
  if (!c || (isDrill ? !canLeadSecurity() : !canSuperviseSecurity()) || (!isDrill && protocolTransitionPending)) return;
  const proto = (c.securityProtocols || defaultSecurityProtocols()).find((p) => +p.level === +levelNum);
  if (!proto) return;

  const fn = drillFunctions || {
    notifications: true,
    displays: true,
    homeBanner: true,
    doors: true,
    rollCall: true,
    reunification: true,
    medical: true,
  };

  const now = new Date().toISOString();
  const prefix = isDrill ? "🧪 [DRILL] " : "";
  let effectiveDoors = isDrill ? !!fn.doors : !!proto.requireDoorCheck;
  const effectiveDisplays = isDrill ? (!!fn.displays && !!proto.overrideDisplays) : !!proto.overrideDisplays;
  let effectiveRollCall = isDrill ? !!fn.rollCall : !!proto.requireRollCall;
  const effectiveHomeBanner = isDrill ? !!fn.homeBanner : true;

  const nextAlert = {
    active: true,
    isDrill: !!isDrill,
    level: proto.level,
    code: `${prefix}${proto.code}`,
    name: `${prefix}${proto.name}`,
    color: isDrill ? "#7c3aed" : proto.color,
    summary: customNote || proto.summary,
    broadcastText: `${prefix}${proto.broadcastText || `${proto.code}: ${proto.name}. ${customNote || proto.summary}`}`,
    overrideDisplays: effectiveDisplays,
    requireDoorCheck: effectiveDoors,
    requireRollCall: effectiveRollCall,
    showHomeBanner: effectiveHomeBanner,
    enableReunification: isDrill ? !!fn.reunification : true,
    enableMedical: isDrill ? !!fn.medical : true,
    incidentId: incidentId || null,
    startedAt: now,
    startedBy: S.me().id,
    startedByName: S.me().name,
  };

  if (!isDrill && Backend.on) {
    protocolTransitionPending = true;
    try {
      const { data, error } = await Backend.client.rpc("security_protocol", {
        c: c.id, action: request ? "approve" : "declare", level_no: +levelNum, request_id: request?.id || null,
        alert: nextAlert, incident_id: incidentId || null,
      });
      if (error) throw error;
      if (S.state.current !== c.id || S.me().id !== nextAlert.startedBy) return;
      c = S.church();
      if (data.status === "pending") {
        if (!S.get("securityProtocolRequests", data.id)) S.add("securityProtocolRequests", {
          id: data.id, at: data.at, level: +levelNum, incidentId, requestedBy: S.me().id, status: "pending",
        });
        toast("Request sent to the head of security and church administrators.");
        render();
        return;
      }
      if (request) {
        const currentRequest = S.get("securityProtocolRequests", request.id);
        if (currentRequest) currentRequest.status = "approved";
      }
      c.activeAlert = data.alert;
      effectiveDoors = !!data.alert.requireDoorCheck;
      effectiveRollCall = !!data.alert.requireRollCall;
    } catch (error) {
      toast(error.message || "Could not declare the security protocol.");
      return;
    } finally { protocolTransitionPending = false; }
  } else {
    if (!isDrill && +levelNum > directSecurityLevel()) {
      requestSecurityProtocol(levelNum, incidentId);
      return;
    }
    if (!isDrill && (c.activeDrill?.active || (c.activeAlert?.active && +c.activeAlert.level >= +levelNum))) {
      return toast("End the drill or choose a higher level than the active protocol.");
    }
    c.activeAlert = nextAlert;
    if (request) request.status = "approved";
  }

  // If door verification is included, reset doors to "pending" so real or simulated assignees verify them fresh
  if (effectiveDoors) {
    (c.securityDoors || []).forEach((d) => {
      d.status = "pending";
      d.verifiedBy = "";
      d.verifiedAt = "";
      d.issueNote = "";
    });
  }

  // If roll call & classroom headcount is included, build/refresh the roll call roster
  if (effectiveRollCall) {
    generateEmergencyRollCall({ resetForDrill: isDrill });
  }

  // Determine notification recipients based on protocol level scope & Drill Real-Staff Preselection
  if (!isDrill || fn.notifications) {
    let recipients = [];
    if (isDrill && Array.isArray(drillRealStaffIds)) {
      recipients = drillRealStaffIds.filter((u) => S.user(u));
    } else if (proto.notifyScope === "everyone") {
      recipients = S.members().map((m) => m.userId).filter((u) => S.user(u));
    } else if (proto.notifyScope === "staff_volunteers") {
      recipients = staffAndVolunteersUserIds();
    } else {
      recipients = securityTeamUserIds();
    }

    const linkTarget = isDrill ? "#security-drill" : effectiveRollCall ? "#safety-status" : effectiveDoors ? "#security-doors" : "#security";
    recipients.forEach((u) => notify(u, {
      kind: "security",
      title: `${isDrill ? "🧪 [SAFETY DRILL]" : "🚨"} ${proto.code}: ${proto.name}`,
      body: customNote || proto.broadcastText || proto.summary,
      link: linkTarget,
    }));
  }

  // Post into the Security Tactical Channel
  const msgRec = S.add("securityMessages", {
    by: S.me().id,
    senderName: isDrill ? `Drill Simulator (${S.me().name})` : S.me().name,
    priority: "urgent",
    isDrill: !!isDrill,
    text: `${isDrill ? "🧪 [DRILL ACTIVATED]" : "🚨 ACTIVATED"} ${proto.code} — ${proto.name.toUpperCase()}: ${customNote || proto.summary}`,
    at: now,
  });

  if (incidentId) {
    const inc = S.get("securityIncidents", incidentId);
    if (inc) inc.status = `${isDrill ? "Drill " : ""}Level ${proto.level} Active`;
  }

  logActivity(`Activated ${isDrill ? "Safety Drill " : "Security Protocol "}${proto.code}: ${proto.name}`, "security");
  S.save();
  broadcastSafetyUpdate({ msgId: msgRec.id, spokenText: msgRec.text });
  toast(`${prefix}${proto.code} (${proto.name}) activated!`);
  render();
}

async function clearSecurityProtocol() {
  let c = S.church();
  if (!c?.activeAlert || !canLeadSecurity() || protocolTransitionPending) return;
  let old = c.activeAlert;
  if (Backend.on && !old.isDrill) {
    protocolTransitionPending = true;
    const userId = S.me().id;
    try {
      const { data, error } = await Backend.client.rpc("security_protocol", { c: c.id, action: "clear" });
      if (error) throw error;
      if (S.state.current !== c.id || S.me().id !== userId) return;
      c = S.church();
      old = data.previousAlert;
    } catch (error) {
      toast(error.message || "Could not issue All Clear.");
      return;
    } finally { protocolTransitionPending = false; }
  }
  c.activeAlert = null;
  S.add("securityMessages", {
    by: S.me().id,
    senderName: S.me().name,
    priority: "routine",
    text: `✅ ALL CLEAR issued by ${S.me().name} (Ended ${old.code}: ${old.name}). Normal operations resumed.`,
    at: new Date().toISOString(),
  });
  S.members().forEach((m) => notify(m.userId, {
    kind: "security",
    title: `✅ All Clear — ${c.name}`,
    body: `${old.code} (${old.name}) has concluded. Thank you for your cooperation.`,
    link: "#home",
  }));
  logActivity(`Issued All Clear for ${old.code}`, "security");
  S.save();
  broadcastSafetyUpdate();
  toast("All Clear issued. All displays and screens restored to normal.");
  render();
}

/** Compiles the live Roll Call of everyone known to be on campus today (from Presence, Kids Check-In, Serving, and Events). */
function generateEmergencyRollCall({ resetForDrill = false } = {}) {
  const c = S.church(), today = isoDay(new Date());
  if (!c) return [];
  if (resetForDrill) {
    S.state.securityRollCall = (S.state.securityRollCall || []).filter((r) => r.churchId !== c.id);
  }
  const existing = new Map(S.list("securityRollCall").map((r) => [r.personKey, r]));
  const upsert = (personKey, rec) => {
    const prev = existing.get(personKey);
    if (prev) {
      Object.assign(prev, { name: rec.name, group: rec.group, room: rec.room, kind: rec.kind, contact: rec.contact });
    } else {
      const added = S.add("securityRollCall", {
        personKey,
        status: "unaccounted", // "safe" | "unaccounted" | "missing"
        safeZone: "",
        checkedBy: "",
        checkedAt: "",
        ...rec,
      });
      existing.set(personKey, added);
    }
  };

  // 1. Checked-in kids in classrooms (highest priority for teacher headcount!)
  S.list("checkins").filter((k) => !k.out && k.serviceKey?.slice(0, 10) >= today).forEach((k) => {
    upsert(`kid:${k.childId || k.childName}`, {
      name: k.childName,
      kind: "Child (Kids Check-In)",
      group: k.room || "Kids Room",
      room: k.room || "Kids Wing",
      parentId: k.by,
      contact: `${k.parentName || S.userName(k.by)} (Code ${k.code})`,
    });
  });

  // 2. Kids & Adults enrolled in today's classes/groups
  S.list("gatherings").filter((g) => g.type === "class").forEach((g) => {
    (g.members || []).filter((m) => m.status === "in").forEach((m) => {
      const key = m.childId ? `kid:${m.childId}` : `user:${m.userId}`;
      if (!existing.has(key)) {
        upsert(key, {
          name: m.name || S.userName(m.userId),
          kind: m.childId ? "Child (Class Roster)" : "Class Member",
          group: g.name,
          room: g.room || g.name,
          parentId: m.userId,
          contact: S.user(m.userId)?.phone || S.userName(m.userId),
        });
      }
    });
  });

  // 3. Members & Staff marked present today (via Geofence or manual check-in)
  S.list("presence").filter((p) => p.date === today).forEach((p) => {
    upsert(`user:${p.userId}`, {
      name: p.name || S.userName(p.userId),
      kind: p.roleType === "staff" ? "Staff" : p.roleType === "volunteer" ? `Volunteer (${p.team || "Team"})` : "Member On-Site",
      group: p.team || "Sanctuary / Main Campus",
      room: p.position || "Main Campus",
      userId: p.userId,
      contact: S.user(p.userId)?.phone || "",
    });
  });

  // 4. Volunteers checked in to serve today
  S.list("serving").filter((sv) => (sv.serviceKey || "").startsWith(today)).forEach((sv) => {
    upsert(`user:${sv.by}`, {
      name: sv.name || S.userName(sv.by),
      kind: `Volunteer (${sv.team})`,
      group: sv.team,
      room: sv.position || sv.team,
      userId: sv.by,
      contact: S.user(sv.by)?.phone || "",
    });
  });

  // Ensure current signed-in user & core team members are on the roll call so it's immediately testable
  if (S.isMember()) {
    upsert(`user:${S.me().id}`, {
      name: S.me().name,
      kind: isStaffMember(S.me().id) ? "Staff / Leader" : "Member On-Site",
      group: "Sanctuary / Main Campus",
      room: "Main Sanctuary",
      userId: S.me().id,
      contact: S.me().phone || S.me().email || "",
    });
  }
  // If running a drill or demo and no kids are currently in checkins, include simulated classroom children so teachers/simulated teachers can practice headcount & reunification
  if (!S.list("securityRollCall").some((r) => r.kind.includes("Child"))) {
    [
      { key: "sim-kid-1", name: "Liam Carter (Age 5)", group: "Kids Kingdom (K–2nd)", room: "Room 102", contact: "Hannah Carter · Pickup Code 4829" },
      { key: "sim-kid-2", name: "Noah Carter (Age 7)", group: "Kids Kingdom (K–2nd)", room: "Room 102", contact: "Hannah Carter · Pickup Code 4829" },
      { key: "sim-kid-3", name: "Chloe Davis (Age 3)", group: "Sprouts Toddlers", room: "Nursery B", contact: "Ben Davis · Pickup Code 7314" },
      { key: "sim-kid-4", name: "Ava Morales (Age 9)", group: "3rd–5th Grade Loft", room: "Room 204", contact: "Elena Morales · Pickup Code 9152" },
    ].forEach((sk) => {
      upsert(sk.key, {
        name: sk.name,
        kind: "Child (Kids Check-In)",
        group: sk.group,
        room: sk.room,
        contact: sk.contact,
        simulated: true,
      });
    });
  }
  S.save();
  return S.list("securityRollCall");
}

/** Role-specific step-by-step instructions for the current user during an active protocol. */
function myProtocolSteps(proto) {
  if (!proto?.stepsByRole) return [];
  if (isSecurityMember()) return proto.stepsByRole.security || [];
  const leadsClass = S.list("gatherings").some((g) => (g.leaders || []).includes(S.me().id)) || S.can("checkin.station") || S.can("teach.classes");
  if (leadsClass) return proto.stepsByRole.teachers || [];
  if (isStaffMember() || myTeams().length) return proto.stepsByRole.staff || [];
  return proto.stepsByRole.members || [];
}

// ----- 3. Dedicated Security Staff Interface (#security, #security-incidents, #security-doors, #security-rollcall, #security-protocols) -----
let secVoiceClip = "";
let secMediaClip = "";
let secMediaKind = "";
let rollCallGroupFilter = "ALL";

function securitySeg(active) {
  const drillOn = !!S.church()?.activeDrill?.active, access = securitySections();
  const cleared = new Set(access.incidents ? S.list("securityIncidentEvents").filter((event) => event.type === "clear").map((event) => event.incidentId) : []);
  const openInc = access.incidents ? S.list("securityIncidents").filter((inc) => inc.status !== "resolved" && !cleared.has(inc.id)).length : 0;
  const unacc = S.list("securityRollCall").filter((r) => r.status !== "safe").length;
  return seg([
    ["security", "Tactical Comms", isSecurityMember()],
    ["security-drill", `Drill Simulator${drillOn ? " (LIVE)" : ""}`, access.drill],
    ["security-incidents", `Incidents${openInc ? ` (${openInc})` : ""}`, access.incidents],
    ["security-doors", "Doors & Entryways", access.doors],
    ["security-rollcall", `Roll Call${unacc ? ` (${unacc})` : ""}`, access.rollcall],
    ["security-reunify", "Child Reunification", access.reunify],
    ["security-medical", "Medical & AED", access.medical],
    ["security-protocols", "5-Level Protocols", access.protocols],
    ["security-access", "Access & approvals", access.access],
  ], active, { label: "Security Command sections", className: "sec-nav" });
}

Screens.security = (tail = "") => {
  if (!S.church()) return { redirect: "churches" };
  const incidentRoute = tail.startsWith("incidents-") ? tail.slice("incidents-".length) : "";
  const sub = incidentRoute ? "incidents" : ["drill", "incidents", "doors", "rollcall", "reunify", "medical", "protocols", "access"].includes(tail) ? tail : "";
  if (!sub && !isSecurityMember()) return { redirect: "safety-status" };
  if (sub && !securitySections()[sub]) return { redirect: isSecurityMember() ? "security" : "home" };
  const activeHash = sub ? `security-${sub}` : "security";
  const c = S.church(), alert = c.activeAlert, drill = c.activeDrill;

  let bodyContent = "";
  if (!sub) {
    const scope = `${c.id}:${S.me().id}`;
    if (scope !== secCommsScope) clearSecurityDraft();
    secCommsScope = scope;
    bodyContent = renderSecurityComms(c);
  }
  else if (sub === "drill") bodyContent = renderSecurityDrillSimulator(c);
  else if (sub === "incidents") bodyContent = renderSecurityIncidents(c, incidentRoute);
  else if (sub === "doors") bodyContent = renderSecurityDoors(c);
  else if (sub === "rollcall") bodyContent = renderSecurityRollCall(c);
  else if (sub === "reunify") bodyContent = renderSecurityReunification(c);
  else if (sub === "medical") bodyContent = renderSecurityMedical(c);
  else if (sub === "protocols") bodyContent = renderSecurityProtocolGenerator(c);
  else if (sub === "access") bodyContent = renderSecurityAccess(c);

  return {
    title: "Security Command", back: hasAdminTools() ? "admin" : "home",
    body: html`
      ${!sub ? renderSecurityChannelHeader() : ""}
      ${securitySeg(activeHash)}
      ${drill?.active && canLeadSecurity() ? renderActiveDrillTelemetryBar(c, drill) : ""}
      ${alert?.active ? renderActiveProtocolBanner(alert) : sub ? html`
        <div class="panel" style="margin-top:12px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div><span class="tag ok">STATUS: NORMAL OPERATIONS</span> <span class="faint" style="margin-left:6px">${plural(securityTeamUserIds().length, "security member")} on roster</span></div>
          <div class="btns" style="margin:0">
            ${canLeadSecurity() ? html`<a class="btn ghost sm" href="#security-drill">Launch Safety Drill Simulator</a>` : ""}
            ${canSuperviseSecurity() ? html`<button type="button" class="btn danger sm" data-act="sec-trigger-modal">${icon("shield")}Declare protocol</button>` : ""}
          </div>
        </div>` : ""}
      ${bodyContent}
    `,
  };
};
AdminScreens.security = () => Screens.security("protocols");

function renderActiveProtocolBanner(alert) {
  const c = S.church();
  const proto = (c.securityProtocols || defaultSecurityProtocols()).find((p) => +p.level === +alert.level);
  const steps = proto ? myProtocolSteps(proto) : [];
  const myRoll = S.list("securityRollCall").find((r) => r.personKey === `user:${S.me().id}`);
  const isSafe = myRoll?.status === "safe";

  return html`<div class="sec-active-alert" style="--alert-col:${alert.color || "#dc2626"}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div>
        <span class="sec-alert-pill">${alert.code} ACTIVE · ${fmtTime(alert.startedAt)}</span>
        <h2 style="margin:6px 0 4px;color:#fff">${alert.name}</h2>
        <p style="margin:0;color:rgba(255,255,255,.92)">${alert.broadcastText || alert.summary}</p>
      </div>
      <div class="btns" style="margin:0">
        ${!isSafe ? html`<button type="button" class="btn sm" style="background:#16a34a;color:#fff" data-act="mark-myself-safe">${icon("check")}Mark Myself Safe</button>` : html`<span class="tag ok">You are marked SAFE</span>`}
        ${canLeadSecurity() ? html`<button type="button" class="btn ghost sm" style="background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.35)" data-act="sec-all-clear">Issue All Clear</button>` : ""}
      </div>
    </div>
    ${steps.length ? html`<div class="sec-role-steps">
      <b>Your Step-by-Step Protocol (${S.role()?.name || "Member"}):</b>
      <ol>${steps.map((st) => html`<li>${st}</li>`)}</ol>
    </div>` : ""}
  </div>`;
}

// Tab 1: Security communications
function renderSecurityChannelHeader() {
  return html`<section class="sec sec-channel-header">
    <div class="sec-head"><h2>Security channel</h2></div>
    <div class="btns">
      <button type="button" class="btn ghost sm" data-act="sec-earpiece-toggle" aria-pressed="${secEarpieceMode}">Earpiece: ${secEarpieceMode ? "On" : "Off"}</button>
      <button type="button" class="btn ghost sm" data-act="sec-drop-gps">${icon("pin")}Share location</button>
    </div>
  </section>`;
}

function renderSecurityComms(c) {
  const msgs = S.list("securityMessages").sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  const protos = c.securityProtocols || defaultSecurityProtocols();
  return html`
    ${canSuperviseSecurity() ? html`<details class="sec sec-protocol-options">
      <summary>Protocol escalation</summary>
      <div class="btns">
        <button type="button" class="btn danger sm" data-act="sec-trigger-modal">${icon("shield")}Activate live protocol</button>
        ${canLeadSecurity() ? html`<a class="btn ghost sm" href="#security-protocols">Customize protocols</a>` : ""}
      </div>
      <div class="sec-level-strip">
        ${protos.map((p) => html`<button type="button" class="sec-level-btn ${c.activeAlert?.level === p.level ? "is-active" : ""}" style="--lvl-col:${p.color}" data-act="sec-activate-level" data-level="${p.level}">
          <b>${p.code}</b><span>${p.name}</span>${+p.level > directSecurityLevel() ? html`<small>Approval required</small>` : ""}
        </button>`)}
      </div>
    </details>` : ""}

    <section class="sec" aria-label="Security messages">
      <div class="panel sec-chat-box">
        <div class="sec-chat-feed" id="sec-chat-feed">
          ${msgs.length ? msgs.map((m) => html`
            <div class="sec-msg ${m.priority === "urgent" ? "urgent" : ""} ${m.by === S.me().id ? "mine" : ""}">
              <div class="sec-msg-head">
                <b>${m.senderName || S.userName(m.by)}</b>
                <span class="faint">${fmtTime(m.at)}</span>
                ${m.priority === "urgent" ? html`<span class="tag warn">URGENT</span>` : ""}
              </div>
              ${m.text ? html`<p style="margin:4px 0">${m.text}</p>` : ""}
              ${m.voiceUrl ? html`<div style="margin-top:6px"><audio controls src="${m.voiceUrl}" style="height:34px;max-width:100%"></audio></div>` : ""}
              ${m.mediaUrl && m.mediaKind === "image" ? html`<div style="margin-top:6px"><img src="${m.mediaUrl}" alt="Security photo" style="max-height:180px;border-radius:10px"></div>` : ""}
              ${m.mediaUrl && m.mediaKind === "video" ? html`<div style="margin-top:6px"><video src="${m.mediaUrl}" controls style="max-height:180px;border-radius:10px"></video></div>` : ""}
              ${m.mapUrl ? html`<div style="margin-top:6px"><a class="btn ghost sm" href="${m.mapUrl}" target="_blank" rel="noopener">${icon("pin")}Open GPS Location on Map</a></div>` : ""}
            </div>
          `) : empty("No tactical messages yet. Use the bar below to message, record voice audio, or upload photos/video to all security staff.")}
        </div>

      </div>
    </section>

    <form data-form="sec-chat-send" class="sec-chat-form" novalidate aria-label="Security communications">
      <div id="sec-chat-voice-prev">${securityVoicePreview()}</div>
      <div id="sec-chat-media-prev">${securityMediaPreview()}</div>
      <div class="sec-chat-controls">
        <button type="button" class="btn sm" data-act="sec-chat-voice" ${attr(secVoiceRecording && secVoiceRecording.recorder?.state !== "recording", "disabled")}>${securityVoiceLabel()}</button>
        <label class="btn ghost sm sec-chat-media">Media<input type="file" aria-label="Attach photo or video" accept="image/*,video/*" capture="environment" data-change="sec-chat-media" class="sr"></label>
        <select name="priority" data-change="sec-chat-priority" aria-label="Message priority"><option value="routine">Routine</option><option value="urgent" ${attr(secChatPriority === "urgent", "selected")}>Urgent</option></select>
      </div>
      <div class="sec-chat-text">
        <input type="text" name="text" data-input="sec-chat-text" value="${secChatText}" aria-label="Security message" placeholder="Message security staff…" maxlength="800">
        <button type="submit" class="btn sm" ${attr(secVoiceRecording, "disabled")}>${icon("send")}Send</button>
      </div>
    </form>
  `;
}

let secCommsScope = "";
let secChatText = "";
let secChatPriority = "routine";
let secVoiceRecording = null;
function clearSecurityDraft() {
  const recording = secVoiceRecording;
  secVoiceRecording = null;
  if (recording?.recorder?.state === "recording") recording.recorder.stop();
  secVoiceClip = ""; secMediaClip = ""; secMediaKind = "";
  secChatText = ""; secChatPriority = "routine";
}
window.addEventListener("hashchange", () => {
  if (location.hash !== "#security") {
    clearSecurityDraft();
    secCommsScope = "";
  }
});

const securityVoiceLabel = () => {
  if (!secVoiceRecording) return secVoiceClip ? "Re-record voice" : "Record voice";
  if (!secVoiceRecording.recorder) return "Opening mic…";
  return secVoiceRecording.recorder.state === "recording" ? "Stop recording" : "Preparing clip…";
};
const securityVoicePreview = () => secVoiceClip && !secVoiceRecording ? html`<div class="voice-chip">
  <audio controls src="${secVoiceClip}" aria-label="Recorded voice preview"></audio>
  <button type="button" class="btn ghost sm" data-act="sec-chat-remove-voice">Remove</button>
</div>` : "";
const securityMediaPreview = () => !secMediaClip ? "" : html`<div class="voice-chip">
  ${secMediaKind === "image" ? html`<img src="${secMediaClip}" alt="Attachment preview">` : html`<video src="${secMediaClip}" controls aria-label="Attachment preview"></video>`}
  <button type="button" class="btn ghost sm" data-act="sec-chat-remove-media">Remove</button>
</div>`;

function refreshSecurityVoice() {
  const form = $('[data-form="sec-chat-send"]');
  if (!form) return;
  const button = $('[data-act="sec-chat-voice"]', form);
  button.textContent = securityVoiceLabel();
  button.disabled = !!secVoiceRecording && secVoiceRecording.recorder?.state !== "recording";
  $("#sec-chat-voice-prev").innerHTML = flat(securityVoicePreview());
  $('button[type="submit"]', form).disabled = !!secVoiceRecording;
}

Actions["sec-chat-voice"] = async () => {
  if (secVoiceRecording) {
    if (secVoiceRecording.recorder?.state === "recording") secVoiceRecording.recorder.stop();
    refreshSecurityVoice();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    return toast("Microphone recording is unavailable on this device.");
  }
  const recording = {};
  secVoiceRecording = recording;
  refreshSecurityVoice();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (secVoiceRecording !== recording) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const recorder = recording.recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      if (secVoiceRecording !== recording) return;
      try {
        const url = chunks.length ? await readAsDataUrl(new Blob(chunks, { type: recorder.mimeType })) : "";
        if (secVoiceRecording === recording && url) secVoiceClip = url;
      } catch {
        toast("Could not prepare the voice clip.");
      } finally {
        if (secVoiceRecording === recording) {
          secVoiceRecording = null;
          refreshSecurityVoice();
        }
      }
    };
    recorder.start();
    refreshSecurityVoice();
  } catch {
    stream?.getTracks().forEach((track) => track.stop());
    if (secVoiceRecording === recording) {
      secVoiceRecording = null;
      refreshSecurityVoice();
      toast("Could not start recording. Check microphone permission.");
    }
  }
};
Actions["sec-chat-remove-voice"] = () => { secVoiceClip = ""; refreshSecurityVoice(); };
Actions["sec-chat-remove-media"] = () => {
  secMediaClip = ""; secMediaKind = "";
  $("#sec-chat-media-prev").textContent = "";
  $('[data-change="sec-chat-media"]').value = "";
};
Inputs["sec-chat-media"] = async (el) => {
  const file = el.files?.[0]; if (!file) return;
  const scope = secCommsScope;
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "";
  if (!kind) return;
  try {
    const url = kind === "image" ? await readImage(file, 1280) : await readAsDataUrl(file);
    if (scope !== secCommsScope || !$('[data-form="sec-chat-send"]')) return;
    secMediaClip = url;
    secMediaKind = kind;
    $("#sec-chat-media-prev").innerHTML = flat(securityMediaPreview());
  } catch { toast("Could not open that attachment."); }
};
Inputs["sec-chat-text"] = (el) => { secChatText = el.value; };
Inputs["sec-chat-priority"] = (el) => { secChatPriority = el.value; };
Forms["sec-chat-send"] = (d, f) => {
  if (secVoiceRecording) return;
  const text = String(d.text || "").trim();
  if (!text && !secVoiceClip && !secMediaClip) return;
  S.add("securityMessages", {
    by: S.me().id,
    senderName: S.me().name,
    priority: d.priority || "routine",
    text,
    voiceUrl: secVoiceClip || "",
    mediaUrl: secMediaClip || "",
    mediaKind: secMediaKind || "",
    at: new Date().toISOString(),
  });
  if (d.priority === "urgent") {
    securityTeamUserIds().filter((u) => u !== S.me().id).forEach((u) => notify(u, {
      kind: "security",
      title: `Security Dispatch (${S.me().name})`,
      body: text || "Sent a voice or video clip in Tactical Comms",
      link: "#security",
    }));
  }
  clearSecurityDraft();
  S.save(); f.reset(); broadcastSafetyUpdate(); render();
};
Actions["sec-drop-gps"] = async () => {
  toast("Acquiring GPS coordinates...");
  const gps = await getQuickGpsFix();
  const mapUrl = gps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : "";
  S.add("securityMessages", {
    by: S.me().id,
    senderName: S.me().name,
    priority: "routine",
    text: `📍 Shared live GPS location${gps ? ` (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})` : ""}`,
    gps,
    mapUrl,
    at: new Date().toISOString(),
  });
  S.save(); broadcastSafetyUpdate(); render();
};

// Tab 2: Active Incidents & Triage
const INCIDENT_PRIORITY = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const INCIDENT_UPDATE = {
  note: "Staff note", assistance: "Need further assistance", dispatched: "Emergency services dispatched",
  available: "Call all available responders", clear: "Resolved / All clear",
};
const INCIDENT_REPORT_FIELDS = [
  { id: "summary", label: "Accident / incident summary", type: "long", required: true },
  { id: "people", label: "People involved", type: "long", required: true },
  { id: "injuries", label: "Injuries, medical care, or property damage", type: "long" },
  { id: "witnesses", label: "Witnesses and contact information", type: "long" },
  { id: "actions", label: "Steps taken to resolve the incident", type: "long", required: true },
  { id: "services", label: "Emergency services involvement", type: "choice", options: ["None", "Police", "Fire", "EMS", "Multiple services"] },
  { id: "procedures", label: "Policies or procedures followed", type: "long" },
  { id: "prevention", label: "Corrective or preventive action", type: "long" },
  { id: "followup", label: "Follow-up required", type: "long" },
];

function defaultIncidentReportTemplate() {
  return { id: "standard", name: "Standard accident / incident report", fields: INCIDENT_REPORT_FIELDS, isDefault: true };
}

function incidentReportTemplates() {
  const saved = S.list("securityIncidentFormTemplates");
  return [{ ...defaultIncidentReportTemplate(), isDefault: !saved.some((t) => t.isDefault) }, ...saved];
}

function incidentReports() {
  const actor = S.me().id, lead = canLeadSecurity();
  return S.list("securityIncidentReports").filter((report) => lead || report.assignedTo === actor || report.createdBy === actor)
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
}

function incidentSections(active) {
  return seg([["security-incidents", "Active queue"], ["security-incidents-history", "Cleared history"],
    ["security-incidents-reports", "Report queue"], ["security-incidents-dashboard", "Dashboard"],
    ["security-incidents-forms", "Report forms", canLeadSecurity()]], active, { label: "Incident sections", className: "sec-nav" });
}

function securityIncidentRows() {
  const timeline = new Map();
  for (const event of S.list("securityIncidentEvents")) {
    if (!timeline.has(event.incidentId)) timeline.set(event.incidentId, []);
    timeline.get(event.incidentId).push(event);
  }
  const priorityOrder = Object.keys(INCIDENT_PRIORITY);
  return S.list("securityIncidents").map((inc) => {
    const events = (timeline.get(inc.id) || []).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
    const severity = events.find((e) => e.type === "triage")?.value || inc.severity;
    const clear = events.find((e) => e.type === "clear");
    let firstArrivalAt;
    for (const event of events) if (event.type === "arrive") firstArrivalAt = event.at;
    return {
      inc, events, priority: priorityOrder.includes(severity) ? severity : "medium",
      cleared: inc.status === "resolved" || !!clear,
      clearedAt: clear?.at || inc.resolvedAt,
      firstArrivalAt,
      legacyCleared: inc.status === "resolved" && !clear,
      acknowledged: events.some((e) => e.type === "ack" && e.by === S.me().id),
    };
  }).sort((a, b) => Number(a.cleared) - Number(b.cleared) ||
    priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority) || Date.parse(b.inc.at) - Date.parse(a.inc.at));
}

function renderSecurityIncidents(c, selection) {
  if (selection === "forms") return renderIncidentReportTemplates();
  if (selection === "reports") return renderIncidentReportQueue();
  if (selection === "dashboard") return renderIncidentDashboard();
  const all = securityIncidentRows(), history = selection === "history";
  const selected = selection && !history ? all.find(({ inc }) => inc.id === selection) : null;
  const list = history ? all.filter((row) => row.cleared)
    .sort((a, b) => Date.parse(b.clearedAt || b.inc.at) - Date.parse(a.clearedAt || a.inc.at))
    : selection ? (selected ? [selected] : []) : all.filter((row) => !row.legacyCleared && !row.acknowledged);
  const protos = c.securityProtocols || defaultSecurityProtocols(), reports = incidentReports();
  return html`
    <section class="sec">
      <div class="sec-head">
        <h2>${selected ? "Incident details" : "Incident triage"}</h2>
        <button type="button" class="btn ghost sm" data-act="sos-open">${icon("plus")}Log incident</button>
      </div>
      ${incidentSections(history ? "security-incidents-history" : "security-incidents")}
      <div class="rows">
        ${list.length ? list.map((row) => renderSecurityIncident(row, protos, reports.filter((report) => report.incidentId === row.inc.id), !!selected)) : empty(history ? "No cleared incidents." : selection ? "This incident is unavailable." : "No incidents in your active queue.")}
      </div>
    </section>
  `;
}

function renderSecurityIncident({ inc, events, priority, cleared, clearedAt, firstArrivalAt, acknowledged, legacyCleared }, protos, reports, showTimes) {
  const responders = events.filter((e) => e.type === "respond");
  const assignments = events.filter((e) => e.type === "assign");
  const arrivals = new Set(events.filter((e) => e.type === "arrive").map((e) => e.by));
  const responding = responders.some((e) => e.by === S.me().id);
  const latest = events.find((e) => ["assistance", "dispatched", "available"].includes(e.type));
  const state = cleared ? "Cleared" : latest ? INCIDENT_UPDATE[latest.type] : responders.length ? "Responding" : "Awaiting response";
  const categoryTone = inc.kind === "911_CALL" ? "emergency" : inc.kind === "MEDICAL_ALERT" || inc.rawCategory === "medical" ? "medical" : inc.rawCategory === "missing_child" ? "reunification" : "general";
  const button = (type, label) => html`<button type="button" class="btn ghost sm" data-act="sec-incident-action" data-type="${type}" data-id="${inc.id}">${label}</button>`;
  return html`<article class="board-card sec-incident" data-priority="${priority}" data-incident="${inc.id}">
    <div class="sec-incident-tags">
      <span class="tag sec-incident-category" data-category-tone="${categoryTone}">${inc.category}</span>
      <span class="tag ${priority === "critical" || priority === "high" ? "warn" : ""}">${INCIDENT_PRIORITY[priority]} priority</span>
      <span class="tag ${cleared ? "ok" : latest ? "warn" : "brand"}">${state}</span>
    </div>
    <p class="faint">${inc.room || (inc.locationId ? locName(inc.locationId) : "On campus")} · Reported <time datetime="${inc.at}">${incidentTimestamp(inc.at)}</time>${inc.reporterName ? ` by ${inc.reporterName}` : ""}
      ${inc.reporterPhone ? html`<a href="tel:${inc.reporterPhone}">${inc.reporterPhone}</a>` : ""}</p>
    ${showTimes ? html`<dl class="sec-report-context">
      <div><dt>First arrival</dt><dd>${incidentTimestamp(firstArrivalAt)}</dd></div>
      <div><dt>Cleared</dt><dd>${incidentTimestamp(clearedAt)}</dd></div>
      <div><dt>Total time</dt><dd>${incidentDuration(incidentElapsed(inc.at, clearedAt))}</dd></div>
    </dl>` : ""}
    <p class="sec-incident-note">${inc.details}</p>
    ${inc.voiceUrl ? html`<audio controls src="${inc.voiceUrl}" aria-label="Recorded incident report"></audio>` : ""}
    ${inc.mediaUrl && inc.mediaKind === "image" ? html`<img class="sec-incident-media" src="${inc.mediaUrl}" alt="Incident photo">` : ""}
    ${inc.mediaUrl && inc.mediaKind === "video" ? html`<video class="sec-incident-media" src="${inc.mediaUrl}" controls aria-label="Incident video"></video>` : ""}
    ${inc.mapUrl ? html`<p><a href="${inc.mapUrl}" target="_blank" rel="noopener">View reporter location</a></p>` : ""}
    ${assignments.length ? html`<p><b>Assigned:</b> ${assignments.map((e) => e.targetName || S.userName(e.value)).join(", ")}</p>` : ""}
    ${responders.length ? html`<p><b>Responders:</b> ${responders.map((e) => `${e.actorName || S.userName(e.by)}${arrivals.has(e.by) ? " (on site)" : ""}`).join(", ")}</p>` : ""}
    <div class="btns">
      ${cleared ? (acknowledged ? html`<span class="tag ok">You confirmed clear</span>` : legacyCleared ? "" : button("ack", "Confirm clear")) : html`
        ${responding ? arrivals.has(S.me().id) ? html`<span class="tag ok">You’re on site</span>` : button("arrive", "I’ve arrived") : button("respond", "I’m responding")}
        ${button("triage", "Set priority")}${button("assign", "Assign responder")}${button("update", "Add update")}
      `}
      ${inc.kind !== "DRILL_INJECT" ? html`<button type="button" class="btn ghost sm" data-act="sec-report-new" data-id="${inc.id}">${reports.length ? "Add report" : "Create incident report"}</button>` : ""}
    </div>
    ${reports.length ? html`<div class="sec-report-list"><b>Accident / incident reports</b>${reports.map((report) => incidentReportRow(report))}
    </div>` : ""}
    ${events.some((e) => e.type !== "ack") ? html`<details class="sec-incident-details" ${attr(showTimes, "open")}><summary>Response timeline</summary><ol>
      ${events.filter((e) => e.type !== "ack").map((e) => html`<li><b>${incidentEventLabel(e)}</b>
        <span class="faint"> · ${e.actorName || S.userName(e.by)} · ${incidentTimestamp(e.at)}</span>
        ${e.note ? html`<p class="sec-incident-note">${e.note}</p>` : ""}</li>`)}
    </ol></details>` : ""}
    ${cleared ? "" : html`<details class="sec-incident-details"><summary>Protocol escalation</summary><div class="btns">
      ${protos.map((p) => html`<button type="button" class="btn ghost sm" data-act="sec-activate-level" data-level="${p.level}" data-inc="${inc.id}">${p.code}</button>`)}
    </div></details>`}
  </article>`;
}

function incidentReportRow(report, incident) {
  return html`<button type="button" class="row" data-act="sec-report-open" data-id="${report.id}">
    <span class="body"><span class="t">${report.templateName}</span>
      <span class="s">${incident ? `${incident.category} · ${incident.room || "On campus"} · ` : ""}Assigned to ${report.assignedName || S.userName(report.assignedTo)}</span></span>
    <span class="tag ${report.status === "reviewed" ? "ok" : report.status === "submitted" ? "brand" : ""}">${report.status === "reviewed" ? "Reviewed" : report.status === "submitted" ? "Submitted" : "Draft"}</span>
  </button>`;
}

function renderIncidentReportQueue() {
  const reports = incidentReports(), incidents = new Map(S.list("securityIncidents").map((inc) => [inc.id, inc]));
  const groups = [["submitted", "Awaiting review"], ["draft", "Drafts"], ["reviewed", "Reviewed"]];
  return html`<section class="sec">
    <h2>Incident report queue</h2>
    ${incidentSections("security-incidents-reports")}
    ${reports.length ? groups.map(([status, label]) => {
      const group = reports.filter((report) => report.status === status);
      return group.length ? html`<h3>${label}</h3><div class="rows sec-report-queue">${group.map((report) => incidentReportRow(report, incidents.get(report.incidentId)))}</div>` : "";
    }) : empty("No accident or incident reports to show.")}
  </section>`;
}

function renderIncidentReportTemplates() {
  if (!canLeadSecurity()) return empty("Report forms are managed by the head of security and church administrators.");
  return html`<section class="sec">
    <div class="sec-head"><div><h2>Incident report forms</h2><p class="muted">Choose the questions staff complete after an accident or incident.</p></div>
      <button type="button" class="btn sm" data-act="sec-report-template" data-id="new">${icon("plus")}New form</button></div>
    ${incidentSections("security-incidents-forms")}
    <div class="rows">${incidentReportTemplates().map((template) => html`
      <div class="row"><span class="body"><span class="t">${template.name}</span><span class="s">${template.fields.length} fields${template.isDefault ? " · Default" : ""}${template.id === "standard" ? " · Built in" : ""}</span></span>
        <button type="button" class="btn ghost sm" data-act="sec-report-template" data-id="${template.id}">${template.id === "standard" ? "Customize" : "Edit"}</button></div>`)}
    </div>
  </section>`;
}

function incidentReportField(field, value = "") {
  const name = `field_${field.id}`;
  if (field.type === "long") return html`<label class="field"><span>${field.label}${field.required ? " *" : ""}</span><textarea name="${name}" rows="4" maxlength="5000">${value}</textarea></label>`;
  if (field.type === "choice") return html`<label class="field"><span>${field.label}${field.required ? " *" : ""}</span><select name="${name}"><option value="">Choose one</option>${(field.options || []).map((option) => html`<option value="${option}" ${attr(value === option, "selected")}>${option}</option>`)}</select></label>`;
  const type = ["date", "time", "number"].includes(field.type) ? field.type : "text";
  return html`<label class="field"><span>${field.label}${field.required ? " *" : ""}</span><input type="${type}" name="${name}" value="${value}" maxlength="500"></label>`;
}

async function incidentRosterForSheet(button) {
  if (!Backend.on) return incidentResponders().map((id) => ({ id, name: S.userName(id) }));
  const scope = incidentReportScope();
  button.disabled = true;
  try {
    const { data, error } = await Backend.client.rpc("security_incident_roster", { c: S.state.current });
    if (error) throw error;
    return scope === incidentReportScope() && button.isConnected ? data : null;
  } finally { button.disabled = false; }
}

const incidentReportScope = () => JSON.stringify([S.state.current, S.me().id, location.hash]);

// Keep the same key on a retry after a connection failure. Store the server's confirmed record in the current view.
function incidentFormKey(form, payload) {
  const signature = JSON.stringify(payload);
  if (form.dataset.signature !== signature) {
    form.dataset.signature = signature;
    form.dataset.requestId = uid();
  }
  return form.dataset.requestId;
}

async function persistIncidentForm(form, kind, rpc, args, local, afterSave) {
  if (form.dataset.saving) return;
  const scope = incidentReportScope();
  const cid = S.state.current, actor = S.me().id;
  const buttons = $$("button", form).filter((button) => !button.disabled);
  form.dataset.saving = "true";
  buttons.forEach((button) => { button.disabled = true; });
  try {
    let record;
    if (Backend.on) {
      const { data, error } = await Backend.client.rpc(rpc, { c: cid, ...args });
      if (error) throw error;
      record = data;
    } else record = local();
    if (cid !== S.state.current || actor !== S.me().id) return;
    if (kind === "securityIncidentFormTemplates" && record.isDefault) {
      S.list(kind).forEach((template) => { template.isDefault = false; });
    }
    const existing = S.get(kind, record.id);
    if (!existing) S.add(kind, record);
    else if (Date.parse(existing.updatedAt) <= Date.parse(record.updatedAt)) Object.assign(existing, record);
    S.save();
    if (scope !== incidentReportScope() || !form.isConnected) return;
    closeSheet(true);
    render();
    afterSave?.(record);
  } catch (error) {
    if (form.isConnected) formError(form, error.message || "Could not save. Try again.");
  } finally {
    delete form.dataset.saving;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

Actions["sec-report-new"] = async (el) => {
  if (!canSuperviseSecurity()) return;
  const row = securityIncidentRows().find(({ inc }) => inc.id === el.dataset.id);
  if (!row || row.inc.kind === "DRILL_INJECT") return;
  let people;
  try { people = await incidentRosterForSheet(el); } catch { return toast("Could not load report assignees. Try again."); }
  if (!people?.length || $("#scrim")) return;
  const templates = incidentReportTemplates();
  openSheet("Create incident report", html`<form data-form="sec-report-create">
    <input type="hidden" name="incidentId" value="${row.inc.id}">
    <label class="field"><span>Report form</span><select name="templateId">${templates.map((template) => html`<option value="${template.id}" ${attr(template.isDefault, "selected")}>${template.name}</option>`)}</select></label>
    <label class="field"><span>Assign to</span><select name="assignedTo">${people.map((person) => html`<option value="${person.id}" ${attr(person.id === S.me().id, "selected")}>${person.name}</option>`)}</select></label>
    <p class="muted">The assignee will receive an alert and can save a draft before submitting it for review.</p>
    <div class="btns"><button class="btn" type="submit">Create report</button></div>
  </form>`);
};

Forms["sec-report-create"] = (d, f) => {
  if (!canSuperviseSecurity()) return;
  const template = incidentReportTemplates().find((item) => item.id === d.templateId);
  const assignee = Backend.on || incidentResponders().includes(d.assignedTo) ? d.assignedTo : "";
  if (!template || !assignee) return formError(f, "Choose a report form and assignee.");
  const payload = { incidentId: d.incidentId, templateId: template.id, assignedTo: assignee };
  const id = incidentFormKey(f, payload);
  const now = new Date().toISOString(), report = {
    id, incidentId: d.incidentId, templateId: template.id, templateName: template.name,
    fields: template.fields.map((field) => ({ ...field })), values: {}, assignedTo: assignee,
    assignedName: S.userName(assignee), status: "draft", createdBy: S.me().id, createdAt: now,
    updatedBy: S.me().id, updatedAt: now,
  };
  return persistIncidentForm(f, "securityIncidentReports", "security_incident_report", { report_id: id, action: "create", payload }, () => {
    notifyReportAssignee(report);
    return report;
  }, () => openIncidentReport(id));
};

function notifyReportAssignee(report) {
  if (report.assignedTo !== S.me().id) notify(report.assignedTo, { kind: "security", title: "Incident report assigned to you",
    body: "Open Security Command to complete the report.", link: `#security-incidents-${report.incidentId}` });
}

Actions["sec-report-open"] = (el) => openIncidentReport(el.dataset.id);

function openIncidentReport(id) {
  const report = incidentReports().find((item) => item.id === id);
  if (!report || !canSuperviseSecurity()) return;
  const canEdit = report.status === "draft" && (canLeadSecurity() || report.assignedTo === S.me().id);
  const row = securityIncidentRows().find(({ inc }) => inc.id === report.incidentId);
  openSheet("Accident / incident report", html`<form data-form="sec-report-save" class="sec-report-form">
    <input type="hidden" name="id" value="${report.id}">
    <input type="hidden" name="expectedAt" value="${report.updatedAt}">
    <input type="hidden" name="intent" value="draft">
    <div class="sec-incident-tags"><span class="tag">${report.templateName}</span><span class="tag ${report.status === "reviewed" ? "ok" : report.status === "submitted" ? "brand" : ""}">${report.status}</span></div>
    <p class="muted">Assigned to ${report.assignedName || S.userName(report.assignedTo)}</p>
    ${row ? html`<dl class="sec-report-context">
      <div><dt>Location</dt><dd>${row.inc.room || (row.inc.locationId ? locName(row.inc.locationId) : "On campus")}</dd></div>
      <div><dt>Reported</dt><dd>${incidentTimestamp(row.inc.at)}</dd></div>
      <div><dt>First arrival</dt><dd>${incidentTimestamp(row.firstArrivalAt)}</dd></div>
      <div><dt>Cleared</dt><dd>${incidentTimestamp(row.clearedAt)}</dd></div>
      <div><dt>Total time</dt><dd>${incidentDuration(incidentElapsed(row.inc.at, row.clearedAt))}</dd></div>
    </dl><p><a href="#security-incidents-${row.inc.id}" data-act="go" data-to="security-incidents-${row.inc.id}">Open incident and response timeline</a></p>` : ""}
    ${canEdit ? report.fields.map((field) => incidentReportField(field, report.values?.[field.id] || "")) : html`<dl class="sec-report-answers">
      ${report.fields.map((field) => html`<div><dt>${field.label}</dt><dd>${report.values?.[field.id] || "—"}</dd></div>`)}
    </dl>`}
    <div class="btns">
      ${canEdit ? html`<button class="btn ghost" type="button" data-act="sec-report-intent" data-intent="draft">Save draft</button><button class="btn" type="button" data-act="sec-report-intent" data-intent="submit">Submit report</button>` : ""}
      ${canLeadSecurity() && report.status === "draft" ? html`<button class="btn ghost" type="button" data-act="sec-report-reassign" data-id="${report.id}">Reassign draft</button>` : ""}
      ${canLeadSecurity() && report.status === "submitted" ? html`<button class="btn" type="button" data-act="sec-report-intent" data-intent="review">Mark reviewed</button>` : ""}
    </div>
  </form>`);
}

Actions["sec-report-intent"] = (el) => {
  const form = el.closest("form");
  form.elements.intent.value = el.dataset.intent;
  form.requestSubmit();
};

Forms["sec-report-save"] = (d, f) => {
  const report = S.get("securityIncidentReports", d.id);
  if (!report || (!canLeadSecurity() && report.assignedTo !== S.me().id) || report.status === "reviewed") return formError(f, "You cannot edit this report.");
  if (d.expectedAt !== report.updatedAt) return formError(f, "This report changed. Close and reopen it before editing again.");
  const intent = d.intent || "draft";
  const values = Object.fromEntries(report.fields.map((field) => [field.id, d[`field_${field.id}`] || ""]));
  if (intent === "submit") {
    const missing = report.fields.find((field) => field.required && !values[field.id]);
    if (missing) return formError(f, `Complete ${missing.label} before submitting.`);
  }
  if (intent === "review" ? (!canLeadSecurity() || report.status !== "submitted") : report.status !== "draft") return;
  return saveIncidentReportChange(f, report, intent, { expectedAt: d.expectedAt, values });
};

Actions["sec-report-reassign"] = async (el) => {
  const report = S.get("securityIncidentReports", el.dataset.id);
  if (!canLeadSecurity() || report?.status !== "draft") return;
  let people;
  try { people = await incidentRosterForSheet(el); } catch { return formError(el.closest("form"), "Could not load assignees. Try again."); }
  if (!people?.length) return;
  closeSheet(true);
  openSheet("Reassign draft", html`<form data-form="sec-report-reassign">
    <input type="hidden" name="id" value="${report.id}">
    <input type="hidden" name="expectedAt" value="${report.updatedAt}">
    <label class="field"><span>Assign to</span><select name="assignedTo">${people.map((person) => html`<option value="${person.id}" ${attr(person.id === report.assignedTo, "selected")}>${person.name}</option>`)}</select></label>
    <button class="btn" type="submit">Save assignment</button>
  </form>`);
};

Forms["sec-report-reassign"] = (d, f) => {
  const report = S.get("securityIncidentReports", d.id);
  if (!canLeadSecurity() || report?.status !== "draft") return;
  if (d.expectedAt !== report.updatedAt) return formError(f, "This report changed. Close and reopen it before editing again.");
  if (!Backend.on && !incidentResponders().includes(d.assignedTo)) return formError(f, "Choose an assignee with incident access.");
  return saveIncidentReportChange(f, report, "reassign", { expectedAt: d.expectedAt, assignedTo: d.assignedTo });
};

function saveIncidentReportChange(form, report, action, payload) {
  payload.requestId = incidentFormKey(form, [action, payload]);
  return persistIncidentForm(form, "securityIncidentReports", "security_incident_report", { report_id: report.id, action, payload }, () => {
    const now = new Date().toISOString(), actor = S.me().id;
    const result = { ...report, updatedBy: actor, updatedAt: now };
    if (action === "review") return { ...result, status: "reviewed", reviewedAt: now, reviewedBy: actor };
    if (action === "reassign") {
      if (report.assignedTo === payload.assignedTo) return report;
      result.assignedTo = payload.assignedTo;
      result.assignedName = S.userName(payload.assignedTo);
      notifyReportAssignee(result);
      return result;
    }
    result.values = payload.values;
    return action === "submit" ? { ...result, status: "submitted", submittedAt: now, submittedBy: actor } : result;
  });
}

Actions["sec-report-template"] = (el) => {
  if (!canLeadSecurity()) return;
  const existing = el.dataset.id === "new" ? null : S.get("securityIncidentFormTemplates", el.dataset.id);
  const template = existing || defaultIncidentReportTemplate();
  openSheet(existing ? "Edit incident report form" : "New incident report form", html`<form data-form="sec-report-template">
    <input type="hidden" name="id" value="${existing?.id || ""}">
    <input type="hidden" name="expectedAt" value="${existing?.updatedAt || ""}">
    <label class="field"><span>Form name</span><input name="name" value="${existing?.name || ""}" required maxlength="100"></label>
    <fieldset class="sec-template-fields"><legend>Included questions</legend>${template.fields.map((field) => html`<div class="sec-template-field">
      <label><input type="checkbox" name="include_${field.id}" checked> Include</label>
      <input name="label_${field.id}" value="${field.label}" maxlength="150" aria-label="Question label">
      <label><input type="checkbox" name="required_${field.id}" ${attr(field.required, "checked")}> Required</label>
    </div>`)}</fieldset>
    <fieldset><legend>Add a custom question</legend><label class="field"><span>Question (optional)</span><input name="customLabel" maxlength="150"></label>
      <label class="field"><span>Answer style</span><select name="customType"><option value="long">Paragraph</option><option value="short">Short answer</option><option value="date">Date</option><option value="time">Time</option><option value="number">Number</option></select></label>
      <label><input type="checkbox" name="customRequired"> Required</label></fieldset>
    <label><input type="checkbox" name="isDefault" ${attr(template.isDefault, "checked")}> Use as the default report form</label>
    <div class="btns"><button class="btn" type="submit">Save form</button></div>
  </form>`);
};

Forms["sec-report-template"] = (d, f, fd) => {
  if (!canLeadSecurity()) return;
  const source = d.id ? S.get("securityIncidentFormTemplates", d.id) : defaultIncidentReportTemplate();
  if (!source) return formError(f, "This form is unavailable.");
  if (d.expectedAt !== (source.updatedAt || "")) return formError(f, "This form changed. Close and reopen it before editing again.");
  const fields = (source.fields || []).filter((field) => fd.has(`include_${field.id}`)).map((field) => ({
    ...field, label: d[`label_${field.id}`], required: fd.has(`required_${field.id}`),
  }));
  if (d.customLabel) {
    f.dataset.customId ||= `custom-${uid()}`;
    fields.push({ id: f.dataset.customId, label: d.customLabel, type: d.customType, required: fd.has("customRequired") });
  }
  if (!d.name || !fields.length || fields.some((field) => !field.label)) return formError(f, "Enter a form name and a label for each included question.");
  if (fields.length > 30) return formError(f, "Include up to 30 questions.");
  const id = d.id || (f.dataset.newId ||= uid()), isDefault = fd.has("isDefault");
  return persistIncidentForm(f, "securityIncidentFormTemplates", "security_incident_template", {
    template_id: id, name: d.name, fields, make_default: isDefault, expected_at: d.expectedAt || null,
  }, () => ({ id, name: d.name, fields, isDefault, updatedAt: new Date().toISOString(), updatedBy: S.me().id }));
};

function incidentEventLabel(event) {
  if (event.type === "triage") return `Priority set to ${INCIDENT_PRIORITY[event.value]}`;
  if (event.type === "assign") return `Assigned ${event.targetName || S.userName(event.value)}`;
  return { respond: "Joined response", arrive: "Arrived on site", ...INCIDENT_UPDATE }[event.type] || "Update";
}

function incidentResponders() {
  const ids = new Set([S.church().ownerId, ...S.members().map((m) => m.userId)]);
  return [...ids].filter((id) => id && securityLevel(id) >= 2).sort((a, b) => S.userName(a).localeCompare(S.userName(b)));
}

Actions["sec-incident-action"] = async (el) => {
  if (!canSuperviseSecurity()) return;
  const { id, type } = el.dataset;
  const row = securityIncidentRows().find(({ inc }) => inc.id === id);
  if (!row) return;
  if (["respond", "arrive", "ack"].includes(type)) return saveIncidentEvent(el, id, type);
  const title = { triage: "Set priority", assign: "Assign responder", update: "Add incident update" }[type];
  if (!title || row.cleared) return;
  const assigned = new Set(row.events.filter((e) => e.type === "assign").map((e) => e.value));
  let people = [];
  if (type === "assign") {
    if (Backend.on) {
      const cid = S.state.current, actor = S.me().id, route = location.hash;
      el.disabled = true;
      try {
        const { data, error } = await Backend.client.rpc("security_incident_roster", { c: cid });
        if (error) throw error;
        if (S.state.current !== cid || S.me().id !== actor || location.hash !== route || $("#scrim")) return;
        people = data;
      } catch {
        return toast("Could not load responders. Try again.");
      } finally { el.disabled = false; }
    } else people = incidentResponders().map((person) => ({ id: person, name: S.userName(person) }));
    people = people.filter(({ id }) => !assigned.has(id));
    if (!people.length) return toast("All eligible responders are already assigned.");
  }
  openSheet(title, html`<form data-form="sec-incident-update">
    <input type="hidden" name="id" value="${id}">
    <input type="hidden" name="mode" value="${type}">
    ${type === "triage" ? html`<label class="field"><span>Priority</span><select name="value">
      ${Object.entries(INCIDENT_PRIORITY).map(([value, label]) => html`<option value="${value}" ${attr(row.priority === value, "selected")}>${label}</option>`)}
    </select></label>` : type === "assign" ? html`<label class="field"><span>Responder</span><select name="value">
      ${people.map((person) => html`<option value="${person.id}">${person.name}</option>`)}
    </select></label>` : html`<label class="field"><span>Update</span><select name="type">
      ${Object.entries(INCIDENT_UPDATE).map(([value, label]) => html`<option value="${value}">${label}</option>`)}
    </select></label>`}
    <label class="field"><span>Staff note</span><textarea name="note" rows="3" maxlength="2000"></textarea></label>
    <div class="btns"><button class="btn" type="submit">Save update</button></div>
  </form>`);
};

Forms["sec-incident-update"] = (d, f) => {
  const type = d.mode === "update" ? d.type : d.mode;
  if (type === "note" && !d.note) return formError(f, "Enter a staff note.");
  return saveIncidentEvent($('button[type="submit"]', f), d.id, type, d.value || null, d.note);
};

async function saveIncidentEvent(button, incidentId, type, value = null, note = "") {
  if (!canSuperviseSecurity() || button.disabled) return;
  const row = securityIncidentRows().find(({ inc }) => inc.id === incidentId);
  if (!row || (row.cleared !== (type === "ack"))) return;
  const cid = S.state.current, user = S.me().id, route = location.hash;
  // Reuse the key after an ambiguous network failure when the submission is unchanged.
  const payload = JSON.stringify([incidentId, type, value, note]);
  if (button.dataset.eventPayload !== payload) {
    button.dataset.eventPayload = payload;
    button.dataset.eventId = uid();
  }
  button.disabled = true;
  try {
    let event = { id: button.dataset.eventId, incidentId, type, value, note, by: user,
      actorName: S.me().name, at: new Date().toISOString(), targetName: type === "assign" ? S.userName(value) : "" };
    if (Backend.on) {
      const { data, error } = await Backend.client.rpc("security_incident_event", {
        c: cid, incident_id: incidentId, event_id: event.id, event_type: type, event_value: value, detail: note,
      });
      if (error) throw error;
      event = data;
    } else {
      const title = { assign: "Incident assigned to you", assistance: INCIDENT_UPDATE.assistance, available: "All available responders requested" }[type];
      if (title) (type === "assign" ? [value] : incidentResponders()).filter((id) => id !== user).forEach((id) =>
        notify(id, { kind: "security", title, body: row.inc.category, link: `#security-incidents-${incidentId}` }));
    }
    if (S.state.current !== cid || S.me().id !== user) return;
    if (!S.get("securityIncidentEvents", event.id)) S.add("securityIncidentEvents", event);
    S.save();
    if (location.hash !== route) return;
    if (button.isConnected && button.closest("#scrim")) closeSheet(true);
    if (type === "ack" && location.hash === `#security-incidents-${incidentId}`) go("security-incidents");
    else render();
  } catch (error) {
    const form = button.closest("form");
    if (form?.isConnected) formError(form, error.message || "Could not save the incident update.");
    else toast(error.message || "Could not save the incident update.");
  } finally { button.disabled = false; }
}

Actions["sec-trigger-modal"] = () => {
  if (!canSuperviseSecurity()) return;
  const c = S.church(), protos = c.securityProtocols || defaultSecurityProtocols();
  openSheet("Activate Security Protocol", html`
    <p class="muted" style="margin-top:0">Choose a level. Levels above your direct limit go to the head of security and church administrators for review.</p>
    <div class="rows">
      ${protos.map((p) => html`<button type="button" class="row" data-act="sec-activate-level" data-level="${p.level}">
        <span class="lead-ic" style="background:${p.color};color:#fff;font-weight:700">${p.level}</span>
        <span class="body">
          <span class="t">${p.code}: ${p.name}</span>
          <span class="s">${+p.level > directSecurityLevel() ? "Approval required · " : ""}${p.summary}</span>
        </span>
        ${icon("chev")}
      </button>`)}
    </div>
  `, { wide: true });
};

Actions["sec-activate-level"] = (el) => {
  if (!canSuperviseSecurity()) return;
  const level = +el.dataset.level, review = level > directSecurityLevel();
  if (level < 1 || level > 5) return;
  openSheet(`Level ${level} protocol`, html`<p>${review ? "Send this declaration for review. It will take effect only if approved." : "Activate this live protocol now?"}</p>
    <div class="btns"><button type="button" class="btn ${review ? "" : "danger"}" data-act="security-confirm-level" data-level="${level}" data-inc="${el.dataset.inc || ""}">
      ${review ? "Request approval" : "Activate protocol"}
    </button></div>`);
};
Actions["security-confirm-level"] = (el) => {
  closeSheet(true);
  activateSecurityProtocol(+el.dataset.level, { incidentId: el.dataset.inc || "" });
};
Actions["sec-all-clear"] = () => clearSecurityProtocol();

function requestSecurityProtocol(level, incidentId) {
  const c = S.church(), me = S.me().id;
  if (S.list("securityProtocolRequests").some((r) => r.status === "pending" &&
      r.requestedBy === me && r.level === level && (r.incidentId || "") === incidentId)) {
    return toast("An equivalent request is already waiting for review.");
  }
  S.add("securityProtocolRequests", { level, incidentId, status: "pending", requestedBy: me, at: new Date().toISOString() });
  const reviewers = new Set([c.ownerId, ...S.members().map((m) => m.userId).filter((id) => securityLevel(id, c.id) === 3)]);
  reviewers.forEach((id) => {
    if (id) notify(id, { kind: "security", title: "Security protocol approval requested",
      body: `Review the request to activate Level ${level}.`, link: "#security-access" });
  });
  toast("Request sent to the head of security and church administrators.");
  render();
}

function renderSecurityAccess(c) {
  const manage = securityAdmin();
  const members = S.members().filter((m) => S.user(m.userId));
  const people = members.filter((m) => !securityAdmin(m.userId, c.id) && !String(m.roleId).startsWith("device:"))
    .sort((a, b) => S.userName(a.userId).localeCompare(S.userName(b.userId)));
  const ranks = ["", "Volunteer", "Supervisor", "Head of security"];
  const roster = members.map((m) => ({ id: m.userId, rank: securityLevel(m.userId, c.id) }))
    .filter((p) => p.rank && (canLeadSecurity() || p.id === S.me().id)).sort((a, b) => b.rank - a.rank || S.userName(a.id).localeCompare(S.userName(b.id)));
  const requests = S.list("securityProtocolRequests")
    .filter((r) => canLeadSecurity() || r.requestedBy === S.me().id)
    .sort((a, b) => b.at.localeCompare(a.at));
  return html`
    <section class="sec">
      <h2 class="sec-head">Protocol approval requests</h2>
      <div class="rows">${requests.length ? requests.map((r) => {
        const incident = r.incidentId && S.get("securityIncidents", r.incidentId);
        return html`<div class="row"><span class="body">
          <span class="t">Level ${r.level} · ${S.userName(r.requestedBy)}</span>
          <span class="s">${r.status === "pending" ? "Awaiting review" : r.status === "approved" ? "Approved" : "Declined"} · ${ago(r.at)}</span>
          ${incident ? html`<span class="s">${incident.category} · ${incident.room || "Location unavailable"}</span>` : ""}
          ${canLeadSecurity() && r.status === "pending" ? html`<span class="btns">
            <button type="button" class="btn sm" data-act="security-review-request" data-id="${r.id}">Review</button>
          </span>` : ""}
        </span></div>`;
      }) : empty("No protocol approval requests.")}</div>
    </section>
    <section class="sec">
      <h2 class="sec-head">Security access</h2>
      <div class="rows">
        <div class="row"><span class="body"><span class="t">Head of security and church administrators</span><span class="s">All Security Command functions, including drills, protocol review and All Clear. Church administrators assign access.</span></span></div>
        <div class="row"><span class="body"><span class="t">Supervisor</span><span class="s">Communications, incidents and response tools. Declares up to their assigned level. Higher levels require approval.</span></span></div>
        <div class="row"><span class="body"><span class="t">Volunteer</span><span class="s">Security communications. Access from a separate church role, such as check-in, still applies.</span></span></div>
      </div>
    </section>
    <section class="sec">
      <h2 class="sec-head">${canLeadSecurity() ? "Security roster" : "Your access"}</h2>
      <div class="rows">${roster.length ? roster.map(({id, rank}) => html`<div class="row"><span class="body">
        <span class="t">${S.userName(id)}</span><span class="s">${securityAdmin(id, c.id) ? "Church administrator" : ranks[rank]}
          ${rank === 2 ? ` · Direct limit: ${securityAssignment(id, c.id)?.maxLevel ? `Level ${securityAssignment(id, c.id).maxLevel}` : "Approval for every level"}` : ""}</span>
      </span></div>`) : empty("No security team members.")}</div>
    </section>
    ${manage && people.length ? html`<section class="sec">
      <h2 class="sec-head">Assign access</h2>
      <div class="panel"><label class="field"><span>Church member</span><select id="security-assignee">
        ${people.map((m) => html`<option value="${m.userId}">${S.userName(m.userId)}</option>`)}
      </select></label>
      <button type="button" class="btn" data-act="security-edit-access">Edit access</button></div>
    </section>` : ""}
  `;
}

Actions["security-edit-access"] = () => {
  if (!securityAdmin()) return;
  const id = $("#security-assignee")?.value;
  if (!id || !S.membership(S.state.current, id) || securityAdmin(id)) return;
  const assignment = securityAssignment(id, S.state.current);
  const roles = [["", "Use church role and team"], ["volunteer", "Volunteer"], ["supervisor", "Supervisor"], ["head", "Head of security"]];
  openSheet(S.userName(id), html`<form data-form="security-save-access">
    <input type="hidden" name="id" value="${id}">
    <label class="field"><span>Security role</span><select name="role">
      ${roles.map(([key, label]) => html`<option value="${key}" ${attr(key === assignment?.role, "selected")}>${label}</option>`)}
    </select></label>
    <label class="field"><span>Supervisor direct declaration limit</span><select name="maxLevel">
      ${[0, 1, 2, 3, 4, 5].map((n) => html`<option value="${n}" ${attr(n === (assignment?.maxLevel || 0), "selected")}>${n ? `Level ${n}` : "Approval for every level"}</option>`)}
    </select></label>
    <button class="btn">Save access</button>
  </form>`);
};

Forms["security-save-access"] = async (d, f) => {
  const c = S.church(), actor = S.me().id;
  if (!securityAdmin() || !S.membership(c.id, d.id) || securityAdmin(d.id)) return;
  if (!["", "volunteer", "supervisor", "head"].includes(d.role) || !/^[0-5]$/.test(d.maxLevel)) return formError(f, "Choose a valid security role and limit.");
  const id = `${c.id}:${d.id}`;
  let assignment = { userId: d.id, role: d.role || null, maxLevel: d.role === "supervisor" ? +d.maxLevel : 0 };
  if (Backend.on) {
    const submit = $('button[type="submit"], button:not([type])', f);
    submit.disabled = true;
    try {
      const { data, error } = await Backend.client.rpc("security_assign_access", { c: c.id, person: d.id, role_name: d.role, max_level: +d.maxLevel });
      if (error) throw error;
      assignment = data;
    } catch (error) {
      return formError(f, error.message || "Could not save security access.");
    } finally { submit.disabled = false; }
  }
  if (S.state.current !== c.id || S.me().id !== actor) return;
  const current = S.get("securityAccessAssignments", id);
  if (current) Object.assign(current, assignment);
  else S.add("securityAccessAssignments", { ...assignment, id });
  S.save();
  closeSheet(true);
  render();
};

Actions["security-review-request"] = (el) => {
  if (!canLeadSecurity()) return;
  const r = S.get("securityProtocolRequests", el.dataset.id);
  if (!r || r.churchId !== S.state.current || r.status !== "pending") return;
  const incident = r.incidentId && S.get("securityIncidents", r.incidentId);
  openSheet(`Review Level ${r.level} request`, html`<p>Requested by ${S.userName(r.requestedBy)}.</p>
    ${incident ? html`<p><b>${incident.category}</b> · ${incident.room || "Location unavailable"}</p><p>${incident.details || ""}</p>` : html`<p>No incident is attached.</p>`}
    <div class="btns">
      <button type="button" class="btn danger" data-act="security-decide-request" data-id="${r.id}" data-choice="approve">Approve and activate</button>
      <button type="button" class="btn ghost" data-act="security-decide-request" data-id="${r.id}" data-choice="decline">Decline</button>
    </div>`);
};
Actions["security-decide-request"] = async (el) => {
  if (!canLeadSecurity() || protocolTransitionPending) return;
  const cid = S.state.current, r = S.get("securityProtocolRequests", el.dataset.id);
  if (!r || r.churchId !== cid || r.status !== "pending") return;
  closeSheet(true);
  if (el.dataset.choice === "approve") {
    await activateSecurityProtocol(r.level, { incidentId: r.incidentId || "", request: r });
  } else if (el.dataset.choice === "decline") {
    if (Backend.on) {
      protocolTransitionPending = true;
      try {
        const { error } = await Backend.client.rpc("security_protocol", { c: cid, action: "decline", request_id: r.id });
        if (error) throw error;
      } catch (error) {
        return toast(error.message || "Could not decline the request.");
      } finally { protocolTransitionPending = false; }
    }
    const current = S.get("securityProtocolRequests", r.id);
    if (current) current.status = "declined";
    S.save();
    toast("Protocol request declined.");
  }
  render();
};

// Tab 3: Assigned Door & Entryway Verification Matrix (Level 4 & General Perimeter Security)
function renderSecurityDoors(c) {
  const doors = c.securityDoors ||= defaultSecurityDoors(c.id);
  const lockedCount = doors.filter((d) => d.status === "locked").length;
  const issueCount = doors.filter((d) => d.status === "issue").length;
  const members = S.members().map((m) => S.user(m.userId)).filter(Boolean);

  return html`
    <div class="stat-tiles" style="margin-top:14px">
      ${statTile("Total Entryways", doors.length.toLocaleString(), "Monitored campus doors")}
      ${statTile("Verified Locked", `${lockedCount}/${doors.length}`, pct(lockedCount, doors.length) + " secured")}
      ${statTile("Unsecured / Issues", issueCount.toLocaleString(), issueCount ? "Immediate attention required!" : "No door issues reported")}
    </div>

    <section class="sec">
      <div class="sec-head">
        <h2>Assigned Door &amp; Entryway Lock Verification</h2>
        ${isSecurityMember() ? html`<button type="button" class="btn ghost sm" data-act="sec-door-add">${icon("plus")}Add door / entryway</button>` : ""}
      </div>
      <p class="faint" style="margin-top:0">During a Level 3 or Level 4+ perimeter lockout, each assignee checks their assigned door and marks it <b>Verified Locked</b> or <b>Issue / Unsecured</b> (which immediately alerts the Security Team).</p>
      <div class="rows">
        ${doors.map((d) => {
          const isMine = d.assignedTo === S.me().id;
          return html`<div class="row ${d.status === "issue" ? "door-issue-row" : ""}">
            <span class="lead-ic">${icon("door")}</span>
            <span class="body">
              <span class="t">${d.name} ${isMine ? html`<span class="tag brand">Assigned to You</span>` : ""}</span>
              <span class="s">Zone: ${d.zone || "Main"} · Safe Zone: <b>${d.safeZone || "Interior Room"}</b> · Assignee: <b>${d.assignedTo ? S.userName(d.assignedTo) : "Any Rover"}</b></span>
              ${d.verifiedBy ? html`<span class="s faint">Last checked by ${d.verifiedBy} (${ago(d.verifiedAt)})${d.issueNote ? ` — "${d.issueNote}"` : ""}</span>` : ""}
            </span>
            <span class="tag ${d.status === "locked" ? "ok" : d.status === "issue" ? "warn" : ""}">${d.status === "locked" ? "Verified Locked ✓" : d.status === "issue" ? "UNSECURED ⚠" : "Pending Check"}</span>
            <div class="btns" style="margin:0">
              <button type="button" class="btn sm" data-act="sec-door-verify" data-id="${d.id}">${icon("check")}Verified Locked</button>
              <button type="button" class="btn danger sm" data-act="sec-door-issue" data-id="${d.id}">Unsecured / Issue</button>
              ${isSecurityMember() ? html`<button type="button" class="icon-btn sm" data-act="sec-door-edit" data-id="${d.id}" aria-label="Edit door assignment">${icon("edit")}</button>` : ""}
            </div>
          </div>`;
        })}
      </div>
    </section>
  `;
}

Actions["sec-door-verify"] = (el) => {
  const c = S.church(), d = (c.securityDoors || []).find((x) => x.id === el.dataset.id);
  if (!d) return;
  Object.assign(d, { status: "locked", verifiedBy: S.me().name, verifiedAt: new Date().toISOString(), issueNote: "" });
  S.save(); broadcastSafetyUpdate(); toast(`${d.name} marked Verified Locked`); render();
};

Actions["sec-door-issue"] = (el) => {
  const c = S.church(), d = (c.securityDoors || []).find((x) => x.id === el.dataset.id);
  if (!d) return;
  openSheet(`Report Unsecured Door: ${d.name}`, html`<form data-form="sec-door-issue-save" novalidate>
    <input type="hidden" name="id" value="${d.id}">
    <label class="field"><span>What is the issue with ${d.name}?</span><input type="text" name="note" required maxlength="140" value="Latch will not lock — rover needed immediately"></label>
    <button class="btn danger block">Alert Security Team — Door Unsecured</button>
  </form>`);
};
Forms["sec-door-issue-save"] = (d) => {
  const c = S.church(), door = (c.securityDoors || []).find((x) => x.id === d.id);
  if (!door) return;
  Object.assign(door, { status: "issue", verifiedBy: S.me().name, verifiedAt: new Date().toISOString(), issueNote: d.note });
  S.add("securityMessages", {
    by: S.me().id,
    senderName: S.me().name,
    priority: "urgent",
    text: `🚨 DOOR UNSECURED: ${door.name} (${door.zone}) — "${d.note}" (Reported by ${S.me().name})`,
    at: new Date().toISOString(),
  });
  securityTeamUserIds().forEach((u) => notify(u, {
    kind: "security",
    title: `🚨 Door Unsecured: ${door.name}`,
    body: `${S.me().name}: ${d.note}`,
    link: "#security-doors",
  }));
  S.save(); closeSheet(true); broadcastSafetyUpdate(); toast("Security Team alerted of unsecured door!"); render();
};

Actions["sec-door-add"] = () => editSecurityDoorModal({});
Actions["sec-door-edit"] = (el) => {
  const door = (S.church().securityDoors || []).find((x) => x.id === el.dataset.id) || {};
  editSecurityDoorModal(door);
};
function editSecurityDoorModal(door) {
  const people = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  openSheet(door.id ? `Edit ${door.name}` : "Add Campus Door / Entryway", html`<form data-form="sec-door-save" novalidate>
    <input type="hidden" name="id" value="${door.id || ""}">
    <label class="field"><span>Door / Entryway Name</span><input type="text" name="name" required maxlength="60" value="${door.name || ""}" placeholder="South Kids Wing Exterior Door"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Building / Zone</span><input type="text" name="zone" maxlength="50" value="${door.zone || ""}" placeholder="Children's Wing"></label>
      <label class="field"><span>Designated Safe Zone nearby</span><input type="text" name="safeZone" maxlength="60" value="${door.safeZone || ""}" placeholder="Interior Room 104"></label>
    </div>
    <label class="field"><span>Assigned Staff / Volunteer to Verify</span><select name="assignedTo"><option value="">Any Security Rover</option>${people.map((u) => html`<option value="${u.id}" ${attr(u.id === door.assignedTo, "selected")}>${u.name}</option>`)}</select></label>
    <div class="btns"><button class="btn">Save door</button>${door.id ? html`<button type="button" class="btn danger" data-act="sec-door-del" data-id="${door.id}">Delete</button>` : ""}</div>
  </form>`);
}
Forms["sec-door-save"] = (d, f) => {
  if (!String(d.name || "").trim()) return formError(f, "Name the door.");
  const c = S.church(); c.securityDoors ||= [];
  const existing = c.securityDoors.find((x) => x.id === d.id);
  if (existing) Object.assign(existing, { name: d.name.trim(), zone: d.zone || "", safeZone: d.safeZone || "", assignedTo: d.assignedTo || "" });
  else c.securityDoors.push({ id: uid(), name: d.name.trim(), zone: d.zone || "", safeZone: d.safeZone || "", assignedTo: d.assignedTo || "", status: "unlocked", verifiedBy: "", verifiedAt: "", issueNote: "" });
  S.save(); closeSheet(true); toast("Door saved"); render();
};
Actions["sec-door-del"] = (el) => {
  const c = S.church(); c.securityDoors = (c.securityDoors || []).filter((x) => x.id !== el.dataset.id);
  S.save(); closeSheet(true); toast("Door removed"); render();
};

// Tab 4: Live On-Site Roll Call, Classroom Headcount & Unaccounted Report
function renderSecurityRollCall(c) {
  let list = S.list("securityRollCall");
  if (!list.length) list = generateEmergencyRollCall();
  const groups = ["ALL", ...new Set(list.map((r) => r.group).filter(Boolean))];
  if (!groups.includes(rollCallGroupFilter)) rollCallGroupFilter = "ALL";
  const shown = list.filter((r) => rollCallGroupFilter === "ALL" || r.group === rollCallGroupFilter);

  const safeCount = list.filter((r) => r.status === "safe").length;
  const unaccountedList = list.filter((r) => r.status !== "safe");
  const canSeeFullReport = canViewUnaccountedReport();

  const unaccRows = unaccountedList.map((r) => [
    r.name,
    r.kind,
    r.group || "Campus",
    r.room || "—",
    r.contact || "—",
    r.status === "missing" ? "FLAGGED MISSING" : "Unaccounted",
  ]);

  return html`
    <div class="stat-tiles" style="margin-top:14px">
      ${statTile("Total On-Site Headcount", list.length.toLocaleString(), "Checked-in kids, members & staff")}
      ${statTile("Accounted & Safe", safeCount.toLocaleString(), pct(safeCount, list.length) + " verified in safe zone")}
      ${statTile("Unaccounted For", unaccountedList.length.toLocaleString(), unaccountedList.length ? "Action required!" : "100% accounted for!")}
    </div>

    <div class="panel" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>
        <b>Your Safe-Zone Check-In</b>
        <div class="faint" style="font-size:.84rem">Once you are inside a designated safe area, mark yourself (and your household/class) safe.</div>
      </div>
      <div class="btns" style="margin:0">
        <button type="button" class="btn sm" style="background:var(--ok);color:#fff" data-act="mark-myself-safe">${icon("check")}I Am Safe in a Safe Zone</button>
        <button type="button" class="btn ghost sm" data-act="sec-refresh-rollcall">Refresh On-Site Roster</button>
      </div>
    </div>

    <section class="sec">
      <div class="sec-head">
        <h2>Classroom &amp; Ministry Area Headcount Checklist</h2>
        ${shown.some((r) => r.status !== "safe") ? html`<button type="button" class="btn sm" data-act="sec-mark-group-safe">${icon("check")}Mark all in ${rollCallGroupFilter === "ALL" ? "view" : rollCallGroupFilter} Safe</button>` : ""}
      </div>
      <div class="chips" style="margin-bottom:10px">
        ${groups.map((g) => {
          const grpItems = g === "ALL" ? list : list.filter((r) => r.group === g);
          const grpSafe = grpItems.filter((r) => r.status === "safe").length;
          return html`<button type="button" class="chip" data-act="sec-roll-group" data-g="${g}" aria-pressed="${rollCallGroupFilter === g}">${g === "ALL" ? "All Areas" : g} (${grpSafe}/${grpItems.length})</button>`;
        })}
      </div>

      <div class="rows">
        ${shown.map((r) => html`<div class="row ${r.status === "missing" ? "door-issue-row" : ""}">
          <span class="lead-ic">${icon(r.status === "safe" ? "check" : "user")}</span>
          <span class="body">
            <span class="t">${r.name} <span class="tag ${r.status === "safe" ? "ok" : "warn"}">${r.status === "safe" ? "Safe & Accounted ✓" : r.status === "missing" ? "MISSING ⚠" : "Unaccounted"}</span></span>
            <span class="s">${r.kind} · Area/Class: <b>${r.group}</b> (${r.room})${r.contact ? ` · Contact: ${r.contact}` : ""}</span>
            ${r.checkedBy ? html`<span class="s faint">Verified by ${r.checkedBy} (${ago(r.checkedAt)})${r.safeZone ? ` in ${r.safeZone}` : ""}</span>` : ""}
          </span>
          <div class="btns" style="margin:0">
            <button type="button" class="btn ${r.status === "safe" ? "ghost" : ""} sm" data-act="sec-person-safe" data-id="${r.id}">${r.status === "safe" ? "Undo" : "Mark Safe"}</button>
            ${r.status !== "missing" ? html`<button type="button" class="btn danger sm" data-act="sec-person-missing" data-id="${r.id}">Flag Missing</button>` : ""}
          </div>
        </div>`)}
      </div>
    </section>

    ${canSeeFullReport ? html`<section class="sec">
      <div class="sec-head">
        <h2>Unaccounted Individuals Report (${unaccountedList.length})</h2>
      </div>
      <p class="faint" style="margin-top:0">Live report for Security, Admins, and authorized staff showing everyone known to be on campus who has not yet been checked off in a designated safe area.</p>
      <div class="panel">
        ${reportTable("sec-unaccounted", "unaccounted-individuals-report", ["Name", "Role / Type", "Class / Group", "Last Known Room", "Emergency Contact", "Status"], unaccRows, { limit: 50, empty: "Everyone on campus is accounted for and marked safe!" })}
      </div>
    </section>` : ""}
  `;
}

Actions["sec-refresh-rollcall"] = () => { generateEmergencyRollCall(); toast("Roll call updated from live check-ins"); render(); };
Actions["sec-roll-group"] = (el) => { rollCallGroupFilter = el.dataset.g; render(); };
Actions["mark-myself-safe"] = () => {
  generateEmergencyRollCall();
  const me = S.me();
  const rec = S.list("securityRollCall").find((r) => r.personKey === `user:${me.id}`);
  if (rec) {
    Object.assign(rec, { status: "safe", safeZone: "Designated Safe Area", checkedBy: me.name, checkedAt: new Date().toISOString() });
  }
  // Also mark any checked-in household children with me safe if desired
  S.save(); broadcastSafetyUpdate(); toast("You are marked SAFE and accounted for."); render();
};
Actions["sec-person-safe"] = (el) => {
  const r = S.get("securityRollCall", el.dataset.id); if (!r) return;
  r.status = r.status === "safe" ? "unaccounted" : "safe";
  r.checkedBy = S.me().name;
  r.checkedAt = new Date().toISOString();
  S.save(); broadcastSafetyUpdate(); render();
};
Actions["sec-person-missing"] = (el) => {
  const r = S.get("securityRollCall", el.dataset.id); if (!r) return;
  r.status = "missing";
  r.checkedBy = S.me().name;
  r.checkedAt = new Date().toISOString();
  S.add("securityMessages", {
    by: S.me().id,
    senderName: S.me().name,
    priority: "urgent",
    text: `🚨 UNACCOUNTED / FLAGGED MISSING: ${r.name} (${r.kind}) last assigned to ${r.group} (${r.room}). Reported by ${S.me().name}.`,
    at: new Date().toISOString(),
  });
  securityTeamUserIds().forEach((u) => notify(u, {
    kind: "security",
    title: `🚨 Unaccounted Individual: ${r.name}`,
    body: `${r.group} (${r.room}) — Flagged by ${S.me().name}`,
    link: "#security-rollcall",
  }));
  S.save(); broadcastSafetyUpdate(); toast(`${r.name} flagged on Unaccounted Report`); render();
};
Actions["sec-mark-group-safe"] = () => {
  const list = S.list("securityRollCall").filter((r) => rollCallGroupFilter === "ALL" || r.group === rollCallGroupFilter);
  list.forEach((r) => { r.status = "safe"; r.checkedBy = S.me().name; r.checkedAt = new Date().toISOString(); });
  S.save(); broadcastSafetyUpdate(); toast(`Marked ${plural(list.length, "person", "people")} Safe`); render();
};

// Tab 5: Church-Specific Protocol Generator (#security-protocols)
function renderSecurityProtocolGenerator(c) {
  const protos = c.securityProtocols ||= defaultSecurityProtocols();
  return html`
    <section class="sec">
      <div class="sec-head">
        <h2>5-Level Security Protocol Sequence Chart</h2>
        <button type="button" class="btn ghost sm" data-act="sec-proto-reset">Reset to defaults</button>
      </div>
      <p class="muted" style="margin-top:0">Customize what happens at each escalation level—who gets notified, whether assigned doors must be verified locked, whether all displays switch to an emergency broadcast, and the exact step-by-step instructions shown to each role.</p>

      <div class="sec-proto-list">
        ${protos.map((p) => html`<article class="panel sec-proto-card" style="border-left:5px solid ${p.color}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
            <div>
              <span class="tag" style="background:${p.color};color:#fff">${p.code}</span>
              <b style="font-size:1.1rem;margin-left:6px">${p.name}</b>
              <p class="muted" style="margin:4px 0 8px">${p.summary}</p>
            </div>
            <div class="btns" style="margin:0">
              <button type="button" class="btn ghost sm" data-act="sec-proto-edit" data-level="${p.level}">${icon("edit")}Customize Level ${p.level}</button>
              <button type="button" class="btn danger sm" data-act="sec-activate-level" data-level="${p.level}">Activate ${p.code}</button>
            </div>
          </div>

          <div class="chips" style="margin-bottom:10px">
            <span class="tag">Notifies: ${p.notifyScope === "everyone" ? "Everyone On-Site" : p.notifyScope === "staff_volunteers" ? "Security, Staff & Volunteers" : "Security Team Only"}</span>
            ${p.requireDoorCheck ? html`<span class="tag warn">Triggers Door Lock Verification</span>` : ""}
            ${p.overrideDisplays ? html`<span class="tag warn">Overrides All Campus Displays</span>` : ""}
            ${p.requireRollCall ? html`<span class="tag ok">Generates Live Roll Call &amp; Headcount</span>` : ""}
          </div>

          <div class="sec-proto-roles-grid">
            ${[
              ["security", "Security Team Steps"],
              ["staff", "Staff & Door Assignees"],
              ["teachers", "Classroom Teachers & Kids Team"],
              ["members", "Congregation & Visitors"],
            ].map(([rk, rl]) => html`<div class="sec-role-col">
              <b>${rl}</b>
              <ol>${(p.stepsByRole?.[rk] || []).map((st) => html`<li>${st}</li>`)}</ol>
            </div>`)}
          </div>
        </article>`)}
      </div>
    </section>
  `;
}

Actions["sec-proto-edit"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), p = (c.securityProtocols || defaultSecurityProtocols()).find((x) => +x.level === +el.dataset.level);
  if (!p) return;
  openSheet(`Customize ${p.code}: ${p.name}`, html`<form data-form="sec-proto-save" novalidate>
    <input type="hidden" name="level" value="${p.level}">
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:10px">
      <label class="field"><span>Protocol Title</span><input type="text" name="name" required maxlength="80" value="${p.name}"></label>
      <label class="field"><span>Who gets notified automatically?</span><select name="notifyScope">
        <option value="security" ${attr(p.notifyScope === "security", "selected")}>Security Team Only</option>
        <option value="staff_volunteers" ${attr(p.notifyScope === "staff_volunteers", "selected")}>Security, Staff &amp; Volunteers</option>
        <option value="everyone" ${attr(p.notifyScope === "everyone", "selected")}>Everyone (Campus-Wide Alert)</option>
      </select></label>
    </div>
    <label class="field"><span>Summary description</span><input type="text" name="summary" maxlength="200" value="${p.summary}"></label>
    <label class="field"><span>Emergency Broadcast Banner / Display Text</span><textarea name="broadcastText" rows="2" maxlength="320">${p.broadcastText || ""}</textarea></label>

    <label class="check"><input type="checkbox" name="requireDoorCheck" ${attr(p.requireDoorCheck, "checked")}><span><b>Require Assigned Door Lock Verification</b> (prompts assignees to verify every exterior door)</span></label>
    <label class="check"><input type="checkbox" name="overrideDisplays" ${attr(p.overrideDisplays, "checked")}><span><b>Override All Campus Displays</b> (switches signage, classroom TVs, stage, and main screens to Emergency Broadcast)</span></label>
    <label class="check"><input type="checkbox" name="requireRollCall" ${attr(p.requireRollCall, "checked")}><span><b>Generate Live Roll Call &amp; Classroom Headcount</b> (activates teacher headcount &amp; Unaccounted Report)</span></label>

    <h3 style="margin-top:14px">Role-Specific Step-by-Step Checklists (one step per line)</h3>
    <label class="field"><span>Security Team steps</span><textarea name="steps_security" rows="3">${(p.stepsByRole?.security || []).join("\n")}</textarea></label>
    <label class="field"><span>Staff &amp; Door Verifier steps</span><textarea name="steps_staff" rows="3">${(p.stepsByRole?.staff || []).join("\n")}</textarea></label>
    <label class="field"><span>Classroom Teachers &amp; Kids Ministry steps</span><textarea name="steps_teachers" rows="3">${(p.stepsByRole?.teachers || []).join("\n")}</textarea></label>
    <label class="field"><span>Congregation Members &amp; Visitors steps</span><textarea name="steps_members" rows="3">${(p.stepsByRole?.members || []).join("\n")}</textarea></label>

    <button class="btn block">Save Protocol Level ${p.level}</button>
  </form>`, { wide: true });
};

Forms["sec-proto-save"] = (d) => {
  if (!canLeadSecurity()) return;
  const c = S.church(); c.securityProtocols ||= defaultSecurityProtocols();
  const p = c.securityProtocols.find((x) => +x.level === +d.level);
  if (!p) return;
  const splitLines = (txt) => String(txt || "").split("\n").map((x) => x.trim()).filter(Boolean);
  Object.assign(p, {
    name: String(d.name || "").trim() || p.name,
    notifyScope: d.notifyScope || "security",
    summary: String(d.summary || "").trim(),
    broadcastText: String(d.broadcastText || "").trim(),
    requireDoorCheck: !!d.requireDoorCheck,
    overrideDisplays: !!d.overrideDisplays,
    requireRollCall: !!d.requireRollCall,
    stepsByRole: {
      security: splitLines(d.steps_security),
      staff: splitLines(d.steps_staff),
      teachers: splitLines(d.steps_teachers),
      members: splitLines(d.steps_members),
    },
  });
  S.save(); closeSheet(true); toast(`Level ${p.level} protocol saved`); render();
};

Actions["sec-proto-reset"] = () => {
  if (!canLeadSecurity()) return;
  S.church().securityProtocols = defaultSecurityProtocols();
  S.save(); toast("Protocols reset to default 5-level chart"); render();
};

// Member-facing Safety Status & Classroom Roll Call screen (#safety-status)
Screens["safety-status"] = () => {
  const c = S.church(), alert = c?.activeAlert;
  if (!alert?.active) return { redirect: isSecurityMember() ? "security" : "home" };
  return {
    title: "Campus Safety Alert", back: "home",
    body: html`
      ${renderActiveProtocolBanner(alert)}
      ${alert.requireDoorCheck && securitySections().doors ? renderSecurityDoors(c) : ""}
      ${alert.requireRollCall ? renderSecurityRollCall(c) : ""}
    `,
  };
};


Actions["sec-earpiece-toggle"] = (el) => {
  secEarpieceMode = !secEarpieceMode;
  toast(secEarpieceMode ? "🎧 Hands-Free Earpiece Mode ON: Incoming PTT audio and urgent alerts will auto-play." : "Hands-Free Earpiece Mode OFF");
  if (secEarpieceMode) playEarpieceCallout("Hands-free earpiece audio active.");
  el.textContent = `Earpiece: ${secEarpieceMode ? "On" : "Off"}`;
  el.setAttribute("aria-pressed", String(secEarpieceMode));
};

// ============================================================================
// TAB 6: SAFETY DRILL PLANNER & RANDOM EVENT / HYBRID ROLE SIMULATOR (#security-drill)
// ============================================================================

const DRILL_SCENARIO_CATALOG = [
  {
    id: "scen-door-latch",
    level: 1,
    title: "Fellowship Hall Exterior Latch Failure & Prop Alert",
    room: "Fellowship Hall East Door",
    category: "Door / Entryway Won't Lock",
    openingInject: "Sensor/Rover check reports Fellowship Hall Kitchen & Loading Door latch is binding and failing to lock securely before service.",
    complications: [
      { kind: "door_issue", doorIdx: 2, text: "Fellowship Hall Loading Door deadbolt jammed halfway; temporary rover guard required until maintenance arrives." },
      { kind: "comms", text: "Maintenance custodian requested in Fellowship Hall corridor with replacement strike plate." },
    ],
  },
  {
    id: "scen-suspicious-lot",
    level: 2,
    title: "Suspicious Individual Circling North Parking Lot & Kids Entry",
    room: "Main Lobby / North Parking Lot",
    category: "Suspicious Individual / Activity",
    openingInject: "Parking team reports an unknown individual photographing the Kids Wing check-in entrance and testing side door handles.",
    complications: [
      { kind: "comms", text: "Subject moved toward West Youth Annex exterior stairs; two-person security recon pair tracking on foot." },
      { kind: "door_issue", doorIdx: 3, text: "Youth Annex West Side Entry found ajar during perimeter sweep!" },
      { kind: "escalate", toLevel: 4, text: "Subject refused verbal contact and walked toward rear courtyard—escalating drill to Level 4 Perimeter Lockout!" },
    ],
  },
  {
    id: "scen-code-adam",
    level: 3,
    title: "Code Adam — Missing 5-Year-Old from Kids Kingdom (Room 102)",
    room: "Children's Wing / Room 102",
    category: "Missing / Lost Child (Code Adam)",
    openingInject: "Teacher in Room 102 reports Liam Carter (age 5, blue denim jacket, white sneakers) stepped out toward the restroom 3 minutes ago and has not returned.",
    complications: [
      { kind: "missing_person", text: "Classroom headcount flags 1 child unaccounted in Kids Kingdom (Room 102); all exterior doors must be guarded immediately." },
      { kind: "door_issue", doorIdx: 0, text: "Main Lobby North Glass Doors requires a second greeter/usher stationed to monitor exiting vehicles." },
      { kind: "comms", text: "Rover 2 sweeping Fellowship Hall restrooms and stairwell; ChildFound protocol standing by." },
    ],
  },
  {
    id: "scen-perimeter-lockout",
    level: 4,
    title: "Agitated Individual on Exterior Grounds — Full Perimeter Lockout",
    room: "Exterior Courtyard & South Lot",
    category: "Campus Disturbance",
    openingInject: "911 dispatch & parking rover report an agitated individual shouting in the south parking lot. All exterior doors must be locked and verified immediately.",
    complications: [
      { kind: "door_issue", doorIdx: 1, text: "Kids Wing East Check-In Entrance magnetic lock delayed—assignee needs security backup at door." },
      { kind: "medical", room: "Main Lobby", text: "Usher at Main Lobby experiencing chest tightness from stress—requesting CPR/First-Aid responder with AED." },
      { kind: "escalate", toLevel: 5, text: "Individual approached Main Lobby glass doors—escalating drill to Level 5 Campus-Wide Lockdown & Safe-Zone Barricade!" },
    ],
  },
  {
    id: "scen-campus-lockdown",
    level: 5,
    title: "Active Campus Threat — Full Lockdown, Display Override & Roll Call",
    room: "Sanctuary Foyer / Campus-Wide",
    category: "Active Threat / Lockdown",
    openingInject: "Emergency SOS triggered at Main Lobby North Entrance. Immediate Level 5 Campus-Wide Lockdown, Safe-Zone Barricade, and Classroom Roll Call initiated.",
    complications: [
      { kind: "door_issue", doorIdx: 0, text: "Main Lobby North Glass Doors flagged compromised—barricade interior Sanctuary & Choir Safe Zones immediately." },
      { kind: "missing_person", text: "Live Roll Call shows 2 individuals not yet checked into a Safe Zone in Youth Annex." },
      { kind: "reunify_request", text: "Post-incident phase: Parents arriving at Family Reunification Gate requesting pickup code verification." },
    ],
  },
  {
    id: "scen-custody-attempt",
    level: 2,
    title: "Unauthorized Custody Pickup Attempt at Kids Check-In Desk",
    room: "Kids Check-In Desk",
    category: "Unauthorized Pickup Attempt",
    openingInject: "Individual at Kids Check-In Desk attempting to pick up child without matching 4-character pickup code or authorized pickup listing.",
    complications: [
      { kind: "comms", text: "Kids Desk Lead holding child inside classroom; Security Rover requested at Kids Check-In Desk immediately." },
      { kind: "escalate", toLevel: 4, text: "Individual became belligerent in hallway—locking down Children's Wing doors (Level 4)." },
    ],
  },
];

let drillSimTimer = null;

function ensureDrillLoopRunning() {
  if (drillSimTimer) clearInterval(drillSimTimer);
  const c = S.church();
  if (!c?.activeDrill?.active) return;
  const sec = clamp(+(c.activeDrill.simCadenceSec || 12), 5, 120);
  drillSimTimer = setInterval(() => {
    const cur = S.church();
    if (!cur?.activeDrill?.active) {
      clearInterval(drillSimTimer);
      drillSimTimer = null;
      return;
    }
    executeSimulatedDrillStep(cur, { manual: false });
  }, sec * 1000);
}

/** Determines whether a specific user or role is simulated by the system during the current drill. */
function isRoleSimulatedInDrill(drill, roleKey, assignedUserId = "") {
  if (!drill) return false;
  if (drill.participationMode === "real_only") return false;
  if (drill.participationMode === "sim_only") return true;
  // Hybrid mode: check role setting and whether assignedUserId is in preselected real staff
  const mode = drill.roleModes?.[roleKey] || "hybrid";
  if (mode === "simulated") return true;
  if (mode === "real") return false;
  // "hybrid": if there is a specific user assigned and they are in includedRealStaffIds, let the real user act; otherwise system simulates!
  if (assignedUserId && (drill.includedRealStaffIds || []).includes(assignedUserId)) return false;
  return true;
}

/** Runs one autonomous simulation step (simulated staff checking doors, teachers doing headcount, rovers messaging, or random complication injects). */
function executeSimulatedDrillStep(c = S.church(), { manual = false, forceComplication = false } = {}) {
  if (!canLeadSecurity()) return;
  const drill = c?.activeDrill;
  if (!drill?.active) return;
  drill.events ||= [];
  const fn = drill.functions || {};
  const now = new Date().toISOString();
  const simNames = {
    security: ["Sim Rover Alpha (System)", "Sim Security Lead (System)", "Sim Parking Rover (System)"],
    doors: ["Sim Door Marshal 1 (System)", "Sim Usher Rover (System)", "Sim Facility Staff (System)"],
    teachers: ["Sim Teacher — Room 102 (System)", "Sim Nursery Lead (System)", "Sim Youth Leader (System)"],
    members: ["Sim Congregation Member (System)", "Sim Visitor Family (System)"],
    medical: ["Sim CPR Responder (System)", "Sim Nurse Team (System)"],
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const actionsTaken = [];

  // 1. If Door Verification is included and there are pending doors assigned to simulated staff, simulate checking 1-2 doors
  if (fn.doors && c.activeAlert?.requireDoorCheck) {
    const pendingDoors = (c.securityDoors || []).filter((d) => d.status === "pending" && isRoleSimulatedInDrill(drill, "doors", d.assignedTo));
    if (pendingDoors.length) {
      const door = pick(pendingDoors);
      const actor = door.assignedTo && S.user(door.assignedTo) && !isRoleSimulatedInDrill(drill, "doors", door.assignedTo)
        ? S.userName(door.assignedTo)
        : pick(simNames.doors);
      const rollIssue = (forceComplication || (fn.randomInjects && Math.random() * 100 < (drill.complicationRate ?? 30))) && !drill.hadDoorIssueInject;
      if (rollIssue) {
        drill.hadDoorIssueInject = true;
        Object.assign(door, {
          status: "issue",
          verifiedBy: actor,
          verifiedAt: now,
          issueNote: "[SIMULATED INJECT] Latch bolt obstructed — door will not lock without manual override!",
        });
        const txt = `🧪 [SIMULATED DOOR ISSUE] ${actor} reports ${door.name} (${door.zone}) WILL NOT LOCK — rover needed immediately!`;
        S.add("securityMessages", { by: S.me().id, senderName: actor, priority: "urgent", isDrill: true, text: txt, at: now });
        drill.events.unshift({ at: now, actor, kind: "complication", text: `Injected Unsecured Door Complication at ${door.name}` });
        actionsTaken.push(`Simulated door issue at ${door.name}`);
      } else {
        Object.assign(door, {
          status: "locked",
          verifiedBy: actor,
          verifiedAt: now,
          issueNote: "",
        });
        drill.events.unshift({ at: now, actor, kind: "door_verified", text: `${actor} verified ${door.name} LOCKED & SECURED` });
        actionsTaken.push(`Verified ${door.name} locked`);
      }
    }
  }

  // 2. If Roll Call is included and there are unaccounted people in simulated teacher/member roles, simulate checking off 1-3 people
  if (fn.rollCall && c.activeAlert?.requireRollCall) {
    const unacc = S.list("securityRollCall").filter((r) => r.status === "unaccounted");
    const simCandidates = unacc.filter((r) => {
      const isKid = r.kind.includes("Child") || r.kind.includes("Class");
      return isRoleSimulatedInDrill(drill, isKid ? "teachers" : "members", r.userId || "");
    });
    if (simCandidates.length) {
      const batch = simCandidates.slice(0, Math.min(2, simCandidates.length));
      batch.forEach((r, idx) => {
        const isKid = r.kind.includes("Child") || r.kind.includes("Class");
        const actor = pick(isKid ? simNames.teachers : simNames.members);
        // Occasionally flag 1 simulated person as MISSING if complication injects are enabled
        if (idx === 0 && !drill.hadMissingInject && fn.randomInjects && (forceComplication || Math.random() * 100 < (drill.complicationRate ?? 30))) {
          drill.hadMissingInject = true;
          Object.assign(r, { status: "missing", checkedBy: actor, checkedAt: now, safeZone: "NOT IN SAFE ZONE" });
          const txt = `🧪 [SIMULATED HEADCOUNT ALERT] ${actor} flagged ${r.name} (${r.group} / ${r.room}) as UNACCOUNTED / MISSING during safe-zone roll call!`;
          S.add("securityMessages", { by: S.me().id, senderName: actor, priority: "urgent", isDrill: true, text: txt, at: now });
          drill.events.unshift({ at: now, actor, kind: "complication", text: `Flagged ${r.name} as MISSING from ${r.room}` });
          actionsTaken.push(`Flagged ${r.name} missing`);
        } else {
          Object.assign(r, { status: "safe", checkedBy: actor, checkedAt: now, safeZone: `${r.room || "Main"} Safe Zone` });
          drill.events.unshift({ at: now, actor, kind: "rollcall_safe", text: `${actor} verified ${r.name} SAFE in ${r.room || "Safe Zone"}` });
          actionsTaken.push(`Marked ${r.name} safe`);
        }
      });
    }
  }

  // 3. Random Scenario Complication or Tactical Security Rover update
  if ((!actionsTaken.length || manual || forceComplication) && (fn.randomInjects || manual)) {
    const scen = DRILL_SCENARIO_CATALOG.find((s) => s.id === drill.scenarioId) || pick(DRILL_SCENARIO_CATALOG);
    const unusedComp = (scen.complications || []).find((_, idx) => !(drill.usedComplications || []).includes(idx));
    if (unusedComp) {
      drill.usedComplications ||= [];
      drill.usedComplications.push(scen.complications.indexOf(unusedComp));
      const actor = pick(simNames.security);
      if (unusedComp.kind === "escalate" && unusedComp.toLevel && c.activeAlert && c.activeAlert.level < unusedComp.toLevel) {
        activateSecurityProtocol(unusedComp.toLevel, {
          customNote: `[DRILL ESCALATION] ${unusedComp.text}`,
          isDrill: true,
          drillFunctions: drill.functions,
          drillRealStaffIds: drill.includedRealStaffIds,
        });
        drill.currentLevel = unusedComp.toLevel;
        drill.events.unshift({ at: now, actor: "Drill Simulator", kind: "escalate", text: `Auto-escalated drill to LEVEL ${unusedComp.toLevel}: ${unusedComp.text}` });
        actionsTaken.push(`Escalated to Level ${unusedComp.toLevel}`);
      } else if (unusedComp.kind === "medical" && fn.medical) {
        const medActor = isRoleSimulatedInDrill(drill, "medical") ? pick(simNames.medical) : "Drill Simulator";
        const txt = `🧪 [SIMULATED MEDICAL INJECT] ${unusedComp.text} (${medActor} dispatched with Main Lobby AED).`;
        S.add("securityMessages", { by: S.me().id, senderName: medActor, priority: "urgent", isDrill: true, text: txt, at: now });
        drill.events.unshift({ at: now, actor: medActor, kind: "medical", text: unusedComp.text });
        actionsTaken.push("Injected medical AED event");
      } else {
        const txt = `🧪 [DRILL INJECT] ${unusedComp.text}`;
        S.add("securityMessages", { by: S.me().id, senderName: actor, priority: "urgent", isDrill: true, text: txt, at: now });
        drill.events.unshift({ at: now, actor, kind: "inject", text: unusedComp.text });
        actionsTaken.push("Injected scenario event");
      }
    } else if (isRoleSimulatedInDrill(drill, "security")) {
      const actor = pick(simNames.security);
      const roverUpdates = [
        "North and East parking lot perimeters swept; all vehicle lanes clear for emergency responders.",
        "Kids Wing interior corridor checked; teachers confirmed classroom doors locked and window shades lowered.",
        "Radio check on Channel 1: Command Post holding at Welcome Desk with live camera feed.",
        "Sanctuary balcony and rear sound booth checked clear; ushers stationed at interior safe zones.",
      ];
      const line = pick(roverUpdates);
      S.add("securityMessages", { by: S.me().id, senderName: actor, priority: "routine", isDrill: true, text: `🧪 [SIMULATED ROVER] ${line}`, at: now });
      drill.events.unshift({ at: now, actor, kind: "comms", text: line });
      actionsTaken.push("Simulated rover tactical update");
    }
  }

  S.save();
  const latestEvent = drill.events[0];
  broadcastSafetyUpdate({
    msgId: uid(),
    spokenText: latestEvent ? `Drill update: ${latestEvent.text}` : "",
  });
  if (manual && actionsTaken.length) toast(`Drill Simulator: ${actionsTaken.join(" · ")}`);
  render();
}

function renderActiveDrillTelemetryBar(c, drill) {
  const doors = c.securityDoors || [];
  const locked = doors.filter((d) => d.status === "locked").length;
  const issues = doors.filter((d) => d.status === "issue").length;
  const roll = S.list("securityRollCall");
  const safe = roll.filter((r) => r.status === "safe").length;
  const elapsedSec = Math.max(0, Math.floor((Date.now() - new Date(drill.startedAt).getTime()) / 1000));
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  const modeLabels = {
    real_only: "100% Real-Life Staff Only",
    hybrid: `Hybrid (${(drill.includedRealStaffIds || []).length} Real Staff + Simulated Roles)`,
    sim_only: "100% System-Simulated Staff",
  };

  return html`<div class="drill-telemetry-bar">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div>
        <span class="drill-pill">🧪 SAFETY DRILL SIMULATOR ACTIVE · ${mm}:${ss} ELAPSED</span>
        <h3 style="margin:6px 0 2px;color:#fff">Scenario: ${drill.scenarioTitle} (Level ${drill.currentLevel})</h3>
        <div style="font-size:.84rem;color:rgba(255,255,255,.88)">
          Mode: <b>${modeLabels[drill.participationMode] || "Hybrid"}</b> ·
          Doors Verified: <b>${locked}/${doors.length}</b>${issues ? ` (${issues} issue!)` : ""} ·
          Roll Call Safe: <b>${safe}/${roll.length}</b>
        </div>
      </div>
      <div class="btns" style="margin:0">
        <button type="button" class="btn sm" style="background:#fff;color:#4c1d95" data-act="drill-step-now">⚡ Inject Next Event / Sim Action</button>
        <button type="button" class="btn sm" style="background:#f59e0b;color:#111827" data-act="drill-random-complication">🎲 Random Complication</button>
        <button type="button" class="btn danger sm" data-act="drill-end-finish">End Drill &amp; Score AAR</button>
      </div>
    </div>
  </div>`;
}

function renderSecurityDrillSimulator(c) {
  const cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  const drill = c.activeDrill;
  const protos = c.securityProtocols || defaultSecurityProtocols();
  const allStaff = staffAndVolunteersUserIds(c.id).map((uid) => S.user(uid)).filter(Boolean);
  const pastDrills = S.list("securityDrills").sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (drill?.active) ensureDrillLoopRunning();

  const roleLabels = [
    ["security", "Security Team & Rovers", "Handles tactical comms, incident triage, and threat response"],
    ["doors", "Staff & Door Assignees", "Physically locks and verifies assigned campus doors (#security-doors)"],
    ["teachers", "Classroom Teachers & Kids Team", "Accounts for children in classrooms & safe zones (#security-rollcall)"],
    ["members", "Congregation & On-Site Visitors", "Marks self safe in app & follows display broadcast instructions"],
    ["medical", "Medical / CPR & AED Responders", "Responds to medical injects with nearest AED cabinet (#security-medical)"],
  ];

  const fnLabels = [
    ["notifications", "In-App / Push Drill Notifications", "Alerts preselected real-life staff (with clear [DRILL] tags)"],
    ["displays", "Override All Campus Displays", "Hijacks #signage, #present, #stage, and #room-display with Drill Broadcast (exclude for silent staff drills)"],
    ["homeBanner", "Show Alert Banner on Member Home Screen", "Displays active drill banner on #home (exclude to keep drill invisible to general visitors)"],
    ["doors", "Assigned Door Lock Verification Matrix", "Resets campus doors to Pending and tests door lock verification speed"],
    ["rollCall", "Live On-Site Roll Call & Classroom Headcount", "Generates live roster and tests classroom teacher headcount + Unaccounted Report"],
    ["reunification", "Post-Incident Guardian Child Reunification", "Activates 4-step parent pickup code verification & release log"],
    ["medical", "Medical / CPR & AED First-Responder Dispatch", "Includes medical emergency injects and AED responder routing"],
    ["randomInjects", "Autonomous Random Complication Injects", "Periodically injects jammed doors, missing-person flags, or level escalations during the drill"],
  ];

  return html`
    <section class="sec">
      <div class="sec-head">
        <h2>Safety Drill Planner &amp; Random Scenario Simulator</h2>
        ${drill?.active
          ? html`<button type="button" class="btn danger sm" data-act="drill-end-finish">Stop Drill &amp; Generate Report</button>`
          : html`<button type="button" class="btn sm" data-act="drill-launch-random">🎲 Quick-Launch Random Drill</button>`}
      </div>
      <p class="muted" style="margin-top:0">Configure and run realistic campus safety drills. Preselect a security level or let the simulator randomly generate the level and events; run with only real-life staff, only system-simulated staff, or any hybrid combination; and include or exclude specific app functions.</p>

      ${drill?.active ? html`
        <div class="panel" style="margin-bottom:16px">
          <div class="sec-head" style="margin-top:0">
            <h3>Live Drill Timeline &amp; Simulator Inject Feed (${(drill.events || []).length})</h3>
            <div class="btns" style="margin:0">
              <button type="button" class="btn ghost sm" data-act="drill-step-now">⚡ Advance Simulation Step</button>
              <button type="button" class="btn ghost sm" data-act="drill-random-complication">🎲 Inject Surprise Complication</button>
            </div>
          </div>
          <div class="rows">
            ${(drill.events || []).slice(0, 20).map((ev) => html`<div class="row">
              <span class="lead-ic">${ev.kind === "complication" || ev.kind === "escalate" ? "🚨" : ev.kind === "door_verified" ? "🚪" : ev.kind === "rollcall_safe" ? "✅" : "🧪"}</span>
              <span class="body">
                <span class="t">${ev.text}</span>
                <span class="s">Actor: <b>${ev.actor}</b> · ${fmtTime(ev.at)}</span>
              </span>
            </div>`)}
          </div>
        </div>
      ` : ""}

      <form data-form="drill-planner-launch" class="panel" novalidate>
        <h3 style="margin:0 0 10px">1. Security Level &amp; Scenario Generator</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field" style="margin:0">
            <span>Security Protocol Level Selection</span>
            <select name="levelMode" data-change="drill-cfg-sync">
              <option value="random" ${attr(cfg.levelMode === "random", "selected")}>🎲 Randomly Generate Security Level (Levels 1–5)</option>
              ${protos.map((p) => html`<option value="${p.level}" ${attr(String(cfg.levelMode) === String(p.level), "selected")}>Preselect ${p.code}: ${p.name}</option>`)}
            </select>
          </label>
          <label class="field" style="margin:0">
            <span>Event &amp; Scenario Generator</span>
            <select name="scenarioId" data-change="drill-cfg-sync">
              <option value="random" ${attr(cfg.scenarioId === "random", "selected")}>🎲 Randomly Generate Scenario &amp; Dynamic Injects</option>
              ${DRILL_SCENARIO_CATALOG.filter((s) => cfg.levelMode === "random" || +cfg.levelMode === s.level).map((s) => html`<option value="${s.id}" ${attr(cfg.scenarioId === s.id, "selected")}>[Level ${s.level}] ${s.title}</option>`)}
            </select>
          </label>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
          <label class="field" style="margin:0">
            <span>Simulated Staff &amp; Event Cadence</span>
            <select name="simCadenceSec">
              <option value="8" ${attr(+cfg.simCadenceSec === 8, "selected")}>Fast Pacing (Every 8 seconds)</option>
              <option value="12" ${attr(+cfg.simCadenceSec === 12, "selected")}>Standard Pacing (Every 12 seconds)</option>
              <option value="25" ${attr(+cfg.simCadenceSec === 25, "selected")}>Real-Time Pacing (Every 25 seconds)</option>
              <option value="60" ${attr(+cfg.simCadenceSec === 60, "selected")}>Tabletop Pacing (Every 60 seconds / Manual)</option>
            </select>
          </label>
          <label class="field" style="margin:0">
            <span>Random Complication Probability (Jammed Doors / Missing Person)</span>
            <select name="complicationRate">
              <option value="0" ${attr(+cfg.complicationRate === 0, "selected")}>0% — Smooth Execution (No Complication Injects)</option>
              <option value="30" ${attr(+cfg.complicationRate === 30, "selected")}>30% — Realistic Complications (Recommended)</option>
              <option value="65" ${attr(+cfg.complicationRate === 65, "selected")}>65% — High-Stress Multi-Complication Stress Test</option>
            </select>
          </label>
        </div>

        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">

        <h3 style="margin:0 0 6px">2. Staff Participation &amp; Simulated Role Assignment</h3>
        <p class="faint" style="margin:0 0 10px">Conduct the drill with only real-life users, only system-simulated staff, or preselect which real-life staff members participate while the system simulates the remaining roles.</p>

        <div class="chips" style="margin-bottom:12px">
          ${[
            ["real_only", "👤 Only Real-Life Users (0% Simulated)"],
            ["hybrid", "🤝 Hybrid: Preselected Real Staff + Simulated Roles"],
            ["sim_only", "🤖 100% System-Simulated Staff (Automated Demo)"],
          ].map(([mKey, mLbl]) => html`<button type="button" class="chip" data-act="drill-part-mode" data-mode="${mKey}" aria-pressed="${cfg.participationMode === mKey}">${mLbl}</button>`)}
        </div>

        ${cfg.participationMode !== "sim_only" ? html`
          <div class="panel" style="background:var(--sunken);margin-bottom:12px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
              <b>Preselect Real-Life Staff &amp; Volunteers Included in This Drill (${(cfg.includedRealStaffIds || []).length}/${allStaff.length})</b>
              <div class="btns" style="margin:0">
                <button type="button" class="btn ghost sm" data-act="drill-staff-all" data-on="1">Select All Real Staff</button>
                <button type="button" class="btn ghost sm" data-act="drill-staff-all" data-on="0">Clear All</button>
              </div>
            </div>
            <div class="drill-staff-grid">
              ${allStaff.map((u) => {
                const checked = (cfg.includedRealStaffIds || []).includes(u.id);
                const roleTag = isSecurityMember(u.id, c.id) ? "Security" : isStaffMember(u.id, c.id) ? "Staff" : "Volunteer";
                return html`<label class="check drill-staff-chip">
                  <input type="checkbox" name="realStaff" value="${u.id}" ${attr(checked, "checked")} data-change="drill-staff-toggle">
                  <span><b>${u.name}</b> <small class="faint">(${roleTag})</small></span>
                </label>`;
              })}
            </div>
          </div>
        ` : ""}

        ${cfg.participationMode === "hybrid" ? html`
          <div class="rows" style="margin-bottom:12px">
            ${roleLabels.map(([rk, rTitle, rSub]) => {
              const cur = cfg.roleModes?.[rk] || "hybrid";
              return html`<div class="row">
                <span class="body">
                  <span class="t">${rTitle}</span>
                  <span class="s">${rSub}</span>
                </span>
                <select name="role_${rk}" data-change="drill-role-mode" data-role="${rk}" style="width:auto;min-width:230px">
                  <option value="real" ${attr(cur === "real", "selected")}>👤 Real Staff Only</option>
                  <option value="hybrid" ${attr(cur === "hybrid", "selected")}>🤝 Hybrid (Real + System Simulates Unassigned)</option>
                  <option value="simulated" ${attr(cur === "simulated", "selected")}>🤖 Simulated by System</option>
                </select>
              </div>`;
            })}
          </div>
        ` : ""}

        <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div>
            <h3 style="margin:0">3. Function Inclusion / Exclusion Matrix</h3>
            <p class="faint" style="margin:2px 0 0">Select which campus systems are included or excluded during the drill (e.g., exclude Display Override during a quiet staff tabletop drill).</p>
          </div>
          <div class="btns" style="margin:0">
            <button type="button" class="btn ghost sm" data-act="drill-fn-preset" data-preset="quiet">Quiet Staff Drill Preset</button>
            <button type="button" class="btn ghost sm" data-act="drill-fn-preset" data-preset="full">Full Campus Lockdown Preset</button>
          </div>
        </div>

        <div class="drill-fn-grid">
          ${fnLabels.map(([fk, fTitle, fDesc]) => {
            const on = !!cfg.functions?.[fk];
            return html`<label class="check drill-fn-card ${on ? "is-included" : "is-excluded"}">
              <input type="checkbox" name="fn_${fk}" ${attr(on, "checked")} data-change="drill-fn-toggle" data-fn="${fk}">
              <span>
                <b>${fTitle}</b>
                <span class="tag ${on ? "ok" : ""}" style="margin-left:6px">${on ? "INCLUDED" : "EXCLUDED"}</span>
                <br><small class="faint">${fDesc}</small>
              </span>
            </label>`;
          })}
        </div>

        <div class="btns" style="margin-top:16px">
          <button class="btn block" style="background:#6d28d9;color:#fff;font-size:1.02rem;padding:12px">
            🧪 ${drill?.active ? "Restart & Launch Configured Safety Drill" : "Launch Configured Safety Drill"}
          </button>
        </div>
      </form>
    </section>

    <section class="sec">
      <div class="sec-head">
        <h2>Completed Drill After-Action Reports (${pastDrills.length})</h2>
      </div>
      <div class="rows">
        ${pastDrills.length ? pastDrills.map((d) => html`<article class="panel" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <span class="tag brand">SCORE: ${d.score}/100</span>
              <b style="margin-left:6px">${d.scenarioTitle} (Level ${d.level})</b>
              <span class="faint"> · ${fmtShort(d.startedAt)} · Duration: ${d.durationSec}s</span>
            </div>
            <span class="tag ok">${d.participationMode === "real_only" ? "Real Staff Only" : d.participationMode === "sim_only" ? "100% Simulated" : "Hybrid Real + Sim"}</span>
          </div>
          <p class="muted" style="margin:6px 0 0">Doors Verified: <b>${d.doorsVerified}/${d.doorsTotal}</b> · Roll Call Accounted: <b>${d.rollCallSafe}/${d.rollCallTotal}</b> · Lead: ${d.ledBy}</p>
        </article>`) : empty("No completed drills logged yet. Launch a drill above and click 'End Drill & Score AAR' when finished.")}
      </div>
    </section>
  `;
}

Actions["drill-part-mode"] = (el) => {
  if (!canLeadSecurity()) return;
  const cfg = S.church().drillPlanner ||= defaultDrillPlannerConfig(S.church().id);
  cfg.participationMode = el.dataset.mode;
  S.save(); render();
};
Actions["drill-staff-all"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  cfg.includedRealStaffIds = +el.dataset.on ? staffAndVolunteersUserIds(c.id) : [];
  S.save(); render();
};
Inputs["drill-staff-toggle"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  const set = new Set(cfg.includedRealStaffIds || []);
  if (el.checked) set.add(el.value); else set.delete(el.value);
  cfg.includedRealStaffIds = [...set];
  S.save();
};
Inputs["drill-role-mode"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  cfg.roleModes ||= {};
  cfg.roleModes[el.dataset.role] = el.value;
  S.save();
};
Inputs["drill-fn-toggle"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  cfg.functions ||= {};
  cfg.functions[el.dataset.fn] = el.checked;
  S.save(); render();
};
Inputs["drill-cfg-sync"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  if (el.name === "levelMode") cfg.levelMode = el.value;
  if (el.name === "scenarioId") cfg.scenarioId = el.value;
  S.save(); render();
};
Actions["drill-fn-preset"] = (el) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  if (el.dataset.preset === "quiet") {
    cfg.functions = { notifications: true, displays: false, homeBanner: false, doors: true, rollCall: true, reunification: true, medical: true, randomInjects: true };
    toast("Applied Quiet Staff Drill Preset (Display Override & Member Home Banner excluded)");
  } else {
    cfg.functions = { notifications: true, displays: true, homeBanner: true, doors: true, rollCall: true, reunification: true, medical: true, randomInjects: true };
    toast("Applied Full Campus Lockdown Preset (All functions included)");
  }
  S.save(); render();
};

function startConfiguredSafetyDrill(cfg) {
  if (!canLeadSecurity()) return;
  const c = S.church(); if (!c) return;
  if (c.activeAlert?.active && !c.activeAlert.isDrill) return toast("Issue All Clear before starting a drill.");
  const chosenLevel = cfg.levelMode === "random"
    ? (1 + Math.floor(Math.random() * 5))
    : clamp(+cfg.levelMode, 1, 5);
  const matchingScenarios = DRILL_SCENARIO_CATALOG.filter((s) => s.level === chosenLevel);
  const chosenScenario = cfg.scenarioId !== "random"
    ? (DRILL_SCENARIO_CATALOG.find((s) => s.id === cfg.scenarioId) || matchingScenarios[0] || DRILL_SCENARIO_CATALOG[0])
    : (matchingScenarios[Math.floor(Math.random() * matchingScenarios.length)] || DRILL_SCENARIO_CATALOG[0]);

  const finalLevel = cfg.scenarioId !== "random" && cfg.levelMode === "random" ? chosenScenario.level : chosenLevel;
  const now = new Date().toISOString();

  c.activeDrill = {
    id: uid(),
    active: true,
    startedAt: now,
    ledBy: S.me().name,
    levelMode: cfg.levelMode,
    initialLevel: finalLevel,
    currentLevel: finalLevel,
    scenarioId: chosenScenario.id,
    scenarioTitle: chosenScenario.title,
    participationMode: cfg.participationMode,
    includedRealStaffIds: [...(cfg.includedRealStaffIds || [])],
    roleModes: { ...(cfg.roleModes || {}) },
    functions: { ...(cfg.functions || {}) },
    simCadenceSec: +(cfg.simCadenceSec || 12),
    complicationRate: +(cfg.complicationRate ?? 30),
    usedComplications: [],
    hadDoorIssueInject: false,
    hadMissingInject: false,
    events: [
      {
        at: now,
        actor: "Drill Simulator",
        kind: "start",
        text: `Launched Drill (${cfg.levelMode === "random" ? `Randomly Selected Level ${finalLevel}` : `Preselected Level ${finalLevel}`}): ${chosenScenario.openingInject}`,
      },
    ],
  };

  // Log a synthetic drill incident in securityIncidents
  const inc = S.add("securityIncidents", {
    kind: "DRILL_INJECT",
    category: `🧪 [DRILL] ${chosenScenario.category}`,
    rawCategory: "drill",
    suggestedLevel: finalLevel,
    severity: finalLevel >= 4 ? "critical" : "medium",
    by: S.me().id,
    reporterName: `Drill Simulator (${S.me().name})`,
    room: chosenScenario.room,
    details: `[DRILL SCENARIO] ${chosenScenario.openingInject}`,
    status: `Drill Level ${finalLevel} Active`,
    at: now,
  });

  activateSecurityProtocol(finalLevel, {
    customNote: `${chosenScenario.title} — ${chosenScenario.openingInject}`,
    incidentId: inc.id,
    isDrill: true,
    drillFunctions: c.activeDrill.functions,
    drillRealStaffIds: c.activeDrill.includedRealStaffIds,
  });

  // Run an initial simulated step after 1.2s if simulated roles are active
  if (c.activeDrill.participationMode !== "real_only") {
    setTimeout(() => executeSimulatedDrillStep(S.church(), { manual: false }), 1200);
  }
  ensureDrillLoopRunning();
  render();
}

Forms["drill-planner-launch"] = (d, f, fd) => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  cfg.levelMode = d.levelMode || "random";
  cfg.scenarioId = d.scenarioId || "random";
  cfg.simCadenceSec = +(d.simCadenceSec || 12);
  cfg.complicationRate = +(d.complicationRate ?? 30);
  if (cfg.participationMode !== "sim_only") {
    cfg.includedRealStaffIds = fd.getAll("realStaff");
  }
  startConfiguredSafetyDrill(cfg);
};

Actions["drill-launch-random"] = () => {
  if (!canLeadSecurity()) return;
  const c = S.church(), cfg = c.drillPlanner ||= defaultDrillPlannerConfig(c.id);
  cfg.levelMode = "random";
  cfg.scenarioId = "random";
  startConfiguredSafetyDrill(cfg);
};

Actions["drill-step-now"] = () => {
  executeSimulatedDrillStep(S.church(), { manual: true });
};

Actions["drill-random-complication"] = () => {
  executeSimulatedDrillStep(S.church(), { manual: true, forceComplication: true });
};

Actions["drill-end-finish"] = () => {
  if (!canLeadSecurity()) return;
  const c = S.church(), drill = c?.activeDrill;
  if (!drill) return;
  if (drillSimTimer) { clearInterval(drillSimTimer); drillSimTimer = null; }
  const durationSec = Math.max(1, Math.round((Date.now() - new Date(drill.startedAt).getTime()) / 1000));
  const doors = c.securityDoors || [];
  const doorsVerified = doors.filter((d) => d.status === "locked").length;
  const roll = S.list("securityRollCall");
  const rollCallSafe = roll.filter((r) => r.status === "safe").length;

  const doorRatio = drill.functions?.doors && doors.length ? doorsVerified / doors.length : 1;
  const rollRatio = drill.functions?.rollCall && roll.length ? rollCallSafe / roll.length : 1;
  const score = Math.round((doorRatio * 50) + (rollRatio * 50));

  S.add("securityDrills", {
    scenarioId: drill.scenarioId,
    scenarioTitle: drill.scenarioTitle,
    level: drill.currentLevel,
    participationMode: drill.participationMode,
    doorsVerified,
    doorsTotal: doors.length,
    rollCallSafe,
    rollCallTotal: roll.length,
    durationSec,
    score,
    ledBy: drill.ledBy || S.me().name,
    startedAt: drill.startedAt,
    endedAt: new Date().toISOString(),
    eventsCount: (drill.events || []).length,
  });

  c.activeDrill = null;
  clearSecurityProtocol();
  toast(`Safety Drill concluded! Readiness Score: ${score}/100`);
  render();
};

// ============================================================================
// TAB 7: GUARDIAN-VERIFIED POST-INCIDENT CHILD REUNIFICATION (#security-reunify)
// ============================================================================

let reunifySearch = "";

function activeReunificationCheckins() {
  const today = isoDay(new Date());
  return S.list("checkins").filter((k) => !k.out && k.serviceKey?.slice(0, 10) >= today);
}

function reunifyResults(activeKids) {
  const q = reunifySearch.trim().toLowerCase();
  const filteredKids = activeKids.filter((k) => !q || `${k.childName} ${k.parentName} ${k.code} ${k.room}`.toLowerCase().includes(q));
  return filteredKids.length ? filteredKids.map((k) => {
    const authPickups = pickupsOf(k.by).map((p) => `${p.name} (${p.relation || "Authorized"})`);
    return html`<div class="row">
      <span class="lead-ic" style="font-family:monospace;font-weight:700;background:var(--brand-soft);color:var(--brand-ink)">${k.code}</span>
      <span class="body">
        <span class="t">${k.childName} <span class="tag">${k.room}</span></span>
        <span class="s">Primary Parent: <b>${k.parentName || S.userName(k.by)}</b> · Pickup Code: <b>${k.code}</b></span>
        ${authPickups.length ? html`<span class="s faint">Authorized Pickups: ${authPickups.join(", ")}</span>` : ""}
        ${k.allergies ? html`<span class="s" style="color:var(--warn)">Allergy: ${k.allergies}</span>` : ""}
      </span>
      <div class="btns" style="margin:0">
        <button type="button" class="btn sm" data-act="reunify-verify-modal" data-id="${k.id}">${icon("check")}Verify &amp; Release Child</button>
      </div>
    </div>`;
  }) : empty("No checked-in children awaiting reunification match that code. Tap 'Seed Sample Check-In Kids' above to test the 4-step workflow.");
}

function renderSecurityReunification(c) {
  const activeKids = activeReunificationCheckins();
  const logs = S.list("securityReunifications").sort((a, b) => b.at.localeCompare(a.at));

  return html`
    <div class="stat-tiles" style="margin-top:14px">
      ${statTile("Awaiting Reunification", activeKids.length.toLocaleString(), "Checked-in children in classrooms")}
      ${statTile("Reunified & Released", logs.length.toLocaleString(), "Verified pickup code + ID chain of custody")}
      ${statTile("Pickup Verification", "4-Step Gate", "Code Match → Photo ID → Runner → Sign-Off")}
    </div>

    <section class="sec">
      <div class="sec-head">
        <h2>Guardian Pickup Code &amp; Identity Verification Gate</h2>
        <button type="button" class="btn ghost sm" data-act="reunify-sim-seed">Seed Sample Check-In Kids</button>
      </div>
      <p class="faint" style="margin-top:0">Match the parent's 4-character pickup code from <code>#checkin</code>, verify their government photo ID or authorized pickup listing, dispatch a runner to the safe zone, and record an immutable chain-of-custody handoff.</p>

      <label class="field">
        <span>Search by 4-Character Pickup Code, Child Name, or Parent Name</span>
        <input type="search" placeholder="Enter 4-character pickup code (e.g., 4829) or child name..." value="${reunifySearch}" data-input="reunify-search" autocomplete="off">
      </label>

      <div class="rows" id="reunify-list">
        ${reunifyResults(activeKids)}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><h2>Completed Chain-of-Custody Reunification Log (${logs.length})</h2></div>
      <div class="panel">
        ${reportTable(
          "sec-reunifications",
          "child-reunification-log",
          ["Child Name", "Classroom", "Pickup Code", "Released To", "ID Verified", "Released By Staff", "Time"],
          logs.map((r) => [r.childName, r.room, r.code, `${r.guardianName} (${r.relation})`, r.idVerified ? "Photo ID + Code ✓" : "Code Match ✓", r.releasedBy, fmtTime(r.at)]),
          { limit: 40, empty: "No post-incident child reunifications logged yet." }
        )}
      </div>
    </section>
  `;
}

Inputs["reunify-search"] = (el) => {
  reunifySearch = el.value;
  $("#reunify-list").innerHTML = flat(reunifyResults(activeReunificationCheckins()));
};

Actions["reunify-sim-seed"] = () => {
  const c = S.church(), today = isoDay(new Date());
  [
    { childName: "Liam Carter", parentName: "Hannah Carter", room: "Room 102 (K–2nd)", code: "4829", allergies: "Peanuts" },
    { childName: "Noah Carter", parentName: "Hannah Carter", room: "Room 102 (K–2nd)", code: "4829", allergies: "" },
    { childName: "Chloe Davis", parentName: "Ben Davis", room: "Nursery B", code: "7314", allergies: "" },
  ].forEach((sample) => {
    if (!S.list("checkins").some((x) => !x.out && x.childName === sample.childName)) {
      S.add("checkins", {
        by: S.me().id,
        parentName: sample.parentName,
        childId: uid(),
        childName: sample.childName,
        room: sample.room,
        code: sample.code,
        allergies: sample.allergies,
        serviceKey: `${today}-09:00`,
        serviceName: "Sunday Morning Worship",
        at: new Date().toISOString(),
        out: null,
        via: "phone",
      });
    }
  });
  S.save(); toast("Sample checked-in children added with 4-character pickup codes!"); render();
};

Actions["reunify-verify-modal"] = async (el) => {
  if (!securitySections().reunify) return;
  const k = S.get("checkins", el.dataset.id);
  if (!k || k.churchId !== S.state.current || k.out) return;
  const me = S.me().id;
  let pickups = pickupsOf(k.by);
  if (Backend.on && !S.can("checkin.station") && canSuperviseSecurity()) {
    const { data, error } = await Backend.client.rpc("security_pickups", { c: k.churchId, checkin_id: k.id });
    if (S.me().id !== me || S.state.current !== k.churchId || location.hash !== "#security-reunify") return;
    if (error) return toast("Could not verify authorized pickups. Try again.");
    pickups = data;
  }
  openSheet(`Reunify & Release: ${k.childName}`, html`<form data-form="reunify-complete" novalidate>
    <input type="hidden" name="checkinId" value="${k.id}">
    <div class="panel" style="background:var(--sunken);margin-bottom:12px">
      <div><b>Child:</b> ${k.childName} (${k.room})</div>
      <div><b>Required Pickup Code:</b> <span class="tag brand" style="font-family:monospace;font-size:1rem">${k.code}</span></div>
      <div><b>Primary Parent:</b> ${k.parentName || S.userName(k.by)}</div>
    </div>
    <label class="field"><span>1. Confirm 4-Character Pickup Code Shown by Guardian</span><input type="text" name="enteredCode" required value="${k.code}" maxlength="8" style="font-family:monospace;font-weight:700"></label>
    <label class="field"><span>2. Guardian Receiving Child</span><input type="text" name="guardianName" required value="${k.parentName || S.userName(k.by)}" list="reunify-guardians">
      <datalist id="reunify-guardians">
        <option value="${k.parentName || S.userName(k.by)}">
        ${pickups.map((p) => html`<option value="${p.name}">`)}
      </datalist>
    </label>
    <label class="field"><span>3. Relationship to Child</span><select name="relation">
      <option value="Parent / Legal Guardian">Parent / Legal Guardian</option>
      <option value="Authorized Family Pickup">Authorized Family Pickup</option>
      <option value="Emergency Contact">Emergency Contact</option>
    </select></label>
    <label class="check"><input type="checkbox" name="idVerified" checked required><span><b>Step 1 &amp; 2 Verified:</b> Pickup tag/code matched AND government photo ID verified at Reunification Gate</span></label>
    <label class="check"><input type="checkbox" name="runnerConfirmed" checked required><span><b>Step 3 &amp; 4 Verified:</b> Classroom runner escorted child from safe zone to gate</span></label>
    <button class="btn block">${icon("check")}Complete Controlled Handoff &amp; Sign Log</button>
  </form>`);
};

Forms["reunify-complete"] = async (d, f) => {
  if (!securitySections().reunify) return;
  const k = S.get("checkins", d.checkinId);
  if (!k || k.churchId !== S.state.current || k.out) return;
  if (String(d.enteredCode || "").trim().toUpperCase() !== String(k.code || "").trim().toUpperCase()) {
    return formError(f, `Pickup code mismatch! Expected ${k.code}. Do not release child without Security Lead override.`);
  }
  const now = new Date().toISOString();
  if (Backend.on && !S.can("checkin.station") && canSuperviseSecurity()) {
    if (!d.idVerified || !d.runnerConfirmed) return formError(f, "Confirm identity verification and the handoff.");
    const user = S.me().id;
    const submit = $("button:not([type])", f);
    submit.disabled = true;
    try {
      const { error } = await Backend.client.rpc("security_checkout", {
        c: k.churchId, checkin_id: k.id, pickup_code: d.enteredCode, guardian_name: d.guardianName, relation_name: d.relation,
        identity_verified: !!d.idVerified, handoff_confirmed: !!d.runnerConfirmed,
      });
      if (error) throw error;
    } catch (error) {
      submit.disabled = false;
      return formError(f, error.message || "Could not complete reunification.");
    }
    if (S.state.current !== k.churchId || S.me().id !== user) return;
    try { await Backend.pull(); } catch { toast("Handoff saved. Refresh to update the reunification list."); }
    if (S.state.current !== k.churchId || S.me().id !== user) return;
  } else {
    k.out = now;
    k.outBy = S.me().id;
    S.add("securityReunifications", {
      checkinId: k.id,
      childName: k.childName,
      room: k.room,
      code: k.code,
      guardianName: String(d.guardianName || "").trim() || k.parentName,
      relation: d.relation || "Parent",
      idVerified: !!d.idVerified,
      releasedBy: S.me().name,
      at: now,
    });
  }
  // Also mark child safe/reunified in roll call if present
  S.list("securityRollCall").filter((r) => r.name.startsWith(k.childName)).forEach((r) => {
    r.status = "safe";
    r.safeZone = `Reunified with ${d.guardianName}`;
    r.checkedBy = S.me().name;
    r.checkedAt = now;
  });
  S.save(); closeSheet(true); broadcastSafetyUpdate(); toast(`${k.childName} reunified with ${d.guardianName} and logged.`); render();
};

// ============================================================================
// TAB 8: MEDICAL / CPR & AED FIRST-RESPONDER DISPATCH (#security-medical)
// ============================================================================

function renderSecurityMedical(c) {
  const aeds = c.securityAeds ||= defaultSecurityAeds(c.id);
  const responders = c.medicalResponders ||= defaultMedicalResponders(c.id);
  const amICertified = responders.some((r) => r.userId === S.me().id);

  return html`
    <div class="stat-tiles" style="margin-top:14px">
      ${statTile("On-Site Medical / CPR Team", responders.filter((r) => r.onSite).length.toLocaleString(), "CPR, AED, RN, EMT & First-Aid certified")}
      ${statTile("AED & Trauma Stations", aeds.length.toLocaleString(), "Pediatric + Adult pads stocked")}
      ${statTile("Rapid Medical Page", "1-Tap Dispatch", "Alerts certified responders + nearest AED")}
    </div>

    <div class="panel" style="margin-top:12px;border-left:5px solid #e11d48;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
      <div>
        <b style="font-size:1.04rem">❤️‍🩹 Medical Emergency / AED Needed On-Site?</b>
        <p class="muted" style="margin:2px 0 0">Silently pages all CPR, AED, Nurse, and EMT certified responders on campus with the room location and nearest AED cabinet.</p>
      </div>
      <div class="btns" style="margin:0">
        <button type="button" class="btn danger sm" data-act="med-dispatch-modal">Dispatch Medical / CPR Team &amp; AED</button>
        ${!amICertified ? html`<button type="button" class="btn ghost sm" data-act="med-register-self">+ Add My CPR / Medical Certification</button>` : ""}
      </div>
    </div>

    <section class="sec">
      <div class="sec-head">
        <h2>Campus AED &amp; Trauma Kit Locations (${aeds.length})</h2>
        <a class="btn ghost sm" href="#map">${icon("pin")}View on Campus Map</a>
      </div>
      <div class="rows">
        ${aeds.map((a) => html`<div class="row">
          <span class="lead-ic">❤️‍🩹</span>
          <span class="body">
            <span class="t">${a.name}</span>
            <span class="s">Location: <b>${a.room}</b> · ${a.pediatricPads ? "Adult + Pediatric Pads" : "Standard Kit"}</span>
          </span>
          <span class="tag ok">${a.status}</span>
        </div>`)}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head">
        <h2>CPR, AED &amp; Medical First-Responder Roster (${responders.length})</h2>
      </div>
      <div class="rows">
        ${responders.map((r) => html`<div class="row">
          <span class="lead-ic">${icon("heart")}</span>
          <span class="body">
            <span class="t">${r.name} <span class="tag brand">${r.cert}</span></span>
            <span class="s">${r.role || "Member"}${r.phone ? ` · ${r.phone}` : ""}</span>
          </span>
          <span class="tag ${r.onSite ? "ok" : ""}">${r.onSite ? "On Campus" : "Off-Site"}</span>
        </div>`)}
      </div>
    </section>
  `;
}

Actions["med-register-self"] = () => {
  const c = S.church(); c.medicalResponders ||= defaultMedicalResponders(c.id);
  if (!c.medicalResponders.some((r) => r.userId === S.me().id)) {
    c.medicalResponders.push({
      id: uid(),
      userId: S.me().id,
      name: S.me().name,
      cert: "CPR / AED Certified Responder",
      role: S.role()?.name || "Team Member",
      onSite: true,
      phone: S.me().phone || "",
    });
    S.save(); toast("Added you to the On-Site CPR & Medical Responder Roster!"); render();
  }
};

Actions["med-dispatch-modal"] = () => {
  const c = S.church(), aeds = c.securityAeds ||= defaultSecurityAeds(c.id), rooms = allRooms();
  openSheet("Dispatch On-Site Medical / CPR Responders", html`<form data-form="med-dispatch-send" novalidate>
    <label class="field"><span>Room or Exact Campus Location</span><input type="text" name="room" required list="med-rooms" placeholder="e.g., Main Sanctuary Row 6 / Fellowship Hall"><datalist id="med-rooms">${rooms.map((r) => html`<option value="${r}">`)}</datalist></label>
    <label class="field"><span>Nearest AED / Trauma Kit to Bring</span><select name="aedId">${aeds.map((a) => html`<option value="${a.id}">${a.name} (${a.room})</option>`)}</select></label>
    <label class="field"><span>Patient / Symptoms Note</span><input type="text" name="details" required placeholder="e.g., Adult fainted / unresponsive — AED and CPR responder needed immediately"></label>
    <label class="check"><input type="checkbox" name="called911" checked><span>911 EMS has been called (or Security Gate Rover is staging for EMS at main entrance)</span></label>
    <button class="btn danger block">Page All CPR / Medical Responders &amp; Security</button>
  </form>`);
};

Forms["med-dispatch-send"] = async (d) => {
  const c = S.church(), aed = (c.securityAeds || []).find((a) => a.id === d.aedId) || (c.securityAeds || [])[0];
  const gps = await getQuickGpsFix();
  const mapUrl = gps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : "";
  const now = new Date().toISOString();
  const text = `❤️‍🩹 MEDICAL / CPR DISPATCH at ${d.room}: ${d.details}. Bring ${aed ? `${aed.name} (${aed.room})` : "AED"}! ${d.called911 ? "(911 EMS notified)" : ""}`;

  const inc = S.add("securityIncidents", {
    kind: "MEDICAL_ALERT",
    category: "Medical / CPR & AED Dispatch",
    rawCategory: "medical",
    suggestedLevel: 2,
    severity: "critical",
    by: S.me().id,
    reporterName: S.me().name,
    room: d.room,
    details: text,
    gps,
    mapUrl,
    status: "open",
    at: now,
  });

  const msg = S.add("securityMessages", {
    by: S.me().id,
    senderName: S.me().name,
    priority: "urgent",
    text,
    gps,
    mapUrl,
    incidentId: inc.id,
    at: now,
  });

  const medIds = (c.medicalResponders || []).map((r) => r.userId).filter((u) => S.user(u));
  const targets = [...new Set([...securityTeamUserIds(), ...medIds])];
  targets.forEach((u) => notify(u, {
    kind: "security",
    title: `❤️‍🩹 MEDICAL / AED DISPATCH: ${d.room}`,
    body: `${d.details} — Retrieve ${aed?.name || "AED"}`,
    link: "#security-medical",
  }));

  S.save(); closeSheet(true); broadcastSafetyUpdate({ msgId: msg.id, spokenText: text });
  toast("Medical & CPR Responders paged with AED location!"); render();
};

// ============================================================================
// INTERACTIVE CAMPUS MAP SAFETY OVERLAY (Hooks into 82-map.js mapSvg)
// ============================================================================

function renderMapSafetyPinsSvg(m, floor, items) {
  const c = S.church(); if (!c || floor !== 0) return "";
  const doors = c.securityDoors || [];
  const aeds = c.securityAeds || [];
  return html`<g class="map-safety-layer">
    ${doors.map((d, idx) => {
      const x = (d.mapX ?? (4 + (idx * 4) % 18)) * 20;
      const y = (d.mapY ?? (3 + (idx * 5) % 24)) * 20;
      const col = d.status === "locked" ? "#16a34a" : d.status === "issue" ? "#dc2626" : "#d97706";
      const sym = d.status === "locked" ? "✓" : d.status === "issue" ? "!" : "⏳";
      return html`<g class="map-door-pin" transform="translate(${x}, ${y})">
        <title>${d.name}: ${d.status.toUpperCase()} (Safe Zone: ${d.safeZone})</title>
        <circle r="11" fill="${col}" stroke="#fff" stroke-width="2.5"></circle>
        <text y="3.5" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${sym}</text>
      </g>`;
    })}
    ${aeds.map((a, idx) => {
      const x = (a.mapX ?? (10 + idx * 4)) * 20;
      const y = (a.mapY ?? (8 + idx * 6)) * 20;
      return html`<g class="map-aed-pin" transform="translate(${x}, ${y})">
        <title>${a.name} (${a.room})</title>
        <rect x="-14" y="-10" width="28" height="20" rx="6" fill="#be123c" stroke="#fff" stroke-width="2"></rect>
        <text y="3.5" text-anchor="middle" font-size="8.5" font-weight="700" fill="#fff">AED</text>
      </g>`;
    })}
  </g>`;
}

// ----- 4. Full-Screen Emergency Display Override & Global Banner Injection -----
function renderEmergencyDisplayOverride(alert) {
  const c = S.church();
  const proto = (c?.securityProtocols || defaultSecurityProtocols()).find((p) => +p.level === +alert.level);
  const memberSteps = proto?.stepsByRole?.members || [
    "Move immediately to the nearest Designated Safe Zone.",
    "Lock and barricade doors, turn off lights, and silence mobile phones.",
    "Open the church app to mark yourself SAFE and accounted for.",
  ];
  return html`<div class="emergency-display-screen" role="alert" aria-live="assertive">
    <div class="emerg-disp-inner">
      <div class="emerg-disp-badge">🚨 EMERGENCY BROADCAST · ${alert.code}</div>
      <h1>${alert.name.toUpperCase()}</h1>
      <p class="emerg-disp-lead">${alert.broadcastText || alert.summary}</p>
      <div class="emerg-disp-steps">
        <h2>INSTRUCTIONS TO FOLLOW IMMEDIATELY:</h2>
        <ol>${memberSteps.map((st) => html`<li>${st}</li>`)}</ol>
      </div>
      <div class="emerg-disp-foot">${c?.name || ""} · Initiated ${fmtTime(alert.startedAt)} · Do not open doors until official All Clear</div>
    </div>
  </div>`;
}

// Hook into headerIcons (SOS button), Home screen (active alert banner), and all Display/Signage/Stage screens (Emergency Override)!
{
  // 1. Add red SOS Emergency button to headerIcons()
  const prevHeaderIcons = headerIcons;
  headerIcons = function () {
    const base = prevHeaderIcons();
    const c = S.church();
    if (!c || c.modules?.safety === false) return base;
    const alertOn = !!c.activeAlert?.active;
    return html`<button type="button" class="icon-btn sos-hdr-btn ${alertOn ? "alert-pulse" : ""}" data-act="sos-open" title="Emergency SOS / Security Assistance" aria-label="Emergency SOS and Security">${icon("shield")}</button>
${base}`;
  };

  // 2. Show Active Protocol Banner at the top of Home if an alert is active (and Home Banner is not excluded by a staff-only drill)
  const prevHome = Screens.home;
  Screens.home = (t) => {
    const v = prevHome(t);
    const c = S.church(), alert = c?.activeAlert;
    if (v?.body && alert?.active) {
      const canSeeDrillBanner = !alert.isDrill || alert.showHomeBanner !== false || (c.activeDrill?.includedRealStaffIds || []).includes(S.me().id) || isSecurityMember();
      if (canSeeDrillBanner) {
        return { ...v, body: html`${renderActiveProtocolBanner(alert)}${v.body}` };
      }
    }
    return v;
  };

  // 3. Override Digital Signage, Main Presentation Displays, Stage Monitors, and Room Displays during Level 5 (`overrideDisplays: true`)
  const prevSignFrame = typeof signFrame === "function" ? signFrame : null;
  if (prevSignFrame) {
    signFrame = function (pl, slide, opts) {
      const alert = S.church()?.activeAlert;
      if (alert?.active && alert.overrideDisplays) return renderEmergencyDisplayOverride(alert);
      return prevSignFrame(pl, slide, opts);
    };
  }
  const prevSlideHtml = typeof slideHtml === "function" ? slideHtml : null;
  if (prevSlideHtml) {
    slideHtml = function (s, c = S.church()) {
      const alert = c?.activeAlert;
      if (alert?.active && alert.overrideDisplays) return renderEmergencyDisplayOverride(alert);
      return prevSlideHtml(s, c);
    };
  }
  const prevStageMonitor = typeof stageMonitor === "function" ? stageMonitor : null;
  if (prevStageMonitor) {
    stageMonitor = function (data, st, full, tail) {
      const alert = S.church()?.activeAlert;
      if (alert?.active && alert.overrideDisplays) return renderEmergencyDisplayOverride(alert);
      return prevStageMonitor(data, st, full, tail);
    };
  }
  if (typeof DASH !== "undefined") {
    DASH.security = ["Campus safety & security", () => isSecurityMember() || S.can("view.reports"), () => {
      const c = S.church(), alert = c?.activeAlert;
      const openInc = securityIncidentRows().filter(({ cleared }) => !cleared).length;
      const doors = c?.securityDoors || [];
      const locked = doors.filter((d) => d.status === "locked").length;
      return html`
        <div class="stat-tiles" style="margin-bottom:10px">
          ${statTile("Protocol Status", alert?.active ? alert.code : "Normal", alert?.active ? alert.name : "All Clear")}
          ${statTile("Open Incidents", openInc.toLocaleString(), "Reported via SOS / 911")}
          ${statTile("Doors Verified", `${locked}/${doors.length}`, "Exterior entryways")}
        </div>
        <div class="btns" style="margin-top:8px">
          <a class="btn sm" href="#security">${icon("shield")}Security Command</a>
          <a class="btn ghost sm" href="#security-protocols">5-Level Protocol Chart</a>
          <a class="btn ghost sm" href="#security-rollcall">Roll Call &amp; Unaccounted</a>
        </div>`;
    }];
  }
}
