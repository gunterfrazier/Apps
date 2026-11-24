// ---------- Church web addresses ----------
// A church's landing page at ourfaithfulchurch.com/<church ID> (and <church ID>.ourfaithfulchurch.com once subdomains
// are switched on). The church ID is the address, so it's checked like one: 3 to 30 letters, numbers and hyphens, not one
// of the app's own names. When a church changes it, the old address keeps working (c.oldHandles).

/** "ourfaithfulchurch.com/riverside" or "riverside.ourfaithfulchurch.com": the address as people say and type it. */
const churchAddress = (c, handle = c.handle) => PLATFORM.churchSubdomains ? `${handle}.${SITE_DOMAIN}` : `${SITE_DOMAIN}/${handle}`;
const churchUrl = (c, handle = c.handle) => `https://${churchAddress(c, handle)}`;
/** The shorter address, when the platform has a short domain set up (config.js: shortDomain). */
const churchShortAddress = (c) => PLATFORM.shortDomain ? `${PLATFORM.shortDomain}/${c.handle}` : "";
/** The church's website: its own, or its landing page when it doesn't have one. */
const churchWebsite = (c) => (isUrl(c.website) ? c.website : churchUrl(c));

/** What's wrong with a church ID as a web address, or "" when it's fine. */
function handleProblem(h, churchId = "") {
  if (!h) return "Choose a web address for your church.";
  if (h.length < 3) return "The web address needs at least 3 letters or numbers.";
  if (h.length > 30) return "Keep the web address to 30 characters or fewer.";
  if (!SITE_HANDLE_RE.test(h)) return "Use lowercase letters, numbers and hyphens, and start and end with a letter or number.";
  if (RESERVED_HANDLES.has(h)) return `"${h}" is kept for ${PLATFORM.name} itself. Try your church's name with its city, like ${h}-springfield.`;
  if (S.churches().some((c) => c.id !== churchId && c.handle === h)) return `${churchAddress(null, h)} is taken. Try adding your city, like ${h}-springfield.`;
  return "";
}
/** On a live site, ask the server too: another church may have the name without this device knowing about it. */
async function handleTakenOnline(h, churchId = "") {
  if (!Backend.on || !Backend.client) return false;
  try {
    const { data } = await Backend.client.from("churches").select("id").eq("handle", h).limit(1).maybeSingle();
    return !!data && data.id !== churchId;
  } catch { return false; }
}
/** For the church ID field: suggest a usable address from a church name. */
const suggestHandle = (name) => {
  let h = slugify(name).slice(0, 30).replace(/-+$/, "");
  if (h && h.length < 3) h = `${h}-church`;
  return RESERVED_HANDLES.has(h) ? `${h}-church` : h;
};

/** The church at a church ID, current or old. */
const churchByHandle = (h) => {
  const all = Object.values(S.state.churches);
  return all.find((c) => c.handle === h) || all.find((c) => (c.oldHandles || []).includes(h)) || null;
};
let siteLookup = { handle: "", state: "" };
async function findChurchByHandle(h) {
  const sb = Backend.client; if (!sb) return null;
  let { data } = await sb.from("churches").select("id").eq("handle", h).limit(1).maybeSingle();
  if (!data) ({ data } = await sb.from("churches").select("id").contains("data", { oldHandles: [h] }).limit(1).maybeSingle());
  if (!data) return null;
  if (Backend.user) await Backend.pull(data.id); else await Backend.pullPublicChurch(data.id);
  return S.church(data.id);
}

Screens.site = (handle = "") => {
  handle = handle.toLowerCase();
  const c = churchByHandle(handle);
  if (c) {
    document.title = c.name;
    // An old address: show the page at the church's address now, so it's what people copy and share.
    if (c.handle !== handle && CHURCH_SITE && !CHURCH_SITE.subdomain && location.pathname.slice(1).toLowerCase() === handle) history.replaceState(null, "", `/${c.handle}${location.search}`);
    return Screens.page(c.id);
  }
  const waiting = Backend.on && (siteLookup.handle !== handle || siteLookup.state === "loading" || (Backend.user && !Backend.ready));
  if (Backend.on && siteLookup.handle !== handle && !(Backend.user && !Backend.ready)) {
    siteLookup = { handle, state: "loading" };
    findChurchByHandle(handle).then((found) => { siteLookup.state = found ? "found" : "missing"; }).catch(() => { siteLookup.state = "missing"; }).finally(render);
  }
  if (waiting) return { page: html`<div class="loading" role="status"><span class="ai-dot"></span>Opening the church's page...</div>` };
  document.title = PLATFORM.name;
  return {
    page: html`<div class="welcome"><div class="wrap">${brandWord()}<div class="panel site-missing"><h1 style="font-size:1.4rem;margin-top:0">There's no church at this address</h1>
      <p class="muted">Nothing is at <b>${churchAddress(null, handle)}</b> yet. Check the spelling, or look the church up by name.</p>
      <div class="btns"><a class="btn" href="${APP_HOME}#churches">${icon("search")}Find a church</a><a class="btn ghost" href="${APP_HOME}#start">Register your church</a></div></div></div></div>`,
  };
};

/** The web address panel on the landing page builder and in Account details. */
function webAddressPanel(c, { compact = false } = {}) {
  const url = churchUrl(c), short = churchShortAddress(c), own = isUrl(c.website);
  return html`<section class="sec web-address"><h2 class="sec-head">Your church's web address</h2>
    <div class="panel">
      <a class="web-address-url" href="${url}" target="_blank" rel="noopener">${icon("globe")}<span>${churchAddress(c)}</span></a>
      ${short ? html`<p class="faint" style="margin:4px 0 0">Short version: <b>${short}</b></p>` : ""}
      <p class="faint" style="margin:8px 0 0">${own
        ? html`Opens your landing page. Your website, ${new URL(c.website).hostname.replace(/^www\./, "")}, stays where it is: use this address on signs, bulletins and NFC tags that should open the app's page.`
        : html`<b>Don't have a church website? We can help.</b> This is your church's website: it opens your landing page, and you build it right here. Put it on signs, bulletins, social media and NFC tags.`}</p>
      <div class="btns"><button type="button" class="btn ghost sm" data-act="copy" data-text="${url}" data-done="Web address copied">${icon("copy")}Copy</button>
        ${S.can("qr.create") ? html`<button type="button" class="btn ghost sm" data-act="qr-for" data-url="${url}" data-label="${c.name}">${icon("qr")}QR code</button>` : ""}
        ${compact ? html`<a class="btn ghost sm" href="#admin-page">${icon("edit")}Build the page</a>` : ""}
        ${S.can("manage.church") && !compact ? html`<a class="btn ghost sm" href="#admin-account">${icon("edit")}Change the address</a>` : ""}</div>
      ${!Backend.on ? html`<p class="faint" style="margin:8px 0 0">${SANDBOX ? `In ${practicePlace()} this address is an example.` : "The address works once the app is on its own website."}</p>` : ""}
    </div></section>`;
}

/** Shows the address a church ID makes, as it's typed. */
Inputs["handle-preview"] = (el) => {
  const out = $("[data-handle-preview]", el.form); if (!out) return;
  const h = slugify(el.value).slice(0, 30), problem = h ? handleProblem(h, el.dataset.church || "") : "";
  out.textContent = h ? (problem || `Your web address: ${churchAddress(null, h)}`) : `Your web address: ${churchAddress(null, "your-church")}`;
  out.classList.toggle("warn-text", !!problem);
};
