// ---------- Shared training churches ----------
// A training church is a practice church a whole team shares on the live app: everyone sees each other's changes, on
// any device. It's a real church in the database with data.training set, so every feature works, but no money moves
// (it can't connect a payment processor), nothing reaches the real church, its webhooks and text-to-give stay off,
// and it's hidden from Find your church. The real church points to it with data.trainingChurch.
// Its administrators can reset it to fresh content: sample content, or a copy of the real church's setup.

const isTrainingChurch = (c = S.church()) => !!c?.training;
/** The real church's training church, if it has one and it's loaded. */
const trainingChurchOf = (c = S.church()) => (c?.trainingChurch ? S.church(c.trainingChurch) || { id: c.trainingChurch, name: "Training church", missing: true } : null);
/** Practice: the browser-only sandboxes and shared training churches. Payment processors connect in name only. */
const practiceMode = (c = S.church()) => !!SANDBOX || isTrainingChurch(c);

// What a copy of the real church brings over: its content and settings, but nothing personal. No people, gifts,
// prayers, messages, check-ins, sign-ups, form answers or sermon drafts, and none of its connections to the outside.
const TRAINING_COPY_KINDS = ["sermons", "events", "news", "gatherings", "plans", "songs", "library", "services", "layouts", "savedBlocks", "forms", "signage"];
const TRAINING_EMPTY_FIELDS = { events: "registrations", gatherings: "members", services: "assignments" };
const TRAINING_SKIP_SETTINGS = ["id", "name", "handle", "ownerId", "previousOwner", "sample", "payments", "stripe", "practicePayments", "textGive", "integrations",
  "podcast", "trainingChurch", "training", "created", "roles", "locations", "defaults"];

/** Gives every record a new ID (IDs are shared across churches) and points everything that referred to the old IDs at the new ones. */
function remapIds(value, map) {
  const fix = (s) => {
    if (map.has(s)) return map.get(s);
    const i = s.indexOf("~");   // sign-ups and other parts are "<parent>~<person>"
    return i > 0 && map.has(s.slice(0, i)) ? map.get(s.slice(0, i)) + s.slice(i) : s;
  };
  const walk = (v) => typeof v === "string" ? fix(v) : Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [fix(k), walk(x)])) : v;
  return walk(value);
}

/** The settings, locations and records to fill a training church with, from the sample church or a copy of the real one. */
function trainingContent(tid, source, realId) {
  let src, kinds, records;
  if (source === "copy") {
    src = S.church(realId); kinds = TRAINING_COPY_KINDS;
    records = Object.fromEntries(kinds.map((k) => [k, (S.state[k] || []).filter((r) => r.churchId === realId)
      .map((r) => (TRAINING_EMPTY_FIELDS[k] ? { ...r, [TRAINING_EMPTY_FIELDS[k]]: [] } : r))]));
  } else {
    const seed = buildSeed(); src = seed.churches.riverside; kinds = RECORD_KINDS;
    records = Object.fromEntries(kinds.map((k) => [k, (seed[k] || []).filter((r) => r.churchId === src.id)]));
  }
  const map = new Map([[src.id, tid]]);
  (src.locations || []).forEach((l) => map.set(l.id, `${tid}-${slugify(l.code || l.name || l.id.split("-").pop()) || uid()}`));
  kinds.forEach((k) => records[k].forEach((r) => map.set(r.id, `t${uid()}`)));
  const settings = Object.fromEntries(Object.entries(src).filter(([k]) => !TRAINING_SKIP_SETTINGS.includes(k)));
  return {
    settings: remapIds(JSON.parse(JSON.stringify(settings)), map),
    roles: JSON.parse(JSON.stringify(src.roles || defaultRoles())),
    locations: remapIds(JSON.parse(JSON.stringify(src.locations || [])), map),
    records: remapIds(JSON.parse(JSON.stringify(records)), map),
  };
}
/** Puts content into the training church in this browser; syncing saves it to the database. */
function fillTrainingChurch(tid, content) {
  const c = S.church(tid), keep = { name: c.name, color: c.color, logo: c.logo, defaults: c.defaults, training: c.training };
  Object.assign(c, content.settings, keep);
  c.locations = [...content.locations, ...c.locations.filter((l) => !content.locations.some((x) => x.id === l.id))];
  content.roles.forEach((r) => { if (!c.roles.some((x) => x.id === r.id)) c.roles.push(r); });
  for (const [k, list] of Object.entries(content.records)) (S.state[k] ||= []).push(...list);
}

async function createTrainingChurch({ source, joinRole, name }) {
  const real = S.church(), realId = real.id;
  const t = S.createChurch({ name, handle: `${real.handle}-training`, color: real.color, locations: [] });
  const content = trainingContent(t.id, source, realId);
  fillTrainingChurch(t.id, content);
  t.training = { of: realId, ofName: real.name, source, at: new Date().toISOString(), by: S.me().id };
  t.defaults = { ...t.defaults, roleId: joinRole === "member" ? "member" : "admin", locations: t.locations.map((l) => l.id) };
  t.logo = real.logo || "";
  S.church(realId).trainingChurch = t.id;
  S.state.current = t.id;
  S.save();
  if (typeof Backend !== "undefined" && Backend.on) { clearTimeout(Backend.timer); await Backend.flush(); }
  return t;
}
async function resetTrainingChurch(tid, source) {
  const t = S.church(tid);
  if (typeof Backend !== "undefined" && Backend.on) {
    const { error } = await Backend.client.rpc("reset_training_church", { c: tid });
    if (error) throw new Error(error.message);
    await Backend.pull();
  } else for (const k of RECORD_KINDS) if (Array.isArray(S.state[k])) S.state[k] = S.state[k].filter((r) => r.churchId !== tid);
  fillTrainingChurch(tid, trainingContent(tid, source, S.church(tid).training.of));
  if (S.state.training) delete S.state.training[tid];   // everyone's checklist starts over with the fresh content
  S.save();
  if (typeof Backend !== "undefined" && Backend.on) { clearTimeout(Backend.timer); await Backend.flush(); }
  return t;
}
async function deleteTrainingChurch(tid) {
  const realId = S.church(tid)?.training?.of;
  if (typeof Backend !== "undefined" && Backend.on) {
    const { error } = await Backend.client.from("churches").delete().eq("id", tid);
    if (error) throw new Error(error.message);
  }
  delete S.state.churches[tid];
  S.state.memberships = S.state.memberships.filter((m) => m.churchId !== tid);
  for (const k of RECORD_KINDS) if (Array.isArray(S.state[k])) S.state[k] = S.state[k].filter((r) => r.churchId !== tid);
  if (realId && S.church(realId)) { delete S.church(realId).trainingChurch; S.state.current = realId; }
  else S.state.current = S.myChurches()[0]?.id || null;
  S.save();
  if (typeof Backend !== "undefined" && Backend.on) { clearTimeout(Backend.timer); await Backend.flush(); }
}

const trainingInvite = (tid) => `${location.origin}${location.pathname}#church-${tid}`;

/** The strip at the top of every screen in a training church. */
function trainingChurchBar(c) {
  const p = trainingProgress();
  return html`<div class="sandbox-bar training-bar" role="note"><span class="sb-tag">Training church</span>
    <span class="sb-text">Shared with your team. Nothing here reaches ${c.training.ofName || "your church"}, and no money moves.</span>
    <span class="sb-acts"><a href="#training">${p.done} of ${p.total} done</a>${S.church(c.training.of) ? html`<button type="button" data-act="switch-church" data-id="${c.training.of}">Back to your church</button>` : ""}</span></div>`;
}

// ----- Admin, Training church: create one from the real church, or manage the one you're in -----
AdminScreens.training = () => {
  const c = S.church();
  if (isTrainingChurch(c)) {
    const blocked = guard("manage.church"); if (blocked) return blocked;
    const members = S.members(c.id).length;
    return {
      title: "Training church", back: "admin",
      body: html`<section class="sec" style="margin-top:12px"><div class="panel">
          <p style="margin-top:0"><b>${c.name}</b> is a shared practice copy for ${c.training.ofName || "your church"}'s team. ${plural(members, "person", "people")} ${members === 1 ? "has" : "have"} joined. People who join are ${c.defaults.roleId === "admin" ? "administrators, so they can practise everything" : "members; give them roles under People"}.</p>
          <label class="field"><span>Invite link</span><input type="text" readonly value="${trainingInvite(c.id)}"></label>
          <div class="btns"><button type="button" class="btn sm" data-act="copy" data-text="${trainingInvite(c.id)}" data-done="Invite link copied">${icon("copy")}Copy invite link</button>
            <a class="btn ghost sm" href="#qr">${icon("qr")}QR codes</a></div>
          <p class="faint">Anyone with the link can join. Change what new people get under Features and defaults.</p></div></section>
        <section class="sec"><h2 class="sec-head">Start fresh</h2><form data-form="training-reset" class="panel" novalidate>
          <p style="margin-top:0">Clears everything the team added (events, services, gifts, prayers, check-ins, messages) and fills the church again. People and roles stay. Everyone's checklist starts over.</p>
          ${trainingSourcePicker(c.training.source || "sample", c.training.ofName)}
          <button class="btn danger">Reset the training church</button></form></section>
        ${S.isPrimary() ? html`<section class="sec"><div class="rows"><button type="button" class="row" data-act="training-delete"><span class="lead-ic">${icon("trash")}</span><span class="body"><span class="t">Delete the training church</span><span class="s">For everyone on the team. ${c.training.ofName || "The real church"} isn't affected.</span></span></button></div></section>` : ""}`,
    };
  }
  const blocked = guard("manage.church"); if (blocked) return blocked;
  const t = trainingChurchOf(c);
  return {
    title: "Training church", back: "admin",
    body: t ? html`<section class="sec" style="margin-top:12px"><div class="panel">
        <p style="margin-top:0"><b>${t.name}</b> is ${c.name}'s shared training church. Your team practises there together, on any device, without touching ${c.name}'s real data.</p>
        <label class="field"><span>Invite link</span><input type="text" readonly value="${trainingInvite(t.id)}"></label>
        <div class="btns">${S.isMember(t.id) ? html`<button type="button" class="btn sm" data-act="switch-church" data-id="${t.id}">Open ${t.name}</button>` : html`<a class="btn sm" href="#church-${t.id}">Join ${t.name}</a>`}
          <button type="button" class="btn ghost sm" data-act="copy" data-text="${trainingInvite(t.id)}" data-done="Invite link copied">${icon("copy")}Copy invite link</button></div>
        <p class="faint" style="margin-bottom:0">Members of ${c.name} also find it under Me, Practice. To reset or delete it, open it and go to Admin, Training church.</p></div></section>`
      : html`<section class="sec" style="margin-top:12px"><form data-form="training-create" class="panel" novalidate>
        <p style="margin-top:0">A training church is a practice copy of ${c.name} your whole team shares. Everyone sees each other's changes, on any device, and nothing reaches ${c.name}'s real data. No money moves, and it doesn't show in Find your church.</p>
        <label class="field"><span>Name</span><input type="text" name="name" value="${c.name} Training" maxlength="60" required></label>
        ${trainingSourcePicker("sample", c.name)}
        <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">People who join</legend>
          <div class="radios"><label><input type="radio" name="joinRole" value="admin" checked><span>Can practise everything</span></label><label><input type="radio" name="joinRole" value="member"><span>Start as members</span></label></div>
          <small class="faint">Members only see what a member sees until you give them a role.</small></fieldset>
        <button class="btn block">Create the training church</button></form></section>`,
  };
};
function trainingSourcePicker(cur, realName) {
  return html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Fill it with</legend>
    <label class="check" style="padding:6px 0"><input type="radio" name="source" value="sample" ${attr(cur !== "copy", "checked")}><span><b>Sample content</b><br><span class="faint">A full sample church: sermons, events, classes, songs, a service plan, gifts and reports to practise on</span></span></label>
    <label class="check" style="padding:6px 0"><input type="radio" name="source" value="copy" ${attr(cur === "copy", "checked")}><span><b>A copy of ${realName}'s setup</b><br><span class="faint">Its sermons, events, classes, songs, services, forms, signage and settings. No people, gifts, prayers, messages or drafts.</span></span></label></fieldset>`;
}
Forms["training-create"] = async (d, f) => {
  if (!d.name) return formError(f, "Give the training church a name.");
  const btn = $("button.btn.block", f); btn.disabled = true; btn.textContent = "Creating...";
  try {
    const t = await createTrainingChurch({ source: d.source, joinRole: d.joinRole, name: d.name });
    toast(`${t.name} is ready. Invite your team with the link.`); go("admin-training"); window.scrollTo(0, 0);
  } catch (e) { btn.disabled = false; btn.textContent = "Create the training church"; formError(f, `It couldn't be created: ${e.message || "try again"}`); }
};
Forms["training-reset"] = (d) => {
  const c = S.church();
  openSheet(`Reset ${c.name}?`, html`<p style="margin-top:0">Everything your team added is cleared for everyone, and the church fills again with ${d.source === "copy" ? `a copy of ${c.training.ofName}'s setup` : "sample content"}. This can't be undone.</p>
    <div class="btns"><button class="btn danger" data-act="training-reset-yes" data-source="${d.source || "sample"}">Reset</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
};
Actions["training-reset-yes"] = async (el) => {
  const c = S.church(); el.disabled = true; el.textContent = "Resetting...";
  try { await resetTrainingChurch(c.id, el.dataset.source); closeSheet(true); toast(`${c.name} starts fresh`); go("home"); }
  catch (e) { el.disabled = false; el.textContent = "Reset"; toast(`It couldn't be reset: ${e.message || "try again"}`); }
};
Actions["training-delete"] = () => {
  const c = S.church();
  openSheet(`Delete ${c.name}?`, html`<p style="margin-top:0">The training church and everything in it are deleted for everyone on the team. ${c.training.ofName || "The real church"} isn't affected. This can't be undone.</p>
    <div class="btns"><button class="btn danger" data-act="training-delete-yes">Delete</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
};
Actions["training-delete-yes"] = async (el) => {
  const c = S.church(); el.disabled = true;
  try { await deleteTrainingChurch(c.id); closeSheet(true); toast(`${c.name} was deleted`); go(S.church() ? "admin" : "churches"); }
  catch (e) { el.disabled = false; toast(`It couldn't be deleted: ${e.message || "try again"}`); }
};
