// ---------- Landing page: blocks the church arranges, shown publicly and on Home ----------

const BLOCK_TYPES = {
  hero: { label: "Banner", icon: "image", fields: [["image", "Background image", "image"], ["title", "Headline"], ["text", "Subheading"], ["buttonLabel", "Button label"], ["buttonUrl", "Button link", "link"]] },
  text: { label: "Information", icon: "note", fields: [["title", "Heading"], ["text", "Text", "textarea"]] },
  image: { label: "Graphic or photo", icon: "image", fields: [["image", "Image", "image"], ["caption", "Caption"], ["url", "Link when tapped (optional)", "link"]] },
  links: { label: "Buttons and links", icon: "link", fields: [["title", "Heading (optional)"], ["links", "Links", "links"]] },
  video: { label: "Video", icon: "play", fields: [["title", "Title"], ["url", "YouTube, Vimeo or video file link", "url"]] },
  embed: { label: "Embedded page", icon: "globe", fields: [["title", "Title"], ["url", "Page address", "url"], ["height", "Height in pixels", "number"]] },
  events: { label: "Upcoming events", icon: "calendar", fields: [["title", "Heading"], ["count", "How many", "number"]] },
  classes: { label: "Classes and groups", icon: "door", fields: [["title", "Heading"]] },
  sermon: { label: "Latest sermon", icon: "word", fields: [] },
  contact: { label: "Service times and directions", icon: "pin", fields: [] },
  social: { label: "Website and social links", icon: "share", fields: [] },
  give: { label: "Giving", icon: "give", fields: [["title", "Heading"], ["text", "Text", "textarea"]] },
};

function landingBlocks(c, { home = false } = {}) {
  const viewingOther = c.id !== S.state.current;
  return c.landing.blocks.map((b) => {
    switch (b.type) {
      case "hero": return html`<section class="hero" ${b.image ? raw(`style="background-image:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.55)),url('${esc(b.image)}')"`) : ""}>
        ${b.title ? html`<h2>${b.title}</h2>` : ""}${b.text ? html`<p>${b.text}</p>` : ""}${b.buttonLabel && b.buttonUrl ? ext(b.buttonUrl, b.buttonLabel, "btn") : ""}</section>`;
      case "text": return html`<section class="block">${b.title ? html`<h2>${b.title}</h2>` : ""}<p class="pre">${b.text}</p></section>`;
      case "image": { const img = b.image ? html`<img src="${b.image}" alt="${b.caption || ""}">` : ""; return img ? html`<figure class="block img-block">${b.url ? html`<a href="${b.url}" ${attr(!b.url.startsWith("#"), 'target="_blank" rel="noopener"')}>${img}</a>` : img}${b.caption ? html`<figcaption class="faint">${b.caption}</figcaption>` : ""}</figure>` : ""; }
      case "links": return html`<section class="block">${b.title ? html`<h2>${b.title}</h2>` : ""}<div class="btns stack">${(b.links || []).map((l, i) => ext(l.url, l.label, i === 0 ? "btn block" : "btn ghost block"))}</div></section>`;
      case "video": return html`<section class="block">${b.title ? html`<h2>${b.title}</h2>` : ""}${embedView(b.url, b.title, { video: true })}</section>`;
      case "embed": return html`<section class="block">${b.title ? html`<h2>${b.title}</h2>` : ""}${embedView(b.url, b.title, { height: +b.height || 420 })}</section>`;
      case "events": { if (viewingOther || !S.on("events")) return ""; const list = upcomingEvents().slice(0, +b.count || 3); return list.length ? html`<section class="block"><h2>${b.title || "Coming up"}</h2><div class="rows">${list.map(eventRow)}</div></section>` : ""; }
      case "classes": { if (viewingOther) return ""; const list = S.visible("gatherings").filter((g) => g.registration !== "none" || g.type === "class").slice(0, 4); return list.length ? html`<section class="block"><h2>${b.title || "Classes and groups"}</h2><div class="rows">${list.map(gatheringRow)}</div></section>` : ""; }
      case "sermon": { if (viewingOther || home) return ""; const s = sermonsSorted()[0]; return s ? html`<section class="block"><h2>Latest message</h2><div class="rows">${sermonRow(s)}</div></section>` : ""; }
      case "contact": return home ? "" : html`<section class="block"><h2>Visit us</h2><div class="meta">${icon("clock")}<span>${servicesSummary(c)}</span>
        ${c.locations.filter((l) => l.visibility !== "private" && l.address).map((l) => html`${icon("pin")}<span><b>${l.name}</b><br><a href="${mapLink(l.address)}" target="_blank" rel="noopener">${l.address}</a></span>`)}
        ${c.phone ? html`${icon("phone")}<span>${c.phone}</span>` : ""}${c.email ? html`${icon("mail")}<span>${c.email}</span>` : ""}</div></section>`;
      case "social": { const links = churchLinks(c); return links.length && !home ? html`<section class="block"><h2>Find us online</h2><div class="chips" style="flex-wrap:wrap">${links.map(([label, url]) => html`<a class="chip" href="${url}" target="_blank" rel="noopener">${label}</a>`)}</div></section>` : ""; }
      case "give": return html`<section class="block panel"><h2>${b.title || "Give"}</h2>${b.text ? html`<p>${b.text}</p>` : ""}<a class="btn" href="#give">${icon("give")}Give online</a></section>`;
      default: return "";
    }
  });
}

// The public page (#page-churchId): anyone with the link or QR code can see it.
Screens.page = (id) => {
  const c = S.church(id || S.state.current);
  if (!c) return { redirect: "churches" };
  return {
    page: html`<div class="public-page" style="--brand:${c.color};--on-brand:${onColor(c.color)}">
      <header class="home-top"><div class="wrap">
        <div class="home-bar"><span class="switcher">${churchMark(c, 40)}<span><strong>${c.name}</strong><small>${churchCity(c)}</small></span></span>
          ${S.isMember(c.id) ? html`<a class="btn sm" href="#home">Open app</a>` : html`<button class="btn sm" data-act="join-church" data-id="${c.id}">Join</button>`}</div>
        ${bannerHtml(c)}
        ${c.tagline ? html`<p class="lead" style="margin:14px 2px 0">${c.tagline}</p>` : ""}
      </div></header>
      <main class="view landing">${c.landing.blocks.length ? landingBlocks(c) : html`<section class="block"><p class="muted">${c.name} hasn't built its page yet.</p></section>`}
        <p class="faint" style="text-align:center;margin-top:30px">${c.name} on ${PLATFORM.name}</p></main></div>`,
  };
};

AdminScreens.page = () => {
  const blocked = guard("manage.page"); if (blocked) return blocked;
  const c = S.church(), blocks = c.landing.blocks;
  return {
    title: "Landing page", back: "admin",
    body: html`<p class="muted" style="margin-top:16px">Build the page visitors see when they find ${c.name} or scan your QR code. Add your own graphics, logos, links and information.</p>
      <label class="check panel" style="padding:12px 16px"><input type="checkbox" data-change="landing-home" ${attr(c.landing.showOnHome, "checked")}><span><b>Also show these blocks on members' Home screen</b><br><span class="faint">Service times, sermon and contact blocks stay on the public page only, since Home already has them.</span></span></label>
      <div class="btns"><a class="btn ghost sm" href="#page-${c.id}">${icon("eye")}Preview page</a>${S.can("qr.create") ? html`<button class="btn ghost sm" data-act="qr-for" data-target="page-${c.id}" data-label="${c.name}">${icon("qr")}QR code</button>` : ""}<a class="btn ghost sm" href="#admin-account">${icon("image")}Logo and links</a></div>
      <section class="sec"><h2 class="sec-head">Blocks, top to bottom</h2>
      <div class="rows">${blocks.length ? blocks.map((b, i) => html`<div class="row"><span class="lead-ic">${icon(BLOCK_TYPES[b.type]?.icon || "note")}</span>
        <span class="body"><span class="t">${BLOCK_TYPES[b.type]?.label || b.type}</span><span class="s">${b.title || b.caption || b.text?.slice(0, 50) || b.url || ""}</span></span>
        <span class="row-tools"><button class="icon-btn" data-act="block-move" data-i="${i}" data-dir="-1" aria-label="Move up" ${attr(i === 0, "disabled")}>${icon("up")}</button><button class="icon-btn" data-act="block-move" data-i="${i}" data-dir="1" aria-label="Move down" ${attr(i === blocks.length - 1, "disabled")}>${icon("down")}</button>
        <button class="icon-btn" data-act="block-edit" data-i="${i}" aria-label="Edit">${icon("edit")}</button></span></div>`) : empty("No blocks yet. Add a banner to start.")}</div>
      <div class="btns"><button class="btn" data-act="block-add">${icon("plus")}Add a block</button></div></section>`,
  };
};
Inputs["landing-home"] = (el) => { S.church().landing.showOnHome = el.checked; S.save(); toast(el.checked ? "Shown on Home" : "Public page only"); };
Actions["block-add"] = () => openSheet("Add a block", html`<div class="rows">${Object.entries(BLOCK_TYPES).map(([k, t]) => html`<button class="row" data-act="block-new" data-type="${k}"><span class="lead-ic">${icon(t.icon)}</span><span class="body"><span class="t">${t.label}</span></span>${icon("plus")}</button>`)}</div>`);
Actions["block-new"] = (el) => {
  const t = BLOCK_TYPES[el.dataset.type];
  if (!t.fields.length) { S.church().landing.blocks.push({ id: uid(), type: el.dataset.type }); S.save(); closeSheet(); render(); return; }
  blockForm({ type: el.dataset.type }, -1);
};
Actions["block-edit"] = (el) => blockForm(S.church().landing.blocks[+el.dataset.i], +el.dataset.i);
function blockForm(b, i) {
  const t = BLOCK_TYPES[b.type];
  openSheet(`${i < 0 ? "Add" : "Edit"}: ${t.label}`, html`<form data-form="block-save" novalidate><input type="hidden" name="_i" value="${i}"><input type="hidden" name="_type" value="${b.type}">
    ${t.fields.map(([name, label, type]) => type === "image" ? imageField(name, label, b[name], "Pictures are resized so they load fast.", 1600)
      : type === "textarea" ? html`<label class="field"><span>${label}</span><textarea name="${name}" maxlength="2000">${b[name] || ""}</textarea></label>`
      : type === "links" ? html`<label class="field"><span>${label}</span><textarea name="${name}" placeholder="Plan your visit | https://yourchurch.org/visit&#10;Give | #give">${(b.links || []).map((l) => `${l.label} | ${l.url}`).join("\n")}</textarea><small>One per line: label | link. Links can be web addresses or app screens like #give, #events or #classes.</small></label>`
      : html`<label class="field"><span>${label}</span><input type="${type === "number" ? "number" : "text"}" name="${name}" value="${b[name] ?? ""}" ${attr(type === "url" || type === "link", 'inputmode="url"')}>${type === "link" ? html`<small>A web address, or an app screen like #give or #events.</small>` : ""}</label>`)}
    <div class="btns"><button class="btn">${i < 0 ? "Add block" : "Save block"}</button>${i >= 0 ? html`<button type="button" class="btn danger" data-act="block-delete" data-i="${i}">Delete</button>` : ""}</div></form>`, { wide: true });
}
const okLink = (s) => !s || isUrl(s) || /^#[a-z0-9-]+$/i.test(s);
Forms["block-save"] = (d, f) => {
  const t = BLOCK_TYPES[d._type], b = { id: uid(), type: d._type };
  for (const [name, label, type] of t.fields) {
    if (type === "links") {
      b.links = (d.links || "").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0] && p[1]).map(([label, url]) => ({ label, url }));
      const bad = b.links.find((l) => !okLink(l.url)); if (bad) return formError(f, `"${bad.url}" isn't a web address (https://...) or an app screen (#give).`);
    } else b[name] = d[name];
    if ((type === "url") && d[name] && !isUrl(d[name])) return formError(f, `${label} should start with https://`);
    if (type === "link" && !okLink(d[name])) return formError(f, `${label} should be a web address (https://...) or an app screen (#give).`);
  }
  if (d._type === "image" && !b.image) return formError(f, "Choose an image.");
  const list = S.church().landing.blocks, i = +d._i;
  if (i >= 0) list[i] = { ...list[i], ...b, id: list[i].id }; else list.push(b);
  S.save(); closeSheet(); toast("Saved"); render();
};
Actions["block-delete"] = (el) => { S.church().landing.blocks.splice(+el.dataset.i, 1); S.save(); closeSheet(); render(); };
Actions["block-move"] = (el) => {
  const list = S.church().landing.blocks, i = +el.dataset.i, j = i + +el.dataset.dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; S.save(); render();
};

// ---------- Embedded pages (added under Webhooks and embeds) ----------
Screens.embed = (id) => {
  const e = (S.church()?.integrations?.embeds || []).find((x) => x.id === id);
  if (!e) return { redirect: "me" };
  return { title: e.title, back: "me", body: html`<div style="margin-top:14px">${embedView(e.url, e.title, { height: Math.max(300, window.innerHeight - 200) })}</div>` };
};
