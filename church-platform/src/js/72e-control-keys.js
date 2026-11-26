// ---------- Control keys ----------
// A control key lets a Stream Deck (through Bitfocus Companion) or any tool that can call a web address send booth
// commands without signing in: GET <server>/functions/v1/control/next?key=ofc_... (supabase/functions/control).
// Keys are made and removed here by people with Screens and devices; the server keeps only a hash, so a key is shown
// once (upgrade-29.sql).

const ctlKeys = { list: null, loading: false, made: null, error: "", client: null };
/** The server connection for keys; tests put a stand-in in ctlKeys.client. */
const ctlClient = () => ctlKeys.client || (Backend.on ? Backend.client : null);
const controlUrl = () => `${PLATFORM.supabaseUrl}/functions/v1/control`;
const CONTROL_BUTTONS = [["Next slide", "next"], ["Previous slide", "prev"], ["Black screen", "black"], ["Logo", "logo"], ["Clear", "clear"],
  ["Slide 1", "go/1"], ["Chorus", "section/Chorus"], ["Stage message", "message?text=Wrap%20up"]];

async function ctlKeysLoad() {
  if (!ctlClient() || ctlKeys.loading) return;
  ctlKeys.loading = true;
  const { data, error } = await ctlClient().rpc("control_keys_list", { c: S.state.current });
  ctlKeys.loading = false; ctlKeys.list = data || []; ctlKeys.error = error ? "Control keys need version 29 of the database (upgrade-29.sql)." : "";
  if (location.hash === "#control-keys") render();
}
window.addEventListener("hashchange", () => { if (location.hash !== "#control-keys") { ctlKeys.list = null; ctlKeys.made = null; } });

Screens["control-keys"] = () => {
  if (!canDevices()) return { redirect: hasAdminTools() ? "admin" : "me" };
  const intro = html`<p class="muted" style="margin-top:16px">A control key lets a Stream Deck, through the free Bitfocus Companion app, move the slides on the booth: each button calls a web address with the key in it. Anyone with a key can move your slides, so keep keys on the booth computer and remove any you stop using.</p>`;
  if (!ctlClient()) return { title: "Control keys", back: "devices", body: html`${intro}<div class="panel" style="margin-top:12px"><p>Control keys work once the app is connected to its server. Until then, the phone remote (the Remote button in the presenter) moves the slides from any phone signed in to the church.</p></div>` };
  const locs = S.visibleLocations();
  const made = ctlKeys.made;
  return {
    title: "Control keys", back: "devices", after: () => { if (ctlKeys.list === null) ctlKeysLoad(); },
    body: html`${intro}
      ${made ? html`<div class="panel ctl-made" role="status"><p><b>Copy the key for ${made.name} now.</b> It won't be shown again.</p>
        <div class="copy-line"><input readonly value="${made.key}" aria-label="Control key" onfocus="this.select()"><button class="btn sm" data-act="copy" data-text="${made.key}" data-done="Key copied">${icon("copy")}Copy</button></div>
        <p class="muted" style="margin-bottom:6px">In Companion, add a <b>Generic HTTP</b> connection, then give each button an <b>HTTP Request (GET)</b> action with one of these addresses:</p>
        <div class="ctl-urls">${CONTROL_BUTTONS.map(([label, path]) => { const u = `${controlUrl()}/${path}${path.includes("?") ? "&" : "?"}key=${made.key}`;
          return html`<div class="ctl-url"><span>${label}</span><code>${u.replace(made.key, "…" + made.key.slice(-4))}</code><button class="btn ghost sm" data-act="copy" data-text="${u}" data-done="Address copied" aria-label="Copy the address for ${label}">${icon("copy")}</button></div>`; })}</div>
        <p class="faint">Slides count from 1. Section names match the song's sections (Verse 1, Chorus, Bridge). Black and Logo switch on and off; add &on=true or &on=false to set them.</p>
        <div class="btns"><button class="btn ghost" data-act="ctl-done">Done</button></div></div>`
      : html`<form class="panel" data-form="ctl-new" novalidate style="margin-top:12px"><h2 class="sec-head" style="margin-top:0">Make a key</h2>
        <div class="field"><label for="ctl-name">Name</label><input id="ctl-name" name="name" maxlength="60" required placeholder="Booth Stream Deck"></div>
        ${locs.length > 1 ? html`<div class="field"><label for="ctl-loc">Moves the slides at</label><select id="ctl-loc" name="loc">${locationOptions("", "Every campus")}</select></div>` : ""}
        <div class="btns"><button class="btn">${icon("plus")}Make the key</button></div></form>`}
      <section class="sec"><h2 class="sec-head">Keys</h2>
        ${ctlKeys.error ? html`<div class="panel"><p>${ctlKeys.error}</p></div>`
          : ctlKeys.list === null ? html`<p class="muted">Loading…</p>`
          : !ctlKeys.list.length ? html`<div class="rows">${empty("No control keys yet.")}</div>`
          : html`<div class="rows">${ctlKeys.list.map((k) => html`<div class="row"><span class="lead-ic">${icon("key")}</span><span class="body"><span class="t">${k.name} <span class="faint">…${k.hint}</span></span>
            <span class="s">${[k.location_id ? locName(k.location_id) : locs.length > 1 ? "Every campus" : "", k.last_used ? `Last used ${fmtWhen(k.last_used)}` : "Not used yet", k.created_by_name ? `Made by ${k.created_by_name}` : ""].filter(Boolean).join(" · ")}</span></span>
            <button class="btn ghost sm" data-act="ctl-remove" data-id="${k.id}" data-name="${k.name}">Remove</button></div>`)}</div>`}
      </section>
      <p class="faint" style="margin-top:14px">A Stream Deck plugged into the booth computer can also use a Companion connection that sends MIDI, which keeps working if the internet drops. That arrives with Booth mode's MIDI support.</p>`,
  };
};

Forms["ctl-new"] = async (d, f) => {
  if (!d.name.trim()) return formError(f, "Name the key, like \"Booth Stream Deck\".");
  const { data, error } = await ctlClient().rpc("control_key_create", { c: S.state.current, key_name: d.name.trim(), loc: d.loc || null });
  if (error) return formError(f, /version|function/i.test(error.message) && /not find|does not exist/i.test(error.message) ? "Control keys need version 29 of the database (upgrade-29.sql)." : error.message);
  ctlKeys.made = { key: data.key, name: d.name.trim() }; ctlKeys.list = null; render(); ctlKeysLoad();
};
Actions["ctl-done"] = () => { ctlKeys.made = null; render(); };
Actions["ctl-remove"] = (el) => openSheet(`Remove ${el.dataset.name}?`, html`<p>Buttons using this key stop working right away.</p>
  <div class="btns"><button class="btn danger" data-act="ctl-remove-yes" data-id="${el.dataset.id}">Remove</button><button class="btn ghost" data-act="close-sheet">Cancel</button></div>`);
Actions["ctl-remove-yes"] = async (el) => {
  const { error } = await ctlClient().rpc("control_key_remove", { c: S.state.current, key_id: el.dataset.id });
  closeSheet(true); if (error) return toast(error.message);
  toast("Key removed"); ctlKeys.list = null; ctlKeysLoad();
};
