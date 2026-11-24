// ---------- NFC tags ----------
// A tag (a sticker, card or disc with an NFC chip) opens a link when a phone touches it. Each tag holds a short tag link,
// ourfaithfulchurch.com/t/<code>, that the church can point somewhere else any time without rewriting the tag, and that
// counts its taps. This screen (Ministry tools, NFC tags) makes the tag links, writes them onto tags from an Android phone
// (Web NFC, in Chrome and the Play Store app), keeps a library of links to copy, and prepares orders of printed tags from
// the approved suppliers below.
//
// Saved as "tagLinks" records. On the live app, opening a tag link goes through the tag_open() database function, which
// finds the link for anyone (signed in or not) and counts the tap in tag_taps (supabase/upgrade-24.sql).

if (typeof RECORD_KINDS !== "undefined" && !RECORD_KINDS.includes("tagLinks")) RECORD_KINDS.push("tagLinks");
// A server that hasn't had upgrade-24.sql yet turns tag links away; say nothing about it on every save.
if (typeof QUIET_KINDS !== "undefined" && !QUIET_KINDS.includes("tagLinks")) QUIET_KINDS.push("tagLinks");
{
  const prevLoad = S.load.bind(S);
  S.load = function () { prevLoad(); this.state.tagLinks ||= []; };
  if (S.state) S.state.tagLinks ||= [];
}

// ---------- Approved suppliers ----------
// The platform's list of tag suppliers churches can order from. Add a supplier here once it's been checked: what it sells,
// its minimum order, its starting price, how long it takes, and what it needs from the church. ordering is how the order
// is placed: "files" (the app prepares the files, the church orders on the supplier's site), "write" (blank tags the
// church writes itself with this app) or "api" (ordered inside the app; set api to the supplier's order endpoint).
// checked is when the details were last confirmed on the supplier's site.
const NFC_SUPPLIERS = [
  {
    id: "gototags", name: "GoToTags", product: "Printed NFC sticker (NTAG213)", url: "https://store.gototags.com/printed-nfc-sticker-ntag213",
    minQty: 50, startPrice: 1.25, lead: "About 1 week to print, plus shipping", ordering: "files", checked: "2026-11-24",
    about: "Full-color stickers on matte white synthetic paper with a permanent adhesive. They can arrive already written with your links (add their encoding service in the same quantity as the stickers).",
    // Price per tag by quantity, for the base sizes.
    tiers: [[50, 1.25], [100, 0.95], [250, 0.79], [500, 0.73], [1000, 0.58], [5000, 0.40], [10000, 0.35], [50000, 0.24]],
    sizes: [
      { id: "round-25", label: "Round, 25 mm (1 in)", shape: "round", mm: 25, add: 0 },
      { id: "square-38", label: "Square, 38 mm (1.5 in)", shape: "square", mm: 38, add: 0 },
      { id: "round-50", label: "Round, 50 mm (2 in)", shape: "round", mm: 50, add: 0.10 },
      { id: "square-50", label: "Square, 50 mm (2 in)", shape: "square", mm: 50, add: 0.10 },
      { id: "round-76", label: "Round, 76 mm (3 in)", shape: "round", mm: 76.2, add: 0.20 },
    ],
    needs: ["artwork", "encoding"],
    steps: ["Open the sticker on GoToTags and choose the size and quantity.", "Upload the artwork (SVG) for each design and the encoding file (CSV).",
      "Add their encoding service in the same quantity, so the stickers arrive with your links on them.", "Check out. They review the files before printing."],
  },
  {
    id: "blank", name: "Blank NFC stickers", product: "Any NTAG213 or NTAG215 sticker, card or disc", url: "",
    minQty: 1, startPrice: null, lead: "Whatever the store says", ordering: "write", checked: "",
    about: "Plain tags from any store. Write them yourself with this app on an Android phone, then label them or put them behind a sign.",
    sizes: [], needs: [], steps: ["Buy NTAG213 or NTAG215 tags (both work with every phone).", "Here, tap Write to tag next to a tag link and hold a tag to the back of the phone."],
  },
];
const nfcPrice = (s, qty, size) => {
  if (!s.tiers) return null;
  const tier = [...s.tiers].reverse().find(([q]) => qty >= q) || s.tiers[0];
  return tier[1] + (size?.add || 0);
};

// ---------- Tag links ----------
const TAG_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";   // nothing that's easy to misread (no l, 1, o, 0, i)
const newTagCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => TAG_CHARS[b % TAG_CHARS.length]).join("");
const TAG_CODE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
// At the website's root, not the app's /app/: ourfaithfulchurch.com/t/<code>. The website sends it on to the app.
const tagUrl = (t) => `${(IN_PREVIEW ? `https://${SITE_DOMAIN}/` : SITE_ROOT).replace(/\/$/, "")}/t/${t.code}`;
/** Where a tag link goes: a screen in the app (like give-riverside) or a web address. */
const tagTargetUrl = (t) => (isUrl(t.target) ? t.target : appLink(t.target));
const tagTargetLabel = (t) => {
  if (isUrl(t.target)) return t.target.replace(/^https?:\/\//, "");
  const hit = nfcLibrary().flatMap(([, list]) => list).find(([k]) => k === t.target);
  return hit ? hit[1] : `#${t.target}`;
};
const tagByCode = (code) => (S.state.tagLinks || []).find((t) => t.code === code) || null;

/** Every link a church might put on a tag: its web address, then everything the QR code maker offers. */
function nfcLibrary() {
  const c = S.church();
  return [["Your church", [[churchUrl(c), `${c.name} web address`], [`visit-${c.id}`, "Plan your visit"]]], ...qrTargetGroups()];
}

// Taps, from the server (live) or counted on this device (browser-only).
let tagTaps = { church: "", at: 0, byCode: {}, loading: false };
async function loadTagTaps(force) {
  const c = S.state.current;
  if (!Backend.on || !Backend.client || tagTaps.loading || (!force && tagTaps.church === c && Date.now() - tagTaps.at < 60_000)) return;
  tagTaps.loading = true;
  try {
    const { data, error } = await Backend.client.from("tag_taps").select("code,day,taps").eq("church_id", c);
    if (error) throw error;
    const week = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), byCode = {};
    for (const r of data || []) {
      const t = (byCode[r.code] ||= { total: 0, week: 0, last: "" });
      t.total += r.taps; if (r.day >= week) t.week += r.taps; if (r.day > t.last) t.last = r.day;
    }
    tagTaps = { church: c, at: Date.now(), byCode, loading: false };
    if (location.hash.startsWith("#nfc")) render();
  } catch { tagTaps.loading = false; tagTaps.at = Date.now(); tagTaps.church = c; }
}
const tapsFor = (t) => Backend.on ? (tagTaps.byCode[t.code] || { total: 0, week: 0, last: "" })
  : { total: t.taps || 0, week: (t.tapDays || []).filter((d) => d >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).length, last: t.lastTap || "" };

// ---------- Opening a tag link: ourfaithfulchurch.com/t/<code> arrives as #tag-<code> ----------
let tagOpening = { code: "", state: "", target: "" };
function goToTagTarget(target) {
  if (isUrl(target)) location.replace(target);
  else { location.replace(`#${target}`); }
}
Screens.tag = (code = "") => {
  code = code.toLowerCase();
  if (tagOpening.code !== code) {
    tagOpening = { code, state: "opening", target: "" };
    if (Backend.on && Backend.client) {
      Backend.client.rpc("tag_open", { tag: code }).then(({ data, error }) => {
        const target = !error && data?.target;
        tagOpening.state = target ? "found" : "missing";
        if (target) goToTagTarget(target); else render();
      }, () => { tagOpening.state = "missing"; render(); });
    } else {
      const t = tagByCode(code);
      if (t) {
        const day = new Date().toISOString().slice(0, 10);
        t.taps = (t.taps || 0) + 1; t.lastTap = day; t.tapDays = [...(t.tapDays || []), day].slice(-200); S.save();
        tagOpening.state = "found"; setTimeout(() => goToTagTarget(t.target), 0);
      } else tagOpening.state = "missing";
    }
  }
  if (tagOpening.state !== "missing") return { page: html`<div class="loading" role="status"><span class="ai-dot"></span>Opening...</div>` };
  return {
    page: html`<div class="welcome"><div class="wrap">${brandWord()}<div class="panel site-missing"><h1 style="font-size:1.4rem;margin-top:0">This tag isn't set up</h1>
      <p class="muted">The link on this tag isn't connected to anything right now. Let someone at the church know, or open ${PLATFORM.name}.</p>
      <div class="btns"><a class="btn" href="${APP_HOME}#churches">${icon("search")}Find a church</a></div></div></div></div>`,
  };
};

// ---------- The NFC tags screen ----------
let nfcTab = "tags", nfcDel = "";
const NFC_SUPPORTED = typeof window !== "undefined" && "NDEFReader" in window;
Screens.nfc = (tab = "") => {
  if (!S.isMember() || !S.can("qr.create")) return { redirect: "ministry" };
  nfcTab = ["tags", "library", "order"].includes(tab) ? tab : "tags";
  if (nfcTab === "tags") loadTagTaps();
  return {
    title: "NFC tags", back: "ministry",
    body: html`<p class="muted" style="margin-top:14px">A tag opens a link when a phone touches it. Put them on the giving table, the welcome desk, kids check-in and anywhere a QR code would go.</p>
      ${seg([["nfc", "Tag links"], ["nfc-library", "Link library"], ["nfc-order", "Order tags"]], nfcTab === "tags" ? "nfc" : `nfc-${nfcTab}`, { label: "NFC tags" })}
      ${nfcTab === "tags" ? nfcTagsTab() : nfcTab === "library" ? nfcLibraryTab() : nfcOrderTab()}`,
  };
};

function nfcTagsTab() {
  const list = S.list("tagLinks").sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  return html`<section class="sec">
    <div class="panel nfc-how"><p style="margin:0">Each tag holds a <b>tag link</b> like <b>${SITE_DOMAIN}/t/give</b>. Change where it goes here any time, and every tag with it follows, with no rewriting. Taps are counted.</p>
      <p class="faint" style="margin:8px 0 0">${NFC_SUPPORTED ? "This phone can write tags: tap Write to tag and hold a tag to the back of the phone." : "Write tags from an Android phone (Chrome or the Our Faithful app). On an iPhone or a computer, copy the link into an NFC writing app, or order printed tags that arrive already written."}</p></div>
    <div class="btns" style="margin:12px 0"><button class="btn" data-act="nfc-new">${icon("plus")}New tag link</button>
      ${NFC_SUPPORTED ? html`<button class="btn ghost" data-act="nfc-check">${icon("scan")}Check a tag</button>` : ""}</div>
    ${list.length ? html`<div class="nfc-list">${list.map(nfcTagRow)}</div>`
      : html`<div class="empty panel"><p style="margin:0">No tag links yet. Start with one for giving or the welcome desk, or pick from the <a href="#nfc-library">link library</a>.</p></div>`}
  </section>`;
}
function nfcTagRow(t) {
  const taps = tapsFor(t), url = tagUrl(t);
  return html`<div class="panel nfc-row" data-tag="${t.code}">
    <div class="nfc-row-head"><span class="nfc-ic">${icon("nfc")}</span><div style="min-width:0;flex:1"><b>${t.label || "Tag link"}</b>
      <div class="faint nfc-url">${url.replace(/^https?:\/\//, "")}</div>
      <div class="muted" style="font-size:.9rem">Opens: ${tagTargetLabel(t)}${t.paused ? html` <span class="badge">Paused</span>` : ""}</div></div>
      <div class="nfc-taps" title="Taps"><b>${taps.total}</b><span>${taps.total === 1 ? "tap" : "taps"}</span>${taps.week ? html`<small>${taps.week} this week</small>` : ""}</div></div>
    <div class="btns">
      <button class="btn sm" data-act="nfc-write" data-id="${t.id}">${icon("nfc")}Write to tag</button>
      <button class="btn ghost sm" data-act="copy" data-text="${url}" data-done="Tag link copied">${icon("copy")}Copy</button>
      <button class="btn ghost sm" data-act="qr-for" data-url="${url}" data-label="${t.label || ""}">${icon("qr")}QR</button>
      <button class="btn ghost sm" data-act="nfc-edit" data-id="${t.id}">${icon("edit")}Change</button>
      <button class="btn ghost sm ${nfcDel === t.id ? "danger" : ""}" data-act="nfc-delete" data-id="${t.id}">${icon("trash")}${nfcDel === t.id ? "Tap again to delete" : "Delete"}</button></div>
  </div>`;
}

function nfcLibraryTab() {
  return html`<section class="sec"><p class="muted" style="margin-top:0">Links you can put on a tag, a QR code, a bulletin or a social post. <b>Make a tag link</b> gives one a short link you can repoint later.</p>
    ${nfcLibrary().map(([group, list]) => html`<h2 class="sec-head" style="margin-top:18px">${group}</h2><div class="panel nfc-lib">${list.map(([k, label]) => {
      const url = isUrl(k) ? k : appLink(k);
      return html`<div class="nfc-lib-row"><div style="min-width:0;flex:1"><b>${label}</b><div class="faint nfc-url">${url.replace(/^https?:\/\//, "")}</div></div>
        <div class="btns" style="margin:0;flex:none"><button class="btn ghost sm" data-act="copy" data-text="${url}" data-done="Link copied" aria-label="Copy ${label}">${icon("copy")}</button>
          <button class="btn ghost sm" data-act="nfc-new" data-target="${k}" data-label="${label}">${icon("plus")}Tag link</button></div></div>`;
    })}</div>`)}
  </section>`;
}

// New or changed tag link.
function nfcForm(t = {}) {
  const groups = nfcLibrary(), all = groups.flatMap(([, l]) => l);
  const target = t.target || all[0][0], custom = t.target && !all.some(([k]) => k === t.target);
  return html`<form data-form="nfc-save" novalidate><input type="hidden" name="id" value="${t.id || ""}">
    <label class="field" style="margin-top:0"><span>Name</span><input type="text" name="label" value="${t.label || ""}" maxlength="60" placeholder="Giving table, lobby" required><small>For you; people tapping the tag don't see it.</small></label>
    <label class="field"><span>Opens</span><select name="target" data-change="nfc-target">${groups.map(([g, list]) => html`<optgroup label="${g}">${list.map(([k, l]) => html`<option value="${k}" ${attr(k === target && !custom, "selected")}>${l}</option>`)}</optgroup>`)}
      <option value="custom" ${attr(custom, "selected")}>A web address</option></select></label>
    <label class="field nfc-custom" ${attr(!custom, "hidden")}><span>Web address</span><input type="url" name="custom" value="${custom ? t.target : ""}" placeholder="https://"></label>
    <label class="field"><span>Tag link</span><div class="nfc-code"><span class="faint">${SITE_DOMAIN}/t/</span><input type="text" name="code" value="${t.code || newTagCode()}" maxlength="30" autocapitalize="none" spellcheck="false"></div>
      <small>${t.id ? "Changing this breaks tags already written with it. Change where it opens instead." : "Make it something short people can type, like give-riverside, or keep the random one."}</small></label>
    ${t.id ? html`<label class="check"><input type="checkbox" name="paused" ${attr(t.paused, "checked")}><span>Paused: tags with this link show "This tag isn't set up"</span></label>` : ""}
    <div class="btns"><button class="btn">${t.id ? "Save" : "Make tag link"}</button><button type="button" class="btn ghost" data-act="close-sheet">Cancel</button></div></form>`;
}
Actions["nfc-new"] = (el) => openSheet("New tag link", nfcForm({ target: el.dataset.target || "", label: el.dataset.label || "" }));
Actions["nfc-edit"] = (el) => { const t = S.get("tagLinks", el.dataset.id); if (t) openSheet("Change tag link", nfcForm(t)); };
Inputs["nfc-target"] = (el) => { const box = $(".nfc-custom", el.form); if (box) box.hidden = el.value !== "custom"; const l = $("input[name=label]", el.form); if (l && !l.value && el.value !== "custom") l.value = el.selectedOptions[0].textContent; };
async function tagCodeTaken(code, id) {
  if ((S.state.tagLinks || []).some((x) => x.code === code && x.id !== id)) return true;
  if (!Backend.on || !Backend.client) return false;
  try { const { data } = await Backend.client.rpc("tag_code_taken", { tag: code }); return !!data && !(S.get("tagLinks", id)?.code === code); } catch { return false; }
}
Forms["nfc-save"] = async (d, f) => {
  const target = d.target === "custom" ? (d.custom || "").trim() : d.target;
  if (d.target === "custom" && !isUrl(target)) return formError(f, "Enter a web address that starts with https://");
  const code = slugify(d.code || "").slice(0, 30);
  if (!TAG_CODE_RE.test(code)) return formError(f, "The tag link needs 3 to 30 lowercase letters, numbers or hyphens.");
  if (await tagCodeTaken(code, d.id)) return formError(f, `${SITE_DOMAIN}/t/${code} is taken. Try another.`);
  const rec = { label: (d.label || "").trim() || tagTargetLabel({ target }), target, code, paused: !!d.paused };
  if (d.id) { S.update("tagLinks", d.id, rec); toast("Tag link saved. Tags with it open the new place now."); }
  else { S.add("tagLinks", { ...rec, by: S.me().id, createdAt: new Date().toISOString(), taps: 0 }); toast("Tag link made. Write it to a tag, or order printed tags."); }
  closeSheet(true); go("nfc");
};
Actions["nfc-delete"] = (el) => {
  if (nfcDel !== el.dataset.id) { nfcDel = el.dataset.id; render(); setTimeout(() => { if (nfcDel === el.dataset.id) { nfcDel = ""; render(); } }, 4000); return; }
  nfcDel = ""; S.remove("tagLinks", el.dataset.id); toast("Tag link deleted. Tags with it now say they aren't set up."); render();
};

// ---------- Writing and checking tags (Web NFC: Chrome on Android) ----------
let nfcAbort = null;
const stopNfc = () => { try { nfcAbort?.abort(); } catch {} nfcAbort = null; };
Actions["nfc-write"] = (el) => {
  const t = S.get("tagLinks", el.dataset.id); if (!t) return;
  const url = tagUrl(t);
  if (!NFC_SUPPORTED) {
    openSheet("Write to a tag", html`<p>Writing tags works from an <b>Android phone</b>: open ${PLATFORM.name} there (Chrome or the app), go to Ministry tools, NFC tags, and tap Write to tag.</p>
      <p class="muted">On an iPhone, use a free NFC writing app (NFC Tools, for example): choose Write, add a URL record, and paste this link.</p>
      <div class="panel nfc-url-box"><b>${url}</b></div>
      <div class="btns"><button class="btn" data-act="copy" data-text="${url}" data-done="Tag link copied">${icon("copy")}Copy link</button><button class="btn ghost" data-act="close-sheet">Done</button></div>`);
    return;
  }
  openSheet("Write to a tag", html`<div class="nfc-hold" id="nfc-status"><span class="nfc-pulse">${icon("nfc")}</span><p><b>Hold a tag to the back of your phone</b></p><p class="faint">${t.label}: ${url.replace(/^https?:\/\//, "")}</p></div>
    <label class="check"><input type="checkbox" id="nfc-lock"><span>Lock the tag afterward, so nobody can rewrite it. It can't be undone, and you won't need to: change where the tag link opens here instead.</span></label>
    <div class="btns"><button class="btn ghost" data-act="nfc-stop">Cancel</button></div>`);
  stopNfc(); nfcAbort = new AbortController();
  const status = (msg, ok) => { const s = $("#nfc-status"); if (s) s.innerHTML = `<span class="nfc-pulse ${ok ? "ok" : ""}">${flat(icon(ok ? "check" : "nfc"))}</span><p><b>${msg}</b></p>`; };
  (async () => {
    try {
      const nd = new NDEFReader();
      await nd.write({ records: [{ recordType: "url", data: url }] }, { signal: nfcAbort.signal, overwrite: true });
      if ($("#nfc-lock")?.checked) { status("Written. Hold it there to lock it..."); await nd.makeReadOnly({ signal: nfcAbort.signal }); }
      S.update("tagLinks", t.id, { written: (t.written || 0) + 1, lastWritten: new Date().toISOString() });
      status("Tag written. Hold another to write the same link, or close.", true);
      toast("Tag written"); nfcAbort = null;
      setTimeout(() => { if ($("#nfc-status")) Actions["nfc-write"](el); }, 1800);   // ready for the next tag
    } catch (e) {
      if (e?.name === "AbortError") return;
      status(e?.name === "NotAllowedError" ? "NFC isn't allowed. Turn on NFC in the phone's settings and allow it for this site." : "That didn't write. Hold the tag still against the middle of the phone's back and try again.");
    }
  })();
};
Actions["nfc-stop"] = () => { stopNfc(); closeSheet(); };
Actions["nfc-check"] = () => {
  openSheet("Check a tag", html`<div class="nfc-hold" id="nfc-status"><span class="nfc-pulse">${icon("nfc")}</span><p><b>Hold a tag to the back of your phone</b></p><p class="faint">See what's on it and which tag link it is.</p></div>
    <div class="btns"><button class="btn ghost" data-act="nfc-stop">Done</button></div>`);
  stopNfc(); nfcAbort = new AbortController();
  const nd = new NDEFReader();
  nd.onreading = (ev) => {
    const dec = new TextDecoder();
    const urls = [...ev.message.records].filter((r) => r.recordType === "url" || r.recordType === "absolute-url").map((r) => dec.decode(r.data));
    const code = urls.map((u) => u.match(/\/t\/([a-z0-9-]+)\/?$/i)?.[1]?.toLowerCase()).find(Boolean), t = code && S.list("tagLinks").find((x) => x.code === code);
    const s = $("#nfc-status"); if (!s) return;
    s.innerHTML = flat(html`<span class="nfc-pulse ok">${icon("check")}</span>
      ${t ? html`<p><b>${t.label}</b></p><p class="muted">Opens: ${tagTargetLabel(t)}</p>` : urls.length ? html`<p><b>Not one of your tag links</b></p>` : html`<p><b>This tag is empty</b></p>`}
      ${urls.map((u) => html`<p class="faint nfc-url">${u}</p>`)}<p class="faint">Hold another tag to check it.</p>`);
  };
  nd.scan({ signal: nfcAbort.signal }).catch((e) => { const s = $("#nfc-status"); if (s && e?.name !== "AbortError") s.innerHTML = `<p><b>Turn on NFC in the phone's settings and allow it for this site.</b></p>`; });
};

// ---------- Ordering printed tags ----------
let nfcOrder = null;
function freshOrder(supplierId) {
  const s = NFC_SUPPLIERS.find((x) => x.id === supplierId) || NFC_SUPPLIERS[0], c = S.church();
  return { supplier: s.id, size: s.sizes[0]?.id || "", headline: "Tap to open", sub: c.name, qr: true, logo: !!c.logo, bg: c.color || "#1f3d7a", items: {} };
}
function nfcOrderTab() {
  if (!nfcOrder) return html`<section class="sec"><p class="muted" style="margin-top:0">Tag suppliers ${PLATFORM.name} has checked. Pick one and the app prepares what it needs: the artwork with your logo and colors, and the file of links for the tags.</p>
    ${NFC_SUPPLIERS.map((s) => html`<div class="panel nfc-supplier">
      <div class="nfc-supplier-head"><div><b>${s.name}</b><div class="muted">${s.product}</div></div>${s.ordering === "api" ? html`<span class="badge">Order in the app</span>` : ""}</div>
      <dl class="nfc-facts"><div><dt>Minimum</dt><dd>${s.minQty === 1 ? "Any amount" : `${s.minQty} tags`}</dd></div>
        <div><dt>Starting at</dt><dd>${s.startPrice ? `${money(s.startPrice)} a tag` : "Varies by store"}</dd></div>
        <div><dt>Delivery</dt><dd>${s.lead}</dd></div></dl>
      <p class="faint" style="margin:8px 0 0">${s.about}</p>
      <div class="btns">${s.ordering === "write" ? html`<a class="btn ghost sm" href="#nfc">${icon("nfc")}Write your own tags</a>`
        : html`<button class="btn sm" data-act="nfc-order-start" data-id="${s.id}">Prepare an order</button>`}
        ${s.url ? html`<a class="btn ghost sm" href="${s.url}" target="_blank" rel="noopener">${icon("globe")}See it on ${s.name}</a>` : ""}</div>
      ${s.checked ? html`<p class="faint" style="margin:6px 0 0;font-size:.8rem">Prices and times checked ${fmtShort(s.checked + "T12:00")}. The supplier's site has the final price.</p>` : ""}
    </div>`)}</section>`;
  return nfcOrderBuilder();
}
Actions["nfc-order-start"] = (el) => { nfcOrder = freshOrder(el.dataset.id); render(); };
Actions["nfc-order-back"] = () => { nfcOrder = null; render(); };

function nfcOrderBuilder() {
  const s = NFC_SUPPLIERS.find((x) => x.id === nfcOrder.supplier), size = s.sizes.find((z) => z.id === nfcOrder.size) || s.sizes[0];
  const tags = S.list("tagLinks").filter((t) => !t.paused);
  const lines = tags.filter((t) => +nfcOrder.items[t.id] > 0).map((t) => ({ t, qty: +nfcOrder.items[t.id] }));
  const total = lines.reduce((n, l) => n + l.qty, 0);
  const short = lines.filter((l) => l.qty < s.minQty);
  const est = lines.reduce((n, l) => n + l.qty * (nfcPrice(s, l.qty, size) || 0), 0);
  const preview = tags.find((t) => +nfcOrder.items[t.id] > 0) || tags[0];
  return html`<section class="sec nfc-builder">
    <button class="linkish" data-act="nfc-order-back">${icon("back")}All suppliers</button>
    <h2 class="sec-head" style="margin-top:8px">${s.name}: ${s.product}</h2>
    ${!tags.length ? html`<div class="panel"><p style="margin:0">Make a tag link first: each design on the order opens one of them. <a href="#nfc">Tag links</a></p></div>` : html`
    <div class="panel"><h3 style="margin-top:0">1. Which tags, and how many</h3>
      <p class="faint" style="margin-top:0">Each tag link is its own design. ${s.name}'s minimum is ${s.minQty} of each.</p>
      ${tags.map((t) => html`<label class="nfc-qty"><span><b>${t.label}</b><small class="faint">${tagUrl(t).replace(/^https?:\/\//, "")}</small></span>
        <input type="number" min="0" step="10" inputmode="numeric" value="${nfcOrder.items[t.id] || ""}" placeholder="0" data-input="nfc-qty" data-id="${t.id}" aria-label="How many ${t.label} tags"></label>`)}
    </div>
    <div class="panel"><h3 style="margin-top:0">2. The design</h3>
      <form data-form="nfc-design" class="nfc-design" novalidate>
        <label class="field" style="margin-top:0"><span>Size</span><select name="size" data-change="nfc-design">${s.sizes.map((z) => html`<option value="${z.id}" ${attr(z.id === size.id, "selected")}>${z.label}</option>`)}</select></label>
        <label class="field"><span>Headline</span><input type="text" name="headline" value="${nfcOrder.headline}" maxlength="22" data-input="nfc-design"><small>Short: "Tap to give", "Check in here", "Tap to connect". Each tag's name goes here if you leave it blank.</small></label>
        <label class="field"><span>Smaller line</span><input type="text" name="sub" value="${nfcOrder.sub}" maxlength="34" data-input="nfc-design"></label>
        <label class="field"><span>Color</span><input type="color" name="bg" value="${nfcOrder.bg}" data-input="nfc-design"></label>
        ${S.church().logo ? html`<label class="check"><input type="checkbox" name="logo" ${attr(nfcOrder.logo, "checked")} data-change="nfc-design"><span>Church logo</span></label>` : ""}
        <label class="check"><input type="checkbox" name="qr" ${attr(nfcOrder.qr && size.mm >= 38, "checked")} data-change="nfc-design" ${attr(size.mm < 38, "disabled")}><span>QR code too, for phones without NFC${size.mm < 38 ? " (needs 38 mm or larger)" : ""}</span></label>
      </form>
      ${preview ? html`<div class="nfc-preview" id="nfc-preview">${raw(tagArtSvg(preview, nfcOrder, size, { screen: true }))}</div>` : ""}
    </div>
    <div class="panel"><h3 style="margin-top:0">3. Files for ${s.name}</h3>
      ${total ? html`<p style="margin-top:0"><b>${total} tags</b> in ${lines.length} ${lines.length === 1 ? "design" : "designs"}${est ? html`, about <b>${money(est)}</b> before encoding, shipping and tax` : ""}.</p>` : html`<p class="muted" style="margin-top:0">Enter how many of each tag you want above.</p>`}
      ${short.length ? html`<p class="warn-text">${short.map((l) => l.t.label).join(", ")} ${short.length === 1 ? "is" : "are"} under the minimum of ${s.minQty}.</p>` : ""}
      <div class="btns">
        <button class="btn" data-act="nfc-files" data-kind="art" ${attr(!total, "disabled")}>${icon("download")}Artwork (SVG)</button>
        ${s.needs.includes("encoding") ? html`<button class="btn ghost" data-act="nfc-files" data-kind="csv" ${attr(!total, "disabled")}>${icon("download")}Encoding file (CSV)</button>` : ""}
        <button class="btn ghost" data-act="nfc-files" data-kind="sheet" ${attr(!total, "disabled")}>${icon("download")}Order sheet</button></div>
      <h3>Then, on ${s.name}</h3><ol class="nfc-steps">${s.steps.map((x) => html`<li>${x}</li>`)}</ol>
      ${s.ordering === "api" ? html`<button class="btn" data-act="nfc-api-order" ${attr(!total || short.length, "disabled")}>Place the order</button>` : html`<a class="btn ghost" href="${s.url}" target="_blank" rel="noopener">${icon("globe")}Open ${s.name}</a>`}
    </div>`}
  </section>`;
}
let nfcQtyTimer = 0;
Inputs["nfc-qty"] = (el) => { nfcOrder.items[el.dataset.id] = Math.max(0, Math.floor(+el.value || 0)); clearTimeout(nfcQtyTimer); nfcQtyTimer = setTimeout(() => keepFocus(render), 400); };
Inputs["nfc-design"] = (el) => {
  const f = el.form, s = NFC_SUPPLIERS.find((x) => x.id === nfcOrder.supplier);
  Object.assign(nfcOrder, { size: f.size.value, headline: f.headline.value, sub: f.sub.value, bg: f.bg.value, qr: f.qr && !f.qr.disabled ? f.qr.checked : nfcOrder.qr, logo: !!f.logo?.checked });
  const size = s.sizes.find((z) => z.id === nfcOrder.size);
  if (el.name === "size" || el.type === "checkbox") return keepFocus(render);
  const tags = S.list("tagLinks"), t = tags.find((x) => +nfcOrder.items[x.id] > 0) || tags[0], box = $("#nfc-preview");
  if (box && t) box.innerHTML = tagArtSvg(t, nfcOrder, size, { screen: true });
};
Forms["nfc-design"] = () => {};
/** Re-render without losing the box the person is typing in. */
function keepFocus(fn) {
  const a = document.activeElement, key = a && (a.name ? `[name="${a.name}"]` : a.dataset.id ? `[data-id="${a.dataset.id}"][data-input]` : ""), pos = a?.selectionStart;
  fn(); if (!key) return; const b = $(key); if (b) { b.focus(); try { if (pos != null) b.setSelectionRange(pos, pos); } catch {} }
}

/** Sticker artwork, at its real size in millimetres, with 2 mm of bleed (the color runs past the cut line). */
function tagArtSvg(t, o, size, { screen = false } = {}) {
  const c = S.church(), mm = size.mm, bleed = screen ? 0 : 2, round = size.shape === "round", W = mm + bleed * 2;
  const fg = onColor(o.bg), cx = W / 2;
  const head = (o.headline || t.label || "Tap here").slice(0, 22), sub = (o.sub || "").slice(0, 34);
  const qr = o.qr && mm >= 38 && isUrl(tagUrl(t)) ? qrSvg(tagUrl(t), { size: 100 }) : "";
  // Measure the pieces (tap mark or logo, headline, smaller line, QR code), then scale and center them inside the shape.
  let fs = Math.min(mm * 0.12, (mm * 0.84) / Math.max(6, head.length) * 1.75), subFs = Math.min(mm * 0.065, (mm * 0.8) / Math.max(8, sub.length) * 1.8);
  let markS = mm * (qr ? 0.14 : 0.22), qrS = mm * 0.38, gap = mm * 0.035;
  const useLogo = o.logo && c.logo, qrPad = () => qrS * 0.06;
  const height = () => markS + gap + fs + (sub ? gap * 0.6 + subFs : 0) + (qr ? gap * 1.4 + qrS + qrPad() * 2 : 0);
  const avail = mm * (round ? (qr ? 0.7 : 0.72) : 0.84), k = Math.min(1, avail / height());
  fs *= k; subFs *= k; markS *= k; qrS *= k; gap *= k;
  let y = bleed + (mm - height()) / 2;
  const parts = [];
  if (useLogo) parts.push(`<image href="${esc(c.logo)}" x="${cx - markS / 2}" y="${y}" width="${markS}" height="${markS}" preserveAspectRatio="xMidYMid meet"/>`);
  else {
    // The tap mark: a dot and three arcs, like the NFC symbol.
    const r = markS / 6.2, sw = Math.max(0.5, markS * 0.07), x0 = cx - markS * 0.32, my = y + markS / 2;
    parts.push(`<g fill="none" stroke="${fg}" stroke-width="${sw}" stroke-linecap="round"><circle cx="${x0}" cy="${my}" r="${sw * 0.9}" fill="${fg}" stroke="none"/>${[1, 2, 3].map((i) => `<path d="M${x0 + i * r * 1.05} ${my - r * i} a${r * i} ${r * i} 0 0 1 0 ${r * i * 2}"/>`).join("")}</g>`);
  }
  y += markS + gap + fs * 0.82;
  parts.push(`<text x="${cx}" y="${y}" font-size="${fs}" font-weight="700" fill="${fg}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(head)}</text>`);
  y += fs * 0.18;
  if (sub) { y += gap * 0.6 + subFs * 0.82; parts.push(`<text x="${cx}" y="${y}" font-size="${subFs}" fill="${fg}" fill-opacity=".9" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">${esc(sub)}</text>`); y += subFs * 0.18; }
  if (qr) { y += gap * 1.4; const pad = qrPad(); parts.push(`<rect x="${cx - qrS / 2 - pad}" y="${y}" width="${qrS + pad * 2}" height="${qrS + pad * 2}" rx="${pad}" fill="#fff"/><svg x="${cx - qrS / 2}" y="${y + pad}" width="${qrS}" height="${qrS}" ${qr.replace(/^<svg[^>]*?(viewBox="[^"]+")[^>]*>/, '$1 shape-rendering="crispEdges">').replace(/<\/svg>\s*$/, "")}</svg>`); }
  const shape = round ? `<circle cx="${cx}" cy="${cx}" r="${W / 2}" fill="${o.bg}"/>` : `<rect width="${W}" height="${W}" rx="${screen ? mm * 0.08 : 0}" fill="${o.bg}"/>`;
  const cut = !screen ? (round ? `<circle cx="${cx}" cy="${cx}" r="${mm / 2}" fill="none" stroke="#ff00ff" stroke-width=".1" stroke-dasharray=".8 .8"/>` : `<rect x="${bleed}" y="${bleed}" width="${mm}" height="${mm}" fill="none" stroke="#ff00ff" stroke-width=".1" stroke-dasharray=".8 .8"/>`) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" ${screen ? "" : `width="${W}mm" height="${W}mm" `}viewBox="0 0 ${W} ${W}" role="img" aria-label="${esc(head)} sticker">${shape}${parts.join("")}${cut}</svg>`;
}

Actions["nfc-files"] = (el) => {
  const s = NFC_SUPPLIERS.find((x) => x.id === nfcOrder.supplier), size = s.sizes.find((z) => z.id === nfcOrder.size) || s.sizes[0];
  const lines = S.list("tagLinks").filter((t) => +nfcOrder.items[t.id] > 0).map((t) => ({ t, qty: +nfcOrder.items[t.id] }));
  const c = S.church(), base = slugify(c.name);
  if (el.dataset.kind === "art") {
    // One file per design; the magenta dashed line is where the sticker is cut (suppliers remove it).
    lines.forEach(({ t }, i) => setTimeout(() => saveFile(`${base}-${slugify(t.label) || t.code}-${size.id}.svg`, tagArtSvg(t, nfcOrder, size)), i * 350));
    toast(lines.length > 1 ? `${lines.length} artwork files downloading` : "Artwork downloading");
  } else if (el.dataset.kind === "csv") {
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Design", "Quantity", "URL", "Artwork file"], ...lines.map(({ t, qty }) => [t.label, qty, tagUrl(t), `${base}-${slugify(t.label) || t.code}-${size.id}.svg`])];
    saveFile(`${base}-nfc-encoding.csv`, rows.map((r) => r.map(q).join(",")).join("\r\n") + "\r\n");
  } else {
    const total = lines.reduce((n, l) => n + l.qty, 0);
    const text = [`NFC tag order for ${c.name}`, `Supplier: ${s.name} (${s.product})`, s.url, `Size: ${size.label}`, "",
      ...lines.map(({ t, qty }) => `${qty} x ${t.label}\n   Link on the tag: ${tagUrl(t)}\n   Opens: ${tagTargetLabel(t)}${nfcPrice(s, qty, size) ? `\n   About ${money(nfcPrice(s, qty, size))} a tag at this quantity` : ""}`),
      "", `Total: ${total} tags`, "", "Steps:", ...s.steps.map((x, i) => `${i + 1}. ${x}`), "",
      `Each tag holds a tag link you can repoint any time in ${PLATFORM.name} (Ministry tools, NFC tags).`].join("\n");
    saveFile(`${base}-nfc-order.txt`, text);
  }
};
// For a supplier that takes orders by API (none on the list yet): the order goes to the platform's server, which holds
// the supplier's key and places it. Added with the first API supplier.
Actions["nfc-api-order"] = () => toast("Ordering in the app arrives with the first supplier that supports it.");
