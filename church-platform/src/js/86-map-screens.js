// ---------- The campus map on church screens: "You are here" signage and the find-your-way kiosk ----------
// Each signage screen, room display or kiosk can be given its spot on the campus map (Screens and devices, "Where it
// is on the campus map"). A "Campus map: you are here" slide shows the map with that spot marked, and a QR code that
// opens the map on a phone starting from that spot (#map-LOCATION~PLACE~here). A check-in kiosk can show "Find your
// way" instead of (or as well as) check-in: people search or tap where they're going, watch the path drawn from the
// kiosk, read the steps, and scan a QR code to take the same directions on their phone (#map-LOCATION~TO~from~SPOT).

/** A spot key ("location~place") as the location and the place, or null if it's gone or staff only. */
function mapSpotOf(key) {
  const [loc, id] = String(key || "").split("~"), l = mapLocations().find((x) => x.id === loc);
  const it = l && (l.map.items || []).find((i) => i.id === id && !i.staff);
  return it ? { l, it } : null;
}
const mapSpotName = (key) => { const sp = mapSpotOf(key); return sp ? placeName(sp.it) : ""; };
/** The places a screen can stand at: every named place that visitors can see. */
const mapSpotOptions = (current) => mapLocations().map((l) => html`<optgroup label="${l.name}">${(l.map.items || []).filter((i) => !i.staff && (i.name || i.type !== "room"))
  .sort((a, b) => (a.floor || 0) - (b.floor || 0) || placeName(a).localeCompare(placeName(b)))
  .map((i) => html`<option value="${l.id}~${i.id}" ${attr(current === `${l.id}~${i.id}`, "selected")}>${placeName(i)}${mapFloors(l.map).length > 1 ? `, ${mapFloors(l.map)[i.floor || 0]}` : ""}</option>`)}</optgroup>`);

// ----- Screens and devices: where each screen is, and what a kiosk shows -----
function deviceMapFields(d) {
  const s = d.settings || {}, maps = mapLocations().length;
  const spotTypes = ["kiosk", "signage", "room", "display"];
  return html`<div class="dev-opt" data-for="kiosk" ${attr(d.type !== "kiosk", "hidden")}><fieldset class="field" style="border:0;padding:0"><legend class="flabel">What it shows</legend><div class="radios">
      ${[["checkin", "Kids check-in"], ["wayfind", "Campus map: find your way"], ["both", "Both, with a button to switch"]].map(([k, l]) => html`<label><input type="radio" name="kioskMode" value="${k}" ${attr((s.kioskMode || "checkin") === k, "checked")} ${attr(k !== "checkin" && !maps, "disabled")}><span>${l}</span></label>`)}</div>
      ${!maps ? html`<small>To use the campus map, draw it first under Admin, Campus map.</small>` : ""}</fieldset></div>
    ${maps ? html`<div class="dev-opt" data-for="${spotTypes.join(" ")}" ${attr(!spotTypes.includes(d.type), "hidden")}><label class="field"><span>Where it is on the campus map</span>
      <select name="mapSpot"><option value="">Not on the map</option>${mapSpotOptions(s.mapSpot)}</select>
      <small>Campus map slides mark this spot "You are here", and directions on a find-your-way kiosk start here.</small></label></div>` : ""}`;
}
const deviceMapSettings = (d) => ({ mapSpot: mapSpotOf(d.mapSpot) ? d.mapSpot : null, ...(d.type === "kiosk" ? { kioskMode: ["wayfind", "both"].includes(d.kioskMode) && mapLocations().length ? d.kioskMode : "checkin" } : {}) });

// ----- The signage slide -----
/** Where a map slide marks "You are here": the playing screen's own spot, then the spot chosen on the slide. */
function signMapSpot(s, pl) {
  const dev = thisDevice(), own = mapSpotOf(dev?.settings?.mapSpot);
  if (own && (!s.loc || s.loc === own.l.id)) return own;
  const chosen = mapSpotOf(s.spot);
  if (chosen && (!s.loc || s.loc === chosen.l.id)) return chosen;
  const l = mapLocations().find((x) => x.id === (s.loc || pl.locationId)) || mapLocations()[0];
  return l ? { l, it: null } : null;
}
function signMapSlide(s, pl, base, out) {
  const sp = signMapSpot(s, pl);
  if (sp && mapItems(sp.l.map).length) out.push({ ...base, spot: sp, qr: s.qr !== "off" });
}
function signMapHtml(s) {
  const { l, it } = s.spot, m = l.map, floor = it ? it.floor || 0 : 0, target = it ? `map-${l.id}~${it.id}~here` : `map-${l.id}`;
  const where = [mapLocations().length > 1 ? l.name : "", mapFloors(m).length > 1 ? mapFloors(m)[floor] : ""].filter(Boolean).join(", ");
  return html`<div class="sg-pad sg-map"><div class="sg-map-art">${mapSvg(m, floor, { here: it?.id || null, guest: true })}</div>
    <div class="sg-map-side"><div class="sg-kicker">${it ? "You are here" : "Campus map"}</div><div class="sg-title">${it ? placeName(it) : l.name}</div>${where ? html`<div class="sg-sub">${where}</div>` : ""}
      ${s.qr ? html`<div class="sg-qrwrap"><div class="sg-qr">${raw(qrSvg(appLink(target), { size: 320 }))}</div><span>Scan to find your way on your phone</span></div>` : ""}</div></div>`;
}
function signMapFields(s, pl) {
  const locs = mapLocations();
  if (!locs.length) return html`<p class="faint">Draw the campus map first under Admin, Campus map. This slide stays hidden until there is one.</p>`;
  return html`${locs.length > 1 ? html`<label class="field"><span>Which map</span><select name="loc"><option value="">The screen's own spot, or this playlist's location</option>${locs.map((l) => html`<option value="${l.id}" ${attr(s.loc === l.id, "selected")}>${l.name}</option>`)}</select></label>` : ""}
    <label class="field"><span>Mark "You are here" at</span><select name="spot"><option value="">Nowhere: just show the map</option>${mapSpotOptions(s.spot)}</select>
      <small>A screen with its own spot (Screens and devices) marks that spot instead, so one playlist works on screens all over the building.</small></label>
    <label class="field"><span>QR code</span><select name="qr"><option value="on" ${attr(s.qr !== "off", "selected")}>Show it: scanning opens the map on a phone, starting here</option><option value="off" ${attr(s.qr === "off", "selected")}>Don't show it</option></select></label>`;
}

// ----- The find-your-way kiosk: #wayfind -----
const wf = { q: "", type: "", dest: null, stepFree: false, floor: 0, spot: "", touched: 0, anim: false, seq: 0 };
const WF_IDLE = 90e3;
/** Where the kiosk stands: its own spot, the one staff picked to try it, or the location's main entrance. */
function wfSpot() {
  const dev = thisDevice(), locs = mapLocations();
  const sp = mapSpotOf(dev?.settings?.mapSpot) || mapSpotOf(wf.spot);
  if (sp) return sp;
  const l = locs.find((x) => x.id === dev?.locationId) || locs[0]; if (!l) return null;
  const from = mapDefaultFrom(l, null, false);
  return { l, it: mapItems(l.map).find((i) => i.id === from) || null };
}
const wfReset = () => Object.assign(wf, { q: "", type: "", dest: null, stepFree: false, anim: false, floor: (wfSpot()?.it?.floor) || 0, seq: wf.seq + 1 });
function wfList(l, here) {
  const keep = mapType; mapType = "";
  const list = mapMatches(l, wf.q).filter(({ i }) => i.id !== here?.id && (!wf.type || i.type === wf.type) && i.type !== "hallway");
  mapType = keep;
  return list.length ? list.slice(0, 40).map(({ i, why }) => html`<button class="wf-place" data-act="wf-go" data-id="${i.id}"><i class="map-dot" style="background:${placeKind(i)[1]}"></i><span><b>${placeName(i)}</b><small>${why || `${placeKind(i)[0]}${mapFloors(l.map).length > 1 ? `, ${mapFloors(l.map)[i.floor || 0]}` : ""}`}</small></span>${icon("chev")}</button>`)
    : html`<p class="kiosk-hint">Nothing matches that. Try another word, or ask at the welcome desk.</p>`;
}
Screens.wayfind = () => {
  const dev = thisDevice(), c = S.church();
  if (!dev && !S.isMember()) return { redirect: "home" };
  const sp = wfSpot();
  if (!sp) return { kiosk: true, page: html`<div class="loading">${c.name} hasn't drawn a campus map yet.${dev ? deviceExitBtn() : html` <a class="btn" href="#admin-map">Draw it</a>`}</div>` };
  const { l, it: here } = sp, m = l.map, multi = mapFloors(m).length > 1;
  const dest = wf.dest && mapItems(m).find((i) => i.id === wf.dest);
  const route = dest && here ? mapRouteFind(m, here.id, dest.id, wf.stepFree) : null, legs = route?.legs || [];
  if (wf.floor >= mapFloors(m).length) wf.floor = 0;
  const types = [...new Set(mapItems(m).map((i) => i.type))].filter((t) => PLACE_TYPES[t] && !["hallway", "room", "office"].includes(t));
  const link = dest && here ? `map-${l.id}~${dest.id}~from~${here.id}${wf.stepFree ? "~sf" : ""}` : "";
  const side = !dest ? html`<h1>Where are you going?</h1>
      <input class="wf-search" type="search" placeholder="Search: restrooms, nursery, coffee..." value="${wf.q}" data-input="wf-q" autocomplete="off" aria-label="Search places">
      ${types.length > 1 ? html`<div class="chips wf-chips" role="group" aria-label="Kinds of places">${["", ...types].map((t) => html`<button class="chip" data-act="wf-type" data-type="${t}" aria-pressed="${t === wf.type}">${t ? html`<i class="map-dot" style="background:${PLACE_TYPES[t][1]}"></i>${PLACE_TYPES[t][0]}` : "Everything"}</button>`)}</div>` : ""}
      <div class="wf-list" id="wf-list">${wfList(l, here)}</div>`
    : html`<p class="wf-kicker">Directions to</p><h1>${placeName(dest)}</h1><p class="kiosk-sub" style="text-align:left">${placeKind(dest)[0]}${multi ? `, ${mapFloors(m)[dest.floor || 0]}` : ""}${dest.note ? `. ${dest.note}` : ""}</p>
      ${legs.length ? html`<ol class="map-steps wf-steps">${mapSteps(m, route, here.id).map((x) => html`<li>${x}</li>`)}</ol>
          ${legs.length > 1 ? html`<div class="btns">${legs.map((g, i) => html`<button class="btn ${g.floor === wf.floor ? "" : "ghost"} sm" data-act="wf-floor" data-floor="${g.floor}">${i ? "Then" : "First"}: ${mapFloors(m)[g.floor]}</button>`)}</div>` : ""}`
        : html`<p>There's no way there on this map${route?.needs ? ` without ${route.needs}` : wf.stepFree ? " without stairs or steps" : ""}. Ask at the welcome desk and someone will walk you there.</p>`}
      <label class="check wf-check"><input type="checkbox" data-change="wf-stepfree" ${attr(wf.stepFree, "checked")}><span>Step-free route (no stairs or steps)</span></label>
      ${legs.length ? html`<div class="wf-qr"><div class="sg-qr">${raw(qrSvg(appLink(link), { size: 220 }))}</div><span><b>Take these directions with you</b>Scan with your phone's camera to open this map on your phone, with the way marked.</span></div>` : ""}
      <div class="btns wf-btns">${legs.length ? html`<button class="btn ghost" data-act="wf-replay">${icon("play")}Show me again</button>` : ""}<button class="btn" data-act="wf-reset">Somewhere else</button></div>`;
  const toCheckin = dev?.settings?.kioskMode === "both";
  return {
    kiosk: true,
    page: html`<div class="kiosk wayfind">
      <header class="kiosk-head">${churchMark(c, 46)}<div class="kh-t"><b>${c.name}</b><span>Find your way${mapLocations().length > 1 ? `: ${l.name}` : ""}</span></div>
        ${!dev ? html`<label class="wf-spot"><span class="sr">This kiosk stands at</span><select data-change="wf-spot" aria-label="This kiosk stands at">${mapSpotOptions(`${l.id}~${here?.id || ""}`)}</select></label>` : ""}
        ${toCheckin ? html`<a class="btn ghost sm" href="#kiosk">${icon("kid")}Check in kids</a>` : ""}
        <button class="icon-btn" data-act="${dev ? "device-exit" : "wf-exit"}" aria-label="Exit">${icon("lock")}</button></header>
      <main class="wf-main"><section class="wf-mapbox" aria-label="Map">${multi ? html`<div class="chips" role="group" aria-label="Floor" style="margin:0 0 10px;flex-wrap:wrap">${mapFloors(m).map((f, i) => html`<button class="chip" data-act="wf-floor" data-floor="${i}" aria-pressed="${i === wf.floor}">${f}${legs.length > 1 && legs.some((g) => g.floor === i) ? " •" : ""}</button>`)}</div>` : ""}
          <div class="wf-art">${mapSvg(m, wf.floor, { here: here?.id || null, picked: dest?.id || null, route: legs.length ? route : null, animate: wf.anim, type: !dest && wf.type ? wf.type : "", guest: true })}</div>
          ${here ? html`<p class="wf-legend"><span class="wf-you"></span>You are here: <b>${placeName(here)}</b>${multi ? `, ${mapFloors(m)[here.floor || 0]}` : ""}${!dest ? ". Tap a place on the map, or search." : ""}</p>` : ""}</section>
        <aside class="wf-side" aria-live="polite">${side}</aside></main></div>`,
    after() {
      const svg = $(".wf-art svg");
      svg?.addEventListener("click", (e) => { const g = e.target.closest("[data-place]"); if (g && g.dataset.place !== here?.id) wfGo(g.dataset.place); });
      // On two floors, the path on the second floor plays once the first is done.
      const seq = wf.seq;
      if (wf.anim && legs.length > 1 && wf.floor === legs[0].floor) setTimeout(() => { if (wf.seq !== seq || location.hash !== "#wayfind") return; wf.floor = legs[1].floor; wf.anim = true; render(); }, (MAP_WALK_SECONDS + 2) * 1000);
      wf.anim = false; wf.touched = wf.touched || Date.now();
    },
  };
};
function wfGo(id) {
  const sp = wfSpot(); if (!sp) return;
  const r = sp.it && mapRouteFind(sp.l.map, sp.it.id, id, wf.stepFree);
  Object.assign(wf, { dest: id, anim: true, seq: wf.seq + 1, floor: r?.legs ? r.legs[0].floor : sp.l.map.items.find((i) => i.id === id)?.floor || 0 });
  render();
}
Actions["wf-go"] = (el) => wfGo(el.dataset.id);
Actions["wf-type"] = (el) => { wf.type = el.dataset.type; render(); };
Actions["wf-floor"] = (el) => { wf.floor = +el.dataset.floor; wf.seq++; wf.anim = !!wf.dest; render(); };
Actions["wf-replay"] = () => { const sp = wfSpot(), r = sp?.it && wf.dest && mapRouteFind(sp.l.map, sp.it.id, wf.dest, wf.stepFree); if (r?.legs) wf.floor = r.legs[0].floor; wf.anim = true; wf.seq++; render(); };
Actions["wf-reset"] = () => { wfReset(); render(); };
Actions["wf-exit"] = () => { wfReset(); go(S.can("manage.locations") ? "admin-map" : "home"); };
Inputs["wf-q"] = (el) => { wf.q = el.value; const sp = wfSpot(), box = $("#wf-list"); if (sp && box) box.innerHTML = flat(wfList(sp.l, sp.it)); };
Inputs["wf-stepfree"] = (el) => { wf.stepFree = el.checked; const sp = wfSpot(), r = sp?.it && wf.dest && mapRouteFind(sp.l.map, sp.it.id, wf.dest, wf.stepFree); if (r?.legs) wf.floor = r.legs[0].floor; wf.anim = true; wf.seq++; render(); };
Inputs["wf-spot"] = (el) => { wf.spot = el.value; wfReset(); render(); };
// A kiosk left alone goes back to the start, so the next person doesn't see someone else's directions.
document.addEventListener("pointerdown", () => { wf.touched = Date.now(); }, true);
document.addEventListener("keydown", () => { wf.touched = Date.now(); }, true);
setInterval(() => { if (location.hash === "#wayfind" && (wf.dest || wf.q || wf.type) && Date.now() - wf.touched > WF_IDLE) { wfReset(); render(); } }, 10e3);

/** On the map builder: which screens are on the map, and the kiosk to try. */
function mapScreensSection(l) {
  if (!S.can("manage.devices") && !S.can("manage.locations")) return "";
  const devs = S.list("devices").filter((d) => mapSpotOf(d.settings?.mapSpot)?.l.id === l.id);
  return html`<section class="sec"><div class="sec-head"><h2>On church screens</h2></div>
    <p class="muted" style="margin-top:0">Give each lobby screen and kiosk its spot on this map. A "Campus map: you are here" slide marks it, and a kiosk set to Find your way gives directions from it, with a QR code to take them along.</p>
    <div class="rows">${devs.length ? devs.map((d) => html`<div class="row"><span class="lead-ic">${icon(DEVICE_TYPES[d.type]?.[1] || "screen")}</span><span class="body"><span class="t">${d.name}</span><span class="s">At ${mapSpotName(d.settings.mapSpot)}</span></span></div>`) : empty("No screens are on this map yet.")}</div>
    <div class="btns">${S.can("manage.devices") ? html`<a class="btn ghost" href="#devices">${icon("screen")}Set where screens are</a><a class="btn ghost" href="#signs">${icon("image")}Add a map slide</a>` : ""}<a class="btn ghost" href="#wayfind">${icon("pin")}Try the find-your-way kiosk</a></div></section>`;
}
