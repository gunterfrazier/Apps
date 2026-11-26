// ---------- Event tickets: paying in the app, in person with cash or check, or a part at a time ----------
// Each event with tickets says how people may pay (Admin, Events): in the app, in person with cash or check, and
// whether a part now is fine (with an optional smallest first payment). Every payment is its own ticketPayments record:
//   { eventId, regId, payerId, amount, method: "app" | "cash" | "check", status: "paid" | "test" | "refunded" | "void",
//     checkNo, receivedBy, receivedByName, note, at, ref, receipts: [{ via, to, at, by }], voidReason }
// Payments in the app are written by the server when the payment processor reports them (in the preview, by the app
// as test payments). Cash and checks are recorded by people with "Take cash and check payments" or the people an event
// names to take its payments; each one can send the payer a receipt by email or text. What's owed is the tickets'
// total less what's been paid. The Event tickets report (#tickets, also under Reports) lists every sign-up with what
// they owe, how they paid and who took it, with filters and grouping.

const PAY_METHODS = { app: "In the app", cash: "Cash", check: "Check" };
const PAY_STATUS = { paid: "Paid in full", partial: "Partly paid", unpaid: "Not paid", refunded: "Refunded", free: "Free" };
const regIdOf = (e, r) => r.id || `${e.id}~${r.by}`;
const payCounts = (p) => p.status === "paid" || p.status === "test";
/** Every payment toward one sign-up, oldest first. A sign-up paid in the app before payments were itemized counts as one payment of its total. */
function regPays(e, r) {
  const id = regIdOf(e, r), list = S.list("ticketPayments").filter((p) => p.regId === id);
  if (r.total && r.paid && !r.paid.tracked && ["paid", "test", "refunded"].includes(r.paid.status) && !list.some((p) => p.method === "app"))
    list.push({ id: `legacy-${id}`, eventId: e.id, regId: id, payerId: r.by, amount: r.total, method: "app", status: r.paid.status, at: r.paid.at || r.at, ref: r.paid.ref, legacy: true });
  return list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
const regPaid = (e, r) => round2(regPays(e, r).filter(payCounts).reduce((n, p) => n + (+p.amount || 0), 0));
const regBalance = (e, r) => Math.max(0, round2((r.total || 0) - regPaid(e, r)));
function regStatus(e, r) {
  if (!r.total) return "free";
  const paid = regPaid(e, r);
  if (paid >= r.total - 0.004) return "paid";
  if (paid > 0) return "partial";
  return regPays(e, r).some((p) => p.status === "refunded") ? "refunded" : "unpaid";
}
/** How they paid: "In the app", "Cash", "Cash and check"... */
const regMethods = (e, r) => { const t = listJoin([...new Set(regPays(e, r).filter(payCounts).map((p) => p.method))].map((m) => (PAY_METHODS[m] || m).toLowerCase())); return t.charAt(0).toUpperCase() + t.slice(1); };
/** Who took the money: people's names, or "Paid in the app". */
const regReceivers = (e, r) => listJoin([...new Set(regPays(e, r).filter(payCounts).map((p) => p.method === "app" ? "Paid in the app" : p.receivedByName || nameOf(p.receivedBy) || "Someone"))]) || "";
/** How this event takes payment. Events made before these settings pay in the app. */
const payWays = (e) => ({ app: e.payInApp !== false, person: !!e.payInPerson, partial: !!e.payPartial, deposit: +e.deposit || 0 });
/** May I take cash and checks for this event? */
const canTakePay = (e) => S.isMember() && (S.can("take.payments") || S.can("manage.content") || (e?.collectors || []).includes(S.me().id));
/** May I see the Event tickets report? Report readers see every event; people an event names see theirs. */
const ticketEvents = () => S.list("events").filter((e) => e.signup && (e.tickets || []).length).filter((e) => S.canAny(["take.payments", "manage.content", "view.reports", "view.giving"]) || (e.collectors || []).includes(S.me().id));
const canTickets = () => S.isMember() && (ticketEvents().length > 0 || S.canAny(["take.payments", "manage.content", "view.reports", "view.giving"]));
const statusTag = (s) => html`<span class="tag ${s === "paid" ? "ok" : s === "partial" ? "part" : s === "unpaid" ? "warn" : ""}">${PAY_STATUS[s]}</span>`;

// ----- Paying when you sign up -----
/** The part of the ticket sheet that asks how they'll pay. */
function payWayFields(e) {
  const w = payWays(e);
  if (!w.person && !w.partial) return "";
  return html`<fieldset class="field pay-ways" style="border:0;padding:0"><legend class="flabel">How would you like to pay?</legend>
    ${w.app ? html`<label class="check"><input type="radio" name="payway" value="app" checked data-input="ticket-total"><span>Pay it all now in the app</span></label>` : ""}
    ${w.app && w.partial ? html`<label class="check"><input type="radio" name="payway" value="part" data-input="ticket-total"><span>Pay part now in the app${w.deposit ? ` (at least ${money(w.deposit)})` : ""}, the rest later</span></label>
      <label class="field pay-part" hidden><span>Amount to pay now</span><input type="number" name="partAmount" min="${w.deposit || 1}" step="0.01" inputmode="decimal" placeholder="${w.deposit || ""}"></label>` : ""}
    ${w.person ? html`<label class="check"><input type="radio" name="payway" value="person" ${attr(!w.app, "checked")} data-input="ticket-total"><span>Pay in person with cash or check</span></label>` : ""}
    ${e.payNote ? html`<p class="faint" style="margin:4px 0 0">${e.payNote}</p>` : ""}</fieldset>
    ${textingOn() && (msgRoute("receipts").includes("text") || msgRoute("tickets").includes("text")) ? html`<label class="field"><span>Mobile number for texts about your tickets (optional)</span><input type="tel" name="phone" value="${S.me().phone || ""}" maxlength="30"></label>` : ""}`;
}
Inputs["ticket-total"] = (el) => {
  const f = el.closest("form"), e = S.get("events", $('input[name="id"]', f).value);
  const total = (e.tickets || []).reduce((n, t) => n + (+f[`t_${t.id}`]?.value || 0) * t.price, 0);
  const way = f.payway ? (f.querySelector("input[name=payway]:checked")?.value || "app") : (payWays(e).app ? "app" : "person");
  const part = $(".pay-part", f); if (part) part.hidden = way !== "part";
  $("[data-total]", f).textContent = !total ? "Choose your tickets" : way === "person" ? `Sign up, and pay ${money(total)} in person` : way === "part" ? "Continue to pay part now" : `Continue to pay ${money(total)}`;
};
Forms["event-tickets"] = async (d, f, fd) => {
  const e = S.get("events", d.id), me = S.me(), w = payWays(e);
  const tickets = Object.fromEntries((e.tickets || []).map((t) => [t.id, clamp(parseInt(d[`t_${t.id}`], 10) || 0, 0, 20)]).filter(([, n]) => n));
  const count = Object.values(tickets).reduce((n, x) => n + x, 0);
  if (!count) return formError(f, "Choose at least one ticket.");
  if (!d.name) return formError(f, "Enter your name.");
  for (const t of e.tickets) if (t.limit && tickets[t.id] && ticketsSold(e, t.id) + tickets[t.id] > t.limit) return formError(f, `Only ${t.limit - ticketsSold(e, t.id)} ${t.name.toLowerCase()} tickets are left.`);
  if (e.capacity && registeredCount(e) + count > e.capacity) return formError(f, `Only ${e.capacity - registeredCount(e)} spots are left.`);
  const lines = e.tickets.filter((t) => tickets[t.id]).map((t) => ({ label: t.name, amount: t.price, qty: tickets[t.id] }));
  const total = round2(lines.reduce((n, l) => n + l.amount * l.qty, 0));
  const way = d.payway || (w.app ? "app" : "person");
  let amount = total;
  if (way === "part") {
    amount = round2(+String(d.partAmount || "").replace(/[$,\s]/g, ""));
    if (!(amount > 0)) return formError(f, "Enter how much you'd like to pay now.");
    if (w.deposit && amount < Math.min(w.deposit, total)) return formError(f, `The first payment is at least ${money(Math.min(w.deposit, total))}.`);
    amount = Math.min(amount, total);
  }
  const id = `${e.id}~${me.id}`;
  const old = e.registrations.find((r) => r.by === me.id);
  const reg = { id, by: me.id, name: d.name, email: d.email, phone: String(d.phone || "").trim(), count, kids: fd.getAll("kids"), tickets, total, at: new Date().toISOString(), code: old?.code || ticketCodeNew() };
  const put = (paid) => { e.registrations = [...e.registrations.filter((r) => r.by !== me.id), { ...reg, paid }]; };
  if (d.email && !me.email) me.email = d.email;
  if (way === "person" || total <= 0) {
    put(total > 0 ? { status: "door", tracked: true } : { status: "free" });
    emit("event.registered", { event: e.title, eventId: e.id, name: d.name, count, kids: reg.kids.length, total, paid: "in person" });
    S.save(); closeSheet(true);
    toast(total > 0 ? `You're signed up. Pay ${money(total)} in person.` : "You're in. See you there!");
    return ticketsNext(e, reg, () => ticketSheet(ticketInfo(e, myRegistration(e))));
  }
  if (Pay.live()) { put({ status: "pending", tracked: true }); await savePending(); }
  const paid = await Pay.checkout({ title: e.title, lines: amount < total ? [{ label: `Payment toward ${plural(count, "ticket")}`, amount, qty: 1 }] : lines, kind: "event", ref: id, email: d.email, amount });
  if (!paid) { if (!Pay.live()) return formError(f, "Payment was cancelled. Nothing was charged."); return; }
  put({ status: amount < total ? "partial" : paid.status, ref: paid.ref, at: paid.at, tracked: true });
  const tp = S.add("ticketPayments", { eventId: e.id, regId: id, payerId: me.id, amount, method: "app", status: paid.status === "paid" ? "paid" : "test", at: paid.at, ref: paid.ref, receipts: [] });
  emit("event.registered", { event: e.title, eventId: e.id, name: d.name, count, kids: reg.kids.length, total, paid: paid.status });
  S.save(); closeSheet(true);
  ticketsNext(e, reg, () => paymentDone("ticket", tp.id));
};
function ticketsNext(e, reg, then) {
  const { form, need } = formsNeeded(e, reg);
  if (form && need.length) { toast(`Next: ${form.title}`); formChild = need[0]; formDone = null; go(`form-${form.id}`); }
  else { render(); then?.(); }
}
/** Paying what's left, all of it or part. */
Actions["event-pay"] = (el) => {
  const e = S.get("events", el.dataset.id), r = myRegistration(e), bal = regBalance(e, r), w = payWays(e);
  if (!w.partial) return payToward(e, r, bal);
  openSheet("Pay toward your tickets", html`<form data-form="event-pay" novalidate><input type="hidden" name="id" value="${e.id}">
    <p class="muted" style="margin-top:0">${money(regPaid(e, r))} paid of ${money(r.total)}. ${money(bal)} left.</p>
    <label class="field"><span>Amount</span><input type="number" name="amount" value="${bal}" min="1" max="${bal}" step="0.01" inputmode="decimal"></label>
    <button class="btn block">${icon("give")}Pay now</button></form>`);
};
Forms["event-pay"] = (d, f) => {
  const e = S.get("events", d.id), r = myRegistration(e), bal = regBalance(e, r), amount = round2(Math.min(bal, +d.amount || 0));
  if (!(amount > 0)) return formError(f, "Enter an amount.");
  closeSheet(true); payToward(e, r, amount);
};
async function payToward(e, r, amount) {
  if (!(amount > 0)) return;
  const id = regIdOf(e, r);
  const paid = await Pay.checkout({ title: e.title, lines: [{ label: `Payment toward ${e.title}`, amount, qty: 1 }], kind: "event", ref: id, email: r.email, amount });
  if (!paid) return;
  const tp = S.add("ticketPayments", { eventId: e.id, regId: id, payerId: r.by, amount, method: "app", status: paid.status === "paid" ? "paid" : "test", at: paid.at, ref: paid.ref, receipts: [] });
  r.paid = { status: regBalance(e, r) > 0 ? "partial" : paid.status, ref: paid.ref, at: paid.at, tracked: true };
  S.save(); render(); paymentDone("ticket", tp.id);
}
/** What the payer sees on the event: paid so far, what's left, and each payment. */
function myTicketPanel(e, reg) {
  if (!reg.total) return "";
  const pays = regPays(e, reg).filter((p) => p.status !== "void"), bal = regBalance(e, reg), st = regStatus(e, reg);
  return html`<div class="tk-mine">${statusTag(st)} <b>${money(regPaid(e, reg))}</b> paid of ${money(reg.total)}${bal ? html`. <b>${money(bal)} left</b>` : ""}.
    ${pays.length ? html`<ul class="tk-pays">${pays.map((p) => html`<li>${fmtShort(p.at)}: ${money(p.amount)} ${p.method === "app" ? "in the app" : `${PAY_METHODS[p.method].toLowerCase()}${p.checkNo ? ` #${p.checkNo}` : ""}, to ${p.receivedByName || nameOf(p.receivedBy)}`}${p.status === "test" ? " (test)" : p.status === "refunded" ? ", refunded" : ""}</li>`)}</ul>` : ""}
    ${bal && payWays(e).person ? html`<p class="faint" style="margin:6px 0 0">${e.payNote || "You can pay what's left in person with cash or a check."}</p>` : ""}
    <div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-act="ticket-show" data-event="${e.id}" data-reg="${regIdOf(e, reg)}">${icon("ticket")}Show my ticket</button>
      ${pays.filter((p) => payCounts(p) && !p.legacy).length ? html`<button class="btn ghost sm" data-act="receipt-show" data-kind="ticket" data-id="${pays.filter((p) => payCounts(p) && !p.legacy).at(-1).id}">${icon("note")}Last receipt</button>` : ""}</div></div>`;
}
/** Cancelling: payments in the app go back to the card; cash and checks are returned by the church. */
Actions["event-cancel"] = (el) => {
  const e = S.get("events", el.dataset.id), reg = myRegistration(e);
  const pays = reg ? regPays(e, reg).filter(payCounts) : [], app = pays.filter((p) => p.method === "app"), inPerson = pays.filter((p) => p.method !== "app");
  if (pays.length && !el.dataset.sure) {
    const appSum = app.reduce((n, p) => n + p.amount, 0), cashSum = inPerson.reduce((n, p) => n + p.amount, 0);
    openSheet("Cancel and refund?", html`${appSum ? html`<p>${money(appSum)} you paid in the app goes back to the card you paid with${app.every((p) => p.status === "test") ? " (these were test payments, so nothing moves)" : ". It can take 5 to 10 days to show up"}.</p>` : ""}
      ${cashSum ? html`<p>${money(cashSum)} you paid in person is returned by ${S.church().name}. ${listJoin([...new Set(inPerson.map((p) => p.receivedByName || nameOf(p.receivedBy)).filter(Boolean))])} will be in touch.</p>` : ""}
      <div class="btns"><button class="btn danger" data-act="event-cancel" data-id="${e.id}" data-sure="1">Cancel my tickets</button><button class="btn ghost" data-act="close-sheet">Keep my tickets</button></div>`);
    return;
  }
  for (const p of app) {
    if (p.status === "paid" && typeof Backend !== "undefined" && Backend.on) Backend.refund?.(p.ref);
    const rec = !p.legacy && S.get("ticketPayments", p.id); if (rec) rec.status = "refunded";
  }
  if (inPerson.length) { const takers = [...new Set(inPerson.map((p) => p.receivedBy).filter(Boolean))];
    takers.forEach((u) => notify(u, { kind: "event", title: `${reg.name} cancelled ${e.title}`, body: `They paid ${money(inPerson.filter((p) => p.receivedBy === u).reduce((n, p) => n + p.amount, 0))} in person to you. Please return it.`, link: `#tickets-${e.id}` })); }
  e.registrations = e.registrations.filter((r) => r.by !== S.me().id);
  S.save(); closeSheet(true); toast(pays.length ? "Cancelled. Your refund is on its way." : "Your spot is cancelled"); render();
};

// ----- Taking cash and checks -----
let tkPick = { eventId: "", regId: "" };
const findReg = (eventId, regId) => { const e = S.get("events", eventId); return { e, r: e?.registrations.find((x) => regIdOf(e, x) === regId) }; };
/** On file for a receipt: the sign-up's own email and phone, then their account's. */
const receiptTo = (r) => { const u = S.user(r.by); return { email: r.email || u?.email || "", phone: r.phone || u?.phone || "" }; };
function receiptChoice(r, name = "receipt") {
  const txt = textingOn(), route = msgRoute("receipts"), on = receiptTo(r);
  const first = on.email && route.includes("email") ? "email" : txt && on.phone && route.includes("text") ? "text" : on.email ? "email" : "none";
  return html`<fieldset class="field" style="border:0;padding:0"><legend class="flabel">Send a receipt</legend><div class="radios tk-receipt">
      <label><input type="radio" name="${name}" value="email" ${attr(first === "email", "checked")} data-input="tk-receipt"><span>Email</span></label>
      ${txt ? html`<label><input type="radio" name="${name}" value="text" ${attr(first === "text", "checked")} data-input="tk-receipt"><span>Text</span></label>
      <label><input type="radio" name="${name}" value="both" data-input="tk-receipt"><span>Both</span></label>` : ""}
      <label><input type="radio" name="${name}" value="none" ${attr(first === "none", "checked")} data-input="tk-receipt"><span>Don't send</span></label></div>
    <label class="field tk-to-email" ${attr(!["email", "both"].includes(first), "hidden")}><span>Email</span><input type="email" name="toEmail" value="${on.email}" maxlength="120" placeholder="Their email address"></label>
    <label class="field tk-to-phone" ${attr(!txt || !["text", "both"].includes(first), "hidden")}><span>Mobile number</span><input type="tel" name="toPhone" value="${on.phone}" maxlength="30" placeholder="Their mobile number"></label>
    ${!on.email && (!on.phone || !txt) ? html`<small>No email${txt ? " or phone" : ""} is on file for ${r.name}. Add one to send a receipt.</small>` : html`<small>Filled in from what's on file. Change it if they'd like it somewhere else.</small>`}</fieldset>`;
}
Inputs["tk-receipt"] = (el) => { const f = el.closest("form"), v = el.value; $(".tk-to-email", f).hidden = !["email", "both"].includes(v); const ph = $(".tk-to-phone", f); if (ph) ph.hidden = !textingOn() || !["text", "both"].includes(v); };
/** Record a payment for someone: their sign-up, how much, cash or check, and a receipt. */
Actions["tk-record"] = (el) => {
  const { e, r } = findReg(el.dataset.event, el.dataset.reg);
  if (!e || !r || !canTakePay(e)) return toast("You can't take payments for this event.");
  tkPick = { eventId: e.id, regId: regIdOf(e, r) };
  const bal = regBalance(e, r);
  openSheet(`Payment from ${r.name}`, html`<form data-form="tk-record" novalidate>
    <p class="muted" style="margin-top:0">${e.title}. ${ticketSummary(e, r) || plural(r.count || 1, "ticket")}. ${money(regPaid(e, r))} paid of ${money(r.total)}${bal ? `, ${money(bal)} left` : ", paid in full"}.</p>
    <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Paid with</legend><div class="radios"><label><input type="radio" name="method" value="cash" checked data-input="tk-method"><span>Cash</span></label><label><input type="radio" name="method" value="check" data-input="tk-method"><span>Check</span></label></div></fieldset>
    <label class="field"><span>Amount</span><input type="number" name="amount" value="${bal || ""}" min="0.01" step="0.01" inputmode="decimal" required><small>${bal ? `Less than ${money(bal)} is fine. It's recorded as a partial payment.` : "They've paid in full. Anything more is recorded as extra."}</small></label>
    <label class="field tk-checkno" hidden><span>Check number (optional)</span><input type="text" name="checkNo" maxlength="20" inputmode="numeric"></label>
    ${S.can("manage.content") ? html`<label class="field"><span>Received by</span><select name="receivedBy">${S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)).map((u) => html`<option value="${u.id}" ${attr(u.id === S.me().id, "selected")}>${u.name}${u.id === S.me().id ? " (you)" : ""}</option>`)}</select></label>` : html`<p class="faint">Received by you, ${S.me().name}.</p>`}
    <label class="field"><span>Date received</span><input type="date" name="day" value="${isoDay(new Date())}" max="${isoDay(new Date())}"></label>
    <label class="field"><span>Note (optional)</span><input type="text" name="note" maxlength="200" placeholder="Paid for both kids"></label>
    ${receiptChoice(r)}
    <button class="btn block">${icon("check")}Record payment</button></form>`);
};
Inputs["tk-method"] = (el) => { $(".tk-checkno", el.closest("form")).hidden = el.value !== "check"; };
Forms["tk-record"] = async (d, f) => {
  const { e, r } = findReg(tkPick.eventId, tkPick.regId);
  if (!e || !r || !canTakePay(e)) return formError(f, "You can't take payments for this event.");
  const amount = round2(+String(d.amount || "").replace(/[$,\s]/g, ""));
  if (!(amount > 0) || amount > 100000) return formError(f, "Enter the amount they paid.");
  const way = d.receipt || "none", toEmail = String(d.toEmail || "").trim(), toPhone = String(d.toPhone || "").trim();
  if (["email", "both"].includes(way) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return formError(f, "Add an email address for the receipt, or choose another way.");
  if (["text", "both"].includes(way) && toPhone.replace(/\D/g, "").length < 10) return formError(f, "Add a mobile number for the receipt, or choose another way.");
  const by = S.can("manage.content") && d.receivedBy ? d.receivedBy : S.me().id;
  const day = d.day && d.day < isoDay(new Date()) ? fromIsoDay(d.day, "12:00").toISOString() : new Date().toISOString();
  const p = S.add("ticketPayments", { eventId: e.id, regId: regIdOf(e, r), payerId: r.by, amount, method: d.method === "check" ? "check" : "cash", status: "paid", checkNo: d.method === "check" ? String(d.checkNo || "").trim() : "",
    receivedBy: by, receivedByName: nameOf(by), recordedBy: S.me().id, note: String(d.note || "").trim(), at: day, receipts: [] });
  r.paid = { status: regBalance(e, r) > 0 ? "partial" : "paid", at: day, tracked: true };
  if (!r.email && toEmail) r.email = toEmail; if (!r.phone && toPhone) r.phone = toPhone;
  if (S.user(r.by) && r.by !== S.me().id) notify(r.by, { kind: "event", title: `Payment received for ${e.title}`, body: `${money(amount)} ${p.method === "check" ? "by check" : "in cash"}. ${regBalance(e, r) ? `${money(regBalance(e, r))} left.` : "You're paid in full."}`, link: `#event-${e.id}` });
  emit("event.payment", { event: e.title, eventId: e.id, name: r.name, amount, method: p.method, balance: regBalance(e, r) });
  S.save(); closeSheet(true);
  toast(`${money(amount)} recorded${regBalance(e, r) ? `. ${money(regBalance(e, r))} left` : ". Paid in full"}`);
  if (way !== "none") await sendReceipt(p, way, toEmail, toPhone);
  render();
};

// ----- Receipts -----
function receiptText(p) {
  const { e, r } = findReg(p.eventId, p.regId); if (!e || !r) return "";
  const c = S.church();
  return [`${c.name}: receipt`, `${r.name}, thank you! We received ${money(p.amount)} ${p.method === "app" ? "in the app" : p.method === "check" ? `by check${p.checkNo ? ` #${p.checkNo}` : ""}` : "in cash"} on ${fmtShort(p.at)}${p.method !== "app" ? `, received by ${p.receivedByName || nameOf(p.receivedBy)}` : ""}.`,
    `For: ${e.title}, ${fmtShort(e.start)}. ${ticketSummary(e, r)}.`, `Total ${money(r.total)}. Paid so far ${money(regPaid(e, r))}. ${regBalance(e, r) ? `Balance ${money(regBalance(e, r))}.` : "Paid in full."}`, `Receipt ${String(p.id).slice(-8).toUpperCase()}`].join("\n");
}
/** Email and texts go through the server. Where it can't text (or in the preview), the text opens on this phone, ready to send. */
async function sendReceipt(p, way, toEmail, toPhone) {
  const vias = way === "both" ? ["email", "text"] : [way], done = [];
  for (const via of vias) {
    const to = via === "email" ? toEmail : toPhone;
    if (typeof Backend !== "undefined" && Backend.on && !IN_PREVIEW) {
      try { await Backend.call("ticket-receipt", { churchId: S.state.current, paymentId: p.id, via, to }); done.push(via === "email" ? `emailed to ${to}` : `texted to ${to}`); }
      catch (err) {
        if (via === "text") { textFromPhone(p, to, err.message); continue; }
        toast(`The receipt email couldn't be sent: ${err.message}`); continue;
      }
    } else if (via === "text") { textFromPhone(p, to); continue; }
    else done.push(`emailed to ${to} (a test: the preview doesn't send email)`);
    (p.receipts ||= []).push({ via, to, at: new Date().toISOString(), by: S.me().id });
  }
  if (done.length) { S.save(); toast(`Receipt ${listJoin(done)}`); }
}
function textFromPhone(p, to, why = "") {
  const text = receiptText(p), num = to.replace(/[^\d+]/g, ""), href = `sms:${num}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}`;
  openSheet("Text the receipt", html`<p class="muted" style="margin-top:0">${why ? `${why}. ` : ""}Send it from your phone: the message is ready to go.</p>
    <pre class="tk-receipt-text">${text}</pre><div class="btns"><a class="btn" href="${href}" data-act="tk-texted" data-id="${p.id}" data-to="${to}">${icon("chat")}Open in Messages</a>
    <button class="btn ghost" data-act="copy" data-text="${text}" data-done="Receipt copied">${icon("copy")}Copy</button></div>`);
}
// Opening Messages can't tell us it was sent; tapping the button counts as sending it.
Actions["tk-texted"] = (el) => { const p = S.get("ticketPayments", el.dataset.id); if (p) { (p.receipts ||= []).push({ via: "text", to: el.dataset.to, at: new Date().toISOString(), by: S.me().id, fromPhone: true }); S.save(); } setTimeout(() => { closeSheet(); render(); }, 400); };
Actions["tk-resend"] = (el) => {
  const p = S.get("ticketPayments", el.dataset.id); if (!p) return;
  const { e, r } = findReg(p.eventId, p.regId); if (!r || !canTakePay(e)) return;
  tkPick = { eventId: e.id, regId: p.regId, payId: p.id };
  openSheet("Send a receipt", html`<form data-form="tk-resend" novalidate><pre class="tk-receipt-text">${receiptText(p)}</pre>${receiptChoice(r)}<button class="btn block">${icon("mail")}Send</button></form>`);
};
Forms["tk-resend"] = async (d, f) => {
  const p = S.get("ticketPayments", tkPick.payId), way = d.receipt || "none", toEmail = String(d.toEmail || "").trim(), toPhone = String(d.toPhone || "").trim();
  if (way === "none") return closeSheet();
  if (["email", "both"].includes(way) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return formError(f, "Add an email address.");
  if (["text", "both"].includes(way) && toPhone.replace(/\D/g, "").length < 10) return formError(f, "Add a mobile number.");
  closeSheet(true); await sendReceipt(p, way, toEmail, toPhone); render();
};
/** A mistake: void it, with a reason. It stays in the list, struck through. */
Actions["tk-void"] = (el) => {
  const p = S.get("ticketPayments", el.dataset.id); if (!p) return;
  openSheet("Void this payment?", html`<form data-form="tk-void" novalidate><input type="hidden" name="id" value="${p.id}"><p class="muted" style="margin-top:0">${money(p.amount)} ${PAY_METHODS[p.method].toLowerCase()} on ${fmtShort(p.at)}. It stays in the history, crossed out, and no longer counts toward what they've paid.</p>
    <label class="field"><span>Why?</span><input type="text" name="reason" maxlength="160" required placeholder="Entered twice"></label><div class="btns"><button class="btn danger">Void payment</button><button type="button" class="btn ghost" data-act="close-sheet">Keep it</button></div></form>`);
};
Forms["tk-void"] = (d, f) => {
  const p = S.get("ticketPayments", d.id), { e, r } = findReg(p.eventId, p.regId);
  if (!canTakePay(e) || p.method === "app") return formError(f, "Payments in the app are refunded, not voided.");
  if (!String(d.reason || "").trim()) return formError(f, "Say why, for the record.");
  Object.assign(p, { status: "void", voidReason: d.reason.trim(), voidedBy: S.me().id, voidedAt: new Date().toISOString() });
  if (r) r.paid = { ...(r.paid || {}), status: regPaid(e, r) >= r.total ? "paid" : regPaid(e, r) > 0 ? "partial" : "door", tracked: true };
  S.save(); closeSheet(true); toast("Payment voided"); render();
};
/** Someone who signs up and pays at the door, without the app. */
Actions["tk-walkin"] = (el) => {
  const e = S.get("events", el.dataset.event); if (!canTakePay(e)) return;
  openSheet(`Add a sign-up for ${e.title}`, html`<form data-form="tk-walkin" novalidate><input type="hidden" name="id" value="${e.id}">
    <label class="field"><span>Name</span><input type="text" name="name" required maxlength="80"></label>
    <div class="ticket-list">${e.tickets.map((t) => html`<label class="ticket"><span class="body"><span class="t">${t.name}</span><span class="s">${money(t.price)}</span></span><input type="number" name="t_${t.id}" min="0" max="20" value="0" inputmode="numeric" aria-label="${t.name} tickets"></label>`)}</div>
    <label class="field"><span>Email (optional)</span><input type="email" name="email" maxlength="120"></label><label class="field"><span>Mobile number (optional)</span><input type="tel" name="phone" maxlength="30"></label>
    <button class="btn block">Add sign-up</button><small class="faint">Then record what they paid.</small></form>`);
};
Forms["tk-walkin"] = (d, f) => {
  const e = S.get("events", d.id);
  const tickets = Object.fromEntries(e.tickets.map((t) => [t.id, clamp(parseInt(d[`t_${t.id}`], 10) || 0, 0, 20)]).filter(([, n]) => n));
  const count = Object.values(tickets).reduce((n, x) => n + x, 0);
  if (!String(d.name || "").trim()) return formError(f, "Add their name."); if (!count) return formError(f, "Choose their tickets.");
  const by = `walkin-${uid()}`, total = round2(e.tickets.reduce((n, t) => n + (tickets[t.id] || 0) * t.price, 0));
  const r = { id: `${e.id}~${by}`, by, name: d.name.trim(), email: String(d.email || "").trim(), phone: String(d.phone || "").trim(), count, kids: [], tickets, total, paid: { status: "door", tracked: true }, at: new Date().toISOString(), addedBy: S.me().id };
  e.registrations.push(r); S.save(); closeSheet(true);
  Actions["tk-record"]({ dataset: { event: e.id, reg: r.id } });
};

// ----- The Event tickets report -----
const TK_GROUPS = [["", "No grouping"], ["event", "Event"], ["status", "Payment status"], ["method", "How they paid"], ["receiver", "Received by"], ["ticket", "Ticket type"]];
const tkView = { event: "all", status: "all", method: "all", receiver: "all", q: "", group: "status", show: "signups" };
/** One row per sign-up, with everything the report shows. */
function ticketRows(events = ticketEvents()) {
  return events.flatMap((e) => e.registrations.filter((r) => r.total || (e.tickets || []).length).map((r) => {
    const pays = regPays(e, r), counted = pays.filter(payCounts);
    return { e, r, id: regIdOf(e, r), name: r.name, event: e.title, eventId: e.id, tickets: ticketSummary(e, r) || plural(r.count || 1, "ticket"), ticketIds: Object.keys(r.tickets || {}),
      total: r.total || 0, paid: regPaid(e, r), balance: regBalance(e, r), status: regStatus(e, r), methods: [...new Set(counted.map((p) => p.method))],
      methodText: regMethods(e, r) || (r.paid?.status === "door" ? "Paying in person" : ""), receivers: [...new Set(counted.map((p) => p.method === "app" ? "app" : p.receivedBy || p.receivedByName))],
      receiverText: regReceivers(e, r), last: counted.length ? counted[counted.length - 1].at : "", pays, at: r.at, email: r.email || "", phone: r.phone || "" };
  }));
}
const tkReceiverName = (k) => k === "app" ? "Paid in the app" : nameOf(k) || k || "Someone";
function tkFiltered() {
  const q = tkView.q.trim().toLowerCase();
  return ticketRows().filter((x) => (tkView.event === "all" || x.eventId === tkView.event) && (tkView.status === "all" || x.status === tkView.status)
    && (tkView.method === "all" || (tkView.method === "none" ? !x.methods.length : tkView.method === "mixed" ? x.methods.length > 1 : x.methods.includes(tkView.method)))
    && (tkView.receiver === "all" || x.receivers.includes(tkView.receiver)) && (!q || `${x.name} ${x.email} ${x.event}`.toLowerCase().includes(q)));
}
/** The groups for the chosen grouping: [[label, rows]]. A sign-up with two ticket types or two people who took money shows in each. */
function tkGroups(rows) {
  const g = tkView.group, out = new Map(), put = (k, x) => { if (!out.has(k)) out.set(k, []); out.get(k).push(x); };
  rows.forEach((x) => {
    if (!g) put("All sign-ups", x);
    else if (g === "event") put(x.event, x);
    else if (g === "status") put(PAY_STATUS[x.status], x);
    else if (g === "method") put(x.methods.length > 1 ? "More than one way" : x.methods.length ? PAY_METHODS[x.methods[0]] : x.status === "free" ? "Free" : "Nothing paid yet", x);
    else if (g === "receiver") (x.receivers.length ? x.receivers : [""]).forEach((k) => put(k ? tkReceiverName(k) : "Nothing paid yet", x));
    else if (g === "ticket") x.ticketIds.forEach((t) => put(x.e.tickets.find((y) => y.id === t)?.name || "Ticket", x));
  });
  const order = g === "status" ? Object.values(PAY_STATUS) : null;
  return [...out.entries()].sort((a, b) => order ? order.indexOf(a[0]) - order.indexOf(b[0]) : a[0].localeCompare(b[0]));
}
const tkSum = (rows, k) => round2(rows.reduce((n, x) => n + x[k], 0));
const tkFilterText = () => [tkView.event !== "all" && S.get("events", tkView.event)?.title, tkView.status !== "all" && PAY_STATUS[tkView.status], tkView.method !== "all" && ({ none: "Nothing paid", mixed: "More than one way" }[tkView.method] || PAY_METHODS[tkView.method]),
  tkView.receiver !== "all" && tkReceiverName(tkView.receiver), tkView.q && `"${tkView.q}"`].filter(Boolean).join(", ");
/** Each payment, for the Payments view and exports. */
const tkPayRows = (rows) => rows.flatMap((x) => x.pays.map((p) => ({ x, p }))).sort((a, b) => String(b.p.at).localeCompare(String(a.p.at)));

Screens.tickets = (eventId = "") => {
  if (!canTickets()) return { redirect: "events" };
  const events = ticketEvents();
  if (eventId && events.some((e) => e.id === eventId)) tkView.event = eventId;
  if (tkView.event !== "all" && !events.some((e) => e.id === tkView.event)) tkView.event = "all";
  const all = ticketRows(), rows = tkFiltered(), groups = tkGroups(rows), ev = tkView.event !== "all" && S.get("events", tkView.event);
  const receivers = [...new Set(all.flatMap((x) => x.receivers))];
  const sel = (key, label, opts) => html`<label class="tk-f"><span>${label}</span><select data-change="tk-filter" data-key="${key}">${opts.map(([k, l]) => html`<option value="${k}" ${attr(k === tkView[key], "selected")}>${l}</option>`)}</select></label>`;
  const row = (x) => html`<button class="row tk-row" data-act="tk-open" data-event="${x.eventId}" data-reg="${x.id}"><span class="body"><span class="t">${x.name} ${statusTag(x.status)}</span>
      <span class="s">${tkView.event === "all" && tkView.group !== "event" ? `${x.event}. ` : ""}${x.tickets}. ${x.methodText ? `${x.methodText}. ` : ""}${x.receivers.some((k) => k !== "app") ? `To ${listJoin(x.receivers.filter((k) => k !== "app").map(tkReceiverName))}.` : ""}</span></span>
      <span class="tk-amts"><b>${money(x.paid)}</b><small>of ${money(x.total)}</small>${x.balance ? html`<small class="tk-owe">${money(x.balance)} due</small>` : ""}</span></button>`;
  const payList = (list) => !tkPayRows(list).length ? html`<div class="rows">${empty("No payments yet.")}</div>` : html`<div class="rows">${tkPayRows(list).map(({ x, p }) => html`<button class="row ${p.status === "void" ? "tk-void" : ""}" data-act="tk-open" data-event="${x.eventId}" data-reg="${x.id}"><span class="body"><span class="t">${money(p.amount)} ${PAY_METHODS[p.method]}${p.checkNo ? ` #${p.checkNo}` : ""} from ${x.name}</span>
      <span class="s">${fmtShort(p.at)}. ${p.method === "app" ? "Paid in the app" : `Received by ${p.receivedByName || nameOf(p.receivedBy)}`}${p.status === "test" ? " (test)" : p.status === "refunded" ? ". Refunded" : p.status === "void" ? `. Voided: ${p.voidReason}` : ""}${tkView.event === "all" ? `. ${x.event}` : ""}</span></span></button>`)}</div>`;
  return { title: ev ? `Tickets: ${ev.title}` : "Event tickets", back: S.canAny(["view.reports", "view.giving"]) ? "reports-tickets" : hasAdminTools() ? "admin" : "events",
    body: html`
      <div class="stat-tiles" style="margin-top:14px">${statTile("Signed up", rows.reduce((n, x) => n + (x.r.count || 1), 0).toLocaleString(), plural(rows.length, "sign-up"))}${statTile("Collected", money(tkSum(rows, "paid")), `of ${money(tkSum(rows, "total"))}`)}
        ${statTile("Still owed", money(tkSum(rows, "balance")), plural(rows.filter((x) => x.balance).length, "person", "people"))}${statTile("In person", money(round2(tkPayRows(rows).filter(({ p }) => payCounts(p) && p.method !== "app").reduce((n, { p }) => n + p.amount, 0))), "Cash and checks")}</div>
      <div class="tk-filters">
        ${sel("event", "Event", [["all", "All events"], ...events.sort((a, b) => a.start.localeCompare(b.start)).map((e) => [e.id, `${e.title}, ${fmtShort(e.start)}`])])}
        ${sel("status", "Status", [["all", "Any status"], ...Object.entries(PAY_STATUS)])}
        ${sel("method", "Paid with", [["all", "Any way"], ["app", "In the app"], ["cash", "Cash"], ["check", "Check"], ["mixed", "More than one way"], ["none", "Nothing paid yet"]])}
        ${sel("receiver", "Received by", [["all", "Anyone"], ...receivers.sort().map((k) => [k, tkReceiverName(k)])])}
        ${sel("group", "Group by", TK_GROUPS)}
        <label class="tk-f tk-q"><span>Search</span><input type="search" placeholder="Name or email" value="${tkView.q}" data-input="tk-q" aria-label="Search sign-ups"></label></div>
      <div class="btns tk-tools"><div class="seg" role="group" aria-label="Show"><button class="chip" data-act="tk-show" data-v="signups" aria-pressed="${tkView.show === "signups"}">Sign-ups</button><button class="chip" data-act="tk-show" data-v="payments" aria-pressed="${tkView.show === "payments"}">Payments</button></div>
        ${ev && canTakePay(ev) ? html`<button class="btn sm" data-act="tk-walkin" data-event="${ev.id}">${icon("plus")}Add a sign-up</button>` : ""}
        ${S.canAny(["view.reports", "view.giving"]) ? html`<a class="btn ghost sm" href="#rview-page:tickets">${icon("download")}Print or export</a>` : html`<button class="btn ghost sm" data-act="tk-csv">${icon("download")}CSV</button>`}
        ${tkFilterText() ? html`<button class="btn ghost sm" data-act="tk-clear">Clear filters</button>` : ""}</div>
      ${!rows.length ? html`<div class="rows" style="margin-top:12px">${empty(all.length ? "Nobody matches these filters." : "No tickets sold yet.")}</div>`
        : groups.map(([label, list]) => html`<section class="sec tk-group"><div class="sec-head"><h2>${label} <span class="faint">${list.length}</span></h2><span class="tk-sub">${money(tkSum(list, "paid"))} paid${tkSum(list, "balance") ? html`, <b>${money(tkSum(list, "balance"))} due</b>` : ""}</span></div>
          ${tkView.show === "payments" ? payList(list) : html`<div class="rows">${list.sort((a, b) => a.name.localeCompare(b.name)).map(row)}</div>`}</section>`)}` };
};
Inputs["tk-filter"] = (el) => { tkView[el.dataset.key] = el.value; if (el.dataset.key === "event") history.replaceState(null, "", `#tickets${el.value !== "all" ? `-${el.value}` : ""}`); render(); };
Inputs["tk-q"] = (el) => { tkView.q = el.value; clearTimeout(tkQTimer); tkQTimer = setTimeout(() => { const pos = el.selectionStart; render(); const n = $('input[data-input="tk-q"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); };
let tkQTimer = 0;
Actions["tk-show"] = (el) => { tkView.show = el.dataset.v; render(); };
Actions["tk-clear"] = () => { Object.assign(tkView, { status: "all", method: "all", receiver: "all", q: "" }); if (!location.hash.startsWith("#tickets-")) tkView.event = "all"; render(); };
Actions["tk-csv"] = () => { const t = tkTables(tkFiltered()); saveFile(`event-tickets-${isoDay(new Date())}.csv`, [csvLine(t.signups.head), ...t.signups.rows.map(csvLine)].join("\n") + "\n"); };
/** One sign-up: what they bought, each payment, and the buttons to take a payment or send a receipt. */
Actions["tk-open"] = (el) => {
  const { e, r } = findReg(el.dataset.event, el.dataset.reg); if (!r) return;
  const pays = regPays(e, r), take = canTakePay(e), bal = regBalance(e, r), on = receiptTo(r);
  openSheet(r.name, html`<p class="muted" style="margin-top:0">${e.title}, ${fmtShort(e.start)}. Signed up ${fmtShort(r.at)}.${on.email ? ` ${on.email}.` : ""}${on.phone ? ` ${on.phone}.` : ""}</p>
    <div class="tk-sum">${statusTag(regStatus(e, r))}<span>${ticketSummary(e, r)}</span><span><b>${money(regPaid(e, r))}</b> paid of ${money(r.total)}${bal ? html`, <b class="tk-owe">${money(bal)} due</b>` : ""}</span></div>
    <h3 style="margin:14px 0 6px">Payments</h3>
    ${pays.length ? html`<div class="rows">${pays.map((p) => html`<div class="row ${p.status === "void" ? "tk-void" : ""}"><span class="lead-ic">${icon(p.method === "app" ? "give" : p.method === "check" ? "note" : "check")}</span><span class="body"><span class="t">${money(p.amount)} ${PAY_METHODS[p.method]}${p.checkNo ? ` #${p.checkNo}` : ""}</span>
      <span class="s">${fmtShort(p.at)}. ${p.method === "app" ? `Paid in the app${p.status === "test" ? " (test)" : ""}` : `Received by ${p.receivedByName || nameOf(p.receivedBy)}`}${p.status === "refunded" ? ". Refunded" : ""}${p.status === "void" ? `. Voided: ${p.voidReason}` : ""}${p.note ? `. ${p.note}` : ""}${(p.receipts || []).length ? `. Receipt ${listJoin(p.receipts.map((x) => x.via === "text" ? "texted" : "emailed"))}` : ""}</span></span>
      ${take && !p.legacy && p.status !== "void" ? html`<span class="row-tools"><button class="icon-btn" data-act="tk-resend" data-id="${p.id}" aria-label="Send a receipt">${icon("mail")}</button>${p.method !== "app" ? html`<button class="icon-btn" data-act="tk-void" data-id="${p.id}" aria-label="Void">${icon("x")}</button>` : ""}</span>` : ""}</div>`)}</div>`
      : html`<p class="muted">Nothing paid yet.${r.paid?.status === "door" ? " They're paying in person." : ""}</p>`}
    <div class="btns">${take ? html`<button class="btn" data-act="tk-record" data-event="${e.id}" data-reg="${regIdOf(e, r)}">${icon("plus")}Record cash or check</button>` : ""}
      ${S.user(r.by) && r.by !== S.me().id && S.can("use.chat") ? html`<button class="btn ghost" data-act="dm-start" data-user="${r.by}">${icon("chat")}Message</button>` : ""}</div>`, { wide: true });
};
/** The report as tables: every sign-up, and every payment. */
function tkTables(rows) {
  return {
    signups: { head: ["Name", "Event", "Tickets", "Signed up", "Total", "Paid", "Balance", "Status", "Paid with", "Received by", "Last payment", "Checked in", "Email", "Phone"],
      rows: rows.map((x) => { const c = entryCount(x.e, x.r); return [x.name, x.event, x.tickets, isoDay(x.at || ""), x.total, x.paid, x.balance, PAY_STATUS[x.status], x.methodText, x.receiverText, isoDay(x.last || ""), c.now ? `${c.now} in now` : c.came ? "Came, left" : "No", x.email, x.phone]; }), numeric: [4, 5, 6] },
    payments: { head: ["Date", "Name", "Event", "Amount", "Paid with", "Check number", "Received by", "Status", "Receipt", "Note"],
      rows: tkPayRows(rows).map(({ x, p }) => [isoDay(p.at || ""), x.name, x.event, p.amount, PAY_METHODS[p.method], p.checkNo || "", p.method === "app" ? "Paid in the app" : p.receivedByName || nameOf(p.receivedBy),
        p.status === "void" ? `Voided: ${p.voidReason}` : p.status === "test" ? "Test" : p.status === "refunded" ? "Refunded" : "Paid", (p.receipts || []).map((r) => `${r.via === "text" ? "Texted" : "Emailed"} ${isoDay(r.at || "")}`).join("; "), p.note || ""]), numeric: [3] },
  };
}
// Under Reports too, so it prints, exports and goes into custom reports like the rest. It follows the filters and grouping chosen on #tickets.
REPORT_TABS.splice(REPORT_TABS.findIndex(([k]) => k === "giving"), 0, ["tickets", "Event tickets", () => S.canAny(["view.reports", "view.giving"]) && S.on("events")]);
REPORT_PAGES.tickets = () => {
  const rows = tkFiltered(), t = tkTables(rows), groups = tkGroups(rows);
  const owed = rows.filter((x) => x.balance).sort((a, b) => b.balance - a.balance);
  return html`<section class="sec"><div class="sec-head"><h2>Event tickets</h2><a class="btn sm" href="#tickets">${icon("list")}Open, filter and take payments</a></div>
    ${tkFilterText() || tkView.group ? html`<p class="faint" style="margin-top:0">${tkFilterText() ? `Showing ${tkFilterText()}. ` : ""}${tkView.group ? `Grouped by ${TK_GROUPS.find(([k]) => k === tkView.group)[1].toLowerCase()}.` : ""} Change it under Open, filter and take payments.</p>` : ""}
    <div class="stat-tiles">${statTile("Sign-ups", rows.length.toLocaleString(), plural(new Set(rows.map((x) => x.eventId)).size, "event"))}${statTile("Collected", money(tkSum(rows, "paid")), `of ${money(tkSum(rows, "total"))}`)}${statTile("Still owed", money(tkSum(rows, "balance")), plural(owed.length, "person", "people"))}</div>
    ${groups.length > 1 || tkView.group ? html`<h3 class="sec-head" style="margin-top:18px">Collected by ${TK_GROUPS.find(([k]) => k === tkView.group)?.[1].toLowerCase() || "group"}</h3>${hBarsT(`Collected by ${TK_GROUPS.find(([k]) => k === tkView.group)?.[1].toLowerCase()}`, groups.map(([l, list]) => [l, tkSum(list, "paid")]), money)}
      <div class="panel">${reportTable("tk-groups", "event-tickets-by-group", [TK_GROUPS.find(([k]) => k === tkView.group)?.[1] || "Group", "Sign-ups", "Total", "Paid", "Balance"], groups.map(([l, list]) => [l, list.length, tkSum(list, "total"), tkSum(list, "paid"), tkSum(list, "balance")]), { numeric: [1, 2, 3, 4], title: "Totals by group" })}</div>` : ""}
    <h3 class="sec-head" style="margin-top:18px">Who has signed up</h3><div class="panel">${reportTable("tk-signups", "event-ticket-sign-ups", t.signups.head, t.signups.rows, { numeric: t.signups.numeric, empty: "No tickets sold yet.", title: "Who has signed up" })}</div>
    <h3 class="sec-head" style="margin-top:18px">Payments</h3><div class="panel">${reportTable("tk-payments", "event-ticket-payments", t.payments.head, t.payments.rows, { numeric: t.payments.numeric, empty: "No payments yet.", title: "Payments" })}</div></section>`;
};

// ----- Where it shows up: Admin, the event itself, and the CSV on Admin, Events -----
Actions["event-csv"] = (el) => { const e = S.get("events", el.dataset.id), t = tkTables(ticketRows([e]));
  saveFile(`${slugify(e.title)}-signups.csv`, [csvLine(t.signups.head), ...t.signups.rows.map(csvLine)].join("\n") + "\n"); };
