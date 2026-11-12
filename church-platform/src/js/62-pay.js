// ---------- Payments: one way to take money for gifts, tickets and form fees ----------
// On your own website with Stripe connected (see SETUP.md), checkout() asks the server for a Stripe Checkout page
// for the church's connected account and sends the person there; Stripe's webhook records the payment.
// Everywhere else, including this preview, it opens a test checkout: nothing is charged and records are marked "test".

const Pay = {
  /** True when this church can take real payments here. */
  live(c = S.church()) { return !IN_PREVIEW && typeof Backend !== "undefined" && Backend.on && !!c?.stripe?.chargesEnabled; },
  /**
   * lines: [{ label, amount, qty }]. kind: "gift" | "event" | "form". ref: the record the payment is for.
   * Resolves { status: "paid" | "test", ref, at } or null if the person cancels.
   */
  checkout({ title, lines, kind, ref, email, recurring, frequency, method }) {
    const total = lines.reduce((n, l) => n + l.amount * (l.qty || 1), 0);
    if (total <= 0) return Promise.resolve({ status: "free", ref: "", at: new Date().toISOString() });
    if (this.live()) return Backend.checkout({ churchId: S.state.current, title, lines, kind, ref, email, frequency: frequency || "once", method: method || "card", returnTo: location.hash.slice(1) });
    return new Promise((resolve) => {
      payPending = resolve;
      openSheet("Checkout", html`<div class="pay-sheet">
        <p class="muted" style="margin-top:0">${title}</p>
        <table class="mini-table">${lines.filter((l) => l.qty !== 0).map((l) => html`<tr><td>${l.label}${(l.qty || 1) > 1 ? ` × ${l.qty}` : ""}</td><td class="num">${money(l.amount * (l.qty || 1))}</td></tr>`)}
          <tr class="total"><td>Total${recurring ? `, ${recurring}` : ""}</td><td class="num">${money(total)}</td></tr></table>
        ${demoNote(IN_PREVIEW ? "Test payment. No money moves in the preview. On your own website this opens Stripe's secure checkout." : "Test payment. Online payments aren't set up for this church yet, so nothing is charged.")}
        <div class="btns"><button class="btn" data-act="pay-test">${icon("give")}Pay ${money(total)} (test)</button><button class="btn ghost" data-act="pay-cancel">Cancel</button></div></div>`);
    });
  },
};
let payPending = null;
Actions["pay-test"] = () => { const r = payPending; payPending = null; closeSheet(true); r?.({ status: "test", ref: `test_${uid()}`, at: new Date().toISOString() }); };
Actions["pay-cancel"] = () => { const r = payPending; payPending = null; closeSheet(); r?.(null); };
const paidLabel = (p) => !p ? "Not paid" : p.status === "paid" ? `Paid ${fmtShort(p.at)}` : p.status === "test" ? "Paid (test)" : p.status === "refunded" ? "Refunded" : p.status === "door" ? "Pay at the door" : p.status === "free" ? "Free" : p.status === "pending" ? "Payment not finished" : "Not paid";
/** With live payments the page leaves for Stripe, so the sign-up or response is saved first as pending and the payment webhook marks it paid. */
async function savePending() { S.flush(); if (typeof Backend !== "undefined" && Backend.on) { clearTimeout(Backend.timer); await Backend.flush(); } }
// Stripe sends people back to #paid-gift, #paid-event or #paid-form. The payment webhook records it; refresh to show it.
let paidRefreshed = false;
Screens.paid = (kind) => {
  if (!paidRefreshed && typeof Backend !== "undefined" && Backend.ready) { paidRefreshed = true; setTimeout(() => Backend.pull().then(() => { if (location.hash.startsWith("#paid")) render(); }), 2500); }
  const text = { gift: "Your gift is on its way to the church. Stripe emails your receipt.", event: "You're in. Your receipt is in your email.", form: "Your form and payment are in." }[kind] || "Payment received.";
  return { title: "Thank you", back: "home", body: html`<div class="panel done-panel" style="margin-top:18px"><span class="big-check">${icon("check")}</span><h1>Thank you!</h1><p class="muted">${text}</p>
    <div class="btns" style="justify-content:center"><a class="btn" href="#${kind === "gift" ? "history" : kind === "event" ? "events" : "home"}">${kind === "gift" ? "See giving history" : "Done"}</a></div></div>` };
};
