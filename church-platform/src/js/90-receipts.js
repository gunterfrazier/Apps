// ---------- Receipts and tickets ----------
// After any payment in the app (a gift, tickets, a form fee) a pop-up says it went through and offers a receipt. The
// receipt shows what was paid, how and when, with a QR code and a barcode of its number; it saves to the device as a
// picture and prints. Event sign-ups come with a ticket: a QR code (and a barcode for handheld scanners) that's scanned
// at the door to check in and out (92-entry.js). A ticket's link works for anyone who has it, even without an account,
// so a walk-in who bought at a kiosk can open the ticket from their email or text.
//   reg.code: the ticket's secret code. Ticket links: #ticket-<eventId>~<who>~<code>.

const TICKET_CHARS = "ACDEFHJKLMNPQRTUVWXY34679";
const ticketCodeNew = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => TICKET_CHARS[b % TICKET_CHARS.length]).join("");
/** The ticket's code, made the first time it's needed. */
function ticketCodeOf(e, r) {
  if (!r.code) { r.code = ticketCodeNew(); S.save(); }
  return r.code;
}
const ticketLink = (e, r) => appLink(`ticket-${e.id}~${r.by}~${ticketCodeOf(e, r)}`);
const receiptNumber = (id) => String(id || "").replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase();

// ----- Code 128 barcodes (set B: letters, numbers and punctuation) -----
const C128 = "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112".split(" ");
/** An SVG barcode. Height in px; each narrow bar is `unit` px wide. */
function barcodeSvg(text, { height = 60, unit = 2, x = 0, y = 0, nested = false } = {}) {
  const vals = [...String(text)].map((ch) => Math.min(94, Math.max(0, ch.charCodeAt(0) - 32)));
  const codes = [104, ...vals, (104 + vals.reduce((n, v, i) => n + v * (i + 1), 0)) % 103, 106];
  const widths = codes.map((v) => C128[v]).join("");
  let pos = 10 * unit; const bars = [];
  [...widths].forEach((w, i) => { const n = +w * unit; if (i % 2 === 0) bars.push(`<rect x="${pos}" y="0" width="${n}" height="${height}"/>`); pos += n; });
  const total = pos + 10 * unit;
  return `<svg ${nested ? `x="${x}" y="${y}"` : 'xmlns="http://www.w3.org/2000/svg"'} width="${total}" height="${height}" viewBox="0 0 ${total} ${height}" shape-rendering="crispEdges"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${bars.join("")}</g></svg>`;
}
const barcodeWidth = (text, unit = 2) => (String(text).length * 11 + 55) * unit;

// ----- What a receipt or ticket says -----
const payMethodName = (m) => ({ card: "Card", bank: "Bank account", paypal: "PayPal", app: "In the app", cash: "Cash", check: "Check", reader: "Card (in person)", kiosk: "Card at a kiosk" }[m] || "Card");
/** A receipt for a gift ("gift"), a ticket payment ("ticket") or a form fee ("form"). */
function receiptFor(kind, id) {
  const c = S.church(), base = { church: { name: c.name, color: c.color }, qr: appLink(`receipt-${kind}~${id}`), number: receiptNumber(id) };
  if (kind === "gift") {
    const g = S.get("gifts", id); if (!g) return null;
    return { ...base, kind, title: `Gift to ${c.name}`, lines: [[`${fundName(g.fundId)}${g.frequency && g.frequency !== "once" ? `, ${FREQ[g.frequency].toLowerCase()}` : ""}`, g.amount]], amount: g.amount,
      method: payMethodName(g.method), at: g.at, payer: g.name, test: g.status === "test" || g.demo, note: c.taxId ? `${c.name} is a tax-exempt organization (EIN ${c.taxId}). No goods or services were provided in exchange for this gift.` : "Thank you for your generosity." };
  }
  if (kind === "ticket") {
    const p = S.get("ticketPayments", id); if (!p) return null;
    const { e, r } = findReg(p.eventId, p.regId); if (!e || !r) return null;
    return { ...base, kind, title: e.title, lines: [[`${ticketSummary(e, r) || plural(r.count || 1, "ticket")}`, r.total], ...(regPaid(e, r) - p.amount > 0.004 ? [["Paid before", -(regPaid(e, r) - p.amount)]] : [])],
      amount: p.amount, method: `${payMethodName(p.method)}${p.checkNo ? ` #${p.checkNo}` : ""}`, at: p.at, payer: r.name, receivedBy: p.method === "app" ? "" : p.receivedByName || nameOf(p.receivedBy),
      balance: regBalance(e, r), test: p.status === "test", ticket: ticketInfo(e, r) };
  }
  if (kind === "form") {
    const resp = S.get("formResponses", id), f = resp && S.get("forms", resp.formId); if (!f) return null;
    return { ...base, kind, title: f.title, lines: [[`${f.title}${resp.childName ? ` for ${resp.childName}` : ""}`, f.fee || 0]], amount: f.fee || 0, method: "Card", at: resp.paid?.at || resp.at, payer: resp.name, test: resp.paid?.status === "test" };
  }
  return null;
}
/** What a ticket says. */
function ticketInfo(e, r) {
  return { title: e.title, when: fmtWhen(e.start), where: e.location || "", name: r.name, summary: ticketSummary(e, r) || plural(r.count || 1, "person", "people"),
    admits: r.count || Object.values(r.tickets || {}).reduce((n, x) => n + x, 0) || 1, code: ticketCodeOf(e, r), link: ticketLink(e, r), eventId: e.id, regId: regIdOf(e, r),
    paid: !r.total ? "Free" : regBalance(e, r) ? `${money(regBalance(e, r))} still due` : "Paid in full" };
}

// ----- Drawing them: one SVG that shows on screen, saves as a picture and prints -----
const svgEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
function wrapText(s, max) { const out = []; let line = ""; for (const w of String(s || "").split(/\s+/)) { if ((line + " " + w).trim().length > max) { if (line) out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out; }
const qrNested = (link, size, x, y) => qrSvg(link, { size }).replace(/^<svg/, `<svg x="${x}" y="${y}"`);
function receiptSvg(r) {
  const W = 600, pad = 36, brand = /^#[0-9a-f]{6}$/i.test(r.church.color || "") ? r.church.color : "#4250d6", ink = onColor(brand);
  const parts = []; let y = 0;
  const text = (s, o = {}) => { y += o.gap ?? 28; parts.push(`<text x="${o.x ?? pad}" y="${y}" font-size="${o.size || 17}" font-weight="${o.bold ? 700 : 400}" fill="${o.color || "#1d2430"}" ${o.end ? 'text-anchor="end"' : ""}>${svgEsc(s)}</text>`); };
  const row = (l, v, o = {}) => { y += o.gap ?? 28; parts.push(`<text x="${pad}" y="${y}" font-size="17" fill="${o.muted ? "#5b6472" : "#1d2430"}" font-weight="${o.bold ? 700 : 400}">${svgEsc(l)}</text><text x="${W - pad}" y="${y}" font-size="17" text-anchor="end" fill="${o.muted ? "#5b6472" : "#1d2430"}" font-weight="${o.bold ? 700 : 400}">${svgEsc(v)}</text>`); };
  parts.push(`<rect width="${W}" height="84" fill="${brand}"/><text x="${pad}" y="52" font-size="24" font-weight="700" fill="${ink}">${svgEsc(r.church.name)}</text>`); y = 84;
  text(r.test ? "RECEIPT (TEST, NOTHING CHARGED)" : "RECEIPT", { size: 14, bold: true, color: "#5b6472", gap: 40 });
  wrapText(r.title, 40).forEach((l, i) => text(l, { size: 24, bold: true, gap: i ? 30 : 34 }));
  text(money(r.amount), { size: 40, bold: true, gap: 52 });
  y += 10; parts.push(`<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="#e3e6ec"/>`);
  r.lines.forEach(([l, v]) => wrapText(l, 44).forEach((x, i, all) => row(x, i === all.length - 1 ? (v < 0 ? `-${money(-v)}` : money(v)) : "")));
  row("Paid now", money(r.amount), { bold: true });
  if (r.balance != null) row("Still due", r.balance ? money(r.balance) : "Nothing. Paid in full", { muted: !r.balance });
  y += 12; parts.push(`<line x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}" stroke="#e3e6ec"/>`);
  row("Date", new Date(r.at).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }), { muted: true });
  row("Paid with", r.method, { muted: true });
  if (r.payer) row("From", r.payer, { muted: true });
  if (r.receivedBy) row("Received by", r.receivedBy, { muted: true });
  row("Receipt number", r.number, { muted: true });
  if (r.note) wrapText(r.note, 62).forEach((l, i) => text(l, { size: 13, color: "#5b6472", gap: i ? 18 : 30 }));
  y += 24; parts.push(qrNested(r.qr, 150, pad, y));
  const bw = barcodeWidth(r.number, 2); parts.push(barcodeSvg(r.number, { height: 70, unit: 2, x: W - pad - bw, y: y + 30, nested: true }));
  parts.push(`<text x="${W - pad - bw / 2}" y="${y + 124}" font-size="14" text-anchor="middle" fill="#1d2430" font-family="ui-monospace,Menlo,monospace">${svgEsc(r.number)}</text>`);
  y += 150 + 30;
  text("Scan to see this receipt in the app.", { size: 13, color: "#5b6472", gap: 0 });
  const H = y + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"><rect width="${W}" height="${H}" fill="#fff" rx="14"/>${parts.join("")}</svg>`;
}
function ticketSvg(t, church = { name: S.church()?.name, color: S.church()?.color }) {
  const W = 600, pad = 36, brand = /^#[0-9a-f]{6}$/i.test(church.color || "") ? church.color : "#4250d6", ink = onColor(brand);
  const parts = [`<rect width="${W}" height="84" fill="${brand}"/><text x="${pad}" y="52" font-size="24" font-weight="700" fill="${ink}">${svgEsc(church.name)}</text>`]; let y = 84;
  const text = (s, o = {}) => { y += o.gap ?? 28; parts.push(`<text x="${o.x ?? W / 2}" y="${y}" font-size="${o.size || 18}" font-weight="${o.bold ? 700 : 400}" fill="${o.color || "#1d2430"}" text-anchor="middle">${svgEsc(s)}</text>`); };
  text("TICKET", { size: 14, bold: true, color: "#5b6472", gap: 40 });
  wrapText(t.title, 34).forEach((l, i) => text(l, { size: 26, bold: true, gap: i ? 32 : 38 }));
  text(t.when, { gap: 30 }); if (t.where) text(t.where, { color: "#5b6472", gap: 26 });
  y += 18; parts.push(qrNested(t.link, 300, (W - 300) / 2, y)); y += 300;
  text(t.name, { size: 24, bold: true, gap: 40 });
  text(`${t.summary}. Admits ${t.admits}.`, { gap: 30 });
  text(t.paid, { color: /due/.test(t.paid) ? "#b42318" : "#2c7a4b", bold: true, gap: 28 });
  const bw = barcodeWidth(t.code, 2.4); y += 22; parts.push(barcodeSvg(t.code, { height: 70, unit: 2.4, x: (W - bw) / 2, y, nested: true })); y += 70;
  text(t.code, { size: 16, gap: 24, color: "#1d2430" });
  text("Show this at the door. Screenshots and printouts work too.", { size: 13, color: "#5b6472", gap: 30 });
  const H = y + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif"><rect width="${W}" height="${H}" fill="#fff" rx="14"/>${parts.join("")}</svg>`;
}
/** Saves an SVG as a PNG picture on this device. */
async function saveSvgPng(svg, name) {
  const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = 2, cv = document.createElement("canvas"); cv.width = img.width * k; cv.height = img.height * k;
    const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.scale(k, k); g.drawImage(img, 0, 0);
    const blob = await new Promise((res) => cv.toBlob(res, "image/png"));
    if (blob) await saveFile(name, blob);
  } catch { await saveFile(name.replace(/\.png$/, ".svg"), svg); }
  finally { URL.revokeObjectURL(url); }
}

// ----- On screen -----
let shownReceipt = null, shownTicket = null;
/** After a payment: it went through, and would they like a receipt? */
function paymentDone(kind, id) {
  const r = receiptFor(kind, id); if (!r) return;
  openSheet("Payment processed", html`<div class="pay-done"><span class="big-check">${icon("check")}</span>
    <p class="lead" style="margin:6px 0 2px"><b>${money(r.amount)}</b>${r.test ? " (test)" : ""}</p><p class="muted" style="margin:0">${r.title}</p>
    ${r.balance ? html`<p style="margin:8px 0 0">${money(r.balance)} left to pay.</p>` : ""}
    <h2 style="font-size:1.1rem;margin:18px 0 8px">Would you like a receipt?</h2>
    <div class="btns" style="justify-content:center"><button class="btn" data-act="receipt-show" data-kind="${kind}" data-id="${id}">Yes, show my receipt</button><button class="btn ghost" data-act="close-sheet">No thanks</button></div>
    ${r.ticket ? html`<button class="linkish" data-act="ticket-show" data-event="${r.ticket.eventId}" data-reg="${r.ticket.regId}">${icon("ticket")}Show my ticket</button>` : ""}
    ${kind === "gift" ? html`<p style="margin:14px 0 0"><a href="#history" data-act="go" data-to="history">See your giving history</a></p>` : ""}</div>`);
}
function receiptSheet(r) {
  shownReceipt = r;
  openSheet("Receipt", html`<div class="receipt-art">${raw(receiptSvg(r))}</div>
    <div class="btns"><button class="btn" data-act="receipt-save">${icon("download")}Save to this device</button><button class="btn ghost" data-act="receipt-print">${icon("printer")}Print</button>
      ${r.ticket ? html`<button class="btn ghost" data-act="ticket-show" data-event="${r.ticket.eventId}" data-reg="${r.ticket.regId}">${icon("ticket")}Ticket</button>` : ""}</div>
    ${S.isMember() && r.kind && !r.test && msgRoute("receipts").length ? html`<p class="faint">${listJoin(msgRoute("receipts").filter((ch) => ch !== "push").map((ch) => MSG_CHANNELS[ch][0].toLowerCase()))} ${msgRoute("receipts").includes("push") ? "and the app" : ""} also get a copy.</p>` : ""}`, { wide: true });
}
Actions["receipt-show"] = (el) => { const r = receiptFor(el.dataset.kind, el.dataset.id); if (r) receiptSheet(r); };
Actions["receipt-save"] = () => shownReceipt && saveSvgPng(receiptSvg(shownReceipt), `receipt-${shownReceipt.number}.png`);
Actions["receipt-print"] = () => shownReceipt && printJob("receipt", `<div class="pj-receipt">${receiptSvg(shownReceipt)}</div>`, { title: `Receipt ${shownReceipt.number}` });
function ticketSheet(t, church) {
  shownTicket = { t, church };
  openSheet("Your ticket", html`<div class="receipt-art">${raw(ticketSvg(t, church))}</div>
    <div class="btns"><button class="btn" data-act="ticket-save">${icon("download")}Save to this device</button><button class="btn ghost" data-act="ticket-print">${icon("printer")}Print ticket</button>
      <button class="btn ghost" data-act="copy" data-text="${t.link}" data-done="Ticket link copied">${icon("link")}Copy link</button></div>
    <p class="faint">At the door, show the QR code on your phone or a printout. Each ticket admits ${plural(t.admits, "person", "people")}.</p>`, { wide: true });
}
Actions["ticket-show"] = (el) => { const { e, r } = findReg(el.dataset.event, el.dataset.reg); if (e && r) ticketSheet(ticketInfo(e, r)); };
Actions["ticket-save"] = () => shownTicket && saveSvgPng(ticketSvg(shownTicket.t, shownTicket.church), `ticket-${shownTicket.t.code}.png`);
Actions["ticket-print"] = () => shownTicket && printJob("ticket", `<div class="pj-ticket">${ticketSvg(shownTicket.t, shownTicket.church)}</div>`, { title: `Ticket ${shownTicket.t.code}` });

/** #receipt-<kind>~<id>: opened from the QR code on a receipt. */
Screens.receipt = (tail = "") => {
  const [kind, id] = tail.split("~"), r = S.isMember() && receiptFor(kind, id);
  if (!r) return { title: "Receipt", back: "home", body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">This receipt isn't one you can see${Backend.on && !Backend.user ? ". Sign in with the account that paid" : ""}.</p></div>` };
  return { title: "Receipt", back: kind === "gift" ? "history" : "home", body: html`<div class="receipt-art" style="margin-top:14px">${raw(receiptSvg(r))}</div>
    <div class="btns"><button class="btn" data-act="receipt-show" data-kind="${kind}" data-id="${id}">${icon("download")}Save or print</button></div>` };
};
/** #ticket-<eventId>~<who>~<code>: the ticket itself. Works for anyone with the link; staff who check people in get a button. */
let ticketRemote = { key: "", data: null, error: "" };
Screens.ticket = (tail = "") => {
  const [eventId, by, code] = tail.split("~"), e = S.get("events", eventId), r = e?.registrations?.find((x) => x.by === by);
  let t = null, church = null;
  if (e && r && (!r.code || r.code === code)) { t = ticketInfo(e, r); church = { name: S.church().name, color: S.church().color }; }
  else if (Backend.on) {
    if (ticketRemote.key !== tail) { ticketRemote = { key: tail, data: null, error: "" }; Backend.call("kiosk", { action: "ticket", t: tail }).then((d) => { ticketRemote.data = d; render(); }).catch((err) => { ticketRemote.error = err.message; render(); }); }
    if (ticketRemote.data) { t = ticketRemote.data.ticket; church = ticketRemote.data.church; }
  }
  const wrap = (body) => S.isMember() ? { title: "Ticket", back: e ? `event-${e.id}` : "home", body } : { page: html`<div class="public-page"><main class="view" style="max-width:640px;margin:0 auto">${body}</main></div>` };
  if (!t) return wrap(html`<div class="panel" style="margin-top:16px">${ticketRemote.key === tail && !ticketRemote.error && Backend.on ? html`<p class="muted" style="margin:0"><span class="ai-dot"></span>Opening the ticket...</p>` : html`<p style="margin:0">This ticket wasn't found. Check the link, or ask the church.</p>`}</div>`);
  shownTicket = { t, church };
  return wrap(html`<div class="receipt-art" style="margin-top:14px">${raw(ticketSvg(t, church))}</div>
    <div class="btns" style="justify-content:center"><button class="btn" data-act="ticket-save">${icon("download")}Save to this device</button><button class="btn ghost" data-act="ticket-print">${icon("printer")}Print</button>
      ${e && canCheckinEvents(e) ? html`<a class="btn ghost" href="#gate-${e.id}~${t.code}">${icon("scan")}Check in</a>` : ""}</div>`);
};
/** #mytickets: every upcoming event I have a ticket for. */
Screens.mytickets = () => {
  if (!S.isMember()) return { redirect: "home" };
  const mine = S.visible("events").filter((e) => e.end >= new Date().toISOString() || e.start >= new Date(Date.now() - DAY).toISOString()).map((e) => [e, myRegistration(e)]).filter(([, r]) => r).sort((a, b) => a[0].start.localeCompare(b[0].start));
  return { title: "My tickets", back: "me", body: html`<div class="rows" style="margin-top:14px">${mine.length ? mine.map(([e, r]) => html`<button class="row" data-act="ticket-show" data-event="${e.id}" data-reg="${regIdOf(e, r)}"><span class="lead-ic">${icon("ticket")}</span>
    <span class="body"><span class="t">${e.title}</span><span class="s">${fmtShort(e.start)}. ${ticketSummary(e, r) || plural(r.count || 1, "person", "people")}${r.total ? `. ${PAY_STATUS[regStatus(e, r)]}` : ""}</span></span>${icon("chev")}</button>`) : empty("No upcoming tickets. Sign up for an event and your ticket shows here.")}</div>` };
};

// ----- Live payments: coming back from the processor, the pop-up opens once the server confirms -----
{
  const paid = Screens.paid;
  let offered = "";
  Screens.paid = (kind) => {
    const v = paid(kind);
    if (paidCheck?.status === "paid" && paidCheck.payRef && offered !== paidCheck.payRef) {
      offered = paidCheck.payRef;
      const k = kind === "event" ? "ticket" : kind, id = kind === "form" ? S.list("formResponses").find((x) => x.paid?.ref === paidCheck.payRef)?.id : paidCheck.payRef;
      if (id) setTimeout(() => paymentDone(k, id), 300);
    }
    return v;
  };
}
