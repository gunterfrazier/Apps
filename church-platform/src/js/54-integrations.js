// ---------- Webhooks and embedded pages ----------
const newSecret = () => "whsec_" + [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");

AdminScreens.integrations = () => {
  const blocked = guard("manage.integrations"); if (blocked) return blocked;
  const c = S.church(), hooks = c.integrations.webhooks, embeds = c.integrations.embeds;
  const log = S.state.deliveries.filter((x) => x.churchId === c.id).slice(0, 20);
  return {
    title: "Webhooks and embeds", back: "admin",
    body: html`
      <section class="sec"><h2 class="sec-head">Webhooks</h2>
        <p class="muted">Send what happens in the app to other places: post new announcements and events to your website or social media, alert a Slack, Discord, Teams or Google Chat channel, or feed your church management system and spreadsheets. Messages to your own server are signed so it can check they came from ${c.name}.</p>
        <div class="rows">${hooks.length ? hooks.map((h) => html`<button class="row" data-act="hook-edit" data-id="${h.id}"><span class="lead-ic">${icon("bolt")}</span><span class="body"><span class="t">${hookDest(h).name}</span><span class="s" style="overflow-wrap:anywhere">${plural(h.events.length, "event")}${h.locations?.length ? `, ${plural(h.locations.length, "location")}` : ""}${h.active ? "" : ", paused"}. ${h.url}</span></span>${icon("edit")}</button>`) : empty("No webhooks yet.")}</div>
        <div class="btns"><button class="btn" data-act="hook-edit">${icon("plus")}Add a webhook</button></div>
        ${demoNote("In this preview, messages are built, signed and logged below but not sent. Sending happens from your server, which keeps each signing secret out of the app.")}
        ${log.length ? html`<h3 style="margin-top:18px">Recent messages</h3><div class="rows">${log.map((x) => html`<button class="row" data-act="hook-log" data-id="${x.id}"><span class="body"><span class="t">${x.event}</span><span class="s">${ago(x.at)}, ${x.status === "queued" ? "waiting for your server" : x.status}</span></span>${icon("chev")}</button>`)}</div>` : ""}
      </section>
      <section class="sec"><h2 class="sec-head">Embedded pages</h2>
        <p class="muted">Show another website inside the app, like an online store, a sign-up form or a calendar. Members find them under Me, Links. You can also put embeds on your landing page.</p>
        <div class="rows">${embeds.length ? embeds.map((e) => html`<button class="row" data-act="embed-edit" data-id="${e.id}"><span class="lead-ic">${icon("globe")}</span><span class="body"><span class="t">${e.title}</span><span class="s" style="overflow-wrap:anywhere">${e.url}${e.showInMenu ? "" : ", hidden from Me"}</span></span>${icon("edit")}</button>`) : empty("No embedded pages yet.")}</div>
        <div class="btns"><button class="btn ghost" data-act="embed-edit">${icon("plus")}Add an embedded page</button></div>
      </section>`,
  };
};
// Where a webhook can go. Chat apps get a readable message in their own format; the rest get the standard signed JSON.
const HOOK_DESTS = {
  zapier: { name: "Zapier", what: "Post to Facebook, Instagram or X, add rows to Google Sheets, update your website, send texts and more", format: "json", hosts: ["zapier.com"], open: "https://zapier.com/apps/webhook/integrations", events: CONTENT_EVENTS,
    steps: ["In Zapier, make a Zap. For the trigger pick Webhooks by Zapier, then Catch Hook.", "Copy the webhook address Zapier gives you and paste it below.", "Save here, then tap Send a test so Zapier sees a sample.", "Add the actions you want, like Facebook Pages: Create Page Post, using the summary and link fields."] },
  make: { name: "Make", what: "The same kind of automations as Zapier: social posts, spreadsheets, your website", format: "json", hosts: ["make.com", "integromat.com"], open: "https://www.make.com/", events: CONTENT_EVENTS,
    steps: ["In Make, start a scenario with Webhooks, Custom webhook, and click Add to make one.", "Copy its address and paste it below.", "Save here, then tap Send a test so Make learns the shape of the data.", "Add modules after it, like Facebook Pages, Instagram for Business, Google Sheets or WordPress."] },
  social: { name: "Website or social media", what: "Share new announcements and events on your website, Facebook, Instagram or X", format: "json", hosts: ["zapier.com", "make.com", "ifttt.com", "pipedream.net", "n8n.cloud"], events: ["news.created", "event.created"],
    steps: ["Social networks and website builders don't take webhooks directly, so this goes through an automation service: Zapier, Make, IFTTT, Pipedream or n8n.", "Make an automation that starts with a webhook, and paste its address below.", "Send a test, then add the step that posts: a Facebook Page post, an Instagram post, a WordPress post, a Wix or Squarespace blog post, or a Buffer update that shares to several networks at once.", "Use the summary field for the text and the link field to bring people back to the app."] },
  slack: { name: "Slack", what: "Post a message in a Slack channel", format: "slack", hosts: ["hooks.slack.com"], open: "https://api.slack.com/messaging/webhooks", events: ["card.created", "followup.created", "prayer.created", "form.submitted"],
    steps: ["In Slack, create an app for your workspace and turn on Incoming Webhooks.", "Click Add New Webhook to Workspace, pick the channel and copy the webhook address.", "Paste it below."] },
  discord: { name: "Discord", what: "Post a message in a Discord channel", format: "discord", hosts: ["discord.com", "discordapp.com"], events: CONTENT_EVENTS,
    steps: ["In Discord, open the channel's settings (the gear), then Integrations, Webhooks, New Webhook.", "Click Copy Webhook URL.", "Paste it below."] },
  teams: { name: "Microsoft Teams", what: "Post a card in a Teams channel", format: "teams", hosts: ["logic.azure.com", "powerplatform.com", "powerautomate.com"], events: ["card.created", "followup.created", "prayer.created", "form.submitted"],
    steps: ["In the Teams channel, open the menu (…), then Workflows.", "Choose \"Post to a channel when a webhook request is received\" and finish the steps.", "Copy the address it gives you and paste it below."] },
  googlechat: { name: "Google Chat", what: "Post a message in a Google Chat space", format: "googlechat", hosts: ["chat.googleapis.com"], events: ["card.created", "followup.created", "prayer.created", "form.submitted"],
    steps: ["In the Google Chat space, open the space menu, then Apps and integrations, then Webhooks.", "Add a webhook, name it and copy its address.", "Paste it below."] },
  custom: { name: "Your own server", what: "Signed JSON to any https:// address, for a developer or your church management system", format: "json", hosts: null, events: null,
    steps: ["Give the address that should receive a POST for each event.", "Check each message's signature with the secret below before trusting it."] },
};
const hookDest = (h) => HOOK_DESTS[h.dest] || HOOK_DESTS.custom;
const hookGuess = (url) => { try { const host = new URL(url).hostname; return Object.keys(HOOK_DESTS).find((k) => k !== "social" && HOOK_DESTS[k].hosts?.some((x) => host === x || host.endsWith("." + x))) || "custom"; } catch { return "custom"; } };
Actions["hook-edit"] = (el) => {
  const c = S.church(), old = c.integrations.webhooks.find((x) => x.id === el.dataset.id), destKey = old?.dest || el.dataset.dest || "";
  if (!old && !destKey) return openSheet("Add a webhook", html`<p class="muted" style="margin-top:0">Where should it go?</p>
    <div class="rows">${Object.entries(HOOK_DESTS).map(([k, x]) => html`<button class="row" data-act="hook-edit" data-dest="${k}"><span class="lead-ic">${icon(x.format === "json" ? "bolt" : "chat")}</span><span class="body"><span class="t">${x.name}</span><span class="s">${x.what}</span></span>${icon("chev")}</button>`)}</div>`);
  const dest = HOOK_DESTS[destKey] || HOOK_DESTS.custom, h = old || { events: dest.events || WEBHOOK_EVENTS.map((e) => e[0]), active: true, secret: newSecret(), locations: [] };
  const groups = [...new Set(WEBHOOK_EVENTS.map((e) => e[2]))], locs = S.visibleLocations();
  openSheet(old ? `Edit ${dest.name} webhook` : `Send to ${dest.name}`, html`<form data-form="hook-save" novalidate><input type="hidden" name="id" value="${h.id || ""}"><input type="hidden" name="secret" value="${h.secret}"><input type="hidden" name="dest" value="${destKey || "custom"}">
    <p class="muted" style="margin-top:0">${dest.what}.</p>
    <ol class="map-steps">${dest.steps.map((x) => html`<li>${x}</li>`)}</ol>
    ${dest.open ? html`<div class="btns"><a class="btn ghost sm" href="${dest.open}" target="_blank" rel="noopener">${icon("globe")}Open ${dest.name}</a></div>` : ""}
    <label class="field"><span>Webhook address</span><input type="url" name="url" value="${h.url || ""}" placeholder="https://" required></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Send when</legend>
      ${groups.map((g) => html`<p class="faint" style="margin:10px 0 2px"><b>${g}</b></p>${WEBHOOK_EVENTS.filter((e) => e[2] === g).map(([k, label]) => html`<label class="check" style="padding:5px 0"><input type="checkbox" name="events" value="${k}" ${attr(h.events.includes(k), "checked")}><span>${label} <span class="faint">${k}</span></span></label>`)}`)}</fieldset>
    ${locs.length > 1 ? html`<fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Only from these locations</legend>
      ${locs.map((l) => html`<label class="check" style="padding:5px 0"><input type="checkbox" name="locations" value="${l.id}" ${attr(h.locations?.includes(l.id), "checked")}><span>${l.name}</span></label>`)}
      <small>Leave them all unticked to send from every location. Church-wide news and events always go.</small></fieldset>` : ""}
    <label class="check"><input type="checkbox" name="active" ${attr(h.active, "checked")}><span>Active</span></label>
    ${dest.format === "json" ? html`<div class="field"><span>Signing secret</span><code class="secret">${h.secret}</code><small>Each message has an <code>X-Our-Faithful-Signature</code> header: <code>t=timestamp,v1=signature</code>, where the signature is HMAC-SHA256 of "timestamp.body" with this secret. Each message's data also has a readable <code>summary</code> and, for news and events, a <code>link</code>.</small>
      <div class="btns"><button type="button" class="btn ghost sm" data-act="copy" data-text="${h.secret}" data-done="Secret copied">${icon("copy")}Copy secret</button></div></div>`
      : html`<p class="faint">${dest.name} gets a short, readable message for each event, with a link back to the app.</p>`}
    <div class="btns"><button class="btn">Save</button>${h.id ? html`<button type="button" class="btn ghost" data-act="hook-test" data-id="${h.id}">Send a test</button><button type="button" class="btn danger" data-act="hook-delete" data-id="${h.id}">Delete</button>` : ""}</div></form>`);
};
Forms["hook-save"] = (d, f, fd) => {
  if (!isUrl(d.url) || !/^https:/i.test(d.url)) return formError(f, "Use an https:// address.");
  const events = fd.getAll("events");
  if (!events.length) return formError(f, "Choose at least one event.");
  let destKey = HOOK_DESTS[d.dest] ? d.dest : "custom"; const dest = HOOK_DESTS[destKey], host = new URL(d.url).hostname;
  if (dest.hosts && !dest.hosts.some((x) => host === x || host.endsWith("." + x))) {
    if (destKey === "social") return formError(f, "Use the webhook address from Zapier, Make, IFTTT, Pipedream or n8n.");
    const guess = hookGuess(d.url); if (guess === "custom") return formError(f, `That isn't a ${dest.name} address. Copy the webhook address from ${dest.name}, or choose Your own server.`); destKey = guess;
  } else if (destKey === "custom") destKey = hookGuess(d.url);
  const list = S.church().integrations.webhooks, rec = { url: d.url, events, active: !!d.active, secret: d.secret, dest: destKey, format: HOOK_DESTS[destKey].format, locations: fd.getAll("locations") };
  if (d.id) Object.assign(list.find((x) => x.id === d.id), rec); else list.push({ id: uid(), ...rec, created: new Date().toISOString() });
  S.save(); closeSheet(); toast("Webhook saved"); render();
};
Actions["hook-delete"] = (el) => { const c = S.church(); c.integrations.webhooks = c.integrations.webhooks.filter((x) => x.id !== el.dataset.id); S.save(); closeSheet(); render(); };
Actions["hook-test"] = async (el) => {
  const h = S.church().integrations.webhooks.find((x) => x.id === el.dataset.id);
  const was = h.events; h.events = [...new Set([...was, "test"])]; const active = h.active; h.active = true;
  await emit("test", { message: "Test from " + S.church().name });
  h.events = was; h.active = active; S.save(); closeSheet(); toast("Test message logged"); render();
};
Actions["hook-log"] = (el) => {
  const x = S.state.deliveries.find((d) => d.id === el.dataset.id);
  let pretty = x.body; try { pretty = JSON.stringify(JSON.parse(x.body), null, 2); } catch {}
  openSheet(x.event, html`<p class="faint" style="margin-top:0">POST ${x.url}<br>${fmtWhen(x.at)}. ${x.status === "queued" ? "Waiting for your server to send it." : x.status}</p>
    <div class="field"><span>Headers</span><pre class="code">Content-Type: application/json\nX-Our-Faithful-Event: ${x.event}\nX-Our-Faithful-Signature: ${x.signature}</pre></div>
    <div class="field"><span>Body</span><pre class="code">${pretty}</pre></div>
    <div class="btns"><button class="btn ghost sm" data-act="copy" data-text="${x.body}">${icon("copy")}Copy body</button></div>`, { wide: true });
};
Actions["embed-edit"] = (el) => {
  const e = S.church().integrations.embeds.find((x) => x.id === el.dataset.id) || { showInMenu: true };
  openSheet(e.id ? "Edit embedded page" : "Add an embedded page", html`<form data-form="embed-save" novalidate><input type="hidden" name="id" value="${e.id || ""}">
    <label class="field"><span>Title</span><input type="text" name="title" value="${e.title || ""}" required maxlength="40" placeholder="Church store"></label>
    <label class="field"><span>Page address</span><input type="url" name="url" value="${e.url || ""}" placeholder="https://" required><small>Some sites don't allow being shown inside other apps. If yours stays blank, link to it instead.</small></label>
    <label class="check"><input type="checkbox" name="showInMenu" ${attr(e.showInMenu, "checked")}><span>List it under Me, Links</span></label>
    <div class="btns"><button class="btn">Save</button>${e.id ? html`<a class="btn ghost" href="#embed-${e.id}">Open</a><button type="button" class="btn danger" data-act="embed-delete" data-id="${e.id}">Delete</button>` : ""}</div></form>`);
};
Forms["embed-save"] = (d, f) => {
  if (!d.title) return formError(f, "Give it a title.");
  if (!isUrl(d.url)) return formError(f, "The address should start with https://");
  const list = S.church().integrations.embeds, rec = { title: d.title, url: d.url, showInMenu: !!d.showInMenu };
  if (d.id) Object.assign(list.find((x) => x.id === d.id), rec); else list.push({ id: uid(), ...rec });
  S.save(); closeSheet(); toast("Saved"); render();
};
Actions["embed-delete"] = (el) => { const c = S.church(); c.integrations.embeds = c.integrations.embeds.filter((x) => x.id !== el.dataset.id); S.save(); closeSheet(); render(); };
