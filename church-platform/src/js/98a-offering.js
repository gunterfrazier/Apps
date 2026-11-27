// ---------- Offering count and deposits (#offering, #offering-<batch>) ----------
// Sunday's cash and checks, counted by two people, then deposited. A counting batch goes:
//   open      counters tally cash by denomination and enter each envelope and check (keyboard first: Tab across a
//             line, Enter saves it and starts the next), then mark it counted;
//   counted   a second counter, not the one who counted (dual control), re-counts and verifies it, or sends it back;
//   verified  a depositor records the bank deposit and closes it;
//   closed    deposited.
// Who does what comes from permissions: "Count offerings" (count.offering), "Record deposits" (deposit.offering), and
// "Giving reports and funds" (view.giving, the treasurer, who can do all of it). Counters and depositors never see giving
// reports or anyone's other gifts: the database only gives them the gifts in batches they're working on (upgrade-31).
// On a shared workstation the second counter signs in with their own PIN to verify.

const canCount = () => S.isMember() && (S.can("count.offering") || S.can("view.giving"));
const canDeposit = () => S.isMember() && (S.can("deposit.offering") || S.can("view.giving"));
const canOffering = () => canCount() || canDeposit();
const OFFER_STATUS = { open: ["Counting", "warn"], counted: ["Waiting to be verified", "warn"], verified: ["Ready to deposit", "brand"], closed: ["Deposited", "ok"] };
const BILLS = [[100, "$100"], [50, "$50"], [20, "$20"], [10, "$10"], [5, "$5"], [2, "$2"], [1, "$1"]];
const COINS = [[1, "$1 coins"], [0.5, "50¢"], [0.25, "25¢"], [0.1, "10¢"], [0.05, "5¢"], [0.01, "1¢"]];
const cents = (n) => Math.round((+n || 0) * 100) / 100;
const offerStatus = (b) => (b.status in OFFER_STATUS ? b.status : "open");
const batchGifts = (b) => S.list("gifts").filter((g) => g.batchId === b.id).sort((x, y) => (x.at || "").localeCompare(y.at || "") || (x.id < y.id ? -1 : 1));
function batchTotals(b) {
  const gifts = batchGifts(b), cash = cents(gifts.filter((g) => g.method === "cash").reduce((n, g) => n + (+g.amount || 0), 0));
  const checks = gifts.filter((g) => g.method === "check"), checkSum = cents(checks.reduce((n, g) => n + (+g.amount || 0), 0));
  const t = b.tally || {}, tally = cents([...BILLS.map(([v]) => ["b" + v, v]), ...COINS.map(([v]) => ["c" + v, v])].reduce((n, [k, v]) => n + (+t[k] || 0) * v, 0));
  return { gifts, cash, checks: checks.length, checkSum, tally, total: cents(cash + checkSum), diff: cents(tally - cash), tallied: Object.values(t).some((x) => +x) };
}

/* ----- The list of batches ----- */
Screens.offering = (id) => {
  if (!canOffering()) return guard("count.offering");
  if (id) return offeringDesk(id);
  const all = S.list("batches").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const working = all.filter((b) => offerStatus(b) !== "closed"), done = all.filter((b) => offerStatus(b) === "closed").slice(0, 8);
  const row = (b) => { const t = batchTotals(b), [label, tone] = OFFER_STATUS[offerStatus(b)];
    return html`<a class="row" href="#offering-${b.id}"><span class="lead-ic">${icon("give")}</span><span class="body"><span class="t">${b.title || "Offering"} (${fmtShort(fromIsoDay(b.date))})</span>
      <span class="s">${offerStatus(b) === "closed" && b.totals ? money(b.totals.total) : money(t.total)}${b.counter1 ? `. Counted by ${b.counter1}` : ""}${b.counter2 ? `, verified by ${b.counter2}` : ""}${b.depositRef ? `. Deposit ${b.depositRef}` : ""}</span></span>
      <span class="tag ${tone}">${label}</span></a>`; };
  return {
    title: "Offering count", back: S.can("view.giving") ? "treasurer" : "admin",
    body: html`<p class="muted">${canCount() ? "Start a batch, count the cash and enter the checks, then a second person verifies. " : ""}${canDeposit() ? "Verified batches are ready to deposit." : ""}</p>
      ${canCount() ? html`<div class="btns"><button class="btn" data-act="offer-new">${icon("plus")}Start counting</button></div>` : ""}
      <section class="sec"><div class="sec-head"><h2>In progress</h2></div>${working.length ? html`<div class="rows">${working.map(row)}</div>` : empty("Nothing being counted right now.")}</section>
      ${done.length ? html`<section class="sec"><div class="sec-head"><h2>Recently deposited</h2></div><div class="rows">${done.map(row)}</div></section>` : ""}`,
  };
};
Actions["offer-new"] = () => {
  if (!canCount()) return;
  const b = S.add("batches", { title: "Sunday offering", date: isoDay(new Date()), status: "open", tally: {}, startedBy: S.me().id, at: new Date().toISOString() });
  S.save(); go(`offering-${b.id}`);
};

/* ----- One batch: count, verify, deposit ----- */
function offeringDesk(id) {
  const b = S.get("batches", id); if (!b) return { redirect: "offering" };
  const st = offerStatus(b), t = batchTotals(b), [label, tone] = OFFER_STATUS[st], me = S.me().id, c = S.church();
  const editing = st === "open" && canCount();
  const tallyIn = ([v, l], k) => html`<label class="tally-row"><span>${l}</span><input type="number" inputmode="numeric" min="0" step="1" name="${k}" value="${(b.tally || {})[k] || ""}" placeholder="0" data-input="offer-tally" data-id="${b.id}" ${attr(!editing, "disabled")} aria-label="Number of ${l}"><output>${money(((b.tally || {})[k] || 0) * v)}</output></label>`;
  const line = (g) => html`<tr><td>${g.name || "Anonymous"}${g.envelopeNo ? html` <span class="faint">#${g.envelopeNo}</span>` : ""}</td><td>${g.method === "check" ? `Check${g.checkNo ? ` ${g.checkNo}` : ""}` : "Cash"}</td>
    <td>${fundName(g.fundId, c)}</td><td>${giftCatLabel(g.category || "offering", c)}</td><td class="num">${money(g.amount)}</td>
    <td class="num">${editing ? html`<button type="button" class="icon-btn" data-act="offer-line-del" data-id="${g.id}" aria-label="Remove ${g.name} ${money(g.amount)}">${icon("trash")}</button>` : ""}</td></tr>`;
  const members = S.members().map((m) => S.user(m.userId)?.name).filter(Boolean).sort();
  const funds = c.funds || [], cats = giftCategoriesOf(c);
  const diffNote = !t.tallied ? html`<span class="faint">Count the cash on the left.</span>`
    : t.diff === 0 ? html`<span class="tag ok">${icon("check")}Cash matches the count</span>`
      : html`<span class="tag warn">${t.diff > 0 ? `${money(t.diff)} counted but not entered` : `${money(-t.diff)} more entered than counted`}</span>${editing && t.diff > 0 ? html` <button type="button" class="btn ghost sm" data-act="offer-loose" data-id="${b.id}">Add ${money(t.diff)} as loose offering</button>` : ""}`;
  // What happens next, for this person and this step.
  let next = "";
  if (st === "open" && canCount()) next = html`<button class="btn" data-act="offer-counted" data-id="${b.id}" ${attr(!t.gifts.length, "disabled")}>${icon("check")}Done counting</button><span class="faint">Then someone else verifies it.</span>`;
  else if (st === "open") next = html`<span class="faint">Being counted.</span>`;
  else if (st === "counted" && canCount() && b.countedBy !== me) next = html`<button class="btn" data-act="offer-verify" data-id="${b.id}">${icon("check")}I re-counted it, and it matches</button><button class="btn ghost" data-act="offer-reopen" data-id="${b.id}">Send back to count again</button>`;
  else if (st === "counted" && b.countedBy === me) next = html`<span class="faint">${icon("lock")} Waiting for a second counter to verify it.${typeof Workstation !== "undefined" && Workstation.get?.() ? " On this computer, lock it and let them sign in with their PIN." : " They verify from their own sign-in."}</span><button class="btn ghost sm" data-act="offer-reopen" data-id="${b.id}">Reopen to fix</button>`;
  else if (st === "counted") next = html`<span class="faint">Waiting for a counter to verify it.</span>`;
  else if (st === "verified" && canDeposit()) next = html`<form data-form="offer-deposit" class="deposit-form" novalidate><input type="hidden" name="id" value="${b.id}">
      <label class="field"><span>Deposit slip #</span><input name="depositRef" required maxlength="30" placeholder="DEP-1024" value="${b.depositRef || ""}"></label>
      <label class="field"><span>Deposited on</span><input type="date" name="depositDate" value="${isoDay(new Date())}" required></label>
      <button class="btn">${icon("check")}Record the deposit</button><p class="err" role="alert"></p></form>`;
  else if (st === "verified") next = html`<span class="faint">Verified. Waiting for the depositor.</span>`;
  else next = html`<span class="faint">Deposited${b.depositDate ? ` on ${fmtShort(fromIsoDay(b.depositDate))}` : ""}${b.depositRef ? `, slip ${b.depositRef}` : ""}${b.depositedBy ? `, by ${S.userName(b.depositedBy)}` : ""}.</span>`;
  return {
    title: `${b.title || "Offering"}, ${fmtShort(fromIsoDay(b.date))}`, back: "offering", wide: true,
    body: html`<div class="offer-head"><span class="tag ${tone}">${label}</span>
        <span class="faint">${[b.countedBy && `Counted by ${S.userName(b.countedBy)}`, b.verifiedBy && `verified by ${S.userName(b.verifiedBy)}`].filter(Boolean).join(", ")}</span>
        <span class="offer-spacer"></span>${st !== "open" && (S.can("view.giving") || canDeposit()) ? html`<button class="btn ghost sm" data-act="treas-batch-pdf" data-id="${b.id}">${icon("printer")}Deposit sheet</button>` : ""}</div>
      <div class="offer-desk">
        <section class="panel offer-tally"><h2>Cash count</h2>
          <h3>Bills</h3>${BILLS.map((x) => tallyIn(x, "b" + x[0]))}<h3>Coins</h3>${COINS.map((x) => tallyIn(x, "c" + x[0]))}
          <p class="tally-total"><span>Cash counted</span><b id="offer-tally-total">${money(t.tally)}</b></p></section>
        <section class="panel offer-lines"><h2>Envelopes and checks</h2>
          ${editing ? html`<form data-form="offer-line" class="offer-entry" novalidate autocomplete="off"><input type="hidden" name="id" value="${b.id}">
            <label class="field"><span>Name</span><input name="name" list="offer-people" maxlength="60" placeholder="Name on the envelope or check" data-first></label>
            <label class="field narrow"><span>Env #</span><input name="envelopeNo" maxlength="12"></label>
            <label class="field narrow"><span>Paid by</span><select name="method"><option value="check">Check</option><option value="cash">Cash</option></select></label>
            <label class="field narrow"><span>Check #</span><input name="checkNo" maxlength="20"></label>
            <label class="field narrow"><span>Amount</span><input name="amount" inputmode="decimal" required placeholder="0.00"></label>
            <label class="field"><span>Fund</span><select name="fundId">${funds.map((f) => html`<option value="${f.id}">${f.name}</option>`)}</select></label>
            <label class="field"><span>For</span><select name="category">${cats.map(([k, l]) => html`<option value="${k}" ${attr(k === "offering", "selected")}>${l}</option>`)}</select></label>
            <button class="btn" aria-label="Add this line">${icon("plus")}Add</button>
            <datalist id="offer-people">${members.map((n) => html`<option value="${n}">`)}</datalist>
            <p class="err" role="alert"></p><p class="faint offer-hint">Tab moves across, Enter adds the line and starts the next.</p></form>` : ""}
          <div class="table-wrap"><table class="mini-table offer-table"><thead><tr><th>Name</th><th>Paid by</th><th>Fund</th><th>For</th><th class="num">Amount</th><th></th></tr></thead>
            <tbody>${t.gifts.length ? t.gifts.map(line) : html`<tr><td colspan="6" class="faint">Nothing entered yet.</td></tr>`}</tbody></table></div>
          <div class="offer-sum"><span>${plural(t.checks, "check")}: <b>${money(t.checkSum)}</b></span><span>Cash entered: <b>${money(t.cash)}</b></span><span>Total: <b>${money(t.total)}</b></span></div>
          <p class="offer-diff">${diffNote}</p>
          <div class="btns offer-next">${next}</div></section>
      </div>`,
    after() { if (editing && !document.activeElement?.closest?.(".offer-desk")) $(".offer-entry [data-first]")?.focus({ preventScroll: true }); },
  };
}

// Tally: saves as you type, and the totals follow without redrawing the page.
let offerTallyTimer = 0;
Inputs["offer-tally"] = (el) => {
  const b = S.get("batches", el.dataset.id); if (!b || offerStatus(b) !== "open") return;
  b.tally = { ...(b.tally || {}), [el.name]: Math.max(0, Math.floor(+el.value || 0)) };
  const v = el.name.startsWith("b") ? +el.name.slice(1) : +el.name.slice(1), out = el.parentElement.querySelector("output");
  if (out) out.textContent = money(b.tally[el.name] * v);
  const t = batchTotals(b); $("#offer-tally-total").textContent = money(t.tally);
  clearTimeout(offerTallyTimer); offerTallyTimer = setTimeout(() => { S.save(); const d = $(".offer-diff"); if (d && document.activeElement !== el) render(); }, 700);
};
document.addEventListener("focusout", (e) => { if (e.target.matches?.("[data-input=offer-tally]") && offerTallyTimer) { clearTimeout(offerTallyTimer); offerTallyTimer = 0; S.save(); setTimeout(() => { if (!document.activeElement?.matches?.("[data-input=offer-tally]")) render(); }, 0); } });

Forms["offer-line"] = (d, f) => {
  const b = S.get("batches", d.id); if (!b || offerStatus(b) !== "open" || !canCount()) return;
  const amount = cents(String(d.amount || "").replace(/[$,\s]/g, ""));
  if (!(amount > 0)) return formError(f, "Enter the amount.");
  const name = String(d.name || "").trim(), m = name && S.members().find((x) => S.user(x.userId)?.name.toLowerCase() === name.toLowerCase());
  const u = m && S.user(m.userId), method = d.method === "cash" ? "cash" : "check";
  S.add("gifts", { by: u ? u.id : `guest-${slugify(name || "anonymous")}`, name: u ? u.name : name || (method === "cash" ? "Loose offering" : "Anonymous"),
    fundId: d.fundId, category: d.category || "offering", amount, frequency: "once", method, checkNo: method === "check" ? String(d.checkNo || "").trim() : "",
    envelopeNo: String(d.envelopeNo || "").trim(), batchId: b.id, taxDeductible: true, at: `${b.date}T12:00:00.000Z`, status: "paid", recordedBy: S.me().id });
  S.save(); render();
  const next = $(".offer-entry [data-first]"); if (next) { next.focus(); next.select(); }
  toast(`Added ${money(amount)}`);
};
Actions["offer-line-del"] = (el) => { const g = S.get("gifts", el.dataset.id), b = g && S.get("batches", g.batchId); if (!b || offerStatus(b) !== "open") return; S.remove("gifts", g.id); S.save(); render(); toast("Line removed"); };
Actions["offer-loose"] = (el) => {
  const b = S.get("batches", el.dataset.id), t = b && batchTotals(b); if (!t || t.diff <= 0 || offerStatus(b) !== "open") return;
  const c = S.church(), fund = (c.funds || [])[0]?.id;
  S.add("gifts", { by: "guest-loose-offering", name: "Loose offering", fundId: fund, category: "offering", amount: t.diff, frequency: "once", method: "cash", checkNo: "", envelopeNo: "",
    batchId: b.id, taxDeductible: false, at: `${b.date}T12:00:00.000Z`, status: "paid", recordedBy: S.me().id });
  S.save(); render(); toast(`Added ${money(t.diff)} loose offering`);
};
const offerSet = (b, patch, msg) => { Object.assign(b, patch); S.save(); render(); toast(msg); };
Actions["offer-counted"] = (el) => {
  const b = S.get("batches", el.dataset.id), t = b && batchTotals(b); if (!b || offerStatus(b) !== "open" || !canCount()) return;
  if (t.tallied && t.diff !== 0) return openSheet("The cash doesn't match", html`<p>You counted ${money(t.tally)} in cash, and the cash lines add up to ${money(t.cash)}. Fix the count or the lines first, or add the difference as loose offering.</p><div class="btns"><button class="btn" data-act="close-sheet">Back to counting</button></div>`);
  offerSet(b, { status: "counted", countedBy: S.me().id, counter1: S.me().name, totals: { cash: t.cash, checks: t.checks, checkSum: t.checkSum, total: t.total, tally: t.tally } }, "Counted. Now a second counter verifies it.");
};
Actions["offer-verify"] = (el) => {
  const b = S.get("batches", el.dataset.id); if (!b || offerStatus(b) !== "counted" || !canCount() || b.countedBy === S.me().id) return;
  offerSet(b, { status: "verified", verifiedBy: S.me().id, counter2: S.me().name }, "Verified. Ready to deposit.");
};
Actions["offer-reopen"] = (el) => {
  const b = S.get("batches", el.dataset.id); if (!b || offerStatus(b) !== "counted" || !canCount()) return;
  offerSet(b, { status: "open", countedBy: null, verifiedBy: null }, "Back to counting");
};
Forms["offer-deposit"] = (d, f) => {
  const b = S.get("batches", d.id); if (!b || offerStatus(b) !== "verified" || !canDeposit()) return;
  if (!String(d.depositRef || "").trim()) return formError(f, "Enter the deposit slip number.");
  const t = batchTotals(b);
  offerSet(b, { status: "closed", depositRef: d.depositRef.trim(), depositDate: d.depositDate || isoDay(new Date()), depositedBy: S.me().id, totals: { ...(b.totals || {}), cash: t.cash, checks: t.checks, checkSum: t.checkSum, total: t.total } }, `Deposit ${d.depositRef.trim()} recorded`);
};
shortcut("Offering count", ["Tab"], "Next box on the line", () => location.hash.startsWith("#offering-"));
shortcut("Offering count", ["Enter"], "Add the line and start the next", () => location.hash.startsWith("#offering-"));
