// Registration and ongoing feature setup share the same checklist and guide.
const SETUP_PROVIDERS = {
  stripe: ["Stripe", "https://stripe.com/payments"],
  paypal: ["PayPal Developer", "https://developer.paypal.com/"],
  square: ["Square Developer", "https://developer.squareup.com/"],
  stripeReader: ["Stripe Terminal readers", "https://stripe.com/terminal"],
  squareReader: ["Square hardware", "https://squareup.com/us/en/hardware"],
  youtube: ["YouTube Live setup", "https://support.google.com/youtube/answer/2474026"],
  vimeo: ["Vimeo Live", "https://vimeo.com/features/livestreaming"],
  obs: ["OBS Studio", "https://obsproject.com/download"],
  qz: ["QZ Tray download", "https://qz.io/download/"],
  twilio: ["Twilio Console", "https://console.twilio.com/"],
  apple: ["Apple Podcasts Connect", "https://podcastsconnect.apple.com/"],
  spotify: ["Spotify for Creators", "https://creators.spotify.com/"],
};
const SETUP_DETAILS = {
  account: ["Church account and branding", "Church name, unique church ID, office contact details, website, and logo.", "", [],
    [["Review your name, contact information and logo.", "admin-account"], ["Set your Home banner and review how it looks on a phone.", "admin-banner"]]],
  campuses: ["Campuses and service times", "Campus names and short codes, street addresses, weekly service times, and room names.", "", [],
    [["Add each campus, set its visibility and enter its service schedule.", "admin-locations"], ["Add room names and review directions for visitors.", "admin-locations"]]],
  people: ["Roles and launch", "Names of your administrators and team leads, access needed for each role, and a launch date.", "", [],
    [["Review permissions and assign roles to the people responsible for the church account.", "admin-roles"], ["Set the role and privacy defaults for new members.", "admin-features"], ["Post a launch announcement and test the join flow on a phone.", "admin-news"]]],
  visitors: ["Visitor welcome and campus maps", "Welcome message, service and parking details, accessibility information, and a floor plan if using maps.", "", [],
    [["Set up Plan your visit and the welcome message.", "admin-visitpage"], ["Publish the landing page and test its public link.", "admin-page"], ["Add a map if visitors need directions inside the campus.", "admin-map"]]],
  sermons: ["Sermons", "Sermon title, date, speaker, Scripture reference, and any recordings or notes.", "Optional microphone and a recording device if creating new recordings.", [],
    [["Add a sermon and attach an audio or video recording.", "admin-sermons"], ["Open it as a listener and test playback.", "word"]]],
  plans: ["Reading plans", "Plan title, daily passages, length, and any accompanying notes.", "", [],
    [["Create a plan with a short reading for each day.", "admin-plans"], ["Open the plan and check the first reading.", "plans"]]],
  events: ["Events", "Date, location, capacity, registration deadline, and any ticket prices.", "Optional camera-equipped phone or tablet for door check-in.", [],
    [["Publish an event and verify registration and capacity.", "admin-events"], ["For paid tickets, set up and test your payment provider before selling tickets.", "admin-giving"]]],
  classes: ["Classes and Sunday school", "Class names, schedules, rooms, teachers, age ranges, and registration or approval rules.", "", [],
    [["Add classes and assign teachers.", "admin-gatherings"], ["Test registration and the teacher's view with your team.", "classes"]]],
  groups: ["Small groups", "Group names, meeting schedule, leaders, location, and join rules.", "", [],
    [["Create a group and assign its leader.", "admin-gatherings"], ["Check the join or approval flow.", "groups"]]],
  prayer: ["Prayer wall", "Moderation contacts, default privacy, and how staff handle private requests.", "", [],
    [["Review the privacy default for prayer requests.", "admin-features"], ["Assign moderators and verify they can review requests.", "admin-prayer"]]],
  directory: ["Directory", "Directory opt-in practices and the roles responsible for managing people.", "", [],
    [["Review whether people are listed by default.", "admin-features"], ["Check what another member can see.", "connect"]]],
  giving: ["Giving", "Fund names, finance contact, payout details, and the provider credentials requested by the connection screen.", "No dedicated hardware for online giving. For in-person cards, review the Payments and card readers guide.", ["stripe", "paypal", "square"],
    [["Create giving funds and connect one supported processor or link your existing giving page.", "admin-giving"], ["Run a test payment and verify the receipt and reporting.", "admin-giving"]]],
  checkin: ["Kids check-in", "Rooms and age ranges, service times, staff roles, pickup rules, and care intake procedures.", "Optional dedicated tablet or touchscreen kiosk, label printer and compatible labels.", ["qz"],
    [["Review room assignments, permissions, and parent checkout settings.", "admin-features"], ["Pair a kiosk and configure label printing if using them.", "devices"], ["Test arrival, labels and pickup with a sample family.", "admin-checkin"]]],
  parents: ["Parent portal", "Household details, classes, leaders and pickup permissions.", "", [],
    [["Enable classes or check-in if you plan to use those paths.", "admin-features"], ["Test with a parent household and confirm which classes and check-ins appear.", "parents"]]],
  chat: ["Chat", "Group leaders, chat permissions, and a point of contact for moderation.", "", [],
    [["Review who can use chat and set up group leaders.", "admin-roles"], ["Send a test message and check that the intended participants see it.", "chat"]]],
  live: ["Watch live", "Livestream URL for each campus, service schedule, and a contact who can run the stream.", "For your own live production, a camera, microphone or mixer feed, encoding computer, and reliable upload connection.", ["youtube", "vimeo", "obs"],
    [["Choose a streaming provider and enter the link under each campus.", "admin-locations"], ["Test the stream and a replay in Watch from a phone.", "live"]]],
  veritas: ["Veritas Logos Bible links", "Preferred Veritas Logos address if your church uses a custom one.", "", [["Veritas Logos", PLATFORM.veritasUrl]],
    [["Enable Veritas Logos links and verify that a Scripture reference opens correctly.", "word"]]],
  podcast: ["Podcasts and audio", "Show name, description, owner email, square artwork, and playable sermon audio files.", "Optional recording microphone and editing computer if you produce the audio.", ["apple", "spotify"],
    [["Attach audio to a sermon and complete the podcast feed settings.", "podcast"], ["Test playback in the app. Submit the feed to podcast directories if publishing there.", "podcast"]]],
  presentations: ["Service plans and presentations", "Service order, speaker or worship team, slides, lyrics permissions, and the campus where you present.", "Booth computer, audience display or projector, optional stage monitor, and a network connection for paired screens.", [],
    [["Create a service plan and assign presenter permissions.", "services"], ["Pair displays and test slides from the booth.", "devices"]]],
  volunteers: ["Volunteer scheduling", "Team names, positions, volunteer names, availability and approval process.", "", [],
    [["Set up teams and positions, then add volunteers.", "teams"], ["Build a schedule and test invitations and responses.", "schedule-matrix"]]],
  signage: ["Digital signage and paired devices", "Screen names and locations, the screen's purpose, and the slides or media for its playlist.", "Display or TV with a browser-capable player and a network connection.", [],
    [["Create a signage playlist or choose the device type you need.", "signs"], ["Pair the device and verify it starts on the intended screen.", "devices"]]],
  printers: ["Printers and labels", "Printer model, label sizes and the station or campus using it.", "Compatible printer, labels or receipt paper, and a device that can reach the printer.", ["qz"],
    [["Add a printer and assign it to the correct print jobs.", "admin-printing"], ["Print a test label or receipt from the intended station.", "admin-printing"]]],
  readers: ["Payments and card readers", "Processor account, reader location, and staff responsible for payments.", "A card reader supported by your provider and a device for the payment station.", ["stripeReader", "squareReader"],
    [["Connect a payment provider and confirm which readers it supports.", "admin-giving"], ["Configure the reader and test a transaction in the intended kiosk.", "admin-readers"]]],
  messaging: ["Push notifications, email and texting", "Sender name, audiences, consent preferences, and who can send messages.", "", ["twilio"],
    [["Choose messaging permissions and test a push notification.", "admin-push"], ["If using SMS, connect Twilio and test with an opted-in recipient.", "admin-texting"], ["Confirm email delivery with the app operator and send a test email.", "admin-email"]]],
  attendance: ["Attendance, geofencing and reports", "Service times, campus coordinates if using geofencing, and the reports your team needs.", "Optional location-enabled phones for GPS arrival prompts.", [],
    [["Review service times and configure any campus arrival prompts.", "admin-geofence"], ["Record test attendance and confirm that the right roles can see reports.", "reports"]]],
  rooms: ["Room booking and approvals", "Bookable rooms, capacities, hours, and approvers.", "Optional paired room display.", [],
    [["Set up bookable rooms and their schedules.", "rooms"], ["Review who can approve requests and test a booking.", "admin-approvals"]]],
  integrations: ["Webhooks and embeds", "Integration owner, approved endpoint or web address, and the events you want to share.", "", [],
    [["Add your church's webhook or embed and choose where it appears.", "admin-integrations"], ["Send a test event or open the embed before launch.", "admin-integrations"]]],
  finance: ["Treasurer and giving reports", "Fund and account names, opening balances, and the finance team's reporting responsibilities.", "", [],
    [["Set up access for the finance team and review the funds.", "treasurer"], ["Verify a sample batch and review giving reports.", "admin-giving"]]],
  forms: ["Forms, registrations and surveys", "Form purpose, questions, submission recipients, and any fee or approval rules.", "", [],
    [["Build the form and set who can receive responses.", "forms"], ["Submit a test response and verify any fee or confirmation.", "forms"]]],
  media: ["Media library", "Photos, videos, descriptions and permission to use uploaded assets.", "Optional camera or recording equipment if creating your own media.", [],
    [["Upload or select assets and include any required attribution.", "medialib"], ["Test the media on the screens where it will appear.", "admin-page"]]],
  support: ["Help and support", "Contact for church support cases and a description of any issue being reported.", "", [],
    [["Find the Help & support menu and review how temporary diagnostic access works.", "help"]]],
  safety: ["Safety and security administration", "Safety team contacts, approved policies, role assignments, and training responsibilities.", "Use devices approved by your church for its safety team.", [],
    [["Review access with the designated safety lead and verify the correct role assignments.", "security"]]],
};
const SETUP_CORE = ["account", "campuses", "people"];
const setupModule = (id) => MODULES.some(([key]) => key === id);
const setupTopics = () => [...new Set([...Object.keys(SETUP_DETAILS), ...MODULES.map(([id]) => id)])];
function setupTopic(id) {
  const [title, information, equipment, providers, steps] = Object.hasOwn(SETUP_DETAILS, id) ? SETUP_DETAILS[id]
    : [MODULES.find(([key]) => key === id)?.[1] || id, "Feature owner, launch date, permissions and any content needed for launch.", "", [], [["Review the feature settings and test with the intended role.", "admin-features"]]];
  return { title, information, equipment, providers: providers.map((p) => typeof p === "string" ? SETUP_PROVIDERS[p] : p), steps };
}
function chosenSetupTopics(values) {
  return setupTopics().filter((id) => SETUP_CORE.includes(id) || values.includes(id));
}
const setupSelection = (c) => chosenSetupTopics(c.setupGuide?.selected || MODULES.filter(([id]) => c.modules?.[id] !== false).map(([id]) => id));
function setupFeaturePicker(selected) {
  const choices = (ids) => ids.map((id) => html`<label class="check"><input type="checkbox" name="setupTopic" value="${id}" ${attr(selected.includes(id), "checked")}><span>${setupTopic(id).title}</span></label>`);
  const optional = setupTopics().filter((id) => !SETUP_CORE.includes(id));
  return html`<fieldset class="panel"><legend>App features</legend>${choices(optional.filter(setupModule))}</fieldset>
    <fieldset class="panel"><legend>Additional setup guides</legend>${choices(optional.filter((id) => !setupModule(id)))}</fieldset>`;
}
function setupRequirements(topic, forExport = false) {
  return html`<dl class="setup-requirements">
    <dt>Information</dt><dd>${topic.information}</dd>
    <dt>Equipment</dt><dd>${topic.equipment || "No dedicated equipment required. Use a phone, tablet or computer with internet access."}</dd>
    <dt>Separate services</dt><dd>${topic.providers.length ? topic.providers.map(([label, url]) => html`<div><a href="${url}" target="_blank" rel="noopener">${label}</a>${forExport ? html` <span>(${url})</span>` : ""}</div>`) : "None required for basic setup."}</dd>
  </dl>`;
}
function setupChecklist(name, ids, done = {}, forExport = false) {
  return html`<article id="setup-checklist"><h1>${name || "Church"} setup checklist</h1>
    ${ids.map((id) => {
      const topic = setupTopic(id);
      return html`<section class="sec setup-checklist-topic"><h2>${topic.title}</h2>${setupRequirements(topic, forExport)}
        <ul>${topic.steps.map(([step], index) => html`<li>${done[id]?.includes(index) ? "☑" : "☐"} ${step}</li>`)}</ul></section>`;
    })}</article>`;
}
const setupExportButtons = () => html`<div class="btns"><button type="button" class="btn" data-act="setup-print">${icon("printer")}Print or save as PDF</button>
  <button type="button" class="btn ghost" data-act="setup-download">${icon("download")}Download checklist</button></div>`;
Actions["setup-print"] = () => {
  const checklist = $("#setup-checklist");
  if (!checklist) return;
  $("#print-setup-checklist")?.remove();
  const copy = checklist.cloneNode(true);
  copy.id = "print-setup-checklist";
  document.body.append(copy);
  document.body.classList.add("print-setup");
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("print-setup");
    copy.remove();
  }, { once: true });
  window.print();
};
Actions["setup-download"] = () => {
  const form = $("form[data-guided-registration]");
  const c = S.church();
  if (!form && !c) return;
  const name = form ? $("input[name=name]", form).value.trim() : c.name;
  const selected = form ? chosenSetupTopics(new FormData(form).getAll("setupTopic")) : setupSelection(c);
  const content = flat(setupChecklist(name, selected, form ? {} : c.setupGuide?.done, true));
  saveFile(`${slugify(name) || "church"}-setup-checklist.html`, new Blob([`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Church setup checklist</title><style>body{font:16px system-ui;max-width:50rem;margin:2rem auto;padding:0 1rem}section{break-inside:avoid;border-top:1px solid #ccc;padding-bottom:1rem}dt{font-weight:bold}dd{margin:0 0 .5rem}li{list-style:none;margin-bottom:.3rem}a{color:#16496f}</style><body>${content}</body></html>`], { type: "text/html;charset=utf-8" }));
};

const registrationSteps = ["Church details", "Campuses and service times", "Choose features", "Review checklist"];
function showRegistrationStep(form, index) {
  form.dataset.setupStep = index;
  $$("[data-setup-stage]", form).forEach((stage) => { stage.hidden = Number(stage.dataset.setupStage) !== index; });
  $("[data-setup-progress]", form).textContent = `Step ${index + 1} of ${registrationSteps.length} · ${registrationSteps[index]}`;
  $("[data-act=setup-back]", form).hidden = index === 0;
  $("[data-act=setup-next]", form).hidden = index === registrationSteps.length - 1;
  $("[data-setup-create]", form).hidden = index !== registrationSteps.length - 1;
  if (index === 3) $("[data-setup-review]", form).innerHTML = flat(setupChecklist(
    $("input[name=name]", form).value.trim(), chosenSetupTopics(new FormData(form).getAll("setupTopic")), {}, true
  ));
  $("[data-setup-progress]", form).focus();
}
function registrationFieldError(form, index, message) {
  if (form.hasAttribute("data-guided-registration")) showRegistrationStep(form, index);
  formError(form, message);
}
Actions["setup-back"] = (el) => {
  const form = el.form;
  showRegistrationStep(form, Math.max(0, Number(form.dataset.setupStep) - 1));
};
Actions["setup-next"] = (el) => {
  const form = el.form, index = Number(form.dataset.setupStep);
  if (index === 0 && !$("input[name=name]", form).value.trim()) return formError(form, "Enter your church's name.");
  $(".err", form)?.remove();
  showRegistrationStep(form, Math.min(index + 1, registrationSteps.length - 1));
};

AdminScreens.setupguide = () => {
  const blocked = guard("manage.church"); if (blocked) return blocked;
  const c = S.church(), selected = setupSelection(c), done = c.setupGuide?.done || {};
  const remaining = selected.filter((id) => done[id]?.length !== setupTopic(id).steps.length);
  const completed = selected.length - remaining.length;
  return { title: "Church setup wizard", back: "admin", body: html`
    <section class="sec panel"><p>${completed} of ${selected.length} setup guides complete for ${c.name}.</p>
      <div class="btns">${remaining.length ? html`<a class="btn" href="#churchguide-${remaining[0]}">Continue setup</a>` : ""}<a class="btn ghost" href="#admin-setupchecklist">View printable checklist</a><a class="btn ghost" href="#admin-features">Set up manually</a></div>
      <details><summary>Choose what to include in your setup checklist</summary>
        <p class="muted">These selections update your checklist. Control which features members see under Features and defaults or from each feature guide.</p>
        <form data-form="setup-selection">${setupFeaturePicker(selected)}<button class="btn">Save checklist selection</button></form>
      </details></section>
    <section class="sec"><h2>Setup guides</h2><div class="rows">${selected.map((id) => {
      const topic = setupTopic(id), count = done[id]?.length || 0;
      return html`<a class="row" href="#churchguide-${id}"><span class="body"><span class="t">${topic.title}</span><span class="s">${count} of ${topic.steps.length} steps complete</span></span>${icon("chev")}</a>`;
    })}</div></section>
    <section class="sec"><h2>Other features</h2><div class="rows">${setupTopics().filter((id) => !selected.includes(id)).map((id) => html`
      <a class="row" href="#churchguide-${id}"><span class="body"><span class="t">${setupTopic(id).title}</span><span class="s">Open setup guide</span></span>${icon("chev")}</a>`)}</div></section>` };
};
AdminScreens.setupchecklist = () => {
  const blocked = guard("manage.church"); if (blocked) return blocked;
  const c = S.church();
  return { title: "Setup checklist", back: "admin-setupguide", body: html`${setupExportButtons()}
    ${setupChecklist(c.name, setupSelection(c), c.setupGuide?.done, true)}` };
};
Forms["setup-selection"] = (d, f, fd) => {
  if (guard("manage.church")) return;
  const c = S.church();
  S.updateChurch({ setupGuide: { ...c.setupGuide, selected: chosenSetupTopics(fd.getAll("setupTopic")) } });
  toast("Checklist updated");
  render();
};
Screens.churchguide = (id) => {
  const blocked = guard("manage.church"); if (blocked) return blocked;
  if (!setupTopics().includes(id)) return { redirect: "admin-setupguide" };
  const c = S.church(), topic = setupTopic(id), selected = setupSelection(c), done = c.setupGuide?.done?.[id] || [];
  const next = selected[selected.indexOf(id) + 1];
  return { title: topic.title, back: "admin-setupguide", body: html`
    <section class="sec panel"><h2>What you’ll need</h2>${setupRequirements(topic)}</section>
    <section class="sec"><h2>Setup steps</h2><div class="rows">${topic.steps.map(([step, route], index) => html`
      <div class="row"><label class="check body"><input type="checkbox" data-change="setup-complete" data-topic="${id}" data-index="${index}" ${attr(done.includes(index), "checked")}><span>${step}</span></label>
        <a class="btn ghost sm" href="#${route}" aria-label="Open settings for step ${index + 1}">Open</a></div>`)}</div></section>
    <div class="btns">
      ${!selected.includes(id) ? html`<button class="btn ghost" data-act="setup-include" data-topic="${id}">Add to checklist</button>` : ""}
      ${setupModule(id) && c.modules?.[id] === false ? html`<button class="btn" data-act="setup-enable" data-topic="${id}">Enable feature for members</button>` : ""}
      ${selected.includes(id) && next ? html`<a class="btn ghost" href="#churchguide-${next}">Next guide</a>` : ""}
      <a class="btn ghost" href="#admin-setupguide">All setup guides</a>
    </div>` };
};
Inputs["setup-complete"] = (el) => {
  const id = el.dataset.topic, index = Number(el.dataset.index);
  if (guard("manage.church") || !setupTopics().includes(id) || !setupTopic(id).steps[index]) return;
  const c = S.church(), done = { ...c.setupGuide?.done }, marked = new Set(done[id] || []);
  if (el.checked) marked.add(index); else marked.delete(index);
  done[id] = [...marked];
  S.updateChurch({ setupGuide: { selected: setupSelection(c), ...c.setupGuide, done } });
};
Actions["setup-include"] = (el) => {
  const id = el.dataset.topic;
  if (guard("manage.church") || !setupTopics().includes(id)) return;
  const c = S.church();
  S.updateChurch({ setupGuide: { ...c.setupGuide, selected: chosenSetupTopics([...setupSelection(c), id]) } });
  render();
};
Actions["setup-enable"] = (el) => {
  const id = el.dataset.topic;
  if (guard("manage.church") || !setupModule(id)) return;
  const c = S.church();
  S.updateChurch({ modules: { ...c.modules, [id]: true } });
  toast("Feature enabled");
  render();
};
