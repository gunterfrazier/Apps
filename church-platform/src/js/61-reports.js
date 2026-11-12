// ---------- Reports: attendance, newcomers and giving ----------
// One range control scopes every number and chart on the page. Charts are plain HTML so text stays readable on a
// phone; each has a hover and focus readout, a table view and a CSV download.

const REPORT_RANGES = { "8w": ["8 weeks", 8, "week"], "12w": ["12 weeks", 12, "week"], "6m": ["6 months", 6, "month"], "12m": ["12 months", 12, "month"] };
let reportRange = "12w";
const canReports = () => S.isMember() && S.canAny(["view.reports", "view.giving"]);

/** Bucket keys for the range, oldest first: the Sunday that starts each week, or the first of each month. */
function reportBuckets(rangeKey = reportRange) {
  const [, n, unit] = REPORT_RANGES[rangeKey], out = [], d = new Date(); d.setHours(12, 0, 0, 0);
  if (unit === "week") { d.setDate(d.getDate() - d.getDay()); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setDate(d.getDate() - 7 * i); out.push(isoDay(x)); } }
  else { d.setDate(1); for (let i = n - 1; i >= 0; i--) { const x = new Date(d); x.setMonth(d.getMonth() - i); out.push(isoDay(x)); } }
  return { unit, keys: out, start: out[0] };
}
const weekOf = (day) => { const d = fromIsoDay(day); d.setDate(d.getDate() - d.getDay()); return isoDay(d); };
const bucketOf = (day, unit) => unit === "week" ? weekOf(day) : `${day.slice(0, 7)}-01`;
const bucketLabel = (key, unit) => unit === "week" ? fmt(fromIsoDay(key), { month: "short", day: "numeric" }) : fmt(fromIsoDay(key), { month: "short" });

/** Attendance for each service in view: recorded head counts, with kids from check-ins when nobody counted them. */
function serviceAttendance() {
  const campus = S.campus(), vis = new Set(S.visibleLocations().map((l) => l.id));
  const inView = (loc) => !loc || (vis.has(loc) && (campus === "all" || campus === loc));
  const rows = new Map();
  S.list("attendance").filter((a) => inView(a.locationId)).forEach((a) => rows.set(a.serviceKey, { ...a }));
  S.list("checkins").filter((x) => inView(x.locationId)).forEach((x) => {
    const r = rows.get(x.serviceKey) || { serviceKey: x.serviceKey, date: x.serviceKey.slice(0, 10), locationId: x.locationId, adults: 0, kids: null, online: 0, fromCheckins: 0 };
    r.fromCheckins = (r.fromCheckins || 0) + 1; rows.set(x.serviceKey, r);
  });
  return [...rows.values()].map((r) => ({ ...r, kids: r.kids ?? r.fromCheckins ?? 0 })).filter((r) => r.date <= isoDay(new Date()));
}

Screens.reports = () => {
  if (!canReports()) return { redirect: hasAdminTools() ? "admin" : "me" };
  const { unit, keys, start } = reportBuckets(), seeAtt = S.can("view.reports"), seeGive = S.can("view.giving");
  const range = REPORT_RANGES[reportRange][0];
  let body = html``;

  // ----- Attendance -----
  if (seeAtt) {
    const svc = serviceAttendance().filter((r) => r.date >= start);
    const sum = (k, list) => list.reduce((n, r) => n + (+r[k] || 0), 0);
    const byBucket = keys.map((k) => {
      const list = svc.filter((r) => bucketOf(r.date, unit) === k);
      const weeks = Math.max(1, new Set(list.map((r) => weekOf(r.date))).size);
      const per = (f) => Math.round(sum(f, list) / (unit === "week" ? 1 : weeks));
      return { key: k, adults: per("adults"), kids: per("kids"), online: per("online"), any: list.length > 0 };
    });
    const weeks = [...new Set(svc.map((r) => weekOf(r.date)))].sort();
    const weekTotal = (w) => { const l = svc.filter((r) => weekOf(r.date) === w); return sum("adults", l) + sum("kids", l) + sum("online", l); };
    const avg = weeks.length ? Math.round(weeks.reduce((n, w) => n + weekTotal(w), 0) / weeks.length) : 0;
    const last = weeks[weeks.length - 1], prev = weeks[weeks.length - 2];
    const lastT = last ? weekTotal(last) : 0, delta = prev ? lastT - weekTotal(prev) : null;
    const kidsAvg = weeks.length ? Math.round(sum("kids", svc) / weeks.length) : 0;
    const guests = S.list("followups").filter((f) => f.at.slice(0, 10) >= start);
    body = html`${body}
      <section class="sec"><div class="sec-head"><h2>Attendance</h2><button class="btn ghost sm" data-act="att-record">${icon("plus")}Record attendance</button></div>
        <div class="stat-tiles">
          ${statTile("Average week", avg.toLocaleString(), `Last ${range}`)}
          ${statTile("Last Sunday", lastT.toLocaleString(), last ? fmt(fromIsoDay(last), { month: "short", day: "numeric" }) : "No data", delta)}
          ${statTile("Kids per week", kidsAvg.toLocaleString(), "Checked in or counted")}
          ${statTile("First-time guests", guests.length.toLocaleString(), `Last ${range}`)}</div>
        ${stackedColumns("att", {
          title: unit === "week" ? "People each week" : "Average people per week, by month",
          labels: keys.map((k) => bucketLabel(k, unit)),
          series: [["In the room", byBucket.map((b) => b.adults)], ["Kids", byBucket.map((b) => b.kids)], ["Online", byBucket.map((b) => b.online)]],
          csv: `attendance-${isoDay(new Date())}.csv`,
        })}
        ${!svc.length ? html`<p class="faint">No attendance yet in this range. Record head counts after each service; kids check-ins are counted for you.</p>` : ""}</section>`;

    // ----- Newcomers -----
    const by = (k) => guests.filter((f) => f.status === k).length;
    const src = Object.entries(FOLLOW_SOURCE).map(([k, l]) => [l, guests.filter((f) => f.source === k).length]).filter(([, n]) => n);
    body = html`${body}
      <section class="sec"><div class="sec-head"><h2>New people</h2>${S.can("manage.followup") ? html`<a href="#followup">Follow-up</a>` : ""}</div>
        <div class="panel">${guests.length ? html`
          <p style="margin-top:0"><b>${plural(guests.length, "new person", "new people")}</b> in the last ${range}. ${by("connected")} connected, ${by("contacted")} contacted, ${by("new")} not reached yet.</p>
          ${segBar([["Connected", by("connected")], ["Contacted", by("contacted")], ["Not reached yet", by("new")], ["Closed", by("closed")]])}
          <table class="mini-table" style="margin-top:12px"><thead><tr><th>How they came</th><th class="num">People</th></tr></thead><tbody>${src.map(([l, n]) => html`<tr><td>${l}</td><td class="num">${n}</td></tr>`)}</tbody></table>`
          : html`<p style="margin:0" class="muted">No new people in the last ${range}.</p>`}</div></section>`;
  }

  // ----- Giving -----
  if (seeGive) {
    const gifts = S.list("gifts").filter((g) => g.at.slice(0, 10) >= start);
    const total = gifts.reduce((n, g) => n + g.amount, 0), givers = new Set(gifts.map((g) => g.by || g.name)).size;
    const recurring = new Set(gifts.filter((g) => g.frequency !== "once").map((g) => g.by || g.name)).size;
    const per = keys.map((k) => gifts.filter((g) => bucketOf(g.at.slice(0, 10), unit) === k).reduce((n, g) => n + g.amount, 0));
    const funds = S.church().funds.map((f) => [f.name, gifts.filter((g) => g.fundId === f.id).reduce((n, g) => n + g.amount, 0)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
    body = html`${body}
      <section class="sec"><div class="sec-head"><h2>Giving</h2>${S.can("view.giving") ? html`<a href="#admin-giving">All gifts</a>` : ""}</div>
        <div class="stat-tiles">
          ${statTile("Given", money(Math.round(total)), `Last ${range}`)}
          ${statTile("Givers", givers.toLocaleString(), `${recurring} give regularly`)}
          ${statTile("Average gift", money(gifts.length ? Math.round(total / gifts.length) : 0), plural(gifts.length, "gift"))}</div>
        ${stackedColumns("give", { title: unit === "week" ? "Given each week" : "Given each month", labels: keys.map((k) => bucketLabel(k, unit)), series: [["Given", per]], money: true, csv: `giving-${isoDay(new Date())}.csv` })}
        ${funds.length ? html`<h3 class="sec-head" style="margin-top:18px">By fund</h3>${hBars(funds, money)}` : ""}</section>`;
  }

  return {
    title: "Reports", back: hasAdminTools() ? "admin" : "ministry",
    body: html`<div class="report-filters"><label><span class="sr">Range</span><select data-change="report-range">${Object.entries(REPORT_RANGES).map(([k, [l]]) => html`<option value="${k}" ${attr(k === reportRange, "selected")}>Last ${l}</option>`)}</select></label>${campusChip()}</div>
      ${body}`,
  };
};
Inputs["report-range"] = (el) => { reportRange = el.value; render(); };

// ----- Recording head counts -----
function recentServiceTimes(days = 21) {
  const out = [], now = new Date();
  S.visibleLocations().forEach((l) => (l.services || []).forEach((s) => {
    for (let back = 0; back <= days; back++) {
      const d = new Date(now); d.setDate(d.getDate() - back); if (d.getDay() !== s.day) continue;
      const [h, m] = s.time.split(":").map(Number); d.setHours(h, m, 0, 0); if (d > now) continue;
      out.push({ ...s, start: d, location: l });
    }
  }));
  return out.sort((a, b) => b.start - a.start).slice(0, 8);
}
Actions["att-record"] = () => {
  const list = recentServiceTimes();
  if (!list.length) { toast("No services in the last three weeks"); return; }
  const first = list[0], rec = S.list("attendance").find((a) => a.serviceKey === serviceKey(first));
  const kidsIn = (k) => S.list("checkins").filter((x) => x.serviceKey === k).length;
  openSheet("Record attendance", html`<form data-form="att-save" novalidate>
    <label class="field"><span>Service</span><select name="service" data-change="att-service">${list.map((s) => { const k = serviceKey(s); return html`<option value="${k}" data-kids="${kidsIn(k)}">${serviceName(s)}</option>`; })}</select></label>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      <label class="field"><span>In the room</span><input type="number" name="adults" min="0" max="99999" inputmode="numeric" value="${rec?.adults ?? ""}"></label>
      <label class="field"><span>Kids</span><input type="number" name="kids" min="0" max="9999" inputmode="numeric" value="${rec?.kids ?? kidsIn(serviceKey(first))}"></label>
      <label class="field"><span>Online</span><input type="number" name="online" min="0" max="99999" inputmode="numeric" value="${rec?.online ?? ""}"></label></div>
    <p class="faint" style="margin-top:0">Count adults and students in the room. Kids starts with the number checked in.</p>
    <button class="btn block">Save</button></form>`);
};
Inputs["att-service"] = (el) => {
  const f = el.form, rec = S.list("attendance").find((a) => a.serviceKey === el.value);
  f.adults.value = rec?.adults ?? ""; f.online.value = rec?.online ?? ""; f.kids.value = rec?.kids ?? el.selectedOptions[0].dataset.kids;
};
Forms["att-save"] = (d, f) => {
  if (d.adults === "" && d.online === "") return formError(f, "Enter how many were in the room or online.");
  const [date, rest] = d.service.split("T"), [time, locationId] = rest.split("@");
  const rec = { serviceKey: d.service, date, time, locationId: locationId || null, adults: +d.adults || 0, kids: +d.kids || 0, online: +d.online || 0, by: S.me().id };
  const old = S.list("attendance").find((a) => a.serviceKey === d.service);
  if (old) Object.assign(old, rec); else S.add("attendance", rec);
  S.save(); emit("attendance.recorded", rec); closeSheet(); toast("Attendance saved"); render();
};

// ----- Chart pieces -----
const VIZ = {};
function niceMax(v) {
  if (v <= 0) return 4;
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p * 4;
}
const compact = (n, isMoney) => { const s = n >= 10000 ? `${Math.round(n / 1000)}K` : n >= 1000 && n % 1000 === 0 ? `${n / 1000}K` : n.toLocaleString(); return isMoney ? `$${s}` : s; };
function statTile(label, value, sub, delta) {
  return html`<div class="stat-tile"><span class="lbl">${label}</span><b>${value}</b>${delta != null ? html`<span class="delta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}">${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta).toLocaleString()} from the week before</span>` : ""}${sub ? html`<span class="sub">${sub}</span>` : ""}</div>`;
}
/** Columns, stacked when there's more than one series. series = [[name, values]]. */
function stackedColumns(id, { title, labels, series, money: isMoney, csv }) {
  const totals = labels.map((_, i) => series.reduce((n, [, v]) => n + (v[i] || 0), 0));
  const max = niceMax(Math.max(...totals)), ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
  const show = (n) => isMoney ? money(Math.round(n)) : Math.round(n).toLocaleString();
  VIZ[id] = { labels, series, totals, show };
  const every = labels.length > 8 ? Math.ceil(labels.length / 6) : 1;
  const lastI = totals.length - 1;
  const desc = (i) => `${labels[i]}: ${show(totals[i])}${series.length > 1 ? ` (${series.map(([n, v]) => `${n} ${show(v[i] || 0)}`).join(", ")})` : ""}`;
  return html`<figure class="viz" data-viz="${id}" role="group" aria-label="${title}">
    <figcaption class="viz-head"><span class="viz-title">${title}</span>
      ${series.length > 1 ? html`<span class="viz-legend">${series.map(([n], j) => html`<span><i class="sw" style="background:var(--s${j + 1})"></i>${n}</span>`)}</span>` : ""}</figcaption>
    <div class="viz-plot">
      ${ticks.map((t) => html`<div class="viz-tick" style="bottom:${(t / max) * 100}%"><span>${compact(t, isMoney)}</span></div>`)}
      <div class="viz-cols">${labels.map((l, i) => html`<div class="viz-col" data-viz-i="${i}" tabindex="0" aria-label="${desc(i)}">
        <div class="viz-stack" style="height:${(totals[i] / max) * 100}%">${series.map(([, v], j) => (v[i] ? html`<i style="flex:${v[i]} 1 0;background:var(--s${j + 1})"></i>` : ""))}</div>
        ${i === lastI && totals[i] ? html`<span class="viz-end" style="bottom:${(totals[i] / max) * 100}%">${compact(Math.round(totals[i]), isMoney)}</span>` : ""}</div>`)}</div>
    </div>
    <div class="viz-x">${labels.map((l, i) => html`<span>${(lastI - i) % every === 0 ? l : ""}</span>`)}</div>
    <div class="viz-tip" hidden></div>
    <details class="viz-table"><summary>Show as a table</summary>
      <table class="mini-table"><thead><tr><th>${labels.length && /^[A-Z][a-z]{2}$/.test(labels[0]) ? "Month" : "Week of"}</th>${series.map(([n]) => html`<th class="num">${n}</th>`)}${series.length > 1 ? html`<th class="num">Total</th>` : ""}</tr></thead>
      <tbody>${labels.map((l, i) => html`<tr><td>${l}</td>${series.map(([, v]) => html`<td class="num">${show(v[i] || 0)}</td>`)}${series.length > 1 ? html`<td class="num">${show(totals[i])}</td>` : ""}</tr>`)}</tbody></table>
      ${csv ? html`<button class="btn ghost sm" data-act="viz-csv" data-viz="${id}" data-file="${csv}">${icon("download")}Download CSV</button>` : ""}</details>
  </figure>`;
}
/** A thin bar split into parts, with a legend that carries the counts. */
function segBar(parts) {
  const total = parts.reduce((n, [, v]) => n + v, 0) || 1;
  return html`<div class="segbar" role="img" aria-label="${parts.map(([l, v]) => `${l}: ${v}`).join(", ")}">${parts.map(([, v], j) => (v ? html`<i style="flex:${v} 1 0;background:var(--s${j + 1})"></i>` : ""))}</div>
    <div class="viz-legend" style="margin-top:8px">${parts.map(([l, v], j) => html`<span><i class="sw" style="background:var(--s${j + 1})"></i>${l} <b>${v}</b> (${Math.round((v / total) * 100)}%)</span>`)}</div>`;
}
function hBars(items, show) {
  const max = Math.max(...items.map(([, v]) => v), 1);
  return html`<div class="hbars">${items.map(([l, v]) => html`<div class="hbar"><span class="hb-l">${l}</span><span class="hb-track"><i style="width:${(v / max) * 100}%"></i><b>${show(Math.round(v))}</b></span></div>`)}</div>`;
}
Actions["viz-csv"] = (el) => {
  const v = VIZ[el.dataset.viz]; if (!v) return;
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["Period", ...v.series.map(([n]) => n), ...(v.series.length > 1 ? ["Total"] : [])].map(q).join(","),
    ...v.labels.map((l, i) => [q(l), ...v.series.map(([, s]) => Math.round(s[i] || 0)), ...(v.series.length > 1 ? [Math.round(v.totals[i])] : [])].join(","))];
  saveFile(el.dataset.file, rows.join("\n") + "\n");
};
// Hover and focus readout: the value leads, the series name follows, keyed by a short line in its color.
function vizTip(col) {
  const fig = col.closest(".viz"), v = VIZ[fig?.dataset.viz]; if (!v) return;
  const i = +col.dataset.vizI, tip = $(".viz-tip", fig);
  tip.replaceChildren();
  const head = document.createElement("div"); head.className = "vt-h"; head.textContent = v.labels[i]; tip.appendChild(head);
  const rows = v.series.length > 1 ? [...v.series.map(([n, s], j) => [n, s[i] || 0, `var(--s${j + 1})`]).reverse(), ["Total", v.totals[i], ""]] : [[v.series[0][0], v.totals[i], "var(--s1)"]];
  rows.forEach(([n, val, color]) => {
    const r = document.createElement("div"); r.className = "vt-r";
    const k = document.createElement("i"); k.style.background = color || "transparent"; r.appendChild(k);
    const b = document.createElement("b"); b.textContent = v.show(val); r.appendChild(b);
    const s = document.createElement("span"); s.textContent = n; r.appendChild(s);
    tip.appendChild(r);
  });
  tip.hidden = false;
  const plot = $(".viz-plot", fig), fx = fig.getBoundingClientRect(), cx = col.getBoundingClientRect(), stack = $(".viz-stack", col).getBoundingClientRect();
  const w = tip.offsetWidth, x = clamp(cx.left - fx.left + cx.width / 2 - w / 2, 0, fx.width - w);
  tip.style.left = `${x}px`; tip.style.top = `${Math.max(0, Math.min(stack.top, plot.getBoundingClientRect().bottom - 30) - fx.top - tip.offsetHeight - 8)}px`;
  $$(".viz-col.on", fig).forEach((c) => c.classList.remove("on")); col.classList.add("on");
}
const vizHide = (fig) => { const t = $(".viz-tip", fig); if (t) t.hidden = true; $$(".viz-col.on", fig).forEach((c) => c.classList.remove("on")); };
document.addEventListener("pointerover", (e) => { const col = e.target.closest?.(".viz-col"); if (col) vizTip(col); });
document.addEventListener("pointerout", (e) => { const col = e.target.closest?.(".viz-col"); if (col && !col.contains(e.relatedTarget)) vizHide(col.closest(".viz")); });
document.addEventListener("focusin", (e) => { const col = e.target.closest?.(".viz-col"); if (col) vizTip(col); });
document.addEventListener("focusout", (e) => { const col = e.target.closest?.(".viz-col"); if (col) vizHide(col.closest(".viz")); });
