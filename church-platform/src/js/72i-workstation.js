// ---------- Workstations: shared church computers with name-and-PIN sign-in ----------
// A workstation is a computer paired under Devices (the church office, the security desk, the counting room). Paired,
// it shows a lock screen: pick your name, type your 6-digit PIN, and use the app as yourself with your own role.
// "Lock" (or the church's idle limit) signs you out and the computer goes back to the lock screen, still paired.
// The server side is upgrade-30.sql and supabase/functions/workstation.
//
// While someone is signed in on a workstation, localStorage "ofc-ws" says who, on which workstation, and when they
// last did anything, so a closed and reopened browser still locks on time. With Supabase, the person's own session
// replaces the workstation's, and locking signs them out and signs the workstation back in with its saved sign-in.
// In the preview (no server), PINs are kept in the preview's data and signing in swaps who "me" is.

const WS_KEY = "ofc-ws";
const LOCK_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 480];
const Workstation = {
  get() { try { return JSON.parse(localStorage.getItem(WS_KEY) || "null"); } catch { return null; } },
  put(v) { try { v ? localStorage.setItem(WS_KEY, JSON.stringify(v)) : localStorage.removeItem(WS_KEY); } catch { /* private mode */ } },
  /** Who is signed in on this workstation right now, if anyone. */
  person() { const w = this.get(); return w && (Backend.on ? Backend.user?.id === w.userId : !!wsDemo && S.me().id === w.userId) ? w : null; },
};
// In the preview, every tab shares one saved copy, so the person signed in on a workstation tab is kept in that tab
// only: the saved copy keeps the tab's own "me" (S.flush), and copies saved by other tabs are re-applied (wsAfterLoad).
let wsDemo = null;

/** The lock limit for someone: the church's limit, a shorter one for their role or for them, and their own choice. */
function lockLimit(userId = S.me().id, cid = S.state.current) {
  const c = S.church(cid), t = c?.timeouts || {}, master = +t.master || 60;
  const roleId = S.membership(cid, userId)?.roleId, p = t.people?.[userId] || {}, r = t.roles?.[roleId] || {};
  const cap = Math.min(master, +(p.minutes ?? r.minutes ?? master) || master);
  const may = p.adjust ?? r.adjust ?? (t.adjust ?? true);
  return { master, cap, may: !!may, minutes: may && +p.mine ? Math.min(+p.mine, cap) : cap, mine: +p.mine || 0 };
}

// ----- The lock screen -----
const wsLock = { people: null, loading: false, error: "", pick: "" };
async function wsLoadPeople() {
  if (wsLock.loading) return; wsLock.loading = true;
  try {
    if (Backend.on) wsLock.people = (await Backend.call("workstation", { action: "people", churchId: S.state.current })).people;
    else wsLock.people = demoWsPeople();
  } catch (e) { wsLock.people = []; wsLock.error = e.message; }
  wsLock.loading = false;
  if (location.hash === "#workstation") render();
}
const wsPins = () => (S.state.wsPins ||= {})[S.state.current] ||= {};
function demoWsPeople() {
  return Object.entries(wsPins()).filter(([, p]) => p.enabled !== false && p.pin).map(([id]) => ({ id, name: S.userName(id), role: S.role(S.state.current, id)?.name || "" }))
    .filter((p) => S.membership(S.state.current, p.id)).sort((a, b) => a.name.localeCompare(b.name));
}

Screens.workstation = () => {
  const d = thisDevice();
  if (d?.type !== "workstation") return { redirect: "home" };
  if (wsLock.people === null) wsLoadPeople();
  const c = S.church(), people = wsLock.people || [];
  return {
    page: html`<main class="ws-lock">
      <div class="ws-card">
        <div class="ws-church">${churchMark(c, 56)}<div><b>${c?.name || ""}</b><span class="faint">${d.name}${d.locationId ? `, ${locName(d.locationId)}` : ""}</span></div></div>
        <p class="ws-clock" data-ws-clock>${fmtClock(new Date())}</p>
        <form data-form="ws-unlock" novalidate class="ws-form">
          <label class="field"><span>Who's signing in?</span>
            <select name="who" required ${attr(!people.length, "disabled")}><option value="">${wsLock.people === null ? "Loading names…" : people.length ? "Choose your name" : "Nobody has a PIN yet"}</option>
              ${people.map((p) => html`<option value="${p.id}" ${attr(p.id === wsLock.pick, "selected")}>${p.name}${p.role ? ` · ${p.role}` : ""}</option>`)}</select></label>
          <label class="field"><span>PIN</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="6 digits" ${attr(!people.length, "disabled")}></label>
          <div class="btns"><button class="btn block" ${attr(!people.length, "disabled")}>${icon("lock")}Sign in</button></div>
          ${wsLock.error ? html`<p class="err" role="alert">${wsLock.error}</p>` : ""}
        </form>
        <p class="faint ws-help">To use this computer, set a PIN in the app on your phone: <b>Me, Church computers</b>.</p>
      </div>
      ${deviceExitBtn()}</main>`,
    after() { clearInterval(wsClockTimer); wsClockTimer = setInterval(() => { const el = $("[data-ws-clock]"); if (el) el.textContent = fmtClock(new Date()); else clearInterval(wsClockTimer); }, 15e3); $("select[name=who]")?.value ? $("input[name=pin]")?.focus() : $("select[name=who]")?.focus(); },
  };
};
let wsClockTimer = null;

Forms["ws-unlock"] = async (d, f) => {
  const dev = thisDevice(); if (dev?.type !== "workstation") return;
  wsLock.pick = d.who;
  if (!d.who) return formError(f, "Choose your name.");
  if (!/^\d{6}$/.test(d.pin || "")) return formError(f, "Type your 6-digit PIN.");
  const person = (wsLock.people || []).find((p) => p.id === d.who);
  const since = Date.now(), rec = { userId: d.who, name: person?.name || "", device: dev.id, deviceName: dev.name, church: S.state.current, since, active: since, limit: lockLimit(d.who).minutes };
  if (!Backend.on) {
    const p = wsPins()[d.who];
    if (!p || p.enabled === false || p.pin !== d.pin) { wsLock.error = "That PIN didn't match."; return render(); }
    Workstation.put(rec);
    (S.state.wsSignins ||= []).unshift({ church: S.state.current, user_id: d.who, device_id: dev.id, at: new Date().toISOString() });
    wsBecome(d.who); S.save(); wsLock.error = ""; f.reset();
    return go("home");
  }
  try {
    const { tokenHash } = await Backend.call("workstation", { action: "unlock", churchId: S.state.current, userId: d.who, pin: d.pin });
    Workstation.put(rec);
    // The one-time sign-in from the server; newer Supabase Auth also takes it as type "email".
    let { error } = await Backend.client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error) ({ error } = await Backend.client.auth.verifyOtp({ token_hash: tokenHash, type: "email" }));
    if (error) { Workstation.put(null); throw error; }
    location.hash = "#home"; location.reload();
  } catch (e) { wsLock.error = e.message; f.querySelector("[name=pin]").value = ""; render(); }
};

/** In the preview: act as another person in this tab (the tab's own "me" is kept aside until the lock). */
function wsPersona(userId) {
  const u = S.state.users[userId] || {};
  return { email: "", phone: "", ...u, household: Array.isArray(u.household) ? u.household : [], pickups: Array.isArray(u.pickups) ? u.pickups : [], id: userId, name: S.userName(userId) };
}
function wsBecome(userId) {
  if (S.state.me.id === userId) return;
  wsDemo = { orig: S.state.me, userId };
  S.state.me = wsPersona(userId);
  document.body.classList.remove("device-mode");
}
function wsAfterLoad() { if (wsDemo) { wsDemo.orig = S.state.me; S.state.me = wsPersona(wsDemo.userId); } }

/** Signs the person out of the workstation. The computer goes back to the lock screen, still paired. */
async function wsLockNow(why = "") {
  const w = Workstation.get(); if (!w) return;
  Workstation.put(null); wsLock.people = null; wsLock.pick = ""; wsLock.error = why === "idle" ? `${w.name ? `${w.name} was` : "You were"} signed out after ${plural(w.limit || lockLimit(w.userId).minutes, "minute")} without activity.` : "";
  $("#ws-bar")?.remove(); $("#ws-warn")?.remove();
  if (!Backend.on) {
    if (wsDemo) { S.state.me = wsDemo.orig; wsDemo = null; }
    return go("workstation");
  }
  try { sessionStorage.setItem("ofc-ws-why", wsLock.error); } catch { /* private mode */ }
  await Backend.client.auth.signOut({ scope: "local" }).catch(() => {});
  location.hash = "#workstation"; location.reload();
}
try { const why = sessionStorage.getItem("ofc-ws-why"); if (why) { wsLock.error = why; sessionStorage.removeItem("ofc-ws-why"); } } catch { /* private mode */ }
Actions["ws-lock"] = () => wsLockNow();
Actions["ws-stay"] = () => { wsTouch(true); $("#ws-warn")?.remove(); };

// ----- While someone is signed in: the bar, activity and the idle lock -----
let wsLastWrite = 0;
function wsTouch(force) {
  const w = Workstation.person(); if (!w) return;
  w.active = Date.now();
  if (force || w.active - wsLastWrite > 10e3) { wsLastWrite = w.active; Workstation.put({ ...w, limit: lockLimit(w.userId).minutes }); }
}
for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(ev, () => { if (!$("#ws-warn")) wsTouch(); }, { passive: true, capture: true });
addEventListener("mousemove", () => { if (!$("#ws-warn")) wsTouch(); }, { passive: true });
setInterval(() => {
  const w = Workstation.person(); if (!w) return;
  const limit = lockLimit(w.userId).minutes * 60e3, idle = Date.now() - (Workstation.get()?.active || w.active);
  if (idle >= limit) return wsLockNow("idle");
  const left = Math.ceil((limit - idle) / 1000);
  if (left <= 60) {
    if (!$("#ws-warn")) document.body.insertAdjacentHTML("beforeend", flat(html`<div id="ws-warn" class="ws-warn" role="alertdialog" aria-live="assertive" aria-label="About to lock">
      <p><b>Still there?</b> This computer locks in <span data-ws-left>${left}</span> seconds.</p><div class="btns"><button class="btn" data-act="ws-stay">Stay signed in</button><button class="btn ghost" data-act="ws-lock">${icon("lock")}Lock now</button></div></div>`));
    const s = $("[data-ws-left]"); if (s) s.textContent = left;
  } else $("#ws-warn")?.remove();
}, 1000);
/** The bar along the bottom while someone is signed in on a workstation: who, and Lock. */
function wsBar() {
  const w = Workstation.person();
  if (!w) { $("#ws-bar")?.remove(); return; }
  const out = flat(html`<div id="ws-bar" class="ws-bar" role="region" aria-label="Signed in on this computer">${icon("lock")}<span><b>${S.me().name || w.name}</b> on ${w.deviceName || "this computer"} · locks after ${plural(lockLimit(w.userId).minutes, "minute")} idle</span><button class="btn sm" data-act="ws-lock">Lock</button></div>`);
  const bar = $("#ws-bar"); if (bar) { if (bar.outerHTML !== out) bar.outerHTML = out; } else document.body.insertAdjacentHTML("beforeend", out);
}
// A browser reopened long after someone left locks before showing anything of theirs.
setTimeout(() => {
  const w = Workstation.get();
  if (!w) return;
  if (!Backend.on) { if (!wsDemo && thisDevice()?.id === w.device) Workstation.put(null); return; }   // a reloaded preview tab starts at the lock screen
  if (Date.now() - (w.active || 0) > (w.limit || 60) * 60e3) wsLockNow("idle");
}, 0);
