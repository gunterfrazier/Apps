// ---------- Giving ----------
// Gifts go through Pay: the checkout of the church's own payment processor (Stripe, PayPal or Square) once it's set up
// under Admin, Giving, a test checkout everywhere else. A church that already gives through another service (Tithe.ly,
// Pushpay, Givelify...) can link its giving page instead, and the Give screen leads with it. Text-to-give links (#give-CHURCH~AMOUNT) open this screen with the amount filled in.

const FREQ = { once: "One time", weekly: "Every week", monthly: "Every month" };
/** Giving services a church may already use. Gifts made there stay in that service, not in the app's history. */
const GIVING_SERVICES = [["tithely", "Tithe.ly"], ["pushpay", "Pushpay"], ["givelify", "Givelify"], ["planningcenter", "Planning Center Giving"], ["subsplash", "Subsplash Giving"],
  ["vanco", "Vanco"], ["zeffy", "Zeffy"], ["paypal", "PayPal"], ["venmo", "Venmo"], ["cashapp", "Cash App"], ["other", "Our giving page"]];
const givingService = (l) => l?.name || GIVING_SERVICES.find(([k]) => k === l?.service)?.[1] || "Our giving page";
const methodLabel = (m) => ({ bank: "Bank", cash: "Cash or check", paypal: "PayPal" })[m] || "Card";
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const nextGiftDate = (r) => {
  const d = new Date(r.lastAt || r.at), step = () => (r.frequency === "weekly" ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + 1));
  step(); while (d < new Date()) step();
  return d;
};
const myGifts = () => S.list("gifts").filter((g) => g.by === S.me().id).sort((a, b) => new Date(b.at) - new Date(a.at));
const fundName = (id, c = S.church()) => c.funds.find((f) => f.id === id)?.name || "General fund";

Screens.give = (tail = "") => {
  if (!S.on("giving")) return { redirect: "home" };
  const c = S.church(), preset = parseAmount(tail.split("~")[1] || "") || 50;
  const defFund = c.funds.some((f) => f.id === c.defaults.fundId) ? c.defaults.fundId : c.funds[0]?.id;
  const year = new Date().getFullYear();
  const total = myGifts().filter((g) => new Date(g.at).getFullYear() === year).reduce((n, g) => n + g.amount, 0);
  const recurring = S.list("recurring").filter((r) => r.by === S.me().id && r.active);
  const link = c.givingLink?.url ? c.givingLink : null, inApp = !link || Pay.live(), methods = Pay.methods();
  return {
    title: "Give", tab: "give",
    body: html`
      ${link ? html`<a class="panel give-out" href="${link.url}" target="_blank" rel="noopener"><span class="lead-ic">${icon("give")}</span>
        <span class="body"><span class="t">Give with ${givingService(link)}</span><span class="s">Opens ${hostOf(link.url)}. Gifts made there show in ${givingService(link) === "Our giving page" ? "that service" : givingService(link)}, not in your history here.</span></span>${icon("link")}</a>` : ""}
      ${!inApp ? "" : html`${link ? html`<h2 class="sec-head" style="margin-top:22px">Or give here</h2>` : ""}
      ${Pay.live() ? "" : practiceMode(c) ? demoNote(html`<b>Practice:</b> gifts here are pretend, and no money moves.`) : demoNote(html`<b>Test mode:</b> gifts are recorded here, but no money moves. Real gifts start once ${c.name} sets up online giving under Admin, Giving.`)}
      <form data-form="give" class="panel" novalidate>
        <label for="amount" class="sr">Amount in dollars</label>
        <div style="display:flex;align-items:center;justify-content:center"><span class="amount" aria-hidden="true" style="color:var(--ink-3)">$</span><input id="amount" class="amount" name="amount" type="text" inputmode="decimal" value="${preset}" data-input="give-amount" autocomplete="off" style="width:${Math.max(3, String(preset).length + 1)}ch"></div>
        <div class="radios" style="justify-content:center" role="group" aria-label="Quick amounts">${[25, 50, 100, 250].map((n) => html`<button type="button" class="chip" data-act="give-preset" data-n="${n}">${money(n)}</button>`)}</div>
        <fieldset class="field" style="border:0;padding:0;margin-top:18px"><legend style="font-weight:700;margin-bottom:6px">Fund</legend>
          ${c.funds.map((f) => html`<label class="check" style="padding:8px 0"><input type="radio" name="fund" value="${f.id}" ${attr(f.id === defFund, "checked")}><span><b>${f.name}</b><br><span class="faint">${f.description}</span></span></label>`)}</fieldset>
        ${Pay.recurring() ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">How often</legend>
          <div class="radios">${Object.entries(FREQ).map(([k, l], i) => html`<label><input type="radio" name="frequency" value="${k}" ${i === 0 ? raw("checked") : ""}><span>${l}</span></label>`)}</div></fieldset>`
          : html`<input type="hidden" name="frequency" value="once">`}
        ${methods.length > 1 ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Pay with</legend>
          <div class="radios">${methods.map(([v, l], i) => html`<label><input type="radio" name="method" value="${v}" ${attr(i === 0, "checked")}><span>${l}</span></label>`)}</div></fieldset>`
          : html`<input type="hidden" name="method" value="${methods[0][0]}">`}
        <button class="btn block" id="give-btn">Give ${money(preset)}</button>
        ${Pay.live() ? html`<p class="faint pay-via">${icon("lock")}You'll finish on ${Pay.name()}'s secure page${methods.length === 1 ? ` (${methods[0][1]})` : ""}.</p>` : ""}
      </form>`}
      <section class="sec"><div class="sec-head"><h2>Your giving</h2><a href="#history">History</a></div>
        <div class="stat"><div><b>${money(total)}</b><span>Given in ${year}</span></div><div><b>${recurring.length}</b><span>Recurring gift${recurring.length === 1 ? "" : "s"}</span></div></div>
        ${recurring.length ? html`<div class="rows" style="margin-top:12px">${recurring.map((r) => html`<div class="row"><span class="lead-ic">${icon("give")}</span><span class="body"><span class="t">${money(r.amount)} ${FREQ[r.frequency].toLowerCase()}</span><span class="s">${fundName(r.fundId)}, since ${fmtShort(r.at)}. Next gift ${fmtShort(nextGiftDate(r))}.</span></span><button class="btn ghost sm" data-act="give-stop" data-id="${r.id}">Stop</button></div>`)}</div>` : ""}
      </section>
      <section class="sec"><h2 class="sec-head">Other ways to give</h2><div class="panel">${c.textGive?.number ? html`<p style="margin-top:0"><b>Text to give:</b> text <b>${c.textGive.keyword || "GIVE"} 50</b> to <a href="sms:${digits(c.textGive.number)}?body=${encodeURIComponent(`${c.textGive.keyword || "GIVE"} 50`)}">${c.textGive.number}</a> with any amount. You'll get a link to finish your gift.</p>` : ""}<p style="${c.textGive?.number ? "" : "margin-top:0"}">Drop a check or cash in the offering during any service${c.address ? html`, or mail it to ${c.address}` : ""}. Write the fund name on the memo line.</p></div></section>`,
  };
};
const parseAmount = (v) => Math.round(parseFloat(String(v).replace(/[^0-9.]/g, "")) * 100) / 100;
Inputs["give-amount"] = (el) => { const n = parseAmount(el.value); $("#give-btn").textContent = n > 0 ? `Give ${money(n)}` : "Give"; el.style.width = `${Math.max(3, el.value.length + 1)}ch`; };
Actions["give-preset"] = (el) => { const a = $("#amount"); a.value = el.dataset.n; Inputs["give-amount"](a); };
Forms.give = (d, f) => {
  const amount = parseAmount(d.amount);
  if (!(amount >= 1)) return formError(f, "Enter an amount of at least $1.");
  if (amount > 100000) return formError(f, "For gifts over $100,000, please contact the church office.");
  Forms["give-confirm"]({ ...d, amount });
};
Forms["give-confirm"] = async (d) => {
  const me = S.me(), now = new Date().toISOString(), amount = +d.amount, c = S.church();
  closeSheet(true);
  const paid = await Pay.checkout({ title: `Gift to ${c.name}`, lines: [{ label: fundName(d.fund), amount }], kind: "gift", ref: d.fund, email: me.email, recurring: d.frequency !== "once" ? FREQ[d.frequency].toLowerCase() : "", method: d.method, frequency: d.frequency });
  if (!paid) { toast("Your gift was cancelled. Nothing was charged."); return; }
  // On your own site with Stripe, the page has moved to Stripe by now and the payment webhook records the gift.
  const g = S.add("gifts", { by: me.id, name: me.name, fundId: d.fund, amount, frequency: d.frequency, method: d.method, at: now, demo: paid.status === "test", status: paid.status, ref: paid.ref });
  if (d.frequency !== "once") S.add("recurring", { by: me.id, fundId: d.fund, amount, frequency: d.frequency, method: d.method, at: now, active: true, test: paid.status === "test" });
  emit("gift.created", { name: me.name, email: me.email, amount, fund: fundName(d.fund), frequency: d.frequency, method: d.method, preview: true });
  openSheet("Thank you", html`<p class="lead">Your ${money(amount)} gift to ${fundName(d.fund)} was recorded.</p>
    <p class="faint">Confirmation ${g.id.toUpperCase()}. In a live app, a receipt goes to ${me.email || "your email"}.</p>
    <div class="btns"><button class="btn" data-act="go" data-to="history">See giving history</button><button class="btn ghost" data-act="close-sheet">Done</button></div>`);
  render();
};
Actions["give-stop"] = async (el) => {
  const r = S.get("recurring", el.dataset.id);
  if (r.subscriptionId && typeof Backend !== "undefined" && Backend.on) { try { await Backend.call("recurring", { action: "cancel", subscriptionId: r.subscriptionId, churchId: r.churchId }); } catch (e) { toast(`Couldn't stop it: ${e.message || "try again"}`); return; } }
  S.update("recurring", r.id, { active: false }); toast("Recurring gift stopped"); render();
};

Screens.history = () => {
  const gifts = myGifts(), c = S.church();
  const years = [...new Set(gifts.map((g) => new Date(g.at).getFullYear()))];
  const statement = (y) => {
    const list = gifts.filter((g) => new Date(g.at).getFullYear() === y);
    return `${c.name} giving statement, ${y}\n${S.me().name}\n\n${list.map((g) => `${fmtShort(g.at)}  ${fundName(g.fundId)}  ${money(g.amount)}`).join("\n")}\n\nTotal: ${money(list.reduce((n, g) => n + g.amount, 0))}\nNo goods or services were provided in exchange for these gifts.`;
  };
  return {
    title: "Giving history", back: "give", tab: "give",
    body: gifts.length ? years.map((y) => {
      const list = gifts.filter((g) => new Date(g.at).getFullYear() === y);
      return html`<section class="sec"><div class="sec-head"><h2>${y}</h2><span class="muted"><b>${money(list.reduce((n, g) => n + g.amount, 0))}</b></span></div>
        <div class="rows">${list.map((g) => html`<div class="row"><span class="body"><span class="t">${money(g.amount)}</span><span class="s">${fundName(g.fundId)}, ${fmtShort(g.at)}${g.demo ? " (test)" : ""}${g.status === "refunded" ? ", refunded" : ""}</span></span><span class="faint">${methodLabel(g.method)}</span></div>`)}</div>
        <div class="btns"><button class="btn ghost sm" data-act="statement-pdf" data-year="${y}">${icon("download")}${y} statement (PDF)</button><button class="btn ghost sm" data-act="copy" data-done="Statement copied" data-text="${statement(y)}">${icon("copy")}Copy as text</button></div></section>`;
    }) : html`<div class="rows" style="margin-top:14px">${empty("Gifts you give through the app show up here.", html`<a class="btn ghost" href="#give">Give</a>`)}</div>`,
  };
};
