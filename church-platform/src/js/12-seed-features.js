// ---------- Sample data for the version 15 features, in Riverside Community Church ----------
// Added to buildSeed, so the demo, the training sandbox and a shared training church made from the sample church all
// start with the same full picture: artwork on sermons and events, chords on the hymns, community boards, push
// notifications already sent, the treasurer's ledger, a volunteer sub request, arrivals on campus, and a safety team
// with its doors, AEDs, responders and a drill and incident already on record. Everything uses Riverside's own people.
// Nothing here is a default for a real church: those start empty and are filled in by the church.

/** A simple picture made in code, for sample sermon series and events: a color wash, soft shapes and a title. */
function sampleArt(title, sub, hue, { w = 1600, h = 900, shape = "waves" } = {}) {
  const esc2 = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const a = `hsl(${hue} 62% 38%)`, b = `hsl(${(hue + 40) % 360} 70% 56%)`, soft = `hsl(${(hue + 20) % 360} 80% 92% / .18)`;
  const square = w === h, size = square ? 110 : 96;
  const shapes = shape === "rings"
    ? `<circle cx="${w * 0.78}" cy="${h * 0.3}" r="${h * 0.42}" fill="none" stroke="${soft}" stroke-width="${h * 0.06}"/><circle cx="${w * 0.78}" cy="${h * 0.3}" r="${h * 0.24}" fill="${soft}"/>`
    : shape === "sun"
    ? `<circle cx="${w * 0.8}" cy="${h * 0.28}" r="${h * 0.2}" fill="${soft}"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${w * 0.8 - 6}" y="${h * 0.02}" width="12" height="${h * 0.12}" rx="6" fill="${soft}" transform="rotate(${i * 36} ${w * 0.8} ${h * 0.28})"/>`).join("")}`
    : `<path d="M0 ${h * 0.72} C ${w * 0.25} ${h * 0.6}, ${w * 0.5} ${h * 0.86}, ${w} ${h * 0.66} L ${w} ${h} L 0 ${h} Z" fill="${soft}"/><path d="M0 ${h * 0.84} C ${w * 0.3} ${h * 0.74}, ${w * 0.6} ${h * 0.96}, ${w} ${h * 0.8} L ${w} ${h} L 0 ${h} Z" fill="${soft}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Rubik, Helvetica, Arial, sans-serif">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${shapes}
    <text x="${w * 0.07}" y="${square ? h * 0.62 : h * 0.5}" font-size="${size}" font-weight="800" fill="#fff">${esc2(title)}</text>
    ${sub ? `<text x="${w * 0.07}" y="${(square ? h * 0.62 : h * 0.5) + size * 0.85}" font-size="${size * 0.42}" font-weight="600" fill="#fff" fill-opacity=".85">${esc2(sub)}</text>` : ""}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
// Real photos for Riverside, the church the demo and training open on. They live in public/demo next to the app.
const DEMO = (n) => `demo/${n}.jpg`;
const DEMO_PHOTOS = {
  series: { "Abide": "open-hands-sq", "Psalms for the weary": "bible-autumn-sq" },
  events: { e1: "potluck", e2: "bible-notes", e3: "hands-together", e4: "kids-class", e5: "friends-laughing", e6: "pulpit-bible", e7: "friends", e8: "worship-stage" },
  groups: { adult: "hands-on-bible", pre9: "kids-praying", pre11: "kids-class", elem9: "kids-bibles", youth: "raised-hand", membership: "chapel", fpu: "offering",
    eastside: "friends-laughing", women: "shoulder-prayer", couples: "holding-hands", men: "bible-autumn", staffprayer: "prayer-circle" },
};
/** Puts the demo photos on the sample church. Only fills in what's empty or still a generated sample picture,
 *  so anything someone changed while trying the demo stays. Also run on saved demo data from before the photos. */
function applyDemoPhotos(st) {
  const R = "riverside", c = st.churches?.[R];
  if (!c?.sample) return;
  const generated = (v) => !v || String(v).startsWith("data:image/svg+xml");
  if (!c.banner || (c.banner.bg?.type !== "image" && !c.demoPhotos)) {
    c.banner = { ...bannerOf(c), bg: { type: "image", preset: "aurora", color: c.color, image: DEMO("campus-cross"), dim: 38 } };
  }
  const blocks = c.landing?.blocks;
  if (blocks && !blocks.some((b) => b.id === "b0-hero") && !c.demoPhotos) blocks.unshift({ id: "b0-hero", type: "hero", image: DEMO("worship-crowd"), title: "You belong here", text: "A family of ordinary people following Jesus by the river." });
  (st.sermons || []).filter((s) => s.churchId === R).forEach((s) => { const p = DEMO_PHOTOS.series[s.series]; if (p && generated(s.artwork)) s.artwork = DEMO(p); });
  (st.events || []).filter((e) => e.churchId === R).forEach((e) => { const p = DEMO_PHOTOS.events[e.id.replace(`${R}-`, "")]; if (p && generated(e.image)) e.image = DEMO(p); });
  (st.gatherings || []).filter((g) => g.churchId === R).forEach((g) => { const p = DEMO_PHOTOS.groups[g.id.replace(`${R}-`, "")]; if (p && !g.photo) g.photo = DEMO(p); });
  if (!("heroPhoto" in c)) c.heroPhoto = DEMO("worship-stage");
  c.demoPhotos = true;
}
const hueOf = (s) =>[...String(s)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 360, 7);

{
  const baseSeed = buildSeed;
  buildSeed = function () {
    const st = baseSeed();
    try { addFeatureSamples(st); } catch (e) { console.error("Sample data for the new features wasn't added", e); }
    return st;
  };
}

function addFeatureSamples(st) {
  const R = "riverside", c = st.churches[R];
  if (!c) return;
  const now = Date.now(), ago = (d, h = 0) => new Date(now - d * DAY - h * 3600e3).toISOString(), dayAgo = (d) => isoDay(new Date(now - d * DAY));
  const sunday = (n) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 7) % 7) - 7 * n); return isoDay(d); };   // n Sundays back
  const name = (u) => st.users[u]?.name || "Someone";
  const here = (k) => (st[k] ||= []);

  // ----- Photos: banner, sermon series (square), events, classes and groups, for the photo cards and the mini-player -----
  applyDemoPhotos(st);
  st.sermons.filter((s) => s.churchId === R).forEach((s) => { s.artwork ||= sampleArt(s.series || s.title, "Riverside Community Church", hueOf(s.series || s.title), { w: 1000, h: 1000, shape: "rings" }); });
  st.events.filter((e) => e.churchId === R).forEach((e, i) => { e.image ||= sampleArt(e.title, e.category || "", hueOf(e.title), { shape: ["waves", "sun", "rings"][i % 3] }); });

  // ----- Songs: keys, tempo and chords (ChordPro, inline) on the public domain hymns -----
  const songs = st.songs.filter((s) => s.churchId === R), song = (k) => songs.find((s) => s.id === `riverside-song-${k}`);
  const meta = { assurance: ["D", 76, "9/8"], amazing: ["G", 72, "3/4"], holy: ["D", 84, "4/4"], doxology: ["G", 80, "4/4"] };
  for (const [k, [key, bpm, timeSig]] of Object.entries(meta)) { const s = song(k); if (s) Object.assign(s, { key, bpm, timeSig }); }
  const chord = (text, lines) => text.split("\n").map((l, i) => lines[i] || l).join("\n");
  const bless = song("assurance");
  if (bless?.parts) {
    const p = (id) => bless.parts.find((x) => x.id.endsWith(`-${id}`) || x.id === id);
    const v1 = p("v1"), ch = p("ch");
    if (v1) v1.lyrics = chord(v1.lyrics, ["[D]Blessed assurance, [G]Jesus is [D]mine!", "O what a foretaste of [E7]glory di[A]vine!", "[D]Heir of salvation, [G]purchase of [D]God,", "Born of His [A7]Spirit, washed in His [D]blood."]);
    if (ch) ch.lyrics = chord(ch.lyrics, ["[D]This is my story, this is my [A]song,", "[A7]Praising my Savior all the day [D]long;", "", "[D]This is my story, this is my [G]song,", "[D]Praising my [A7]Savior all the day [D]long."]);
    bless.lyrics = partsToLyrics(bless.parts);
  }

  // ----- Volunteer teams: a safety team, a sub request, a swap offer, dates away, and the last three Sundays -----
  c.teams = [...new Set([...(c.teams || []), "Safety & Security"])];
  c.positions = { ...(c.positions || {}), "Safety & Security": ["Team lead", "Door monitor", "Parking lot patrol", "First aid"] };
  const team = (t, u) => here("teamMembers").push({ id: uid(), churchId: R, team: t, userId: u, status: "approved" });
  team("Safety & Security", "u-marcus"); team("Safety & Security", "u-daniel"); team("Safety & Security", "u-linda");
  const plan = st.services.find((p) => p.id === "riverside-svc-1");
  if (plan) {
    plan.assignments.push({ id: uid(), team: "Worship", position: "Keys", userId: "u-jordan", status: "sub", note: "Family wedding out of state", at: ago(4), subRequestedAt: ago(1), swapOffer: null });
    plan.assignments.push({ id: uid(), team: "Safety & Security", position: "Team lead", userId: "u-marcus", status: "accepted", note: "", at: ago(5) });
    plan.assignments.push({ id: uid(), team: "Safety & Security", position: "Door monitor", userId: "u-daniel", status: "pending", note: "", at: ago(2) });
  }
  here("blockouts").push({ id: uid(), churchId: R, userId: "u-daniel", from: dayAgo(-20), to: dayAgo(-13), note: "Mission trip" },
    { id: uid(), churchId: R, userId: "u-teresa", from: dayAgo(-60), to: "", recur: "nth-1-0", note: "First Sundays with my mom" });
  // Past Sundays: who was scheduled, and when they arrived (some by arriving on campus, some checked in by hand).
  const crew = [["Worship", "Worship leader", "u-mark"], ["Worship", "Vocals", "u-teresa"], ["Worship", "Keys", "u-jordan"], ["Media", "Slides", "u-daniel"], ["Kids", "Preschool teacher", "u-linda"],
    ["Kids", "Check-in desk", "u-ana"], ["Greeters", "Front door", "u-teresa"], ["Safety & Security", "Team lead", "u-marcus"]];
  const arrive = [["early", -24, "geofence"], ["on-time", -6, "geofence"], ["early", -15, "self"], ["late", 9, "geofence"], ["on-time", -2, "geofence"], ["early", -30, "staff"], ["on-time", 0, "geofence"], ["early", -40, "geofence"]];
  [1, 2, 3].forEach((n) => {
    const date = sunday(n), key = `${date}T09:00@riverside-main`, at = (min) => new Date(`${date}T09:00:00`).getTime() + min * 60e3;
    st.services.push({ id: `riverside-svc-past-${n}`, churchId: R, title: "Sunday worship", date, time: "09:00", locationId: "riverside-main", notes: "", segments: JSON.parse(JSON.stringify(plan?.segments || [])).map((s) => ({ ...s, id: uid() })),
      assignments: crew.map(([t, pos, u]) => ({ id: uid(), team: t, position: pos, userId: u, status: "accepted", note: "", at: ago(n * 7 + 5) })) });
    crew.forEach(([t, pos, u], i) => {
      if (n === 2 && i === 2) return;   // one no-show, so the report has something to flag
      const [punctuality, min, via] = arrive[(i + n) % arrive.length], when = new Date(at(min)).toISOString();
      if (!here("presence").some((p) => p.serviceKey === key && p.userId === u)) here("presence").push({ id: uid(), churchId: R, userId: u, name: name(u), serviceKey: key, date, locationId: "riverside-main", via, by: via === "staff" ? "u-ana" : u, at: when, roleType: "volunteer", team: t, position: pos, punctuality, minutesFromStart: min });
      here("serving").push({ id: uid(), churchId: R, by: u, name: name(u), team: t, position: pos, serviceKey: key, serviceName: "Sunday worship (9:00)", locationId: "riverside-main", via, at: when });
    });
    ["u-dana", "u-marcus"].forEach((u, i) => { if (!here("presence").some((p) => p.serviceKey === key && p.userId === u)) here("presence").push({ id: uid(), churchId: R, userId: u, name: name(u), serviceKey: key, date, locationId: "riverside-main", via: "geofence", by: u, at: new Date(at(-55 + i * 10)).toISOString(), roleType: "staff", team: "", position: i ? "Associate pastor" : "Lead pastor", punctuality: "early", minutesFromStart: -55 + i * 10 }); });
  });

  // ----- Arrival check-in: where each campus is (members still turn it on for themselves in Settings) -----
  const geo = { "riverside-main": [33.9526, -84.5499], "riverside-east": [34.0087, -84.5126] };
  c.locations.forEach((l) => { if (geo[l.id]) l.geofence = { enabled: true, lat: geo[l.id][0], lng: geo[l.id][1], radiusMeters: 220, autoAttendance: true, staffReport: true, popupMenu: true, checkinPrompt: true, ticketPopup: true, sanctuaryPrompt: true,
    welcomeTitle: `Welcome to ${l.name}!`, welcomeMessage: "Check in the kids, find your seat, and open today's sermon notes.", customActionLabel: "Today's sermon notes", customActionHash: "word" }; });

  // ----- Community boards -----
  if (!here("boards").some((b) => b.churchId === R)) st.boards.push(...defaultBoardsFor(R));
  const post = (id, board, by, title, body, o = {}) => ({ id: `${R}-post-${id}`, churchId: R, boardId: `${R}-brd-${board}`, locationId: null, by, authorName: name(by), title, body, postType: "discussion",
    status: "approved", pinned: false, locked: false, slots: [], pollOptions: [], reactions: {}, replies: [], at: ago(0, 6), ...o });
  const slot = (label, u) => ({ id: uid(), label, claimedBy: u || "", claimedName: u ? name(u) : "" });
  const reply = (by, text, h) => ({ id: uid(), by, name: name(by), text, at: ago(0, h) });
  st.boardPosts = (st.boardPosts || []).filter((p) => p.churchId !== R);
  st.boardPosts.push(
    post("meals", "care", "u-linda", "Meal train for the Okafor family", "Baby Grace arrived Tuesday! Let's cover dinners for the first two weeks. No nuts in the house, please.",
      { postType: "need", pinned: true, slots: [slot("Monday dinner", "u-teresa"), slot("Wednesday dinner", "u-marcus"), slot("Friday dinner"), slot("Sunday lunch"), slot("Grocery run")], reactions: { praying: ["u-dana", "u-ana"], help: ["u-teresa"] }, replies: [reply("u-dana", "So happy for them. I'll take the grocery run next week.", 3)], at: ago(1) }),
    post("rides", "parents", "u-daniel", "Carpool to youth night Friday", "Leaving from the East campus at 6:15. Three seats open for middle schoolers.",
      { postType: "ride", slots: [slot("Seat 1", "u-ana"), slot("Seat 2"), slot("Seat 3")], reactions: { amen: ["u-ana"] }, at: ago(0, 20) }),
    post("picnic", "community", "u-dana", "What should we grill at the fall picnic?", "Help the planning team decide. Voting closes Wednesday.",
      { postType: "poll", pollOptions: [{ id: uid(), label: "Burgers and hot dogs", voters: ["u-mark", "u-jordan", "u-ana"] }, { id: uid(), label: "Barbecue chicken", voters: ["u-teresa", "u-linda"] }, { id: uid(), label: "Tacos", voters: ["u-daniel"] }], at: ago(2) }),
    post("praise", "community", "u-teresa", "Praise report: Mom's surgery went well", "Thank you for every prayer. She's home and walking already.",
      { reactions: { amen: ["u-dana", "u-linda", "u-marcus"], praying: ["u-ana", "u-mark"] }, replies: [reply("u-marcus", "Praise God! We'll keep praying for her recovery.", 10)], at: ago(0, 30) }),
    post("crib", "blessing", "u-mark", "Free: crib and changing table", "Gently used, from a smoke-free home. Pick up in Marietta this week.", { postType: "exchange", at: ago(3) }),
    post("pending", "community", "u-jordan", "Selling my old guitar amp", "Fender, works great, $80. Message me if you're interested.", { status: "pending", at: ago(0, 2) }),
  );

  // ----- Targeted push notifications already sent -----
  st.pushCampaigns = (st.pushCampaigns || []).filter((p) => p.churchId !== R);
  st.pushCampaigns.push(
    { id: uid(), churchId: R, title: "Kids camp forms are due Friday", body: "Turn in the medical form and payment at the check-in desk or online.", link: "#events", segments: ["grade:1", "grade:2", "grade:3"], combineMode: "any", audienceLabel: "Parents: 1st to 3rd grade", count: 4, channels: ["push", "email"], by: "u-linda", senderName: name("u-linda"), at: ago(2) },
    { id: uid(), churchId: R, title: "Worship team: rehearsal moved to 7 PM", body: "Thursday rehearsal starts an hour later this week. Same room.", link: "#serving", segments: ["team:Worship"], combineMode: "any", audienceLabel: "Team: Worship", count: 3, channels: ["push"], by: "u-mark", senderName: name("u-mark"), at: ago(4) },
    { id: uid(), churchId: R, title: "East campus parking lot closed Sunday", body: "Please park at the school next door. Shuttles run from 8:30.", link: "#visit", segments: ["loc:riverside-east"], combineMode: "any", audienceLabel: "Campus: East campus", count: 6, channels: ["push", "text"], by: "u-dana", senderName: name("u-dana"), at: ago(6) },
  );

  // ----- The treasurer's ledger -----
  c.giftCategories ||= DEFAULT_GIFT_CATEGORIES.map((x) => [...x]);
  (c.funds || []).forEach((f, i) => Object.assign(f, { code: f.code || `${(i + 1) * 100}-${f.id.slice(0, 3).toUpperCase()}`, restricted: f.restricted ?? f.id !== "general",
    openingBalance: f.openingBalance ?? [24800, 9150, 41200][i % 3], goalAmount: f.goalAmount ?? [240000, 36000, 150000][i % 3] }));
  const cats = ["tithe", "offering", "tithe", "missions", "building"];
  st.gifts.filter((g) => g.churchId === R).forEach((g, i) => { g.category ||= g.fundId === "missions" ? "missions" : g.fundId === "building" ? "building" : cats[i % cats.length]; });
  st.batches = (st.batches || []).filter((b) => b.churchId !== R);
  st.expenses = (st.expenses || []).filter((e) => e.churchId !== R);
  st.budgets = (st.budgets || []).filter((b) => b.churchId !== R);
  const cashGifts = [["Ruth Hollis", "cash", 60, "tithe"], ["Sam and Ivy Reed", "check", 250, "tithe"], ["Loose offering", "cash", 186, "offering"], ["Priya Shah", "check", 100, "missions"], ["The Kims", "check", 300, "building"]];
  [1, 2, 3, 4].forEach((n) => {
    const date = sunday(n), id = `${R}-batch-${n}`;
    st.batches.push({ id, churchId: R, locationId: "riverside-main", date, title: "Sunday offering count", counter1: name("u-dana"), counter2: name("u-teresa"), depositRef: `DEP-${2200 + n}`, status: n === 1 ? "open" : "closed",
      notes: n === 1 ? "Counted after the 11:00. Deposit Monday." : "Verified and deposited.", at: new Date(`${date}T13:00:00`).toISOString() });
    cashGifts.forEach(([who, method, amount, category], i) => st.gifts.push({ id: `${R}-hand-${n}-${i}`, churchId: R, by: null, name: who, fundId: category === "missions" ? "missions" : category === "building" && c.funds.some((f) => f.id === "building") ? "building" : "general",
      category, amount: amount + n * 5 * (i % 2), frequency: "once", method, checkNo: method === "check" ? String(3100 + n * 10 + i) : "", envelopeNo: method === "cash" && who !== "Loose offering" ? String(140 + i) : "",
      batchId: id, memo: "", taxDeductible: true, at: new Date(`${date}T12:00:00`).toISOString(), status: "paid", recordedBy: "u-dana", sample: true }));
  });
  const exp = (id, d, payee, description, department, amount, method, by, status, o = {}) => ({ id: `${R}-exp-${id}`, churchId: R, locationId: null, date: dayAgo(d), payee, description, fundId: department === "missions" ? "missions" : "general",
    department, amount, method, refNo: method === "check" ? `CHK-${1180 + d}` : method === "ach" ? `ACH-${7700 + d}` : "", status, by, approvedBy: status === "pending-approval" ? "" : name("u-dana"), receiptImg: "", at: ago(d), ...o });
  st.expenses.push(
    exp("power", 12, "Georgia Power", "Electricity for the main campus", "facilities", 1286.4, "ach", "u-dana", "paid"),
    exp("sound", 8, "Sweetwater", "Two wireless microphones and cables", "worship", 412.0, "card", "u-mark", "paid"),
    exp("pantry", 5, "MUST Ministries", "Monthly gift to the food pantry", "missions", 500.0, "check", "u-dana", "paid"),
    exp("snacks", 3, "Kroger", "Snacks and supplies for the nursery", "kids_youth", 64.27, "card", "u-linda", "paid"),
    exp("vbs", 1, "Oriental Trading", "Craft supplies for fall festival (reimbursement)", "kids_youth", 138.5, "check", "u-linda", "pending-approval"),
  );
  const yr = new Date().getFullYear();
  st.budgets.push(...BUDGET_DEPARTMENTS.map(([dept, label, annual]) => ({ id: `${R}-bgt-${dept}-${yr}`, churchId: R, year: yr, department: dept, label, fundId: dept === "missions" ? "missions" : "general", annualAmount: annual })));

  // ----- Safety: the team's setup, a past drill and incidents already handled -----
  c.securityDoors = [
    { id: `${R}-door-lobby`, name: "Main lobby front doors", zone: "Main building", safeZone: "Choir room", assignedTo: "u-teresa", status: "unlocked", verifiedBy: "", verifiedAt: "", issueNote: "", mapX: 14, mapY: 3 },
    { id: `${R}-door-kids`, name: "Kids wing check-in entrance", zone: "Kids wing", safeZone: "Rooms 102 to 106", assignedTo: "u-linda", status: "locked", verifiedBy: name("u-linda"), verifiedAt: ago(0, 30), issueNote: "", mapX: 20, mapY: 12 },
    { id: `${R}-door-hall`, name: "Fellowship hall kitchen door", zone: "Fellowship hall", safeZone: "Pantry hallway", assignedTo: "u-marcus", status: "unlocked", verifiedBy: "", verifiedAt: "", issueNote: "", mapX: 18, mapY: 21 },
    { id: `${R}-door-office`, name: "Church office south door", zone: "Offices", safeZone: "Conference room", assignedTo: "u-dana", status: "locked", verifiedBy: name("u-dana"), verifiedAt: ago(1), issueNote: "", mapX: 6, mapY: 18 },
  ];
  c.securityAeds = [
    { id: `${R}-aed-lobby`, name: "Lobby AED and trauma kit", room: "Welcome desk", floor: 0, mapX: 14, mapY: 5, status: "Ready (pads checked last month)", pediatricPads: true },
    { id: `${R}-aed-kids`, name: "Kids wing AED", room: "Kids check-in desk", floor: 0, mapX: 19, mapY: 12, status: "Ready (pads checked last month)", pediatricPads: true },
  ];
  c.medicalResponders = [
    { id: `${R}-med-linda`, userId: "u-linda", name: name("u-linda"), cert: "CPR, AED and first aid", role: "Kids ministry", onSite: true, phone: st.users["u-linda"]?.phone || "" },
    { id: `${R}-med-marcus`, userId: "u-marcus", name: name("u-marcus"), cert: "EMT", role: "Safety & Security team lead", onSite: true, phone: st.users["u-marcus"]?.phone || "" },
  ];
  st.securityDrills = (st.securityDrills || []).filter((d) => d.churchId !== R);
  st.securityDrills.push({ id: uid(), churchId: R, scenarioId: "lockdown", scenarioTitle: "Lockdown during the 11:00 service", level: 3, participationMode: "staff", doorsVerified: 4, doorsTotal: 4, rollCallSafe: 46, rollCallTotal: 48,
    durationSec: 412, score: 88, ledBy: name("u-marcus"), startedAt: ago(30), endedAt: new Date(now - 30 * DAY + 412e3).toISOString(), eventsCount: 9 });
  st.securityIncidents = (st.securityIncidents || []).filter((x) => x.churchId !== R);
  st.securityIncidents.push(
    { id: `${R}-inc-faint`, churchId: R, kind: "MEMBER_ALERT", category: "Medical emergency", rawCategory: "medical", suggestedLevel: 1, severity: "high", by: "u-teresa", reporterName: name("u-teresa"), reporterPhone: "", room: "Sanctuary, back left",
      details: "Older gentleman felt faint during the last song. Responders brought water and checked his blood pressure; his daughter drove him home.", gps: null, mapUrl: "", status: "resolved", resolvedBy: name("u-marcus"), resolvedAt: ago(9, -1), at: ago(9) },
    { id: `${R}-inc-child`, churchId: R, kind: "MEMBER_ALERT", category: "Missing child", rawCategory: "missing_child", suggestedLevel: 2, severity: "high", by: "u-ana", reporterName: name("u-ana"), reporterPhone: "", room: "Kids wing",
      details: "Four-year-old wandered out of Room 104 during pickup. Found in the fellowship hall within three minutes and reunited with his dad.", gps: null, mapUrl: "", status: "resolved", resolvedBy: name("u-linda"), resolvedAt: ago(23, -0.1), at: ago(23) },
  );
  st.securityMessages = (st.securityMessages || []).filter((x) => x.churchId !== R);
  st.securityMessages.push(
    { id: uid(), churchId: R, by: "u-marcus", senderName: name("u-marcus"), priority: "normal", text: "Team: radios are charged in the office. Daniel has the parking lot this Sunday.", at: ago(2) },
    { id: uid(), churchId: R, by: "u-daniel", senderName: name("u-daniel"), priority: "normal", text: "Copy. I'll walk the east lot at 8:45 and 10:45.", at: ago(2, -1) },
    { id: uid(), churchId: R, by: "u-linda", senderName: name("u-linda"), priority: "normal", text: "Kids wing doors are on the new keypad code. Ask me before Sunday if you need it.", at: ago(1) },
  );
}
