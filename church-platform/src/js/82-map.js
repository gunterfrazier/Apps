// ---------- Campus map: a layout each church draws, and visitors use to find their way ----------
// A location's map lives on the location itself:
// location.map = {
//   floors: ["Main floor"],
//   items: [{ id, type, name, note, floor, x, y, w, h, keywords, photo, link: { label, url }, staff, steps }],
//   backdrops: ["data:image/..."]  a floor plan or aerial photo under each floor (optional), fade: 0-85, showBackdrop
//   links: [{ id, provider, title, url }]  maps built on other services (Mappedin, Mapme, Google My Maps...), shown as tabs
//   primary: "built-in" or a link id, the view that opens first
// }
// People with "manage locations" draw it under Admin, Campus map. Everyone else opens it from Home or Plan your visit.
// A "You are here" QR code (#map-LOCATION~PLACE~here) posted in the building starts directions from that spot.
const MAP_W = 24, MAP_H = 30, MAP_CELL = 20;
const PLACE_TYPES = {
  worship: ["Worship space", "#c9dcf5", "⛪"], room: ["Room", "#e6e3da", ""], kids: ["Kids", "#f9d9a8", "🧸"], nursery: ["Nursery", "#f6cfe0", "🍼"],
  restroom: ["Restrooms", "#cfe9ee", "🚻"], entrance: ["Entrance", "#bfe5c4", "🚪"], exit: ["Exit", "#f5cbc4", "🏃"], info: ["Welcome desk", "#f7e59a", "ℹ️"],
  cafe: ["Coffee and food", "#e8cdb5", "☕"], office: ["Office", "#dcd6ee", "💼"], hallway: ["Hallway or path", "#f1efe9", ""], stairs: ["Stairs", "#d5d8dc", "🪜"],
  elevator: ["Elevator", "#cdd9e6", "🛗"], parking: ["Parking", "#dfe3e8", "🅿️"], outside: ["Outdoors", "#d3ecc9", "🌳"],
};
const placeKind = (it) => PLACE_TYPES[it?.type] || PLACE_TYPES.room;
const placeName = (it) => it.name || placeKind(it)[0];
/** Staff-only places (offices, storage) are left off the map for members and visitors. It tidies the map; it isn't a lock. */
const mapStaff = () => (S.role()?.rank || 0) > 10 || S.can("manage.locations");
const mapItems = (m) => (m?.items || []).filter((i) => !i.staff || mapStaff());
const mapOf = (l) => l?.map && (l.map.items?.length || l.map.links?.length) ? l.map : null;
const mapLocations = () => S.visibleLocations().filter(mapOf);
const mapFloors = (m) => m?.floors?.length ? m.floors : ["Main floor"];
let mapAnimate = false, mapPick = null, mapFloor = 0, mapEditLoc = "", mapFind = "", mapType = "", mapRoute = null, mapHere = null, mapZoom = 1, mapView = null, mapTail = null, mapShown = null;
function mapLabel(it) {
  const words = placeName(it).split(/\s+/), per = Math.max(4, Math.floor(it.w * MAP_CELL / 7.2)), lines = [];
  words.forEach((w) => { const last = lines[lines.length - 1]; if (last != null && (last + " " + w).length <= per) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w); });
  return lines.slice(0, Math.max(1, Math.floor(it.h * MAP_CELL / 15)));
}
const cellOf = (it) => (it.y + Math.floor((it.h - 1) / 2)) * MAP_W + it.x + Math.floor((it.w - 1) / 2);
const cellXY = (c) => [((c % MAP_W) + 0.5) * MAP_CELL, (Math.floor(c / MAP_W) + 0.5) * MAP_CELL];

/** The drawing. In the builder each place can be dragged; in the viewer each is a button. */
function mapSvg(m, floor, { edit = false, picked = null, route = null, here = null, type = "", animate = false, guest = false } = {}) {
  // guest: a screen anyone can see (signage, a kiosk), so staff-only places stay off it whoever set it up.
  const items = (edit ? m.items : mapItems(m).filter((i) => !guest || !i.staff)).filter((it) => (it.floor || 0) === floor), W = MAP_W * MAP_CELL, H = MAP_H * MAP_CELL;
  const bg = (edit || m.showBackdrop) && m.backdrops?.[floor], see = bg && !edit ? 0.82 : 1;
  const legs = (route?.legs || []).filter((g) => g.floor === floor);
  const hereIt = here && !route ? items.find((i) => i.id === here) : null;
  return html`<svg class="campus-map ${edit ? "editing" : ""}" viewBox="0 0 ${W} ${H}" role="${edit ? "application" : "group"}" aria-label="Map of ${mapFloors(m)[floor]}">
    <rect width="${W}" height="${H}" fill="#fbfaf7" rx="10"></rect>
    ${bg ? html`<image href="${bg}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" opacity="${(100 - (m.fade ?? 40)) / 100}"></image>` : ""}
    ${edit ? html`<g stroke="#e9e6df" stroke-width="1" opacity="${bg ? 0.5 : 1}">${Array.from({ length: MAP_W - 1 }, (_, i) => html`<path d="M${(i + 1) * MAP_CELL} 0V${H}"></path>`)}${Array.from({ length: MAP_H - 1 }, (_, i) => html`<path d="M0 ${(i + 1) * MAP_CELL}H${W}"></path>`)}</g>` : ""}
    ${items.sort((a, b) => b.w * b.h - a.w * a.h).map((it) => { const lines = mapLabel(it), cx = (it.x + it.w / 2) * MAP_CELL, cy = (it.y + it.h / 2) * MAP_CELL, on = picked === it.id, [kind, fill, glyph] = placeKind(it);
      const dim = type && it.type !== type, showGlyph = glyph && (it.w >= 3 || it.h >= 3), pad = showGlyph && it.h >= 3 ? 7 : 0;
      return html`<g class="place ${on ? "on" : ""} ${dim ? "dim" : ""}" data-place="${it.id}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${placeName(it)}: ${kind}${it.staff ? ", staff only" : ""}">
        <rect x="${it.x * MAP_CELL + 1.5}" y="${it.y * MAP_CELL + 1.5}" width="${it.w * MAP_CELL - 3}" height="${it.h * MAP_CELL - 3}" rx="6" fill="${fill}" fill-opacity="${see}" stroke="${on ? "#12324a" : "#8a8f98"}" stroke-width="${on ? 3 : 1.2}" ${attr(it.staff, 'stroke-dasharray="5 4"')}></rect>
        ${showGlyph ? html`<text x="${it.x * MAP_CELL + 6}" y="${it.y * MAP_CELL + 17}" font-size="12" aria-hidden="true">${glyph}</text>` : ""}
        <text x="${cx}" y="${cy + pad - (lines.length - 1) * 6.5}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#1d2430">${lines.map((t, i) => html`<tspan x="${cx}" dy="${i ? 13 : 0}">${t}</tspan>`)}</text></g>`; })}
    ${legs.map((g) => { const pts = mapSimplify(g.cells).map((c) => cellXY(c).join(",")).join(" "), [sx, sy] = cellXY(g.cells[0]), [ex, ey] = cellXY(g.cells[g.cells.length - 1]);
      return html`<g class="map-route-g" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"></polyline>
        <polyline class="map-route ${animate ? "anim" : ""}" points="${pts}" ${attr(animate, 'pathLength="1"')} fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></polyline>
        <circle cx="${sx}" cy="${sy}" r="8" fill="#1f8a4c" stroke="#fff" stroke-width="3"></circle><circle class="map-end ${animate ? "anim" : ""}" cx="${ex}" cy="${ey}" r="9" fill="#c0392b" stroke="#fff" stroke-width="3"></circle>
        ${animate ? html`<circle class="map-walker" r="7" fill="#fff" stroke="#12324a" stroke-width="3"><animateMotion dur="${MAP_WALK_SECONDS}s" fill="freeze" path="M${pts.split(" ").join(" L")}"></animateMotion></circle>` : ""}</g>`; })}
    ${hereIt ? (() => { const [x, y] = cellXY(cellOf(hereIt)); return html`<g class="map-here" aria-hidden="true"><circle cx="${x}" cy="${y}" r="16" fill="#1f8a4c" opacity=".2"></circle><circle cx="${x}" cy="${y}" r="8" fill="#1f8a4c" stroke="#fff" stroke-width="3"></circle>
      <rect x="${x - 38}" y="${y - 34}" width="76" height="18" rx="9" fill="#1f8a4c"></rect><text x="${x}" y="${y - 25}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="700" fill="#fff">You are here</text></g>`; })() : ""}
  </svg>`;
}
/** How long the walking animation takes on a route, in seconds. */
const MAP_WALK_SECONDS = 2.8;
const floorTabs = (m, act, marked = []) => mapFloors(m).length > 1 ? html`<div class="chips" role="group" aria-label="Floor" style="margin:10px 0;flex-wrap:wrap">${mapFloors(m).map((f, i) => html`<button class="chip" data-act="${act}" data-floor="${i}" aria-pressed="${i === mapFloor}">${f}${marked.includes(i) ? " •" : ""}</button>`)}</div>` : "";

// ----- Directions: the cheapest walk across the grid. Hallways, paths and entrances are cheap, rooms cost more,
// open space is in between, and a step-free route never uses stairs or a place marked as having steps. -----
const MAP_WALK = { hallway: 1, entrance: 1, exit: 1, outside: 1.2, info: 1.2, parking: 1.5, stairs: 1, elevator: 1 };
function mapGrid(m, floor, keep, stepFree) {
  const N = MAP_W * MAP_H, owner = new Array(N).fill(null), cost = new Float64Array(N).fill(3);
  mapItems(m).filter((i) => (i.floor || 0) === floor).sort((a, b) => b.w * b.h - a.w * a.h)
    .forEach((it) => { for (let y = it.y; y < it.y + it.h; y++) for (let x = it.x; x < it.x + it.w; x++) if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) owner[y * MAP_W + x] = it; });
  for (let i = 0; i < N; i++) { const o = owner[i]; if (!o) continue;
    cost[i] = keep.includes(o.id) ? 1 : stepFree && (o.type === "stairs" || o.steps) ? Infinity : MAP_WALK[o.type] ?? 6; }
  return { owner, cost };
}
function mapDij(g, src) {
  const N = MAP_W * MAP_H, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[src] = 0;
  for (;;) {
    let u = -1, best = Infinity; for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break; done[u] = 1;
    const x = u % MAP_W, y = (u / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const v = ny * MAP_W + nx; if (!Number.isFinite(g.cost[v])) continue;
      const d = best + (g.cost[u] + g.cost[v]) / 2; if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  return { dist, prev };
}
const mapPath = (prev, t) => { const out = []; for (let c = t; c >= 0; c = prev[c]) out.push(c); return out.reverse(); };
/** Keeps only the corners of a path, so the line is drawn with as few points as it needs. */
function mapSimplify(cells) {
  if (cells.length < 3) return cells;
  const out = [cells[0]], d = (a, b) => [b % MAP_W - a % MAP_W, Math.floor(b / MAP_W) - Math.floor(a / MAP_W)].join();
  for (let i = 1; i < cells.length - 1; i++) if (d(cells[i - 1], cells[i]) !== d(cells[i], cells[i + 1])) out.push(cells[i]);
  out.push(cells[cells.length - 1]); return out;
}
/** A route from one place to another, across floors by stairs or elevator. Null if either is missing; { none } if there's no way. */
function mapRouteFind(m, fromId, toId, stepFree) {
  const items = mapItems(m), A = items.find((i) => i.id === fromId), B = items.find((i) => i.id === toId);
  if (!A || !B || A === B) return null;
  const fa = A.floor || 0, fb = B.floor || 0;
  if (fa === fb) {
    const g = mapGrid(m, fa, [A.id, B.id], stepFree), r = mapDij(g, cellOf(A));
    return Number.isFinite(r.dist[cellOf(B)]) ? { A, B, legs: [{ floor: fa, cells: mapPath(r.prev, cellOf(B)), grid: g }] } : { none: true };
  }
  const conn = (f) => items.filter((i) => (i.floor || 0) === f && (i.type === "elevator" || (!stepFree && i.type === "stairs")));
  const ca = conn(fa), cb = conn(fb);
  if (!ca.length || !cb.length) return { none: true, needs: stepFree ? "an elevator" : "stairs or an elevator" };
  const ga = mapGrid(m, fa, [A.id, ...ca.map((c) => c.id)], stepFree), ra = mapDij(ga, cellOf(A));
  const gb = mapGrid(m, fb, [B.id, ...cb.map((c) => c.id)], stepFree), rb = mapDij(gb, cellOf(B));
  const linked = (a, b) => a.type === b.type && (a.name && a.name.toLowerCase() === String(b.name).toLowerCase() || (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  let best = null;
  ca.forEach((c1) => cb.forEach((c2) => { const d = ra.dist[cellOf(c1)] + rb.dist[cellOf(c2)] + (linked(c1, c2) ? 0 : 25); if (Number.isFinite(d) && (!best || d < best.d)) best = { d, c1, c2 }; }));
  if (!best) return { none: true };
  return { A, B, via: best.c1, via2: best.c2, legs: [{ floor: fa, cells: mapPath(ra.prev, cellOf(best.c1)), grid: ga }, { floor: fb, cells: mapPath(rb.prev, cellOf(best.c2)).reverse(), grid: gb }] };
}
/** Step-by-step directions from a route: the places it passes through, in order. */
function mapSteps(m, r, hereId) {
  const n = (it) => html`<b>${placeName(it)}</b>`, skip = new Set([r.A.id, r.B.id, r.via?.id, r.via2?.id]), out = [];
  const say = (o) => ({ hallway: html`Follow ${n(o)}`, parking: html`Cross ${n(o)}`, outside: html`Cross ${n(o)}`, entrance: html`Go through ${n(o)}`, exit: html`Go through ${n(o)}`, info: html`Pass ${n(o)}`, stairs: html`Pass ${n(o)}`, elevator: html`Pass ${n(o)}` }[o.type] || html`Go through ${n(o)}`);
  out.push(r.A.id === hereId ? html`You're at ${n(r.A)}.` : html`Start at ${n(r.A)}.`);
  r.legs.forEach((leg, li) => {
    if (li) { const v = r.via; out.push(html`Take ${v.type === "elevator" ? "the elevator" : "the stairs"}${v.name && v.name !== placeKind(v)[0] ? html` (${n(v)})` : ""} to <b>${mapFloors(m)[leg.floor]}</b>.`); }
    leg.cells.forEach((c) => { const o = leg.grid.owner[c]; if (o && !skip.has(o.id)) { skip.add(o.id); out.push(html`${say(o)}.`); } });
  });
  out.push(html`Arrive at ${n(r.B)}${mapFloors(m).length > 1 ? `, ${mapFloors(m)[r.B.floor || 0]}` : ""}.${r.B.note ? html` <span class="muted">${r.B.note}</span>` : ""}`);
  return out;
}
/** Where directions start when nobody has picked: where they scanned a "You are here" code, or the main entrance. */
function mapDefaultFrom(l, toId, stepFree) {
  const items = mapItems(l.map).filter((i) => i.id !== toId);
  if (mapHere?.loc === l.id && items.some((i) => i.id === mapHere.id)) return mapHere.id;
  const doors = items.filter((i) => i.type === "entrance").sort((a, b) => (a.floor || 0) - (b.floor || 0));
  return (stepFree && doors.find((d) => !d.steps) || doors[0] || items.find((i) => i.type === "info") || items[0])?.id || null;
}

/** What's on in a place today, from events and classes that name the room. */
function placeToday(l, it) {
  const today = isoDay(new Date()), name = String(it.name || "").trim().toLowerCase(); if (!name) return [];
  const ev = S.visible("events").filter((e) => String(e.room || "").trim().toLowerCase() === name && isoDay(new Date(e.start)) === today && (!e.locationId || e.locationId === l.id)).map((e) => `${fmtTime(new Date(e.start))}: ${e.title}`);
  const cls = S.visible("gatherings").filter((g) => String(g.room || "").trim().toLowerCase() === name && (g.schedule?.days || []).includes(new Date().getDay()) && (!g.locationId || g.locationId === l.id)).map((g) => `${g.schedule?.time ? `${g.schedule.time}: ` : ""}${g.name}`);
  return [...ev, ...cls].slice(0, 4);
}
/** Search by name, kind, note, the words a church adds ("diapers", "coffee") and what's on there today ("youth group"). */
function mapMatches(l, q) {
  q = q.trim().toLowerCase();
  return mapItems(l.map).filter((i) => i.name || i.type !== "room").map((i) => {
    const today = placeToday(l, i), hay = `${placeName(i)} ${placeKind(i)[0]} ${i.note || ""} ${i.keywords || ""}`.toLowerCase();
    if (!q || hay.includes(q)) return { i, why: "" };
    const t = today.find((x) => x.toLowerCase().includes(q)); return t ? { i, why: `Today: ${t}` } : null;
  }).filter(Boolean).filter(({ i }) => !mapType || i.type === mapType).sort((a, b) => placeName(a.i).localeCompare(placeName(b.i)));
}
const mapCurrent = () => { const locs = mapLocations(), id = splitRoute().tail.split("~")[0]; return locs.find((x) => x.id === id) || locs[0]; };
const mapViews = (l) => [...(mapItems(l.map).length ? [{ id: "built-in", title: "Our map" }] : []), ...(l.map.links || []).map((k) => ({ id: k.id, title: k.title }))];

// Visitors who scan a map QR code may not have an account: the map of a public location opens for them too.
Screens.map = (tail = "") => {
  const locId0 = tail.split("~")[0];
  if (Backend.on && !Backend.user && !S.church()?.locations?.some((x) => x.id === locId0)) {
    if (mapPublicTry !== locId0) { mapPublicTry = locId0; Backend.pullPublic(locId0).then((ok) => { if (!ok) mapPublicFail = locId0; render(); }).catch(() => { mapPublicFail = locId0; render(); }); }
    return { page: html`<div class="loading" role="status">${mapPublicFail === locId0 ? html`<div style="text-align:center;max-width:320px"><p>This map isn't public. Sign in to see it.</p><a class="btn" href="#signin">Sign in</a></div>` : html`<span class="ai-dot"></span>Opening the campus map...`}</div>` };
  }
  const v = mapScreen(tail);
  if (!v.body || S.isMember()) return v;
  // Someone who isn't a member here (a guest who scanned a sign) gets the map on its own, without the app around it.
  const c = S.church();
  return { page: html`<div class="public-page map-public" style="--brand:${c.color};--on-brand:${onColor(c.color)}"><header class="home-top"><div class="wrap"><div class="home-bar"><span class="switcher">${churchMark(c, 36)}<span><strong>${c.name}</strong><small>Campus map</small></span></span>
      <a class="btn sm" href="#page-${c.id}">About us</a></div></div></header><main class="view">${v.body}</main></div>`, after: v.after };
};
let mapPublicTry = "", mapPublicFail = "";
function mapScreen(tail = "") {
  if (!S.church()) return { redirect: "churches" };
  const locs = mapLocations();
  if (!locs.length) return { title: "Campus map", back: "home", body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">${S.church().name} hasn't drawn a campus map yet.</p>${S.can("manage.locations") ? html`<p style="margin-bottom:0"><a class="btn" href="#admin-map">Draw the map</a></p>` : ""}</div>` };
  const [locId, placeId, here, fromId, sfFlag] = tail.split("~"), l = locs.find((x) => x.id === locId) || locs[0], m = l.map;
  if (mapShown !== l.id) { mapShown = l.id; mapPick = null; mapRoute = null; mapType = ""; mapFind = ""; mapFloor = 0; mapZoom = 1; mapView = null; }
  // A link or "You are here" code is followed once, so tapping around afterwards isn't undone by the address.
  if (tail !== mapTail) { mapTail = tail; const it0 = mapItems(m).find((i) => i.id === placeId);
    if (it0) { mapPick = it0.id; mapFloor = it0.floor || 0; mapView = "built-in"; mapRoute = null; if (here === "here") { mapHere = { loc: l.id, id: it0.id }; toast(`You're at ${placeName(it0)}. Pick where you're going.`); }
      // Directions from a kiosk: #map-LOCATION~TO~from~FROM, with ~sf for a step-free route.
      const f0 = here === "from" && mapItems(m).find((i) => i.id === fromId);
      if (f0) { mapHere = { loc: l.id, id: f0.id }; mapRoute = { from: f0.id, to: it0.id, stepFree: sfFlag === "sf" }; const r0 = mapRouteFind(m, f0.id, it0.id, mapRoute.stepFree); if (r0?.legs) mapFloor = r0.legs[0].floor; mapAnimate = true; } } }
  const views = mapViews(l);
  if (!views.some((v) => v.id === mapView)) mapView = views.some((v) => v.id === m.primary) ? m.primary : views[0].id;
  const ext = mapView !== "built-in" && (m.links || []).find((k) => k.id === mapView);
  const head = html`${locs.length > 1 ? html`<div class="chips" style="margin-top:14px;flex-wrap:wrap">${locs.map((x) => html`<a class="chip" aria-pressed="${x.id === l.id}" href="#map-${x.id}">${x.name}</a>`)}</div>` : ""}
    ${views.length > 1 ? html`<nav class="seg" aria-label="Map" style="margin-top:12px">${views.map((v) => html`<a href="#map-${l.id}" data-act="map-view" data-id="${v.id}" ${attr(v.id === mapView, 'aria-current="page"')}>${v.title}</a>`)}</nav>` : ""}`;
  const edit = S.can("manage.locations") ? html`<p style="text-align:center"><a class="btn ghost" href="#admin-map">Edit the map</a></p>` : "";
  if (ext) return { title: "Campus map", back: "home", body: html`${head}
    <p class="muted" style="margin:14px 0 8px">${l.name}${l.address ? html`. <a href="${mapLink(l.address)}" target="_blank" rel="noopener">Directions</a>` : ""}</p>
    ${mapEmbed(ext)}${edit}` };

  if (mapFloor >= mapFloors(m).length) mapFloor = 0;
  const items = mapItems(m), it = items.find((i) => i.id === mapPick), list = mapMatches(l, mapFind), today = it ? placeToday(l, it) : [];
  const hereId = mapHere?.loc === l.id ? mapHere.id : null;
  let route = null;
  if (mapRoute) { if (!items.some((i) => i.id === mapRoute.to)) mapRoute = null; else { if (!items.some((i) => i.id === mapRoute.from)) mapRoute.from = mapDefaultFrom(l, mapRoute.to, mapRoute.stepFree); route = mapRouteFind(m, mapRoute.from, mapRoute.to, mapRoute.stepFree); } }
  const routeFloors = route?.legs?.map((g) => g.floor) || [];
  const types = [...new Set(items.map((i) => i.type))].filter((t) => PLACE_TYPES[t] && t !== "hallway");
  const multi = mapFloors(m).length > 1, floorOf = (i) => multi ? `, ${mapFloors(m)[i.floor || 0]}` : "";
  return { title: "Campus map", back: "home", body: html`${head}
    <p class="muted" style="margin:14px 0 0">${l.name}${l.address ? html`. <a href="${mapLink(l.address)}" target="_blank" rel="noopener">Directions</a>` : ""}. Tap a place to see what it is and how to get there.</p>
    ${types.length > 2 ? html`<div class="chips map-legend" role="group" aria-label="Show on the map" style="margin-top:10px">${["", ...types].map((t) => html`<button class="chip" data-act="map-type" data-type="${t}" aria-pressed="${t === mapType}">${t ? html`<i class="map-dot" style="background:${PLACE_TYPES[t][1]}"></i>${PLACE_TYPES[t][0]}` : "Everything"}</button>`)}</div>` : ""}
    ${floorTabs(m, "map-floor", routeFloors.length > 1 ? routeFloors : [])}
    <div class="map-wrap"><div class="map-frame" data-zoom="${mapZoom}">${mapSvg(m, mapFloor, { picked: mapPick, route: route?.legs ? route : null, here: hereId, type: mapType, animate: mapAnimate })}</div>
      <div class="map-zoom" role="group" aria-label="Zoom"><button class="btn ghost sm" data-act="map-zoom" data-d="1" aria-label="Zoom in">${icon("plus")}</button>${mapZoom > 1 ? html`<button class="btn ghost sm" data-act="map-zoom" data-d="-1" aria-label="Zoom out">−</button><button class="btn ghost sm" data-act="map-zoom" data-d="0" aria-label="Fit the whole map">${icon("expand")}</button>` : ""}</div></div>
    ${mapRoute ? html`<section class="panel map-detail map-route-panel" aria-live="polite">
        <h2 style="margin:0 0 6px">Directions to ${placeName(items.find((i) => i.id === mapRoute.to))}</h2>
        <label class="field" style="margin-top:4px"><span>From</span><select data-change="map-from">${items.filter((i) => i.id !== mapRoute.to).sort((a, b) => placeName(a).localeCompare(placeName(b))).map((i) => html`<option value="${i.id}" ${attr(i.id === mapRoute.from, "selected")}>${placeName(i)}${floorOf(i)}${i.id === hereId ? " (you're here)" : ""}</option>`)}</select></label>
        <label class="check"><input type="checkbox" data-change="map-stepfree" ${attr(mapRoute.stepFree, "checked")}><span>Step-free route (no stairs or steps)</span></label>
        ${route?.legs ? html`<ol class="map-steps">${mapSteps(m, route, hereId).map((s) => html`<li>${s}</li>`)}</ol>
            ${routeFloors.length > 1 ? html`<div class="btns">${routeFloors.map((f, i) => html`<button class="btn ${f === mapFloor ? "" : "ghost"} sm" data-act="map-floor" data-floor="${f}" data-keep="1">${i ? "Then" : "First"}: ${mapFloors(m)[f]}</button>`)}</div>` : ""}`
          : html`<p style="margin:10px 0 0">There's no way there on this map${route?.needs ? ` without ${route.needs} on both floors` : mapRoute.stepFree ? " without stairs or steps" : ""}. Ask at the welcome desk and someone will walk you there.</p>`}
        <div class="btns"><button class="btn ghost sm" data-act="map-route-end">End directions</button></div></section>`
      : html`<div class="panel map-detail" role="status" aria-live="polite">${it ? html`
        ${it.photo ? html`<img class="map-photo" src="${it.photo}" alt="${placeName(it)}">` : ""}
        <h2 style="margin:0">${placeName(it)}</h2><p class="muted" style="margin:2px 0 0">${placeKind(it)[0]}${floorOf(it)}${it.steps ? ". Has steps" : ["entrance", "restroom", "elevator"].includes(it.type) ? ". Step-free" : ""}${it.staff ? html` <span class="tag">Staff only</span>` : ""}${it.id === hereId ? html` <span class="tag brand">You're here</span>` : ""}</p>
        ${it.note ? html`<p style="margin:8px 0 0">${it.note}</p>` : ""}${today.length ? html`<p style="margin:8px 0 0"><b>Today here:</b> ${today.join("; ")}</p>` : ""}
        <div class="btns" style="margin-top:12px">${items.length > 1 ? html`<button class="btn sm" data-act="map-route" data-id="${it.id}">${icon("pin")}Directions here</button>` : ""}
          ${it.link?.url && typeof safeLink === "function" && safeLink(it.link.url) ? html`<a class="btn ghost sm" href="${it.link.url}" ${attr(!it.link.url.startsWith("#"), 'target="_blank" rel="noopener"')}>${it.link.label || "Learn more"}</a>` : ""}
          ${it.id !== hereId ? html`<button class="btn ghost sm" data-act="map-here" data-id="${it.id}">I'm here</button>` : ""}
          <button class="btn ghost sm" data-act="copy" data-text="${appLink(`map-${l.id}~${it.id}`)}" data-done="Link copied">${icon("share")}Share</button></div>`
      : html`<p class="muted" style="margin:0">Looking for somewhere? Search below or tap it on the map, then tap Directions here.</p>`}</div>`}
    <section class="sec"><div class="sec-head"><h2>Find a place</h2></div>
      <label class="field"><span class="sr">Search places</span><input type="search" placeholder="Search: restrooms, nursery, coffee, youth group..." value="${mapFind}" data-input="map-find" autocomplete="off"></label>
      <div class="rows" id="map-list">${mapList(l, list)}</div></section>
    ${edit}`,
    after() { mapAnimate = false; mapWire(l, false); const f = $(".map-frame"), g = mapPick && f?.querySelector(`[data-place="${mapPick}"]`); if (g && mapZoom > 1) g.scrollIntoView?.({ block: "center", inline: "center" }); } };
}
const mapList = (l, list) => list.length ? list.slice(0, 60).map(({ i, why }) => html`<button class="row" data-act="map-pick" data-id="${i.id}"><span class="lead-ic"><i class="map-dot" style="background:${placeKind(i)[1]}"></i></span><span class="body"><span class="t">${placeName(i)}</span><span class="s">${why || html`${placeKind(i)[0]}${mapFloors(l.map).length > 1 ? `, ${mapFloors(l.map)[i.floor || 0]}` : ""}`}</span></span>${icon("chev")}</button>`) : html`<p class="muted" style="margin:0">No place matches that. Try another word, or ask at the welcome desk.</p>`;
Inputs["map-find"] = (el) => { mapFind = el.value; const l = mapCurrent(); if (!l) return; const box = $("#map-list"); if (box) box.innerHTML = flat(mapList(l, mapMatches(l, mapFind))); };
Actions["map-floor"] = (el) => { mapFloor = +el.dataset.floor; if (!el.dataset.keep) mapPick = null; else mapAnimate = true; render(); };
Actions["map-pick"] = (el) => { const l = mapLocations().find((x) => x.map.items.some((i) => i.id === el.dataset.id)); if (!l) return; mapPick = el.dataset.id; mapRoute = null; mapView = "built-in"; mapFloor = l.map.items.find((i) => i.id === mapPick).floor || 0; render(); $(".map-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
Actions["map-type"] = (el) => { mapType = el.dataset.type; const l = mapCurrent(); if (mapType && l && !mapItems(l.map).some((i) => i.type === mapType && (i.floor || 0) === mapFloor)) { const f = mapItems(l.map).find((i) => i.type === mapType); if (f) mapFloor = f.floor || 0; } render(); };
Actions["map-view"] = (el) => { mapView = el.dataset.id; render(); };
Actions["map-zoom"] = (el) => { const d = +el.dataset.d; mapZoom = d ? clamp(mapZoom + d * 0.75, 1, 3.25) : 1; render(); };
Actions["map-route"] = (el) => { const l = mapCurrent(); if (!l) return; const stepFree = !!mapRoute?.stepFree; mapRoute = { to: el.dataset.id, from: mapDefaultFrom(l, el.dataset.id, stepFree), stepFree }; mapPick = el.dataset.id;
  const r = mapRouteFind(l.map, mapRoute.from, mapRoute.to, stepFree); if (r?.legs) mapFloor = r.legs[0].floor; mapAnimate = true; render(); $(".map-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
Inputs["map-from"] = (el) => { if (!mapRoute) return; mapRoute.from = el.value; const l = mapCurrent(), r = l && mapRouteFind(l.map, mapRoute.from, mapRoute.to, mapRoute.stepFree); if (r?.legs) mapFloor = r.legs[0].floor; mapAnimate = true; render(); };
Inputs["map-stepfree"] = (el) => { if (!mapRoute) return; mapRoute.stepFree = el.checked; const l = mapCurrent(); if (l) { const from = l.map.items.find((i) => i.id === mapRoute.from); if (el.checked && from?.steps && from.type === "entrance") mapRoute.from = mapDefaultFrom(l, mapRoute.to, true); } mapAnimate = true; render(); };
Actions["map-route-end"] = () => { mapRoute = null; render(); };
Actions["map-here"] = (el) => { const l = mapCurrent(); if (!l) return; mapHere = { loc: l.id, id: el.dataset.id }; toast("Got it. Directions will start here."); render(); };

// ----- Maps made on other services, shown inside the app -----
const MAP_SERVICES = {
  mappedin: { name: "Mappedin", what: "Indoor 3D map with turn-by-turn directions, built from a floor plan", cost: "Free plan; paid plans add more", build: "https://app.mappedin.com/", hosts: ["mappedin.com"],
    steps: ["Sign up free and upload a floor plan (a photo or PDF works). Mappedin draws the walls, doors and rooms for you.", "Name your rooms, then open Preview, click Share and choose Copy Embed. Set the map to Live if it's still a draft.", "Paste the code below."] },
  mapme: { name: "Mapme", what: "Campus map with categories, filters, photos, videos and 3D buildings", cost: "Paid plans, with a free trial", build: "https://mapme.com/", hosts: ["mapme.com"],
    steps: ["Make a map and add a location for each building or area. Sort them into categories and add photos and buttons.", "In the editor, open Share, then Embed in a web page, and copy the embed code.", "Paste the code below."] },
  google: { name: "Google My Maps", what: "Outdoor map of parking, entrances and buildings on Google's map", cost: "Free with a Google account", build: "https://www.google.com/maps/d/", hosts: ["google.com"],
    steps: ["Create a map. Add pins and draw shapes for parking, doors, buildings and drop-off.", "Click Share and turn on \"Anyone with this link can view\".", "Open the menu (three dots), choose Embed on my site, copy the code and paste it below."] },
  mazemap: { name: "MazeMap", what: "Indoor and outdoor campus wayfinding", cost: "Paid; MazeMap sets your campus up with you", build: "https://www.mazemap.com/", hosts: ["mazemap.com"],
    steps: ["MazeMap builds your campus from your floor plans.", "On use.mazemap.com, set the view you want, click Share, then Embed map, and copy the code.", "Paste the code below."] },
  concept3d: { name: "Concept3D", what: "Branded campus map with 360° tours and directions", cost: "Paid", build: "https://concept3d.com/", hosts: ["concept3d.com"],
    steps: ["Concept3D builds your map with you.", "From your map, use Share to copy its link or embed code.", "Paste it below."] },
  situm: { name: "Situm", what: "Indoor positioning and step-by-step indoor directions", cost: "Paid", build: "https://situm.com/", hosts: ["situm.com", "situm.es"],
    steps: ["Situm maps your building and its points of interest.", "Copy your building's link from Situm's map viewer.", "Paste it below."] },
  felt: { name: "Felt", what: "Outdoor map with drawings, notes and photos", cost: "Embedding needs a paid Team plan", build: "https://felt.com/", hosts: ["felt.com"],
    steps: ["Make a map and draw your buildings, parking and paths.", "Click Share, then Embed, then Copy code.", "Paste the code below."] },
  arcgis: { name: "ArcGIS Online", what: "Detailed GIS map, if your church or county already uses Esri", cost: "Paid", build: "https://www.arcgis.com/", hosts: ["arcgis.com"],
    steps: ["Share the map with everyone (public).", "Click Embed map, choose iFrame embed, then Copy HTML.", "Paste the code below."] },
  tour: { name: "360° virtual tour", what: "A walk-through tour from Matterport, Kuula or Momento360, so people can look around before they come", cost: "Check each service's plans", build: "https://matterport.com/", hosts: ["matterport.com", "kuula.co", "momento360.com"],
    steps: ["Make the tour on Matterport, Kuula or Momento360.", "Use its Share or Embed button to copy the embed code.", "Paste the code below."] },
  other: { name: "Another service", what: "Any map or tour that gives you an embed code or https:// link", cost: "", build: "", hosts: null,
    steps: ["Find the Share or Embed button on the service and copy the embed code or link.", "Paste it below. Some services don't allow being shown inside other apps; if yours stays blank, people can still open it with the button under it."] },
};
const mapServiceOf = (url) => { try { const h = new URL(url).hostname.toLowerCase(); return Object.keys(MAP_SERVICES).find((k) => MAP_SERVICES[k].hosts?.some((x) => h === x || h.endsWith("." + x))) || "other"; } catch { return "other"; } };
/** Turns pasted embed code or a share link into the address to show, or says what's wrong with it. */
function mapServiceUrl(provider, text) {
  let s = String(text || "").trim(); const m = s.match(/<iframe[^>]*?\ssrc\s*=\s*["']([^"']+)["']/i); if (m) s = m[1].replace(/&amp;/g, "&");
  let u; try { u = new URL(s); } catch { return { error: "Paste the embed code, or a link that starts with https://" }; }
  if (u.protocol !== "https:") return { error: "Use a link that starts with https://" };
  const p = MAP_SERVICES[provider] || MAP_SERVICES.other, host = u.hostname.toLowerCase();
  if (p.hosts && !p.hosts.some((h) => host === h || host.endsWith("." + h))) return { error: `That isn't a ${p.name} link. Copy the embed code from ${p.name}, or choose Another service.` };
  if (provider === "google") { if (!/^\/maps\//.test(u.pathname)) return { error: "Use the embed code from Google My Maps (menu, Embed on my site)." }; const mid = u.searchParams.get("mid"); if (/^\/maps\/d\//.test(u.pathname) && mid && !/\/embed$/.test(u.pathname)) u = new URL(`https://www.google.com/maps/d/embed?mid=${encodeURIComponent(mid)}`); }
  if (provider === "felt") u.pathname = u.pathname.replace(/^\/map\//, "/embed/map/");
  if (provider === "mappedin" && /^\/map\//.test(u.pathname) && !u.searchParams.has("embedded")) u.searchParams.set("embedded", "true");
  return { url: u.href };
}
function mapEmbed(k) {
  const p = MAP_SERVICES[k.provider] || MAP_SERVICES.other;
  const open = html`<div class="btns" style="justify-content:center"><a class="btn ghost sm" href="${k.url}" target="_blank" rel="noopener">${icon("expand")}Open full screen</a></div>`;
  if (IN_PREVIEW) return html`<a class="embed-card" href="${k.url}" target="_blank" rel="noopener"><span class="lead-ic">${icon("globe")}</span><span class="body"><span class="t">${k.title}</span><span class="s">Opens ${p.name}. It shows inside the app once it's on your own website.</span></span>${icon("chev")}</a>`;
  return html`<iframe class="embed map-embed" src="${k.url}" title="${k.title}" loading="lazy" allow="fullscreen; geolocation; clipboard-write; web-share; xr-spatial-tracking; gyroscope; accelerometer; magnetometer" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"></iframe>${open}<p class="faint" style="text-align:center;margin-top:4px">Map by ${p.name}</p>`;
}

// ----- The builder -----
const mapEditing = () => S.visibleLocations().find((l) => l.id === mapEditLoc) || S.visibleLocations()[0];
function mapSave(l) { l.map.items = l.map.items.map((it) => ({ ...it, x: clamp(it.x, 0, MAP_W - it.w), y: clamp(it.y, 0, MAP_H - it.h) })); S.save(); }
AdminScreens.map = () => {
  const stop = guard("manage.locations"); if (stop) return stop;
  const l = mapEditing(); if (!l) return { title: "Campus map", back: "admin", body: html`<div class="panel" style="margin-top:16px"><p style="margin:0">Add a location first, under Campuses and locations.</p></div>` };
  l.map ||= { floors: ["Main floor"], items: [] }; l.map.items ||= []; const m = l.map, locs = S.visibleLocations();
  if (mapFloor >= mapFloors(m).length) mapFloor = 0;
  const it = m.items.find((i) => i.id === mapPick && (i.floor || 0) === mapFloor), unplaced = (l.rooms || []).filter((r) => !m.items.some((i) => String(i.name).toLowerCase() === r.toLowerCase()));
  const links = m.links || [], hasBg = !!m.backdrops?.[mapFloor];
  return { title: "Campus map", back: "admin", body: html`
    <p class="muted" style="margin-top:14px">Draw a simple layout so visitors can find their way. Add a place, drag it where it belongs, then set its size. Draw hallways and paths too: directions follow them. Visitors see it under Campus map on Home.</p>
    ${locs.length > 1 ? html`<label class="field"><span>Location</span><select data-change="map-loc">${locs.map((x) => html`<option value="${x.id}" ${attr(x.id === l.id, "selected")}>${x.name}</option>`)}</select></label>` : ""}
    <div class="map-floors">${floorTabs(m, "map-floor")}<div class="btns" style="margin:0"><button class="btn ghost sm" data-act="map-backdrop">${icon("image")}${hasBg ? "Floor plan underneath" : "Trace a floor plan"}</button><button class="btn ghost sm" data-act="map-floors">${mapFloors(m).length > 1 ? "Floors" : "Add a floor"}</button></div></div>
    <div class="map-frame">${mapSvg(m, mapFloor, { edit: true, picked: mapPick })}</div>
    ${it ? html`<form class="panel map-edit" data-form="map-place" novalidate><input type="hidden" name="id" value="${it.id}">
        <label class="field"><span>Name</span><input type="text" name="name" value="${it.name || ""}" maxlength="40" list="map-rooms"><datalist id="map-rooms">${(l.rooms || []).map((r) => html`<option value="${r}"></option>`)}</datalist><small>Use the same name as the room on events and classes, and visitors see what's on there today.</small></label>
        <label class="field"><span>Kind of place</span><select name="type">${Object.entries(PLACE_TYPES).map(([k, [n]]) => html`<option value="${k}" ${attr(k === it.type, "selected")}>${n}</option>`)}</select></label>
        <div class="map-size"><span>Width</span><button type="button" class="btn ghost sm" data-act="map-size" data-d="w-" aria-label="Narrower">−</button><b>${it.w}</b><button type="button" class="btn ghost sm" data-act="map-size" data-d="w+" aria-label="Wider">${icon("plus")}</button>
          <span>Height</span><button type="button" class="btn ghost sm" data-act="map-size" data-d="h-" aria-label="Shorter">−</button><b>${it.h}</b><button type="button" class="btn ghost sm" data-act="map-size" data-d="h+" aria-label="Taller">${icon("plus")}</button></div>
        <div class="map-size"><span>Move</span><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="x-" aria-label="Move left">←</button><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="x+" aria-label="Move right">→</button><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="y-" aria-label="Move up">↑</button><button type="button" class="btn ghost sm" data-act="map-nudge" data-d="y+" aria-label="Move down">↓</button><button type="button" class="btn ghost sm" data-act="map-copy">${icon("copy")}Copy</button></div>
        <label class="field"><span>Note for visitors (optional)</span><input type="text" name="note" value="${it.note || ""}" maxlength="140" placeholder="For example: check kids in here first"></label>
        <label class="field"><span>Also find it by (optional)</span><input type="text" name="keywords" value="${it.keywords || ""}" maxlength="140" placeholder="For example: diapers, changing table, nursing room"><small>Words people might search for that aren't in the name.</small></label>
        ${imageField("photo", "Photo (optional)", it.photo, "A photo of the door or room helps people know they've found it.", 900)}
        <div class="map-two"><label class="field"><span>Button (optional)</span><input type="text" name="linkLabel" value="${it.link?.label || ""}" maxlength="30" placeholder="Check kids in"></label>
          <label class="field"><span>Goes to</span><input type="text" name="linkUrl" value="${it.link?.url || ""}" maxlength="300" placeholder="#checkin or https://" list="map-screens"><datalist id="map-screens">${["#checkin", "#events", "#classes", "#groups", "#give", "#live", "#connect", "#visit", "#prayer"].map((s) => html`<option value="${s}"></option>`)}</datalist></label></div>
        <label class="check"><input type="checkbox" name="steps" ${attr(it.steps, "checked")}><span>Has steps (step-free directions go around it)</span></label>
        <label class="check"><input type="checkbox" name="staff" ${attr(it.staff, "checked")}><span>Staff only: hide it from members and visitors</span></label>
        <div class="btns"><button class="btn">Save place</button>${it.name && !it.staff ? html`<button type="button" class="btn ghost" data-act="qr-for" data-target="map-${l.id}~${it.id}~here" data-label="You are here: ${it.name}">${icon("qr")}"You are here" sign</button>` : ""}<button type="button" class="btn danger" data-act="map-remove" data-id="${it.id}">Remove</button></div></form>`
      : html`<div class="panel"><p style="margin-top:0"><b>Add a place</b></p><div class="chips" style="flex-wrap:wrap">${Object.entries(PLACE_TYPES).map(([k, [n, col]]) => html`<button class="chip" data-act="map-add" data-type="${k}"><i class="map-dot" style="background:${col}"></i>${n}</button>`)}</div>
        ${unplaced.length ? html`<p style="margin:14px 0 6px"><b>Rooms not on the map yet</b></p><div class="chips" style="flex-wrap:wrap">${unplaced.map((r) => html`<button class="chip" data-act="map-add" data-type="room" data-name="${r}">${icon("plus")}${r}</button>`)}</div>` : ""}
        <p class="faint" style="margin-bottom:0">Tap a place on the map to rename it, add a photo or a button, resize it or remove it. Print a "You are here" sign for any place, and directions start from wherever someone scans it.</p></div>`}
    <div class="btns" style="margin-top:12px">${mapOf(l) ? html`<a class="btn ghost" href="#map-${l.id}">See it as a visitor</a>` : ""}${m.items.length ? html`<button class="btn ghost" data-act="qr-for" data-target="map-${l.id}" data-label="Campus map: ${l.name}">${icon("qr")}QR code for the map</button>` : ""}</div>
    ${mapScreensSection(l)}
    <section class="sec"><div class="sec-head"><h2>Maps from other services</h2></div>
      <p class="muted">Want a 3D map, a map on Google's streets, or a 360° tour? Build it on another service and show it here, next to your own map or instead of it.</p>
      <div class="rows">${links.length ? links.map((k) => html`<button class="row" data-act="map-service" data-id="${k.id}"><span class="lead-ic">${icon("globe")}</span><span class="body"><span class="t">${k.title}</span><span class="s">${(MAP_SERVICES[k.provider] || MAP_SERVICES.other).name}${m.primary === k.id ? ", opens first" : ""}</span></span>${icon("edit")}</button>`) : empty("None yet.")}</div>
      <div class="btns">${links.length < 6 ? html`<button class="btn ghost" data-act="map-service">${icon("plus")}Add a map from another service</button>` : ""}</div></section>`,
    after() { mapWire(l, true); } };
};
Inputs["map-loc"] = (el) => { mapEditLoc = el.value; mapPick = null; mapFloor = 0; render(); };
Actions["map-add"] = (el) => {
  const l = mapEditing(), type = el.dataset.type, big = type === "worship" || type === "parking" || type === "outside", small = ["entrance", "exit", "stairs", "elevator"].includes(type);
  const w = big ? 10 : type === "hallway" ? 10 : small ? 4 : 6, h = big ? 7 : type === "hallway" ? 2 : small ? 2 : 4;
  // The first free spot, reading down the map.
  const taken = (x, y) => l.map.items.some((i) => (i.floor || 0) === mapFloor && x < i.x + i.w && x + w > i.x && y < i.y + i.h && y + h > i.y);
  let spot = { x: 1, y: 1 }; outer: for (let y = 1; y <= MAP_H - h; y++) for (let x = 1; x <= MAP_W - w; x++) if (!taken(x, y)) { spot = { x, y }; break outer; }
  const it = { id: uid(), type, name: el.dataset.name || (type === "room" ? "" : PLACE_TYPES[type][0]), note: "", floor: mapFloor, ...spot, w, h };
  l.map.items.push(it); mapPick = it.id; mapSave(l); render();
};
/** What the place form says right now, so resizing or moving doesn't lose typing. */
function mapRead(f, it) {
  const v = (n) => String(f.elements[n]?.value || "").trim();
  Object.assign(it, { name: v("name").slice(0, 40), type: PLACE_TYPES[v("type")] ? v("type") : "room", note: v("note").slice(0, 140), keywords: v("keywords").slice(0, 140), photo: v("photo"),
    link: v("linkUrl") ? { label: v("linkLabel").slice(0, 30), url: v("linkUrl").slice(0, 300) } : null, steps: !!f.elements.steps?.checked, staff: !!f.elements.staff?.checked });
  if (!it.photo) delete it.photo; if (!it.link) delete it.link; if (!it.steps) delete it.steps; if (!it.staff) delete it.staff;
}
Forms["map-place"] = (d, f) => { const l = mapEditing(), it = l.map.items.find((i) => i.id === d.id); if (!it) return;
  const url = String(d.linkUrl || "").trim(); if (url && !(/^#[\w~.-]*$/.test(url) || (isUrl(url) && /^https:/i.test(url)))) return formError(f, "The button should go to a screen in the app (like #checkin) or a web address that starts with https://");
  mapRead(f, it); mapPick = null; mapSave(l); toast("Place saved"); render(); };
const mapKeep = () => { const f = $("form.map-edit"), l = mapEditing(), it = l.map.items.find((i) => i.id === mapPick); if (f && it) mapRead(f, it); return [l, it]; };
Actions["map-size"] = (el) => { const [l, it] = mapKeep(); if (!it) return; const [k, s] = el.dataset.d.split(""); it[k] = clamp(it[k] + (s === "+" ? 1 : -1), 1, k === "w" ? MAP_W : MAP_H); mapSave(l); render(); };
Actions["map-nudge"] = (el) => { const [l, it] = mapKeep(); if (!it) return; const [k, s] = el.dataset.d.split(""); it[k] += s === "+" ? 1 : -1; mapSave(l); render(); };
Actions["map-copy"] = () => { const [l, it] = mapKeep(); if (!it) return; const c = { ...it, id: uid(), name: it.name ? `${it.name} copy` : "", x: it.x + 1, y: it.y + 1 }; l.map.items.push(c); mapPick = c.id; mapSave(l); render(); };
Actions["map-remove"] = (el) => { const l = mapEditing(); l.map.items = l.map.items.filter((i) => i.id !== el.dataset.id); mapPick = null; mapSave(l); render(); };
Actions["map-floors"] = () => { const m = mapEditing().map; openSheet("Floors", html`<form data-form="map-floors" novalidate><label class="field"><span>One floor per line, ground floor first</span><textarea name="floors" rows="4">${mapFloors(m).join("\n")}</textarea></label>
  <p class="faint">Removing a floor removes the places drawn on it. Put stairs or an elevator on each floor, in the same spot, so directions can go between them.</p><button class="btn block">Save floors</button></form>`); };
Forms["map-floors"] = (d, f) => { const l = mapEditing(), floors = String(d.floors || "").split("\n").map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 6); if (!floors.length) return formError(f, "Name at least one floor.");
  l.map.floors = floors; l.map.items = l.map.items.filter((i) => (i.floor || 0) < floors.length); if (l.map.backdrops) l.map.backdrops = l.map.backdrops.slice(0, floors.length);
  mapFloor = Math.min(mapFloor, floors.length - 1); mapSave(l); closeSheet(); render(); };
Actions["map-backdrop"] = () => { const m = mapEditing().map, fl = mapFloors(m)[mapFloor];
  openSheet("Floor plan underneath", html`<form data-form="map-backdrop" novalidate>
    <p class="muted" style="margin-top:0">Put a floor plan, site plan, fire escape map or aerial photo of ${fl} under the grid, then draw your places over it. A tall picture, about 4 wide by 5 tall, lines up best.</p>
    ${imageField("backdrop", "Picture", m.backdrops?.[mapFloor], "It's resized so the map still loads fast.", 1400)}
    <label class="range"><span>Fade it</span><input type="range" name="fade" min="0" max="85" value="${m.fade ?? 40}" data-input="map-fade"><output>${m.fade ?? 40}%</output></label>
    <label class="check"><input type="checkbox" name="show" ${attr(m.showBackdrop, "checked")}><span>Show it to visitors under the places</span></label>
    <button class="btn block">Save</button></form>`); };
Forms["map-backdrop"] = (d) => { const l = mapEditing(), m = l.map; m.backdrops ||= []; m.backdrops[mapFloor] = d.backdrop || ""; while (m.backdrops.length && !m.backdrops[m.backdrops.length - 1]) m.backdrops.pop();
  m.fade = clamp(+d.fade || 0, 0, 85); m.showBackdrop = !!d.show; S.save(); closeSheet(); render(); };

Inputs["map-fade"] = (el) => { const o = el.nextElementSibling; if (o) o.textContent = `${el.value}%`; };
Actions["map-service"] = (el) => {
  const m = mapEditing().map, k = (m.links || []).find((x) => x.id === el.dataset.id), provider = k?.provider || el.dataset.provider || "";
  if (!provider) return openSheet("Add a map from another service", html`<p class="muted" style="margin-top:0">Pick where you'll build it. You'll make the map there, then paste its embed code here.</p>
    <div class="rows">${Object.entries(MAP_SERVICES).map(([key, p]) => html`<button class="row" data-act="map-service" data-provider="${key}"><span class="body"><span class="t">${p.name}</span><span class="s">${p.what}${p.cost ? `. ${p.cost}` : ""}</span></span>${icon("chev")}</button>`)}</div>`);
  const p = MAP_SERVICES[provider];
  openSheet(k ? `Edit ${k.title}` : `Add a ${p.name} map`, html`<form data-form="map-service" novalidate><input type="hidden" name="id" value="${k?.id || ""}"><input type="hidden" name="provider" value="${provider}">
    <p class="muted" style="margin-top:0">${p.what}.${p.cost ? ` ${p.cost}.` : ""}</p>
    <ol class="map-steps">${p.steps.map((s) => html`<li>${s}</li>`)}</ol>
    ${p.build ? html`<div class="btns"><a class="btn ghost sm" href="${p.build}" target="_blank" rel="noopener">${icon("globe")}Open ${p.name}</a></div>` : ""}
    <label class="field"><span>Embed code or link</span><textarea name="code" rows="3" placeholder="<iframe src=&quot;https://...&quot;></iframe>" required>${k?.url || ""}</textarea></label>
    <label class="field"><span>Name on the tab</span><input type="text" name="title" value="${k?.title || (provider === "tour" ? "Virtual tour" : provider === "google" ? "Parking and outside" : "3D map")}" maxlength="24" required></label>
    <label class="check"><input type="checkbox" name="primary" ${attr(k ? m.primary === k.id : !m.items?.length, "checked")}><span>Open this one first</span></label>
    <div class="btns"><button class="btn">Save</button>${k ? html`<a class="btn ghost" href="${k.url}" target="_blank" rel="noopener">Open</a><button type="button" class="btn danger" data-act="map-service-delete" data-id="${k.id}">Remove</button>` : ""}</div></form>`);
};
Forms["map-service"] = (d, f) => {
  const l = mapEditing(), m = l.map; let provider = MAP_SERVICES[d.provider] ? d.provider : "other";
  if (provider === "other") { const guess = mapServiceUrl("other", d.code); if (guess.url) provider = mapServiceOf(guess.url); }
  const r = mapServiceUrl(provider, d.code); if (r.error) return formError(f, r.error);
  const title = String(d.title || "").trim().slice(0, 24) || MAP_SERVICES[provider].name;
  m.links ||= []; let k = m.links.find((x) => x.id === d.id);
  if (k) Object.assign(k, { provider, url: r.url, title }); else { if (m.links.length >= 6) return formError(f, "A location can show up to six maps from other services."); k = { id: uid(), provider, url: r.url, title }; m.links.push(k); }
  if (d.primary) m.primary = k.id; else if (m.primary === k.id) m.primary = "built-in";
  S.save(); closeSheet(); toast("Map added"); render();
};
Actions["map-service-delete"] = (el) => { const m = mapEditing().map; m.links = (m.links || []).filter((x) => x.id !== el.dataset.id); if (m.primary === el.dataset.id) delete m.primary; S.save(); closeSheet(); render(); };

/** Taps and (in the builder) dragging. */
function mapWire(l, edit) {
  const svg = $("svg.campus-map"); if (!svg) return;
  const pick = (id) => { if (edit) mapKeep(); else mapRoute = null; mapPick = mapPick === id && !edit ? null : id; render(); };
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
