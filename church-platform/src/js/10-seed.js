// ---------- Sample churches ----------
// Three made-up congregations, with people in different roles, so every screen has something in it.
// They're marked "Sample" in the app. "Reset sample data" under Me rebuilds them with dates around today.

const KIDS_ROOMS = [
  { id: "nursery", name: "Nursery", minAge: 0, maxAge: 2 },
  { id: "preschool", name: "Preschool", minAge: 3, maxAge: 5 },
  { id: "elementary", name: "Elementary", minAge: 6, maxAge: 11 },
  { id: "students", name: "Students", minAge: 12, maxAge: 17 },
];
const DEFAULT_TEAMS = ["Greeters", "Kids", "Worship", "Media", "Parking", "Coffee"];
const DEFAULT_POSITIONS = {
  Worship: ["Worship leader", "Vocals", "Keys", "Guitar", "Drums"], Media: ["Slides", "Sound", "Livestream"], Kids: ["Preschool teacher", "Elementary teacher", "Check-in desk"],
  Greeters: ["Front door", "Lobby"], Parking: ["Parking lot"], Coffee: ["Coffee bar"],
};
const DEFAULT_FUNDS = [
  { id: "general", name: "General fund", description: "Ministry, staff and building costs" },
  { id: "missions", name: "Missions", description: "Partners at home and abroad" },
];

/** The built-in roles, from most to least access. The primary account holder sits above all of them. */
function defaultRoles() {
  const all = Object.fromEntries(PERMS.map(([, k]) => [k, true]));
  const pick = (...keys) => Object.fromEntries(["use.prayer", "use.directory", "use.chat", "use.checkin", ...keys].map((k) => [k, true]));
  return [
    { id: "admin", name: "Administrator", rank: 90, perms: all, builtin: true },
    { id: "pastor", name: "Pastor", rank: 70, perms: pick("lead.groups", "teach.classes", "build.studies", "build.lessons", "build.sermons", "chat.leaders", "services.plan", "present", "qr.create", "manage.content", "manage.sermons", "manage.prayer", "book.rooms", "schedule.teams", "manage.followup", "view.reports") },
    { id: "staff", name: "Ministry staff", rank: 60, perms: pick("lead.groups", "teach.classes", "build.studies", "build.lessons", "chat.leaders", "services.plan", "checkin.station", "qr.create", "manage.content", "manage.classes", "book.rooms", "schedule.teams", "manage.followup", "view.reports") },
    { id: "media", name: "Media coordinator", rank: 40, perms: pick("present", "services.plan", "qr.create", "schedule.teams") },
    { id: "teacher", name: "Teacher", rank: 30, perms: pick("teach.classes", "build.lessons", "build.studies", "book.rooms") },
    { id: "leader", name: "Group leader", rank: 30, perms: pick("lead.groups", "build.studies", "book.rooms") },
    { id: "checkin", name: "Check-in team", rank: 20, perms: pick("checkin.station") },
    { id: "member", name: "Member", rank: 10, perms: pick(), builtin: true },
  ];
}

function seedChurch(c) {
  return {
    handle: slugify(c.name), email: "", phone: "", website: "", social: {}, logo: "", tagline: "", sign: ["Welcome"],
    color: BRAND_COLORS[0], sample: false, ownerId: null,
    modules: Object.fromEntries(MODULES.map(([k]) => [k, true])),
    roles: defaultRoles(),
    defaults: { roleId: "member", locations: [], listInDirectory: false, prayerPrivate: false, parentCheckout: true, fundId: "general" },
    locations: [], kidsRooms: KIDS_ROOMS, teams: DEFAULT_TEAMS, positions: DEFAULT_POSITIONS, funds: DEFAULT_FUNDS,
    landing: { showOnHome: true, blocks: [] },
    integrations: { webhooks: [], embeds: [] },
    veritasUrl: "", ccli: "", created: new Date().toISOString(),
    ...c,
  };
}
const loc = (churchId, key, o) => ({ id: `${churchId}-${key}`, visibility: "public", rooms: [], services: [], liveUrl: "", address: "", ...o });
const svc = (day, time, label) => ({ id: `${day}-${time}`, day, time, label });

const PD_SONGS = [
  { key: "amazing", title: "Amazing Grace", author: "John Newton", copyright: "Public domain", lyrics: "[Verse 1]\nAmazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n[Verse 2]\n'Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.\n\n[Verse 3]\nThrough many dangers, toils and snares,\nI have already come;\n'Tis grace hath brought me safe thus far,\nAnd grace will lead me home.", order: "Verse 1, Verse 2, Verse 3" },
  { key: "holy", title: "Holy, Holy, Holy", author: "Reginald Heber", copyright: "Public domain", lyrics: "[Verse 1]\nHoly, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy, merciful and mighty!\nGod in three Persons, blessed Trinity!", order: "Verse 1" },
  { key: "doxology", title: "Doxology", author: "Thomas Ken", copyright: "Public domain", lyrics: "[Doxology]\nPraise God, from whom all blessings flow;\nPraise Him, all creatures here below;\nPraise Him above, ye heavenly host;\nPraise Father, Son, and Holy Ghost. Amen.", order: "Doxology" },
];
const BSB = {
  "Psalm 95:1-2": "1 Come, let us sing for joy to the LORD; let us shout to the Rock of our salvation! 2 Let us enter His presence with thanksgiving; let us make a joyful noise to Him in song.",
  "John 15:1-8": "1 “I am the true vine, and My Father is the keeper of the vineyard. 2 He cuts off every branch in Me that bears no fruit, and every branch that does bear fruit, He prunes to make it even more fruitful. 3 You are already clean because of the word I have spoken to you. 4 Remain in Me, and I will remain in you. Just as no branch can bear fruit by itself unless it remains in the vine, neither can you bear fruit unless you remain in Me. 5 I am the vine and you are the branches. The one who remains in Me, and I in him, will bear much fruit. For apart from Me you can do nothing. 6 If anyone does not remain in Me, he is like a branch that is thrown away and withers. Such branches are gathered up, thrown into the fire, and burned. 7 If you remain in Me and My words remain in you, ask whatever you wish, and it will be done for you. 8 This is to My Father’s glory, that you bear much fruit, proving yourselves to be My disciples.",
  "John 15:5": "5 I am the vine and you are the branches. The one who remains in Me, and I in him, will bear much fruit. For apart from Me you can do nothing.",
  "Numbers 6:24-26": "24 ‘May the LORD bless you and keep you; 25 may the LORD cause His face to shine upon you and be gracious to you; 26 may the LORD lift up His countenance toward you and give you peace.’",
};

function buildSeed() {
  const now = new Date();
  const lastSunday = startOfDay(new Date(now.getTime() - now.getDay() * DAY));
  const sundayBack = (weeks) => new Date(lastSunday.getTime() - weeks * 7 * DAY + 10 * 3600e3).toISOString();
  const at = (dow, hhmm, weeks = 0) => nextWeekday(dow, hhmm, weeks).toISOString();
  const plus = (iso, hours) => new Date(new Date(iso).getTime() + hours * 3600e3).toISOString();
  const daysAgo = (d, h = 0) => new Date(now.getTime() - d * DAY - h * 3600e3).toISOString();
  const nextSunday = isoDay(nextWeekday(0, "23:59"));

  // ----- People -----
  const people = [
    ["dana", "Dana Whitfield", "Dana and Lee Whitfield", "(770) 555-0100"], ["marcus", "Marcus Bell", "Marcus and Joy Bell", "(770) 555-0142"],
    ["linda", "Linda Park", "Linda Park", "(770) 555-0111"], ["daniel", "Daniel Kim", "Daniel and Hana Kim", "(770) 555-0198"],
    ["mark", "Mark Reed", "Mark and Sasha Reed", "(770) 555-0175"], ["teresa", "Teresa Martinez", "Teresa Martinez", "(770) 555-0163"],
    ["jordan", "Jordan King", "Jordan King", "(770) 555-0120"], ["ana", "Ana Alvarez", "The Alvarez family", "(770) 555-0157"],
    ["elena", "Elena Ortiz", "Elena Ortiz", "(937) 555-0101"], ["james", "James Okafor", "James and Ada Okafor", "(937) 555-0102"],
    ["walt", "Walt Hughes", "Walt and Marge Hughes", "(937) 555-0144"], ["ruth", "Ruth Adler", "Ruth Adler", "(937) 555-0161"],
    ["bill", "Bill Henderson", "The Hendersons", "(937) 555-0133"], ["sam", "Sam Lindqvist", "Sam and Kari Lindqvist", "(828) 555-0110"],
    ["grace", "Grace Mwangi", "Grace Mwangi", "(828) 555-0124"], ["abby", "Abby Ross", "Abby and Tom Ross", "(828) 555-0181"],
  ];
  const users = Object.fromEntries(people.map(([k, name, household, phone]) => [`u-${k}`, { id: `u-${k}`, name, household, phone, email: `${k}@example.com`, family: [], pickups: [] }]));
  // Families with kids, for the check-in kiosk and staff rosters.
  const yearsAgo = (y, m = 0) => { const d = new Date(now); d.setFullYear(d.getFullYear() - y); d.setMonth(d.getMonth() - m); return isoDay(d); };
  const kid = (name, y, m, allergies = "", notes = "") => ({ id: uid(), name, kind: "child", birth: yearsAgo(y, m), allergies, notes });
  users["u-marcus"].family = [{ id: uid(), name: "Joy Bell", kind: "adult", birth: "", allergies: "", notes: "" }, kid("Eli Bell", 6, 2), kid("Nora Bell", 3, 5, "Peanuts")];
  users["u-marcus"].pickups = [{ id: uid(), name: "Sue Bell", relation: "Grandmother", phone: "(770) 555-0190", photo: "" }];
  users["u-daniel"].family = [kid("Theo Kim", 9, 1)];
  users["u-mark"].family = [kid("Ivy Reed", 4, 8, "", "Asthma. Inhaler in her bag")];
  users["u-ana"].family = [kid("Mateo Alvarez", 7, 4), kid("Sofia Alvarez", 2, 2, "Dairy")];
  users["u-ana"].pickups = [{ id: uid(), name: "Luis Alvarez", relation: "Father", phone: "(770) 555-0158", photo: "" }];
  users["u-james"].family = [kid("Chidi Okafor", 5, 0, "Tree nuts")];
  const memberships = [];
  const mem = (churchId, k, roleId, locations = "all", listed = true) => memberships.push({ churchId, userId: `u-${k}`, roleId, locations, listed, joined: daysAgo(400) });
  mem("riverside", "dana", "admin"); mem("riverside", "marcus", "pastor"); mem("riverside", "linda", "teacher", ["riverside-main"]);
  mem("riverside", "daniel", "leader", ["riverside-east"]); mem("riverside", "mark", "media"); mem("riverside", "teresa", "member", []);
  mem("riverside", "jordan", "teacher", ["riverside-main"]); mem("riverside", "ana", "checkin", ["riverside-main"]);
  mem("cornerstone", "elena", "admin"); mem("cornerstone", "james", "pastor"); mem("cornerstone", "walt", "member", []);
  mem("cornerstone", "ruth", "teacher"); mem("cornerstone", "bill", "leader");
  mem("newhope", "sam", "admin"); mem("newhope", "grace", "leader"); mem("newhope", "abby", "member", []);

  // ----- Churches (separate accounts, each with a primary account holder) -----
  const churches = [
    seedChurch({
      id: "riverside", handle: "riverside-marietta", name: "Riverside Community Church", ownerId: "u-dana", color: "#1f6f78", sample: true,
      tagline: "A family of ordinary people following Jesus by the river.", sign: ["All are welcome", "Sundays 9 and 11"],
      email: "hello@riverside.example", phone: "(770) 555-0100", website: "https://riverside.example",
      locations: [
        loc("riverside", "main", { code: "MAIN", name: "Main campus", address: "2100 Riverbend Rd, Marietta, GA", rooms: ["Sanctuary", "Fellowship hall", "Room 104", "Room 106", "Room 201", "Kids wing"], services: [svc(0, "09:00", "Early service"), svc(0, "11:00", "Late service")] }),
        loc("riverside", "east", { code: "EAST", name: "East campus", address: "880 Canton Hwy, Marietta, GA", rooms: ["Auditorium", "Room 2", "Room 3"], services: [svc(0, "10:00", "Sunday gathering")] }),
        loc("riverside", "office", { code: "STAFF", name: "Staff offices", address: "2104 Riverbend Rd, Marietta, GA", visibility: "private", rooms: ["Conference room", "Prayer room"] }),
      ],
      funds: [...DEFAULT_FUNDS, { id: "benevolence", name: "Benevolence", description: "Help for neighbors in need" }],
      landing: { showOnHome: true, blocks: [
        { id: "b1", type: "text", title: "New here?", text: "Come as you are. Services last about 75 minutes, there's coffee in the lobby, and kids have their own rooms with background-checked teachers." },
        { id: "b2", type: "links", title: "", links: [{ label: "Plan your visit", url: "#church-riverside" }, { label: "Watch live", url: "#live" }, { label: "Our website", url: "https://riverside.example" }] },
        { id: "b3", type: "sermon" },
        { id: "b4", type: "contact" },
      ] },
    }),
    seedChurch({
      id: "cornerstone", handle: "cornerstone-dayton", name: "Cornerstone Bible Fellowship", ownerId: "u-elena", color: "#8c2f39", sample: true,
      tagline: "Verse by verse, together.", sign: ["Give thanks", "Thanksgiving Eve 7pm"],
      locations: [loc("cornerstone", "main", { code: "DAYTON", name: "Keystone Ave", address: "48 Keystone Ave, Dayton, OH", rooms: ["Sanctuary", "Room 104", "Library", "Choir room", "Kids wing", "Chapel"], services: [svc(0, "10:00", "Morning worship"), svc(3, "19:00", "Midweek prayer")] })],
      funds: [...DEFAULT_FUNDS, { id: "building", name: "Building fund", description: "The new fellowship hall" }],
    }),
    seedChurch({
      id: "newhope", handle: "newhope-asheville", name: "New Hope Chapel", ownerId: "u-sam", color: "#3d4fa0", sample: true,
      tagline: "Small church, big table. Come hungry.", sign: ["The coffee is on", "Sunday 10:30"],
      locations: [loc("newhope", "main", { code: "LAUREL", name: "Laurel Street", address: "15 Laurel St, Asheville, NC", rooms: ["Main room", "Back room", "Kids corner"], services: [svc(0, "10:30", "Sunday gathering")] })],
    }),
  ];
  const cityOf = { riverside: "Marietta, GA", cornerstone: "Dayton, OH", newhope: "Asheville, NC" };
  churches.forEach((c) => { c.city = cityOf[c.id]; });

  // ----- Sermons -----
  const sermons = [];
  const addSeries = (churchId, series, speakers, items, startWeek) => items.forEach(([title, passage, topic, summary, outline], i) => {
    sermons.push({ id: `${churchId}-s${startWeek + i}`, churchId, series, title, passage, topic, summary, outline, locationId: `${churchId}-main`, time: churchId === "cornerstone" ? "10:00" : churchId === "newhope" ? "10:30" : "09:00",
      speaker: speakers[i % speakers.length], date: sundayBack(startWeek + i), minutes: 34 + ((i * 7) % 12), mediaUrl: "" });
  });
  addSeries("riverside", "Abide", ["Pastor Dana Whitfield", "Marcus Bell"], [
    ["Remain in my love", "John 15:9-17", "love", "Jesus moves from servants to friends, and commands the kind of love he first gives.", ["Love has a source: the Father's love for the Son", "Obedience is how love stays at home", "Friends of Jesus love one another"]],
    ["When the world pushes back", "John 15:18-27", "persecution", "Following Jesus means sharing in his welcome and in his rejection.", ["The world hated him first", "We belong to him now", "The Spirit testifies, and so do we"]],
  ], 0);
  addSeries("riverside", "Psalms for the weary", ["Pastor Dana Whitfield"], [
    ["The Lord is my shepherd", "Psalm 23", "shepherd", "A psalm for the valley, not just the green pastures.", ["He leads", "He walks with us through the valley", "He prepares a table"]],
    ["Why are you downcast?", "Psalm 42", "lament", "Faith talks back to despair, and keeps hoping.", ["Honest thirst", "Remembering", "Preaching to your own soul"]],
  ], 2);
  addSeries("cornerstone", "Romans: the gospel unfolded", ["Rev. Elena Ortiz", "Pastor James Okafor"], [
    ["Not ashamed", "Romans 1:16-17", "gospel", "The gospel is the power of God for salvation, and in it God's righteousness is revealed.", ["Power, not mere information", "For everyone who believes", "The righteous shall live by faith"]],
    ["But now", "Romans 3:21-26", "justification", "Two words that turn the whole letter from verdict to good news.", ["All have sinned", "Justified freely by grace", "God is both just and the justifier"]],
    ["Peace with God", "Romans 5:1-11", "peace", "Justification changes our standing, our suffering and our hope.", ["Peace and access", "Suffering that produces hope", "Christ died for the ungodly"]],
    ["No condemnation", "Romans 8:1-17", "adoption", "Life in the Spirit, and the cry of adopted children.", ["Set free from the law of sin and death", "Walking by the Spirit", "Abba, Father"]],
  ], 0);
  addSeries("newhope", "The Sermon on the Mount", ["Sam Lindqvist", "Grace Mwangi"], [
    ["Blessed are", "Matthew 5:1-12", "beatitudes", "Jesus announces who is truly well off in his kingdom, and it is not who we expect.", ["The poor in spirit", "Those who mourn and hunger", "The persecuted"]],
    ["When you pray", "Matthew 6:5-15", "prayer", "Jesus teaches a prayer short enough to memorize and deep enough for a lifetime.", ["Not for show", "Our Father", "Forgive as we are forgiven"]],
    ["Do not worry", "Matthew 6:25-34", "worry", "Birds, flowers and a Father who knows what we need.", ["Look at the birds", "Consider the lilies", "Seek first the kingdom"]],
  ], 0);
  // Media for the latest Riverside sermon: an audio file for the podcast and a timed transcript.
  const remain = sermons.find((x) => x.title === "Remain in my love");
  if (remain) Object.assign(remain, { audioUrl: "https://media.riverside.example/sermons/remain-in-my-love.mp3", audioBytes: 33554432, transcript: [
    { t: 0, text: "Good morning, church. Open your Bibles with me to John 15. We're still sitting at the table with Jesus on the night before the cross, and he's still talking about vines and branches." },
    { t: 41, text: "Last week we heard him say, I am the vine and you are the branches. This week he tells us where the life in that vine comes from. As the Father has loved me, so have I loved you. Remain in my love." },
    { t: 95, text: "Notice the order. Love has a source. Jesus doesn't start with what we owe him. He starts with the love that has always passed between the Father and the Son, and he says that same love is now aimed at you." },
    { t: 162, text: "Then he talks about obedience, and some of us tense up. But listen to how he puts it: if you keep my commands, you will remain in my love. Obedience isn't how we earn our way in. It's how love stays at home." },
    { t: 236, text: "And here's the turn that still surprises me. I no longer call you servants, he says. I have called you friends. A servant does what he's told without knowing why. A friend is let in on the plan." },
    { t: 301, text: "So what does a friend of Jesus look like on a Tuesday? Verse 17 says it plainly: love one another. Not a feeling we wait for, but a command we can obey because we have been loved first." },
    { t: 358, text: "This week, think of one person in this church you find hard to love. Pray for them by name, and then do one concrete thing for them. That's what remaining looks like." },
  ] });

  // ----- Events -----
  const ev = (churchId, id, title, start, hours, locKey, room, category, description, extra = {}) =>
    ({ id: `${churchId}-${id}`, churchId, title, start, end: plus(start, hours), locationId: locKey ? `${churchId}-${locKey}` : null, location: room, category, description, capacity: 0, signup: false, kids: false, registrations: [], ...extra });
  const events = [
    ev("riverside", "e1", "Thanksgiving potluck", at(0, "12:30", 1), 2, "main", "Fellowship hall", "Community", "Bring a dish to share after the late service. Turkey and drinks are covered.", { signup: true, capacity: 150, kids: true }),
    ev("riverside", "e2", "Men's breakfast", at(6, "08:00"), 1.5, null, "Riverbend Diner", "Men", "Eggs, coffee and Proverbs 27. Everyone pays their own way."),
    ev("riverside", "e3", "Serve day at the food pantry", at(6, "09:00", 1), 3, null, "Cobb Community Pantry", "Serve", "Sort donations and pack boxes for families before the holiday.", { signup: true, capacity: 30 }),
    ev("riverside", "e4", "Advent family night", at(5, "18:30", 2), 2, "main", "Kids wing", "Kids", "Crafts, carols and an Advent wreath to take home.", { signup: true, capacity: 60, kids: true }),
    ev("riverside", "e5", "East campus game night", at(5, "19:00", 1), 2.5, "east", "Auditorium", "Community", "Board games, snacks and a chili cook-off.", { signup: true, capacity: 80, kids: true }),
    ev("riverside", "e6", "Staff planning retreat", at(1, "09:00", 2), 7, "office", "Conference room", "Staff", "Calendar and budget planning for next year."),
    ev("riverside", "e7", "Youth winter retreat", at(5, "17:00", 6), 48, null, "Camp Westminster, Conyers", "Youth", "A weekend in the woods for 6th to 12th graders: worship, small groups, a ropes course and too much hot chocolate. The price covers lodging, meals and the bus.",
      { signup: true, kids: true, capacity: 70, tickets: [{ id: "t-student", name: "Student", price: 85, limit: 60 }, { id: "t-leader", name: "Adult leader", price: 40, limit: 10 }], formId: "riverside-form-retreat",
        registrations: [{ by: "u-daniel", name: "Daniel Kim", email: "daniel@example.com", count: 2, kids: [], tickets: { "t-student": 1, "t-leader": 1 }, total: 125, paid: { status: "test", ref: "test_seed1", at: daysAgo(4) }, at: daysAgo(4) },
          { by: "u-ana", name: "Ana Alvarez", email: "ana@example.com", count: 1, kids: [], tickets: { "t-student": 1 }, total: 85, paid: { status: "test", ref: "test_seed2", at: daysAgo(2) }, at: daysAgo(2) }] }),
    ev("riverside", "e8", "Christmas dinner theater", at(6, "18:00", 4), 2.5, "main", "Fellowship hall", "Community", "Dinner, a family-friendly play by the drama team and carols to finish. Tickets help cover the meal.",
      { signup: true, kids: true, capacity: 120, tickets: [{ id: "t-adult", name: "Adult", price: 15, limit: 0 }, { id: "t-child", name: "Child, 12 and under", price: 8, limit: 0 }] }),
    ev("cornerstone", "e1", "Thanksgiving Eve service", at(3, "19:00", 1), 1.5, "main", "Sanctuary", "Worship", "Hymns, testimonies and a time of thanksgiving."),
    ev("cornerstone", "e2", "Romans study night", at(2, "19:00"), 1.5, "main", "Room 104", "Classes", "Going deeper into Sunday's passage with Pastor James.", { signup: true, capacity: 40 }),
    ev("cornerstone", "e3", "Christmas choir rehearsal", at(4, "18:30"), 2, "main", "Choir room", "Worship", "All voices welcome. No audition needed."),
    ev("newhope", "e1", "Friendsgiving dinner", at(5, "18:00", 1), 3, "main", "Main room", "Community", "A long table and too many pies. Bring a friend.", { signup: true, capacity: 45, kids: true }),
    ev("newhope", "e2", "Trail cleanup", at(6, "09:30"), 3, null, "Bent Creek trailhead", "Serve", "Gloves and bags provided.", { signup: true, capacity: 25 }),
  ];

  const news = [
    { id: "riverside-n1", churchId: "riverside", title: "Thanksgiving potluck sign-ups are open", body: "We're eating together after the late service on the Sunday before Thanksgiving. Sign up under Events so we can plan tables.", at: daysAgo(1), urgent: false, locationId: null },
    { id: "riverside-n2", churchId: "riverside", title: "Parking lot repaving this Saturday", body: "Please park on Riverbend Rd or at the school across the street. Shuttles run from 8:30.", at: daysAgo(0, 3), urgent: true, locationId: "riverside-main" },
    { id: "riverside-n3", churchId: "riverside", title: "New series starts in December", body: "We'll walk through Luke 1 and 2 for Advent at both campuses.", at: daysAgo(4), urgent: false, locationId: null },
    { id: "cornerstone-n1", churchId: "cornerstone", title: "Fellowship hall update", body: "Framing is finished and drywall starts next week. Thank you for giving to the building fund.", at: daysAgo(2), urgent: false, locationId: null },
    { id: "newhope-n1", churchId: "newhope", title: "We need two more coffee volunteers", body: "Sundays start at 9:45. Training takes ten minutes.", at: daysAgo(1), urgent: false, locationId: null },
  ];

  const pr = (churchId, i, name, text, hoursAgo, prayed, extra = {}) => ({ id: `${churchId}-p${i}`, churchId, by: null, name, anonymous: !name, text, at: daysAgo(0, hoursAgo), prayedBy: [], prayedCount: prayed, answered: false, answer: "", private: false, hidden: false, ...extra });
  const prayers = [
    pr("riverside", 1, "Teresa M.", "My mom starts chemo on Tuesday. Pray for strength and for the doctors.", 5, 23),
    pr("riverside", 2, "", "Pray for my marriage. We're seeing a counselor and want to keep going.", 20, 14),
    pr("riverside", 3, "Jordan K.", "Interview for a teaching job on Friday. I'd be grateful for prayer.", 30, 9),
    pr("riverside", 4, "The Alvarez family", "Thank you for praying for our son's surgery. He came home yesterday and is recovering well.", 52, 41, { answered: true, answer: "Home and recovering." }),
    pr("cornerstone", 1, "Walt H.", "Pray for my neighbor Ron, who lost his wife last month.", 8, 17),
    pr("cornerstone", 2, "Pastor James", "Pray for our missionaries in Peru as they start a new church plant.", 70, 33),
    pr("newhope", 1, "Abby R.", "Our first winter in Asheville. Pray we'd find community.", 12, 8),
  ];

  // ----- Classes and groups -----
  const weekly = (days, time, endTime, weeksBack = 8, weeksAhead = 0) => ({ kind: "weekly", days, time, endTime, startDate: isoDay(new Date(now.getTime() - weeksBack * 7 * DAY)), endDate: weeksAhead ? isoDay(new Date(now.getTime() + weeksAhead * 7 * DAY)) : "" });
  const once = (date, time, endTime) => ({ kind: "once", date: isoDay(date), time, endTime });
  const G = (churchId, key, o) => ({ id: `${churchId}-${key}`, churchId, type: "group", category: "Small group", name: "", description: "", topic: "", locationId: `${churchId}-main`, room: "", schedule: weekly([2], "19:00", "20:30"),
    registration: "open", capacity: 0, ageMin: null, ageMax: null, leaders: [], members: [], sampleCount: 0, study: null, ...o });
  const gatherings = [
    G("riverside", "adult", { type: "class", category: "Sunday school", name: "Adult Bible class: Acts", room: "Room 201", schedule: weekly([0], "09:00", "10:15"), registration: "none", leaders: ["u-marcus"], sampleCount: 26, topic: "The early church", description: "Verse-by-verse through Acts. Drop in any week; no sign-up needed.", study: { passage: "Acts 2:42-47", topic: "church" } }),
    G("riverside", "pre9", { type: "class", category: "Sunday school", name: "Preschool, 9:00", room: "Room 104", schedule: weekly([0], "09:00", "10:15"), ageMin: 3, ageMax: 5, leaders: ["u-linda"], sampleCount: 9, topic: "Jesus is the vine", description: "Bible story, songs, a craft and snack for ages 3 to 5." }),
    G("riverside", "pre11", { type: "class", category: "Sunday school", name: "Preschool, 11:00", room: "Room 104", schedule: weekly([0], "11:00", "12:15"), ageMin: 3, ageMax: 5, leaders: ["u-linda"], sampleCount: 7, topic: "Jesus is the vine", description: "The same lesson as 9:00, for families at the late service." }),
    G("riverside", "elem9", { type: "class", category: "Sunday school", name: "Elementary, 9:00", room: "Room 106", schedule: weekly([0], "09:00", "10:15"), ageMin: 6, ageMax: 11, leaders: ["u-jordan"], sampleCount: 14, topic: "Parables of Jesus", description: "Kindergarten through 5th grade." }),
    G("riverside", "youth", { type: "class", category: "Sunday school", name: "Youth Sunday school", locationId: "riverside-east", room: "Room 3", schedule: weekly([0], "10:00", "11:15"), ageMin: 12, ageMax: 17, leaders: ["u-daniel"], sampleCount: 18, topic: "Questions about faith", description: "Middle and high school." }),
    G("riverside", "membership", { type: "class", category: "Classes", name: "Membership class", room: "Room 201", schedule: once(nextWeekday(6, "10:00", 1), "10:00", "12:00"), registration: "open", capacity: 30, leaders: ["u-dana"], sampleCount: 11, description: "What we believe, how we're organized and how to get involved. Lunch provided." }),
    G("riverside", "fpu", { type: "class", category: "Classes", name: "Financial Peace", room: "Fellowship hall", schedule: weekly([3], "18:30", "20:00", -1, 9), registration: "open", capacity: 24, leaders: ["u-mark"], sampleCount: 15, topic: "Money and generosity", description: "Nine weeks on budgeting, getting out of debt and giving." }),
    G("riverside", "eastside", { name: "Eastside young adults", category: "Small group", locationId: "riverside-east", room: "The Kims' apartment", schedule: weekly([2], "19:00", "21:00"), leaders: ["u-daniel"], sampleCount: 11, capacity: 16, topic: "Abide", description: "Dinner, the Sunday passage and real questions. Ages 20 to 35.", study: { passage: "John 15:1-8", topic: "abide" } }),
    G("riverside", "women", { name: "Tuesday women's study", category: "Bible study", room: "Room 201", schedule: weekly([2], "09:30", "11:00"), leaders: ["u-linda"], sampleCount: 14, capacity: 20, topic: "Psalms of ascent", description: "Childcare available.", study: { passage: "Psalm 121", topic: "pilgrimage" } }),
    G("riverside", "couples", { name: "Couples on the river", locationId: null, room: "Rotating homes", schedule: weekly([5], "18:30", "20:30"), registration: "approval", leaders: ["u-mark"], sampleCount: 8, capacity: 12, topic: "Marriage", description: "Couples of every age sharing a meal and the week." }),
    G("riverside", "men", { name: "Men's 6am", locationId: null, room: "Riverbend Diner", schedule: weekly([4], "06:00", "07:00"), leaders: ["u-marcus"], sampleCount: 9, topic: "Proverbs", description: "Coffee, Proverbs and accountability.", study: { passage: "Proverbs 3", topic: "wisdom" } }),
    G("riverside", "staffprayer", { name: "Staff prayer", category: "Staff", locationId: "riverside-office", room: "Conference room", schedule: weekly([1], "09:00", "09:45"), registration: "approval", leaders: ["u-dana"], sampleCount: 6, description: "Weekly prayer for the staff team." }),
    G("cornerstone", "adult", { type: "class", category: "Sunday school", name: "Adult Sunday school: Romans", room: "Room 104", schedule: weekly([0], "09:00", "09:50"), registration: "none", leaders: ["u-james"], sampleCount: 31, topic: "Romans" }),
    G("cornerstone", "kids", { type: "class", category: "Sunday school", name: "Kids church", room: "Kids wing", schedule: weekly([0], "10:00", "11:15"), ageMin: 4, ageMax: 10, leaders: ["u-ruth"], sampleCount: 16, topic: "Heroes of faith" }),
    G("cornerstone", "grief", { name: "Grief share", category: "Care", room: "Library", schedule: weekly([4], "18:00", "19:30", 2, 11), registration: "approval", capacity: 12, leaders: ["u-ruth"], sampleCount: 7, description: "A 13-week group for anyone who has lost someone." }),
    G("cornerstone", "north", { name: "Northside families", locationId: null, room: "The Hendersons", schedule: weekly([0], "17:00", "19:00"), leaders: ["u-bill"], sampleCount: 18, capacity: 24, description: "Kids welcome. We eat first.", study: { passage: "Deuteronomy 6:4-9", topic: "family" } }),
    G("newhope", "kids", { type: "class", category: "Sunday school", name: "Kids corner", room: "Kids corner", schedule: weekly([0], "10:30", "11:45"), ageMin: 3, ageMax: 10, leaders: ["u-grace"], sampleCount: 8 }),
    G("newhope", "supper", { name: "Supper club", category: "Community", room: "Main room", schedule: weekly([3], "18:30", "20:30"), leaders: ["u-grace"], sampleCount: 12, capacity: 16, description: "Cook, eat and talk about Sunday.", study: { passage: "Matthew 5:1-12", topic: "beatitudes" } }),
    G("newhope", "trail", { name: "Trail and prayer", locationId: null, room: "Bent Creek trailhead", schedule: weekly([6], "07:30", "09:30"), leaders: ["u-sam"], sampleCount: 6, description: "A hike with a short reading and prayer at the top." }),
  ];

  const plan = (churchId, id, name, description, days) => ({ id: `${churchId}-${id}`, churchId, name, description, days });
  const range = (book, from, to) => Array.from({ length: to - from + 1 }, (_, i) => [`${book} ${from + i}`]);
  const plans = [
    plan("riverside", "john", "John in 21 days", "A chapter a day through the Gospel of John, alongside the Abide series.", range("John", 1, 21)),
    plan("riverside", "ascent", "Psalms of ascent", "Fifteen songs pilgrims sang on the way up to Jerusalem.", range("Psalm", 120, 134)),
    plan("cornerstone", "romans", "Romans in 16 days", "Read the whole letter before the series ends.", range("Romans", 1, 16)),
    plan("newhope", "sermon", "The Sermon on the Mount", "Matthew 5 to 7, a section a day.", [["Matthew 5:1-16"], ["Matthew 5:17-32"], ["Matthew 5:33-48"], ["Matthew 6:1-18"], ["Matthew 6:19-34"], ["Matthew 7:1-12"], ["Matthew 7:13-29"]]),
  ];

  const gifts = [];
  const donors = { riverside: ["Marcus Bell", "Linda Park", "Mark Reed", "Teresa Martinez"], cornerstone: ["Walt Hughes", "Bill Henderson", "Ruth Adler"], newhope: ["Abby Ross", "Grace Mwangi"] };
  churches.forEach((c) => donors[c.id].forEach((name, i) => {
    for (let w = 0; w < 6; w++) gifts.push({ id: `${c.id}-gift${i}-${w}`, churchId: c.id, by: null, name, fundId: c.funds[(i + w) % c.funds.length].id, amount: [25, 50, 75, 100, 150][(i * 3 + w) % 5], frequency: w % 3 === 0 ? "monthly" : "once", method: i % 2 ? "bank" : "card", at: daysAgo(w * 7 + i, 2), sample: true });
  }));

  // ----- Builder documents: a sermon, a Sunday school lesson and a group study -----
  const B = (type, o) => ({ id: uid(), type, show: !["note", "action"].includes(type), notes: "", ...o });
  const docs = [
    { id: "riverside-doc-vine", churchId: "riverside", kind: "sermon", title: "The true vine", passage: "John 15:1-8", topic: "abide", date: nextSunday, time: "09:00", locationId: "riverside-main", authorId: "u-dana", gatheringId: null, published: true, shareWithParents: false, updated: daysAgo(1),
      resource: "Open with the grapevine story. Keep the whole sermon under 35 minutes; communion follows.",
      blocks: [
        B("keynote", { text: "Abide: the true vine", notes: "Welcome the East campus watching online." }),
        B("scripture", { ref: "John 15:1-8", translation: "BSB", text: BSB["John 15:1-8"], notes: "Read slowly. Pause after verse 5." }),
        B("note", { text: "Story: Grandpa's grapevine on the back fence and the year he pruned it to a stump." }),
        B("point", { text: "Jesus is the vine; the Father tends the vineyard", notes: "Vine imagery in Isaiah 5 and Psalm 80." }),
        B("point", { text: "Pruning is care, not punishment" }),
        B("keynote", { text: "You can't manufacture fruit. You can only stay connected.", notes: "Let this one sit. Count to five." }),
        B("point", { text: "Remaining in Christ is the only source of lasting fruit" }),
        B("question", { text: "Where are you trying to produce fruit on your own?" }),
        B("action", { label: "Response time", text: "Band comes up during the last point. Prayer team at the front.", show: false }),
        B("action", { label: "Show QR code", text: "Sign up for the Thanksgiving potluck", target: "event-riverside-e1", show: true }),
      ] },
    { id: "riverside-doc-lesson", churchId: "riverside", kind: "lesson", title: "Jesus is the vine", passage: "John 15:5", topic: "abide", date: nextSunday, time: "09:00", locationId: "riverside-main", authorId: "u-linda", gatheringId: "riverside-pre9", published: true, shareWithParents: true, updated: daysAgo(2),
      resource: "Supplies: green paper, purple pom-poms, glue sticks. Snack: grapes (check the allergy list).",
      blocks: [
        B("keynote", { text: "Stay close to Jesus" }),
        B("scripture", { ref: "John 15:5", translation: "BSB", text: BSB["John 15:5"] }),
        B("point", { text: "A branch needs the vine to grow grapes" }),
        B("point", { text: "We need Jesus to grow love, joy and kindness" }),
        B("question", { text: "What does a branch need to grow fruit?" }),
        B("action", { label: "Craft", text: "Paper grapevine. Supplies in cabinet B.", show: false }),
        B("note", { text: "Bring a real grapevine cutting from home to pass around." }),
      ] },
    { id: "riverside-doc-study", churchId: "riverside", kind: "study", title: "Abide: group study guide", passage: "John 15:1-8", topic: "abide", date: isoDay(nextWeekday(2, "19:00")), time: "19:00", locationId: "riverside-east", authorId: "u-daniel", gatheringId: "riverside-eastside", published: true, shareWithParents: false, updated: daysAgo(3), resource: "",
      blocks: [
        B("text", { title: "Before we meet", text: "Read John 15:1-17 twice this week, once out loud." }),
        B("scripture", { ref: "John 15:1-8", translation: "BSB", text: BSB["John 15:1-8"] }),
        B("question", { text: "What does it look like, practically, to remain in Jesus on a busy Tuesday?" }),
        B("question", { text: "Where have you experienced God's pruning? How did it feel at the time?" }),
        B("question", { text: "Verse 7 is a big promise. How does verse 8 shape what we ask for?" }),
        B("note", { text: "Daniel: leave 20 minutes for prayer requests." }),
      ] },
  ];

  // ----- Songs, saved segments and a service plan -----
  const songs = PD_SONGS.map((s) => ({ id: `riverside-song-${s.key}`, churchId: "riverside", title: s.title, author: s.author, copyright: s.copyright, ccliSong: "", publicDomain: true, lyrics: s.lyrics, order: s.order }));
  const seg = (type, title, minutes, content = {}, o = {}) => ({ id: uid(), type, title, minutes, leader: "", notes: "", show: true, content, ...o });
  const library = [
    seg("welcome", "Welcome", 3, { text: "Welcome to Riverside! Grab a coffee, and make sure you've met someone new today." }, { leader: "Marcus Bell" }),
    seg("song", "Doxology", 2, { songId: "riverside-song-doxology" }),
    seg("offering", "Offering", 4, { text: "Give online, by text, or in the boxes at the back." }),
    seg("benediction", "Benediction", 1, { ref: "Numbers 6:24-26", text: BSB["Numbers 6:24-26"] }),
    seg("announcements", "Announcements", 3, {}),
  ].map((s) => ({ ...s, id: `riverside-lib-${slugify(s.title)}`, churchId: "riverside", name: s.title }));
  const services = [{
    id: "riverside-svc-1", churchId: "riverside", title: "Sunday worship", date: nextSunday, time: "09:00", locationId: "riverside-main", notes: "Communion Sunday.",
    segments: [
      seg("welcome", "Welcome", 3, library[0].content, { leader: "Marcus Bell", notes: "Mention the parking lot shuttle." }),
      seg("call", "Call to worship", 2, { ref: "Psalm 95:1-2", text: BSB["Psalm 95:1-2"] }, { leader: "Marcus Bell" }),
      seg("song", "Holy, Holy, Holy", 4, { songId: "riverside-song-holy" }, { leader: "Worship team" }),
      seg("song", "Amazing Grace", 5, { songId: "riverside-song-amazing" }, { leader: "Worship team", notes: "Key of G. Acapella on verse 3." }),
      seg("prayer", "Pastoral prayer", 4, { text: "Prayer for our church, our city and those who are hurting." }, { leader: "Pastor Dana Whitfield", show: false }),
      seg("scripture", "Scripture reading", 3, { ref: "John 15:1-8", text: BSB["John 15:1-8"] }, { leader: "Teresa Martinez" }),
      seg("sermon", "Sermon: The true vine", 32, { docId: "riverside-doc-vine" }, { leader: "Pastor Dana Whitfield" }),
      seg("communion", "Communion", 8, { text: "The table is open to all who trust in Jesus." }, { notes: "Elders serve the side aisles." }),
      seg("offering", "Offering", 4, library[2].content),
      seg("song", "Doxology", 2, { songId: "riverside-song-doxology" }),
      seg("announcements", "Announcements", 3, {}),
      seg("benediction", "Benediction", 1, library[3].content, { leader: "Pastor Dana Whitfield" }),
    ],
  }];

  // ----- Named layouts and saved builder items -----
  const slot = (x, title) => ({ ...JSON.parse(JSON.stringify(x)), id: uid(), title: title || x.title, content: x.type === "call" || x.type === "scripture" || x.type === "benediction" ? (x.type === "benediction" ? x.content : { translation: "BSB" }) : ["song", "sermon", "media"].includes(x.type) ? (x.title === "Doxology" ? x.content : {}) : x.content });
  const svcSegs = services[0].segments;
  const standard = [slot(svcSegs[0]), slot(svcSegs[1]), slot(svcSegs[2], "Opening song"), slot(svcSegs[3], "Worship song"), slot(svcSegs[4]), slot(svcSegs[5]), slot(svcSegs[6], "Sermon"), slot(svcSegs[8]), slot(svcSegs[9]), slot(svcSegs[10]), slot(svcSegs[11])];
  const communion = [...standard.slice(0, 7), slot(svcSegs[7]), ...standard.slice(7)].map((x) => ({ ...x, id: uid() }));
  const E = (type, o = {}) => ({ id: uid(), type, show: !["note", "action"].includes(type), notes: "", text: "", ...o });
  const layouts = [
    { id: "riverside-layout-standard", churchId: "riverside", kind: "service", name: "Standard Sunday", items: standard, updated: daysAgo(10), authorId: "u-mark" },
    { id: "riverside-layout-communion", churchId: "riverside", kind: "service", name: "Communion Sunday", items: communion, updated: daysAgo(10), authorId: "u-mark" },
    { id: "riverside-layout-3pt", churchId: "riverside", kind: "sermon", name: "Three-point sermon", updated: daysAgo(20), authorId: "u-dana",
      items: [E("keynote"), E("scripture", { ref: "", translation: "BSB" }), E("point"), E("point"), E("point"), E("question"), E("action", { label: "Response time", text: "Band comes up during the last point. Prayer team at the front." })] },
    { id: "riverside-layout-kids", churchId: "riverside", kind: "lesson", name: "Kids lesson", updated: daysAgo(15), authorId: "u-linda",
      items: [E("keynote"), E("scripture", { ref: "", translation: "BSB" }), E("point"), E("point"), E("question"), E("action", { label: "Craft", text: "" }), E("note", { text: "Check the allergy list before snack." })] },
  ];
  const savedBlocks = [{ id: "riverside-saved-response", churchId: "riverside", kind: "sermon", name: "Response time cue", at: daysAgo(20), block: E("action", { label: "Response time", text: "Band comes up during the last point. Prayer team at the front." }) }];

  // ----- Volunteer teams, a schedule for Sunday, and someone's dates away -----
  const teamMembers = [["Worship", ["mark", "jordan", "teresa"]], ["Media", ["mark", "daniel"]], ["Kids", ["linda", "ana", "jordan"]], ["Greeters", ["teresa", "ana", "marcus"]], ["Parking", ["marcus"]], ["Coffee", ["daniel"]]]
    .flatMap(([team, ks]) => ks.map((k) => ({ id: uid(), churchId: "riverside", team, userId: `u-${k}` })));
  const asg = (team, position, k, status, note = "") => ({ id: uid(), team, position, userId: `u-${k}`, status, note, at: daysAgo(3) });
  services[0].assignments = [asg("Worship", "Worship leader", "mark", "accepted"), asg("Worship", "Vocals", "teresa", "pending"), asg("Media", "Slides", "daniel", "accepted"),
    asg("Kids", "Preschool teacher", "linda", "accepted"), asg("Kids", "Check-in desk", "ana", "declined", "Out of town that weekend")];
  const blockouts = [{ id: uid(), churchId: "riverside", userId: "u-ana", from: nextSunday, to: nextSunday, note: "Visiting family" }];

  // ----- History for reports: weekly attendance, a year of giving, and newcomers being followed up -----
  const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const pastSunday = (w) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() || 7) - 7 * (w - 1)); return isoDay(d); };
  const attendance = [];
  const sizes = { "riverside-main@09:00": [150, 34, 70], "riverside-main@11:00": [205, 46, 95], "riverside-east@10:00": [72, 18, 0], "cornerstone-main@10:00": [104, 15, 32], "newhope-main@10:30": [52, 10, 0] };
  for (let w = 1; w <= 52; w++) Object.entries(sizes).forEach(([k, [a, kd, o]], j) => {
    const [locationId, time] = k.split("@"), date = pastSunday(w), grow = 1 + 0.003 * (52 - w), r = (n) => 0.9 + 0.2 * rnd(w * 31 + j * 7 + n);
    attendance.push({ id: uid(), churchId: locationId.split("-")[0], serviceKey: `${date}T${time}@${locationId}`, date, time, locationId,
      adults: Math.round(a * grow * r(1)), kids: Math.round(kd * grow * r(2)), online: Math.round(o * r(3)), by: "sample" });
  });
  const givers = { riverside: ["Dana Whitfield", "Daniel Kim", "Jordan King", "Ana Alvarez", "Priya Shah", "The Okoro family"], cornerstone: ["James Okafor", "Elena Ortiz"], newhope: ["Sam Lindqvist"] };
  churches.forEach((c) => [...donors[c.id], ...givers[c.id]].forEach((name, i) => {
    for (let d = 45; d < 380; d += 7 + Math.floor(rnd(i * 13 + d) * 14)) {
      gifts.push({ id: `${c.id}-hist${i}-${d}`, churchId: c.id, by: null, name, fundId: c.funds[rnd(i + d) < 0.8 ? 0 : (i + d) % c.funds.length].id, amount: [20, 25, 40, 50, 75, 100, 120, 150, 250][Math.floor(rnd(i * 7 + d * 3) * 9)], frequency: i % 3 === 0 ? "monthly" : "once", method: i % 2 ? "bank" : "card", at: daysAgo(d, 3), sample: true });
    }
  }));
  // Guests who came through the kiosk or a connect card, and where their follow-up stands.
  users["g-nguyen"] = { id: "g-nguyen", name: "Thao Nguyen", household: "The Nguyen family", phone: "(770) 555-0177", email: "thao.nguyen@example.com", guestOf: ["riverside"], firstVisit: daysAgo(9),
    family: [kid("Lan Nguyen", 8, 0, "Shellfish"), kid("Minh Nguyen", 5, 3)], pickups: [] };
  const STEPS = ["Send a welcome text or email", "Pastor or staff phone call", "Invite to a newcomers lunch", "Help them join a group or team"];
  const steps = (done, by = "u-dana", at = daysAgo(1)) => STEPS.map((label, i) => ({ id: uid(), label, done: i < done, doneAt: i < done ? at : null, by: i < done ? by : null }));
  const cards = [
    { id: "card-priya", churchId: "riverside", by: null, name: "Priya Shah", reason: "I'm new here", message: "We just moved from Atlanta and are looking for a church home with a good kids program.", contact: "priya.shah@example.com, (770) 555-0131", at: daysAgo(2, 3), handled: false },
    { id: "card-maria", churchId: "riverside", by: null, name: "Maria Lopez", reason: "I want to be baptized", message: "", contact: "(770) 555-0148", at: daysAgo(5), handled: false },
  ];
  const fu = (o) => ({ id: uid(), churchId: "riverside", status: "new", assignedTo: "u-dana", notes: [], personId: null, phone: "", email: "", message: "", steps: steps(0), ...o });
  const followups = [
    fu({ name: "Priya Shah", source: "card", cardId: "card-priya", reason: "I'm new here", message: cards[0].message, email: "priya.shah@example.com", phone: "(770) 555-0131", assignedTo: "u-marcus", at: cards[0].at }),
    fu({ name: "Maria Lopez", source: "card", cardId: "card-maria", reason: "I want to be baptized", phone: "(770) 555-0148", assignedTo: "u-marcus", at: cards[1].at }),
    fu({ name: "Thao Nguyen", personId: "g-nguyen", source: "kiosk", reason: "First visit, checked in Lan and Minh", phone: "(770) 555-0177", email: "thao.nguyen@example.com", status: "contacted", steps: steps(2, "u-dana", daysAgo(6)), at: daysAgo(9),
      notes: [{ id: uid(), by: "u-dana", at: daysAgo(6), text: "Called Thursday. They loved the kids wing. Invited them to the newcomers lunch." }] }),
    fu({ name: "Owen Carter", source: "joined", reason: "Joined the church in the app", email: "owen.carter@example.com", status: "connected", steps: steps(4, "u-marcus", daysAgo(10)), at: daysAgo(24) }),
    fu({ name: "Ben Foster", source: "card", reason: "I have a question", phone: "(770) 555-0129", status: "closed", steps: steps(1, "u-dana", daysAgo(45)), at: daysAgo(48), notes: [{ id: uid(), by: "u-dana", at: daysAgo(40), text: "Moved closer to family in Athens. Sent him a church there." }] }),
    ...["Hannah Price", "Luis Romero", "The Patel family", "Grace Odom", "Carlos Vega", "Megan Holt", "Isaac Brown"].map((name, i) =>
      fu({ name, source: ["card", "kiosk", "joined"][i % 3], reason: ["I'm new here", "First visit with kids", "Joined the church in the app"][i % 3], status: i % 4 === 3 ? "closed" : "connected", steps: steps(i % 4 === 3 ? 1 : 4, "u-marcus", daysAgo(30 + i * 18)), at: daysAgo(35 + i * 20) })),
  ];

  // ----- Forms, a room calendar -----
  const formsSeed = [
    { id: "riverside-form-retreat", churchId: "riverside", title: "Youth retreat permission slip", description: "One for each student going to the winter retreat.", perChild: true, fee: 0, open: true, closes: "", listed: false, eventId: "riverside-e7", notify: "u-daniel", by: "u-daniel", created: daysAgo(10),
      fields: [{ id: "q1", type: "heading", label: "About your student", help: "", required: false, options: [] }, { id: "q2", type: "textarea", label: "Allergies and medications", help: "Anything leaders should know, and when medicine is due.", required: false, options: [] },
        { id: "q3", type: "text", label: "Emergency contact name", help: "", required: true, options: [] }, { id: "q4", type: "phone", label: "Emergency contact phone", help: "", required: true, options: [] },
        { id: "q5", type: "yesno", label: "May leaders give over-the-counter medicine, like ibuprofen, if needed?", help: "", required: true, options: [] },
        { id: "q6", type: "yesno", label: "May we use photos of your student in church slides and social media?", help: "", required: true, options: [] },
        { id: "q7", type: "signature", label: "Parent or guardian signature", help: "I give permission for my student to attend the retreat and for leaders to get emergency medical care if I can't be reached.", required: true, options: [] }] },
    { id: "riverside-form-volunteer", churchId: "riverside", title: "Volunteer application", description: "Tell us where you'd like to serve. Someone from that team will be in touch.", perChild: false, fee: 0, open: true, closes: "", listed: true, eventId: null, notify: "u-dana", by: "u-dana", created: daysAgo(30),
      fields: [{ id: "v1", type: "phone", label: "Best phone number", help: "", required: true, options: [] }, { id: "v2", type: "checkboxes", label: "Where would you like to serve?", help: "", required: true, options: DEFAULT_TEAMS },
        { id: "v3", type: "choice", label: "How often can you serve?", help: "", required: false, options: ["Every week", "Twice a month", "Once a month", "Now and then"] }, { id: "v4", type: "textarea", label: "Tell us a little about yourself", help: "", required: false, options: [] }] },
  ];
  const formResponses = [{ id: uid(), churchId: "riverside", formId: "riverside-form-volunteer", by: "u-teresa", name: "Teresa Martinez", email: "teresa@example.com", childId: null, childName: "", answers: { v1: "(770) 555-0163", v2: ["Worship", "Greeters"], v3: "Twice a month", v4: "I sang in a choir for years." }, paid: null, at: daysAgo(12) }];
  const nextDow = (dow, w = 0) => isoDay(nextWeekday(dow, "00:00", w));
  const bookings = [
    { id: uid(), churchId: "riverside", locationId: "riverside-main", room: "Room 201", title: "Youth leaders meeting", date: nextDow(2), start: "18:30", end: "20:00", repeat: "none", until: "", note: "Pizza for 8", status: "approved", by: "u-daniel", at: daysAgo(5) },
    { id: uid(), churchId: "riverside", locationId: "riverside-main", room: "Fellowship hall", title: "Women's Bible study", date: nextDow(4), start: "10:00", end: "11:30", repeat: "weekly", until: isoDay(new Date(now.getTime() + 120 * DAY)), note: "Round tables and coffee", status: "approved", by: "u-dana", at: daysAgo(20) },
    { id: uid(), churchId: "riverside", locationId: "riverside-main", room: "Sanctuary", title: "Wedding rehearsal", date: nextDow(5, 1), start: "17:00", end: "19:00", repeat: "none", until: "", note: "Piano tuned, please", status: "requested", by: "u-jordan", at: daysAgo(1) },
  ];

  const messages = [
    { id: uid(), channelId: "g-riverside-eastside", by: "u-daniel", text: "We're at our place Tuesday at 7. Bring a side dish if you can!", at: daysAgo(1, 4) },
    { id: uid(), channelId: "g-riverside-eastside", by: "u-teresa", text: "I'll bring a salad.", at: daysAgo(1, 2) },
    { id: uid(), channelId: "p-riverside-pre9", by: "u-linda", text: "This Sunday we're learning that Jesus is the vine. Ask your kids what branches need to grow!", at: daysAgo(0, 20) },
    { id: uid(), channelId: "leaders-riverside", by: "u-dana", text: "Staff prayer Monday at 9 in the conference room.", at: daysAgo(2) },
    { id: uid(), channelId: "leaders-riverside", by: "u-marcus", text: "Sunday's sermon slides are ready in the builder. Mark, the service plan is set for 9:00.", at: daysAgo(0, 6) },
  ];

  return {
    v: 2,
    me: { id: "me-" + uid(), name: "", email: "", phone: "", household: [], pickups: [] },
    users, memberships, current: null, campus: {},
    churches: Object.fromEntries(churches.map((c) => [c.id, c])),
    sermons, events, news, prayers, gatherings, plans, gifts, docs, songs, library, services, layouts, savedBlocks,
    channels: [], messages, chatSeen: {}, deliveries: [], teamMembers, blockouts, notifications: [],
    cards, checkins: [], serving: [], recurring: [], attendance, followups, forms: formsSeed, formResponses, bookings,
    notes: {}, progress: {}, saved: [], seen: [],
  };
}
