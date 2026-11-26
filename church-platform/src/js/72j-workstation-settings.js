// ---------- Workstation settings: my PIN and lock time, and the church's rules ----------
// Me, Church computers (#computers): set or change your 6-digit PIN for this church's workstations, and, if the church
// lets you, a shorter lock time for yourself. Admin, Workstations, PINs and auto-lock (#admin-signin): the church's
// lock limit for everyone, limits per role and per person, who may choose their own, everyone's PINs, and recent
// sign-ins. Rules and checks on the server: upgrade-30.sql.

const pinTooEasy = (p) => /^(\d)\1{5}$/.test(p) || "01234567890123456789".includes(p) || "98765432109876543210".includes(p);
const minutesText = (m) => (m % 60 === 0 && m >= 60 ? plural(m / 60, "hour") : plural(m, "minute"));
const myWs = { pin: null, loading: false };
async function myPinLoad() {
  if (myWs.loading) return; myWs.loading = true;
  if (Backend.on) { const { data } = await Backend.client.rpc("my_pin", { c: S.state.current }); myWs.pin = data || { set: false, enabled: true }; }
  else { const p = wsPins()[S.me().id]; myWs.pin = { set: !!p?.pin, enabled: p?.enabled !== false, set_at: p?.at }; }
  myWs.loading = false; if (location.hash === "#computers") render();
}

Screens.computers = () => {
  if (!S.isMember() || thisDevice()) return { redirect: "me" };
  if (myWs.pin === null) myPinLoad();
  const lim = lockLimit(), p = myWs.pin;
  return {
    title: "Church computers", back: "me", after: () => { if (myWs.pin === null) myPinLoad(); },
    body: html`<p class="muted" style="margin-top:16px">${S.church().name}'s shared computers (the office, the security desk, the counting room) show a lock screen. Pick your name, type your PIN, and the app opens as you, with what your role allows. Lock it when you're done; it also locks itself when nobody uses it.</p>
      <section class="sec"><h2 class="sec-head">Your PIN</h2>
        ${p === null ? html`<p class="muted">Loading…</p>` : !p.enabled ? html`<div class="panel"><p>${S.church().name} has switched off computer sign-in for you. Ask an admin if you need it.</p></div>` : html`
        <p class="muted">${p.set ? `Your PIN is set${p.set_at ? `, since ${fmtDay(new Date(p.set_at))}` : ""}. Your name shows on the lock screen.` : "You don't have a PIN yet, so your name isn't on the lock screen."}</p>
        <form class="panel" data-form="my-pin" novalidate autocomplete="off">
          <div class="bc-grid"><label class="field"><span>${p.set ? "New PIN" : "PIN"}</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label>
            <label class="field"><span>Again</span><input name="again" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required></label></div>
          <small class="faint">6 digits. Not one digit repeated, and not counting up or down. Don't use your bank or phone PIN.</small>
          <div class="btns"><button class="btn">${icon("lock")}${p.set ? "Change PIN" : "Set PIN"}</button>${p.set ? html`<button type="button" class="btn ghost" data-act="my-pin-remove">Remove my PIN</button>` : ""}</div>
        </form>`}
      </section>
      <section class="sec"><h2 class="sec-head">Lock after</h2>
        ${lim.may ? html`<form class="panel" data-form="my-lock" novalidate>
          <label class="field"><span>Lock a shared computer after I've been away for</span><select name="minutes">
            <option value="">${minutesText(lim.cap)} (the most ${S.church().name} allows)</option>
            ${LOCK_CHOICES.filter((m) => m < lim.cap).map((m) => html`<option value="${m}" ${attr(lim.mine === m, "selected")}>${minutesText(m)}</option>`)}</select></label>
          <div class="btns"><button class="btn ghost">Save</button></div></form>`
        : html`<p class="muted">${S.church().name} locks shared computers after ${minutesText(lim.cap)} without activity.</p>`}
      </section>`,
  };
};
Forms["my-pin"] = async (d, f) => {
  if (!/^\d{6}$/.test(d.pin)) return formError(f, "A PIN is 6 digits.");
  if (d.pin !== d.again) return formError(f, "The two PINs don't match.");
  if (pinTooEasy(d.pin)) return formError(f, "That PIN is too easy to guess. Avoid repeated digits and counting up or down.");
  if (Backend.on) { const { error } = await Backend.client.rpc("set_my_pin", { c: S.state.current, pin: d.pin }); if (error) return formError(f, error.message); }
  else { wsPins()[S.me().id] = { pin: d.pin, enabled: true, at: new Date().toISOString() }; S.save(); }
  toast("PIN saved"); myWs.pin = null; f.reset(); render();
};
Actions["my-pin-remove"] = async () => {
  if (Backend.on) { const { error } = await Backend.client.rpc("remove_my_pin", { c: S.state.current }); if (error) return toast(error.message); }
  else { delete wsPins()[S.me().id]; S.save(); }
  toast("PIN removed"); myWs.pin = null; render();
};
Forms["my-lock"] = async (d, f) => {
  const minutes = d.minutes ? +d.minutes : null;
  if (Backend.on) { const { error } = await Backend.client.rpc("set_my_lock_minutes", { c: S.state.current, minutes }); if (error) return formError(f, error.message); }
  const t = S.church().timeouts ||= {}, people = t.people ||= {}, me = people[S.me().id] ||= {};
  if (minutes) me.mine = minutes; else delete me.mine;
  if (!Backend.on) S.save();
  toast("Saved"); render();
};

// ----- Admin -----
const wsAdmin = { pins: null, signins: null, loading: false };
async function wsAdminLoad() {
  if (wsAdmin.loading || !S.can("manage.people")) return; wsAdmin.loading = true;
  if (Backend.on) {
    const [{ data: pins }, { data: signins }] = await Promise.all([Backend.client.rpc("workstation_pins_list", { c: S.state.current }), Backend.client.rpc("workstation_signins_list", { c: S.state.current, lim: 25 })]);
    wsAdmin.pins = pins || []; wsAdmin.signins = signins || [];
  } else {
    wsAdmin.pins = Object.entries(wsPins()).map(([user_id, p]) => ({ user_id, enabled: p.enabled !== false, set_at: p.at, locked_until: null }));
    wsAdmin.signins = (S.state.wsSignins || []).filter((s) => s.church === S.state.current).slice(0, 25).map((s) => ({ ...s, name: S.userName(s.user_id) }));
  }
  wsAdmin.loading = false; if (location.hash === "#admin-signin") render();
}

Screens["admin-signin"] = () => {
  if (!S.isMember() || !S.canAny(["manage.church", "manage.people"])) return { redirect: "admin" };
  if (wsAdmin.pins === null) wsAdminLoad();
  const c = S.church(), t = c.timeouts || {}, master = +t.master || 60, rules = S.can("manage.church");
  const people = Object.entries(t.people || {}).filter(([, p]) => p.minutes || p.adjust != null);
  const opt = (v, cur, label) => html`<option value="${v}" ${attr(String(cur ?? "") === String(v), "selected")}>${label}</option>`;
  const minutesSel = (name, cur) => html`<select name="${name}" ${attr(!rules, "disabled")} aria-label="Locks after">${opt("", cur, "Church limit")}${LOCK_CHOICES.filter((m) => m < master).map((m) => opt(m, cur, minutesText(m)))}</select>`;
  const adjustSel = (name, cur) => html`<select name="${name}" ${attr(!rules, "disabled")}>${opt("", cur == null ? "" : cur, "Default")}${opt("yes", cur === true ? "yes" : "", "May shorten")}${opt("no", cur === false ? "no" : "", "Can't change")}</select>`;
  const devs = S.list("devices").filter((d) => d.type === "workstation");
  const pinFor = (id) => wsAdmin.pins?.find((p) => p.user_id === id);
  return {
    title: "Workstations, PINs and auto-lock", back: "admin",
    body: html`<p class="muted" style="margin-top:16px">A workstation is a shared computer (the office, the security desk, the counting room) that people sign in to with their name and a PIN. ${devs.length ? `${S.church().name} has ${plural(devs.length, "workstation")}.` : "Pair one under Screens and devices: Add a device, Workstation."} <a href="#devices">Screens and devices</a></p>
      <section class="sec"><h2 class="sec-head">Automatic lock</h2>
        <form class="panel" data-form="admin-locks" novalidate>
          <label class="field"><span>Lock a workstation when nobody has used it for</span><select name="master" ${attr(!rules, "disabled")}>${LOCK_CHOICES.map((m) => opt(m, master, minutesText(m)))}</select>
            <small>The most anyone can have. Only admins with Church account, features and defaults change it.</small></label>
          <label class="check"><input type="checkbox" name="adjust" ${attr(t.adjust !== false, "checked")} ${attr(!rules, "disabled")}><span>People may choose a shorter time for themselves (under Me, Church computers)</span></label>
          <h3 class="sub-head">By role</h3>
          <div class="lock-grid" role="table" aria-label="Lock time by role"><span role="columnheader">Role</span><span role="columnheader">Locks after</span><span role="columnheader">Their own choice</span>
            ${c.roles.map((r) => html`<span role="cell"><b>${r.name}</b></span><span role="cell">${minutesSel(`role-min-${r.id}`, t.roles?.[r.id]?.minutes)}</span><span role="cell">${adjustSel(`role-adj-${r.id}`, t.roles?.[r.id]?.adjust)}</span>`)}</div>
          <h3 class="sub-head">For particular people</h3>
          ${people.length ? html`<div class="lock-grid" role="table" aria-label="Lock time for particular people"><span role="columnheader">Person</span><span role="columnheader">Locks after</span><span role="columnheader">Their own choice</span>
            ${people.map(([id, p]) => html`<span role="cell"><b>${S.userName(id)}</b> ${rules ? html`<button type="button" class="linkish" data-act="lock-person-remove" data-id="${id}">Remove</button>` : ""}</span><span role="cell">${minutesSel(`p-min-${id}`, p.minutes)}</span><span role="cell">${adjustSel(`p-adj-${id}`, p.adjust)}</span>`)}</div>` : html`<p class="faint">Nobody has a setting of their own. A person's setting wins over their role's.</p>`}
          ${rules ? html`<div class="lock-add"><select name="add" aria-label="Add a person"><option value="">Add a person…</option>${S.members().filter((m) => !t.people?.[m.userId]?.minutes && t.people?.[m.userId]?.adjust == null).map((m) => html`<option value="${m.userId}">${S.userName(m.userId)}</option>`)}</select></div>
          <div class="btns"><button class="btn">Save</button></div>` : ""}
        </form></section>
      ${S.can("manage.people") ? html`<section class="sec"><h2 class="sec-head">PINs</h2>
        ${wsAdmin.pins === null ? html`<p class="muted">Loading…</p>` : html`<div class="rows">${S.members().map((m) => { const p = pinFor(m.userId), locked = p?.locked_until && new Date(p.locked_until) > new Date();
          return html`<div class="row"><span class="lead-ic">${icon("lock")}</span><span class="body"><span class="t">${S.userName(m.userId)}</span>
            <span class="s">${!p ? "No PIN" : !p.enabled ? "Switched off" : `PIN set${p.set_at ? ` ${fmtDay(new Date(p.set_at))}` : ""}${locked ? `, locked until ${fmtClock(new Date(p.locked_until))}` : ""}`}</span></span>
            <span class="row-acts">${locked ? html`<button class="btn ghost sm" data-act="pin-admin" data-id="${m.userId}" data-what="unlock">Unlock</button>` : ""}
              ${p?.enabled ? html`<button class="btn ghost sm" data-act="pin-admin" data-id="${m.userId}" data-what="clear">Clear PIN</button>` : ""}
              ${p && !p.enabled ? html`<button class="btn ghost sm" data-act="pin-admin" data-id="${m.userId}" data-what="enable">Switch on</button>` : html`<button class="btn ghost sm" data-act="pin-admin" data-id="${m.userId}" data-what="disable">Switch off</button>`}</span></div>`; })}</div>`}
        <p class="faint">People set their own PIN under Me, Church computers. Clearing a PIN takes their name off the lock screen until they set a new one; switching someone off stops them setting one.</p></section>
      <section class="sec"><h2 class="sec-head">Recent sign-ins</h2>
        ${!wsAdmin.signins?.length ? html`<p class="faint">${wsAdmin.signins === null ? "Loading…" : "Nobody has signed in on a workstation yet."}</p>`
          : html`<div class="rows">${wsAdmin.signins.map((s) => html`<div class="row"><span class="lead-ic">${icon("clock")}</span><span class="body"><span class="t">${s.name || S.userName(s.user_id)}</span><span class="s">${fmtWhen(s.at)}${s.device_id && S.get("devices", s.device_id) ? `, ${S.get("devices", s.device_id).name}` : ""}</span></span></div>`)}</div>`}</section>` : ""}`,
  };
};
Forms["admin-locks"] = (d, f, fd) => {
  if (!S.can("manage.church")) return;
  const c = S.church(), old = c.timeouts || {}, master = +d.master || 60;
  const adj = (v) => (v === "yes" ? true : v === "no" ? false : undefined);
  const roles = {};
  for (const r of c.roles) { const minutes = +d[`role-min-${r.id}`] || undefined, adjust = adj(d[`role-adj-${r.id}`]); if (minutes || adjust != null) roles[r.id] = { minutes, adjust }; }
  const people = {};
  for (const [id, p] of Object.entries(old.people || {})) {
    const minutes = fd.has(`p-min-${id}`) ? +d[`p-min-${id}`] || undefined : p.minutes, adjust = fd.has(`p-adj-${id}`) ? adj(d[`p-adj-${id}`]) : p.adjust;
    if (minutes || adjust != null || p.mine) people[id] = { minutes, adjust, mine: p.mine };
  }
  if (d.add) people[d.add] = { ...(people[d.add] || {}), minutes: Math.min(master, 30) };
  S.updateChurch({ timeouts: JSON.parse(JSON.stringify({ master, adjust: !!d.adjust, roles, people })) });
  toast("Saved"); render();
};
Actions["lock-person-remove"] = (el) => {
  const t = S.church().timeouts || {}, p = t.people?.[el.dataset.id];
  if (p) { delete p.minutes; delete p.adjust; if (!p.mine) delete t.people[el.dataset.id]; S.updateChurch({ timeouts: t }); }
  render();
};
Actions["pin-admin"] = async (el) => {
  const who = el.dataset.id, what = el.dataset.what;
  if (Backend.on) { const { error } = await Backend.client.rpc("workstation_pin_admin", { c: S.state.current, who, what }); if (error) return toast(error.message); }
  else {
    const pins = wsPins();
    if (what === "clear") delete pins[who]; else if (what === "disable") pins[who] = { enabled: false }; else if (what === "enable") delete pins[who];
    S.save();
  }
  toast({ clear: "PIN cleared", disable: "Switched off", enable: "Switched on", unlock: "Unlocked" }[what]); wsAdmin.pins = null; wsAdminLoad();
};
window.addEventListener("hashchange", () => { if (location.hash === "#admin-signin") { wsAdmin.pins = null; wsAdmin.signins = null; } if (location.hash === "#computers") myWs.pin = null; });
