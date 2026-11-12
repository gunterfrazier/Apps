// ---------- Forms: sign-ups, permission slips and applications ----------
// Staff build a form from fields, then share it by link, QR code, an event or the Connect tab. Permission slips take
// one response per child and a parent's signature. A form can carry a fee, collected through Pay.

const FIELD_TYPES = {
  text: ["Short answer", "edit"], textarea: ["Paragraph", "note"], email: ["Email", "mail"], phone: ["Phone", "phone"], date: ["Date", "calendar"],
  number: ["Number", "list"], choice: ["Multiple choice", "check"], checkboxes: ["Checkboxes", "check"], select: ["Dropdown", "down"],
  yesno: ["Yes or no", "check"], signature: ["Signature", "edit"], heading: ["Section heading", "list"],
};
const HAS_OPTIONS = ["choice", "checkboxes", "select"];
const FF = (type, label, o = {}) => ({ id: uid(), type, label, help: "", required: false, options: [], ...o });
const FORM_TEMPLATES = {
  blank: ["Blank form", "Start from nothing", () => ({ title: "", fields: [] })],
  slip: ["Permission slip", "One per child, with a parent's signature", () => ({ title: "Permission slip", perChild: true, description: "Please fill in one for each child who's going.", fields: [
    FF("heading", "About your child"), FF("textarea", "Allergies and medications", { help: "Anything leaders should know, and when medicine is due." }),
    FF("text", "Emergency contact name", { required: true }), FF("phone", "Emergency contact phone", { required: true }), FF("text", "Doctor's name and phone"),
    FF("yesno", "May leaders give over-the-counter medicine, like ibuprofen, if needed?", { required: true }),
    FF("yesno", "May we use photos of your child in church slides and social media?", { required: true }),
    FF("heading", "Permission"), FF("signature", "Parent or guardian signature", { required: true, help: "I give permission for my child to take part in this activity and for leaders to get emergency medical care if I can't be reached." })] })],
  event: ["Event questions", "Extra questions for people signing up", () => ({ title: "Event questions", fields: [
    FF("select", "T-shirt size", { options: ["Youth M", "Youth L", "Adult S", "Adult M", "Adult L", "Adult XL"] }), FF("text", "Dietary needs"), FF("choice", "How did you hear about it?", { options: ["Sunday announcement", "A friend", "The app", "Social media"] })] })],
  volunteer: ["Volunteer application", "Interests, availability and a background check consent", () => ({ title: "Volunteer application", listed: true, fields: [
    FF("phone", "Best phone number", { required: true }), FF("checkboxes", "Where would you like to serve?", { required: true, options: [...teamsOf()] }),
    FF("choice", "How often can you serve?", { options: ["Every week", "Twice a month", "Once a month", "Now and then"] }),
    FF("yesno", "Have you served with kids or students before?"), FF("textarea", "Tell us a little about yourself"),
    FF("signature", "Background check consent", { help: "Volunteers who serve with kids need a background check. I give permission for one to be run." })] })],
  update: ["Update your information", "Address, phone and household changes", () => ({ title: "Update your information", listed: true, fields: [
    FF("text", "Street address"), FF("text", "City, state and ZIP"), FF("phone", "Phone"), FF("email", "Email"), FF("textarea", "Anything else we should update?")] })],
};
const canForms = () => S.isMember() && S.can("manage.content");
const formOpen = (f) => f.open && (!f.closes || f.closes >= isoDay(new Date()));
const responsesOf = (f) => S.list("formResponses").filter((r) => r.formId === f.id);
const myResponses = (f) => responsesOf(f).filter((r) => r.by === S.me().id);

// ----- Lists -----
Screens.forms = () => {
  const forms = S.list("forms").sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  if (!canForms()) {
    const listed = forms.filter((f) => f.listed && formOpen(f));
    return { title: "Forms", tab: "connect", body: html`${seg(connectSeg(), "forms")}<div class="rows" style="margin-top:16px">${listed.length ? listed.map((f) => html`<a class="row" href="#form-${f.id}"><span class="lead-ic">${icon("note")}</span><span class="body"><span class="t">${f.title}</span><span class="s">${myResponses(f).length ? "You've filled this in" : f.description || ""}</span></span>${icon("chev")}</a>`) : empty("No forms right now.")}</div>` };
  }
  return {
    title: "Forms", back: hasAdminTools() ? "admin" : "ministry",
    body: html`<div class="btns" style="margin-top:16px"><button class="btn" data-act="form-new">${icon("plus")}New form</button></div>
      <div class="rows" style="margin-top:14px">${forms.length ? forms.map((f) => { const n = responsesOf(f).length, ev = f.eventId && S.get("events", f.eventId);
        return html`<a class="row" href="#formedit-${f.id}"><span class="lead-ic">${icon(f.perChild ? "kid" : "note")}</span><span class="body"><span class="t">${f.title}</span>
          <span class="s">${plural(n, "response")}${formOpen(f) ? "" : ", closed"}${f.fee ? `, ${money(f.fee)} fee` : ""}${ev ? `, for ${ev.title}` : ""}${f.listed ? ", on Connect" : ""}</span></span>${icon("chev")}</a>`; }) : empty("Build sign-ups, permission slips and applications here.")}</div>`,
  };
};
Actions["form-new"] = () => openSheet("New form", html`<div class="rows">${Object.entries(FORM_TEMPLATES).map(([k, [l, s]]) => html`<button class="row" data-act="form-create" data-t="${k}"><span class="lead-ic">${icon(k === "slip" ? "kid" : k === "blank" ? "plus" : "note")}</span><span class="body"><span class="t">${l}</span><span class="s">${s}</span></span>${icon("chev")}</button>`)}</div>`);
Actions["form-create"] = (el) => {
  const t = FORM_TEMPLATES[el.dataset.t][2]();
  const f = S.add("forms", { title: t.title || "Untitled form", description: t.description || "", fields: t.fields, perChild: !!t.perChild, fee: 0, open: true, closes: "", listed: !!t.listed, eventId: null, notify: S.me().id, by: S.me().id, created: new Date().toISOString() });
  closeSheet(true); go(`formedit-${f.id}`);
  if (!t.title) setTimeout(() => Actions["form-settings"]({ dataset: { id: f.id } }), 120);
};

// ----- Builder -----
Screens.formedit = (id) => {
  const f = S.get("forms", id);
  if (!f || !canForms()) return { redirect: "forms" };
  const n = responsesOf(f).length, ev = f.eventId && S.get("events", f.eventId);
  return {
    title: f.title, back: "forms",
    body: html`<h1 style="margin-top:16px">${f.title}</h1>
      <p class="muted" style="margin-top:4px">${[formOpen(f) ? "Open" : "Closed", f.closes ? `until ${fmtShort(fromIsoDay(f.closes))}` : "", f.perChild ? "one response per child" : "", f.fee ? `${money(f.fee)} fee` : "", f.listed ? "listed on Connect" : "", ev ? `required for ${ev.title}` : ""].filter(Boolean).join(", ")}.</p>
      <div class="btns"><button class="btn sm" data-act="form-settings" data-id="${f.id}">${icon("gear")}Settings</button><a class="btn ghost sm" href="#form-${f.id}">${icon("eye")}Preview</a>
        <a class="btn ghost sm" href="#responses-${f.id}">${icon("inbox")}${plural(n, "response")}</a>
        ${S.can("qr.create") ? html`<button class="btn ghost sm" data-act="qr-for" data-target="form-${f.id}" data-label="${f.title}">${icon("qr")}QR code</button>` : ""}
        <button class="btn ghost sm" data-act="copy" data-text="${appLink(`form-${f.id}`)}" data-done="Link copied">${icon("link")}Copy link</button></div>
      ${f.description ? html`<p class="panel" style="margin-top:12px">${f.description}</p>` : ""}
      <section class="sec"><div class="sec-head"><h2>Questions</h2>${f.fields.length > 1 ? html`<span class="faint">Drag ${icon("grip")} to reorder</span>` : ""}</div>
        <div class="blocks" id="sort-list">${f.fields.length ? f.fields.map((x, i) => html`<div class="block-card ${x.type === "heading" ? "private" : ""}" data-index="${i}"><div class="block-top">${dragHandle(x.label)}<b>${x.label}</b>
          <span class="row-tools"><button class="icon-btn" data-act="field-edit" data-form="${f.id}" data-i="${i}" aria-label="Edit ${x.label}">${icon("edit")}</button></span></div>
          <div class="block-body"><span class="s">${FIELD_TYPES[x.type][0]}${x.required ? ", required" : ""}${HAS_OPTIONS.includes(x.type) ? `: ${x.options.join(", ")}` : ""}</span></div></div>`) : empty("Add the first question.")}</div>
        <div class="btns"><button class="btn" data-act="field-add" data-form="${f.id}">${icon("plus")}Add a question</button></div></section>`,
    after() { makeSortable($("#sort-list"), (from, to, kb) => { if (moveItem(f.fields, from, to)) { S.save(); render(); if (kb) $$("#sort-list [data-drag]")[to]?.focus(); } }); },
  };
};
Actions["form-settings"] = (el) => {
  const f = S.get("forms", el.dataset.id), events = upcomingEvents().filter((e) => e.signup);
  openSheet("Form settings", html`<form data-form="form-settings" novalidate><input type="hidden" name="id" value="${f.id}">
    <label class="field"><span>Title</span><input type="text" name="title" value="${f.title}" required maxlength="80"></label>
    <label class="field"><span>Description</span><textarea name="description" maxlength="600" style="min-height:70px">${f.description}</textarea></label>
    <label class="check"><input type="checkbox" name="perChild" ${attr(f.perChild, "checked")}><span>One response per child<br><span class="faint">Parents pick the child from their household. Use this for permission slips.</span></span></label>
    <label class="check"><input type="checkbox" name="open" ${attr(f.open, "checked")}><span>Taking responses</span></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Closes after</span><input type="date" name="closes" value="${f.closes}"></label>
      <label class="field"><span>Fee (optional)</span><input type="number" name="fee" min="0" max="5000" step="0.01" value="${f.fee || ""}" placeholder="0"></label></div>
    <label class="check"><input type="checkbox" name="listed" ${attr(f.listed, "checked")}><span>Show on the Connect tab</span></label>
    <label class="field"><span>Required for an event</span><select name="eventId"><option value="">None</option>${events.map((e) => html`<option value="${e.id}" ${attr(e.id === f.eventId, "selected")}>${e.title}, ${fmtShort(e.start)}</option>`)}</select><small>People who sign up are asked to fill it in.</small></label>
    <label class="field"><span>Tell someone about new responses</span><select name="notify"><option value="">Nobody</option>${S.members().filter((m) => S.role(m.churchId, m.userId)?.rank >= 30).map((m) => html`<option value="${m.userId}" ${attr(m.userId === f.notify, "selected")}>${S.userName(m.userId)}</option>`)}</select></label>
    <div class="btns"><button class="btn">Save</button><button type="button" class="btn danger" data-act="form-delete" data-id="${f.id}">Delete form</button></div></form>`, { wide: true });
};
Forms["form-settings"] = (d, form) => {
  if (!d.title) return formError(form, "Give the form a title.");
  const f = S.get("forms", d.id);
  Object.assign(f, { title: d.title, description: d.description, perChild: !!d.perChild, open: !!d.open, closes: d.closes, fee: Math.max(0, Math.round((+d.fee || 0) * 100) / 100), listed: !!d.listed, eventId: d.eventId || null, notify: d.notify || null });
  S.list("events").forEach((e) => { if (e.formId === f.id && e.id !== f.eventId) e.formId = null; });
  if (f.eventId) S.get("events", f.eventId).formId = f.id;
  S.save(); closeSheet(); toast("Saved"); render();
};
Actions["form-delete"] = (el) => openSheet("Delete this form?", html`<p>Its ${plural(responsesOf(S.get("forms", el.dataset.id)).length, "response")} will be deleted too.</p><div class="btns"><button class="btn danger" data-act="form-delete-yes" data-id="${el.dataset.id}">Delete</button><button class="btn ghost" data-act="close-sheet">Keep it</button></div>`);
Actions["form-delete-yes"] = (el) => {
  const id = el.dataset.id; S.remove("forms", id); S.state.formResponses = S.state.formResponses.filter((r) => r.formId !== id);
  S.list("events").forEach((e) => { if (e.formId === id) e.formId = null; }); S.save(); closeSheet(true); toast("Form deleted"); go("forms");
};
Actions["field-add"] = (el) => openSheet("Add a question", html`<div class="type-grid">${Object.entries(FIELD_TYPES).map(([k, [l, ic]]) => html`<button class="type-pick" data-act="field-new" data-form="${el.dataset.form}" data-type="${k}">${icon(ic)}<span>${l}</span></button>`)}</div>`);
Actions["field-new"] = (el) => fieldEditor(el.dataset.form, -1, FF(el.dataset.type, ""));
Actions["field-edit"] = (el) => fieldEditor(el.dataset.form, +el.dataset.i, S.get("forms", el.dataset.form).fields[+el.dataset.i]);
function fieldEditor(formId, i, x) {
  openSheet(i < 0 ? `Add: ${FIELD_TYPES[x.type][0]}` : "Edit question", html`<form data-form="field-save" novalidate><input type="hidden" name="form" value="${formId}"><input type="hidden" name="i" value="${i}"><input type="hidden" name="type" value="${x.type}">
    <label class="field"><span>${x.type === "heading" ? "Heading" : "Question"}</span><input type="text" name="label" value="${x.label}" required maxlength="160"></label>
    <label class="field"><span>${x.type === "signature" ? "What they're agreeing to" : "Help text (optional)"}</span><textarea name="help" maxlength="600" style="min-height:60px">${x.help}</textarea></label>
    ${HAS_OPTIONS.includes(x.type) ? html`<label class="field"><span>Choices</span><textarea name="options" placeholder="One per line">${x.options.join("\n")}</textarea></label>` : ""}
    ${x.type !== "heading" ? html`<label class="check"><input type="checkbox" name="required" ${attr(x.required, "checked")}><span>Required</span></label>` : ""}
    <div class="btns"><button class="btn">${i < 0 ? "Add" : "Save"}</button>${i >= 0 ? html`<button type="button" class="btn danger" data-act="field-delete" data-form="${formId}" data-i="${i}">Remove</button>` : ""}</div></form>`);
}
Forms["field-save"] = (d, form) => {
  if (!d.label) return formError(form, "Write the question.");
  const options = HAS_OPTIONS.includes(d.type) ? [...new Set(String(d.options || "").split("\n").map((x) => x.trim()).filter(Boolean))] : [];
  if (HAS_OPTIONS.includes(d.type) && options.length < 2) return formError(form, "Add at least two choices.");
  const f = S.get("forms", d.form), rec = { type: d.type, label: d.label, help: d.help, required: !!d.required, options };
  if (+d.i < 0) f.fields.push(FF(d.type, d.label, rec)); else Object.assign(f.fields[+d.i], rec);
  S.save(); closeSheet(); render();
};
Actions["field-delete"] = (el) => { S.get("forms", el.dataset.form).fields.splice(+el.dataset.i, 1); S.save(); closeSheet(); render(); };

// ----- Filling it in -----
let formDone = null, formChild = null;
function fieldInput(x, prefill = "") {
  const n = `f_${x.id}`, req = attr(x.required, "required"), help = x.help && x.type !== "signature" ? html`<small>${x.help}</small>` : "";
  const star = x.required ? html` <span class="req" aria-hidden="true">*</span>` : "";
  switch (x.type) {
    case "heading": return html`<h2 class="form-h">${x.label}</h2>${x.help ? html`<p class="muted">${x.help}</p>` : ""}`;
    case "textarea": return html`<label class="field"><span>${x.label}${star}</span><textarea name="${n}" maxlength="2000" ${req}>${prefill}</textarea>${help}</label>`;
    case "choice": case "yesno": return html`<fieldset class="field" style="border:0;padding:0"><legend class="flabel">${x.label}${star}</legend><div class="radios">${(x.type === "yesno" ? ["Yes", "No"] : x.options).map((o) => html`<label><input type="radio" name="${n}" value="${o}"><span>${o}</span></label>`)}</div>${help}</fieldset>`;
    case "checkboxes": return html`<fieldset class="field" style="border:0;padding:0"><legend class="flabel">${x.label}${star}</legend>${x.options.map((o) => html`<label class="check" style="padding:4px 0"><input type="checkbox" name="${n}" value="${o}"><span>${o}</span></label>`)}${help}</fieldset>`;
    case "select": return html`<label class="field"><span>${x.label}${star}</span><select name="${n}"><option value="">Choose</option>${x.options.map((o) => html`<option>${o}</option>`)}</select>${help}</label>`;
    case "signature": return html`<fieldset class="field sig-field" style="border:0;padding:0"><legend class="flabel">${x.label}${star}</legend>${x.help ? html`<p class="sig-terms">${x.help}</p>` : ""}
      <div class="sig-wrap"><canvas class="sig-pad" data-field="${n}" aria-label="Sign here with your finger or mouse"></canvas><span class="sig-line">Sign here</span><button type="button" class="linkish sig-clear" data-act="sig-clear" data-field="${n}">Clear</button></div>
      <input type="hidden" name="${n}"><label class="field"><span>Type your full name</span><input type="text" name="${n}_name" maxlength="80" autocomplete="name" value="${S.me().name}"></label></fieldset>`;
    default: return html`<label class="field"><span>${x.label}${star}</span><input type="${{ email: "email", phone: "tel", date: "date", number: "number" }[x.type] || "text"}" name="${n}" value="${prefill}" maxlength="200" ${req}>${help}</label>`;
  }
}
function prefillFor(x, child) {
  const me = S.me(), l = x.label.toLowerCase();
  if (x.type === "email") return me.email || "";
  if (x.type === "phone" && !/emergency|doctor/.test(l)) return me.phone || "";
  if (child && /allerg|medic/.test(l)) return [child.allergies && `Allergies: ${child.allergies}`, child.notes].filter(Boolean).join(". ");
  return "";
}
Screens.form = (id) => {
  const f = S.get("forms", id);
  if (!f) return { redirect: "home" };
  const back = f.eventId && S.get("events", f.eventId) ? `event-${f.eventId}` : canForms() ? `formedit-${f.id}` : "forms";
  if (formDone?.formId === f.id) {
    const r = S.get("formResponses", formDone.responseId), left = f.perChild ? kids().filter((k) => !myResponses(f).some((x) => x.childId === k.id)) : [];
    return { title: f.title, back, body: html`<div class="panel done-panel" style="margin-top:18px"><span class="big-check">${icon("check")}</span><h1>Thanks${r?.childName ? `, ${firstName(r.childName)} is set` : ""}!</h1>
      <p class="muted">${S.church().name} has your response${r?.paid && r.paid.status !== "free" ? `. ${paidLabel(r.paid)}, ${money(f.fee)}` : ""}.</p>
      <div class="btns" style="justify-content:center">${left.length ? html`<button class="btn" data-act="form-again" data-id="${f.id}">Fill in for ${firstName(left[0].name)}</button>` : ""}<a class="btn ${left.length ? "ghost" : ""}" href="#${back === `formedit-${f.id}` ? "forms" : back}" data-act="form-finish">Done</a></div></div>` };
  }
  const preview = !formOpen(f) && canForms();
  if (!formOpen(f) && !preview) return { title: f.title, back, body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">This form isn't taking responses right now.</p></div>` };
  if (!S.isMember() && f.fields.length) return { title: f.title, back, body: needMember(`fill in "${f.title}"`) };
  const kidsList = kids(), done = myResponses(f);
  const child = f.perChild ? kidsList.find((k) => k.id === formChild) || kidsList.find((k) => !done.some((r) => r.childId === k.id)) || kidsList[0] : null;
  return {
    title: f.title, back,
    body: html`<h1 style="margin-top:16px">${f.title}</h1>${f.description ? html`<p class="muted" style="margin-top:4px">${f.description}</p>` : ""}
      ${preview ? demoNote("Preview. This form is closed, so only staff can see it.") : ""}
      ${f.perChild && !kidsList.length ? html`<div class="panel" style="margin-top:14px"><p style="margin-top:0">This form is filled in for each child. Add your kids to your household first.</p><a class="btn" href="#household">${icon("plus")}Add your kids</a></div>` : html`
      <form data-form="form-submit" class="panel form-fill" novalidate style="margin-top:14px"><input type="hidden" name="_form" value="${f.id}">
        ${f.perChild ? html`<fieldset class="field" style="border:0;padding:0;margin-top:0"><legend class="flabel">Which child?</legend><div class="radios">${kidsList.map((k) => { const has = done.some((r) => r.childId === k.id);
          return html`<label><input type="radio" name="_child" value="${k.id}" data-change="form-child" ${attr(k.id === child?.id, "checked")}><span>${firstName(k.name)}${has ? " (done)" : ""}</span></label>`; })}</div></fieldset>` : ""}
        ${f.fields.map((x) => fieldInput(x, prefillFor(x, child)))}
        ${f.fee ? html`<p class="faint">Fee: ${money(f.fee)}${f.perChild ? " per child" : ""}, paid when you submit.</p>` : ""}
        <button class="btn block">${f.fee ? `Submit and pay ${money(f.fee)}` : "Submit"}</button></form>`}`,
    after() { $$(".sig-pad").forEach(sizeSigPad); },
  };
};
Inputs["form-child"] = (el) => { formChild = el.value; render(); };
Actions["form-again"] = (el) => { formDone = null; formChild = null; go(`form-${el.dataset.id}`); render(); };
Actions["form-finish"] = (el) => { formDone = null; formChild = null; go(el.getAttribute("href").slice(1)); };
Forms["form-submit"] = async (d, form, fd) => {
  const f = S.get("forms", d._form), answers = {};
  for (const x of f.fields) {
    if (x.type === "heading") continue;
    const n = `f_${x.id}`;
    let v = x.type === "checkboxes" ? fd.getAll(n) : (d[n] || "");
    if (x.type === "signature") {
      v = d[n] ? { image: d[n], name: d[`${n}_name`], at: new Date().toISOString() } : "";
      if (x.required && (!d[n] || !d[`${n}_name`])) return formError(form, `Sign and type your name for "${x.label}".`);
    } else if (x.required && (Array.isArray(v) ? !v.length : !String(v).trim())) return formError(form, `Answer "${x.label}".`);
    if (x.type === "email" && v && !/^\S+@\S+\.\S+$/.test(v)) return formError(form, `Check the email address for "${x.label}".`);
    answers[x.id] = v;
  }
  const child = f.perChild ? kids().find((k) => k.id === d._child) : null;
  if (f.perChild && !child) return formError(form, "Choose which child this is for.");
  const me = S.me();
  const paid = await Pay.checkout({ title: `${f.title}${child ? ` for ${firstName(child.name)}` : ""}`, lines: [{ label: f.title, amount: f.fee || 0 }], kind: "form", ref: f.id, email: me.email });
  if (!paid) return formError(form, "Payment was cancelled. Your answers are still here.");
  if (child) S.state.formResponses = S.state.formResponses.filter((r) => !(r.formId === f.id && r.by === me.id && r.childId === child.id));
  const r = S.add("formResponses", { formId: f.id, by: me.id, name: me.name, email: me.email, childId: child?.id || null, childName: child?.name || "", answers, paid: f.fee ? paid : null, at: new Date().toISOString() });
  if (f.notify && f.notify !== me.id) notify(f.notify, { kind: "form", title: `New response: ${f.title}`, body: `${me.name}${child ? ` for ${child.name}` : ""}`, link: `#responses-${f.id}` });
  emit("form.submitted", { form: f.title, formId: f.id, name: me.name, child: child?.name || "", paid: r.paid?.status || "" });
  formDone = { formId: f.id, responseId: r.id }; formChild = null; render(); window.scrollTo(0, 0);
};

// ----- Signature pad -----
function sizeSigPad(c) {
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  const g = c.getContext("2d"); g.scale(dpr, dpr); g.lineWidth = 2.4; g.lineCap = g.lineJoin = "round"; g.strokeStyle = "#111";
}
document.addEventListener("pointerdown", (e) => {
  const c = e.target.closest?.(".sig-pad"); if (!c) return;
  e.preventDefault(); c.setPointerCapture(e.pointerId);
  const g = c.getContext("2d"), box = c.getBoundingClientRect(), pt = (ev) => [ev.clientX - box.left, ev.clientY - box.top];
  let [x, y] = pt(e); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.1, y + 0.1); g.stroke();
  const move = (ev) => { const [nx, ny] = pt(ev); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke(); [x, y] = [nx, ny]; };
  const up = () => {
    c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up);
    c.classList.add("signed"); const inp = $(`input[name="${c.dataset.field}"]`, c.closest("form")); if (inp) inp.value = c.toDataURL("image/png");
  };
  c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up);
});
Actions["sig-clear"] = (el) => {
  const form = el.closest("form"), c = $(`.sig-pad[data-field="${el.dataset.field}"]`, form);
  c.getContext("2d").clearRect(0, 0, c.width, c.height); c.classList.remove("signed"); $(`input[name="${el.dataset.field}"]`, form).value = "";
};

// ----- Responses -----
Screens.responses = (id) => {
  const f = S.get("forms", id);
  if (!f || !canForms()) return { redirect: "forms" };
  const list = responsesOf(f).sort((a, b) => new Date(b.at) - new Date(a.at)), paidTotal = list.reduce((n, r) => n + (r.paid && r.paid.status !== "refunded" ? f.fee : 0), 0);
  return {
    title: "Responses", back: `formedit-${f.id}`,
    body: html`<h1 style="margin-top:16px">${f.title}</h1><p class="muted" style="margin-top:4px">${plural(list.length, "response")}${f.fee ? `, ${money(paidTotal)} collected` : ""}.</p>
      <div class="btns">${list.length ? html`<button class="btn sm" data-act="responses-csv" data-id="${f.id}">${icon("download")}Download CSV</button>` : ""}</div>
      ${list.length > 6 ? html`<label class="field"><span class="sr">Search responses</span><input type="search" placeholder="Search by name" data-input="filter-rows" data-target="#resp-list" data-empty="#resp-none"></label>` : ""}
      <div class="rows" id="resp-list" style="margin-top:12px">${list.length ? list.map((r) => html`<button class="row" data-act="response-open" data-id="${r.id}" data-search="${r.name} ${r.childName}">${avatar({ id: r.by, name: r.childName || r.name })}<span class="body"><span class="t">${r.childName || r.name}</span><span class="s">${r.childName ? `${r.name}, ` : ""}${ago(r.at)}${f.fee ? `, ${paidLabel(r.paid)}` : ""}</span></span>${icon("chev")}</button>`) : empty("No responses yet. Share the link or QR code to get some.")}</div>
      <p id="resp-none" class="faint" hidden>Nobody matches.</p>`,
  };
};
const answerText = (x, v) => !v ? "" : x.type === "signature" ? `Signed by ${v.name}, ${fmtShort(v.at)}` : Array.isArray(v) ? v.join(", ") : String(v);
Actions["response-open"] = (el) => {
  const r = S.get("formResponses", el.dataset.id), f = S.get("forms", r.formId);
  openSheet(r.childName || r.name, html`<p class="muted" style="margin-top:0">${r.childName ? `From ${r.name}. ` : ""}${fmtWhen(r.at)}${r.email ? `. ${r.email}` : ""}${f.fee ? `. ${paidLabel(r.paid)}` : ""}</p>
    <dl class="answers">${f.fields.filter((x) => x.type !== "heading").map((x) => html`<dt>${x.label}</dt><dd>${x.type === "signature" && r.answers[x.id]?.image ? html`<img class="sig-img" src="${r.answers[x.id].image}" alt="Signature"><br><span class="faint">${answerText(x, r.answers[x.id])}</span>` : answerText(x, r.answers[x.id]) || html`<span class="faint">No answer</span>`}</dd>`)}</dl>
    <div class="btns"><button class="btn danger" data-act="response-delete" data-id="${r.id}">Delete response</button></div>`, { wide: true });
};
Actions["response-delete"] = (el) => { S.remove("formResponses", el.dataset.id); closeSheet(true); toast("Response deleted"); render(); };
Actions["responses-csv"] = (el) => {
  const f = S.get("forms", el.dataset.id), q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`, cols = f.fields.filter((x) => x.type !== "heading");
  const rows = [["Submitted", "Name", "Email", ...(f.perChild ? ["Child"] : []), ...cols.map((x) => x.label), ...(f.fee ? ["Payment"] : [])].map(q).join(","),
    ...responsesOf(f).map((r) => [r.at, r.name, r.email, ...(f.perChild ? [r.childName] : []), ...cols.map((x) => answerText(x, r.answers[x.id])), ...(f.fee ? [paidLabel(r.paid)] : [])].map(q).join(","))];
  saveFile(`${f.title.replace(/[^\w]+/g, "-").toLowerCase()}-responses.csv`, rows.join("\n") + "\n");
};
