// ---------- Demo and training sandboxes ----------
// SANDBOX (00-util.js) is "demo" or "training" while the app runs on practice data in this browser. Both start on a
// sample church with you as its primary account holder, so every feature is open to try, create and change.
// Training adds a checklist of exercises that tick themselves off as you do them. Staff signed in to the live app
// can also train on a practice copy of their own church. Nothing in a sandbox reaches anyone's real data.

const SANDBOX_NAMES = { demo: "Demo", training: "Training" };
/** Where a practice copy of a real church is kept, so Reset goes back to it rather than to the sample churches. */
const sandboxStartKey = () => `${PLATFORM.storageKey}-start`;
/** The app's own address, keeping ?debug for testing. */
const appPath = () => location.pathname + (/[?&]debug\b/.test(location.search) ? "?debug" : "");

/** Makes you the church's primary account holder in practice data, keeping the real one as an administrator. */
function makePrimary(c = S.church()) {
  if (!c || c.ownerId === S.me().id) return;
  c.previousOwner = c.ownerId; c.ownerId = S.me().id;
  if (c.previousOwner && S.state.users[c.previousOwner] && !S.membership(c.id, c.previousOwner)) S.state.memberships.push({ churchId: c.id, userId: c.previousOwner, roleId: "admin", locations: "all", listed: true, joined: new Date().toISOString() });
  if (S.membership(c.id)) S.membership(c.id).locations = "all";
}

/** First visit to a sandbox: a name, the sample church joined, and the training baseline. Runs once per sandbox. */
function sandboxStart() {
  if (!SANDBOX) return;
  const st = S.state;
  if (!st.sandbox) {
    let liveName = "";
    try { liveName = JSON.parse(localStorage.getItem(`${BASE_STORAGE_KEY}-live`) || "null")?.me?.name || ""; } catch { /* no live copy */ }
    st.me.name ||= liveName || (SANDBOX === "demo" ? "Guest" : "Trainee");
    const c = st.churches.riverside || Object.values(st.churches)[0];
    if (c) { S.join(c.id); makePrimary(c); }
    st.sandbox = { mode: SANDBOX, started: new Date().toISOString() };
    if (!location.hash || location.hash === "#") history.replaceState(null, "", `${location.pathname}${location.search}#${SANDBOX === "training" ? "training" : "home"}`);
  }
  if (SANDBOX === "training") trainingState();
  S.save();
}

function sandboxBar() {
  const t = SANDBOX === "training" ? trainingProgress() : null;
  return html`<div class="sandbox-bar" role="note"><span class="sb-tag">${SANDBOX_NAMES[SANDBOX]}</span>
    <span class="sb-text">${S.state.sandbox?.copyOf ? `Practice copy of ${S.state.sandbox.copyOf}.` : "Sample churches."} Nothing here is real.</span>
    <span class="sb-acts">${t ? html`<a href="#training">${t.done} of ${t.total} done</a>` : html`<button type="button" data-act="demo-role">View as</button>`}
      <button type="button" data-act="sandbox-reset">Reset</button><button type="button" data-act="sandbox-exit">Exit</button></span></div>`;
}

Actions["sandbox-reset"] = () => openSheet(`Start the ${SANDBOX_NAMES[SANDBOX].toLowerCase()} over?`, html`<p style="margin-top:0">Everything you added or changed here is cleared${S.state.sandbox?.copyOf ? `, and the practice copy of ${S.state.sandbox.copyOf} goes back to how it was when you started` : " and the sample churches come back"}.${SANDBOX === "training" ? " The checklist starts over too." : ""}</p>
  <div class="btns"><button class="btn danger" data-act="sandbox-reset-yes">Start over</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
Actions["sandbox-reset-yes"] = () => {
  S.save = S.flush = () => {};   // nothing more is written as the page reloads
  try {
    const start = localStorage.getItem(sandboxStartKey());
    if (start) localStorage.setItem(PLATFORM.storageKey, start); else localStorage.removeItem(PLATFORM.storageKey);
  } catch { /* storage unavailable */ }
  history.replaceState(null, "", `${appPath()}#${SANDBOX === "training" ? "training" : "home"}`);
  location.reload();
};
/** Back to the live app (or the plain preview). The sandbox keeps its data for next time. */
Actions["sandbox-exit"] = () => {
  S.flush();
  try { localStorage.removeItem(SANDBOX_KEY); } catch { /* storage unavailable */ }
  history.replaceState(null, "", appPath());
  location.reload();
};

// ----- Starting training from the live app: sample churches, or a practice copy of your own church -----
Actions["train-open"] = () => {
  const c = S.church();
  openSheet("Training", html`<p style="margin-top:0">Practice every feature with a checklist of exercises. Training runs in this browser only: nothing you do there reaches ${c ? c.name : "your church"}'s real data, nobody is notified, and no money moves.</p>
    <div class="rows">
      <a class="row" href="${location.pathname}?training"><span class="lead-ic">${icon("church")}</span><span class="body"><span class="t">Practice with a sample church</span><span class="s">Every feature filled in, with you as its administrator</span></span>${icon("chev")}</a>
      ${c ? html`<button type="button" class="row" data-act="train-copy"><span class="lead-ic">${icon("copy")}</span><span class="body"><span class="t">Practice with a copy of ${c.name}</span><span class="s">Your church's own events, people and settings, to try changes safely</span></span>${icon("chev")}</button>` : ""}
    </div>`);
};
Actions["train-copy"] = () => {
  const c = S.church();
  const copy = JSON.parse(JSON.stringify(S.state));
  copy.sandbox = { mode: "training", started: new Date().toISOString(), copyOf: c.name };
  delete copy.training;
  const key = `${BASE_STORAGE_KEY}-sandbox-training`, text = JSON.stringify(copy);
  try {
    localStorage.setItem(key, text); localStorage.setItem(`${key}-start`, text); localStorage.setItem(SANDBOX_KEY, "training");
  } catch { toast("This browser doesn't have room for a practice copy. Try the sample church instead."); return; }
  history.replaceState(null, "", `${appPath()}#training`);
  location.reload();
};

// ----- The training checklist -----
// Each exercise reads the practice data for the church you're in: it's done when its number goes up (or its value
// changes) from where it stood when you began. Visiting a screen counts for the exercises that are about looking.
// In a shared training church, changes that arrive from teammates move the starting point instead of ticking yours.
const here = (st, cid, list) => (st[list] || []).filter((x) => x.churchId === cid);
const visited = (route) => (st, cid) => (st.training?.[cid]?.visited?.[route] ? 1 : 0);
const mine = (list) => (st, cid) => here(st, cid, list).filter((x) => x.by === st.me.id).length;
const TRAINING = [
  { area: "Everyone", items: [
    ["household", "Add someone to your household", "Me, Household", "household", "people", (st) => st.me.household.length],
    ["give", "Give a practice gift", "Give", "give", "give", mine("gifts")],
    ["event", "Sign up for an event", "Events, choose one, Sign up", "events", "calendar", (st, cid) => here(st, cid, "events").reduce((n, e) => n + (e.registrations || []).filter((r) => r.by === st.me.id).length, 0)],
    ["group", "Join a class or group", "Connect, Classes and groups", "classes", "people", (st, cid) => here(st, cid, "gatherings").reduce((n, g) => n + (g.members || []).filter((m) => m.userId === st.me.id).length, 0)],
    ["prayer", "Share a prayer request", "Connect, Prayer", "connect", "pray", mine("prayers")],
    ["notes", "Take notes on a sermon", "Word, open a sermon, Notes", "word", "note", (st) => Object.keys(st.notes || {}).length],
  ] },
  { area: "Church staff", items: [
    ["news", "Post an announcement", "Admin, Announcements, Add", "admin-news", "bell", (st, cid) => here(st, cid, "news").length],
    ["newevent", "Create an event", "Admin, Events, Add", "admin-events", "calendar", (st, cid) => here(st, cid, "events").length],
    ["banner", "Change the Home banner", "Admin, Home banner", "admin-banner", "star", (st, cid) => JSON.stringify(st.churches[cid]?.banner || null)],
    ["form", "Build a form", "Admin, Forms", "forms", "note", (st, cid) => here(st, cid, "forms").length],
    ["role", "Create a role", "Admin, Roles and permissions", "admin-roles", "key", (st, cid) => (st.churches[cid]?.roles || []).length],
    ["followup", "Look over follow-up for new people", "Admin, Follow-up", "followup", "people", visited("followup")],
  ] },
  { area: "Sunday", items: [
    ["song", "Add a song with sections", "Ministry tools, Songs", "songs", "music", (st, cid) => here(st, cid, "songs").length],
    ["plan", "Plan a service", "Ministry tools, Services", "services", "list", (st, cid) => JSON.stringify(here(st, cid, "services").map((p) => [p.id, (p.segments || []).length]))],
    ["schedule", "Schedule a volunteer", "Admin, Volunteer scheduling", "teams", "hand", (st, cid) => here(st, cid, "services").reduce((n, p) => n + (p.assignments || []).length, 0)],
    ["present", "Present a service", "Services, open one, Present", "services", "screen", visited("present")],
    ["checkin", "Check in a child at the kiosk", "Admin, Check-in kiosk", "kiosk", "kid", (st, cid) => here(st, cid, "checkins").length],
    ["sign", "Make a slide for the lobby screens", "Admin, Digital signage", "signs", "image", (st, cid) => JSON.stringify(here(st, cid, "signage"))],
  ] },
  { area: "Giving and reports", items: [
    ["processor", "Connect a payment processor (practice)", "Admin, Giving, Online payments", "admin-giving", "give", (st, cid) => (st.churches[cid]?.practicePayments || st.churches[cid]?.payments ? 1 : 0)],
    ["fund", "Add a giving fund", "Admin, Giving, Funds", "admin-giving", "give", (st, cid) => (st.churches[cid]?.funds || []).length],
    ["reports", "Read the reports", "Admin, Reports", "reports", "list", visited("reports")],
  ] },
];
const TRAINING_ITEMS = TRAINING.flatMap((g) => g.items);
/** Exercises counted from what the whole church has, which teammates' changes can move. The rest are yours alone. */
const SHARED_ITEMS = new Set(["news", "newevent", "banner", "form", "role", "song", "plan", "schedule", "checkin", "sign", "processor", "fund"]);

/** Where you train: a sandbox, a shared training church, or the checklist opened in the browser-only preview. */
const trainingHere = () => SANDBOX === "training" || isTrainingChurch() || (typeof Backend !== "undefined" && !Backend.on && !!S.state.training);
/** Your checklist for the church you're in: where each exercise stood at the start, screens visited, exercises done. */
function trainingState(cid = S.state.current) {
  const st = S.state;
  if (!st.training || st.training.base) st.training = {};   // an earlier one-church checklist starts over
  const t = (st.training[cid] ||= { base: null, visited: {}, done: {} });
  if (!t.base) { t.base = {}; TRAINING_ITEMS.forEach(([id, , , , , read]) => { t.base[id] = read(st, cid); }); }
  return t;
}
function trainingDone(id) {
  const t = trainingState(), item = TRAINING_ITEMS.find((x) => x[0] === id);
  if (t.done[id]) return true;
  const now = item[5](S.state, S.state.current), was = t.base[id];
  return typeof now === "number" ? now > (was || 0) : now !== was;
}
function trainingProgress() {
  return { done: TRAINING_ITEMS.filter(([id]) => trainingDone(id)).length, total: TRAINING_ITEMS.length };
}
// The first screen after the app opens, and screens redrawn for a teammate's change, move the starting points.
let trainingFresh = true, trainingRemote = false;

/** After each screen: note the visit, and cheer each exercise the moment it's done. */
function sandboxAfterRender(head) {
  if (!S.state.current || !trainingHere()) return;
  const t = trainingState(), cid = S.state.current;
  let changed = !t.visited[head];
  t.visited[head] = true;
  if (trainingFresh || trainingRemote) {
    trainingFresh = trainingRemote = false;
    TRAINING_ITEMS.forEach(([id, , , , , read]) => { if (!t.done[id] && SHARED_ITEMS.has(id)) t.base[id] = read(S.state, cid); });
    S.save(); return;
  }
  const fresh = TRAINING_ITEMS.filter(([id]) => !t.done[id] && trainingDone(id));
  fresh.forEach(([id]) => { t.done[id] = new Date().toISOString(); });
  if (fresh.length) {
    changed = true;
    const p = trainingProgress();
    toast(p.done === p.total ? "Training complete. Well done!" : `Done: ${fresh[0][1]}. ${p.done} of ${p.total}.`);
    const bar = $(".sandbox-bar .sb-acts a");
    if (bar) bar.textContent = `${p.done} of ${p.total} done`;
  }
  if (changed) S.save();
}

Screens.training = () => {
  if (!SANDBOX && typeof Backend !== "undefined" && Backend.on && !isTrainingChurch()) return { redirect: "me" };
  trainingState();
  const p = trainingProgress(), pct = Math.round((p.done / p.total) * 100);
  return {
    title: "Training", back: "me",
    body: html`<div class="panel train-head" style="margin-top:16px">
        <p style="margin-top:0">${isTrainingChurch() && !SANDBOX ? `${S.church().name} is your team's shared training church. What you do here, your teammates see too.` : S.state.sandbox?.copyOf ? `This is a practice copy of ${S.state.sandbox.copyOf}.` : "This is a sample church, and you're its primary account holder."} Try each exercise; it ticks itself off when you've done it. Nothing here reaches anyone's real data, and no money moves.</p>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-label="Exercises done"><i style="width:${pct}%"></i></div>
        <p class="faint" style="margin-bottom:0">${p.done} of ${p.total} done${p.done === p.total ? ". You've tried everything." : ""}</p></div>
      ${TRAINING.map((g) => html`<section class="sec"><h2 class="sec-head">${g.area}</h2><div class="rows">${g.items.map(([id, title, where, go, ic]) => {
        const done = trainingDone(id);
        return html`<a class="row train-row ${done ? "done" : ""}" href="#${go}"><span class="lead-ic">${icon(done ? "check" : ic)}</span>
          <span class="body"><span class="t">${title}</span><span class="s">${where}</span></span>${done ? html`<span class="tag ok">Done</span>` : icon("chev")}</a>`;
      })}</div></section>`)}
      ${SANDBOX ? html`<section class="sec"><div class="rows">
        <button type="button" class="row" data-act="sandbox-reset"><span class="lead-ic">${icon("x")}</span><span class="body"><span class="t">Start over</span><span class="s">Clear what you changed and the checklist</span></span></button>
      </div></section>` : isTrainingChurch() && S.can("manage.church") ? html`<p class="faint" style="text-align:center">To start the whole church fresh, go to Admin, Training church.</p>` : ""}`,
  };
};
