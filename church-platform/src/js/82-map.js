// ---------- Campus map: a layout each church draws, and visitors use to find their way ----------
// A location's map is a grid of places (rooms, entrances, restrooms, parking...) on one or more floors, kept on the
// location itself: location.map = { floors: ["Main floor"], items: [{ id, type, name, note, floor, x, y, w, h }] }.
// People with "manage locations" draw it under Admin, Campus map. Everyone else opens it from Home or Plan your visit.
const MAP_W = 24, MAP_H = 30, MAP_CELL = 20;
const PLACE_TYPES = {
  worship: ["Worship space", "#c9dcf5"], room: ["Room", "#e6e3da"], kids: ["Kids", "#f9d9a8"], nursery: ["Nursery", "#f6cfe0"], restroom: ["Restrooms", "#cfe9ee"],
  entrance: ["Entrance", "#bfe5c4"], info: ["Welcome desk", "#f7e59a"], cafe: ["Coffee and food", "#e8cdb5"], office: ["Office", "#dcd6ee"], stairs: ["Stairs or elevator", "#d5d8dc"],
  parking: ["Parking", "#dfe3e8"], outside: ["Outdoors", "#d3ecc9"],
};
const mapOf = (l) => l?.map?.items?.length ? l.map : null;
const mapLocations = () => S.visibleLocations().filter(mapOf);
const mapFloors = (m) => m?.floors?.length ? m.floors : ["Main floor"];
let mapPick = null, mapFloor = 0, mapEditLoc = "", mapFind = "";
function mapLabel(it) {
  const words = String(it.name || PLACE_TYPES[it.type]?.[0] || "").split(/\s+/), per = Math.max(4, Math.floor(it.w * MAP_CELL / 7.2)), lines = [];
  words.forEach((w) => { const last = lines[lines.length - 1]; if (last != null && (last + " " + w).length <= per) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w); });
  return lines.slice(0, Math.max(1, Math.floor(it.h * MAP_CELL / 15)));
}
/** The drawing. In the builder each place can be dragged; in the viewer each is a button. */
function mapSvg(m, floor, { edit = false, picked = null } = {}) {
  const items = m.items.filter((it) => (it.floor || 0) === floor), W = MAP_W * MAP_CELL, H = MAP_H * MAP_CELL;
  return html`<svg class="campus-map ${edit ? "editing" : ""}" viewBox="0 0 ${W} ${H}" role="${edit ? "application" : "group"}" aria-label="Map of ${mapFloors(m)[floor]}">
    <rect width="${W}" height="${H}" fill="#fbfaf7" rx="10"></rect>
    ${edit ? html`<g stroke="#e9e6df" stroke-width="1">${Array.from({ length: MAP_W - 1 }, (_, i) => html`<path d="M${(i + 1) * MAP_CELL} 0V${H}"></path>`)}${Array.from({ length: MAP_H - 1 }, (_, i) => html`<path d="M0 ${(i + 1) * MAP_CELL}H${W}"></path>`)}</g>` : ""}
    ${items.map((it) => { const lines = mapLabel(it), cx = (it.x + it.w / 2) * MAP_CELL, cy = (it.y + it.h / 2) * MAP_CELL, on = picked === it.id;
      return html`<g class="place ${on ? "on" : ""}" data-place="${it.id}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${it.name || PLACE_TYPES[it.type]?.[0]}: ${PLACE_TYPES[it.type]?.[0] || "Place"}">
        <rect x="${it.x * MAP_CELL + 1.5}" y="${it.y * MAP_CELL + 1.5}" width="${it.w * MAP_CELL - 3}" height="${it.h * MAP_CELL - 3}" rx="6" fill="${(PLACE_TYPES[it.type] || PLACE_TYPES.room)[1]}" stroke="${on ? "#12324a" : "#8a8f98"}" stroke-width="${on ? 3 : 1.2}"></rect>
        <text x="${cx}" y="${cy - (lines.length - 1) * 6.5}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#1d2430">${lines.map((t, i) => html`<tspan x="${cx}" dy="${i ? 13 : 0}">${t}</tspan>`)}</text></g>`; })}
  </svg>`;
}
const floorTabs = (m, act) => mapFloors(m).length > 1 ? html`<div class="chips" role="group" aria-label="Floor" style="margin:10px 0;flex-wrap:wrap">${mapFloors(m).map((f, i) => html`<button class="chip" data-act="${act}" data-floor="${i}" aria-pressed="${i === mapFloor}">${f}</button>`)}</div>` : "";
/** What's on in a place today, from events and classes that name the room. */
function placeToday(l, it) {
  const today = isoDay(new Date()), name = String(it.name || "").trim().toLowerCase(); if (!name) return [];
  const ev = S.visible("events").filter((e) => String(e.room || "").trim().toLowerCase() === name && isoDay(new Date(e.start)) === today && (!e.locationId || e.locationId === l.id)).map((e) => `${fmtTime(new Date(e.start))}: ${e.title}`);
  const cls = S.visible("gatherings").filter((g) => String(g.room || "").trim().toLowerCase() === name && (g.schedule?.days || []).includes(new Date().getDay()) && (!g.locationId || g.locationId === l.id)).map((g) => `${g.schedule?.time ? `${g.schedule.time}: ` : ""}${g.name}`);
  return [...ev, ...cls].slice(0, 4);
}
Screens.map = (tail = "") => {
  if (!S.church()) return { redirect: "churches" };
  const locs = mapLocations(), [locId, placeId] = tail.split("~");
  if (!locs.length) return { title: "Campus map", back: "home", body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">${S.church().name} hasn't drawn a campus map yet.</p>${S.can("manage.locations") ? html`<p style="margin-bottom:0"><a class="btn" href="#admin-map">Draw the map</a></p>` : ""}</div>` };
  const l = locs.find((x) => x.id === locId) || locs[0], m = l.map;
  if (placeId && m.items.some((i) => i.id === placeId) && mapPick !== placeId) { mapPick = placeId; mapFloor = m.items.find((i) => i.id === placeId).floor || 0; }
  if (mapFloor >= mapFloors(m).length) mapFloor = 0;
  const it = m.items.find((i) => i.id === mapPick), q = mapFind.trim().toLowerCase();
  const list = m.items.filter((i) => i.name && (!q || `${i.name} ${PLACE_TYPES[i.type]?.[0]} ${i.note || ""}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)), today = it ? placeToday(l, it) : [];
  return { title: "Campus map", back: "home", body: html`
    ${locs.length > 1 ? html`<div class="chips" style="margin-top:14px;flex-wrap:wrap">${locs.map((x) => html`<a class="chip" aria-pressed="${x.id === l.id}" href="#map-${x.id}">${x.name}</a>`)}</div>` : ""}
    <p class="muted" style="margin:14px 0 0">${l.name}${l.address ? html`. <a href="${mapLink(l.address)}" target="_blank" rel="noopener">Directions</a>` : ""}. Tap a place to see what it is.</p>
    ${floorTabs(m, "map-floor")}
    <div class="map-frame">${mapSvg(m, mapFloor, { picked: mapPick })}</div>
    <div class="panel map-detail" role="status" aria-live="polite">${it ? html`<h2 style="margin:0">${it.name || PLACE_TYPES[it.type]?.[0]}</h2><p class="muted" style="margin:2px 0 0">${PLACE_TYPES[it.type]?.[0] || "Place"}${mapFloors(m).length > 1 ? `, ${mapFloors(m)[it.floor || 0]}` : ""}</p>
        ${it.note ? html`<p style="margin:8px 0 0">${it.note}</p>` : ""}${today.length ? html`<p style="margin:8px 0 0"><b>Today here:</b> ${today.join("; ")}</p>` : ""}`
      : html`<p class="muted" style="margin:0">Looking for somewhere? Pick it from the list below and it lights up on the map.</p>`}</div>
    <section class="sec"><div class="sec-head"><h2>Find a place</h2></div>
      <label class="field"><span class="sr">Search places</span><input type="search" placeholder="Search: restrooms, kids, coffee..." value="${mapFind}" data-input="map-find" autocomplete="off"></label>
      <div class="rows" id="map-list">${mapList(l, list)}</div></section>
    ${S.can("manage.locations") ? html`<p style="text-align:center"><a class="btn ghost" href="#admin-map">Edit the map</a></p>` : ""}`,
    after() { mapWire(l, false); } };
};
const mapList = (l, list) => list.length ? list.map((i) => html`<button class="row" data-act="map-pick" data-id="${i.id}"><span class="lead-ic"><i class="map-dot" style="background:${(PLACE_TYPES[i.type] || PLACE_TYPES.room)[1]}"></i></span><span class="body"><span class="t">${i.name}</span><span class="s">${PLACE_TYPES[i.type]?.[0] || "Place"}${mapFloors(l.map).length > 1 ? `, ${mapFloors(l.map)[i.floor || 0]}` : ""}</span></span>${icon("chev")}</button>`) : html`<p class="muted" style="margin:0">No place matches that.</p>`;
Inputs["map-find"] = (el) => { mapFind = el.value; const l = mapLocations().find((x) => location.hash.includes(x.id)) || mapLocations()[0], q = mapFind.trim().toLowerCase(); if (!l) return;
  const box = $("#map-list"); if (box) box.innerHTML = flat(mapList(l, l.map.items.filter((i) => i.name && (!q || `${i.name} ${PLACE_TYPES[i.type]?.[0]} ${i.note || ""}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)))); };
Actions["map-floor"] = (el) => { mapFloor = +el.dataset.floor; mapPick = null; render(); };
Actions["map-pick"] = (el) => { const l = mapLocations().find((x) => x.map.items.some((i) => i.id === el.dataset.id)); if (!l) return; mapPick = el.dataset.id; mapFloor = l.map.items.find((i) => i.id === mapPick).floor || 0; render(); $(".map-frame")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

// ----- The builder -----
const mapEditing = () => S.visibleLocations().find((l) => l.id === mapEditLoc) || S.visibleLocations()[0];
function mapSave(l) { l.map.items = l.map.items.map((it) => ({ ...it, x: clamp(it.x, 0, MAP_W - it.w), y: clamp(it.y, 0, MAP_H - it.h) })); S.save(); }
AdminScreens.map = () => {
  const stop = guard("manage.locations"); if (stop) return stop;
  const l = mapEditing(); if (!l) return { title: "Campus map", back: "admin", body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">Add a location first, under Campuses and locations.</p></div>` };
  l.map ||= { floors: ["Main floor"], items: [] }; const m = l.map, locs = S.visibleLocations();
  if (mapFloor >= mapFloors(m).length) mapFloor = 0;
  const it = m.items.find((i) => i.id === mapPick && (i.floor || 0) === mapFloor), unplaced = (l.rooms || []).filter((r) => !m.items.some((i) => String(i.name).toLowerCase() === r.toLowerCase()));
  return { title: "Campus map", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">Draw a simple layout so visitors can find their way. Add a place, drag it where it belongs, then set its size. Visitors see it under Campus map on Home.</p>
    ${locs.length > 1 ? html`<label class="field"><span>Location</span><select data-change="map-loc">${locs.map((x) => html`<option value="${x.id}" ${attr(x.id === l.id, "selected")}>${x.name}</option>`)}</select></label>` : ""}
    <div class="map-floors">${floorTabs(m, "map-floor")}<button class="btn ghost sm" data-act="map-floors">${mapFloors(m).length > 1 ? "Floors" : "Add a floor"}</button></div>
    <div class="map-frame">${mapSvg(m, mapFloor, { edit: true, picked: mapPick })}</div>
    ${it ? html`<form class="panel map-edit" data-form="map-place" novalidate><input type="hidden" name="id" value="${it.id}">
        <label class="field"><span>Name</span><input type="text" name="name" value="${it.name || ""}" maxlength="40" list="map-rooms"><datalist id="map-rooms">${(l.rooms || []).map((r) => html`<option value="${r}"></option>`)}</datalist></label>
        <label class="field"><span>Kind of place</span><select name="type">${Object.entries(PLACE_TYPES).map(([k, [n]]) => html`<option value="${k}" ${attr(k === it.type, "selected")}>${n}</option>`)}</select></label>
        <div class="map-size"><span>Width</span><button type="button" class="btn ghost sm" data-act="map-size" data-d="w-" aria-label="Narrower">−</button><b>${it.w}</b><button type="button" class="btn ghost sm" data-act="map-size" data-d="w+" aria-label="Wider">${icon("plus")}</button>
          <span>Height</span><button type="button" class="btn ghost sm" data-act="map-size" data-d="h-" aria-label="Shorter">−</button><b>${it.h}</b><button type="button" class="btn ghost sm" data-act="map-size" data-d="h+" aria-label="Taller">${icon("plus")}</button></div>
        <div class="map-size"><span>Move</span><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="x-" aria-label="Move left">←</button><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="x+" aria-label="Move right">→</button><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="y-" aria-label="Move up">↑</button><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="y+" aria-label="Move down">↓</button></div>
        <label class="field"><span>Note for visitors (optional)</span><input type="text" name="note" value="${it.note || ""}" maxlength="140" placeholder="For example: check kids in here first"></label>
        <div class="btns"><button class="btn">Save place</button><button type="button" class="btn danger" data-act="map-remove" data-id="${it.id}">Remove</button></div></form>`
      : html`<div class="panel"><p style="margin-top:0"><b>Add a place</b></p><div class="chips" style="flex-wrap:wrap">${Object.entries(PLACE_TYPES).map(([k, [n, col]]) => html`<button class="chip" data-act="map-add" data-type="${k}"><i class="map-dot" style="background:${col}"></i>${n}</button>`)}</div>
        ${unplaced.length ? html`<p style="margin:14px 0 6px"><b>Rooms not on the map yet</b></p><div class="chips" style="flex-wrap:wrap">${unplaced.map((r) => html`<button class="chip" data-act="map-add" data-type="room" data-name="${r}">${icon("plus")}${r}</button>`)}</div>` : ""}
        <p class="faint" style="margin-bottom:0">Tap a place on the map to rename it, resize it or remove it.</p></div>`}
    <div class="btns" style="margin-top:12px"><a class="btn ghost" href="#map-${l.id}">See it as a visitor</a></div>`,
    after() { mapWire(l, true); } };
};
Inputs["map-loc"] = (el) => { mapEditLoc = el.value; mapPick = null; mapFloor = 0; render(); };
Actions["map-add"] = (el) => {
  const l = mapEditing(), type = el.dataset.type, big = type === "worship" || type === "parking" || type === "outside", w = big ? 10 : type === "entrance" || type === "stairs" ? 4 : 6, h = big ? 7 : type === "entrance" || type === "stairs" ? 2 : 4;
  // The first free spot, reading down the map.
  const taken = (x, y) => l.map.items.some((i) => (i.floor || 0) === mapFloor && x < i.x + i.w && x + w > i.x && y < i.y + i.h && y + h > i.y);
  let spot = { x: 1, y: 1 }; outer: for (let y = 1; y <= MAP_H - h; y++) for (let x = 1; x <= MAP_W - w; x++) if (!taken(x, y)) { spot = { x, y }; break outer; }
  const it = { id: uid(), type, name: el.dataset.name || (type === "room" ? "" : PLACE_TYPES[type][0]), note: "", floor: mapFloor, ...spot, w, h };
  l.map.items.push(it); mapPick = it.id; mapSave(l); render();
};
Forms["map-place"] = (d) => { const l = mapEditing(), it = l.map.items.find((i) => i.id === d.id); if (!it) return; Object.assign(it, { name: String(d.name || "").trim().slice(0, 40), type: PLACE_TYPES[d.type] ? d.type : "room", note: String(d.note || "").trim().slice(0, 140) }); mapPick = null; mapSave(l); toast("Place saved"); render(); };
const mapKeep = () => { const f = $("form.map-edit"), l = mapEditing(), it = l.map.items.find((i) => i.id === mapPick); if (f && it) { it.name = f.name.value.trim().slice(0, 40); it.type = f.type.value; it.note = f.note.value.trim().slice(0, 140); } return [l, it]; };
Actions["map-size"] = (el) => { const [l, it] = mapKeep(); if (!it) return; const [k, s] = el.dataset.d.split(""); it[k] = clamp(it[k] + (s === "+" ? 1 : -1), 2, k === "w" ? MAP_W : MAP_H); mapSave(l); render(); };
Actions["map-nudge"] = (el) => { const [l, it] = mapKeep(); if (!it) return; const [k, s] = el.dataset.d.split(""); it[k] += s === "+" ? 1 : -1; mapSave(l); render(); };
Actions["map-remove"] = (el) => { const l = mapEditing(); l.map.items = l.map.items.filter((i) => i.id !== el.dataset.id); mapPick = null; mapSave(l); render(); };
Actions["map-floors"] = () => { const m = mapEditing().map; openSheet("Floors", html`<form data-form="map-floors" novalidate><label class="field"><span>One floor per line, ground floor first</span><textarea name="floors" rows="4">${mapFloors(m).join("\n")}</textarea></label>
  <p class="faint">Removing a floor removes the places drawn on it.</p><button class="btn block">Save floors</button></form>`); };
Forms["map-floors"] = (d, f) => { const l = mapEditing(), floors = String(d.floors || "").split("\n").map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 6); if (!floors.length) return formError(f, "Name at least one floor.");
  l.map.floors = floors; l.map.items = l.map.items.filter((i) => (i.floor || 0) < floors.length); mapFloor = Math.min(mapFloor, floors.length - 1); mapSave(l); closeSheet(); render(); };
/** Taps and (in the builder) dragging. */
function mapWire(l, edit) {
  const svg = $("svg.campus-map"); if (!svg) return;
  const pick = (id) => { if (edit) mapKeep(); mapPick = mapPick === id && !edit ? null : id; render(); };
  svg.addEventListener("keydown", (e) => { const g = e.target.closest?.("[data-place]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(g.dataset.place); } });
  if (!edit) { svg.addEventListener("click", (e) => { const g = e.target.closest("[data-place]"); if (g) pick(g.dataset.place); }); return; }
  let drag = null;
  const cell = () => svg.getBoundingClientRect().width / MAP_W;
  svg.addEventListener("pointerdown", (e) => { const g = e.target.closest("[data-place]"); if (!g) { if (mapPick) { mapKeep(); mapPick = null; S.save(); render(); } return; }
    const it = l.map.items.find((i) => i.id === g.dataset.place); drag = { g, it, x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", (e) => { if (!drag) return; const c = cell(); drag.dx = Math.round((e.clientX - drag.x) / c); drag.dy = Math.round((e.clientY - drag.y) / c);
    drag.dx = clamp(drag.dx, -drag.it.x, MAP_W - drag.it.w - drag.it.x); drag.dy = clamp(drag.dy, -drag.it.y, MAP_H - drag.it.h - drag.it.y);
    if (drag.dx || drag.dy) drag.moved = true; drag.g.setAttribute("transform", `translate(${drag.dx * MAP_CELL} ${drag.dy * MAP_CELL})`); e.preventDefault(); });
  const end = () => { if (!drag) return; const d = drag; drag = null; if (d.moved) { if (mapPick && mapPick !== d.it.id) mapKeep(); d.it.x += d.dx; d.it.y += d.dy; mapPick = d.it.id; mapSave(l); render(); } else pick(d.it.id); };
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", () => { drag = null; render(); });
}
