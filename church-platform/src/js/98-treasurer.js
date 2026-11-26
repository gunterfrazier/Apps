// ---------- Church Accounting Platform & Treasurer Interface (#treasurer) ----------
// Complete church treasurer workstation: tracks in-app and in-person donations (card, bank, cash, check with check #
// and envelope #), customizable categories (Tithes, Offerings, Gifts, Missions, Building), split donations across funds,
// Sunday offering batches, fund accounting, annual/monthly budgets, goals, expense ledger with receipts, weekly treasurer
// reports (PDF & CSV), and IRS Publication 1771-compliant year-end 501(c)(3) donor tax statements.

const DEFAULT_GIFT_CATEGORIES = [
  ["tithe", "Tithe"],
  ["offering", "General Offering"],
  ["gift", "Special Gift"],
  ["missions", "Missions & Outreach"],
  ["building", "Building & Capital"],
  ["benevolence", "Benevolence / Care"],
  ["youth", "Kids & Youth Ministry"],
  ["memorial", "Memorial / Honorarium"],
];

const BUDGET_DEPARTMENTS = [
  ["worship", "Worship, Music & Tech", 18000],
  ["facilities", "Facilities, Utilities & Insurance", 48000],
  ["missions", "Missions & Community Outreach", 24000],
  ["kids_youth", "Children & Youth Ministries", 15000],
  ["pastoral", "Pastoral, Staff & Care", 72000],
  ["admin", "Administration & Office", 12000],
];

const TREASURER_METHODS = [
  ["check", "Check"],
  ["cash", "Cash"],
  ["card", "Card (In-App / Reader)"],
  ["bank", "Bank / ACH"],
  ["paypal", "PayPal"],
  ["in-kind", "Non-Cash / In-Kind"],
];

// Treasurers are people who can see giving: the database only shows donor records to them (rec_read in upgrade-15.sql).
const canTreasurer = () => S.isMember() && S.can("view.giving");
const giftCategoriesOf = (c = S.church()) => c?.giftCategories?.length ? c.giftCategories : DEFAULT_GIFT_CATEGORIES;
const giftCatLabel = (k, c = S.church()) => (giftCategoriesOf(c).find(([x]) => x === k) || [k, String(k || "Tithe").replace(/^./, (m) => m.toUpperCase())])[1];
const deptLabel = (k) => (BUDGET_DEPARTMENTS.find(([x]) => x === k) || [k, k])[1];
const payMethodFull = (m) => (TREASURER_METHODS.find(([k]) => k === m) || [m, methodLabel(m)])[1];

function seedAccountingFor(cid) {
  const now = new Date(), yr = yearOf(now), mStr = pad2(monthOf(now));
  const batchId = `${cid}-batch-sun1`;
  const batches = [
    {
      id: batchId, churchId: cid, locationId: null,
      date: isoDay(new Date(Date.now() - 3 * DAY)),
      title: "Sunday Morning Offering Count",
      counter1: "Elena Morales", counter2: "Marcus Vance",
      depositRef: "DEP-1114", status: "closed",
      notes: "Verified cash & check count in church office safe.",
      at: new Date(Date.now() - 3 * DAY).toISOString(),
    },
  ];
  const expenses = [
    {
      id: `${cid}-exp-1`, churchId: cid, locationId: null,
      date: `${yr}-${mStr}-04`, payee: "Alabama Power & Utility",
      description: "Monthly sanctuary and fellowship hall electricity",
      fundId: "general", department: "facilities",
      amount: 685.40, method: "ach", refNo: "ACH-9041",
      status: "paid", by: "u-elena", approvedBy: "Pastor David",
      at: new Date(Date.now() - 10 * DAY).toISOString(),
    },
    {
      id: `${cid}-exp-2`, churchId: cid, locationId: null,
      date: `${yr}-${mStr}-08`, payee: "Sweetwater Sound & Stage",
      description: "Replacement wireless lapel microphone & stage cables",
      fundId: "general", department: "worship",
      amount: 349.00, method: "card", refNo: "VISA-4412",
      status: "paid", by: "u-marcus", approvedBy: "Pastor David",
      at: new Date(Date.now() - 6 * DAY).toISOString(),
    },
    {
      id: `${cid}-exp-3`, churchId: cid, locationId: null,
      date: `${yr}-${mStr}-11`, payee: "Cleburne County Food Pantry",
      description: "Monthly benevolence & local family grocery boxes",
      fundId: "missions", department: "missions",
      amount: 500.00, method: "check", refNo: "CHK-1084",
      status: "paid", by: "u-elena", approvedBy: "Pastor David",
      at: new Date(Date.now() - 4 * DAY).toISOString(),
    },
  ];
  const budgets = BUDGET_DEPARTMENTS.map(([dept, label, annual]) => ({
    id: `${cid}-bgt-${dept}-${yr}`, churchId: cid, year: yr,
    department: dept, label, fundId: dept === "missions" ? "missions" : "general",
    annualAmount: annual,
  }));
  return { batches, expenses, budgets };
}

// Register batches, expenses, budgets in RECORD_KINDS and S.load
{
  if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("expenses")) {
    RECORD_KINDS.push("expenses", "budgets", "batches");
  }
  if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("expenses")) {
    QUIET_KINDS.push("expenses", "budgets", "batches");
  }
  const prevLoad = S.load.bind(S);
  S.load = function () {
    prevLoad();
    this.state.expenses ||= [];
    this.state.budgets ||= [];
    this.state.batches ||= [];
    Object.values(this.state.churches || {}).forEach((c) => {
      // Sample opening balances, goals and fund codes are for the demo only: on the live app a church's funds start
      // without them, and gift categories come from giftCategoriesOf until the treasurer changes them.
      if (!Backend.configured()) (c.funds || []).forEach((f, idx) => {
        f.code ||= `${(idx + 1) * 100}-${f.id.slice(0, 3).toUpperCase()}`;
        if (f.restricted === undefined) f.restricted = f.id !== "general";
        if (f.openingBalance === undefined) f.openingBalance = idx === 0 ? 14500 : idx === 1 ? 8200 : 3500;
        if (f.goalAmount === undefined) f.goalAmount = idx === 0 ? 180000 : idx === 1 ? 35000 : 25000;
      });
      if (!Backend.configured() && !this.state.expenses.some((e) => e.churchId === c.id)) {
        const seeded = seedAccountingFor(c.id);
        this.state.batches.push(...seeded.batches);
        this.state.expenses.push(...seeded.expenses);
        this.state.budgets.push(...seeded.budgets);
        // Enrich sample gifts with category & check/envelope metadata if missing
        (this.state.gifts || []).filter((g) => g.churchId === c.id).forEach((g, i) => {
          g.category ||= i % 3 === 0 ? "tithe" : i % 3 === 1 ? "offering" : "missions";
          if (g.method === "cash" && !g.envelopeNo) g.envelopeNo = String(101 + i);
        });
      }
    });
  };
  if (S.state) {
    S.state.expenses ||= [];
    S.state.budgets ||= [];
    S.state.batches ||= [];
    Object.values(S.state.churches || {}).forEach((c) => {
      // Sample opening balances, goals and fund codes are for the demo only: on the live app a church's funds start
      // without them, and gift categories come from giftCategoriesOf until the treasurer changes them.
      if (!Backend.configured()) (c.funds || []).forEach((f, idx) => {
        f.code ||= `${(idx + 1) * 100}-${f.id.slice(0, 3).toUpperCase()}`;
        if (f.restricted === undefined) f.restricted = f.id !== "general";
        if (f.openingBalance === undefined) f.openingBalance = idx === 0 ? 14500 : idx === 1 ? 8200 : 3500;
        if (f.goalAmount === undefined) f.goalAmount = idx === 0 ? 180000 : idx === 1 ? 35000 : 25000;
      });
      if (!Backend.configured() && !S.state.expenses.some((e) => e.churchId === c.id)) {
        const seeded = seedAccountingFor(c.id);
        S.state.batches.push(...seeded.batches);
        S.state.expenses.push(...seeded.expenses);
        S.state.budgets.push(...seeded.budgets);
      }
    });
  }
}

let treasurerTab = "overview"; // overview | donations | expenses | budgets | reports
let giftFilterMethod = "ALL";
let giftFilterCat = "ALL";
let reportWeekStart = weekOf(isoDay(new Date()));

function treasurerSeg(active) {
  return seg([
    ["treasurer", "Overview & funds", true],
    ["treasurer-donations", "Donations & batches", true],
    ["treasurer-expenses", "Expenses", true],
    ["treasurer-budgets", "Budgets & goals", true],
    ["treasurer-reports", "Weekly & tax reports", true],
  ], active);
}

/** Computes fund-by-fund accounting ledger for a given year. */
function computeFundAccounting(year = yearOf()) {
  const c = S.church();
  if (!c) return { funds: [], totalIn: 0, totalOut: 0, totalNet: 0, byCat: {}, byMethod: {} };
  const gifts = S.list("gifts").filter((g) => yearOf(g.at) === year && g.status !== "refunded");
  const expenses = S.list("expenses").filter((e) => yearOf(e.date || e.at) === year && e.status !== "void");

  const byCat = {}, byMethod = {};
  gifts.forEach((g) => {
    const cat = g.category || "tithe";
    byCat[cat] = (byCat[cat] || 0) + (+g.amount || 0);
    const m = g.method || "card";
    byMethod[m] = (byMethod[m] || 0) + (+g.amount || 0);
  });

  const funds = (c.funds || []).map((f) => {
    const opening = +f.openingBalance || 0;
    const inflows = gifts.filter((g) => g.fundId === f.id).reduce((n, g) => n + (+g.amount || 0), 0);
    const outflows = expenses.filter((e) => e.fundId === f.id).reduce((n, e) => n + (+e.amount || 0), 0);
    const balance = opening + inflows - outflows;
    const goal = +f.goalAmount || 0;
    return {
      ...f,
      opening,
      inflows,
      outflows,
      balance,
      goal,
      goalPct: goal > 0 ? Math.min(100, Math.round((inflows / goal) * 100)) : 0,
    };
  });

  const totalIn = funds.reduce((n, f) => n + f.inflows, 0);
  const totalOut = funds.reduce((n, f) => n + f.outflows, 0);
  const totalNet = funds.reduce((n, f) => n + f.balance, 0);
  return { funds, gifts, expenses, totalIn, totalOut, totalNet, byCat, byMethod };
}

Screens.treasurer = (tail = "") => {
  if (!canTreasurer()) return guard("view.giving");
  const tab = ["donations", "expenses", "budgets", "reports"].includes(tail) ? tail : "overview";
  treasurerTab = tab;
  const activeHash = tab === "overview" ? "treasurer" : `treasurer-${tab}`;
  const year = yearOf();
  const acct = computeFundAccounting(year);

  let content = "";
  if (tab === "overview") content = renderTreasurerOverview(acct, year);
  else if (tab === "donations") content = renderTreasurerDonations(acct, year);
  else if (tab === "expenses") content = renderTreasurerExpenses(acct, year);
  else if (tab === "budgets") content = renderTreasurerBudgets(acct, year);
  else if (tab === "reports") content = renderTreasurerReports(acct, year);

  return {
    title: "Treasurer & accounting", back: "admin",
    body: html`${treasurerSeg(activeHash)}${content}`,
  };
};

// ----- Tab 1: Overview & Fund Accounting -----
function renderTreasurerOverview(acct, year) {
  const c = S.church();
  const cashCheckTotal = (acct.byMethod.cash || 0) + (acct.byMethod.check || 0);
  const onlineTotal = acct.totalIn - cashCheckTotal;
  const catRows = Object.entries(acct.byCat).map(([k, v]) => [giftCatLabel(k, c), Math.round(v)]).sort((a, b) => b[1] - a[1]);

  return html`
    <div class="stat-tiles" style="margin-top:14px">
      ${statTile(`${year} Inflows`, money(Math.round(acct.totalIn)), `${plural(acct.gifts.length, "recorded donation")}`)}
      ${statTile(`${year} Expenses`, money(Math.round(acct.totalOut)), `${plural(acct.expenses.length, "disbursement")}`)}
      ${statTile("Available fund balance", money(Math.round(acct.totalNet)), "Opening + Inflows − Expenses")}
      ${statTile("In-person vs. Online", `${pct(cashCheckTotal, acct.totalIn)} cash/check`, `${money(Math.round(cashCheckTotal))} in-person · ${money(Math.round(onlineTotal))} online`)}
    </div>

    <div class="btns" style="margin-top:12px">
      <button type="button" class="btn sm" data-act="treas-gift-new">${icon("plus")}Record cash / check / card gift</button>
      <button type="button" class="btn ghost sm" data-act="treas-expense-new">${icon("plus")}Record expense</button>
      <button type="button" class="btn ghost sm" data-act="treas-batch-new">${icon("list")}New Sunday offering batch</button>
      <a class="btn ghost sm" href="#treasurer-reports">${icon("download")}Weekly &amp; tax reports</a>
    </div>

    <section class="sec">
      <div class="sec-head"><h2>Fund accounting &amp; net asset balances (${year})</h2><button type="button" class="btn ghost sm" data-act="treas-funds-edit">${icon("edit")}Configure funds &amp; goals</button></div>
      <div class="panel">
        <div class="table-wrap">
          <table class="mini-table">
            <thead>
              <tr><th>Code &amp; Fund</th><th>Type</th><th class="num">Opening</th><th class="num">YTD Inflows</th><th class="num">YTD Expenses</th><th class="num">Current Balance</th><th>Annual Goal</th></tr>
            </thead>
            <tbody>
              ${acct.funds.map((f) => html`<tr>
                <td><b>${f.name}</b><br><span class="faint" style="font-size:.76rem">${f.code || ""}</span></td>
                <td><span class="tag ${f.restricted ? "warn" : "ok"}">${f.restricted ? "Restricted" : "Unrestricted"}</span></td>
                <td class="num">${money(f.opening)}</td>
                <td class="num" style="color:var(--ok)">+${money(f.inflows)}</td>
                <td class="num" style="color:var(--warn)">−${money(f.outflows)}</td>
                <td class="num"><b>${money(f.balance)}</b></td>
                <td style="min-width:130px">
                  ${f.goal ? html`<div style="font-size:.78rem;display:flex;justify-content:space-between"><span>${f.goalPct}%</span><span class="faint">${money(f.goal)}</span></div>
                    <span class="progress" style="display:block;margin-top:4px"><i style="width:${f.goalPct}%"></i></span>` : html`<span class="faint">—</span>`}
                </td>
              </tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    ${catRows.length ? html`<section class="sec">
      <div class="sec-head"><h2>Donations by customized category (${year})</h2><button type="button" class="btn ghost sm" data-act="treas-cats-edit">${icon("edit")}Customize categories</button></div>
      ${hBarsT("By category", catRows, money)}
    </section>` : ""}
  `;
}

// ----- Tab 2: Donations (In-App & In-Person Cash, Check, Card) & Counting Batches -----
function renderTreasurerDonations(acct, year) {
  const c = S.church();
  const batches = S.list("batches").sort((a, b) => b.date.localeCompare(a.date));
  const allGifts = S.list("gifts").sort((a, b) => new Date(b.at) - new Date(a.at));
  const filtered = allGifts.filter((g) => {
    if (giftFilterMethod !== "ALL" && g.method !== giftFilterMethod) return false;
    if (giftFilterCat !== "ALL" && (g.category || "tithe") !== giftFilterCat) return false;
    return true;
  });

  const ledgerRows = filtered.map((g) => [
    isoDay(g.at),
    g.name || S.userName(g.by) || "Anonymous",
    g.envelopeNo ? `#${g.envelopeNo}` : "—",
    giftCatLabel(g.category || "tithe", c),
    fundName(g.fundId, c),
    `${payMethodFull(g.method)}${g.checkNo ? ` #${g.checkNo}` : ""}`,
    g.taxDeductible === false ? "Non-deductible" : "501(c)(3)",
    Math.round((+g.amount || 0) * 100) / 100,
  ]);

  return html`
    <div class="btns" style="margin-top:14px">
      <button type="button" class="btn" data-act="treas-gift-new">${icon("plus")}Record donation (Cash / Check / Card)</button>
      <button type="button" class="btn ghost" data-act="treas-split-new">${icon("layers")}Split gift across funds</button>
      <button type="button" class="btn ghost" data-act="treas-batch-new">${icon("list")}New counting batch</button>
      <button type="button" class="btn ghost" data-act="treas-cats-edit">${icon("edit")}Custom categories</button>
    </div>

    <section class="sec">
      <div class="sec-head"><h2>Offering counting batches</h2></div>
      <div class="rows">
        ${batches.length ? batches.slice(0, 6).map((b) => {
          const batchGifts = allGifts.filter((g) => g.batchId === b.id || (!g.batchId && isoDay(g.at) === b.date && (g.method === "cash" || g.method === "check")));
          const cashSum = batchGifts.filter((g) => g.method === "cash").reduce((n, g) => n + g.amount, 0);
          const checkSum = batchGifts.filter((g) => g.method === "check").reduce((n, g) => n + g.amount, 0);
          const tot = batchGifts.reduce((n, g) => n + g.amount, 0);
          return html`<div class="row">
            <span class="lead-ic">${icon("give")}</span>
            <span class="body">
              <span class="t">${b.title} (${fmtShort(fromIsoDay(b.date))})</span>
              <span class="s">Total: <b>${money(tot)}</b> (Cash: ${money(cashSum)} · Checks: ${money(checkSum)}) · Counters: ${[b.counter1, b.counter2].filter(Boolean).join(" & ") || "Unassigned"}${b.depositRef ? ` · Ref ${b.depositRef}` : ""}</span>
            </span>
            <span class="tag ${b.status === "closed" ? "ok" : "warn"}">${b.status === "closed" ? "Deposited" : "Open"}</span>
            <button type="button" class="btn ghost sm" data-act="treas-batch-pdf" data-id="${b.id}" title="Download deposit sheet PDF">${icon("printer")}PDF</button>
          </div>`;
        }) : empty("No counting batches created yet.")}
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><h2>All in-app &amp; in-person donations</h2></div>
      <div class="chips" style="margin-bottom:8px">
        <button type="button" class="chip" data-act="treas-filter-method" data-m="ALL" aria-pressed="${giftFilterMethod === "ALL"}">All methods</button>
        ${TREASURER_METHODS.map(([k, l]) => html`<button type="button" class="chip" data-act="treas-filter-method" data-m="${k}" aria-pressed="${giftFilterMethod === k}">${l}</button>`)}
      </div>
      <div class="chips" style="margin-bottom:12px">
        <button type="button" class="chip" data-act="treas-filter-cat" data-c="ALL" aria-pressed="${giftFilterCat === "ALL"}">All categories</button>
        ${giftCategoriesOf(c).map(([k, l]) => html`<button type="button" class="chip" data-act="treas-filter-cat" data-c="${k}" aria-pressed="${giftFilterCat === k}">${l}</button>`)}
      </div>
      <div class="panel">
        ${reportTable("treas-gifts", "treasurer-donations", ["Date", "Donor", "Env #", "Category", "Fund", "Method / Check #", "Tax Status", "Amount"], ledgerRows, { numeric: [7], limit: 35, empty: "No donations match these filters." })}
      </div>
    </section>
  `;
}

Actions["treas-filter-method"] = (el) => { giftFilterMethod = el.dataset.m; render(); };
Actions["treas-filter-cat"] = (el) => { giftFilterCat = el.dataset.c; render(); };

Actions["treas-gift-new"] = () => {
  const c = S.church(), members = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const batches = S.list("batches").sort((a, b) => b.date.localeCompare(a.date));
  openSheet("Record donation (Cash, Check, Card)", html`<form data-form="treas-gift-save" novalidate>
    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px">
      <label class="field"><span>Member (or leave blank for walk-in)</span><select name="userId"><option value="">Walk-in / Guest donor</option>${members.map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select></label>
      <label class="field"><span>Walk-in name (if not listed)</span><input type="text" name="guestName" maxlength="60" placeholder="John & Mary Smith"></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <label class="field"><span>Amount ($)</span><input type="number" step="0.01" min="0.01" name="amount" required placeholder="100.00"></label>
      <label class="field"><span>Date received</span><input type="date" name="date" value="${isoDay(new Date())}" required></label>
      <label class="field"><span>Envelope # (optional)</span><input type="text" name="envelopeNo" maxlength="16" placeholder="104"></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Category (Tithe / Offering / Gift)</span><select name="category">${giftCategoriesOf(c).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label class="field"><span>Fund</span><select name="fundId">${c.funds.map((f) => html`<option value="${f.id}">${f.name}</option>`)}</select></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Payment method</span><select name="method">${TREASURER_METHODS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label class="field"><span>Check # / Reference #</span><input type="text" name="checkNo" maxlength="30" placeholder="e.g., Check #1042"></label>
    </div>
    ${batches.length ? html`<label class="field"><span>Counting batch (optional)</span><select name="batchId"><option value="">None</option>${batches.map((b) => html`<option value="${b.id}">${b.title} (${b.date})</option>`)}</select></label>` : ""}
    <label class="field"><span>Memo / Designation note</span><input type="text" name="memo" maxlength="140" placeholder="Optional memo line note"></label>
    <label class="check"><input type="checkbox" name="taxDeductible" checked><span><b>Tax-deductible 501(c)(3) contribution</b> (include on year-end tax statement)</span></label>
    <button class="btn block">Save donation</button>
  </form>`, { wide: true });
};

Forms["treas-gift-save"] = (d, f) => {
  const amount = Math.round(parseFloat(d.amount) * 100) / 100;
  if (!(amount > 0)) return formError(f, "Enter a valid donation amount.");
  const u = d.userId ? S.user(d.userId) : null;
  const donorName = u ? u.name : String(d.guestName || "").trim() || "Anonymous Donor";
  const g = S.add("gifts", {
    by: u ? u.id : `guest-${slugify(donorName)}`,
    name: donorName,
    fundId: d.fundId,
    category: d.category || "tithe",
    amount,
    frequency: "once",
    method: d.method || "check",
    checkNo: String(d.checkNo || "").trim(),
    envelopeNo: String(d.envelopeNo || "").trim(),
    batchId: d.batchId || null,
    memo: String(d.memo || "").trim(),
    taxDeductible: !!d.taxDeductible,
    at: d.date ? `${d.date}T12:00:00.000Z` : new Date().toISOString(),
    status: "paid",
    recordedBy: S.me().id,
  });
  logActivity(`Recorded ${money(amount)} ${giftCatLabel(d.category)} (${payMethodFull(d.method)}) from ${donorName}`, "giving");
  S.save(); closeSheet(true); toast(`Recorded ${money(amount)} from ${donorName}`); render();
};

// Split Gift across multiple funds/categories (e.g. one check split between Tithe and Missions)
Actions["treas-split-new"] = () => {
  const c = S.church(), members = S.members().map((m) => S.user(m.userId)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  openSheet("Record split donation (multiple funds/categories)", html`<form data-form="treas-split-save" novalidate>
    <p class="muted" style="margin-top:0">Use this when a single check or cash envelope is split across multiple funds or categories (such as $200 Tithe + $50 Missions).</p>
    <div style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:10px">
      <label class="field"><span>Donor</span><select name="userId"><option value="">Walk-in / Guest</option>${members.map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select></label>
      <label class="field"><span>Guest name (if walk-in)</span><input type="text" name="guestName" maxlength="60"></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${isoDay(new Date())}" required></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <label class="field"><span>Method</span><select name="method">${TREASURER_METHODS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label class="field"><span>Check #</span><input type="text" name="checkNo" maxlength="24"></label>
      <label class="field"><span>Envelope #</span><input type="text" name="envelopeNo" maxlength="16"></label>
    </div>
    <h3 style="margin-top:12px">Split lines</h3>
    ${[0, 1, 2].map((i) => html`<div style="display:grid;grid-template-columns:1fr 1fr .8fr;gap:8px;margin-top:6px">
      <select name="cat${i}" aria-label="Category ${i + 1}">${giftCategoriesOf(c).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
      <select name="fund${i}" aria-label="Fund ${i + 1}">${c.funds.map((f, fi) => html`<option value="${f.id}" ${attr(fi === i % c.funds.length, "selected")}>${f.name}</option>`)}</select>
      <input type="number" step="0.01" min="0" name="amt${i}" placeholder="${i === 0 ? "150.00" : i === 1 ? "50.00" : "0.00"}" aria-label="Amount ${i + 1}">
    </div>`)}
    <button class="btn block" style="margin-top:14px">Save split donation</button>
  </form>`, { wide: true });
};

Forms["treas-split-save"] = (d, f) => {
  const u = d.userId ? S.user(d.userId) : null;
  const donorName = u ? u.name : String(d.guestName || "").trim() || "Anonymous Donor";
  const lines = [0, 1, 2].map((i) => ({ cat: d[`cat${i}`], fundId: d[`fund${i}`], amt: Math.round((parseFloat(d[`amt${i}`]) || 0) * 100) / 100 })).filter((x) => x.amt > 0);
  if (!lines.length) return formError(f, "Enter an amount on at least one split line.");
  const splitGroup = uid();
  lines.forEach((l) => {
    S.add("gifts", {
      by: u ? u.id : `guest-${slugify(donorName)}`,
      name: donorName,
      fundId: l.fundId,
      category: l.cat || "tithe",
      amount: l.amt,
      frequency: "once",
      method: d.method || "check",
      checkNo: String(d.checkNo || "").trim(),
      envelopeNo: String(d.envelopeNo || "").trim(),
      splitGroup,
      taxDeductible: true,
      at: d.date ? `${d.date}T12:00:00.000Z` : new Date().toISOString(),
      status: "paid",
      recordedBy: S.me().id,
    });
  });
  const tot = lines.reduce((n, l) => n + l.amt, 0);
  logActivity(`Recorded split donation (${money(tot)} across ${lines.length} funds) from ${donorName}`, "giving");
  S.save(); closeSheet(true); toast(`Saved ${lines.length} split lines totaling ${money(tot)}`); render();
};

// Sunday Offering Batch creation & Deposit PDF
Actions["treas-batch-new"] = () => {
  openSheet("New Sunday offering counting batch", html`<form data-form="treas-batch-save" novalidate>
    <label class="field"><span>Batch title</span><input type="text" name="title" required maxlength="60" value="Sunday Offering Count"></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Date</span><input type="date" name="date" value="${isoDay(new Date())}" required></label>
      <label class="field"><span>Bank deposit slip #</span><input type="text" name="depositRef" maxlength="30" placeholder="DEP-1024"></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field"><span>Counter 1 (Verifier)</span><input type="text" name="counter1" required maxlength="50" value="${S.me().name}"></label>
      <label class="field"><span>Counter 2 (Dual control)</span><input type="text" name="counter2" required maxlength="50" placeholder="Second counter name"></label>
    </div>
    <label class="field"><span>Notes</span><input type="text" name="notes" maxlength="140" placeholder="Locked in drop safe"></label>
    <label class="check"><input type="checkbox" name="closed" checked><span>Mark batch as verified &amp; closed for deposit</span></label>
    <button class="btn block">Save counting batch</button>
  </form>`);
};
Forms["treas-batch-save"] = (d, f) => {
  if (!d.title || !d.counter1) return formError(f, "Provide a batch title and counter name.");
  S.add("batches", {
    date: d.date || isoDay(new Date()),
    title: d.title.trim(),
    depositRef: String(d.depositRef || "").trim(),
    counter1: d.counter1.trim(),
    counter2: String(d.counter2 || "").trim(),
    notes: String(d.notes || "").trim(),
    status: d.closed ? "closed" : "open",
    at: new Date().toISOString(),
  });
  S.save(); closeSheet(true); toast("Offering batch saved"); render();
};

Actions["treas-batch-pdf"] = (el) => {
  const b = S.get("batches", el.dataset.id); if (!b) return;
  const c = S.church();
  const gifts = S.list("gifts").filter((g) => g.batchId === b.id || (!g.batchId && isoDay(g.at) === b.date && (g.method === "cash" || g.method === "check")));
  const cashSum = gifts.filter((g) => g.method === "cash").reduce((n, g) => n + g.amount, 0);
  const checkSum = gifts.filter((g) => g.method === "check").reduce((n, g) => n + g.amount, 0);
  const total = gifts.reduce((n, g) => n + g.amount, 0);
  const p = [
    { t: c.name, x: 54, y: 738, size: 18, bold: true },
    { t: `OFFERING DEPOSIT & COUNT SHEET — ${b.date}`, x: 54, y: 716, size: 12, bold: true },
    { t: `Batch: ${b.title}   |   Deposit Ref: ${b.depositRef || "N/A"}   |   Status: ${b.status.toUpperCase()}`, x: 54, y: 698, size: 9, gray: true },
    { line: [54, 688, 558, 688] },
    { t: `Cash Total: ${money(cashSum)}     Checks Total: ${money(checkSum)}     Combined Deposit: ${money(total)}`, x: 54, y: 668, size: 11, bold: true },
    { line: [54, 656, 558, 656] },
    { t: "Donor / Env #", x: 54, y: 638, size: 9, bold: true },
    { t: "Category", x: 210, y: 638, size: 9, bold: true },
    { t: "Fund", x: 320, y: 638, size: 9, bold: true },
    { t: "Method / Check #", x: 420, y: 638, size: 9, bold: true },
    { t: "Amount", x: 558 - textWidth("Amount", 9), y: 638, size: 9, bold: true },
    { line: [54, 632, 558, 632] },
  ];
  let y = 616;
  gifts.slice(0, 24).forEach((g) => {
    const amt = money(g.amount);
    p.push(
      { t: `${g.name || "Donor"}${g.envelopeNo ? ` (Env #${g.envelopeNo})` : ""}`.slice(0, 26), x: 54, y, size: 9 },
      { t: giftCatLabel(g.category || "tithe", c).slice(0, 18), x: 210, y, size: 9 },
      { t: fundName(g.fundId, c).slice(0, 18), x: 320, y, size: 9 },
      { t: `${payMethodFull(g.method)}${g.checkNo ? ` #${g.checkNo}` : ""}`.slice(0, 18), x: 420, y, size: 9 },
      { t: amt, x: 558 - textWidth(amt, 9), y, size: 9 }
    );
    y -= 18;
  });
  p.push(
    { line: [54, 130, 558, 130] },
    { t: `Counter 1 Signature: ${b.counter1 || "____________________"}          Date: ${b.date}`, x: 54, y: 108, size: 10 },
    { t: `Counter 2 Signature: ${b.counter2 || "____________________"}          Treasurer Review: ____________________`, x: 54, y: 84, size: 10 }
  );
  saveFile(`${slugify(c.name)}-deposit-batch-${b.date}.pdf`, makePdf([p]));
};

// Custom Gift Categories modal
Actions["treas-cats-edit"] = () => {
  const c = S.church(), cats = giftCategoriesOf(c);
  openSheet("Customize donation categories", html`<form data-form="treas-cats-save" novalidate>
    <p class="muted" style="margin-top:0">Offerings, tithes, missions, building gifts, or any custom categories your church treasurer tracks. One per line (Format: <code>key, Label</code>).</p>
    <label class="field"><span>Categories</span><textarea name="lines" rows="8" required>${cats.map(([k, l]) => `${k}, ${l}`).join("\n")}</textarea></label>
    <button class="btn block">Save categories</button>
  </form>`);
};
Forms["treas-cats-save"] = (d, f) => {
  const parsed = String(d.lines || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(",");
    if (i < 0) return [slugify(l), l];
    return [slugify(l.slice(0, i)) || "gift", l.slice(i + 1).trim()];
  }).filter(([, l]) => l);
  if (!parsed.length) return formError(f, "Keep at least one category.");
  S.updateChurch({ giftCategories: parsed });
  toast("Categories updated"); closeSheet(true); render();
};

// Configure Funds, Opening Balances, Restricted status & Annual Goals
Actions["treas-funds-edit"] = () => {
  const c = S.church(), funds = [...(c.funds || []), { id: "", code: "", name: "", description: "", restricted: false, openingBalance: 0, goalAmount: 0 }];
  openSheet("Configure funds, balances & goals", html`<form data-form="treas-funds-save" novalidate>
    <p class="muted" style="margin-top:0">Set fund codes, opening balances, restricted vs. unrestricted net asset status, and annual fund goals.</p>
    ${funds.map((f, i) => html`<div class="panel" style="padding:10px 12px;margin-bottom:8px">
      <input type="hidden" name="id${i}" value="${f.id}">
      <div style="display:grid;grid-template-columns:.7fr 1.3fr 1fr 1fr;gap:8px">
        <label class="field" style="margin:0"><span>Code</span><input type="text" name="code${i}" value="${f.code || ""}" placeholder="100-GEN"></label>
        <label class="field" style="margin:0"><span>Fund name</span><input type="text" name="name${i}" value="${f.name || ""}" placeholder="${f.id ? "" : "Add new fund"}"></label>
        <label class="field" style="margin:0"><span>Opening ($)</span><input type="number" step="0.01" name="open${i}" value="${f.openingBalance || 0}"></label>
        <label class="field" style="margin:0"><span>Annual goal ($)</span><input type="number" step="0.01" name="goal${i}" value="${f.goalAmount || 0}"></label>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px">
        <input type="text" name="desc${i}" value="${f.description || ""}" placeholder="Description" style="flex:1">
        <label class="check" style="margin:0"><input type="checkbox" name="rest${i}" ${attr(f.restricted, "checked")}><span>Restricted</span></label>
      </div>
    </div>`)}
    <button class="btn block">Save funds &amp; goals</button>
  </form>`, { wide: true });
};
Forms["treas-funds-save"] = (d, f) => {
  const c = S.church(), out = [];
  for (let i = 0; i <= (c.funds || []).length; i++) {
    const name = String(d[`name${i}`] || "").trim();
    if (!name) continue;
    out.push({
      id: d[`id${i}`] || slugify(name) || uid(),
      code: String(d[`code${i}`] || "").trim() || `${(i + 1) * 100}-FND`,
      name,
      description: String(d[`desc${i}`] || "").trim(),
      restricted: !!d[`rest${i}`],
      openingBalance: parseFloat(d[`open${i}`]) || 0,
      goalAmount: parseFloat(d[`goal${i}`]) || 0,
    });
  }
  if (!out.length) return formError(f, "Keep at least one active fund.");
  S.updateChurch({ funds: out });
  closeSheet(true); toast("Funds and goals saved"); render();
};

// ----- Tab 3: Expenses & Disbursement Ledger -----
function renderTreasurerExpenses(acct, year) {
  const c = S.church();
  const expenses = S.list("expenses").sort((a, b) => (b.date || b.at).localeCompare(a.date || a.at));
  const byDept = BUDGET_DEPARTMENTS.map(([k, l]) => [l, expenses.filter((e) => e.department === k && yearOf(e.date || e.at) === year).reduce((n, e) => n + (+e.amount || 0), 0)]).filter(([, n]) => n > 0);
  const expRows = expenses.map((e) => [
    e.date || isoDay(e.at),
    e.payee,
    e.description || "",
    deptLabel(e.department),
    fundName(e.fundId, c),
    `${payMethodFull(e.method)}${e.refNo ? ` (${e.refNo})` : ""}`,
    e.status === "pending-approval" ? "Pending Approval" : "Paid",
    Math.round((+e.amount || 0) * 100) / 100,
  ]);

  return html`
    <div class="btns" style="margin-top:14px">
      <button type="button" class="btn" data-act="treas-expense-new">${icon("plus")}Record expense / bill</button>
    </div>

    ${byDept.length ? html`<section class="sec"><h2 class="sec-head">YTD expenses by ministry department (${year})</h2>${hBarsT("Expenses by department", byDept, money)}</section>` : ""}

    <section class="sec">
      <h2 class="sec-head">Expense &amp; disbursement ledger</h2>
      <div class="rows" style="margin-bottom:14px">
        ${expenses.slice(0, 10).map((e) => html`<div class="row">
          <span class="lead-ic">${icon("card")}</span>
          <span class="body">
            <span class="t">${e.payee} — <b>${money(e.amount)}</b></span>
            <span class="s">${e.date || isoDay(e.at)} · ${deptLabel(e.department)} · Debited from <b>${fundName(e.fundId, c)}</b> (${payMethodFull(e.method)}${e.refNo ? ` #${e.refNo}` : ""})</span>
            ${e.description ? html`<span class="s faint">${e.description}</span>` : ""}
          </span>
          ${e.receiptImg ? html`<button type="button" class="btn ghost sm" data-act="treas-receipt-img" data-id="${e.id}">${icon("image")}Receipt</button>` : ""}
          ${e.status === "pending-approval" ? html`<button type="button" class="btn sm" data-act="treas-exp-approve" data-id="${e.id}">${icon("check")}Approve</button>` : html`<span class="tag ok">Paid</span>`}
          <button type="button" class="icon-btn" data-act="treas-exp-del" data-id="${e.id}" aria-label="Delete expense">${icon("trash")}</button>
        </div>`)}
      </div>
      <div class="panel">
        ${reportTable("treas-expenses", "church-expenses", ["Date", "Payee / Vendor", "Description", "Department", "Fund Debited", "Method / Ref #", "Status", "Amount"], expRows, { numeric: [7], limit: 35, empty: "No expenses recorded yet." })}
      </div>
    </section>
  `;
}

Actions["treas-expense-new"] = () => {
  const c = S.church();
  openSheet("Record church expense or reimbursement", html`<form data-form="treas-expense-save" novalidate>
    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:10px">
      <label class="field"><span>Payee / Vendor / Reimbursed member</span><input type="text" name="payee" required maxlength="80" placeholder="Alabama Power / Sweetwater / Member name"></label>
      <label class="field"><span>Date</span><input type="date" name="date" value="${isoDay(new Date())}" required></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <label class="field"><span>Amount ($)</span><input type="number" step="0.01" min="0.01" name="amount" required placeholder="245.00"></label>
      <label class="field"><span>Fund to debit</span><select name="fundId">${c.funds.map((f) => html`<option value="${f.id}">${f.name}</option>`)}</select></label>
      <label class="field"><span>Budget department</span><select name="department">${BUDGET_DEPARTMENTS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <label class="field"><span>Payment method</span><select name="method"><option value="check">Check</option><option value="ach">ACH / Bank Draft</option><option value="card">Church Card</option><option value="cash">Petty Cash</option></select></label>
      <label class="field"><span>Check # / Invoice #</span><input type="text" name="refNo" maxlength="30" placeholder="CHK-1088"></label>
      <label class="field"><span>Status</span><select name="status"><option value="paid">Paid</option><option value="pending-approval">Pending Approval</option></select></label>
    </div>
    <label class="field"><span>Description / Memo</span><input type="text" name="description" required maxlength="160" placeholder="Monthly utility bill / Youth camp supplies"></label>
    ${imageField("receiptImg", "Attach receipt photo (optional)", "", "Upload a photo or scan of the vendor receipt or invoice.", 1200)}
    <button class="btn block" style="margin-top:12px">Save expense</button>
  </form>`, { wide: true });
};

Forms["treas-expense-save"] = (d, f) => {
  const amount = Math.round((parseFloat(d.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return formError(f, "Enter a valid expense amount.");
  if (!String(d.payee || "").trim()) return formError(f, "Enter the payee or vendor.");
  S.add("expenses", {
    date: d.date || isoDay(new Date()),
    payee: d.payee.trim(),
    description: String(d.description || "").trim(),
    fundId: d.fundId,
    department: d.department || "admin",
    amount,
    method: d.method || "check",
    refNo: String(d.refNo || "").trim(),
    status: d.status || "paid",
    receiptImg: d.receiptImg || "",
    by: S.me().id,
    approvedBy: d.status === "paid" ? S.me().name : "",
    at: new Date().toISOString(),
  });
  logActivity(`Recorded ${money(amount)} expense to ${d.payee.trim()}`, "giving");
  S.save(); closeSheet(true); toast(`Expense of ${money(amount)} recorded`); render();
};
Actions["treas-exp-approve"] = (el) => {
  const e = S.get("expenses", el.dataset.id); if (!e) return;
  Object.assign(e, { status: "paid", approvedBy: S.me().name });
  S.save(); toast("Expense approved and marked paid"); render();
};
Actions["treas-exp-del"] = (el) => { S.remove("expenses", el.dataset.id); S.save(); toast("Expense removed"); render(); };
Actions["treas-receipt-img"] = (el) => {
  const e = S.get("expenses", el.dataset.id); if (!e?.receiptImg) return;
  openSheet(`Receipt: ${e.payee} (${money(e.amount)})`, html`<img src="${e.receiptImg}" alt="Expense receipt" style="width:100%;border-radius:12px"><div class="btns" style="margin-top:12px"><button class="btn block" data-act="close-sheet">Close</button></div>`, { wide: true });
};

// ----- Tab 4: Budgets & Goals (Budget vs. Actuals) -----
function renderTreasurerBudgets(acct, year) {
  const c = S.church();
  const budgets = S.list("budgets").filter((b) => b.year === year);
  const rows = BUDGET_DEPARTMENTS.map(([dept, label, defAnnual]) => {
    const rec = budgets.find((b) => b.department === dept);
    const annual = rec ? +rec.annualAmount : defAnnual;
    const monthly = Math.round(annual / 12);
    const spent = acct.expenses.filter((e) => e.department === dept).reduce((n, e) => n + (+e.amount || 0), 0);
    const remaining = annual - spent;
    const usedPct = annual > 0 ? Math.round((spent / annual) * 100) : 0;
    return { dept, label, annual, monthly, spent, remaining, usedPct };
  });
  const totBudget = rows.reduce((n, r) => n + r.annual, 0);
  const totSpent = rows.reduce((n, r) => n + r.spent, 0);

  return html`
    <div class="stat-tiles" style="margin-top:14px">
      ${statTile(`${year} Expense Budget`, money(totBudget), `${money(Math.round(totBudget / 12))}/month target`)}
      ${statTile("YTD Actual Spent", money(Math.round(totSpent)), `${pct(totSpent, totBudget)} of annual budget`)}
      ${statTile("Remaining Budget", money(Math.round(totBudget - totSpent)), totSpent <= totBudget ? "Under budget" : "Over budget")}
    </div>

    <section class="sec">
      <div class="sec-head"><h2>Departmental budget vs. actuals (${year})</h2><button type="button" class="btn ghost sm" data-act="treas-budgets-edit">${icon("edit")}Edit budgets</button></div>
      <div class="panel">
        <div class="table-wrap">
          <table class="mini-table">
            <thead>
              <tr><th>Department</th><th class="num">Annual Budget</th><th class="num">Monthly Avg</th><th class="num">YTD Actual</th><th class="num">Remaining</th><th>% Used</th></tr>
            </thead>
            <tbody>
              ${rows.map((r) => html`<tr>
                <td><b>${r.label}</b></td>
                <td class="num">${money(r.annual)}</td>
                <td class="num">${money(r.monthly)}</td>
                <td class="num">${money(r.spent)}</td>
                <td class="num" style="color:${r.remaining < 0 ? "var(--warn)" : "var(--ok)"}"><b>${money(r.remaining)}</b></td>
                <td style="min-width:130px">
                  <div style="display:flex;justify-content:space-between;font-size:.78rem"><span>${r.usedPct}%</span><span class="tag ${r.usedPct > 100 ? "warn" : r.usedPct > 85 ? "" : "ok"}" style="font-size:.68rem">${r.usedPct > 100 ? "Over" : "On track"}</span></div>
                  <span class="progress" style="display:block;margin-top:4px"><i style="width:${Math.min(100, r.usedPct)}%;background:${r.usedPct > 100 ? "var(--warn)" : "var(--brand)"}"></i></span>
                </td>
              </tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head"><h2>Fund &amp; pledge campaign goals</h2><a class="btn ghost sm" href="#admin-campaigns">Manage pledge campaigns</a></div>
      <div class="rows">
        ${acct.funds.map((f) => html`<div class="row">
          <span class="body">
            <span class="t">${f.name} (${f.code || "FUND"}) — Goal: <b>${money(f.goal || 0)}</b></span>
            <span class="s">Received in ${year}: <b>${money(f.inflows)}</b> (${f.goalPct}% of annual goal) · Available balance: ${money(f.balance)}</span>
            <span class="progress" style="display:block;margin-top:6px"><i style="width:${f.goalPct}%"></i></span>
          </span>
        </div>`)}
      </div>
    </section>
  `;
}

Actions["treas-budgets-edit"] = () => {
  const year = yearOf(), budgets = S.list("budgets").filter((b) => b.year === year);
  openSheet(`Edit ${year} ministry budgets`, html`<form data-form="treas-budgets-save" novalidate>
    ${BUDGET_DEPARTMENTS.map(([dept, label, defAnnual]) => {
      const rec = budgets.find((b) => b.department === dept);
      return html`<label class="field"><span>${label} — Annual budget ($)</span><input type="number" step="100" min="0" name="b_${dept}" value="${rec ? rec.annualAmount : defAnnual}" required></label>`;
    })}
    <button class="btn block">Save ${year} budgets</button>
  </form>`);
};
Forms["treas-budgets-save"] = (d) => {
  const year = yearOf(), cid = S.state.current;
  BUDGET_DEPARTMENTS.forEach(([dept, label]) => {
    const amt = Math.max(0, parseFloat(d[`b_${dept}`]) || 0);
    const existing = S.list("budgets").find((b) => b.year === year && b.department === dept);
    if (existing) existing.annualAmount = amt;
    else S.add("budgets", { year, department: dept, label, annualAmount: amt, fundId: dept === "missions" ? "missions" : "general" });
  });
  S.save(); closeSheet(true); toast(`${year} budgets saved`); render();
};

// ----- Tab 5: Weekly Treasurer Reports & Compliant End-of-Year 501(c)(3) Tax Statements -----
function computeWeeklyTreasurerSummary(weekStartIso) {
  const c = S.church();
  const startMs = fromIsoDay(weekStartIso).getTime();
  const endIso = isoDay(new Date(startMs + 6 * DAY));
  const gifts = S.list("gifts").filter((g) => { const d = isoDay(g.at); return d >= weekStartIso && d <= endIso && g.status !== "refunded"; });
  const expenses = S.list("expenses").filter((e) => { const d = e.date || isoDay(e.at); return d >= weekStartIso && d <= endIso && e.status !== "void"; });
  const inTotal = gifts.reduce((n, g) => n + (+g.amount || 0), 0);
  const outTotal = expenses.reduce((n, e) => n + (+e.amount || 0), 0);
  return { weekStartIso, endIso, gifts, expenses, inTotal, outTotal, net: inTotal - outTotal, c };
}

function renderTreasurerReports(acct, year) {
  const c = S.church();
  const wk = computeWeeklyTreasurerSummary(reportWeekStart);
  const giversMap = new Map();
  giftsIn(S.list("gifts"), year).filter((g) => g.taxDeductible !== false).forEach((g) => {
    const k = g.by || g.name;
    if (!giversMap.has(k)) giversMap.set(k, { id: k, name: S.user(g.by)?.name || g.name || "Donor", gifts: [], total: 0 });
    const entry = giversMap.get(k);
    entry.gifts.push(g);
    entry.total += +g.amount || 0;
  });
  const giversList = [...giversMap.values()].sort((a, b) => b.total - a.total);

  return html`
    <section class="sec">
      <div class="sec-head">
        <h2>Weekly treasurer report</h2>
        <div class="btns" style="margin:0">
          <button type="button" class="btn sm" data-act="treas-weekly-pdf">${icon("download")}Download Weekly Report (PDF)</button>
          <button type="button" class="btn ghost sm" data-act="treas-weekly-csv">${icon("download")}Weekly CSV</button>
        </div>
      </div>
      <div class="panel">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
          <label class="field" style="margin:0;max-width:240px"><span>Week starting (Sunday)</span><input type="date" value="${reportWeekStart}" data-change="treas-week-pick"></label>
          <div><span class="faint">Reporting window:</span> <b>${fmtShort(fromIsoDay(wk.weekStartIso))} – ${fmtShort(fromIsoDay(wk.endIso))}</b></div>
        </div>
        <div class="stat-tiles">
          ${statTile("Weekly Offerings & Gifts", money(wk.inTotal), `${plural(wk.gifts.length, "donation")}`)}
          ${statTile("Weekly Expenses Paid", money(wk.outTotal), `${plural(wk.expenses.length, "disbursement")}`)}
          ${statTile("Net Weekly Cash Flow", (wk.net >= 0 ? "+" : "−") + money(Math.abs(wk.net)), wk.net >= 0 ? "Net surplus" : "Net outflow")}
        </div>
      </div>
    </section>

    <section class="sec">
      <div class="sec-head">
        <h2>IRS-compliant end-of-year tax statements (${year})</h2>
        <div class="btns" style="margin:0">
          <button type="button" class="btn sm" data-act="statements-all" data-year="${year}">${icon("download")}All ${year} Tax Statements (PDF)</button>
          <button type="button" class="btn ghost sm" data-act="statements-csv">${icon("download")}Full Accounting Export (CSV)</button>
        </div>
      </div>
      <div class="panel">
        <p style="margin-top:0">Generates IRS Publication 1771-compliant 501(c)(3) contribution statements for <b>${c.name}</b>${c.taxId ? ` (EIN ${c.taxId})` : " (Add your EIN under Admin → Giving)"}, itemizing Date, Category (Tithe / Offering / Gift), Fund, Payment Method &amp; Check/Envelope #, and Tax-Deductible Total.</p>
        <div class="rows" style="margin-top:10px">
          ${giversList.length ? giversList.map((g) => html`<div class="row">
            <span class="lead-ic">${icon("user")}</span>
            <span class="body">
              <span class="t">${g.name}</span>
              <span class="s">${plural(g.gifts.length, "deductible contribution")} in ${year} · Total: <b>${money(g.total)}</b></span>
            </span>
            <button type="button" class="btn ghost sm" data-act="treas-donor-pdf" data-giver="${g.id}" data-year="${year}">${icon("download")}Tax Statement PDF</button>
          </div>`) : empty(`No tax-deductible donations recorded in ${year} yet.`)}
        </div>
      </div>
    </section>
  `;
}

Inputs["treas-week-pick"] = (el) => { if (el.value) { reportWeekStart = weekOf(el.value); render(); } };

Actions["treas-weekly-pdf"] = () => {
  const wk = computeWeeklyTreasurerSummary(reportWeekStart), c = wk.c;
  const p = [
    { t: c.name, x: 54, y: 742, size: 18, bold: true },
    { t: `WEEKLY TREASURER & ACCOUNTING REPORT (${wk.weekStartIso} to ${wk.endIso})`, x: 54, y: 720, size: 12, bold: true },
    { t: `Generated ${fmtShort(new Date())} by ${S.me().name}   |   EIN: ${c.taxId || "On file"}`, x: 54, y: 704, size: 9, gray: true },
    { line: [54, 694, 558, 694] },
    { t: `Total Donations In: ${money(wk.inTotal)}     Total Expenses Out: ${money(wk.outTotal)}     Net Weekly Change: ${(wk.net >= 0 ? "+" : "-") + money(Math.abs(wk.net))}`, x: 54, y: 674, size: 11, bold: true },
    { line: [54, 662, 558, 662] },
    { t: "1. INFLOWS BY FUND & CATEGORY", x: 54, y: 642, size: 10, bold: true },
  ];
  let y = 622;
  c.funds.forEach((f) => {
    const fSum = wk.gifts.filter((g) => g.fundId === f.id).reduce((n, g) => n + g.amount, 0);
    p.push({ t: `${f.code || ""} ${f.name} (${f.restricted ? "Restricted" : "Unrestricted"})`, x: 64, y, size: 10 }, { t: money(fSum), x: 558 - textWidth(money(fSum), 10), y, size: 10 });
    y -= 16;
  });
  y -= 8;
  p.push({ t: "2. INFLOWS BY PAYMENT METHOD (DEPOSIT RECONCILIATION)", x: 54, y, size: 10, bold: true });
  y -= 18;
  TREASURER_METHODS.forEach(([k, l]) => {
    const mSum = wk.gifts.filter((g) => g.method === k).reduce((n, g) => n + g.amount, 0);
    if (mSum > 0) {
      p.push({ t: l, x: 64, y, size: 10 }, { t: money(mSum), x: 558 - textWidth(money(mSum), 10), y, size: 10 });
      y -= 16;
    }
  });
  y -= 8;
  p.push({ t: "3. WEEKLY EXPENSES & DISBURSEMENTS", x: 54, y, size: 10, bold: true });
  y -= 18;
  if (!wk.expenses.length) {
    p.push({ t: "No expenses disbursed during this week.", x: 64, y, size: 9, gray: true });
    y -= 18;
  } else {
    wk.expenses.slice(0, 14).forEach((e) => {
      const amt = money(e.amount);
      p.push(
        { t: `${e.date}  ${e.payee} — ${deptLabel(e.department)} (${fundName(e.fundId, c)})`.slice(0, 68), x: 64, y, size: 9 },
        { t: amt, x: 558 - textWidth(amt, 9), y, size: 9 }
      );
      y -= 16;
    });
  }
  p.push(
    { line: [54, 118, 558, 118] },
    { t: `Treasurer Signature: ___________________________     Date: _______________`, x: 54, y: 94, size: 10 },
    { t: `Finance Committee / Pastor Review: ___________________________`, x: 54, y: 72, size: 10 }
  );
  saveFile(`${slugify(c.name)}-weekly-treasurer-report-${wk.weekStartIso}.pdf`, makePdf([p]));
};

Actions["treas-weekly-csv"] = () => {
  const wk = computeWeeklyTreasurerSummary(reportWeekStart), c = wk.c;
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Type", "Date", "Name / Payee", "Category / Dept", "Fund", "Method", "Ref / Check / Env #", "Amount"].map(q).join(","),
    ...wk.gifts.map((g) => ["INFLOW", isoDay(g.at), g.name || S.userName(g.by), giftCatLabel(g.category || "tithe", c), fundName(g.fundId, c), payMethodFull(g.method), [g.checkNo && `Chk#${g.checkNo}`, g.envelopeNo && `Env#${g.envelopeNo}`].filter(Boolean).join(" "), g.amount].map(q).join(",")),
    ...wk.expenses.map((e) => ["EXPENSE", e.date || isoDay(e.at), e.payee, deptLabel(e.department), fundName(e.fundId, c), payMethodFull(e.method), e.refNo || "", -e.amount].map(q).join(",")),
  ];
  saveFile(`${slugify(c.name)}-weekly-ledger-${wk.weekStartIso}.csv`, lines.join("\n") + "\n");
};

// Upgrade statementPages() in 69-statements.js so all donor PDF statements include Category (Tithe/Offering/Gift), Check/Env #, and IRS 501(c)(3) compliance block!
{
  statementPages = function (c, giver, year, gifts) {
    const deductible = gifts.filter((g) => g.taxDeductible !== false);
    const pages = [], total = deductible.reduce((n, g) => n + g.amount, 0), perPage = 26;
    const head = (first) => {
      const p = [{ t: c.name, x: 54, y: 742, size: 18, bold: true }];
      const contact = [c.address, c.city, c.email, c.phone, c.taxId ? `EIN: ${c.taxId}` : ""].filter(Boolean).join("   ");
      if (contact) p.push({ t: contact, x: 54, y: 724, size: 9, gray: true });
      p.push({ line: [54, 712, 558, 712] });
      if (first) {
        p.push({ t: `Official ${year} Charitable Contribution Tax Statement`, x: 54, y: 686, size: 13, bold: true });
        p.push({ t: `Donor: ${giver.name}`, x: 54, y: 666, size: 11, bold: true });
        if (giver.address) p.push({ t: giver.address, x: 54, y: 652, size: 10, gray: true });
        const totStr = `Tax-Deductible Total: ${money(total)}`;
        p.push({ t: totStr, x: 558 - textWidth(totStr, 11), y: 666, size: 11, bold: true });
      }
      return p;
    };
    for (let i = 0; i === 0 || i < deductible.length; i += perPage) {
      const p = head(i === 0); let y = i === 0 ? 622 : 684;
      p.push(
        { t: "Date", x: 54, y, size: 9, bold: true },
        { t: "Category", x: 135, y, size: 9, bold: true },
        { t: "Fund", x: 245, y, size: 9, bold: true },
        { t: "Method / Check / Env #", x: 370, y, size: 9, bold: true },
        { t: "Amount", x: 558 - textWidth("Amount", 9), y, size: 9, bold: true }
      );
      p.push({ line: [54, y - 6, 558, y - 6] }); y -= 20;
      deductible.slice(i, i + perPage).forEach((g) => {
        const amt = money(g.amount);
        const ref = [payMethodFull(g.method), g.checkNo ? `#${g.checkNo}` : "", g.envelopeNo ? `Env #${g.envelopeNo}` : ""].filter(Boolean).join(" ");
        p.push(
          { t: fmt(g.at, { month: "short", day: "numeric", year: "numeric" }), x: 54, y, size: 9 },
          { t: giftCatLabel(g.category || "tithe", c).slice(0, 18), x: 135, y, size: 9 },
          { t: fundName(g.fundId, c).slice(0, 20), x: 245, y, size: 9 },
          { t: ref.slice(0, 24), x: 370, y, size: 9 },
          { t: amt, x: 558 - textWidth(amt, 9), y, size: 9 }
        );
        y -= 17;
      });
      if (i + perPage >= deductible.length) {
        p.push({ line: [54, y + 6, 558, y + 6] });
        p.push({ t: "Total Tax-Deductible Contributions", x: 54, y: y - 10, size: 11, bold: true }, { t: money(total), x: 558 - textWidth(money(total), 11), y: y - 10, size: 11, bold: true });
        const footY = Math.min(y - 42, 130);
        const notes = [
          `IRS Publication 1771 Compliance Notice: No goods or services were provided in exchange for these contributions`,
          `other than intangible religious benefits.${c.taxId ? ` ${c.name} is a qualified 501(c)(3) organization (EIN ${c.taxId}).` : ""}`,
          `Authorized Treasurer Signature: ___________________________     Date Issued: ${isoDay(new Date())}`,
        ];
        notes.forEach((t, k) => p.push({ t, x: 54, y: footY - k * 15, size: 8.5, gray: true }));
      }
      pages.push(p);
    }
    return pages;
  };
}

Actions["treas-donor-pdf"] = (el) => {
  const c = S.church(), year = +el.dataset.year || yearOf(), k = el.dataset.giver;
  const list = giftsIn(S.list("gifts"), year).filter((g) => (g.by || g.name) === k);
  if (!list.length) { toast("No gifts found for this donor."); return; }
  const name = S.user(k)?.name || list[0].name || "Donor";
  saveFile(`${slugify(c.name)}-tax-statement-${year}-${slugify(name)}.pdf`, makePdf(statementPages(c, { name }, year, list)));
};

// Hook Treasurer widget into Dashboard (#dashboard) & Admin Giving screen
{
  if (typeof DASH !== "undefined") {
    DASH.treasurer = ["Treasurer & fund balances", () => canTreasurer(), () => {
      const acct = computeFundAccounting(yearOf());
      return html`
        <div class="stat-tiles" style="margin-bottom:10px">
          ${statTile("YTD Inflows", money(Math.round(acct.totalIn)), "Tithes, offerings & gifts")}
          ${statTile("YTD Expenses", money(Math.round(acct.totalOut)), "Disbursements")}
          ${statTile("Net Fund Balance", money(Math.round(acct.totalNet)), plural(acct.funds.length, "active fund"))}
        </div>
        <div class="btns" style="margin-top:8px">
          <a class="btn sm" href="#treasurer">${icon("give")}Open Treasurer Platform</a>
          <a class="btn ghost sm" href="#treasurer-reports">${icon("download")}Weekly &amp; Tax Reports</a>
        </div>`;
    }];
  }
}
