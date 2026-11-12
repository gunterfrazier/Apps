// ---------- Events ----------
let eventFilter = "All";

Screens.events = () => {
  if (!S.on("events")) return { redirect: "home" };
  const list = upcomingEvents();
  const cats = ["All", ...new Set(list.map((e) => e.category))];
  if (!cats.includes(eventFilter)) eventFilter = "All";
  const shown = list.filter((e) => eventFilter === "All" || e.category === eventFilter);
  const mine = list.filter(myRegistration);
  const months = [...new Set(shown.map((e) => fmt(e.start, { month: "long", year: "numeric" })))];
  return {
    title: "Events", tab: "events",
    body: html`
      <div style="margin-top:12px">${campusChip()}</div>
      ${cats.length > 2 ? html`<div class="chips" role="group" aria-label="Filter events" style="margin-top:8px">${cats.map((c) => html`<button class="chip" data-act="event-filter" data-cat="${c}" aria-pressed="${c === eventFilter}">${c}</button>`)}</div>` : ""}
      ${mine.length && eventFilter === "All" ? html`<section class="sec" style="margin-top:12px"><h2 class="sec-head">You're going</h2><div class="rows">${mine.map(eventRow)}</div></section>` : ""}
      ${shown.length ? months.map((m) => html`<section class="sec" style="margin-top:18px"><h2 class="sec-head">${m}</h2><div class="rows">${shown.filter((e) => fmt(e.start, { month: "long", year: "numeric" }) === m).map(eventRow)}</div></section>`)
        : html`<div class="rows" style="margin-top:14px">${empty("Nothing on the calendar yet.")}</div>`}`,
  };
};
Actions["event-filter"] = (el) => { eventFilter = el.dataset.cat; render(); };

function gcalLink(title, start, end, details, where) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${z(start)}/${z(end)}`, details: `${details || ""}\n\n${S.church().name}`, location: where || "" });
  return `https://calendar.google.com/calendar/render?${p}`;
}
const fullAddress = (item) => [item.room || item.location, item.locationId ? S.location(item.locationId)?.address : churchCity(S.church())].filter(Boolean).join(", ");

Screens.event = (id) => {
  const e = S.get("events", id);
  if (!e || !S.inScope(e, { ignoreCampus: true })) return { redirect: "events" };
  const reg = myRegistration(e);
  const taken = registeredCount(e);
  const left = e.capacity ? e.capacity - taken : null;
  const sameDay = isoDay(e.start) === isoDay(e.end);
  return {
    title: e.title, back: "events", tab: "events",
    body: html`
      <p style="margin:16px 0 4px"><span class="tag brand">${e.category}</span>${e.locationId && S.location(e.locationId)?.visibility === "private" ? html` <span class="tag">${icon("lock")}Private location</span>` : ""}</p>
      <h1>${e.title}</h1>
      <div class="meta">
        ${icon("calendar")}<span>${fmtDay(e.start)}<br>${fmtTime(e.start)} to ${sameDay ? fmtTime(e.end) : `${fmtShort(e.end)} ${fmtTime(e.end)}`}</span>
        ${icon("pin")}<span>${placeText(e)}<br><a href="${mapLink(fullAddress(e))}" target="_blank" rel="noopener">Directions</a></span>
        ${e.signup ? html`${icon("people")}<span>${taken} signed up${left != null ? `, ${Math.max(left, 0)} spots left` : ""}</span>` : ""}
        ${e.tickets?.length ? html`${icon("give")}<span>${e.tickets.map((t) => `${t.name} ${money(t.price)}`).join(", ")}</span>` : ""}
      </div>
      <p class="lead">${e.description}</p>
      ${e.signup ? html`<div class="panel" style="margin-top:16px">
        ${reg ? html`<p style="margin-top:0"><span class="tag ok">You're going</span> ${reg.tickets ? ticketSummary(e, reg) : reg.count > 1 ? `${reg.count} people in your party` : ""}${reg.kids?.length ? `, including ${listJoin(reg.kids.map((k) => S.me().household.find((p) => p.id === k)?.name).filter(Boolean))}` : ""}.${reg.total ? ` ${paidLabel(reg.paid)}, ${money(reg.total)}.` : ""}</p>
            ${eventFormPanel(e, reg)}
            <div class="btns">${reg.paid?.status === "pending" ? html`<button class="btn" data-act="event-pay" data-id="${e.id}">${icon("give")}Finish paying ${money(reg.total)}</button><button class="btn ghost" data-act="event-cancel" data-id="${e.id}" data-sure="1">Cancel</button>` : reg.total ? html`<button class="btn danger" data-act="event-cancel" data-id="${e.id}">Cancel and refund</button>` : html`<button class="btn ghost" data-act="event-register" data-id="${e.id}">Change</button><button class="btn danger" data-act="event-cancel" data-id="${e.id}">Cancel my spot</button>`}</div>`
          : left !== null && left <= 0 ? html`<p style="margin:0"><b>This event is full.</b></p>`
          : html`<button class="btn block" data-act="event-register" data-id="${e.id}">${e.tickets?.length ? "Get tickets" : "Sign up"}</button>`}
      </div>` : ""}
      <div class="btns">${ext(gcalLink(e.title, e.start, e.end, e.description, fullAddress(e)), "Add to Google Calendar", "btn ghost sm", "calendar")}
        <button class="btn ghost sm" data-act="copy" data-done="Event details copied" data-text="${`${e.title}\n${fmtDay(e.start)}, ${fmtTime(e.start)}\n${placeText(e)}\n\n${e.description}\n${appLink(`event-${e.id}`)}`}">${icon("copy")}Copy details</button>
        ${S.can("qr.create") ? html`<button class="btn ghost sm" data-act="qr-for" data-target="${e.signup ? `register-event-${e.id}` : `event-${e.id}`}" data-label="${e.title}">${icon("qr")}QR code</button>` : ""}</div>`,
    after() { if (pendingRegister === e.id) { pendingRegister = null; if (e.signup && !reg) Actions["event-register"]({ dataset: { id: e.id } }); } },
  };
};
// #register-event-ID opens the event with its sign-up sheet (used by QR codes).
let pendingRegister = null;
Screens.register = (tail) => {
  const [kind, ...rest] = tail.split("-"); const id = rest.join("-");
  pendingRegister = id;
  return { redirect: kind === "event" ? `event-${id}` : `gathering-${id}` };
};

/** "Student, 85, 60" lines into ticket types, keeping the IDs of types that already exist. */
function parseTickets(text, rec) {
  const list = [];
  for (const line of String(text || "").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [name, price, limit] = line.split(",").map((x) => x.trim());
    const p = Number(String(price || "").replace(/[$\s]/g, ""));
    if (!name || !Number.isFinite(p) || p < 0) return { error: `Check the ticket line "${line}". Write it as: name, price.`, list: [] };
    list.push({ id: rec?.tickets?.find((t) => t.name.toLowerCase() === name.toLowerCase())?.id || uid(), name, price: Math.round(p * 100) / 100, limit: Math.max(0, parseInt(limit, 10) || 0) });
  }
  return { list };
}
const ticketsSold = (e, id) => e.registrations.reduce((n, r) => n + (r.tickets?.[id] || 0), 0);
const ticketSummary = (e, r) => (e.tickets || []).filter((t) => r.tickets?.[t.id]).map((t) => `${r.tickets[t.id]} ${t.name.toLowerCase()}`).join(", ");
/** Which forms a registration still needs: one per registered child for permission slips, otherwise one. */
function formsNeeded(e, r) {
  const f = e.formId && S.get("forms", e.formId); if (!f) return { form: null, need: [], done: [] };
  const mine = S.list("formResponses").filter((x) => x.formId === f.id && x.by === r.by);
  if (!f.perChild) return { form: f, need: mine.length ? [] : [null], done: mine.length ? [null] : [] };
  const ids = r.kids?.length ? r.kids : [];
  return { form: f, need: ids.filter((k) => !mine.some((x) => x.childId === k)), done: ids.filter((k) => mine.some((x) => x.childId === k)) };
}
const formsDoneText = (e, r) => { const { form, need, done } = formsNeeded(e, r); return !form ? "" : form.perChild && !need.length && !done.length ? "no kids listed for the form" : need.length ? `${form.title}: ${done.length} of ${need.length + done.length}` : `${form.title} done`; };
function eventFormPanel(e, reg) {
  const { form, need, done } = formsNeeded(e, reg); if (!form) return "";
  const name = (id) => firstName(S.me().household.find((p) => p.id === id)?.name || "");
  if (form.perChild && !need.length && !done.length) return html`<p class="faint">${form.title}: choose which of your kids are going under Change, then fill one in for each.</p>`;
  return need.length ? html`<div class="allergy-note" style="margin:0 0 12px">${icon("note")}<span><b>${form.title} needed</b>${form.perChild ? ` for ${listJoin(need.map(name))}` : ""}.${done.length ? ` Done for ${listJoin(done.map(name))}.` : ""}<br><button class="btn sm" style="margin-top:8px" data-act="event-form" data-form="${form.id}" data-child="${need[0] || ""}">Fill it in</button></span></div>`
    : html`<p class="faint" style="margin-top:0">${icon("check")} ${form.title} done${form.perChild ? ` for ${listJoin(done.map(name))}` : ""}.</p>`;
}
Actions["event-form"] = (el) => { formChild = el.dataset.child || null; formDone = null; go(`form-${el.dataset.form}`); };
Actions["event-csv"] = (el) => {
  const e = S.get("events", el.dataset.id), q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const rows = [["Signed up", "Name", "Email", "People", ...(e.tickets || []).map((t) => t.name), "Total", "Payment", ...(e.formId ? ["Form"] : [])].map(q).join(","),
    ...e.registrations.map((r) => [r.at, r.name, r.email, r.count || 1, ...(e.tickets || []).map((t) => r.tickets?.[t.id] || 0), r.total || 0, r.total ? paidLabel(r.paid) : "", ...(e.formId ? [formsDoneText(e, r)] : [])].map(q).join(","))];
  saveFile(`${e.title.replace(/[^\w]+/g, "-").toLowerCase()}-signups.csv`, rows.join("\n") + "\n");
};
Inputs["ticket-total"] = (el) => {
  const f = el.closest("form"), e = S.get("events", $('input[name="id"]', f).value);
  const total = (e.tickets || []).reduce((n, t) => n + (+f[`t_${t.id}`]?.value || 0) * t.price, 0);
  $("[data-total]", f).textContent = total ? `Continue to pay ${money(total)}` : "Choose your tickets";
};

Actions["event-register"] = (el) => {
  const e = S.get("events", el.dataset.id), reg = myRegistration(e), me = S.me();
  const kids = me.household.filter((p) => p.kind === "child");
  if (e.tickets?.length && !reg) {
    const left = (t) => t.limit ? Math.max(0, t.limit - ticketsSold(e, t.id)) : 20;
    openSheet(`Tickets for ${e.title}`, html`<form data-form="event-tickets" data-input="ticket-total" novalidate><input type="hidden" name="id" value="${e.id}">
      <div class="ticket-list">${e.tickets.map((t) => html`<label class="ticket"><span class="body"><span class="t">${t.name}</span><span class="s">${money(t.price)}${t.limit ? `, ${left(t)} left` : ""}</span></span>
        <input type="number" name="t_${t.id}" min="0" max="${Math.min(20, left(t))}" value="0" inputmode="numeric" aria-label="${t.name} tickets" ${attr(!left(t), "disabled")}></label>`)}</div>
      ${e.kids && kids.length ? html`<fieldset class="field" style="border:0;padding:0"><legend class="flabel">Which of your kids are going?</legend>
        ${kids.map((k) => html`<label class="check"><input type="checkbox" name="kids" value="${k.id}"><span>${k.name}</span></label>`)}</fieldset>` : ""}
      <label class="field"><span>Name</span><input type="text" name="name" value="${me.name}" required></label>
      <label class="field"><span>Email for your receipt</span><input type="email" name="email" value="${me.email}"></label>
      ${e.formId ? html`<p class="faint">After paying, you'll fill in ${S.get("forms", e.formId)?.title || "a short form"}.</p>` : ""}
      <button class="btn block" data-total>Choose your tickets</button></form>`);
    return;
  }
  openSheet(`Sign up for ${e.title}`, html`<form data-form="event-register" novalidate><input type="hidden" name="id" value="${e.id}">
    <label class="field"><span>Name</span><input type="text" name="name" value="${me.name}" required></label>
    ${e.kids && kids.length ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Bringing kids?</legend>
      ${kids.map((k) => html`<label class="check"><input type="checkbox" name="kids" value="${k.id}" ${attr(reg?.kids?.includes(k.id), "checked")}><span>${k.name}</span></label>`)}
      <small class="faint">Registered kids show up in your parent portal.</small></fieldset>` : ""}
    <label class="field"><span>How many people in total, including you?</span><input type="number" name="count" min="1" max="12" value="${reg?.count || 1}"></label>
    <label class="field"><span>Email for a reminder</span><input type="email" name="email" value="${me.email}"></label>
    <button class="btn block">${reg ? "Save changes" : "Sign up"}</button></form>`);
};
Forms["event-register"] = (d, f, fd) => {
  const e = S.get("events", d.id), me = S.me();
  const kids = fd.getAll("kids");
  const count = Math.max(clamp(parseInt(d.count, 10) || 1, 1, 12), kids.length + 1);
  if (!d.name) return formError(f, "Enter your name.");
  const others = e.registrations.filter((r) => r.by !== me.id);
  const taken = others.reduce((n, r) => n + (r.count || 1), 0);
  if (e.capacity && taken + count > e.capacity) return formError(f, `Only ${e.capacity - taken} spots are left.`);
  const isNew = !myRegistration(e);
  e.registrations = [...others, { by: me.id, name: d.name, email: d.email, count, kids, at: new Date().toISOString() }];
  if (d.email && !me.email) me.email = d.email;
  if (isNew) emit("event.registered", { event: e.title, eventId: e.id, name: d.name, count, kids: kids.length });
  S.save(); closeSheet(); toast("You're signed up"); render();
};
Forms["event-tickets"] = async (d, f, fd) => {
  const e = S.get("events", d.id), me = S.me();
  const tickets = Object.fromEntries((e.tickets || []).map((t) => [t.id, clamp(parseInt(d[`t_${t.id}`], 10) || 0, 0, 20)]).filter(([, n]) => n));
  const count = Object.values(tickets).reduce((n, x) => n + x, 0);
  if (!count) return formError(f, "Choose at least one ticket.");
  if (!d.name) return formError(f, "Enter your name.");
  for (const t of e.tickets) if (t.limit && tickets[t.id] && ticketsSold(e, t.id) + tickets[t.id] > t.limit) return formError(f, `Only ${t.limit - ticketsSold(e, t.id)} ${t.name.toLowerCase()} tickets are left.`);
  if (e.capacity && registeredCount(e) + count > e.capacity) return formError(f, `Only ${e.capacity - registeredCount(e)} spots are left.`);
  const lines = e.tickets.filter((t) => tickets[t.id]).map((t) => ({ label: t.name, amount: t.price, qty: tickets[t.id] }));
  const total = lines.reduce((n, l) => n + l.amount * l.qty, 0);
  if (Pay.live() && total > 0) {
    e.registrations = [...e.registrations.filter((r) => r.by !== me.id), { id: `${e.id}~${me.id}`, by: me.id, name: d.name, email: d.email, count, kids: fd.getAll("kids"), tickets, total, paid: { status: "pending" }, at: new Date().toISOString() }];
    await savePending();
  }
  const paid = await Pay.checkout({ title: e.title, lines, kind: "event", ref: `${e.id}~${me.id}`, email: d.email });
  if (!paid) return formError(f, "Payment was cancelled. Nothing was charged.");
  const reg = { id: `${e.id}~${me.id}`, by: me.id, name: d.name, email: d.email, count, kids: fd.getAll("kids"), tickets, total, paid, at: new Date().toISOString() };
  e.registrations = [...e.registrations.filter((r) => r.by !== me.id), reg];
  if (d.email && !me.email) me.email = d.email;
  emit("event.registered", { event: e.title, eventId: e.id, name: d.name, count, kids: reg.kids.length, total, paid: paid.status });
  S.save(); closeSheet(true);
  const { form, need } = formsNeeded(e, reg);
  if (form && need.length) { toast(`You're in. Next: ${form.title}`); formChild = need[0]; formDone = null; go(`form-${form.id}`); }
  else { toast("You're in. See you there!"); render(); }
};
Actions["event-pay"] = (el) => {
  const e = S.get("events", el.dataset.id), r = myRegistration(e);
  Pay.checkout({ title: e.title, lines: e.tickets.filter((t) => r.tickets?.[t.id]).map((t) => ({ label: t.name, amount: t.price, qty: r.tickets[t.id] })), kind: "event", ref: r.id, email: r.email });
};
Actions["event-cancel"] = (el) => {
  const e = S.get("events", el.dataset.id), reg = myRegistration(e);
  if (reg?.total && !el.dataset.sure) {
    openSheet("Cancel and refund?", html`<p>Your ${money(reg.total)} goes back to the card you paid with${reg.paid?.status === "test" ? " (this was a test payment, so nothing moves)" : ". It can take 5 to 10 days to show up"}.</p>
      <div class="btns"><button class="btn danger" data-act="event-cancel" data-id="${e.id}" data-sure="1">Cancel and refund</button><button class="btn ghost" data-act="close-sheet">Keep my tickets</button></div>`);
    return;
  }
  if (reg?.paid?.status === "paid" && typeof Backend !== "undefined" && Backend.on) Backend.refund?.(reg.paid.ref);
  e.registrations = e.registrations.filter((r) => r.by !== S.me().id);
  S.save(); closeSheet(true); toast(reg?.total ? "Cancelled. Your refund is on its way." : "Your spot is cancelled"); render();
};
