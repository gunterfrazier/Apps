// ---------- Payment kiosks ----------
// A kiosk can take payments: buy event tickets, pay what's left on tickets, or give. Set it up under Admin, Screens and
// devices, either as a kiosk that only takes payments or by adding a Payments button to a check-in or map kiosk.
// Each kiosk chooses which ways to pay it offers:
//   screen  the church's Stripe, PayPal or Square page opens on the kiosk and the person types their card
//   phone   a QR code: they pay on their own phone and the kiosk moves on when it goes through
//   reader  a Stripe Terminal or Square Terminal card reader paired to the kiosk (Admin, Card readers)
//   cash    cash or a check, with a staff code, when the kiosk is staffed
// Afterwards it shows the receipt and ticket, prints them where printers are set up, and can email or text a copy.
// On the church's own site all of this goes through the kiosk server function, which checks the device and records
// payments the same way as the rest of the app. In the demo, training and the preview everything is a test.
//   device.settings.pay = { events: "all" | [ids], give, partial, ways: { screen, phone, reader, cash }, readerId, cashPinHash }

const KIOSK_ROUTES = { kiosk: ["Check in kids", "kid"], wayfind: ["Find your way", "pin"], paykiosk: ["Payments", "card"], gate: ["Event check-in", "ticket"] };
/** Buttons to a kiosk's other jobs, for the header. */
function kioskSwitch(skip = []) {
  const d = thisDevice(); if (!d) return "";
  const here = location.hash.slice(1).split("-")[0], routes = deviceRoutes(d).map((r) => r.split("-")[0]).filter((r) => KIOSK_ROUTES[r] && r !== here && !skip.includes(r));
  return html`${routes.map((r) => html`<a class="btn ghost sm" href="#${r}">${icon(KIOSK_ROUTES[r][1])}${KIOSK_ROUTES[r][0]}</a>`)}`;
}
function kioskShell(sub, main, cls = "") {
  const c = S.church(), d = thisDevice();
  return html`<div class="kiosk ${cls}"><header class="kiosk-head">${churchMark(c, 46)}<div class="kh-t"><b>${c.name}</b><span>${sub}</span></div>${kioskSwitch()}
    <button class="icon-btn" data-act="${d ? "device-exit" : "pk-exit"}" aria-label="Exit">${icon("lock")}</button></header><main class="kiosk-main">${main}</main></div>`;
}
const payCfg = (d = thisDevice()) => { const p = d?.settings?.pay || {}; return { events: p.events || "all", give: p.give !== false, partial: p.partial !== false, ways: p.ways || { screen: true, phone: true }, readerId: p.readerId || "", cashPinHash: p.cashPinHash || "" }; };
const kioskLive = () => Backend.on && !IN_PREVIEW && !practiceMode() && Pay.live();
const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const cashPinHash = (churchId, pin) => sha256hex(`cashpin:${churchId}:${pin}`);

const kp = { step: "home", eventId: "", tickets: {}, regId: "", amount: 0, fund: "", name: "", email: "", phone: "", kind: "", checkout: "", url: "", receipt: null, ticket: null, error: "", q: "", found: null, touched: Date.now(), way: "" };
/** Tickets held for someone who walked away without paying are let go. */
function kpRelease() {
  if (!kp.regId || !kp.eventId || kp.step === "done") return;
  const regId = kp.regId;
  if (kioskLive()) Backend.call("kiosk", { action: "release", churchId: S.state.current, regId }).catch(() => {});
  else { const e = S.get("events", regId.split("~")[0]); if (e) { e.registrations = e.registrations.filter((r) => !(regIdOf(e, r) === regId && r.held)); S.save(); } }
}
const kpReset = () => kpRelease() || Object.assign(kp, { step: "home", eventId: "", tickets: {}, regId: "", amount: 0, fund: "", name: "", email: "", phone: "", kind: "", checkout: "", url: "", receipt: null, ticket: null, error: "", q: "", found: null, way: "" });
const KP_IDLE = 120e3;
setInterval(() => { if (location.hash === "#paykiosk" && kp.step !== "home" && !["phone", "reader", "screen"].includes(kp.step) && Date.now() - kp.touched > KP_IDLE) { kpReset(); render(); } }, 15e3);
document.addEventListener("pointerdown", () => { kp.touched = Date.now(); }, true);
/** Events this kiosk sells tickets for. */
function kpEvents() {
  const cfg = payCfg(), now = new Date().toISOString();
  return S.list("events").filter((e) => e.signup && (e.tickets || []).length && (e.end || e.start) >= now && payWays(e).app !== false && (cfg.events === "all" || cfg.events.includes(e.id))).sort((a, b) => a.start.localeCompare(b.start));
}
const kpTotal = (e) => round2((e?.tickets || []).reduce((n, t) => n + (kp.tickets[t.id] || 0) * t.price, 0));
const kpCount = () => Object.values(kp.tickets).reduce((n, x) => n + x, 0);

Screens.paykiosk = () => {
  const d = thisDevice();
  if (!S.isMember() || !(d || S.can("manage.devices"))) return { redirect: "home" };
  const cfg = payCfg(), c = S.church(), events = kpEvents();
  const big = (act, ic, t, s, extra = "") => html`<button class="kiosk-big" data-act="${act}" ${raw(extra)}>${icon(ic)}<span><b>${t}</b><small>${s}</small></span></button>`;
  let main = "";
  switch (kp.step) {
    case "home": main = html`<h1 class="kiosk-h">How can we help?</h1><div class="kiosk-bigs">
        ${events.length ? big("pk-go", "ticket", "Buy tickets", `${plural(events.length, "event")} with tickets`, 'data-step="events"') : ""}
        ${events.length || S.list("events").some((e) => (e.tickets || []).length) ? big("pk-go", "search", "Pay for my tickets", "Find your sign-up and pay what's left", 'data-step="find"') : ""}
        ${cfg.give && S.on("giving") ? big("pk-go", "give", "Give", `To ${c.name}`, 'data-step="give"') : ""}</div>
        ${!kioskLive() ? html`<p class="kiosk-hint">${practiceMode() || IN_PREVIEW || !Backend.on ? "Practice: payments here are tests and nothing is charged." : "Online payments aren't connected yet, so payments here are tests."}</p>` : ""}`; break;
    case "events": main = html`<h1 class="kiosk-h">Which event?</h1><div class="kiosk-bigs">${events.map((e) => big("pk-event", "ticket", e.title, `${fmtWhen(e.start)}. From ${money(Math.min(...e.tickets.map((t) => t.price)))}`, `data-id="${e.id}"`))}</div>${kpBack()}`; break;
    case "tickets": {
      const e = S.get("events", kp.eventId), total = kpTotal(e);
      main = html`<h1 class="kiosk-h">${e.title}</h1><p class="kiosk-hint">${fmtWhen(e.start)}${e.location ? `. ${e.location}` : ""}</p>
        <div class="pk-tickets">${e.tickets.map((t) => { const left = t.limit ? t.limit - ticketsSold(e, t.id) : null; return html`<div class="pk-ticket"><span><b>${t.name}</b><small>${money(t.price)}${left != null ? `. ${left > 0 ? `${left} left` : "Sold out"}` : ""}</small></span>
          <div class="stepper big"><button class="icon-btn" data-act="pk-t" data-id="${t.id}" data-d="-1" aria-label="One fewer ${t.name}">−</button><b>${kp.tickets[t.id] || 0}</b><button class="icon-btn" data-act="pk-t" data-id="${t.id}" data-d="1" aria-label="One more ${t.name}" ${attr(left != null && (kp.tickets[t.id] || 0) >= left, "disabled")}>+</button></div></div>`; })}</div>
        <form data-form="pk-who" class="pk-who" novalidate><label class="field"><span>Your name</span><input type="text" name="name" value="${kp.name}" required maxlength="80" autocomplete="off"></label>
          <label class="field"><span>Email for your receipt and ticket (optional)</span><input type="email" name="email" value="${kp.email}" maxlength="120" autocomplete="off"></label>
          ${textingOn() && msgRoute("tickets").includes("text") ? html`<label class="field"><span>Mobile number for your ticket by text (optional)</span><input type="tel" name="phone" value="${kp.phone}" maxlength="30" autocomplete="off"></label>` : ""}
          <button class="btn block big" ${attr(!total, "disabled")}>${total ? `Continue: ${money(total)}` : "Choose your tickets"}</button></form>${kpBack("events")}`; break;
    }
    case "find": {
      const hits = kp.found || [];
      main = html`<h1 class="kiosk-h">Find your tickets</h1><form data-form="pk-find" class="kiosk-search" autocomplete="off" novalidate><input type="text" name="q" value="${kp.q}" placeholder="Your name, or the code on your ticket" aria-label="Your name or ticket code"><button class="btn big">${icon("search")}Find</button></form>
        ${kp.found ? hits.length ? html`<div class="kiosk-fams">${hits.map((h) => html`<button class="kiosk-fam" data-act="pk-pick" data-reg="${h.regId}" data-bal="${h.balance}" data-name="${h.name}" data-title="${h.title}"><span class="t">${h.name}</span><span class="s">${h.title}. ${h.balance ? `${money(h.balance)} to pay` : "Paid in full"}</span>${icon("chev")}</button>`)}</div>`
          : html`<p class="kiosk-hint">We couldn't find tickets under that name. Try your full name, or the code under the barcode on your ticket.</p>` : ""}${kpBack()}`; break;
    }
    case "balance": main = html`<h1 class="kiosk-h">${kp.name}</h1><p class="kiosk-hint">${kp.title}. ${money(kp.balance)} left to pay.</p>
        <form data-form="pk-amount" class="pk-who" novalidate>${cfg.partial ? html`<label class="field"><span>Amount to pay now</span><input type="number" name="amount" value="${kp.balance}" min="1" max="${kp.balance}" step="0.01" inputmode="decimal"></label>` : html`<input type="hidden" name="amount" value="${kp.balance}">`}
          <button class="btn block big">Continue</button></form>${kpBack("find")}`; break;
    case "give": main = html`<h1 class="kiosk-h">Give to ${c.name}</h1><form data-form="pk-give" class="pk-who" novalidate>
        <div class="chips pk-amounts">${[25, 50, 100, 250].map((a) => html`<button type="button" class="chip" data-act="pk-amt" data-v="${a}" aria-pressed="${kp.amount === a}">${money(a)}</button>`)}</div>
        <label class="field"><span>Amount</span><input type="number" name="amount" value="${kp.amount || ""}" min="1" step="0.01" inputmode="decimal" required></label>
        ${c.funds.length > 1 ? html`<label class="field"><span>Fund</span><select name="fund">${c.funds.map((f) => html`<option value="${f.id}" ${attr(f.id === kp.fund, "selected")}>${f.name}</option>`)}</select></label>` : html`<input type="hidden" name="fund" value="${c.funds[0]?.id || ""}">`}
        <label class="field"><span>Your name (optional)</span><input type="text" name="name" value="${kp.name}" maxlength="80" autocomplete="off"></label>
        <label class="field"><span>Email for a receipt (optional)</span><input type="email" name="email" value="${kp.email}" maxlength="120" autocomplete="off"></label>
        <button class="btn block big">Continue</button></form>${kpBack()}`; break;
    case "method": main = html`<h1 class="kiosk-h">${money(kp.amount)}</h1><p class="kiosk-hint">How would you like to pay?</p><div class="kiosk-bigs">
        ${cfg.ways.reader && (cfg.readerId || !kioskLive()) ? big("pk-way", "card", "Tap or insert a card", "On the card reader", 'data-way="reader"') : ""}
        ${cfg.ways.screen ? big("pk-way", "screen", "Type in a card here", Pay.name() ? `Through ${Pay.name()}` : "Card, Apple Pay or Google Pay", 'data-way="screen"') : ""}
        ${cfg.ways.phone ? big("pk-way", "qr", "Pay on my phone", "Scan a code and pay on your own phone", 'data-way="phone"') : ""}
        ${cfg.ways.cash ? big("pk-way", "give", "Cash or check", "With a staff member", 'data-way="cash"') : ""}</div>${kpBack(kp.kind === "gift" ? "give" : kp.regId && !kp.eventId ? "balance" : "tickets")}`; break;
    case "phone": main = html`<h1 class="kiosk-h">Scan to pay on your phone</h1><div class="pk-qr">${raw(qrSvg(kp.url, { size: 300 }))}</div>
        <p class="kiosk-hint">Open your phone's camera and point it at the code. This screen moves on by itself once you've paid.</p>
        <p class="kiosk-hint"><span class="ai-dot"></span> Waiting for the payment...</p>
        ${!kioskLive() ? html`<button class="btn ghost" data-act="pk-sim">Practice: pretend the phone paid</button>` : ""}<button class="btn ghost" data-act="pk-cancel">Cancel</button>`; break;
    case "reader": main = html`<h1 class="kiosk-h">Tap, insert or swipe your card</h1><p class="kiosk-hint">${money(kp.amount)} is on the card reader.</p><div class="pk-reader">${icon("card")}</div>
        <p class="kiosk-hint"><span class="ai-dot"></span> Waiting for the card reader...</p><button class="btn ghost" data-act="pk-cancel">Cancel</button>`; break;
    case "screen": main = html`<h1 class="kiosk-h">Opening the payment page...</h1><p class="kiosk-hint"><span class="ai-dot"></span> One moment.</p>`; break;
    case "cash": main = html`<h1 class="kiosk-h">${money(kp.amount)} in cash or by check</h1><form data-form="pk-cash" class="pk-who" novalidate>
        <div class="radios"><label><input type="radio" name="method" value="cash" checked data-input="pk-cashway"><span>Cash</span></label><label><input type="radio" name="method" value="check" data-input="pk-cashway"><span>Check</span></label></div>
        <label class="field pk-checkno" hidden><span>Check number</span><input type="text" name="checkNo" maxlength="20" inputmode="numeric"></label>
        <label class="field"><span>Staff name</span><input type="text" name="staff" maxlength="60" required autocomplete="off"></label>
        <label class="field"><span>Staff code</span><input type="password" name="pin" inputmode="numeric" maxlength="8" required autocomplete="off"><small>The kiosk's cash code, from whoever set it up.</small></label>
        <button class="btn block big">${icon("check")}Record ${money(kp.amount)}</button></form>${kpBack("method")}`; break;
    case "done": main = kpDone(); break;
    case "error": main = html`<h1 class="kiosk-h">That didn't go through</h1><p class="kiosk-hint">${kp.error || "Nothing was charged."}</p><div class="btns" style="justify-content:center"><button class="btn big" data-act="pk-go" data-step="method">Try again</button><button class="btn ghost" data-act="pk-home">Start over</button></div>`; break;
  }
  return { kiosk: true, page: kioskShell(kp.step === "home" ? "Payments" : kp.kind === "gift" ? "Giving" : "Tickets", main, "pay-kiosk") };
};
const kpBack = (to = "home") => html`<button class="linkish kiosk-wide" data-act="pk-go" data-step="${to}">Back</button>`;
function kpDone() {
  const r = kp.receipt, t = kp.ticket, pr = printPrefs().printers || {};
  return html`<div class="pay-done"><span class="big-check">${icon("check")}</span><h1 class="kiosk-h">Payment processed</h1>
    <p class="kiosk-hint">${money(r.amount)}${r.test ? " (test)" : ""}: ${r.title}.${r.balance ? ` ${money(r.balance)} left to pay.` : ""} Thank you${kp.name ? `, ${firstName(kp.name)}` : ""}!</p>
    <div class="pk-done-art">${t ? html`<div class="receipt-art">${raw(ticketSvg(t, r.church))}</div>` : ""}<div class="receipt-art">${raw(receiptSvg(r))}</div></div>
    <div class="btns" style="justify-content:center">
      <button class="btn big" data-act="pk-print" data-job="receipt">${icon("printer")}Print receipt${pr.receipt ? "" : ""}</button>
      ${t ? html`<button class="btn big" data-act="pk-print" data-job="ticket">${icon("ticket")}Print ticket</button>` : ""}
      ${kp.email || kp.phone ? "" : html`<button class="btn ghost big" data-act="pk-send-ask">${icon("mail")}Send me a copy</button>`}
      <button class="btn ghost big" data-act="pk-home">Done</button></div>
    ${t ? html`<p class="kiosk-hint">Scan the QR code on the ticket with your phone to keep it, or print it. Show it at the door.</p><div class="pk-qr small">${raw(qrSvg(t.link, { size: 160 }))}</div>` : ""}</div>`;
}
Actions["pk-exit"] = () => { kpReset(); go(hasAdminTools() ? "devices" : "home"); };
Actions["pk-home"] = () => { kpReset(); render(); };
Actions["pk-go"] = (el) => { kp.step = el.dataset.step; if (kp.step === "home") kpReset(); if (kp.step === "find") kp.found = null; render(); };
Actions["pk-event"] = (el) => { Object.assign(kp, { step: "tickets", eventId: el.dataset.id, tickets: {}, kind: "event", regId: "" }); render(); };
Actions["pk-t"] = (el) => { const id = el.dataset.id; kp.tickets[id] = clamp((kp.tickets[id] || 0) + +el.dataset.d, 0, 20); const f = $("form[data-form=pk-who]"); if (f) { kp.name = f.name.value; kp.email = f.email.value; kp.phone = f.phone?.value || ""; } render(); };
Actions["pk-amt"] = (el) => { kp.amount = +el.dataset.v; const i = $("form[data-form=pk-give] input[name=amount]"); if (i) i.value = kp.amount; $$("[data-act=pk-amt]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.v === kp.amount))); };
Inputs["pk-cashway"] = (el) => { $(".pk-checkno", el.closest("form")).hidden = el.value !== "check"; };
Forms["pk-who"] = async (d, f) => {
  const e = S.get("events", kp.eventId), total = kpTotal(e);
  if (!kpCount()) return formError(f, "Choose your tickets.");
  if (!String(d.name || "").trim()) return formError(f, "Enter your name.");
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return formError(f, "Check the email address.");
  for (const t of e.tickets) if (t.limit && kp.tickets[t.id] && ticketsSold(e, t.id) + kp.tickets[t.id] > t.limit) return formError(f, `Only ${t.limit - ticketsSold(e, t.id)} ${t.name.toLowerCase()} tickets are left.`);
  Object.assign(kp, { name: d.name.trim(), email: String(d.email || "").trim(), phone: String(d.phone || "").trim(), amount: total, kind: "event" });
  // The sign-up is made first, so the tickets are held while they pay. It's removed again if they don't.
  try {
    if (kioskLive()) { const r = await Backend.call("kiosk", { action: "signup", churchId: S.state.current, eventId: e.id, tickets: kp.tickets, name: kp.name, email: kp.email, phone: kp.phone }); kp.regId = r.regId; kp.amount = r.total; }
    else { const by = `walkin-${uid()}`, reg = { id: `${e.id}~${by}`, by, name: kp.name, email: kp.email, phone: kp.phone, count: kpCount(), kids: [], tickets: { ...kp.tickets }, total, paid: { status: "door", tracked: true }, at: new Date().toISOString(), code: ticketCodeNew(), kiosk: thisDevice()?.id || "kiosk", held: true };
      e.registrations.push(reg); S.save(); kp.regId = reg.id; }
  } catch (err) { return formError(f, err.message || "The tickets couldn't be held. Try again."); }
  kp.step = "method"; render();
};
Forms["pk-find"] = async (d, f) => {
  const q = String(d.q || "").trim(); kp.q = q; if (q.length < 2) return formError(f, "Type at least two letters of your name.");
  try {
    if (kioskLive()) kp.found = (await Backend.call("kiosk", { action: "find", churchId: S.state.current, q })).found;
    else {
      const code = q.toUpperCase().replace(/[^A-Z0-9]/g, ""), words = q.toLowerCase().split(/\s+/);
      kp.found = S.list("events").filter((e) => (e.tickets || []).length).flatMap((e) => e.registrations.filter((r) => r.total && ((r.code && r.code === code) || words.every((w) => r.name.toLowerCase().split(/\s+/).some((x) => x.startsWith(w))))).map((r) => ({ regId: regIdOf(e, r), name: r.name, title: e.title, balance: regBalance(e, r) }))).slice(0, 8);
    }
  } catch (err) { return formError(f, err.message); }
  render();
};
Actions["pk-pick"] = (el) => { const bal = +el.dataset.bal; if (!bal) { toast("Those tickets are paid in full"); return; } Object.assign(kp, { step: "balance", regId: el.dataset.reg, balance: bal, name: el.dataset.name, title: el.dataset.title, kind: "event", eventId: "" }); render(); };
Forms["pk-amount"] = (d, f) => { const a = round2(Math.min(kp.balance, +d.amount || 0)); if (!(a > 0)) return formError(f, "Enter an amount."); kp.amount = a; kp.step = "method"; render(); };
Forms["pk-give"] = (d, f) => {
  const a = round2(+String(d.amount || "").replace(/[$,\s]/g, "")); if (!(a >= 1)) return formError(f, "Enter an amount of at least $1."); if (a > 100000) return formError(f, "For larger gifts, please see the church office.");
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return formError(f, "Check the email address.");
  Object.assign(kp, { amount: a, fund: d.fund, name: String(d.name || "").trim(), email: String(d.email || "").trim(), kind: "gift", step: "method" }); render();
};
Actions["pk-way"] = async (el) => {
  const way = el.dataset.way; kp.way = way;
  if (way === "cash") { kp.step = "cash"; return render(); }
  const live = kioskLive();
  if (!live) {
    if (way === "screen") { const paid = await Pay.checkout({ title: kp.kind === "gift" ? `Gift to ${S.church().name}` : "Tickets", lines: [{ label: kp.kind === "gift" ? fundName(kp.fund) : "Tickets", amount: kp.amount }], kind: kp.kind });
      if (!paid) { kp.step = "method"; return render(); } return kpPracticeDone("card"); }
    if (way === "phone") { kp.url = appLink(`paid-${kp.kind}`); kp.step = "phone"; return render(); }
    if (way === "reader") { kp.step = "reader"; render(); setTimeout(() => { if (kp.step === "reader") kpPracticeDone("reader"); }, 4000); return; }
  }
  try {
    const body = { churchId: S.state.current, kind: kp.kind, regId: kp.regId, fund: kp.fund, amount: kp.amount, name: kp.name, email: kp.email, phone: kp.phone, origin: location.origin + location.pathname };
    if (way === "reader") { const r = await Backend.call("kiosk", { action: "reader-start", ...body }); kp.checkout = r.checkout; kp.step = "reader"; render(); return kpPoll(); }
    const r = await Backend.call("kiosk", { action: "checkout", mode: way, ...body });
    kp.checkout = r.checkout; kp.url = r.url;
    if (way === "screen") { kp.step = "screen"; render(); kpRemember(); location.href = r.url; return; }
    kp.step = "phone"; render(); kpPoll();
  } catch (err) { kp.error = err.message; kp.step = "error"; render(); }
};
/** Asks the server every few seconds whether a phone or card reader payment went through. */
let kpTimer = 0;
function kpPoll(started = Date.now()) {
  clearTimeout(kpTimer);
  kpTimer = setTimeout(async () => {
    if (!["phone", "reader", "screen"].includes(kp.step) || !kp.checkout) return;
    try {
      const r = await Backend.call("kiosk", { action: "status", churchId: S.state.current, checkout: kp.checkout });
      if (r.status === "paid") return kpFinish(r);
      if (r.status === "failed") { kp.error = r.error || "The card was declined. Nothing was charged."; kp.step = "error"; return render(); }
    } catch { /* try again */ }
    if (Date.now() - started > 15 * 60e3) { kp.error = "The payment wasn't finished in time. Nothing was charged."; kp.step = "error"; return render(); }
    kpPoll(started);
  }, 2500);
}
function kpFinish(r) {
  kp.receipt = r.receipt; kp.ticket = r.ticket || null; kp.step = "done"; render();
  const pr = printPrefs().printers || {};
  // With printers chosen, the receipt and ticket print by themselves.
  if (pr.receipt) printJob("receipt", `<div class="pj-receipt">${receiptSvg(kp.receipt)}</div>`, { title: "Receipt" });
  if (pr.ticket && kp.ticket) printJob("ticket", `<div class="pj-ticket">${ticketSvg(kp.ticket, kp.receipt.church)}</div>`, { title: "Ticket" });
  if ((kp.email || kp.phone) && kioskLive()) Backend.call("kiosk", { action: "send", churchId: S.state.current, checkout: kp.checkout, email: kp.email, phone: kp.phone }).catch(() => {});
}
Actions["pk-cancel"] = async () => {
  clearTimeout(kpTimer);
  if (kp.step === "reader" && kioskLive() && kp.checkout) await Backend.call("kiosk", { action: "reader-cancel", churchId: S.state.current, checkout: kp.checkout }).catch(() => {});
  kp.step = "method"; kp.checkout = ""; render();
};
Actions["pk-sim"] = () => kpPracticeDone("phone");
/** Practice payments: recorded here as tests. */
function kpPracticeDone(way, extra = {}) {
  const c = S.church(), at = new Date().toISOString();
  if (kp.kind === "gift") {
    const g = S.add("gifts", { by: null, name: kp.name || "Kiosk gift", fundId: kp.fund, amount: kp.amount, frequency: "once", method: extra.method || (way === "reader" ? "reader" : "kiosk"), at, demo: true, status: extra.method ? "paid" : "test", ref: `test_${uid()}`, kiosk: thisDevice()?.id || "kiosk" });
    S.save(); return kpFinish({ receipt: receiptFor("gift", g.id) });
  }
  const [eventId] = kp.regId.split("~"), e = S.get("events", eventId), r = e?.registrations.find((x) => regIdOf(e, x) === kp.regId);
  if (!r) { kp.error = "That sign-up wasn't found."; kp.step = "error"; return render(); }
  delete r.held;
  const p = S.add("ticketPayments", { eventId, regId: kp.regId, payerId: r.by, amount: kp.amount, method: extra.method || "app", status: extra.method ? "paid" : "test", at, ref: `test_${uid()}`, receipts: [], checkNo: extra.checkNo || "",
    receivedBy: "", receivedByName: extra.staff ? `${extra.staff} at ${thisDevice()?.name || "the kiosk"}` : "", kiosk: thisDevice()?.id || "kiosk", via: way });
  r.paid = { status: regBalance(e, r) > 0 ? "partial" : extra.method ? "paid" : "test", at, tracked: true }; S.save();
  kpFinish({ receipt: receiptFor("ticket", p.id), ticket: ticketInfo(e, r) });
}
Forms["pk-cash"] = async (d, f) => {
  const cfg = payCfg(), staff = String(d.staff || "").trim();
  if (!staff) return formError(f, "Enter the staff member's name.");
  if (!d.pin) return formError(f, "Enter the staff code.");
  try {
    if (kioskLive()) {
      const r = await Backend.call("kiosk", { action: "cash", churchId: S.state.current, kind: kp.kind, regId: kp.regId, fund: kp.fund, amount: kp.amount, method: d.method, checkNo: d.checkNo, pin: d.pin, staff, name: kp.name, email: kp.email, phone: kp.phone });
      kp.checkout = r.checkout || ""; return kpFinish(r);
    }
    if (!cfg.cashPinHash || (await cashPinHash(S.state.current, d.pin)) !== cfg.cashPinHash) return formError(f, cfg.cashPinHash ? "That's not the staff code." : "This kiosk has no staff code yet. Set one under Admin, Screens and devices.");
    kpPracticeDone("cash", { method: d.method === "check" ? "check" : "cash", checkNo: d.checkNo, staff });
  } catch (err) { formError(f, err.message || "It couldn't be recorded."); }
};
Actions["pk-print"] = (el) => {
  if (el.dataset.job === "ticket" && kp.ticket) printJob("ticket", `<div class="pj-ticket">${ticketSvg(kp.ticket, kp.receipt.church)}</div>`, { title: "Ticket" });
  else if (kp.receipt) printJob("receipt", `<div class="pj-receipt">${receiptSvg(kp.receipt)}</div>`, { title: "Receipt" });
};
Actions["pk-send-ask"] = () => openSheet("Send me a copy", html`<form data-form="pk-send" novalidate>
  <label class="field"><span>Email</span><input type="email" name="email" maxlength="120" autocomplete="off"></label>
  ${textingOn() && (msgRoute("receipts").includes("text") || msgRoute("tickets").includes("text")) ? html`<label class="field"><span>Or a mobile number for a text</span><input type="tel" name="phone" maxlength="30" autocomplete="off"></label>` : ""}
  <button class="btn block big">${icon("send")}Send</button></form>`);
Forms["pk-send"] = async (d, f) => {
  const email = String(d.email || "").trim(), phone = String(d.phone || "").trim();
  if (!email && !phone) return formError(f, "Enter an email address or a mobile number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return formError(f, "Check the email address.");
  try { if (kioskLive() && kp.checkout) await Backend.call("kiosk", { action: "send", churchId: S.state.current, checkout: kp.checkout, email, phone }); }
  catch (err) { return formError(f, err.message); }
  Object.assign(kp, { email, phone }); closeSheet(true); toast(kioskLive() ? "Sent" : "Practice: nothing was sent"); render();
};
// Coming back to the kiosk from the processor's page: ?kpaid=co_... or ?kunpaid=co_...
const KP_SAVE = "our-faithful-paykiosk";
function kpRemember() { try { sessionStorage.setItem(KP_SAVE, JSON.stringify({ ...kp, receipt: null, ticket: null })); } catch {} }
const kpReturn = (() => {
  const q = new URLSearchParams(location.search), id = q.get("kpaid") || q.get("kunpaid");
  if (!id) return null;
  try { Object.assign(kp, JSON.parse(sessionStorage.getItem(KP_SAVE) || "{}")); sessionStorage.removeItem(KP_SAVE); } catch {}
  history.replaceState(null, "", location.pathname + "#paykiosk");
  if (q.has("kunpaid")) { kp.step = "method"; setTimeout(() => toast("Payment was cancelled. Nothing was charged."), 400); }
  else { kp.checkout = id; kp.step = "screen"; setTimeout(() => kpPoll(), 800); }
  return id;
})();

// ----- After paying on a phone from a kiosk's QR code -----
Screens.thanks = (tail = "") => ({ page: html`<div class="welcome"><div class="wrap"><div class="panel done-panel" style="margin-top:40px;text-align:center">
  ${tail === "cancelled" ? html`<h1>Payment cancelled</h1><p class="muted">Nothing was charged. You can scan the code on the kiosk again.</p>`
    : html`<span class="big-check">${icon("check")}</span><h1>Thank you!</h1><p class="muted">Your payment went through. The kiosk shows your receipt. You can close this page.</p>`}</div></div></div>` });

// ----- Admin, Card readers -----
AdminScreens.readers = () => {
  const stop = guard("manage.devices"); if (stop) return stop;
  const c = S.church(), list = c.cardReaders || [], prov = Pay.provider(), live = Backend.on && !practiceMode(c) && !IN_PREVIEW;
  const kiosks = S.list("devices").filter((d) => d.type === "kiosk");
  return { title: "Card readers", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">A card reader lets people tap, insert or swipe a card at a kiosk. It works with the church's Stripe account (Stripe Terminal readers like the BBPOS WisePOS E or Stripe Reader S700) or Square account (Square Terminal). Buy readers from Stripe or Square, then pair each one here and choose its kiosk under Screens and devices.</p>
    ${!prov && live ? html`<p class="room-msg warn" role="note">${icon("info")}<span>Connect Stripe or Square under Admin, Giving first.</span></p>` : prov === "paypal" ? html`<p class="room-msg warn" role="note">${icon("info")}<span>PayPal doesn't offer card readers the app can use. Kiosks can still take cards on screen or on people's phones.</span></p>` : ""}
    <div class="rows" style="margin-top:12px">${list.length ? list.map((r) => { const k = kiosks.find((d) => d.settings?.pay?.readerId === r.id);
      return html`<div class="row"><span class="lead-ic">${icon("card")}</span><span class="body"><span class="t">${r.label}</span><span class="s">${r.provider === "square" ? "Square Terminal" : "Stripe Terminal"}${r.status === "pairing" ? `. Waiting: enter code ${r.code} on the Terminal` : ""}${k ? `. At ${k.name}` : ". Not at a kiosk yet"}${r.test ? ". Practice" : ""}</span></span>
        <span class="row-tools">${r.status === "pairing" ? html`<button class="btn ghost sm" data-act="reader-check" data-id="${r.id}">Check</button>` : ""}<button class="icon-btn" data-act="reader-remove" data-id="${r.id}" aria-label="Remove">${icon("trash")}</button></span></div>`; }) : empty("No card readers yet.")}</div>
    <div class="btns"><button class="btn" data-act="reader-add" ${attr(live && !["stripe", "square"].includes(prov), "disabled")}>${icon("plus")}Pair a card reader</button><a class="btn ghost" href="#devices">${icon("screen")}Kiosks</a></div>` };
};
Actions["reader-add"] = () => {
  const c = S.church(), prov = Pay.provider() || "stripe", loc = c.locations[0];
  openSheet("Pair a card reader", html`<form data-form="reader-add" novalidate><input type="hidden" name="provider" value="${prov}">
    <label class="field"><span>Name</span><input type="text" name="label" required maxlength="40" placeholder="Lobby reader"></label>
    ${prov === "square" ? html`<p class="muted">After you tap Pair, a code shows here. On the Square Terminal, choose <b>Sign in</b>, then <b>Use a device code</b>, and enter it.</p>`
      : html`<p class="muted">On the reader, swipe from the left and enter the admin PIN (07139), then choose <b>Generate pairing code</b>. Type the three words it shows.</p>
        <label class="field"><span>Pairing code</span><input type="text" name="code" placeholder="sepia-cerulean-aqua" required autocomplete="off" spellcheck="false"></label>
        ${!c.terminalLocation ? html`<p class="faint" style="margin-bottom:0">Stripe needs the address where readers are used (only the first time):</p>
          <label class="field"><span>Street</span><input type="text" name="line1" required value="${(loc?.address || "").split(",")[0] || ""}"></label>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px"><label class="field"><span>City</span><input type="text" name="city" required></label><label class="field"><span>State</span><input type="text" name="state" maxlength="2" required></label><label class="field"><span>ZIP</span><input type="text" name="zip" inputmode="numeric" maxlength="10" required></label></div>` : ""}`}
    <button class="btn block">Pair</button></form>`);
};
Forms["reader-add"] = async (d, f) => {
  const c = S.church(), label = String(d.label || "").trim(); if (!label) return formError(f, "Name the reader.");
  const live = Backend.on && !practiceMode(c) && !IN_PREVIEW;
  try {
    if (live) { await Backend.call("kiosk", { action: "reader-register", churchId: c.id, provider: d.provider, label, code: d.code, address: { line1: d.line1, city: d.city, state: d.state, postal_code: d.zip, country: "US" } }); await Backend.pull().catch(() => {}); }
    else S.updateChurch({ cardReaders: [...(c.cardReaders || []), { id: `rdr_${uid()}`, provider: d.provider, label, status: "ready", test: true }] });
    closeSheet(true); toast(live && d.provider === "square" ? "Enter the code shown on the Square Terminal" : "Reader paired"); render();
  } catch (e) { formError(f, e.message || "The reader couldn't be paired."); }
};
Actions["reader-check"] = async (el) => { try { await Backend.call("kiosk", { action: "reader-check", churchId: S.state.current, id: el.dataset.id }); await Backend.pull().catch(() => {}); render(); } catch (e) { toast(e.message); } };
Actions["reader-remove"] = async (el) => {
  const c = S.church();
  try { if (Backend.on && !practiceMode(c) && !IN_PREVIEW) { await Backend.call("kiosk", { action: "reader-remove", churchId: c.id, id: el.dataset.id }); await Backend.pull().catch(() => {}); }
    else S.updateChurch({ cardReaders: (c.cardReaders || []).filter((r) => r.id !== el.dataset.id) }); toast("Removed"); render(); } catch (e) { toast(e.message); }
};

// ----- Setting up kiosks and entry devices under Screens and devices -----
function devicePayFields(d) {
  const s = d.settings || {}, p = s.pay || {}, ways = p.ways || { screen: true, phone: true }, readers = S.church().cardReaders || [], events = S.list("events").filter((e) => (e.tickets || []).length && (e.end || e.start) >= new Date().toISOString());
  const chosen = Array.isArray(p.events) ? p.events : [];
  return html`<div class="dev-opt" data-for="kiosk" ${attr(d.type !== "kiosk", "hidden")}>
      <fieldset class="field" style="border:0;padding:0"><legend class="flabel">Also on this kiosk</legend>
        <label class="check"><input type="checkbox" name="payButton" ${attr(s.payButton || s.kioskMode === "pay", "checked")}><span>Payments: buy tickets, pay for tickets, give</span></label>
        <label class="check"><input type="checkbox" name="eventCheckin" ${attr(s.eventCheckin, "checked")}><span>Event check-in: people scan their ticket</span></label></fieldset>
      <fieldset class="field pay-opts" style="border:0;padding:0"><legend class="flabel">Payments at this kiosk</legend>
        <label class="check"><input type="checkbox" name="w_reader" ${attr(ways.reader, "checked")}><span>Card reader${readers.length ? "" : " (pair one under Admin, Card readers)"}</span></label>
        ${readers.length ? html`<label class="field" style="margin:2px 0 6px 28px"><span>Reader</span><select name="readerId"><option value="">Choose a reader</option>${readers.map((r) => html`<option value="${r.id}" ${attr(r.id === p.readerId, "selected")}>${r.label}</option>`)}</select></label>` : ""}
        <label class="check"><input type="checkbox" name="w_screen" ${attr(ways.screen, "checked")}><span>Type a card on the kiosk screen</span></label>
        <label class="check"><input type="checkbox" name="w_phone" ${attr(ways.phone, "checked")}><span>Scan a code and pay on your own phone</span></label>
        <label class="check"><input type="checkbox" name="w_cash" ${attr(ways.cash, "checked")}><span>Cash or check, with a staff code</span></label>
        <label class="field" style="margin-left:28px"><span>Staff code for cash and checks</span><input type="password" name="cashPin" inputmode="numeric" maxlength="8" autocomplete="new-password" placeholder="${p.cashPinHash ? "Saved. Type a new one to change it" : "4 to 8 digits"}"></label>
        <label class="check"><input type="checkbox" name="give" ${attr(p.give !== false, "checked")}><span>Giving</span></label>
        <label class="check"><input type="checkbox" name="partial" ${attr(p.partial !== false, "checked")}><span>Paying part of what's owed on tickets</span></label>
        <label class="field"><span>Events it sells tickets for</span><select name="payEvents" multiple size="${Math.min(5, events.length + 1)}"><option value="all" ${attr(!chosen.length, "selected")}>All upcoming events with tickets</option>${events.map((e) => html`<option value="${e.id}" ${attr(chosen.includes(e.id), "selected")}>${e.title}, ${fmtShort(e.start)}</option>`)}</select></label></fieldset></div>
    <div class="dev-opt" data-for="gate" ${attr(d.type !== "gate", "hidden")}>
      <label class="field"><span>Event</span><select name="gateEvent"><option value="">Pick on the device (today's events)</option>${S.list("events").filter((e) => e.signup && (e.end || e.start) >= new Date().toISOString()).map((e) => html`<option value="${e.id}" ${attr(e.id === s.eventId, "selected")}>${e.title}, ${fmtShort(e.start)}</option>`)}</select></label>
      <label class="check"><input type="checkbox" name="allowOut" ${attr(s.allowOut !== false, "checked")}><span>Check people out too (leaving and coming back)</span></label></div>`;
}
async function devicePaySettings(d, existing = {}) {
  if (d.type === "gate") return { eventId: d.gateEvent || null, allowOut: !!d.allowOut };
  if (d.type !== "kiosk") return {};
  const old = existing.pay || {}, evs = [].concat(d.payEvents || []).filter(Boolean);
  return { payButton: !!d.payButton && d.kioskMode !== "pay", eventCheckin: !!d.eventCheckin,
    pay: { ways: { reader: !!d.w_reader, screen: !!d.w_screen, phone: !!d.w_phone, cash: !!d.w_cash }, readerId: d.readerId || old.readerId || "", give: !!d.give, partial: !!d.partial,
      events: !evs.length || evs.includes("all") ? "all" : evs, cashPinHash: d.cashPin ? await cashPinHash(S.state.current, d.cashPin) : old.cashPinHash || "" } };
}
{
  // The device form: the payment and entry options, and the "Payments only" kiosk mode.
  const form = deviceForm;
  deviceForm = (d) => { const out = flat(form(d)), at = out.lastIndexOf('<label class="field"><span>Exit code');
    return raw(out.slice(0, at) + flat(devicePayFields(d || { type: "signage", settings: {} })) + out.slice(at)); };
  const fields = deviceMapFields;
  deviceMapFields = (d) => raw(flat(fields(d)).replace(/(<label><input type="radio" name="kioskMode" value="both"[^]*?<\/label>)/, `$1<label><input type="radio" name="kioskMode" value="pay" ${d.settings?.kioskMode === "pay" ? "checked" : ""}><span>Payments only</span></label>`));
  const mapSettings = deviceMapSettings;
  deviceMapSettings = (d) => ({ ...mapSettings(d), ...(d.type === "kiosk" && d.kioskMode === "pay" ? { kioskMode: "pay" } : {}) });
  const save = Forms["device-save"];
  Forms["device-save"] = async (d, f, fd) => {
    if (d.cashPin && !/^\d{4,8}$/.test(d.cashPin)) return formError(f, "The staff code should be 4 to 8 digits.");
    if (d.type === "kiosk" && d.w_reader && !d.readerId) return formError(f, "Choose the card reader for this kiosk, or turn the card reader off.");
    d.payEvents = fd.getAll("payEvents");
    const before = d.id ? { ...(S.get("devices", d.id)?.settings || {}) } : {}, extra = await devicePaySettings(d, before), n = S.list("devices").length;
    save(d, f, fd);
    const dev = d.id ? S.get("devices", d.id) : S.list("devices").length > n ? S.list("devices").at(-1) : null;
    if (dev) { dev.settings = { ...dev.settings, ...extra, print: before.print || dev.settings.print }; S.save(); devicePing(dev, { settings: dev.settings }); }
  };
  const routes = deviceRoutes;
  deviceRoutes = (d) => {
    if (d.type === "gate") return ["gate"];
    if (d.type !== "kiosk") return routes(d);
    const s = d.settings || {}, base = s.kioskMode === "pay" ? ["paykiosk"] : routes(d);
    return [...base, ...(s.payButton && !base.includes("paykiosk") ? ["paykiosk"] : []), ...(s.eventCheckin ? ["gate"] : [])];
  };
  const summary = deviceSummary;
  deviceSummary = (d) => {
    if (d.type === "gate") return d.settings?.eventId && S.get("events", d.settings.eventId) ? `Checks people in to ${S.get("events", d.settings.eventId).title}` : "Checks people in to today's events";
    const s = d.settings || {}, extra = [s.kioskMode === "pay" ? "Payments only" : s.payButton ? "payments" : "", s.eventCheckin ? "event check-in" : ""].filter(Boolean);
    return d.type === "kiosk" && s.kioskMode === "pay" ? `Payments${s.eventCheckin ? " and event check-in" : ""}` : `${summary(d)}${extra.length ? `, ${listJoin(extra)}` : ""}`;
  };
  // The other kiosk screens get buttons to Payments and Event check-in.
  for (const name of ["kiosk", "wayfind"]) {
    const scr = Screens[name];
    Screens[name] = (t) => { const v = scr(t); if (!v?.page || !thisDevice()) return v;
      return { ...v, page: raw(flat(v.page).replace(/<button class="icon-btn" data-act="device-exit"/, `${flat(kioskSwitch(["kiosk", "wayfind"]))}<button class="icon-btn" data-act="device-exit"`)) }; };
  }
}
