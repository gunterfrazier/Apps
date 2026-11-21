// ---------- Security Command incident reporting ----------
const INCIDENT_PERIODS = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" };
let incidentDashboard = { church: null, period: "week", date: "", filter: null };

function incidentTimestamp(at) {
  return Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString() : "Not recorded";
}

function incidentElapsed(start, end) {
  const elapsed = Date.parse(end) - Date.parse(start);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function incidentDuration(ms) {
  if (ms === null) return "Not recorded";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "< 1 min";
  const hours = Math.floor(minutes / 60);
  return [hours ? `${hours} h` : "", minutes % 60 ? `${minutes % 60} min` : ""].filter(Boolean).join(" ");
}

function incidentPeriodBounds(period, date) {
  const start = fromIsoDay(date);
  if (period === "week") start.setDate(start.getDate() - start.getDay());
  if (period === "month" || period === "year") start.setDate(1);
  if (period === "year") start.setMonth(0);
  const end = new Date(start);
  if (period === "year") end.setFullYear(end.getFullYear() + 1);
  else if (period === "month") end.setMonth(end.getMonth() + 1);
  else end.setDate(end.getDate() + (period === "week" ? 7 : 1));
  return { start, end };
}

function incidentGroupChart(title, dimension, buckets, filter) {
  if (!buckets.size) return "";
  const max = Math.max(...buckets.values());
  return html`<div class="panel sec-report-chart">
    <h3>${title}</h3>
    <ul>${[...buckets].map(([key, count]) => html`<li>
      <button type="button" data-act="sec-dashboard-filter" data-kind="${dimension}" data-key="${key}"
        aria-pressed="${String(filter?.kind === dimension && filter.key === key)}">
        <span>${key}</span><meter min="0" max="${max}" value="${count}" aria-hidden="true"></meter><span>${count}</span>
      </button>
    </li>`)}</ul>
  </div>`;
}

function renderIncidentDashboard() {
  if (incidentDashboard.church !== S.state.current) {
    incidentDashboard = { church: S.state.current, period: "week", date: isoDay(new Date()), filter: null };
  }
  const { period, date, filter } = incidentDashboard;
  const { start, end } = incidentPeriodBounds(period, date);
  const startDay = isoDay(start), endDay = isoDay(end);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  const rows = securityIncidentRows().filter(({ inc }) => {
    if (inc.kind === "DRILL_INJECT" || !Number.isFinite(Date.parse(inc.at))) return false;
    const day = isoDay(inc.at);
    return day >= startDay && day < endDay;
  }).sort((a, b) => Date.parse(b.inc.at) - Date.parse(a.inc.at));
  const timeLabel = (row) => {
    const reported = new Date(row.inc.at);
    if (period === "year") return fmt(reported, { month: "long" });
    if (period === "day") {
      reported.setMinutes(0, 0, 0);
      return fmt(reported, { hour: "numeric" });
    }
    return fmt(reported, { month: "short", day: "numeric" });
  };
  const category = (row) => row.inc.category || "Uncategorized";
  const grouped = (list, label) => {
    const buckets = new Map();
    for (const row of list) {
      const key = label(row);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return buckets;
  };
  const byTime = grouped([...rows].reverse(), timeLabel);
  const byCategory = new Map([...grouped(rows, category)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const selected = filter ? rows.filter((row) => (filter.kind === "time" ? timeLabel(row) : category(row)) === filter.key) : rows;
  const average = (key) => {
    const times = rows.map((row) => incidentElapsed(row.inc.at, row[key])).filter((value) => value !== null);
    return times.length ? incidentDuration(times.reduce((sum, value) => sum + value, 0) / times.length) : "—";
  };
  const cleared = rows.filter((row) => row.cleared).length;
  return html`<section class="sec">
    <h2>Incident dashboard</h2>
    ${incidentSections("security-incidents-dashboard")}
    <form class="sec-dashboard-period" data-form="sec-dashboard-period">
      <label class="field"><span>Period</span><select name="period" data-change="sec-dashboard-period">
        ${Object.entries(INCIDENT_PERIODS).map(([key, label]) => html`<option value="${key}" ${attr(key === period, "selected")}>${label}</option>`)}
      </select></label>
      <label class="field"><span>Date in period</span><input type="date" name="date" value="${date}" required data-change="sec-dashboard-period"></label>
      <div class="btns"><button type="button" class="btn ghost sm" data-act="sec-dashboard-shift" data-dir="-1">Previous</button>
        <button type="button" class="btn ghost sm" data-act="sec-dashboard-shift" data-dir="1">Next</button></div>
    </form>
    <p class="faint">Reported ${longDay(startDay)}${isoDay(last) !== startDay ? ` – ${longDay(isoDay(last))}` : ""} · Local time</p>
    <div class="stat-tiles">
      ${statTile("Incidents", rows.length.toLocaleString(), `${cleared} cleared`)}
      ${statTile("Average first arrival", average("firstArrivalAt"), "Where arrival was logged")}
      ${statTile("Average incident duration", average("clearedAt"), "Where clear time was logged")}
    </div>
    <div class="sec-dashboard-charts">
      ${incidentGroupChart(period === "day" ? "Reported by hour" : period === "year" ? "Reported by month" : "Reported by date", "time", byTime, filter)}
      ${incidentGroupChart("Reported by category", "category", byCategory, filter)}
    </div>
    <div class="sec-head">
      <h3 id="sec-dashboard-results" tabindex="-1">${filter ? `Incidents for ${filter.key}` : "Incidents in this period"} (${selected.length})</h3>
      ${filter ? html`<button type="button" class="btn ghost sm" data-act="sec-dashboard-filter">Clear filter</button>` : ""}
    </div>
    <div class="rows">
      ${selected.length ? selected.map(({ inc, priority, cleared, clearedAt }) => html`<a class="row" href="#security-incidents-${inc.id}">
        <span class="body"><span class="t">${category({ inc })}</span><span class="s">${incidentTimestamp(inc.at)} · ${inc.room || (inc.locationId ? locName(inc.locationId) : "On campus")}${clearedAt ? ` · ${incidentDuration(incidentElapsed(inc.at, clearedAt))}` : ""}</span></span>
        <span class="tag ${cleared ? "ok" : ""}">${cleared ? "Cleared" : INCIDENT_PRIORITY[priority] + " priority"}</span>
      </a>`) : empty("No incidents match this period and filter.")}
    </div>
  </section>`;
}

Inputs["sec-dashboard-period"] = (el) => el.form.requestSubmit();
Forms["sec-dashboard-period"] = (d, f) => {
  if (!Object.hasOwn(INCIDENT_PERIODS, d.period) || !Number.isFinite(Date.parse(d.date))) return;
  const focus = f.contains(document.activeElement) ? document.activeElement.name : "";
  Object.assign(incidentDashboard, { period: d.period, date: d.date, filter: null });
  render();
  if (focus === "period" || focus === "date") $(`.sec-dashboard-period [name="${focus}"]`)?.focus({ preventScroll: true });
};

Actions["sec-dashboard-shift"] = (el) => {
  const { period, date } = incidentDashboard, { start, end } = incidentPeriodBounds(period, date);
  if (el.dataset.dir === "-1") start.setDate(start.getDate() - 1);
  incidentDashboard.date = isoDay(el.dataset.dir === "-1" ? start : end);
  incidentDashboard.filter = null;
  render();
  $(`[data-act="sec-dashboard-shift"][data-dir="${el.dataset.dir}"]`)?.focus({ preventScroll: true });
};

Actions["sec-dashboard-filter"] = (el) => {
  incidentDashboard.filter = el.dataset.kind ? { kind: el.dataset.kind, key: el.dataset.key } : null;
  render();
  $("#sec-dashboard-results")?.focus();
};
