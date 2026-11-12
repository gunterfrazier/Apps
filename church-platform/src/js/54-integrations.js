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
        <p class="muted">Send events to other tools, like your church management system, email list or a spreadsheet automation. Each message is signed so the receiver can check it came from ${c.name}.</p>
        <div class="rows">${hooks.length ? hooks.map((h) => html`<button class="row" data-act="hook-edit" data-id="${h.id}"><span class="lead-ic">${icon("bolt")}</span><span class="body"><span class="t" style="overflow-wrap:anywhere">${h.url}</span><span class="s">${plural(h.events.length, "event")}${h.active ? "" : ", paused"}</span></span>${icon("edit")}</button>`) : empty("No webhooks yet.")}</div>
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
Actions["hook-edit"] = (el) => {
  const h = S.church().integrations.webhooks.find((x) => x.id === el.dataset.id) || { events: WEBHOOK_EVENTS.map((e) => e[0]), active: true, secret: newSecret() };
  openSheet(h.id ? "Edit webhook" : "Add a webhook", html`<form data-form="hook-save" novalidate><input type="hidden" name="id" value="${h.id || ""}"><input type="hidden" name="secret" value="${h.secret}">
    <label class="field"><span>Address to send to</span><input type="url" name="url" value="${h.url || ""}" placeholder="https://example.com/hooks/church" required></label>
    <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;margin-bottom:6px">Send when</legend>${WEBHOOK_EVENTS.map(([k, label]) => html`<label class="check" style="padding:5px 0"><input type="checkbox" name="events" value="${k}" ${attr(h.events.includes(k), "checked")}><span>${label} <span class="faint">${k}</span></span></label>`)}</fieldset>
    <label class="check"><input type="checkbox" name="active" ${attr(h.active, "checked")}><span>Active</span></label>
    <div class="field"><span>Signing secret</span><code class="secret">${h.secret}</code><small>Each message has an <code>X-Koinonia-Signature</code> header: <code>t=timestamp,v1=signature</code>, where the signature is HMAC-SHA256 of "timestamp.body" with this secret.</small>
      <div class="btns"><button type="button" class="btn ghost sm" data-act="copy" data-text="${h.secret}" data-done="Secret copied">${icon("copy")}Copy secret</button></div></div>
    <div class="btns"><button class="btn">Save</button>${h.id ? html`<button type="button" class="btn ghost" data-act="hook-test" data-id="${h.id}">Send a test</button><button type="button" class="btn danger" data-act="hook-delete" data-id="${h.id}">Delete</button>` : ""}</div></form>`);
};
Forms["hook-save"] = (d, f, fd) => {
  if (!isUrl(d.url) || !/^https:/i.test(d.url)) return formError(f, "Use an https:// address.");
  const events = fd.getAll("events");
  if (!events.length) return formError(f, "Choose at least one event.");
  const list = S.church().integrations.webhooks, rec = { url: d.url, events, active: !!d.active, secret: d.secret };
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
    <div class="field"><span>Headers</span><pre class="code">Content-Type: application/json\nX-Koinonia-Event: ${x.event}\nX-Koinonia-Signature: ${x.signature}</pre></div>
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
