// ---------- Payments: one way to take money for gifts, tickets and form fees ----------
// Each church chooses its payment processor under Admin, Giving: Stripe, PayPal or Square (see SETUP.md).
// On your own website with one connected, checkout() asks the server for that processor's checkout page and sends the
// person there; coming back, the paid screen asks the server to confirm it, and the processor's webhook records it too.
// Everywhere else, including this preview, it opens a test checkout: nothing is charged and records are marked "test".

const PROCESSORS = {
  stripe: { name: "Stripe", methods: [["card", "Card, Apple Pay or Google Pay"], ["bank", "Bank account"]], recurring: true },
  paypal: { name: "PayPal", methods: [["paypal", "PayPal or card"]], recurring: true },
  square: { name: "Square", methods: [["card", "Card, Apple Pay or Google Pay"]], recurring: false },
};

const Pay = {
  /** The processor this church takes payments with: its own keys, or Stripe through the platform's Stripe Connect. */
  provider(c = S.church()) { return c?.payments?.ready && PROCESSORS[c.payments.provider] ? c.payments.provider : c?.stripe?.chargesEnabled ? "stripe" : ""; },
  /** True when this church can take real payments here. */
  live(c = S.church()) { return !IN_PREVIEW && typeof Backend !== "undefined" && Backend.on && !!this.provider(c); },
  name(c = S.church()) { return PROCESSORS[this.provider(c)]?.name || ""; },
  /** Can givers set up weekly or monthly gifts? Always in test mode. */
  recurring(c = S.church()) { return !this.live(c) || (c.payments?.ready ? c.payments.recurring !== false : true); },
  /** Ways to pay on the Give screen: [value, label]. */
  methods(c = S.church()) { return this.live(c) ? PROCESSORS[this.provider(c)].methods : [["card", "Card"], ["bank", "Bank account"]]; },
  /**
   * lines: [{ label, amount, qty }]. kind: "gift" | "event" | "form". ref: the record the payment is for.
   * Resolves { status: "paid" | "test", ref, at } or null if the person cancels.
   */
  async checkout({ title, lines, kind, ref, email, recurring, frequency, method }) {
    const total = lines.reduce((n, l) => n + l.amount * (l.qty || 1), 0);
    if (total <= 0) return { status: "free", ref: "", at: new Date().toISOString() };
    if (this.live()) {
      try { return await Backend.checkout({ churchId: S.state.current, title, lines, kind, ref, email, frequency: frequency || "once", method: method || "card", returnTo: location.hash.slice(1) }); }
      catch (e) { toast(`The payment couldn't start: ${e.message || "try again"}`); return null; }
    }
    return new Promise((resolve) => {
      payPending = resolve;
      openSheet("Checkout", html`<div class="pay-sheet">
        <p class="muted" style="margin-top:0">${title}</p>
        <table class="mini-table">${lines.filter((l) => l.qty !== 0).map((l) => html`<tr><td>${l.label}${(l.qty || 1) > 1 ? ` × ${l.qty}` : ""}</td><td class="num">${money(l.amount * (l.qty || 1))}</td></tr>`)}
          <tr class="total"><td>Total${recurring ? `, ${recurring}` : ""}</td><td class="num">${money(total)}</td></tr></table>
        ${demoNote(SANDBOX ? "Practice payment. Nothing is charged here." : IN_PREVIEW ? "Test payment. No money moves in the preview. On your own website this opens the church's secure checkout with Stripe, PayPal or Square." : "Test payment. Online payments aren't set up for this church yet, so nothing is charged.")}
        <div class="btns"><button class="btn" data-act="pay-test">${icon("give")}Pay ${money(total)} (test)</button><button class="btn ghost" data-act="pay-cancel">Cancel</button></div></div>`);
    });
  },
};
let payPending = null;
Actions["pay-test"] = () => { const r = payPending; payPending = null; closeSheet(true); r?.({ status: "test", ref: `test_${uid()}`, at: new Date().toISOString() }); };
Actions["pay-cancel"] = () => { const r = payPending; payPending = null; closeSheet(); r?.(null); };
const paidLabel = (p) => !p ? "Not paid" : p.status === "paid" ? `Paid ${fmtShort(p.at)}` : p.status === "test" ? "Paid (test)" : p.status === "refunded" ? "Refunded" : p.status === "door" ? "Pay at the door" : p.status === "free" ? "Free" : p.status === "pending" ? "Payment not finished" : "Not paid";
/** With live payments the page leaves for the processor, so the sign-up or response is saved first as pending and marked paid when the payment comes in. */
async function savePending() { S.flush(); if (typeof Backend !== "undefined" && Backend.on) { clearTimeout(Backend.timer); await Backend.flush(); } }

// Coming back from the processor's page: ?paid=gift&checkout=co_... or ?unpaid=gift&to=give. Processors add their own
// query (PayPal's token, for one), so the app's place travels in the query too. Tidy the address and go to the screen.
const payReturn = (() => {
  const q = new URLSearchParams(location.search);
  if (!q.has("paid") && !q.has("unpaid")) return null;
  const r = { kind: (q.get("paid") || q.get("unpaid") || "").replace(/\W/g, ""), checkout: q.get("checkout") || "", cancelled: q.has("unpaid"), to: (q.get("to") || "").replace(/[^\w~-]/g, "") };
  const keep = q.has("debug") ? "?debug" : "";
  history.replaceState(null, "", location.pathname + keep + (r.cancelled ? `#${r.to || "home"}` : `#paid-${r.kind}`));
  if (r.cancelled) setTimeout(() => toast("Payment was cancelled. Nothing was charged."), 400);
  return r;
})();
let paidCheck = null;
Screens.paid = (kind) => {
  if (!paidCheck && typeof Backend !== "undefined" && Backend.ready) {
    paidCheck = { status: "checking" };
    (payReturn?.checkout ? Backend.call("pay-confirm", { checkout: payReturn.checkout }) : Promise.resolve({ status: "paid" }))
      .catch((e) => ({ status: "error", error: e.message }))
      .then(async (r) => { paidCheck = r; await Backend.pull().catch(() => {}); if (location.hash.startsWith("#paid")) render(); });
  }
  const st = paidCheck?.status || "checking", c = S.church();
  const done = { gift: `Your gift to ${c?.name || "the church"} was received. Watch your email for a receipt.`, event: "You're in. Your receipt is in your email.", form: "Your form and payment are in." }[kind] || "Payment received.";
  const view = {
    checking: ["Confirming your payment...", "This takes a moment.", ""],
    paid: ["Thank you!", done, "check"],
    pending: ["Thank you!", "Your payment is processing. Bank payments take a few days to clear, and it shows in your history once it does.", "check"],
    unpaid: ["Payment not finished", "The payment wasn't completed, so nothing was charged. If you did pay, it shows up here in a few minutes.", ""],
    error: ["We couldn't check the payment", `${paidCheck?.error || "Something went wrong"}. If you paid, it shows up here in a few minutes.`, ""],
  }[st] || ["Thank you!", done, "check"];
  const next = kind === "gift" ? ["history", "See giving history"] : kind === "event" ? ["events", "Done"] : ["home", "Done"];
  return { title: st === "paid" || st === "pending" ? "Thank you" : "Payment", back: "home", body: html`<div class="panel done-panel" style="margin-top:18px">
    ${view[2] ? html`<span class="big-check">${icon("check")}</span>` : st === "checking" ? html`<span class="spinner" aria-hidden="true"></span>` : ""}
    <h1>${view[0]}</h1><p class="muted">${view[1]}</p>
    ${st === "checking" ? "" : html`<div class="btns" style="justify-content:center"><a class="btn" href="#${next[0]}">${next[1]}</a>${st === "unpaid" && kind === "gift" ? html`<a class="btn ghost" href="#give">Try again</a>` : ""}</div>`}</div>` };
};
