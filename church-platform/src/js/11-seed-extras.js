// ---------- More sample data for the demo, training and the preview ----------
// buildSeed (10-seed.js) makes the sample churches. This adds what the newer features need to have something to show
// in a fresh demo or training session: who came each Sunday, a pledge campaign, birthdays and anniversaries, the
// activity log, recurring gifts, last Sunday's kids check-in and volunteers, church screens and kiosks placed on the
// campus map, a hallway signage playlist, webhooks with a delivery log, an East campus map, and custom reports (which
// run by themselves the first time someone opens Reports). A training church filled with sample content gets the same.
// Everything is Riverside Community Church, the church the demo and training open on.
function seedExtras(st, { now, daysAgo }) {
  const R = "riverside", MAIN = "riverside-main", EAST = "riverside-east", c = st.churches[R];
  if (!c) return st;
  const rnd = (n) => { const x = Math.sin(n * 9301 + 49297) * 233280; return x - Math.floor(x); };
  // w = 0 is the most recent Sunday before today, matching the weekly attendance history in buildSeed.
  const sunday = (w) => { const t = isoDay(now); return fromIsoDay(isoAdd(t, -(isoDow(t) || 7) - 7 * w)); };
  const at = (w, hours) => new Date(sunday(w).getTime() + hours * 3600e3).toISOString();
  const key = (w, time = "09:00", loc = MAIN) => `${isoDay(sunday(w))}T${time}@${loc}`;
  const svcName = (w, label = "Early service", time = "9:00 AM") => `${label}, ${fmt(sunday(w), { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
  const members = st.memberships.filter((m) => m.churchId === R && st.users[m.userId]).map((m) => m.userId);
  const nm = (u) => st.users[u]?.name || "";
  const day = (d) => isoDay(new Date(now.getTime() + d * DAY));

  // ----- Who came each Sunday (attendance by person, "not seen lately", people reports) -----
  members.forEach((u, i) => {
    for (let w = 0; w < 10; w++) {
      const away = (u === "u-teresa" || u === "u-jordan") && w < 5;   // two people not seen in a while, for follow-up
      if (away || rnd(i * 31 + w * 7) > 0.8) continue;
      const east = u === "u-daniel", time = east ? "10:00" : i % 2 ? "11:00" : "09:00";
      st.presence.push({ id: `pr-${u}-${w}`, churchId: R, userId: u, name: nm(u), serviceKey: key(w, time, east ? EAST : MAIN), date: isoDay(sunday(w)),
        locationId: east ? EAST : MAIN, via: w % 3 ? "staff" : "self", by: w % 3 ? "u-ana" : u, at: at(w, east ? 10.5 : 9.5) });
    }
  });

  // ----- A pledge campaign (and one that's finished) -----
  st.campaigns.push(
    { id: "camp-mission", churchId: R, name: "Summer mission trip", fundId: "missions", goal: 12000, start: day(-70), end: day(75), note: "Sending 14 students and leaders to serve in Guatemala", active: true, at: daysAgo(70) },
    { id: "camp-christmas", churchId: R, name: "Christmas offering", fundId: "benevolence", goal: 5000, start: day(-330), end: day(-300), note: "For families in our neighborhood who need help this winter", active: true, at: daysAgo(330) });
  [["u-dana", 1200], ["u-marcus", 1000], ["u-linda", 500], ["u-mark", 750], ["u-ana", 250], ["u-daniel", 400]].forEach(([u, amount], i) =>
    st.pledges.push({ id: `pl-${u}`, churchId: R, campaignId: "camp-mission", userId: u, name: nm(u), amount, at: daysAgo(60 - i * 6) }));

  // ----- Birthdays, anniversaries and baptisms (some this week, for the Home reminders and Care) -----
  const md = (d) => day(d).slice(5);
  [["u-linda", "birthday", `1984-${md(2)}`, ""], ["u-mark", "birthday", `1979-${md(5)}`, ""], ["u-dana", "anniversary", `2004-${md(9)}`, "Dana and Lee"],
    ["u-marcus", "birthday", `1981-${md(23)}`, ""], ["u-teresa", "baptism", `2019-${md(-40)}`, "Baptized at the river"], ["u-ana", "membership", `2021-${md(14)}`, ""]]
    .forEach(([u, kind, date, label]) => st.milestones.push({ id: `ms-${u}-${kind}`, churchId: R, userId: u, name: nm(u), kind, date, label, at: daysAgo(100) }));

  // ----- The activity log -----
  [["u-dana", "Changed the Home banner", "settings", 0.2], ["u-marcus", "Posted the announcement Baptism Sunday", "news", 1], ["u-dana", "Emailed 42 people (Everyone): Picnic this Sunday", "email", 2],
    ["u-ana", "Recorded attendance for the Early service", "attendance", 7], ["u-mark", "Updated the Main lobby playlist", "signage", 3], ["u-dana", "Started the campaign Summer mission trip", "giving", 70],
    ["u-marcus", "Assigned Priya Shah's follow-up to himself", "followup", 4], ["u-dana", "Added the device Find your way kiosk", "devices", 12], ["u-linda", "Took attendance for Room 104", "attendance", 7],
    ["u-dana", "Saved the custom report Monthly board report", "reports", 40]]
    .forEach(([u, what, area, d], i) => st.activity.push({ id: `act-${i}`, churchId: R, by: u, name: nm(u), what, area, at: daysAgo(d) }));

  // ----- Recurring gifts -----
  [["u-linda", "general", 50, "weekly", "card", 140], ["u-mark", "general", 200, "monthly", "bank", 300], ["u-dana", "missions", 75, "monthly", "bank", 90], ["u-ana", "benevolence", 25, "monthly", "card", 45]]
    .forEach(([u, fundId, amount, frequency, method, d]) => st.recurring.push({ id: `rec-${u}`, churchId: R, by: u, fundId, amount, frequency, method, at: daysAgo(d), lastAt: daysAgo(frequency === "weekly" ? 6 : 12), active: true, test: false }));

  // ----- Last Sunday: kids checked in (and picked up) and volunteers who served -----
  const kidsRoom = (birth) => { const age = (now - new Date(birth)) / (365.25 * DAY); return age < 4 ? "Room 104" : age < 8 ? "Room 106" : "Kids wing"; };
  ["u-marcus", "u-mark", "u-ana"].forEach((u, fi) => (st.users[u]?.family || []).filter((k) => k.kind === "child").forEach((k, ki) => {
    st.checkins.push({ id: `ci-${k.id}`, churchId: R, by: u, parentName: nm(u), childId: k.id, childName: k.name, birth: k.birth, allergies: k.allergies || "", notes: k.notes || "", room: kidsRoom(k.birth),
      code: ["K4P", "M7R", "T2W"][fi] + (ki + 1), serviceKey: key(0), serviceName: svcName(0), locationId: MAIN, via: fi === 1 ? "phone" : "kiosk", at: at(0, 8.8), out: at(0, 10.3), outBy: "parent" });
  }));
  [["u-jordan", "Greeters"], ["u-mark", "Media"], ["u-linda", "Kids"], ["u-teresa", "Coffee"], ["u-dana", "Worship"]].forEach(([u, team]) =>
    st.serving.push({ id: `sv-${u}`, churchId: R, by: u, name: nm(u), team, serviceKey: key(0), serviceName: svcName(0), at: at(0, 8.3) }));

  // ----- Church screens and kiosks, each placed on the campus map -----
  const dev = (id, name, type, settings, seen, locationId = MAIN) => ({ id, churchId: R, name, type, locationId, settings: { exitPin: "", ...settings }, status: "paired", code: "", codeExpires: null,
    deviceUser: `sample-${id}`, lastSeen: seen, at: daysAgo(40) });
  st.devices.push(
    dev("dev-lobby", "Lobby screen", "signage", { playlistId: "sign-lobby", mapSpot: `${MAIN}~mp-info` }, daysAgo(0, 0.02)),
    dev("dev-hall", "Upstairs hallway screen", "signage", { playlistId: "sign-hall", mapSpot: `${MAIN}~mp-uph` }, daysAgo(0, 0.05)),
    dev("dev-kiosk", "Kids check-in kiosk", "kiosk", { labelSize: "4x2", kioskMode: "both", mapSpot: `${MAIN}~mp-104` }, daysAgo(0, 2)),
    dev("dev-find", "Find your way kiosk", "kiosk", { labelSize: "4x2", kioskMode: "wayfind", mapSpot: `${MAIN}~mp-door` }, daysAgo(0, 0.03)),
    dev("dev-201", "Room 201 screen", "room", { room: "Room 201", idle: "signage", playlistId: "sign-lobby", hint: true, mapSpot: `${MAIN}~mp-201` }, daysAgo(3)),
    dev("dev-booth", "Booth computer", "booth", {}, daysAgo(6)),
    // A payment kiosk in the lobby (staff code 1234) and a phone at the gym door for event check-in.
    dev("dev-pay", "Lobby payment kiosk", "kiosk", { labelSize: "4x2", kioskMode: "pay", eventCheckin: true, mapSpot: `${MAIN}~mp-info`,
      pay: { ways: { reader: true, screen: true, phone: true, cash: true }, readerId: "rdr-lobby", give: true, partial: true, events: "all", cashPinHash: "0ab2f1a2749e93439f2a0d721e109bfa190663fd9e0740ce2af4980d04f0c3fc" } }, daysAgo(0, 0.01)),
    dev("dev-gate", "Gym door check-in", "gate", { allowOut: true }, daysAgo(1)));
  c.cardReaders = [{ id: "rdr-lobby", provider: "stripe", label: "Lobby reader", status: "ready", test: true }];
  // The lobby playlist shows the map too, and a portrait hallway playlist leads with it. Each slide marks a spot for
  // previews; a paired screen marks its own.
  const lobby = st.signage.find((p) => p.id === "sign-lobby");
  if (lobby) lobby.slides.splice(5, 0, signSlide("map", { qr: "on", spot: `${MAIN}~mp-info` }));
  st.signage.push({ id: "sign-hall", churchId: R, name: "Upstairs hallway", locationId: MAIN, orientation: "portrait", seconds: 12, theme: "light", clock: true,
    slides: [signSlide("map", { qr: "on", spot: `${MAIN}~mp-uph` }), signSlide("classes"), signSlide("events", { count: 3, style: "list" })] });

  // ----- An East campus map, so the location switcher has two -----
  const east = c.locations.find((l) => l.id === EAST);
  if (east && !east.map) east.map = { floors: ["Main floor"], items: [
    { id: "me-park", type: "parking", name: "Parking", note: "", floor: 0, x: 1, y: 24, w: 22, h: 5 },
    { id: "me-door", type: "entrance", name: "Front doors", note: "", floor: 0, x: 9, y: 21, w: 6, h: 2 },
    { id: "me-lobby", type: "hallway", name: "Lobby", note: "", floor: 0, x: 3, y: 16, w: 18, h: 5 },
    { id: "me-info", type: "info", name: "Welcome table", note: "First time? Say hi here.", floor: 0, x: 9, y: 17, w: 6, h: 2 },
    { id: "me-aud", type: "worship", name: "Auditorium", note: "", keywords: "worship, service", floor: 0, x: 3, y: 3, w: 18, h: 12 },
    { id: "me-r2", type: "kids", name: "Room 2", note: "Kids, ages 3 to 10", floor: 0, x: 1, y: 16, w: 2, h: 5 },
    { id: "me-r3", type: "room", name: "Room 3", note: "", floor: 0, x: 21, y: 16, w: 2, h: 5 },
    { id: "me-rest", type: "restroom", name: "Restrooms", note: "", keywords: "bathroom", floor: 0, x: 15, y: 19, w: 4, h: 2 }] };

  // ----- Webhooks and their delivery log -----
  const hookAt = (d) => daysAgo(d);
  c.integrations ||= { webhooks: [], embeds: [] };
  c.integrations.webhooks.push(
    { id: "hook-slack", url: "https://hooks.slack.com/services/T000/B000/sample", events: ["card.created", "followup.created", "prayer.created", "form.submitted"], active: true, secret: "whsec_sample_slack", dest: "slack", format: "slack", locations: [], created: hookAt(30) },
    { id: "hook-social", url: "https://hooks.zapier.com/hooks/catch/000000/sample/", events: ["news.created", "event.created"], active: true, secret: "whsec_sample_social", dest: "social", format: "json", locations: [MAIN], created: hookAt(20) });
  const delivered = (id, h, event, data, d, status = "delivered") => {
    const p = { id, event, church: { id: R, handle: c.handle, name: c.name }, at: hookAt(d), data };
    const body = h.format === "slack" ? { text: data.summary } : p;
    return { id, churchId: R, webhookId: h.id, url: h.url, event, body: JSON.stringify(body), signature: "t=0,v1=sample", at: hookAt(d), status };
  };
  const [slack, social] = c.integrations.webhooks.slice(-2);
  st.deliveries.push(
    delivered("dl-1", slack, "card.created", { name: "Maria Lopez", reason: "I want to be baptized", summary: "A connect card is sent: Maria Lopez" }, 5),
    delivered("dl-2", social, "news.created", { title: "Baptism Sunday", body: "Celebrate with us as 6 people are baptized.", locationId: MAIN, summary: "New announcement: Baptism Sunday\nCelebrate with us as 6 people are baptized." }, 1),
    delivered("dl-3", slack, "prayer.created", { name: "Teresa Martinez", summary: "A prayer request is shared: Teresa Martinez" }, 3),
    delivered("dl-4", social, "event.created", { title: "Fall festival", locationId: MAIN, summary: "New event: Fall festival" }, 8, "failed (HTTP 410)"));

  // ----- Event tickets: paid in the app, by cash and check, part now and part later -----
  {
    const ev = (id) => st.events.find((e) => e.id === `${R}-${id}`), retreat = ev("e7"), dinner = ev("e8");
    st.ticketPayments ||= [];
    const reg = (e, by, tickets, extra = {}) => { const total = e.tickets.reduce((n, t) => n + (tickets[t.id] || 0) * t.price, 0), count = Object.values(tickets).reduce((n, x) => n + x, 0);
      const r = { id: `${e.id}~${by}`, code: ticketCodeNew(), by, name: nm(by) || extra.name, email: st.users[by]?.email || "", phone: "", count, kids: [], tickets, total, paid: { status: "door", tracked: true }, at: daysAgo(extra.ago || 3), ...extra };
      delete r.ago; e.registrations.push(r); return r; };
    const pay = (e, r, amount, method, by, ago, more = {}) => st.ticketPayments.push({ id: `tp-${r.by}-${e.id.slice(-2)}-${st.ticketPayments.length}`, churchId: R, eventId: e.id, regId: r.id, payerId: r.by, amount, method,
      status: method === "app" ? "test" : "paid", receivedBy: method === "app" ? "" : by, receivedByName: method === "app" ? "" : nm(by), recordedBy: by, at: daysAgo(ago), receipts: [], checkNo: "", note: "", ...(method === "app" ? { ref: `test_${uid()}` } : {}), ...more });
    if (retreat) {
      Object.assign(retreat, { payInApp: true, payInPerson: true, payPartial: true, deposit: 25, collectors: ["u-daniel"],
        payNote: "Bring cash or a check made out to Riverside Community Church to Daniel Kim or the church office by the Sunday before the retreat." });
      const marcus = reg(retreat, "u-marcus", { "t-student": 2 }, { ago: 9, phone: "(770) 555-0131" });
      pay(retreat, marcus, 50, "app", "", 9); pay(retreat, marcus, 120, "check", "u-dana", 5, { checkNo: "1042", receipts: [{ via: "email", to: marcus.email, at: daysAgo(5), by: "u-dana" }] });
      const teresa = reg(retreat, "u-teresa", { "t-student": 1 }, { ago: 6, phone: "(770) 555-0177" });
      pay(retreat, teresa, 40, "cash", "u-daniel", 4, { receipts: [{ via: "text", to: "(770) 555-0177", at: daysAgo(4), by: "u-daniel" }], note: "Rest after payday" });
      reg(retreat, "u-jordan", { "t-student": 1, "t-leader": 1 }, { ago: 2 });
      const hannah = reg(retreat, "walkin-hannah", { "t-student": 1 }, { name: "Hannah Brooks", email: "hannah.brooks@example.com", ago: 3, addedBy: "u-ana" });
      pay(retreat, hannah, 85, "check", "u-ana", 3, { checkNo: "317", receipts: [{ via: "email", to: "hannah.brooks@example.com", at: daysAgo(3), by: "u-ana" }] });
      const late = reg(retreat, "u-linda", { "t-leader": 1 }, { ago: 7 });
      pay(retreat, late, 20, "cash", "u-daniel", 7); pay(retreat, late, 20, "cash", "u-daniel", 1);
    }
    if (dinner) {
      Object.assign(dinner, { payInApp: true, payInPerson: true, payPartial: false, payNote: "Pay at the welcome desk on Sunday, or at the door that night." });
      const linda = reg(dinner, "u-linda", { "t-adult": 2, "t-child": 1 }, { ago: 5 }); pay(dinner, linda, 38, "cash", "u-ana", 4, { receipts: [{ via: "email", to: linda.email, at: daysAgo(4), by: "u-ana" }] });
      const mark = reg(dinner, "u-mark", { "t-adult": 2 }, { ago: 4 }); pay(dinner, mark, 30, "app", "", 4); mark.paid = { status: "test", tracked: true, at: daysAgo(4) };
      reg(dinner, "u-daniel", { "t-adult": 1 }, { ago: 1 });
      const ana = reg(dinner, "u-ana", { "t-adult": 1, "t-child": 2 }, { ago: 2 }); pay(dinner, ana, 15, "cash", "u-dana", 2);
    }
  }
  // ----- Plan your visit: the demo shows a page a church has filled in -----
  c.visitPage = { blocks: [
    { id: "v-welcome", type: "welcome", title: "We can't wait to meet you", text: "Whether you're new to church or looking for a church home, you're welcome at Riverside. Here's everything you need for your first Sunday." },
    { id: "v-video", type: "video", title: "A welcome from Pastor Dana", url: "", text: "", hidden: true },
    { id: "v-campus", type: "campus", title: "When and where", parking: "Guest parking is marked with blue signs right by the main entrance. On busy Sundays a shuttle runs from the school lot across Riverbend Road.", notes: "" },
    { id: "v-contact", type: "contact", title: "Someone to meet you", userId: "u-ana", role: "Guest welcome coordinator", message: "Hi! I'm usually at the welcome desk from 8:30. Tell me you're coming and I'll save you a seat, show you around and help get your kids checked in.", phone: "", email: "" },
    { id: "v-expect", type: "expect", title: "What to expect", text: "", items: [
      { title: "How long", text: "Services last about 75 minutes." }, { title: "Music and teaching", text: "A mix of modern worship songs and hymns, prayer, and a message from the Bible that connects to everyday life." },
      { title: "What to wear", text: "Come as you are. You'll see everything from jeans to suits." }, { title: "Communion", text: "We share communion on the first Sunday of each month. Everyone who follows Jesus is welcome to take part." }] },
    { id: "v-kids", type: "kids", title: "Bringing kids?", text: KIDS_HOW, kiosks: true, rooms: true },
    { id: "v-map", type: "map", title: "Find your way around" },
    { id: "v-amen", type: "amenities", title: "While you're here", items: ["coffee", "wifi", "parking", "accessparking", "accessible", "elevator", "nursery", "kidsclasses", "checkin", "hearing", "livestream"], custom: "Donuts on the first Sunday of the month" },
    { id: "v-classes", type: "classes", title: "Classes and groups", text: "Most classes don't need you to sign up. Just come. Kids' classes meet during both services; check kids in first." },
    { id: "v-staff", type: "staff", title: "Meet our staff", text: "", people: [
      { id: "st-dana", userId: "u-dana", name: "Dana Whitfield", role: "Lead pastor", photo: "", bio: "Dana has led Riverside since 2012. She grew up in Savannah, studied at Columbia Seminary, and loves long walks on the Chattahoochee trails with her husband Lee and their two kids." },
      { id: "st-marcus", userId: "u-marcus", name: "Marcus Bell", role: "Associate pastor", photo: "", bio: "Marcus oversees adult classes and small groups. Ask him about the best barbecue in Marietta." },
      { id: "st-linda", userId: "u-linda", name: "Linda Park", role: "Children's director", photo: "", bio: "Linda has taught kids at Riverside for fifteen years and makes sure every child is known by name." },
      { id: "st-mark", userId: "u-mark", name: "Mark Ellis", role: "Worship and media", photo: "", bio: "" }] },
    { id: "v-beliefs", type: "beliefs", title: "What we believe", text: "These are the beliefs we hold in common with Christians around the world and through history.", url: "", items: [
      { title: "God", text: "There is one God, eternally existing as Father, Son and Holy Spirit." },
      { title: "Jesus", text: "Jesus Christ is fully God and fully human. He lived without sin, died for our sins, rose from the dead, and will come again." },
      { title: "The Bible", text: "The Bible is God's inspired word, our guide for what we believe and how we live." },
      { title: "Salvation", text: "We are saved by God's grace through faith in Jesus, not by anything we earn." },
      { title: "The church", text: "The church is the family of all who follow Jesus, called to worship, love one another and serve our neighbors." }] }] };

  // ----- Custom reports: they run by themselves the first time someone opens the app, so saved copies appear -----
  st.customReports.push(
    { id: "cr-weekly", churchId: R, name: "Weekly attendance", note: "For Monday's staff meeting.", range: "8w", campus: "all", parts: ["overview|stats|Average week, Last Sunday, Kids per week, First-time guests", "overview|chart|People each week", "attendance|table|Attendance by person"],
      freq: "weekly", weekday: 1, monthday: 1, notify: ["u-dana", "u-marcus"], by: "u-dana", created: daysAgo(60), giving: false },
    { id: "cr-board", churchId: R, name: "Monthly board report", note: "Prepared for the church board.", range: "6m", campus: "all", parts: ["overview|stats|Average week, Last Sunday, Kids per week, First-time guests", "giving|stats|Given, Givers, New givers, Stopped giving", "giving|bars|By fund", "giving|chart|Given each week", "people|table|People"],
      freq: "monthly", weekday: 1, monthday: 1, notify: ["u-dana"], by: "u-dana", created: daysAgo(90), giving: true });
  return st;
}
