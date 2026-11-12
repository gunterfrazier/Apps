// ---------- Giving ----------
// Gifts are recorded but no money moves. Going live means sending the form to a payment processor (see README).

const FREQ = { once: "One time", weekly: "Every week", monthly: "Every month" };
const myGifts = () => S.list("gifts").filter((g) => g.by === S.me().id).sort((a, b) => new Date(b.at) - new Date(a.at));
const fundName = (id, c = S.church()) => c.funds.find((f) => f.id === id)?.name || "General fund";

Screens.give = () => {
  if (!S.on("giving")) return { redirect: "home" };
  const c = S.church();
  const defFund = c.funds.some((f) => f.id === c.defaults.fundId) ? c.defaults.fundId : c.funds[0]?.id;
  const year = new Date().getFullYear();
  const total = myGifts().filter((g) => new Date(g.at).getFullYear() === year).reduce((n, g) => n + g.amount, 0);
  const recurring = S.list("recurring").filter((r) => r.by === S.me().id && r.active);
  return {
    title: "Give", tab: "give",
    body: html`
      ${demoNote(html`<b>Preview mode:</b> gifts are recorded here, but no money moves. A church connects a payment processor such as Stripe to accept real gifts.`)}
      <form data-form="give" class="panel" novalidate>
        <label for="amount" class="sr">Amount in dollars</label>
        <div style="display:flex;align-items:center;justify-content:center"><span class="amount" aria-hidden="true" style="color:var(--ink-3)">$</span><input id="amount" class="amount" name="amount" type="text" inputmode="decimal" value="50" data-input="give-amount" autocomplete="off" style="width:5ch"></div>
        <div class="radios" style="justify-content:center" role="group" aria-label="Quick amounts">${[25, 50, 100, 250].map((n) => html`<button type="button" class="chip" data-act="give-preset" data-n="${n}">${money(n)}</button>`)}</div>
        <fieldset class="field" style="border:0;padding:0;margin-top:18px"><legend style="font-weight:700;margin-bottom:6px">Fund</legend>
          ${c.funds.map((f) => html`<label class="check" style="padding:8px 0"><input type="radio" name="fund" value="${f.id}" ${attr(f.id === defFund, "checked")}><span><b>${f.name}</b><br><span class="faint">${f.description}</span></span></label>`)}</fieldset>
        <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">How often</legend>
          <div class="radios">${Object.entries(FREQ).map(([k, l], i) => html`<label><input type="radio" name="frequency" value="${k}" ${i === 0 ? raw("checked") : ""}><span>${l}</span></label>`)}</div></fieldset>
        <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Pay with</legend>
          <div class="radios"><label><input type="radio" name="method" value="card" checked><span>Card</span></label><label><input type="radio" name="method" value="bank"><span>Bank account</span></label></div></fieldset>
        <button class="btn block" id="give-btn">Give ${money(50)}</button>
      </form>
      <section class="sec"><div class="sec-head"><h2>Your giving</h2><a href="#history">History</a></div>
        <div class="stat"><div><b>${money(total)}</b><span>Given in ${year}</span></div><div><b>${recurring.length}</b><span>Recurring gift${recurring.length === 1 ? "" : "s"}</span></div></div>
        ${recurring.length ? html`<div class="rows" style="margin-top:12px">${recurring.map((r) => html`<div class="row"><span class="lead-ic">${icon("give")}</span><span class="body"><span class="t">${money(r.amount)} ${FREQ[r.frequency].toLowerCase()}</span><span class="s">${fundName(r.fundId)}, since ${fmtShort(r.at)}</span></span><button class="btn ghost sm" data-act="give-stop" data-id="${r.id}">Stop</button></div>`)}</div>` : ""}
      </section>
      <section class="sec"><h2 class="sec-head">Other ways to give</h2><div class="panel"><p style="margin-top:0">Drop a check or cash in the offering during any service${c.address ? html`, or mail it to ${c.address}` : ""}. Write the fund name on the memo line.</p></div></section>`,
  };
};
const parseAmount = (v) => Math.round(parseFloat(String(v).replace(/[^0-9.]/g, "")) * 100) / 100;
Inputs["give-amount"] = (el) => { const n = parseAmount(el.value); $("#give-btn").textContent = n > 0 ? `Give ${money(n)}` : "Give"; el.style.width = `${Math.max(3, el.value.length + 1)}ch`; };
Actions["give-preset"] = (el) => { const a = $("#amount"); a.value = el.dataset.n; Inputs["give-amount"](a); };
Forms.give = (d, f) => {
  const amount = parseAmount(d.amount);
  if (!(amount >= 1)) return formError(f, "Enter an amount of at least $1.");
  if (amount > 100000) return formError(f, "For gifts over $100,000, please contact the church office.");
  const c = S.church();
  openSheet("Confirm your gift", html`<p class="lead">${money(amount)} to <b>${fundName(d.fund)}</b>, ${FREQ[d.frequency].toLowerCase()}, by ${d.method === "bank" ? "bank account" : "card"}.</p>
    ${d.frequency !== "once" ? html`<p class="muted">The first gift is today. You can stop it any time from the Give tab.</p>` : ""}
    ${demoNote("Preview mode: no money moves.")}
    <form data-form="give-confirm"><input type="hidden" name="amount" value="${amount}"><input type="hidden" name="fund" value="${d.fund}"><input type="hidden" name="frequency" value="${d.frequency}"><input type="hidden" name="method" value="${d.method}">
    <button class="btn block">Confirm ${money(amount)} gift to ${c.name}</button></form>`, { focus: "button.btn" });
};
Forms["give-confirm"] = (d) => {
  const me = S.me(), now = new Date().toISOString(), amount = +d.amount;
  const g = S.add("gifts", { by: me.id, name: me.name, fundId: d.fund, amount, frequency: d.frequency, method: d.method, at: now, demo: true });
  if (d.frequency !== "once") S.add("recurring", { by: me.id, fundId: d.fund, amount, frequency: d.frequency, method: d.method, at: now, active: true });
  emit("gift.created", { name: me.name, email: me.email, amount, fund: fundName(d.fund), frequency: d.frequency, method: d.method, preview: true });
  openSheet("Thank you", html`<p class="lead">Your ${money(amount)} gift to ${fundName(d.fund)} was recorded.</p>
    <p class="faint">Confirmation ${g.id.toUpperCase()}. In a live app, a receipt goes to ${me.email || "your email"}.</p>
    <div class="btns"><button class="btn" data-act="go" data-to="history">See giving history</button><button class="btn ghost" data-act="close-sheet">Done</button></div>`);
  render();
};
Actions["give-stop"] = (el) => { S.update("recurring", el.dataset.id, { active: false }); toast("Recurring gift stopped"); render(); };

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
        <div class="rows">${list.map((g) => html`<div class="row"><span class="body"><span class="t">${money(g.amount)}</span><span class="s">${fundName(g.fundId)}, ${fmtShort(g.at)}${g.demo ? " (preview)" : ""}</span></span><span class="faint">${g.method === "bank" ? "Bank" : "Card"}</span></div>`)}</div>
        <div class="btns"><button class="btn ghost sm" data-act="copy" data-done="Statement copied" data-text="${statement(y)}">${icon("copy")}Copy ${y} statement</button></div></section>`;
    }) : html`<div class="rows" style="margin-top:14px">${empty("Gifts you give through the app show up here.", html`<a class="btn ghost" href="#give">Give</a>`)}</div>`,
  };
};
