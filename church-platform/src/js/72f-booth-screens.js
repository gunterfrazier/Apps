// ---------- Screens on the booth computer ----------
// The booth computer usually drives more than one display: the operator's own, the audience projector or TVs, and a
// stage display facing the band. This page gives each display a job once, and "Open my screens" opens the audience and
// stage windows on the right displays from one click (Chrome and Edge's Window Management API). Each window then goes
// full screen by itself if the browser allows automatic full screen for the site; otherwise it asks for one click.
// What's set up is kept on this computer, for this church.

const SCREEN_JOBS = [["", "Nothing"], ["operator", "Operator (this window)"], ["display", "Audience slides"], ["stage", "Stage display"]];
const boothScr = { details: null, wins: [], asked: false, error: "" };
const scrStoreKey = () => `ofc-booth-screens:${S.state.current}`;
const scrSetup = () => { try { return JSON.parse(localStorage.getItem(scrStoreKey()) || "{}"); } catch { return {}; } };
const scrSave = (v) => { try { localStorage.setItem(scrStoreKey(), JSON.stringify(v)); } catch { /* private mode */ } };
/** A display's name that stays the same between visits (its label, size and place). */
const scrKey = (s) => `${s.label || "Screen"}|${s.width}x${s.height}|${s.left},${s.top}`;
const scrName = (s, i) => s.label || (s.isPrimary ? "Main display" : `Display ${i + 1}`);
const canPlaceWindows = () => "getScreenDetails" in window;

/** Lists the displays. Asks for permission the first time (needs a click); after that it works on its own. */
async function scrFind(ask) {
  if (!canPlaceWindows()) return null;
  try {
    if (!ask) { const p = await navigator.permissions.query({ name: "window-management" }).catch(() => null); if (p?.state !== "granted") return null; }
    boothScr.details = await window.getScreenDetails(); boothScr.error = "";
    boothScr.details.onscreenschange = () => { if (location.hash === "#booth-screens") render(); };
    return boothScr.details;
  } catch { boothScr.error = "The browser wasn't allowed to see your displays. Click the icon at the left of the address bar, allow Window management, then try again."; return null; }
}
/** Each display's job: what was saved, or a sensible start (this one runs the slides, the next shows them, the third faces the stage). */
function scrJobs(details) {
  const saved = scrSetup().jobs || {}, screens = details.screens, jobs = {};
  const others = screens.filter((s) => s !== details.currentScreen);
  for (const s of screens) jobs[scrKey(s)] = saved[scrKey(s)] ?? (s === details.currentScreen ? "operator" : s === others[0] ? "display" : s === others[1] ? "stage" : "");
  return jobs;
}

/** Opens the audience and stage windows on their displays. Returns how many opened. */
async function openMyScreens() {
  const details = boothScr.details || await scrFind(true);
  const loc = scrSetup().loc || "", jobs = details ? scrJobs(details) : {};
  const want = details ? details.screens.map((s) => ({ s, job: jobs[scrKey(s)] })).filter((x) => x.job === "display" || x.job === "stage") : [];
  if (!want.length) { go("booth-screens"); return 0; }
  boothScr.wins.forEach((w) => { try { w.close(); } catch { /* gone */ } });
  const looks = scrSetup().looks || {};
  boothScr.wins = want.map(({ s, job }, i) => window.open(`${location.pathname}#${job}-follow`, `ofc-screen-${job}-${i}~${job === "display" ? looks[scrKey(s)] || "" : ""}~${loc}`,
    `popup,left=${s.availLeft ?? s.left},top=${s.availTop ?? s.top},width=${s.availWidth ?? s.width},height=${s.availHeight ?? s.height},fullscreen`)).filter(Boolean);
  if (boothScr.wins.length < want.length) toast("The browser blocked some windows. Allow pop-ups for this site, then try again.");
  else toast(`Opened ${boothScr.wins.length === 1 ? "1 screen" : `${boothScr.wins.length} screens`}`);
  if (typeof presBroadcast === "function" && pres.key) setTimeout(presBroadcast, 900);
  return boothScr.wins.length;
}
function closeMyScreens() { boothScr.wins.forEach((w) => { try { w.close(); } catch { /* gone */ } }); boothScr.wins = []; render(); }

/** In a window this page opened: go full screen, or ask for a click if the browser wants one. */
// Window names: ofc-screen-<job>-<n>~<look>~<campus> (older copies wrote ofc-screen-<job>-<n>-<campus>).
const SCREEN_WINDOW = /^ofc-screen-(display|stage)-\d+(?:~([a-z]*)~(.*)|-?(.*))$/.exec(window.name || "");
const screenWindowLoc = () => SCREEN_WINDOW?.[3] ?? SCREEN_WINDOW?.[4] ?? "";
const screenWindowLook = () => SCREEN_WINDOW?.[2] || "";
function screenWindowFullscreen() {
  if (!SCREEN_WINDOW || document.fullscreenElement || $(".fs-ask")) return;
  document.documentElement.requestFullscreen?.().catch(() => {
    const b = document.createElement("button");
    b.className = "fs-ask"; b.type = "button"; b.textContent = "Click for full screen";
    b.onclick = () => document.documentElement.requestFullscreen().then(() => b.remove(), () => {});
    document.body.append(b);
  });
}
document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement) $(".fs-ask")?.remove(); });

Screens["booth-screens"] = () => {
  if (!canBoothCheck()) return { redirect: "me" };
  const back = thisDevice() ? "booth" : "devices";
  const setup = scrSetup(), locs = S.visibleLocations();
  if (!canPlaceWindows()) return { title: "Screens on this computer", back, body: html`
    <p class="muted" style="margin-top:16px">Placing windows on each display needs Chrome or Edge on a computer. In this browser, open the windows and drag each one to its display, then press F11 (or Control-Command-F on a Mac) to fill the screen.</p>
    <div class="btns"><button class="btn" data-act="pres-open" data-route="display-follow" data-name="ofc-screen-display-0">${icon("screen")}Audience window</button><button class="btn ghost" data-act="pres-open" data-route="stage-follow" data-name="ofc-screen-stage-1">${icon("music")}Stage window</button></div>` };
  const d = boothScr.details;
  if (!d && !boothScr.asked) { boothScr.asked = true; scrFind(false).then((x) => { if (x) render(); }); }
  const jobs = d ? scrJobs(d) : {};
  const open = boothScr.wins.filter((w) => !w.closed).length;
  return {
    title: "Screens on this computer", back,
    body: html`<p class="muted" style="margin-top:16px">Give each display connected to this computer a job. <b>Open my screens</b> then puts the audience slides and the stage display on the right displays, and they follow whatever you present.</p>
      ${boothScr.error ? html`<div class="panel" role="alert"><p>${boothScr.error}</p></div>` : ""}
      ${!d ? html`<div class="panel"><p>First, let the app see your displays. The browser will ask once.</p><div class="btns"><button class="btn" data-act="scr-find">${icon("screen")}Find my displays</button></div></div>`
      : html`<form class="panel scr-form" data-form="scr-save" novalidate>
          ${d.screens.length < 2 ? html`<p class="faint">Only one display is connected. Plug in the projector or TV and it appears here.</p>` : ""}
          <div class="scr-map" aria-hidden="true">${scrMap(d, jobs)}</div>
          ${d.screens.map((s, i) => html`<div class="field scr-row"><label for="scr-${i}">${scrName(s, i)} <span class="faint">${s.width}×${s.height}${s === d.currentScreen ? ", where this window is" : ""}</span></label>
            <div class="scr-pick"><select id="scr-${i}" name="job-${i}" data-key="${scrKey(s)}" data-change="scr-job">${SCREEN_JOBS.map(([v, l]) => html`<option value="${v}" ${attr(jobs[scrKey(s)] === v, "selected")}>${l}</option>`)}</select>
            <select name="look-${i}" data-look="${scrKey(s)}" aria-label="Look on ${scrName(s, i)}" ${attr(jobs[scrKey(s)] !== "display", "hidden")}>${SCREEN_LOOKS.map(([v, l]) => html`<option value="${v}" ${attr((setup.looks?.[scrKey(s)] || "full") === v, "selected")}>${l}</option>`)}</select></div></div>`)}
          ${locs.length > 1 ? html`<div class="field"><label for="scr-loc">These screens show</label><select id="scr-loc" name="loc">${locationOptions(setup.loc || "", "Whatever is presented at any campus")}</select></div>` : ""}
          <div class="btns"><button class="btn ghost">Save</button></div></form>
        <div class="btns"><button class="btn" data-act="scr-open">${icon("screen")}Open my screens</button>${open ? html`<button class="btn ghost" data-act="scr-close">${icon("x")}Close ${open === 1 ? "the screen" : `${open} screens`}</button>` : ""}</div>`}
      <details class="panel scr-tips"><summary><b>Make it one click on Sunday</b></summary>
        <ol class="steps-list"><li>Allow pop-ups for this site (the icon at the right of the address bar, the first time it's blocked).</li>
          <li>Let the windows fill their screens by themselves: open the site's settings (the icon at the left of the address bar, then <b>Site settings</b>) and set <b>Automatic full screen</b> to <b>Allow</b>. Without it, each screen shows a <b>Click for full screen</b> button.</li>
          <li>Set the computer's displays to <b>extend</b>, not mirror.</li></ol></details>`,
  };
};
/** A small map of the displays as they're arranged, so "Display 2" means something. */
function scrMap(d, jobs) {
  const ss = d.screens, minX = Math.min(...ss.map((s) => s.left)), minY = Math.min(...ss.map((s) => s.top));
  const W = Math.max(...ss.map((s) => s.left + s.width)) - minX, H = Math.max(...ss.map((s) => s.top + s.height)) - minY, k = 300 / Math.max(W, H * 1.6);
  return html`<div class="scr-canvas" style="width:${Math.round(W * k)}px;height:${Math.round(H * k)}px">${ss.map((s, i) => html`<span class="scr-box job-${jobs[scrKey(s)] || "none"}" style="left:${Math.round((s.left - minX) * k)}px;top:${Math.round((s.top - minY) * k)}px;width:${Math.round(s.width * k) - 4}px;height:${Math.round(s.height * k) - 4}px"><b>${i + 1}</b>${(SCREEN_JOBS.find(([v]) => v === (jobs[scrKey(s)] || ""))?.[1] || "").replace(" (this window)", "")}</span>`)}</div>`;
}
Actions["scr-find"] = async () => { await scrFind(true); render(); };
Actions["scr-open"] = async () => { const f = $("form[data-form=scr-save]"); if (f) scrKeep(f); await openMyScreens(); render(); };
/** From the presenter: open the screens if they're set up on this computer, or go set them up. */
Actions["pres-screens"] = async () => {
  if (canPlaceWindows() && Object.values(scrSetup().jobs || {}).some((j) => j === "display" || j === "stage") && await scrFind(false)) return openMyScreens();
  openSheet("Screens on this computer", html`<p>Give each display connected to this computer a job first: audience slides, stage display, or this window. It takes a minute, once.</p>
    <div class="btns"><a class="btn" href="#booth-screens">Set up screens</a><button class="btn ghost" data-act="close-sheet">Not now</button></div>`);
};
Actions["scr-close"] = closeMyScreens;
function scrKeep(f) {
  const jobs = { ...(scrSetup().jobs || {}) };
  for (const sel of f.querySelectorAll("select[data-key]")) jobs[sel.dataset.key] = sel.value;
  const looks = { ...(scrSetup().looks || {}) };
  for (const sel of f.querySelectorAll("select[data-look]")) looks[sel.dataset.look] = sel.value === "full" ? undefined : sel.value;
  scrSave({ ...scrSetup(), jobs, looks: JSON.parse(JSON.stringify(looks)), loc: f.querySelector("[name=loc]")?.value || "" });
}
Forms["scr-save"] = (d, f) => { scrKeep(f); toast("Saved for this computer"); render(); };
Inputs["scr-job"] = (el) => { const look = el.parentElement.querySelector("select[data-look]"); if (look) look.hidden = el.value !== "display"; };
