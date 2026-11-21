// Clicks through every feature at phone size and fails on any script error.
// Run: node build.mjs && node test/smoke.mjs   (needs Playwright; set CHROME=/path/to/chrome if it can't find a browser)
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(join(process.env.PLAYWRIGHT_DIR || "/opt/npm-tools/node_modules", "playwright")); }

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "dist");
const shots = join(here, "..", ".shots");
mkdirSync(shots, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  // Leave out config.js so the test runs in browser-only mode with the sample churches.
  if (!p.startsWith(root) || !existsSync(p) || p.endsWith("config.js")) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
// Device voices, simulated: headless Chrome has none. Each utterance "plays" for 250 ms and is logged in window.__spoken.
await ctx.addInitScript(() => {
  const voices = [["Fred", "en-US", true, true], ["Google US English", "en-US", false], ["Samantha", "en-US", true], ["Ava (Premium)", "en-US", true, false, "com.apple.voice.premium.en-US.Ava"], ["Paulina", "es-MX", true], ["Bubbles", "en-US", true]]
    .map(([name, lang, localService, isDefault = false, voiceURI = name]) => ({ name, lang, localService, default: isDefault, voiceURI }));
  const spoken = (window.__spoken = []), synth = new EventTarget();
  let queue = [], now = null, timer = null;
  const next = () => { now = queue.shift() || null; if (!now) return; timer = setTimeout(() => { const u = now; now = null; u.onend?.({}); next(); }, 250); };
  synth.getVoices = () => voices;
  synth.speak = (u) => { if (u.text.trim()) spoken.push({ text: u.text, voice: u.voice?.name || null, rate: u.rate }); queue.push(u); if (!now) next(); };
  synth.cancel = () => { clearTimeout(timer); const all = [now, ...queue].filter(Boolean); now = null; queue = []; all.forEach((u) => u.onerror?.({ error: "canceled" })); };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(text) { Object.assign(this, { text, voice: null, lang: "", rate: 1, pitch: 1, volume: 1 }); } };
});
const page = await ctx.newPage();
page.setDefaultTimeout(+process.env.STEP_TIMEOUT || 8000);
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`); });
await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());

let current = "";
// ONLY="part of a step's name" runs just the sign-up steps and the steps that match (for working on one step).
const ONLY = process.env.ONLY || "";
const step = async (name, fn) => { if (ONLY && !["welcome", "join as basic member"].includes(name) && !name.includes(ONLY)) return; current = name; try { await fn(); } catch (e) { const lines = e.message.split("\n"), waiting = lines.find((l) => /waiting for/.test(l)); errors.push(`${name}: ${lines[0]}${waiting ? ` (${waiting.replace(/\x1b\[[0-9;]*m/g, "").trim()})` : ""}`); await shot(`fail-${name.replace(/\W+/g, "-")}`).catch(() => {}); } };
const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
const goTo = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(90); };
const text = () => page.textContent("#app");
const expectText = async (s) => { const t = await text(); if (!t.includes(s)) throw new Error(`expected "${s}" on #${await page.evaluate(() => location.hash.slice(1))}`); };
const sheetSubmit = () => page.click("#scrim form button.btn:not([type=button])");
const sheetGone = () => page.waitForSelector("#scrim", { state: "detached", timeout: 4000 });

await page.goto(base + "?debug#event-riverside-e1");
await step("welcome", async () => {
  await shot("01-welcome");
  await page.fill("input[name=name]", "Gunter Frazier");
  await page.fill("input[name=email]", "gunter@example.com");
  await page.click("form[data-form=welcome] button");
  await page.waitForSelector("h1:has-text('Thanksgiving potluck')"); // the link they arrived with
});
await step("join as basic member", async () => {
  await goTo("church-riverside"); await page.click("[data-act=join-church]");
  await page.waitForSelector("#scrim [data-act=visit-not-first]", { timeout: 5000 }); await page.click("#scrim [data-act=visit-not-first]"); await sheetGone();   // asked once, on joining
  await page.waitForSelector(".home-top"); await shot("02-home");
  await goTo("me"); await expectText("Member");
  if (await page.$('a[href="#admin"]')) throw new Error("a new member should not see Admin");
});
await step("opening summary", async () => {
  await goTo("home");
  const before = await page.evaluate(() => {
    const { S } = __app;
    const original = structuredClone(S.state);
    const me = S.me().id, at = new Date().toISOString();
    S.add("services", { title: "Upcoming service", date: "2099-01-01", time: "09:00",
      assignments: [{ id: "summary-assignment", position: "Greeter", userId: me, status: "pending" }] });
    S.add("notifications", { id: "summary-alert", userId: me, title: "Read this update", body: "Full text of the alert", at, read: false });
    S.add("notifications", { id: "summary-read", userId: me, title: "Already opened", at, read: true });
    S.add("channels", { id: "summary-chat", members: [me, "u-dana"] });
    S.state.messages.push({ id: "summary-message", channelId: "summary-chat", by: "u-dana", text: "Hello", at });
    S.flush();
    return original;
  });
  await page.reload();
  const summary = page.getByRole("dialog", { name: "Your pending items" });
  await summary.waitFor();
  await summary.getByRole("link", { name: /Greeter/ }).waitFor();
  await summary.getByText("Unread messages", { exact: true }).waitFor();
  await summary.locator('a[href="#thread-summary-chat"]').waitFor();
  if (await summary.getByText("Already opened").count()) throw new Error("read notification appeared in pending items");
  await summary.getByRole("button", { name: "Read this update" }).click();
  await page.getByRole("dialog", { name: "Read this update" }).getByText("Full text of the alert").waitFor();
  await page.keyboard.press("Escape");
  await sheetGone();
  await goTo("me");
  if (await summary.count()) throw new Error("opening summary repeated during a visit");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await summary.waitFor();
  if (await summary.getByText("Read this update").count()) throw new Error("opened notification reappeared on return");
  await summary.locator('a[href="#thread-summary-chat"]').click();
  await page.waitForURL(/#thread-summary-chat$/);
  await sheetGone();
  await page.evaluate((initial) => { __app.S.state = initial; __app.S.flush(); }, before);
  await goTo("home");
});
await step("foreground alerts", async () => {
  await goTo("home");
  await page.evaluate(() => {
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      window.alertChimes = (window.alertChimes || 0) + 1;
      return original.call(this);
    };
  });
  await page.keyboard.press("Shift");
  const receive = (id, mine = true, eventType = "INSERT") => page.evaluate(({ id, mine, eventType }) => {
    const { S, Backend } = __app;
    const user = Backend.user;
    Backend.user = { id: S.me().id };
    Backend.applyChange({
      eventType,
      new: {
        id, kind: "notifications", owner: mine ? S.me().id : "another-member", church_id: S.state.current, location_id: null,
        data: { kind: "targeted", title: "Test Chatgpt", body: "Targeted test alert", read: false, at: new Date().toISOString(), link: "#settings", userId: S.me().id },
      },
    });
    clearTimeout(Backend.refetch);
    Backend.user = user;
  }, { id, mine, eventType });
  const banner = page.locator("#foreground-alert button");
  await receive("other", false);
  await receive("updated", true, "UPDATE");
  if (await banner.isVisible()) throw new Error("an unrelated notification showed a banner");
  await receive("new");
  await banner.waitFor();
  if (!(await banner.textContent()).includes("Test Chatgpt")) throw new Error("foreground banner missed the alert");
  await page.waitForFunction(() => window.alertChimes === 1);
  await receive("new");
  if (await page.evaluate(() => window.alertChimes) !== 1) throw new Error("duplicate notification played a chime");
  await receive("still-unread");
  await receive("open-from-banner");
  await banner.click();
  await page.waitForSelector('#scrim h2:has-text("Test Chatgpt")');
  await page.waitForSelector('#scrim p:has-text("Targeted test alert")');
  if (await banner.isVisible()) throw new Error("the notification banner stayed open after tapping");
  if (await page.getAttribute('#scrim a', 'href') !== '#settings') throw new Error("related page link was lost");
  await page.click('#scrim [data-act="close-sheet"]');
  await sheetGone();
  await goTo("alerts");
  const unopened = page.locator('[data-act="notes-open"][data-id="still-unread"]');
  const opened = page.locator('[data-act="notes-open"][data-id="open-from-banner"]');
  if (await opened.getByText("New", { exact: true }).count()) throw new Error("opening the banner did not mark it read");
  if (!await unopened.getByText("New", { exact: true }).count()) throw new Error("opening the inbox cleared a different alert");
  await unopened.click();
  await page.waitForSelector('#scrim p:has-text("Targeted test alert")');
  await page.click('#scrim [data-act="close-sheet"]');
  await sheetGone();
  if (await unopened.getByText("New", { exact: true }).count()) throw new Error("opening the inbox item did not mark it read");
  await page.evaluate(() => {
    const { S, Backend } = __app;
    for (const id of ["new", "still-unread", "open-from-banner"]) {
      S.remove("notifications", id);
      Backend.snap.delete(`records:notifications|${id}`);
    }
  });
  await goTo("home");
});
await step("targeted recipient picker", async () => {
  await goTo("me");
  await page.click("[data-act=demo-role]");
  await page.click('#scrim [data-act=demo-role-set][data-id="admin"]');
  await sheetGone();
  await goTo("admin-push");
  const search = page.locator('[data-input="push-group-search"]');
  const category = page.locator('[data-change="push-group-category"]');
  const combine = page.locator('[data-change="push-combine"]');
  const send = page.locator("#push-send");
  const count = page.locator("#push-recipient-count");
  const draft = page.locator('[data-form="push-targeted-send"] input[name="title"]');
  if (!(await send.isDisabled())) throw new Error("sending was enabled before selecting a group");
  await draft.fill("Rehearsal reminder");
  await search.focus();
  await page.keyboard.type("worship");
  if (await search.inputValue() !== "worship") throw new Error("group search lost focus while typing");
  await category.selectOption("Volunteer & Ministry Teams");
  const worship = page.locator('#push-group-results [data-key="team:Worship"]');
  await worship.click();
  await count.click();
  const names = page.locator("#push-recipient-list li");
  const teamCount = await names.count();
  if (!teamCount || await send.isDisabled()) throw new Error("Worship recipients did not appear");
  await category.selectOption("General");
  await search.fill("everyone");
  await page.locator('#push-group-results [data-key="all"]').click();
  if (await names.count() < teamCount) throw new Error("any-group matching lost team members");
  await combine.selectOption("all");
  if (await names.count() !== teamCount) throw new Error("every-group matching did not match the Worship team");
  await page.getByRole("button", { name: "Remove Team: Worship" }).click();
  await page.getByRole("button", { name: "Clear selection" }).click();
  if (!(await send.isDisabled()) || await draft.inputValue() !== "Rehearsal reminder") throw new Error("clearing the audience changed the draft or left send enabled");
  await goTo("me");
  await page.click("[data-act=demo-role]");
  await page.click('#scrim [data-act=demo-role-set][data-id="member"]');
  await sheetGone();
});
await step("security communications dock", async () => {
  await goTo("me");
  await page.click("[data-act=demo-role]");
  await page.click('#scrim [data-act=demo-role-set][data-id="admin"]');
  await sheetGone();
  await goTo("security");
  const dock = page.locator(".sec-chat-form");
  const protocol = page.locator(".sec-protocol-options");
  const initial = await dock.boundingBox();
  if (!initial || initial.y + initial.height > 844) throw new Error("communication controls are below the fold");
  if (await protocol.getAttribute("open") !== null) throw new Error("protocol escalation started expanded");
  await protocol.locator("summary").click();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrolled = await dock.boundingBox();
  if (!scrolled || Math.abs(scrolled.y - initial.y) > 2) throw new Error("communications dock moved during scrolling");

  // Use a real MediaRecorder with an in-browser audio stream in place of a physical mic.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      await audio.resume();
      const destination = audio.createMediaStreamDestination();
      const oscillator = audio.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      return destination.stream;
    };
  });
  await dock.getByRole("textbox", { name: "Security message" }).fill("Check the lobby");
  await dock.getByRole("button", { name: "Record voice", exact: true }).click();
  const stop = dock.getByRole("button", { name: "Stop recording", exact: true });
  await stop.waitFor();
  await page.evaluate(() => __app.render());
  if (await dock.getByRole("textbox", { name: "Security message" }).inputValue() !== "Check the lobby") throw new Error("redraw erased the message draft");
  if (!(await dock.getByRole("button", { name: "Send", exact: true }).isDisabled())) throw new Error("Send was enabled during recording");
  await page.waitForTimeout(250);
  await stop.click();
  await dock.locator("audio").waitFor();
  await dock.getByRole("button", { name: "Send", exact: true }).click();
  await page.locator("#sec-chat-feed .sec-msg").filter({ hasText: "Check the lobby" }).locator("audio").waitFor();
  if (await dock.locator("audio").count()) throw new Error("voice attachment remained after sending");
  await page.evaluate(() => {
    const { S } = __app;
    const sent = S.list("securityMessages").find((m) => m.by === S.me().id && m.text === "Check the lobby");
    if (sent) S.remove("securityMessages", sent.id);
  });
  await goTo("me");
  await page.click("[data-act=demo-role]");
  await page.click('#scrim [data-act=demo-role-set][data-id="member"]');
  await sheetGone();
});
await step("security roles and approvals", async () => {
  await goTo("me");
  await page.click("[data-act=demo-role]");
  await page.click('#scrim [data-act=demo-role-set][data-id="admin"]');
  await sheetGone();
  const original = await page.evaluate(() => structuredClone(__app.S.state));
  await goTo("security-access");
  await page.selectOption("#security-assignee", "u-marcus");
  await page.click('[data-act="security-edit-access"]');
  await page.selectOption('#scrim select[name="role"]', "supervisor");
  await page.selectOption('#scrim select[name="maxLevel"]', "2");
  await sheetSubmit();
  await sheetGone();
  await expectText("Direct limit: Level 2");
  await page.selectOption("#security-assignee", "u-linda");
  await page.click('[data-act="security-edit-access"]');
  await page.selectOption('#scrim select[name="role"]', "head");
  await sheetSubmit();
  await sheetGone();

  const switchUser = (id) => page.evaluate((id) => {
    const { S } = __app;
    S.state.me = { ...S.me(), id, name: S.userName(id) };
    __app.render();
  }, id);
  const declare = async (level) => {
    await goTo("security");
    await page.locator(".sec-protocol-options summary").click();
    await page.click(`.sec-protocol-options [data-act="sec-activate-level"][data-level="${level}"]`);
    await page.click('#scrim [data-act="security-confirm-level"]');
    await sheetGone();
  };
  try {
    await switchUser("u-marcus");
    await goTo("security-drill");
    await page.waitForURL(/#security$/);
    await declare(4);
    if (await page.evaluate(() => !!__app.S.church().activeAlert)) throw new Error("a declaration above the limit activated before review");
    await goTo("security-access");
    await expectText("Awaiting review");
    if (await page.locator('[data-act="security-review-request"]').count()) throw new Error("a supervisor could review their own request");
    await declare(2);
    if (await page.evaluate(() => __app.S.church().activeAlert?.level) !== 2) throw new Error("a declaration within the limit did not activate");
    await switchUser("u-linda");
    await goTo("security-access");
    await page.click('[data-act="security-review-request"]');
    await page.click('#scrim [data-choice="approve"]');
    await sheetGone();
    if (await page.evaluate(() => __app.S.church().activeAlert?.level) !== 4) throw new Error("approval did not activate the requested level");
    await expectText("Approved");
    await page.click('[data-act="sec-all-clear"]');
    if (await page.evaluate(() => !!__app.S.church().activeAlert)) throw new Error("head of security could not issue all clear");
  } finally {
    await page.evaluate((state) => { __app.S.state = state; __app.S.flush(); }, original);
    await goTo("me");
    await page.click("[data-act=demo-role]");
    await page.click('#scrim [data-act=demo-role-set][data-id="member"]');
    await sheetGone();
  }
});
await step("campus filter", async () => {
  await goTo("home"); await page.click(".home-top [data-act=pick-campus]");
  await page.click('#scrim [data-id="riverside-east"]');
  await expectText("East campus");
  const t = await text(); if (t.includes("Staff offices")) throw new Error("private location shown to a member");
  await page.click(".home-top [data-act=pick-campus]"); await page.click('#scrim [data-id="all"]');
});
await step("household", async () => {
  for (const [name, birth, notes] of [["Ellie", "2019-04-02", "Peanut allergy"], ["Sam", "2022-02-10", ""]]) {
    await goTo("household"); await page.click("[data-act=person-edit]:not([data-id])");
    const [y, m, dd] = birth.split("-");
    await page.fill("#scrim input[name=name]", name); await page.fill("#scrim [data-bd=m]", String(+m)); await page.fill("#scrim [data-bd=d]", String(+dd)); await page.fill("#scrim [data-bd=y]", y);
    await page.fill("#scrim input[name=notes]", notes);
    if ((await page.inputValue("#scrim input[name=birth]")) !== birth) throw new Error(`birthday boxes made ${await page.inputValue("#scrim input[name=birth]")}, not ${birth}`);
    await sheetSubmit(); await sheetGone();
  }
});
await step("classes and kids registration", async () => {
  await goTo("classes"); await shot("03-classes");
  await goTo("gathering-riverside-pre9"); await page.click("[data-act=g-register]");
  await sheetSubmit(); await sheetGone(); await expectText("Registered");
  await goTo("gathering-riverside-couples"); await page.click("[data-act=g-register]");
  await sheetSubmit(); await sheetGone(); await expectText("Waiting for approval");
  await goTo("gathering-riverside-eastside"); await page.click("[data-act=g-register]"); await sheetSubmit(); await sheetGone();
  await goTo("gathering-riverside-staffprayer"); if ((await page.evaluate(() => location.hash)) !== "#connect") throw new Error("private-location group reachable by a member");
});
await step("event with kids", async () => {
  await goTo("event-riverside-e4"); await page.click("[data-act=event-register]");
  await page.check('#scrim input[name=kids] >> nth=0'); await sheetSubmit(); await sheetGone(); await expectText("You're going");
});
await step("parent portal", async () => {
  await goTo("parents"); await expectText("Preschool, 9:00"); await expectText("Advent family night");
  await page.click("[data-act=parent-checkin] >> nth=1");
  await page.waitForSelector("form[data-form=checkin]");
  await page.click("form[data-form=checkin] button.btn"); await page.waitForSelector(".kidtag .code");
  await goTo("parents"); await expectText("Checked in"); await shot("04-parents");
  await page.click("[data-act=parent-checkout]"); await page.click("[data-act=parent-checkout-yes]"); await sheetGone();
});
await step("chat", async () => {
  await goTo("chat"); await expectText("Eastside young adults"); await expectText("Preschool, 9:00: parents");
  await goTo("thread-g-riverside-eastside"); await page.fill("#msg", "See you Tuesday!"); await page.press("#msg", "Enter");
  await page.waitForSelector(".msg.mine"); await shot("05-chat");
  await goTo("directory"); await page.click("#dir-list a.row >> nth=0"); await page.click("[data-act=dm-start]"); await page.waitForSelector("form[data-form=chat-send]");
});
await step("prayer and giving", async () => {
  await goTo("connect"); await page.click("[data-act=prayer-new]");
  await page.fill("#scrim textarea[name=text]", "<b>Pray</b> for our <script>alert(1)</script> trip"); await sheetSubmit(); await sheetGone();
  if (!(await page.textContent("#main .prayer >> nth=0")).includes("<script>")) throw new Error("user text was not escaped");
  await goTo("give"); await page.click("[data-act=give-preset][data-n='100']"); await page.click("#give-btn");
  await page.click("#scrim [data-act=pay-test]"); await page.waitForSelector("#scrim [data-to=history]");
  await page.click("[data-act=close-sheet]");
});
await step("become primary and search child reunification", async () => {
  await goTo("me"); await page.click("[data-act=demo-primary]"); await page.waitForSelector("text=Account details"); await shot("06-admin");
  await goTo("security-reunify");
  const originalIds = await page.evaluate(() => __app.S.list("checkins").map((k) => k.id));
  await page.click("[data-act=reunify-sim-seed]");
  const search = page.locator('[data-input="reunify-search"]');
  const results = page.locator("#reunify-list");
  await search.focus();
  await page.keyboard.type("Liam Carter");
  if (await search.inputValue() !== "Liam Carter" || !await search.evaluate((el) => document.activeElement === el)) {
    throw new Error("reunification search lost focus while typing");
  }
  if (await results.locator(".row").count() !== 1) throw new Error("expected one matching child");
  await page.keyboard.press("Backspace");
  if (await search.inputValue() !== "Liam Carte") throw new Error("reunification search did not accept backspace");
  await search.fill("4829");
  if (await results.locator(".row").count() !== 2) throw new Error("expected both children with the pickup code");
  await search.fill("Chloe Davis");
  await results.locator('[data-act="reunify-verify-modal"]').click();
  await page.waitForSelector('#scrim form[data-form="reunify-complete"]');
  await page.keyboard.press("Escape");
  await sheetGone();
  await page.evaluate((originalIds) => {
    const S = __app.S;
    for (const k of S.list("checkins")) {
      if (!originalIds.includes(k.id)) S.remove("checkins", k.id);
    }
    S.save();
  }, originalIds);
  await goTo("admin");

});
await step("roles", async () => {
  await goTo("admin-roles"); await shot("07-roles");
  await goTo("role-media"); await page.check('input[name=p][value="manage.content"]'); await page.click("form[data-form=role-save] button.btn");
  await page.waitForSelector("text=Roles run from most to least");
  await page.click("[data-act=role-new]"); await page.fill("#scrim input[name=name]", "Campus pastor"); await page.selectOption("#scrim select[name=from]", "pastor"); await sheetSubmit();
  await page.waitForSelector("form[data-form=role-save]"); await page.check('input[name=p][value="checkin.station"]'); await page.click("form[data-form=role-save] button.btn");
  await goTo("admin-people"); await page.click('[data-act=member-edit][data-user="u-teresa"]');
  const opt = await page.$$eval("#scrim select[name=roleId] option", (os) => os.find((o) => o.textContent === "Campus pastor").value);
  await page.selectOption("#scrim select[name=roleId]", opt); await page.check('#scrim input[name=access][value=some]'); await page.check('#scrim input[name=locs][value="riverside-office"]');
  await sheetSubmit(); await sheetGone(); await expectText("Campus pastor");
});
await step("locations", async () => {
  await goTo("admin-locations"); await page.click("[data-act=loc-edit]:not([data-id])");
  await page.fill("#scrim input[name=name]", "North campus"); await page.fill("#scrim input[name=code]", "east"); await sheetSubmit();
  await page.waitForSelector("#scrim .err"); await page.fill("#scrim input[name=code]", "NORTH");
  await page.check('#scrim input[name=visibility][value=private]', { force: true }); await page.fill("#scrim input[name=time0]", "10:30");
  await page.fill("#scrim textarea[name=rooms]", "Room A\nRoom B"); await sheetSubmit(); await sheetGone(); await expectText("NORTH");
});
await step("features and defaults", async () => {
  await goTo("admin-features"); await page.uncheck("input[name=m_giving]"); await page.click("form[data-form=admin-features] button.btn");
  if (await page.$('.tabs a[href="#give"]')) throw new Error("Give tab still shown with giving off");
  await page.check("input[name=m_giving]"); await page.selectOption("select[name=roleId]", "member"); await page.click("form[data-form=admin-features] button.btn");
});
await step("account and landing page", async () => {
  await goTo("admin-account"); await page.setInputFiles('input[data-field="logo"]', join(root, "icons", "icon-192.png"));
  await page.waitForSelector('[data-preview="logo"] img'); await page.fill('input[name="s_instagram"]', "https://instagram.com/example"); await page.click("form[data-form=admin-account] button.btn");
  await goTo("admin-page"); await page.click("[data-act=block-add]"); await page.click('[data-act=block-new][data-type="hero"]');
  await page.setInputFiles('#scrim input[data-field="image"]', join(root, "icons", "icon-512.png")); await page.waitForSelector('#scrim [data-preview="image"] img');
  await page.fill("#scrim input[name=title]", "Welcome home"); await page.fill("#scrim input[name=buttonLabel]", "Plan a visit"); await page.fill("#scrim input[name=buttonUrl]", "not a link");
  await sheetSubmit(); await page.waitForSelector("#scrim .err"); await page.fill("#scrim input[name=buttonUrl]", "#events"); await sheetSubmit(); await sheetGone();
  await page.click('[data-act=block-move][data-dir="-1"] >> nth=-1');
  await goTo("page-riverside"); await expectText("Welcome home"); await shot("08-landing");
});
await step("banner designer", async () => {
  await goTo("admin-banner"); await page.waitForSelector("#banner-preview .banner");
  await page.fill("input[name=headline]", "Come home"); await page.fill("input[name=sub]", "Sundays at 9 and 11");
  const jsClick = (sel) => page.$eval(sel, (el) => el.click());
  await jsClick('input[name=style][value=script]'); await jsClick('input[name=preset][value=dusk]');
  if (!(await page.textContent("#banner-preview .bn-head")).includes("Come home")) throw new Error("preview didn't update");
  await page.click('[data-act=banner-graphic-add][data-builtin="cross"]'); await page.waitForSelector('input[name="g2_size"]');
  if ((await page.inputValue("input[name=headline]")) !== "Come home") throw new Error("unsaved edits were lost when adding a graphic");
  await page.fill('input[name="g2_size"]', "40"); await page.dispatchEvent('input[name="g2_size"]', "input");
  await page.setInputFiles("input[data-change=banner-graphic-upload]", join(root, "icons", "icon-192.png")); await page.waitForSelector('input[name="g3_size"]');
  await jsClick('input[name=bgType][value=image]'); await page.click("form[data-form=banner-save] button.btn:not([type=button])");
  await page.waitForSelector("form[data-form=banner-save] .err");
  await page.setInputFiles('input[data-field="bgImage"]', join(root, "icons", "icon-512.png")); await page.waitForFunction(() => document.querySelector("#banner-preview .banner").style.background.includes("url"));
  await shot("22-banner-designer");
  await page.click("form[data-form=banner-save] button.btn:not([type=button])"); await page.waitForSelector(".home-top .banner");
  if (!(await page.textContent(".home-top .bn-head")).includes("Come home")) throw new Error("banner not saved");
  await shot("23-home-new-banner");
});
await step("webhooks and embeds", async () => {
  await goTo("admin-integrations"); await page.click("[data-act=hook-edit]:not([data-id])");
  await page.fill("#scrim input[name=url]", "https://example.com/hooks/church"); await sheetSubmit(); await sheetGone();
  await page.click("[data-act=hook-edit][data-id]"); await page.click("#scrim [data-act=hook-test]"); await page.waitForSelector("[data-act=hook-log]");
  await page.click("[data-act=embed-edit]:not([data-id])"); await page.fill("#scrim input[name=title]", "Church store"); await page.fill("#scrim input[name=url]", "https://example.com/store"); await sheetSubmit(); await sheetGone();
  await goTo("connect"); await page.click("[data-act=prayer-new]"); await page.fill("#scrim textarea[name=text]", "Webhook check"); await sheetSubmit(); await sheetGone();
  await goTo("admin-integrations"); await expectText("prayer.created"); await page.click("[data-act=hook-log] >> nth=0"); await page.waitForSelector("#scrim pre.code"); await shot("09-webhook");
});
await step("sermon builder", async () => {
  await goTo("docs-sermon"); await page.click('a[href="#build-riverside-doc-vine"]'); await shot("10-builder");
  await page.click('[data-act=dblock-new][data-type="point"]'); await page.fill("#scrim textarea[name=text]", "Stay connected this week"); await page.fill("#scrim textarea[name=notes]", "Pause here"); await sheetSubmit(); await sheetGone();
  await page.click("[data-act=block-vis] >> nth=0");
  await page.click('[data-act=dblock-new][data-type="scripture"]'); await page.fill("#scrim input[name=ref]", "Ps 23"); await page.click("#scrim [data-act=fill-bible]");
  await page.waitForFunction(() => document.querySelector("#scrim textarea[name=text]").value.includes("shepherd"));
  await sheetSubmit(); await sheetGone();
  await goTo("resource-riverside-doc-vine"); await expectText("Private"); await shot("11-presenter-page");
  await goTo("outline-riverside-doc-vine"); await expectText("You can't manufacture fruit");
});
await step("present a sermon", async () => {
  await goTo("present-doc-riverside-doc-vine"); await page.waitForSelector("#stage"); await shot("12-present");
  for (let i = 0; i < 40 && await page.$('[data-act="pres-go"][data-d="1"]:not([disabled])'); i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("b"); await page.keyboard.press("l");
  await page.click('[data-act=pres-mode][data-mode="scroll"]'); await page.waitForSelector(".scroll-slides"); await page.click('[data-act=pres-mode][data-mode="slideshow"]');
});
await step("service plan and songs", async () => {
  await goTo("services"); await page.click('a[href="#service-riverside-svc-1"]'); await shot("13-service-plan");
  await page.click("[data-act=seg-edit] >> nth=0"); await page.click("#scrim [data-act=item-save]"); await sheetSubmit(); await sheetGone();
  await page.click("[data-act=seg-add]"); await page.click('[data-act=seg-new][data-type="creed"]'); await page.fill("#scrim textarea[name=text]", "We believe in God the Father\n\nAnd in Jesus Christ"); await sheetSubmit(); await sheetGone();
  await goTo("present-service-riverside-svc-1"); await page.waitForSelector("#stage");
  let n = 0; for (; n < 120 && await page.$('[data-act="pres-go"][data-d="1"]:not([disabled])'); n++) await page.click('[data-act="pres-go"][data-d="1"]');
  if (n < 15) throw new Error(`only ${n} slides in the service`);
  await page.click('[data-act=pres-jump][data-i="3"]'); await shot("14-present-service");
  await goTo("songs"); await page.click("[data-act=song-edit]:not([data-id])"); await page.fill("#scrim input[name=title]", "New song"); await page.fill("#scrim textarea[name=pasteText]", "[Verse]\nLine one\nLine two"); await sheetSubmit();
  await page.waitForSelector("#scrim .err"); await page.fill("#scrim input[name=copyright]", "© 2024 Example Music"); await sheetSubmit(); await sheetGone();
  await goTo("services"); await page.click("[data-act=plan-new]"); await page.selectOption("#scrim select[name=from]", "library"); await sheetSubmit(); await page.waitForSelector("text=Order of service");
});
const titles = (sel = "#sort-list > [data-index] .block-top b") => page.$$eval(sel, (bs) => bs.map((b) => b.textContent.trim()));
async function drag(fromIndex, toIndex) {
  const h = await page.$(`#sort-list > [data-index="${fromIndex}"] [data-drag]`), target = await page.$(`#sort-list > [data-index="${toIndex}"]`);
  await h.evaluate((el) => el.scrollIntoView({ block: "center" })); const a = await h.boundingBox(); const b = await target.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  const y = toIndex > fromIndex ? b.y + b.height * 0.8 : b.y + b.height * 0.2;
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + a.width / 2, a.y + (y - a.y) * i / 8);
  await page.mouse.up(); await page.waitForTimeout(120);
}
await step("reorder, sections and layouts in a service plan", async () => {
  await goTo("service-riverside-svc-1");
  const before = await titles();
  await drag(1, 3);
  const after = await titles();
  if (after[3] !== before[1]) throw new Error(`drag didn't move the segment: ${after.slice(0, 5).join(" | ")}`);
  await page.click('[data-act=seg-edit][data-i="3"]'); await page.selectOption("#scrim select[name=_pos]", "1"); await sheetSubmit(); await sheetGone();
  if ((await titles())[1] !== before[1]) throw new Error("position picker didn't move the segment back");
  const iAmazing = (await titles()).indexOf("Amazing Grace");
  await page.click(`[data-act=seg-edit][data-i="${iAmazing}"]`); await page.uncheck('#scrim input[name=sections][value="Verse 2"]'); await sheetSubmit(); await sheetGone();
  await expectText("Verse 1, Verse 3");
  const iRead = (await titles()).indexOf("Scripture reading");
  await page.click(`[data-act=seg-edit][data-i="${iRead}"]`); await page.click("#scrim [data-act=item-save]");
  await page.fill("#scrim input[name=name]", "Vine reading, short"); await page.check('#scrim input[name=p_mode][value=some]', { force: true });
  for (const v of ["5", "6", "7", "8"]) await page.uncheck(`#scrim input[name=p_keys][value="${v}"]`);
  await sheetSubmit(); await sheetGone();
  await goTo("library"); await expectText("Vine reading, short"); await expectText("John 15:1-4");
  await goTo("service-riverside-svc-1"); await page.click("[data-act=layout-save]");
  await page.fill("#scrim input[name=name]", "Test layout");
  await page.check('#scrim input[name=i0_mode][value=empty]', { force: true }); await page.check('#scrim input[name=i1_mode][value=skip]', { force: true });
  await page.check('#scrim input[name=i5_mode][value=some]', { force: true }); await page.uncheck('#scrim input[name=i5_keys][value="1"]');
  await sheetSubmit(); await sheetGone();
  await goTo("layouts-service"); await expectText("Test layout"); await expectText("Standard Sunday"); await shot("19-layouts");
  await page.click("[data-act=layout-open] >> text=Test layout"); await page.fill("#scrim input[name=name]", "Test layout renamed"); await page.click("#scrim form[data-form=layout-rename] button"); await sheetGone();
  await page.click("[data-act=layout-open] >> text=Test layout renamed"); await page.click('#scrim [data-act=plan-new]');
  await page.fill("#scrim input[name=date]", "2026-12-20"); await sheetSubmit(); await page.waitForSelector("#sort-list");
  const n = (await titles()).length; if (n !== 12) throw new Error(`plan from layout has ${n} segments, expected 12`);
  await page.click("[data-act=layout-insert]"); await page.click('#scrim [data-act=layout-insert-go] >> nth=0'); await sheetGone();
  await shot("20-plan-from-layout");
  await goTo("present-service-riverside-svc-1"); await page.waitForSelector("#stage");
  for (let i = 0; i < 80 && await page.$('[data-act="pres-go"][data-d="1"]:not([disabled])'); i++) await page.keyboard.press("ArrowRight");
});
await step("reorder and layouts in the sermon builder", async () => {
  await goTo("build-riverside-doc-vine");
  const before = await titles(); await drag(0, 2);
  if ((await titles())[2] !== before[0]) throw new Error("builder drag didn't move the item");
  await page.focus('#sort-list > [data-index="2"] [data-drag]'); await page.keyboard.press("ArrowUp");
  if ((await titles())[1] !== before[0]) throw new Error("keyboard reorder didn't move the item");
  await page.click('[data-act=dblock-edit][data-i="1"]'); await page.click("#scrim [data-act=item-save]"); await page.fill("#scrim input[name=name]", "Opening keynote"); await sheetSubmit(); await sheetGone();
  await page.click("[data-act=layout-save]"); await page.fill("#scrim input[name=name]", "Vine outline");
  await page.check('#scrim input[name=i0_mode][value=empty]', { force: true }); await sheetSubmit(); await sheetGone();
  await goTo("docs-sermon"); await page.click("[data-act=new-doc]");
  await page.fill("#scrim input[name=title]", "From a layout"); await page.fill("#scrim input[name=passage]", "Romans 12:1-2");
  await page.selectOption("#scrim select[name=from]", { label: "Three-point sermon" }); await sheetSubmit();
  await page.waitForFunction(() => document.body.textContent.includes("living sacrifice"));
  const n = (await titles()).length; if (n !== 7) throw new Error(`doc from layout has ${n} items, expected 7`);
  await page.click("[data-act=saved-blocks]"); await page.click("#scrim [data-act=saved-block-add] >> text=Opening keynote"); await sheetGone();
  await shot("21-doc-from-layout");
});
await step("volunteer scheduling", async () => {
  await goTo("serving"); await page.click('[data-act=team-join][data-team="Media"]'); await page.waitForSelector('[data-act=team-leave][data-team="Media"]');
  await page.click("[data-act=away-add]"); await page.fill("#scrim input[name=from]", "2027-01-10"); await page.fill("#scrim input[name=to]", "2027-01-12"); await sheetSubmit(); await sheetGone();
  await expectText("Jan 10"); await shot("21-serving");
  await goTo("teams"); await expectText("Upcoming services"); await page.click('a[href="#crew-riverside-svc-1"]'); await page.waitForSelector(".crew-row");
  await page.click("[data-act=crew-fill]"); await page.waitForTimeout(150);
  if (await page.$("#scrim")) await page.click("#scrim button[data-act=close-sheet].btn");
  await expectText("Gunter Frazier"); // nobody else on Media is free, so the scheduler (on the team now) gets a spot
  await page.click('[data-act=crew-add][data-position="Keys"]'); await page.click("#cand-list [data-act=crew-assign]:not([disabled]) >> nth=0"); await sheetGone();
  await page.click(".crew-person.pending >> nth=0"); await page.click('#scrim [data-act=crew-set][data-status="accepted"]'); await sheetGone();
  await shot("22-crew");
  await goTo("serving"); await page.click('.ask-card [data-act=ask-no] >> nth=0'); await page.fill("#scrim input[name=note]", "Sick that week"); await sheetSubmit(); await sheetGone();
  await expectText("Can't serve"); await page.click('.ask-card [data-act=ask-yes] >> nth=0'); await expectText("Confirmed");
  await goTo("team-0"); await page.click("[data-act=team-edit]"); await page.fill("#scrim textarea[name=positions]", "Worship leader\nVocals\nKeys\nGuitar\nBass\nDrums"); await sheetSubmit(); await sheetGone(); await expectText("Bass");
  await goTo("teams"); await page.click("[data-act=team-new]"); await page.fill("#scrim input[name=name]", "Hospitality"); await page.fill("#scrim textarea[name=positions]", "Welcome table"); await sheetSubmit(); await sheetGone(); await page.waitForSelector("text=Welcome table");
  await goTo("alerts"); await expectText("Announcements");
});
await step("stage display, countdown and overlay", async () => {
  await goTo("service-riverside-svc-1"); await page.click("[data-act=seg-add]"); await page.click('[data-act=seg-new][data-type="countdown"]');
  await page.selectOption("#scrim select[name=_pos]", "0"); await sheetSubmit(); await sheetGone(); await expectText("Before");
  await goTo("present-service-riverside-svc-1"); await page.click('[data-act=pres-jump][data-i="1"]'); await page.waitForSelector("#stage .slide-countdown");
  await page.click('[data-act=pres-mode][data-mode="stage"]'); await page.waitForSelector(".stage-mon");
  await page.fill("#stage-msg-in", "Repeat the chorus"); await page.click("form[data-form=stage-msg] button"); await page.waitForSelector(".sm-msg");
  await page.click('[data-act=pres-jump][data-i="4"]'); await page.waitForTimeout(1100);
  if (!/left|over/.test(await page.textContent(".sm-timer"))) throw new Error("segment timer missing");
  await shot("23-stage");
  await page.click("[data-act=pres-overlay]"); await page.waitForSelector("#scrim .ov-frame .ov-lt"); await shot("24-overlay"); await page.click("#scrim [data-act=close-sheet]");
  await page.click("[data-act=pres-captions]"); await page.waitForTimeout(300);
  await page.click('[data-act=pres-mode][data-mode="slideshow"]');
  await goTo("stage-service-riverside-svc-1"); await page.waitForSelector(".stage-mon.full"); await shot("25-stage-window");
  await goTo("overlay-service-riverside-svc-1"); await page.waitForSelector(".ov-frame");
  await goTo("home"); await page.waitForSelector(".home-top");
  if (await page.evaluate(() => document.documentElement.classList.contains("overlay-page") || document.body.classList.contains("presenting"))) throw new Error("overlay or presenting styles stuck after leaving");
});
await step("check-in kiosk", async () => {
  await goTo("kiosk"); await page.click("form[data-form=kiosk-start] button"); await page.waitForSelector(".keypad");
  for (const k of "0142") await page.click(`.keypad [data-k="${k}"]`);
  await page.click(".kiosk-fam >> nth=0"); await page.waitForSelector(".kid-tile"); await expectText("Peanuts"); await shot("26-kiosk-kids");
  await page.click("[data-act=kiosk-checkin]"); await page.waitForSelector(".kiosk-done");
  const n = await page.$$eval(".label-sheet .label", (x) => x.length); if (n !== 3) throw new Error(`expected 3 tags, got ${n}`);
  await shot("27-kiosk-tags");
  await page.click(".kiosk-done [data-act=kiosk-reset]"); await page.fill("#kq", "alva"); await page.waitForSelector(".kiosk-fam"); await page.fill("#kq", "");
  await page.click("[data-act=kiosk-guest]"); await page.fill("input[name=name]", "Rosa Diaz"); await page.fill("input[name=phone]", "(770) 555-0199");
  await page.fill("input[name=kid0]", "Ava"); await page.fill("input[name=allergy0]", "Eggs");
  await page.fill("[data-row='0'] [data-bd=m]", "Mar"); await page.fill("[data-row='0'] [data-bd=d]", "14"); await page.fill("[data-row='0'] [data-bd=y]", "2020");
  if ((await page.inputValue("input[name=birth0]")) !== "2020-03-14") throw new Error("kiosk birthday boxes didn't make a date"); await shot("26b-kiosk-guest"); await page.click("[data-act=kiosk-more]"); await page.fill("input[name=kid1]", "Leo");
  await page.click("form[data-form=kiosk-guest] button.btn:not([type=button])"); await page.waitForSelector(".kiosk-done"); await expectText("Allergy: Eggs");
  await page.click("[data-act=kiosk-exit]"); await page.click("#scrim [data-act=kiosk-leave]"); await page.waitForSelector("form[data-form=checkout]");
});
await step("release at pickup", async () => {
  await expectText("Allergy alerts");
  const code = await page.$eval(".row:has-text('Nora Bell') .code", (e) => e.textContent.trim());
  await page.fill("form[data-form=checkout] input[name=code]", code); await page.click("form[data-form=checkout] button");
  await page.waitForSelector('#scrim [data-act=release][data-name="Sue Bell"]'); await page.waitForTimeout(300); await shot("28-release");
  await page.click('#scrim [data-act=release][data-name="Sue Bell"]'); await sheetGone(); await expectText("Picked up by Sue");
});
await step("song sections", async () => {
  await goTo("songs"); await page.click("[data-act=song-edit][data-id=riverside-song-assurance]"); await page.waitForSelector("#sp-list");
  if ((await page.$$("#sp-list > .sp")).length !== 6) throw new Error("Blessed Assurance should open with 6 sections");
  const iCh = (await page.$$eval("#sp-list [data-sp=label]", (xs) => xs.map((x) => x.value))).indexOf("Chorus");
  await page.fill(`#sp-list [data-sp=label][data-i="${iCh}"]`, "Refrain");
  await page.click("#scrim [data-act=sp-custom]"); await page.fill("#sp-custom-name", "Tag"); await page.press("#sp-custom-name", "Enter");
  await page.waitForSelector("#sp-list > .sp.pt-custom"); await page.fill("#sp-list > .sp.pt-custom textarea", "Praising my Savior all the day long");
  await page.click('#sp-order [data-act=sp-order-add] >> text=Tag');
  const order = await page.$$eval("#sp-order .sp-order li", (xs) => xs.map((x) => x.textContent.trim()));
  if (order.filter((x) => x === "Refrain").length !== 3 || order.at(-1) !== "Tag") throw new Error(`order: ${order.join(", ")}`);
  await page.selectOption('#sp-list [data-sp=type][data-i="0"]', "verse"); // the intro becomes a verse and follows its kind
  if ((await page.inputValue('#sp-list [data-sp=label][data-i="0"]')) !== "Verse 4") throw new Error("changing the kind didn't relabel");
  await page.selectOption('#sp-list [data-sp=type][data-i="0"]', "intro");
  await shot("50-song-sections"); await sheetSubmit(); await sheetGone();
  // Pasted lyrics with plain headings split into sections.
  await page.click("[data-act=song-edit]:not([data-id])"); await page.fill("#scrim input[name=title]", "Split test");
  await page.fill("#scrim textarea[name=pasteText]", "Verse 1\nOne\nTwo\n\nPre-Chorus\nThree\n\nChorus\nFour\nFive\n\nBridge\nSix\n\nOutro"); await page.click("#scrim [data-act=song-split]");
  const kinds = await page.$$eval("#sp-list > .sp", (xs) => xs.map((x) => [...x.classList].find((c) => c.startsWith("pt-"))));
  if (kinds.join() !== "pt-verse,pt-prechorus,pt-chorus,pt-bridge,pt-outro") throw new Error(`split kinds: ${kinds.join()}`);
  await page.check("#scrim input[name=publicDomain]"); await sheetSubmit(); await sheetGone();
  // The presenter: section buttons, skipping ahead, and playing a section again.
  const tv = await ctx.newPage(); await tv.setViewportSize({ width: 1280, height: 720 }); tv.on("pageerror", (e) => errors.push(`display: ${e.message}`));
  await tv.goto(base + "#display-service-riverside-svc-1"); await tv.waitForSelector(".display .stage");
  await page.setViewportSize({ width: 1280, height: 900 });
  await goTo("present-service-riverside-svc-1"); await page.click(".slide-pick >> text=Intro: Blessed Assurance"); await page.waitForSelector(".song-bar .sec-chip.on");
  await page.keyboard.press("3"); // Refrain: next one in the plan
  if ((await page.textContent(".song-bar .sec-chip.on")).trim().replace(/^\d/, "") !== "Refrain") throw new Error("key 3 didn't go to the refrain");
  await page.click(".song-bar .sec-chip >> text=Verse 1"); await page.waitForSelector(".live-tag");
  await tv.waitForFunction(() => document.querySelector(".display .slide-lyrics")?.textContent.startsWith("Blessed assurance"));
  await shot("51-present-sections");
  await page.click('[data-act="pres-go"][data-d="1"]'); // Verse 1 is one slide, so the plan carries on after the refrain
  if (await page.$(".live-tag")) throw new Error("still on the added section");
  if (!(await page.textContent("#stage")).includes("Perfect submission, perfect delight")) throw new Error("didn't carry on with Verse 2");
  await tv.close(); await page.setViewportSize({ width: 390, height: 844 });
});
await step("digital signage", async () => {
  await goTo("signs"); await page.waitForSelector(".sign-card"); await shot("40-signs");
  await page.click(".sign-card >> nth=0"); await page.waitForSelector(".sign-preview .sg-stage");
  await page.click("[data-act=sign-add]"); await page.click('#scrim [data-act=sign-new-slide][data-type="text"]');
  await page.fill("#scrim input[name=title]", "Coffee is on us"); await page.fill("#scrim textarea[name=body]", "Grab a cup in the cafe before the service."); await sheetSubmit(); await sheetGone();
  await expectText("Coffee is on us"); await shot("41-sign-edit");
  await goTo("signs"); await page.click("[data-act=sign-new]"); await page.fill("#scrim input[name=name]", "Kids hallway");
  await page.check("#scrim input[name=orientation][value=portrait]", { force: true }); await page.uncheck("#scrim input[name=starter]", { force: true }); await sheetSubmit();
  await page.waitForSelector(".sign-preview .sg-stage.portrait");
  await page.click("[data-act=sign-add]"); await page.click('#scrim [data-act=sign-new-slide][data-type="verse"]'); await page.fill("#scrim input[name=ref]", "isaiah 40:31"); await sheetSubmit(); await sheetGone();
  await page.click("[data-act=sign-add]"); await page.click('#scrim [data-act=sign-new-slide][data-type="qr"]'); await page.fill("#scrim input[name=title]", "New here?"); await sheetSubmit(); await sheetGone();
  await expectText("Isaiah 40:31"); await shot("42-sign-portrait");
  await goTo("signage-sign-lobby"); await page.waitForSelector(".sign-player .sg-stage");
  if (!(await page.evaluate(() => document.body.classList.contains("presenting")))) throw new Error("player isn't full screen");
});
// Screens and kiosks open in other tabs, like separate devices would.
const tab = async (w, h) => { const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); p.on("pageerror", (e) => errors.push(`device tab: ${e.message}`)); return p; };
const pairNew = async (type, fill = async () => {}) => {
  await goTo("devices"); await page.click("[data-act=device-new]"); await page.locator(`#scrim input[name=type][value=${type}]`).evaluate((el) => el.click());
  await fill(); await sheetSubmit(); await page.waitForSelector("#scrim .pair-code"); return (await page.textContent("#scrim .pair-code")).trim();
};
await step("signage player slides", async () => {
  const tv = await tab(1280, 720);
  await tv.goto(base + "?debug#signage-sign-lobby"); await tv.waitForSelector(".sign-player .sg-stage"); await tv.waitForTimeout(800);
  const n = await tv.evaluate(() => __app.signPlay.slides.length);
  if (n < 6) throw new Error(`lobby playlist has only ${n} slides`);
  for (let i = 0; i < n; i++) { await tv.evaluate((x) => { __app.signPlay.i = x; __app.render(); }, i); await tv.waitForTimeout(800); await tv.screenshot({ path: join(shots, `43-sign-${i}-${await tv.evaluate(() => __app.signPlay.slides[__app.signPlay.i].kind)}.png`) }); }
  await tv.close();
});
await step("pair a kiosk", async () => {
  const code = await pairNew("kiosk", () => page.fill("#scrim input[name=exitPin]", "2468")); await shot("44-pair-sheet");
  // With no server behind it, the code is for practice in this browser only, and the sheet says so instead of offering a QR code.
  if (!/practice code/.test(await page.textContent("#scrim")) || await page.$("#scrim .pair-qr")) throw new Error("the pairing sheet doesn't say the code is practice-only here");
  const k = await tab(1024, 768); await k.goto(base + "#pair");
  if (!/only practice codes made in this browser/.test(await k.textContent("form[data-form=pair]"))) throw new Error("the pairing screen doesn't say it only takes practice codes here");
  // A code that isn't known says what to check, including where the code was made.
  await k.fill("input[name=code]", "ZZZZZZ"); await k.click("form[data-form=pair] button.btn"); await k.waitForSelector("form[data-form=pair] .pair-help");
  if (!/demo, in training or in a preview/.test(await k.textContent(".pair-help"))) throw new Error("a failed code doesn't explain practice codes");
  await k.screenshot({ path: join(shots, "44b-pair-failed.png") });
  await k.fill("input[name=code]", code.toLowerCase()); await k.click("form[data-form=pair] button.btn");
  await k.waitForSelector(".keypad"); await k.screenshot({ path: join(shots, "45-kiosk-device.png") });
  await page.waitForSelector("#scrim", { state: "detached" }); // the admin's pairing sheet closes by itself
  await k.evaluate(() => { location.hash = "home"; }); await k.waitForTimeout(150);
  if ((await k.evaluate(() => location.hash)) !== "#kiosk") throw new Error("kiosk device left its screen");
  await k.click("[data-act=device-exit]"); await k.fill("#scrim input[name=pin]", "1111"); await k.click("#scrim form button.btn.danger"); await k.waitForSelector("#scrim .form-error, #scrim [role=alert]");
  await k.fill("#scrim input[name=pin]", "2468"); await k.click("#scrim form button.btn.danger"); await k.waitForSelector(".home-top");
  await k.close();
  await goTo("devices"); await expectText("Check-in kiosk"); await expectText("Online");
});
await step("screens follow the booth", async () => {
  const code = await pairNew("display"); await page.click("#scrim [data-act=close-sheet]");
  const scr = await tab(1280, 720); await scr.goto(base + `#pair-${code}`); await scr.click("form[data-form=pair] button");
  await scr.waitForSelector(".display .slide.k-logo");
  const code2 = await pairNew("stage"); await page.click("#scrim [data-act=close-sheet]");
  const mon = await tab(1280, 720); await mon.goto(base + `#pair-${code2}`); await mon.click("form[data-form=pair] button"); await mon.waitForSelector(".display, .sign-player");
  await goTo("present-service-riverside-svc-1"); await page.waitForSelector("#stage .slide");
  await scr.waitForSelector(".display .slide:not(.k-logo)"); await mon.waitForSelector(".stage-mon.full");
  await page.click('[data-act=pres-jump][data-i="3"]'); await page.waitForTimeout(250);
  await scr.screenshot({ path: join(shots, "46-display-follows.png") }); await mon.screenshot({ path: join(shots, "47-stage-follows.png") });
  await goTo("home"); await scr.waitForSelector(".display .slide.k-logo"); await mon.waitForSelector(".display .slide.k-logo");
  await scr.close(); await mon.close();
});
await step("booth and signage devices", async () => {
  const code = await pairNew("booth"); await page.click("#scrim [data-act=close-sheet]");
  const b = await tab(1280, 800); await b.goto(base + `#pair-${code}`); await b.click("form[data-form=pair] button");
  await b.waitForSelector(".booth-main .row"); await b.screenshot({ path: join(shots, "48-booth.png") });
  await b.click(".booth-main a.row >> nth=0"); await b.waitForSelector(".present-main");
  if ((await b.getAttribute(".present-bar a.icon-btn", "href")) !== "#booth") throw new Error("booth back link");
  await b.evaluate(() => { location.hash = "devices"; }); await b.waitForTimeout(150);
  if ((await b.evaluate(() => location.hash)) !== "#booth") throw new Error("booth device left its screens");
  await b.close();
  const code2 = await pairNew("signage", () => page.selectOption("#scrim select[name=playlistId]", "sign-lobby")); await page.click("#scrim [data-act=close-sheet]");
  const s = await tab(1280, 720); await s.goto(base + `#pair-${code2}`); await s.click("form[data-form=pair] button");
  await s.waitForSelector(".sign-player .sg-stage"); if ((await s.evaluate(() => location.hash)) !== "#signage-sign-lobby") throw new Error("signage device didn't start its playlist");
  await page.click(".row:has-text('Signage screen')"); await page.click("#scrim [data-act=device-remove]"); await page.click("#scrim [data-act=device-remove-yes]");
  await s.waitForFunction(() => !document.body.classList.contains("device-mode")); await s.close();
  await goTo("devices"); await shot("49-devices");
});
await step("rooms: numbers and where they are, and a room display teachers present to", async () => {
  await page.goto(base + "?debug#admin-rooms"); await expectText("Education building, 2nd floor");
  await page.click('[data-act=room-info][data-room="riverside-main~Room%20106"]');
  await page.fill("#scrim input[name=number]", "106B"); await page.fill("#scrim input[name=where]", "Kids wing, by the nursery"); await sheetSubmit(); await sheetGone();
  await expectText("Kids wing, by the nursery"); await shot("50-rooms");
  // Renaming a room carries through to its classes and bookings.
  await page.click('[data-act=room-info][data-room="riverside-main~Room%20106"]'); await page.fill("#scrim input[name=name]", "Room 106B"); await sheetSubmit(); await sheetGone();
  if (!(await page.evaluate(() => __app.S.list("gatherings").some((g) => g.room === "Room 106B")))) throw new Error("renaming didn't reach the class that meets there");
  // A display for Room 201: signage when it's free.
  await page.click('[data-act=room-info][data-room="riverside-main~Room%20201"]'); await page.click("#scrim [data-act=device-new][data-type=room]");
  if ((await page.$eval("#scrim select[name=roomKey]", (s) => s.value)) !== "riverside-main~Room 201") throw new Error("the room wasn't filled in");
  await page.selectOption("#scrim select[name=roomPlaylistId]", "sign-lobby"); await sheetSubmit(); await page.waitForSelector("#scrim .pair-code");
  const code = (await page.textContent("#scrim .pair-code")).trim(); await page.click("#scrim [data-act=close-sheet]");
  const tv = await tab(1280, 720); await tv.goto(base + `?debug#pair-${code}`); await tv.click("form[data-form=pair] button");
  await tv.waitForSelector(".room-hint"); await tv.waitForSelector(".sign-player");
  if ((await tv.evaluate(() => location.hash)) !== "#display-room") throw new Error("the room display went somewhere else");
  await tv.screenshot({ path: join(shots, "51-room-display-free.png") });
  // A teacher with the room presents from their phone; the display follows, without its QR card.
  await goTo("roompresent-riverside-main~Room%20201"); await expectText("What do you want to show?"); await shot("52-room-present");
  await page.click('[data-act=room-start][data-key^="doc-"] >> nth=0'); await page.waitForSelector(".room-strip");
  await tv.waitForSelector(".display .slide.k-title", { timeout: 10000 });
  const first = await tv.textContent(".display .slide");
  await page.click('[data-act="pres-go"][data-d="1"]');
  await tv.waitForFunction((t) => document.querySelector(".display .slide")?.textContent !== t, first, { timeout: 10000 });
  if (await tv.$(".room-hint")) throw new Error("the QR card shows during a presentation");
  await shot("53-room-presenting"); await tv.screenshot({ path: join(shots, "54-room-display-presenting.png") });
  // Stopping hands the display back straight away.
  await page.click(".room-strip [data-act=room-stop]"); await tv.waitForSelector(".sign-player", { timeout: 8000 });
  await page.waitForFunction(() => location.hash.startsWith("#roompresent-"));
  // So does time running out, on the display by itself and on the presenter's phone.
  await page.click('[data-act=room-start][data-key^="doc-"] >> nth=0'); await tv.waitForSelector(".display .slide.k-title", { timeout: 10000 });
  await tv.evaluate(() => __app.S.state.roomSessions.forEach((x) => { x.until = new Date(Date.now() - 1000).toISOString(); }));
  await tv.waitForSelector(".sign-player", { timeout: 8000 });
  await page.evaluate(() => { __app.pres.room.until = Date.now() - 1000; });
  await page.waitForFunction(() => location.hash.startsWith("#roompresent-"), null, { timeout: 8000 });
  if (await page.evaluate(() => __app.S.state.roomSessions.length)) throw new Error("the presentation's record wasn't cleared");
  // Who has a room: the class's teacher from 15 minutes before it starts until it ends, and not on another day.
  const access = await page.evaluate(() => {
    const sun = new Date(); sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7 || 7)); sun.setHours(8, 50, 0, 0);
    const at = (h, m) => { const d = new Date(sun); d.setHours(h, m); return d.getTime(); };
    const a = (t) => __app.roomAccess("u-linda", "riverside-main", "Room 104", t);
    return [a(at(8, 30)).ok, a(at(8, 50)).ok, a(at(10, 0)).ok, a(at(10, 20)).ok, a(at(8, 50)).until === at(10, 15), a(at(8, 50) + 86400e3).ok];
  });
  if (JSON.stringify(access) !== "[false,true,true,false,true,false]") throw new Error(`room access times are off: ${access}`);
  await tv.close();
});
await step("pickups and allergies at home", async () => {
  await goTo("household"); await page.click("[data-act=person-edit][data-id] >> nth=0");
  await page.fill("#scrim input[name=allergies]", "Penicillin"); await sheetSubmit(); await sheetGone(); await expectText("Allergy: Penicillin");
  await page.click("[data-act=pickup-edit]:not([data-id])"); await page.fill("#scrim input[name=name]", "Grandpa Joe"); await page.fill("#scrim input[name=relation]", "Grandfather"); await sheetSubmit(); await sheetGone();
  await expectText("Grandpa Joe");
});
await step("newcomer follow-up", async () => {
  await goTo("followup"); await expectText("Priya Shah"); await expectText("Rosa Diaz"); await shot("29-followup");
  await page.click('a.row:has-text("Priya Shah")'); await page.waitForSelector(".step-row");
  await page.click(".step-row >> nth=0"); await expectText("Contacted");
  await page.fill("form[data-form=follow-note] textarea", "Texted a welcome and the newcomers lunch date."); await page.click("form[data-form=follow-note] button");
  await expectText("newcomers lunch date"); await page.selectOption("select[data-change=follow-assign]", { index: 1 });
  await page.click('[data-act=follow-status][data-v="connected"]'); await shot("30-guest");
  await goTo("followup"); await page.click("[data-act=follow-new]"); await page.fill("#scrim input[name=name]", "Walk-in visitor"); await sheetSubmit(); await page.waitForSelector(".step-row");
  await goTo("followup"); await page.click("[data-act=follow-steps]"); await sheetSubmit(); await sheetGone();
});
await step("reports", async () => {
  await goTo("reports"); await expectText("Average week"); await expectText("By fund");
  await page.hover(".viz[data-viz=att] .viz-col >> nth=6"); await page.waitForSelector(".viz[data-viz=att] .viz-tip:not([hidden])"); await shot("31-reports");
  await page.selectOption("select[data-change=report-range]", "12m"); await page.waitForSelector(".viz[data-viz=give] .viz-col");
  await page.click("[data-act=att-record]"); await page.fill("#scrim input[name=adults]", "180"); await page.fill("#scrim input[name=online]", "64"); await sheetSubmit(); await sheetGone();
  await page.click(".viz[data-viz=att] summary"); await page.waitForSelector(".viz[data-viz=att] .mini-table");
  await page.emulateMedia({ colorScheme: "dark" }); await goTo("reports"); await shot("32-reports-dark"); await page.emulateMedia({ colorScheme: "light" });
});
async function signPad(sel = ".sig-pad") {
  const c = await page.$(sel); await c.evaluate((el) => el.scrollIntoView({ block: "center" })); await page.waitForTimeout(80); const b = await c.boundingBox();
  await page.mouse.move(b.x + 30, b.y + 90); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + 30 + i * 18, b.y + 90 - (i % 2 ? 25 : 0));
  await page.mouse.up();
}
await step("paid event and permission slip", async () => {
  await goTo("event-riverside-e7"); await expectText("Student $85"); await page.click("[data-act=event-register]");
  await page.fill('#scrim input[name="t_t-student"]', "1"); await page.check('#scrim input[name=kids] >> nth=0');
  await page.waitForSelector("#scrim [data-total]:has-text('$85')"); await sheetSubmit();
  await page.waitForSelector("#scrim [data-act=pay-test]"); await shot("33-checkout"); await page.click("#scrim [data-act=pay-test]");
  await page.waitForSelector("form[data-form=form-submit]"); await expectText("Youth retreat permission slip");
  await page.click("form[data-form=form-submit] button.btn:not([type=button])"); await page.waitForSelector("form[data-form=form-submit] .err");
  await page.fill("form[data-form=form-submit] input[name=f_q3]", "Pat Frazier"); await page.fill("form[data-form=form-submit] input[name=f_q4]", "(555) 010-2000");
  await page.check('form[data-form=form-submit] input[name=f_q5][value=Yes]', { force: true }); await page.check('form[data-form=form-submit] input[name=f_q6][value=No]', { force: true });
  await signPad(); await shot("34-permission-slip");
  await page.click("form[data-form=form-submit] button.btn:not([type=button])"); await page.waitForSelector(".done-panel");
  await page.click(".done-panel [data-act=form-finish]"); await page.waitForSelector("text=permission slip done");
  await page.click("[data-act=event-cancel]"); await page.click('#scrim [data-act=event-cancel][data-sure="1"]'); await sheetGone(); await page.waitForSelector("text=Get tickets");
});
await step("form builder and responses", async () => {
  await goTo("forms"); await expectText("Volunteer application"); await page.click("[data-act=form-new]"); await page.click('#scrim [data-act=form-create][data-t="slip"]');
  await page.waitForSelector("#sort-list"); await page.click("[data-act=field-add]"); await page.click('#scrim [data-act=field-new][data-type="choice"]');
  await page.fill("#scrim input[name=label]", "T-shirt size"); await page.fill("#scrim textarea[name=options]", "Small\nMedium\nLarge"); await page.check("#scrim input[name=required]"); await sheetSubmit(); await sheetGone();
  await expectText("Small, Medium, Large"); await drag(9, 1); await shot("35-form-builder");
  await page.click("[data-act=form-settings]"); await page.fill("#scrim input[name=title]", "Lock-in permission slip"); await page.fill("#scrim input[name=fee]", "10"); await page.check("#scrim input[name=listed]"); await sheetSubmit(); await sheetGone();
  await page.click('a:has-text("Preview")'); await page.waitForSelector("form[data-form=form-submit]");
  for (const inp of await page.$$("form[data-form=form-submit] input[type=tel]")) await inp.fill("(555) 010-3000");
  for (const n of await page.$$eval("form[data-form=form-submit] .radios input[name^=f_]", (xs) => [...new Set(xs.map((x) => x.name))])) await page.check(`form[data-form=form-submit] input[name="${n}"] >> nth=0`, { force: true });
  for (const inp of await page.$$("form[data-form=form-submit] input[type=text][name^=f_]")) if (!(await inp.inputValue())) await inp.fill("Pat Frazier");
  await signPad(); await page.click("form[data-form=form-submit] button.btn:not([type=button])");
  await page.waitForSelector("#scrim [data-act=pay-test]"); await page.click("#scrim [data-act=pay-test]"); await page.waitForSelector(".done-panel");
  await page.click(".done-panel [data-act=form-finish]"); await page.waitForTimeout(100);
  const id = await page.evaluate(() => location.hash); if (id !== "#forms") throw new Error(`after Done went to ${id}`);
  await page.click('a.row:has-text("Lock-in permission slip")'); await page.click('a:has-text("1 response")'); await page.click("[data-act=response-open]");
  await page.waitForSelector("#scrim .sig-img"); await shot("36-response"); await page.click("#scrim [data-act=close-sheet]");
  await goTo("connect"); await page.click('nav.seg a[href="#forms"]'); await page.waitForSelector("text=Volunteer application");
});
await step("room booking", async () => {
  await goTo("rooms"); await expectText("Wedding rehearsal"); await page.click("[data-act=room-approve]"); await expectText("Your bookings").catch(() => {});
  await page.click('[data-act=room-request][data-room="Room 104"]'); await page.fill("#scrim input[name=title]", "Parent meeting");
  const sunday = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await page.fill("#scrim input[name=date]", sunday); await page.fill("#scrim input[name=start]", "09:30"); await page.fill("#scrim input[name=end]", "10:00");
  await page.dispatchEvent("#scrim input[name=end]", "change"); await page.waitForSelector("#scrim .room-msg.warn"); await shot("37-room-conflict");
  await sheetSubmit(); await page.waitForSelector("#scrim .err");
  await page.click("#scrim [data-act=room-switch] >> nth=0"); await page.waitForSelector("#scrim .room-msg.ok"); await sheetSubmit(); await sheetGone();
  await expectText("Parent meeting"); await shot("38-rooms");
});
await step("sermon archive, transcript and podcast", async () => {
  await goTo("word"); await page.fill("input[data-input=sermon-search]", "Tuesday"); await page.waitForSelector("#sermon-list .snippet mark");
  await shot("39-sermon-search"); await page.click("#sermon-list a.row >> nth=0"); await page.waitForSelector("details.transcript");
  await page.click("details.transcript summary"); await page.fill("input[data-input=transcript-search]", "friends"); await page.waitForSelector(".tx-body mark");
  await page.click('a:has-text("Media and transcript")'); await page.waitForSelector("form[data-form=media-save]");
  await page.fill("textarea[name=transcript]", "WEBVTT\n\n00:00:05.000 --> 00:00:09.000\nWelcome back, church.\n\n00:01:10.000 --> 00:01:15.000\nTurn with me to Psalm 23.");
  await page.click("form[data-form=media-save] button.btn:not([type=button])"); await page.waitForSelector("details.transcript");
  await page.click("details.transcript summary"); await page.waitForSelector(".tx-t:has-text('1:10')"); await shot("40-transcript");
  await goTo("podcast"); await page.fill("form[data-form=podcast-save] input[name=email]", "media@riverside.example"); await page.click("form[data-form=podcast-save] button");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=podcast-download]")]);
  const xml = readFileSync(await dl.path(), "utf8");
  if (!xml.includes("<enclosure") || !xml.includes("Remain in my love") || !xml.includes("media@riverside.example")) throw new Error("podcast feed is missing episodes or the owner email");
});
await step("AI drafts", async () => {
  await page.evaluate(() => { window.__aiStub = async (p) => p.includes("Sunday school lesson")
    ? { bigIdea: "Jesus loves us first so we can love others.", story: "Jesus ate a special meal with his friends and told them a story about a vine.", questions: ["Who did Jesus call his friends?", "How can you love someone this week?"], activity: { name: "Paper vine", supplies: "Green paper, tape", steps: "Make a vine with a leaf for each child." }, memoryVerse: "As the Father has loved Me, so have I loved you.", memoryRef: "John 15:9", parents: "Today we learned Jesus calls us friends. Ask: how did you show love today?" }
    : p.includes("summary of this sermon") ? { summary: "Jesus calls us friends and asks us to love one another.", outline: ["Love has a source", "Obedience keeps love at home", "Friends love one another"] }
    : { questions: [{ kind: "notice", text: "What does Jesus say about his Father's love?" }, { kind: "mean", text: "Why does he call us friends and not servants?" }, { kind: "apply", text: "Who will you love in a concrete way this week?" }], prayer: "Ask God to help you remain in his love." }; });
  await goTo("word"); await page.fill("input[data-input=sermon-search]", "Remain in my love"); await page.click("#sermon-list a.row >> nth=0");
  await page.click("[data-act=ai-questions]"); await page.waitForSelector("#scrim .ai-list"); await shot("41-ai-questions");
  await page.click("#scrim [data-act=ai-to-study]"); await page.waitForSelector("#sort-list"); await expectText("Why does he call us friends");
  await page.click("[data-act=ai-build]"); await page.waitForSelector("#scrim [data-act=ai-add]"); await page.click("#scrim [data-act=ai-add]"); await sheetGone();
  await page.goBack(); await page.waitForSelector("[data-act=ai-lesson]"); await page.click("[data-act=ai-lesson]"); await sheetSubmit();
  await page.waitForSelector("text=Jesus loves us first"); await shot("42-ai-lesson");
  await page.evaluate(() => { delete window.__aiStub; });
});
await step("settings: Spanish, text size and notifications", async () => {
  await goTo("settings"); await page.click('[data-act=set-lang][data-v="es"]'); await page.waitForSelector("text=Idioma");
  await goTo("home"); await page.waitForSelector('nav.tabs >> text=Inicio'); await shot("43-home-es");
  await goTo("events"); await expectText("Eventos"); await goTo("checkin"); await expectText("Registrar");
  await goTo("event-riverside-e8"); await expectText("Comprar boletos"); await shot("44-event-es");
  await goTo("settings"); await page.check('input[name=text][value="xl"]', { force: true });
  if (!(await page.evaluate(() => document.documentElement.classList.contains("text-xl")))) throw new Error("text size didn't apply");
  await page.click('label.switch-row:has-text("Más contraste") input'); await shot("45-settings-es");
  await page.click('[data-act=set-lang][data-v="en"]'); await page.waitForSelector("text=Language");
  await page.check('input[name=text][value="m"]', { force: true }); await page.click('label.switch-row:has-text("More contrast") input');
  await page.click('label.switch-row:has-text("Messages") input');
  await goTo("chat"); await page.click(".rows a.row >> nth=0"); await page.fill("#msg", "See you Sunday!"); await page.press("#msg", "Enter");
  await goTo("sermon-riverside-s0").catch(() => {}); await goTo("word"); await page.click("#sermon-list a.row >> nth=0"); await page.waitForSelector("[data-act=listen]");
  await goTo("admin-news"); await page.click("[data-act=admin-edit]:not([data-id])"); await page.fill("#scrim input[name=title]", "Parking lot closed Sunday");
  await page.fill("#scrim textarea[name=body]", "Use the east lot and the shuttle."); await page.check("#scrim input[name=push]"); await sheetSubmit(); await sheetGone();
  await goTo("alerts"); await expectText("Parking lot closed Sunday");
});
await step("read aloud: the most natural voice, a voice picker, speed, and references said in words", async () => {
  await goTo("settings"); await page.waitForSelector("#voice-en");
  const opts = await page.$$eval("#voice-en option", (os) => os.map((o) => o.textContent));
  if (!/^Best available: Ava \(Premium\)/.test(opts[0])) throw new Error(`the automatic voice should be Ava (Premium): ${opts[0]}`);
  if (opts.some((o) => /Bubbles/.test(o))) throw new Error("a novelty voice is listed");
  if (/Fred/.test(opts[1])) throw new Error("a dated voice is near the top");
  await page.selectOption("#voice-en", "Samantha");
  await page.waitForFunction(() => window.__spoken.some((s) => s.voice === "Samantha" && /read aloud will sound/.test(s.text)));
  await page.$eval('input[name=rate][value="1.15"]', (el) => el.click()); // a forced tap here can land on the tab bar
  await page.waitForFunction(() => window.__spoken.some((s) => s.voice === "Samantha" && s.rate === 1.15));
  await shot("46-read-aloud-settings");
  await page.evaluate(() => { window.__spoken.length = 0; });
  await goTo("word"); await page.click("#sermon-list a.row >> nth=0"); await page.click('[data-act=listen][data-src^="passage:"]');
  await page.waitForSelector('[data-act=listen][data-src^="passage:"][aria-pressed=true]');
  await page.waitForFunction(() => window.__spoken.length >= 2);
  const said = await page.evaluate(() => window.__spoken);
  if (!/ chapter \d+, verses? \d+/.test(said[0].text)) throw new Error(`the reference wasn't said in words: ${said[0].text}`);
  if (said.some((s) => s.voice !== "Samantha" || s.rate !== 1.15)) throw new Error("the chosen voice or speed wasn't used");
  if (said.some((s) => s.text.length > 200)) throw new Error("a piece is too long to read smoothly");
  if (/^\d/.test(said[1].text)) throw new Error(`verse numbers were read: ${said[1].text}`);
  await page.click('[data-act=listen][data-src^="passage:"]');
  await page.waitForSelector('[data-act=listen][data-src^="passage:"][aria-pressed=false]');
  const n = await page.evaluate(() => window.__spoken.length); await page.waitForTimeout(600);
  if ((await page.evaluate(() => window.__spoken.length)) !== n) throw new Error("reading went on after Stop");
  await goTo("settings"); await page.selectOption("#voice-en", ""); await page.$eval('input[name=rate][value="1"]', (el) => el.click());
  await page.click('[data-act=set-lang][data-v="es"]'); await page.waitForSelector("#voice-es");
  if (!(await page.$("#voice-en"))) throw new Error("Spanish speakers need an English voice for the Bible too");
  await expectText("Voz en español"); await page.click('[data-act=set-lang][data-v="en"]'); await page.waitForSelector("text=Language");
});
await step("bible: reader, highlights, notes, related passages, past sermons and Logos links", async () => {
  // Look up a passage from the Word tab: it opens in the Bible here.
  await goTo("word"); await page.fill("form[data-form=bible-lookup] input[name=ref]", "John 15:5"); await page.press("form[data-form=bible-lookup] input[name=ref]", "Enter");
  await page.waitForSelector("#v5.flash"); if ((await page.evaluate(() => location.hash)) !== "#bible-john-15-5") throw new Error("the look-up didn't open the reader");
  if ((await page.$$(".bv")).length !== 27) throw new Error("John 15 should have 27 verses");
  if (!(await page.$(".past"))) throw new Error("past sermons on John 15 aren't shown");
  if (!(await page.$$(".bv.preached")).length) throw new Error("verses preached on aren't marked");
  if (!/^https:\/\/ref\.ly\/Jn15$/.test(await page.getAttribute('.bible-tools a[href^="https://ref.ly/"]', "href"))) throw new Error("the Logos link for the chapter is wrong");
  await page.evaluate(() => scrollTo(0, 0)); await shot("55-bible");
  // Highlight two verses, write a note on one, see related passages.
  await page.click("#v5"); await page.click("#v6"); await page.waitForSelector(".bible-actions");
  if ((await page.textContent(".bible-actions b")) !== "John 15:5-6") throw new Error("the selection label is wrong");
  if ((await page.getAttribute('.bible-actions a[href^="https://ref.ly/"]', "href")) !== "https://ref.ly/Jn15.5-6") throw new Error("the Logos link for the verses is wrong");
  await shot("56-bible-selected");
  await page.click("[data-act=bible-hl][data-c=green]"); await page.waitForSelector("#v5.hl-green"); await page.waitForSelector("#v6.hl-green");
  await page.click("#v5"); await page.click(".bible-actions [data-act=bible-note]"); await page.fill("#scrim textarea[name=text]", "Remain: stay close every day."); await sheetSubmit(); await sheetGone();
  await page.waitForSelector(".bv-note");
  await page.click("#v5"); await page.click(".bible-actions [data-act=bible-xref]"); await page.waitForSelector("#xref-sheet .row");
  if (!/OpenBible\.info/.test(await page.textContent("#xref-sheet"))) throw new Error("the cross-references aren't credited");
  await shot("57-bible-related"); await page.click("#xref-sheet .row >> nth=0"); await page.waitForFunction(() => /^#bible-/.test(location.hash) && location.hash !== "#bible-john-15-5");
  // The book and chapter picker, and the KJV.
  await page.click("[data-act=bible-pick]"); await page.click('[data-act=bible-book][data-b="18"]'); await page.click('#bp-chapters [data-to="psalms-23"]');
  await page.waitForFunction(() => location.hash === "#bible-psalms-23"); await page.click('[data-act=bible-t][data-t="KJV"]');
  await page.waitForFunction(() => /maketh me to lie down in green pastures/.test(document.querySelector(".bible-text")?.textContent || ""), null, { timeout: 8000 }).catch(() => { throw new Error("the KJV didn't load"); });
  await page.click('[data-act=bible-t][data-t="BSB"]');
  // My notes lists the Bible note and the highlight; the sermon page shows related passages.
  await goTo("notes"); await expectText("Remain: stay close every day."); await expectText("John 15:5-6"); await shot("58-my-notes");
  const sid = await page.evaluate(() => __app.S.list("sermons").find((s) => s.passage === "John 15:1-8")?.id);
  if (sid) { await goTo(`sermon-${sid}`); await page.click(".xref-panel summary"); await page.waitForSelector(".xref-panel .row"); }
  // A reading plan drafted from a topic: references that aren't real passages are left out, and nothing saves until a person adds it.
  await page.evaluate(() => { window.__aiStub = async () => ({ name: "Peace in worry", description: "A week on God's peace.", days: [["Philippians 4:4-9"], ["Psalm 23"], ["Hezekiah 4:2"], ["Matthew 6:25-34", "Isaiah 26:3"], ["John 14:27"]] }); });
  const before = await page.evaluate(() => __app.S.list("plans").length);
  await goTo("admin-plans"); await page.click("[data-act=plan-topic]"); await page.fill("#scrim input[name=topic]", "Worry"); await sheetSubmit();
  await page.waitForSelector("#scrim form[data-form=admin-save]", { timeout: 8000 });
  const days = await page.$eval("#scrim textarea[name=days]", (t) => t.value);
  if (/Hezekiah/.test(days) || days.split("\n").length !== 4 || !/Matthew 6:25-34; Isaiah 26:3/.test(days)) throw new Error(`the drafted plan wasn't checked: ${days}`);
  if ((await page.evaluate(() => __app.S.list("plans").length)) !== before) throw new Error("the drafted plan saved before anyone checked it");
  await shot("59-plan-from-topic"); await sheetSubmit(); await sheetGone();
  if ((await page.evaluate(() => __app.S.list("plans").length)) !== before + 1) throw new Error("the checked plan didn't save");
  await page.evaluate(() => { delete window.__aiStub; });
  // Read buttons can open Logos instead.
  await goTo("settings"); await page.$eval('#bible-settings input[name=bibleOpen][value=logos]', (el) => el.click());
  await goTo("word"); await page.fill("form[data-form=bible-lookup] input[name=ref]", "Romans 8:28");
  if (!/Opens Romans 8:28 in Logos/.test(await page.textContent("#bible-hint"))) throw new Error("the look-up doesn't say it opens Logos");
  await goTo("settings"); await page.$eval('#bible-settings input[name=bibleOpen][value=app]', (el) => el.click());
});
await step("giving statements as PDF", async () => {
  await goTo("history"); const [mine] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=statement-pdf] >> nth=0")]);
  const p1 = join(shots, "statement.pdf"); await mine.saveAs(p1);
  await goTo("admin-giving"); await expectText("Year-end statements"); await page.selectOption("#stmt-year", { index: 1 });
  const [all] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=statements-all]")]);
  const p2 = join(shots, "statements-all.pdf"); await all.saveAs(p2);
  for (const f of [p1, p2]) if (!readFileSync(f).subarray(0, 5).toString().startsWith("%PDF")) throw new Error(`${f} is not a PDF`);
  await page.fill("form[data-form=give-settings] input[name=number]", "(770) 555-0199"); await page.fill("form[data-form=give-settings] input[name=taxId]", "58-1234567");
  await page.click("form[data-form=give-settings] button"); await goTo("give"); await expectText("Text to give");
  await page.click("[data-act=stripe-connect]").catch(() => {}); await goTo("give-riverside~75"); await page.waitForSelector("#give-btn:has-text('$75')");
});
await step("payment processors and a linked giving page", async () => {
  await goTo("admin-giving"); await expectText("Online payments"); await page.waitForSelector(".proc-list [data-p=square]"); await shot("46-giving-admin");
  await page.click("[data-act=processor-pick][data-p=stripe]"); await page.waitForSelector("#scrim .steps-list li >> nth=2");
  await page.fill("#scrim input[name=secret]", "sk_test_123"); await page.click("#scrim form button.btn.block");
  await page.waitForSelector("#scrim .err:has-text('your own website')"); await shot("47-connect-stripe");
  await page.click("[data-act=close-sheet]"); await sheetGone();
  await page.click("[data-act=processor-pick][data-p=paypal]"); await page.waitForSelector("#scrim input[name=clientId]"); await page.click("[data-act=close-sheet]"); await sheetGone();
  await page.click("[data-act=processor-pick][data-p=square]"); await page.waitForSelector("#scrim input[name=locationId]");
  await page.click("#scrim form button.btn.block"); await page.waitForSelector("#scrim .err:has-text('Fill in every box')"); await page.click("[data-act=close-sheet]"); await sheetGone();
  await page.selectOption("form[data-form=giving-link] select[name=service]", "pushpay");
  await page.fill("form[data-form=giving-link] input[name=url]", "pushpay.com/g/riverside"); await page.click("form[data-form=giving-link] button.btn:not([type=button])");
  await goTo("give"); await page.waitForSelector(".give-out:has-text('Give with Pushpay')");
  if ((await page.getAttribute(".give-out", "href")) !== "https://pushpay.com/g/riverside") throw new Error("giving link not made secure");
  if (await page.$("form[data-form=give]")) throw new Error("the test-mode form should give way to the church's giving page");
  await shot("48-give-link");
  await goTo("admin-giving"); await page.click("[data-act=giving-link-remove]"); await goTo("give"); await page.waitForSelector("form[data-form=give]");
});
await step("training checklist in the preview", async () => {
  await goTo("me"); await page.click("a.row[href='#training']"); await page.waitForSelector(".train-row");
  await goTo("connect"); await page.click("[data-act=prayer-new]"); await page.fill("#scrim textarea[name=text]", "Checklist prayer"); await sheetSubmit(); await sheetGone();
  await goTo("training"); await page.waitForSelector(".train-row.done >> text=Share a prayer request"); await shot("49-training");
});
await step("shared training church (browser-only here)", async () => {
  await goTo("church-riverside"); await goTo("admin-training"); await page.waitForSelector("form[data-form=training-create]");
  await page.click("form[data-form=training-create] button.btn.block"); await page.waitForSelector(".training-bar");
  await expectText("Invite link"); await shot("50-training-church");
  await goTo("home"); await expectText("Parking lot repaving");   // sample content
  await goTo("give"); await expectText("gifts here are pretend");
  await goTo("admin-giving"); await page.click("[data-act=processor-pick][data-p=square]"); await page.fill("#scrim input[name=token]", "anything");
  await page.click("#scrim form button.btn.block"); await page.waitForSelector(".proc-head .proc-mark.square");
  await goTo("admin-training"); await page.click("form[data-form=training-reset] button.btn"); await page.click("#scrim [data-act=training-reset-yes]");
  await page.waitForSelector("text=starts fresh");
  await goTo("admin-training"); await page.click("[data-act=training-delete]"); await page.click("#scrim [data-act=training-delete-yes]");
  await page.waitForFunction(() => !document.querySelector(".training-bar"));
  await goTo("church-riverside"); await goTo("admin-training"); await page.waitForSelector("form[data-form=training-create]");
});
await step("invite a friend by text or email", async () => {
  await goTo("home"); await page.click("[data-act=invite]"); await page.waitForSelector("#invite-sms");
  await page.fill("#invite-text", "Join me Sunday!");
  if (!/^sms:[?&]body=Join%20me%20Sunday!$/.test(await page.getAttribute("#invite-sms", "href"))) throw new Error("text message link is wrong");
  if (!/^mailto:\?subject=Join%20me%20at%20.+&body=Join%20me%20Sunday!$/.test(await page.getAttribute("#invite-mail", "href"))) throw new Error("email link is wrong");
  await page.click("[data-act=close-sheet]"); await sheetGone();
});
await step("lesson builder", async () => {
  await goTo("docs-lesson"); await page.click("[data-act=new-doc]"); await page.fill("#scrim input[name=title]", "God made everything"); await page.fill("#scrim input[name=passage]", "Genesis 1:1-5");
  await sheetSubmit(); await page.waitForSelector("text=Blocks"); await page.waitForFunction(() => document.body.textContent.includes("In the beginning"));
  await page.click('[data-act=dblock-new][data-type="question"]'); await page.fill("#scrim textarea[name=text]", "What did God make first?"); await sheetSubmit(); await sheetGone();
  await page.click("[data-act=doc-publish]");
});
await step("classes admin", async () => {
  await goTo("admin-gatherings"); await page.click("[data-act=admin-edit]:not([data-id])");
  await page.fill("#scrim input[name=name]", "Kindergarten, 11:00"); await page.check('#scrim input[name=days][value="0"]'); await page.fill("#scrim input[name=time]", "11:00");
  await page.fill("#scrim input[name=room]", "Room 106"); await page.fill("#scrim input[name=ageMin]", "5"); await page.fill("#scrim input[name=ageMax]", "6");
  await page.check('#scrim input[name=leaders][value="u-linda"]'); await sheetSubmit(); await sheetGone(); await expectText("Kindergarten, 11:00");
  await page.click("[data-act=admin-edit]:not([data-id])"); await page.fill("#scrim input[name=name]", "Baptism class"); await page.check('#scrim input[name=kind][value=once]', { force: true }); await sheetSubmit();
  await page.waitForSelector("#scrim .err"); await page.fill("#scrim input[name=date]", "2026-12-12"); await sheetSubmit(); await sheetGone();
});
await step("qr make and scan", async () => {
  await goTo("qr"); await page.selectOption("select[name=target]", "register-gathering-riverside-pre9"); await page.waitForSelector("#qr-card svg"); await shot("15-qr");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=qr-png]")]);
  const file = join(shots, "qr.png"); await dl.saveAs(file);
  await goTo("scan"); await page.setInputFiles("input[data-change=scan-file]", file);
  await page.waitForFunction(() => location.hash === "#gathering-riverside-pre9", null, { timeout: 8000 });
});
await step("admin content and roster", async () => {
  for (const k of ["news", "events", "sermons", "plans"]) { await goTo(`admin-${k}`); await page.click(`[data-act=admin-edit][data-kind=${k}] >> nth=1`); await sheetSubmit(); await sheetGone(); }
  for (const k of ["checkin", "giving", "prayer", "cards", "people"]) await goTo(`admin-${k}`);
  await goTo("live"); await goTo("ministry"); await shot("16-ministry");
});
await step("register a church", async () => {
  await goTo("start"); await page.fill("input[name=name]", "Grace Point Church");
  await page.fill("input[name=locName0]", "Downtown"); await page.fill("input[name=locCode0]", "DT");
  await page.click("[data-act=add-start-loc]"); await page.fill("input[name=locName1]", "Westside"); await page.fill("input[name=locCode1]", "dt");
  await page.click("form[data-form=start-church] button.btn:not([type=button])"); await page.waitForSelector("form[data-form=start-church] .err");
  await page.fill("input[name=locCode1]", "WEST"); await page.check('input[name=locVis1][value=private]', { force: true });
  await page.click("form[data-form=start-church] button.btn:not([type=button])"); await page.waitForSelector("text=Getting started");
  await expectText("Primary: Gunter Frazier (you)");
  for (const h of ["home", "word", "plans", "notes", "events", "connect", "classes", "groups", "directory", "give", "history", "checkin", "live", "alerts", "me", "chat", "parents", "admin-roles", "admin-locations", "admin-page"]) await goTo(h);
  await shot("17-new-church");
});
await step("approvals: requests notify everyone who can approve; volunteers can be pre-approved", async () => {
  await goTo("home"); await page.click("[data-act=open-switcher]"); await page.click('#scrim [data-id="riverside"]'); await page.waitForSelector(".home-top");
  // Act as different people at Riverside, and put things back afterwards.
  const before = await page.evaluate(() => { const S = __app.S, c = S.church(); return { owner: c.ownerId, role: S.membership(c.id).roleId }; });
  const asRole = (r) => page.evaluate((r) => { const S = __app.S, c = S.church(); if (r === "primary") c.ownerId = S.me().id; else { if (c.ownerId === S.me().id) c.ownerId = "u-dana"; S.membership(c.id).roleId = r; } S.save(); __app.render(); }, r);
  await asRole("primary"); await goTo("admin-approvals"); await expectText("Review every request"); await shot("60-approvals");
  if (!(await page.isChecked('input[name=pre][value=none]'))) throw new Error("volunteer requests should be reviewed by default");
  // A member asks to join a team: it's a request, and everyone who schedules teams hears about it.
  await asRole("member");
  const me = await page.evaluate(() => __app.S.me().id);
  await goTo("serving"); const team = await page.getAttribute("[data-act=team-join]", "data-team");
  await page.click(`[data-act=team-join][data-team="${team}"]`); await page.waitForSelector("#scrim form[data-form=team-request]");
  if (!(await page.isChecked("#scrim input[name=notifyApprovers]"))) throw new Error("notifying approvers should be on by default");
  await page.fill("#scrim input[name=note]", "I can run slides"); await shot("61-team-request"); await sheetSubmit(); await sheetGone();
  await expectText("Requested");
  // That request becomes someone else's (a person who can't approve it), and this person sends one of their own.
  const other = await page.evaluate((t) => { const S = __app.S; const free = S.members().map((m) => m.userId).filter((u) => u !== S.me().id && S.user(u) && !S.list("teamMembers").some((m) => m.team === t && m.userId === u));
    return free.find((u) => !S.role("riverside", u)?.perms?.["schedule.teams"]) || free[0]; }, team);
  if (!other) throw new Error("no other member to send the request as");
  await page.evaluate(([t, o]) => { const S = __app.S; S.list("teamMembers").find((m) => m.team === t && m.userId === S.me().id && m.status === "requested").userId = o; S.save(); __app.render(); }, [team, other]);
  await page.click(`[data-act=team-join][data-team="${team}"]`); await page.waitForSelector("#scrim form[data-form=team-request]"); await sheetSubmit(); await sheetGone();
  const asked = await page.evaluate(() => __app.S.state.notifications.filter((n) => /wants to serve/.test(n.title)).map((n) => n.userId));
  const schedulers = await page.evaluate(() => __app.S.members().map((m) => m.userId).filter((u) => __app.S.role("riverside", u)?.perms?.["schedule.teams"]));
  if (!asked.length || asked.includes(me) || schedulers.some((u) => u !== me && !asked.includes(u))) throw new Error(`not every scheduler was notified: ${asked} vs ${schedulers}`);
  // Joining a group whose leader approves: the leaders (and class managers) hear about it, unless the box is unticked.
  const groupAsks = () => page.evaluate(() => __app.S.state.notifications.filter((n) => /Request to join Couples/.test(n.title)).length), asksBefore = await groupAsks();
  await goTo("gathering-riverside-couples"); await page.click("[data-act=g-register]"); await page.waitForSelector("#scrim input[name=notifyApprovers]");
  if (!(await page.$("#scrim input[name=who]:checked"))) await page.check("#scrim input[name=who] >> nth=0");
  await page.uncheck("#scrim input[name=notifyApprovers]"); await sheetSubmit(); await sheetGone();
  if ((await groupAsks()) !== asksBefore) throw new Error("approvers were notified though the box was unticked");
  // A teacher's room request goes to everyone who manages rooms. (Teachers manage classes and groups here, so becoming
  // one approves this person's own waiting group request: nobody approves their own request by hand.)
  const toldBefore = await page.evaluate((u) => __app.S.state.notifications.filter((n) => n.userId === u && /Approved automatically/.test(n.body)).length, me);
  const groupAsked = () => page.evaluate((u) => __app.S.get("gatherings", "riverside-couples").members.filter((m) => m.userId === u && m.status === "requested").length, me);
  if (!(await groupAsked())) throw new Error("a member's request to join the group should wait");
  await asRole("teacher");
  await goTo("rooms"); await page.click("[data-act=room-request] >> nth=0"); await page.fill("#scrim input[name=title]", "Teachers' prayer");
  await page.fill("#scrim input[name=date]", await page.evaluate(() => { const d = new Date(Date.now() + 9 * 864e5); return d.toISOString().slice(0, 10); }));
  await page.fill("#scrim input[name=start]", "06:00"); await page.fill("#scrim input[name=end]", "06:45");
  if (!(await page.isChecked("#scrim input[name=notifyApprovers]"))) throw new Error("the room request should notify approvers by default");
  await sheetSubmit(); await sheetGone();
  const roomAsked = await page.evaluate(() => __app.S.state.notifications.filter((n) => /Room request/.test(n.title) && /Teachers' prayer/.test(n.body)).length);
  if (!roomAsked) throw new Error("nobody heard about the room request");
  // Now this person can approve all three kinds of request. Their own waiting requests (the team, the group and the room)
  // are approved automatically, and they're told. Someone else's request still waits for them.
  const mine = () => page.evaluate(([t, u]) => { const S = __app.S; return {
    team: S.list("teamMembers").find((m) => m.team === t && m.userId === u)?.status || "on",
    group: S.get("gatherings", "riverside-couples").members.some((m) => m.userId === u && m.status === "requested") ? "requested" : "in",
    room: S.list("bookings").find((b) => b.title === "Teachers' prayer")?.status,
    told: S.state.notifications.filter((n) => n.userId === u && /Approved automatically/.test(n.body)).length }; }, [team, me]);
  const waiting = await mine();
  if (waiting.team !== "requested" || waiting.room !== "requested") throw new Error(`the requests should be waiting first: ${JSON.stringify(waiting)}`);
  await asRole("primary"); await page.waitForTimeout(150);
  const after = await mine();
  if (after.team !== "on" || after.group !== "in" || after.room !== "approved") throw new Error(`an approver's own requests weren't approved automatically: ${JSON.stringify(after)}`);
  if (after.told - toldBefore !== 3) throw new Error(`the approver wasn't told about each automatic approval (${after.told - toldBefore})`);
  // A new request from someone who can approve it never waits: a group that approves each request just registers them,
  await goTo("gathering-riverside-couples");
  while (await page.$("[data-act=g-unregister]")) { await page.click("[data-act=g-unregister]"); await page.waitForTimeout(150); }
  await expectText("you're in as soon as you register"); await page.click("[data-act=g-register]"); await page.waitForSelector("#scrim form[data-form=g-register]");
  if (await page.$("#scrim input[name=notifyApprovers]")) throw new Error("an approver was offered to notify approvers about their own sign-up");
  if (!(await page.$("#scrim input[name=who]:checked"))) await page.check("#scrim input[name=who] >> nth=0");
  await sheetSubmit(); await sheetGone(); await expectText("Registered");
  if ((await mine()).group !== "in" || !(await page.evaluate((u) => __app.S.get("gatherings", "riverside-couples").members.some((m) => m.userId === u), me))) throw new Error("an approver's own sign-up had to wait");
  // and a room is booked on the spot.
  await goTo("rooms"); await page.click("[data-act=room-request] >> nth=0"); await page.waitForSelector("#scrim form");
  if (!/booked as soon as you save/.test(await page.textContent("#scrim"))) throw new Error("the room form doesn't say an approver's booking is immediate");
  await shot("62b-approver-books"); await page.click("#scrim [data-act=close-sheet]"); await sheetGone();
  // Approve the other person's volunteer request; they hear back and are on the team.
  await goTo("admin"); await expectText("waiting"); await goTo("teams"); await expectText("Asking to serve"); await expectText("I can run slides"); await shot("62-asking-to-serve");
  await page.click("[data-act=team-approve]"); await page.waitForTimeout(150);
  if (!(await page.evaluate(([u, t]) => __app.S.list("teamMembers").some((m) => m.team === t && m.userId === u && !m.status), [other, team]))) throw new Error("approving didn't put them on the team");
  if (!(await page.evaluate(([u, t]) => __app.S.state.notifications.some((n) => n.userId === u && n.title === `You're on the ${t} team`), [other, team]))) throw new Error("the volunteer wasn't told");
  // Pre-approve chosen people: now this person joins a team straight away.
  await goTo("admin-approvals"); await page.check('input[name=pre][value=some]'); await page.check(`input[name=people][value="${me}"]`);
  await page.click("form[data-form=approvals-save] button.btn"); await page.waitForTimeout(150);
  await asRole("member");
  await goTo("serving"); const team2 = await page.getAttribute("[data-act=team-join]", "data-team"); await page.click(`[data-act=team-join][data-team="${team2}"]`); await page.waitForTimeout(150);
  if (await page.$("#scrim form[data-form=team-request]")) throw new Error("a pre-approved person still had to ask");
  if (!(await page.evaluate(([u, t]) => __app.S.list("teamMembers").some((m) => m.team === t && m.userId === u && !m.status), [me, team2]))) throw new Error("the pre-approved person isn't on the team");
  await asRole("primary"); await goTo("admin-approvals"); await page.check('input[name=pre][value=none]'); await page.click("form[data-form=approvals-save] button.btn"); await page.waitForTimeout(150);
  await page.evaluate((b) => { const S = __app.S, c = S.church(); c.ownerId = b.owner; S.membership(c.id).roleId = b.role; S.save(); __app.render(); }, before);
});
await step("a video, website or file on the display", async () => {
  if (!(await page.evaluate(() => !!window.__app))) { await page.goto(base + "?debug#home"); await page.waitForSelector("#app"); }
  const key = await page.evaluate(() => { const S = __app.S; S.setCurrent("riverside"); S.state.churches.riverside.ownerId = S.me().id; S.save(); const p = S.list("services").sort((a, b) => b.date.localeCompare(a.date))[0]; return `service-${p.id}`; });
  const d = await ctx.newPage(); await d.setViewportSize({ width: 1280, height: 720 }); await d.goto(base + `#display-${key}`); await d.waitForSelector(".display");
  await goTo(`present-${key}`); await page.waitForSelector("[data-act=pres-media]");
  // A video link: YouTube plays in its own player.
  await page.click("[data-act=pres-media]"); await page.fill('#scrim form:nth-of-type(1) input[name=url]', "https://youtu.be/dQw4w9WgXcQ"); await page.click("#scrim form:nth-of-type(1) button");
  await d.waitForSelector('iframe.media-fill[src^="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]'); await expectText("On the display:");
  // The slides can move underneath without restarting what's playing.
  const frame = await d.$eval("iframe.media-fill", (f) => f.dataset.mediaId); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(300);
  if ((await d.$eval("iframe.media-fill", (f) => f.dataset.mediaId)) !== frame) throw new Error("moving a slide restarted the video");
  // A website.
  await page.click("[data-act=pres-media]"); await page.fill('#scrim form:nth-of-type(2) input[name=url]', "example.org/welcome"); await page.click("#scrim form:nth-of-type(2) button");
  await d.waitForSelector('iframe.media-fill[sandbox][src="https://example.org/welcome"]');
  await page.click("[data-act=pres-media]"); await page.fill('#scrim form:nth-of-type(2) input[name=url]', "not a site"); await page.click("#scrim form:nth-of-type(2) button"); await page.waitForSelector("#scrim .err"); await page.click("#scrim [data-act=close-sheet]"); await sheetGone();
  // A picture from this device reaches the display.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.click("[data-act=pres-media]"); await page.setInputFiles("#scrim input[type=file]", { name: "welcome.png", mimeType: "image/png", buffer: png });
  await d.waitForSelector('img.media-fill[src^="data:image/jpeg"]'); await expectText("welcome.png");
  await d.screenshot({ path: join(shots, "78-display-media.png") }); await shot("79-presenter-media");
  // A display opened afterwards asks for the file and gets it.
  const late = await ctx.newPage(); await late.goto(base + `#display-${key}`); await late.waitForSelector(".display");
  await page.keyboard.press("ArrowLeft"); await late.waitForSelector('img.media-fill[src^="data:image/jpeg"]', { timeout: 8000 }); await late.close();
  // Back to the slides.
  await page.click("[data-act=pres-media-off]"); await d.waitForSelector(".display .slide");
  if (await d.$(".media-fill")) throw new Error("the media stayed on the display");
  await d.close(); await goTo("home");
});
await step("attendance, dates, campaigns, email and the activity log", async () => {
  if (!(await page.evaluate(() => !!window.__app))) { await page.goto(base + "?debug#home"); await page.waitForSelector("#app"); }
  // A service that started five minutes ago, and this person as the primary account holder.
  const other = await page.evaluate(() => { const S = __app.S; S.setCurrent("riverside"); const c = S.church(); c.ownerId = S.me().id; sessionStorage.removeItem("our-faithful-presence-asked");
    const t = new Date(Date.now() - 5 * 60e3), l = c.locations[0]; l.services = [{ day: t.getDay(), time: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`, label: "Test gathering" }, ...l.services.filter((x) => x.label !== "Test gathering")];
    S.state.presence = []; S.save(); return S.members().map((m) => S.user(m.userId)).find((u) => u && u.id !== S.me().id); });
  // Opening the app during the service asks whether you're here.
  await goTo("me"); await goTo("home"); await page.waitForSelector("#scrim [data-act=presence-yes]", { timeout: 4000 }); await shot("80-presence-prompt");
  await page.click("#scrim [data-act=presence-yes]"); await sheetGone();
  if ((await page.evaluate(() => __app.S.list("presence").filter((p) => p.userId === __app.S.me().id && p.via === "self").length)) !== 1) throw new Error("the person wasn't marked as here");
  await goTo("me"); await goTo("home"); await page.waitForTimeout(1100); if (await page.$("#scrim")) throw new Error("asked again after answering");
  // Your own card, and a greeter scanning someone else's.
  await goTo("here"); await page.waitForSelector(".my-card svg"); await expectText("You're marked as here"); await shot("81-my-attendance");
  await goTo(`here-${other.id}`); await expectText("is marked as here."); await page.evaluate(() => __app.render()); await page.waitForTimeout(90); await expectText("was already marked");
  // Ticking people off a list, and the report.
  await goTo("rollcall"); await expectText("2 of "); await page.locator(".roll-list input:not(:checked)").first().click(); await expectText("3 of "); await shot("82-rollcall");
  await page.evaluate((id) => { const S = __app.S; S.add("presence", { userId: id, name: "x", serviceKey: "2026-01-04T10:00@riverside-main", date: "2026-01-04", locationId: "riverside-main", via: "list", at: "2026-01-04T10:00:00Z" });
    const p = S.list("presence").find((x) => x.userId === id && x.date > "2026-02"); if (p) S.remove("presence", p.id); }, other.id);
  await goTo("reports-attendance"); await page.waitForSelector('[data-act=report-csv][data-id=away]'); await expectText("Not seen in 4 weeks"); await expectText(other.name); await shot("83-attendance-report");
  // Dates: your own, and the dashboard shows what's coming.
  await goTo("dates"); const soon = await page.evaluate(() => { const d = new Date(Date.now() + 3 * 864e5); return `1985-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  await page.fill("form[data-form=date-add] input[name=date]", soon); await page.click("form[data-form=date-add] button"); await expectText("Birthday"); await shot("84-my-dates");
  await goTo("dashboard"); await expectText("Birthdays and milestones");
  // A pledge campaign: made by staff, pledged to from Give, shown on the dashboard.
  await goTo("admin-campaigns"); await page.click("[data-act=campaign-edit]"); await page.fill("#scrim input[name=name]", "New roof"); await page.fill("#scrim input[name=goal]", "20000"); await page.click("#scrim form button.btn"); await sheetGone(); await expectText("New roof");
  await goTo("give"); await page.click(".campaign [data-act=pledge]"); await page.fill("#scrim input[name=amount]", "1200"); await page.click("#scrim form button.btn"); await sheetGone(); await expectText("Your pledge: $1,200"); await shot("85-give-campaign");
  await goTo("admin-campaigns"); await expectText("pledged by 1 person"); await page.waitForSelector('[data-act=report-csv][data-id=pledges]'); await shot("86-admin-campaigns");
  await goTo("dashboard"); await expectText("Pledge campaigns");
  // Email to a group (practice here: nothing is sent, but it's logged).
  await goTo("admin-email"); await expectText("Everyone ("); await page.fill("form[data-form=email-send] input[name=subject]", "Workday Saturday"); await page.fill("form[data-form=email-send] textarea", "Bring gloves."); await shot("87-email");
  await page.click("form[data-form=email-send] button"); await expectText("Workday Saturday");
  if (!(await page.evaluate(() => __app.emailAudiences().some(([k]) => k === "away")))) throw new Error("no 'not seen in 4 weeks' audience");
  // The activity log has what just happened.
  await goTo("admin-activity"); await page.waitForSelector('[data-act=report-csv][data-id=activity]'); await expectText("Started the campaign New roof"); await expectText("Pledged to New roof"); await expectText("Emailed"); await shot("88-activity");
  // A member without the permissions sees none of the staff screens.
  await page.evaluate(() => { const S = __app.S, c = S.church(); c.ownerId = "someone-else"; const m = S.membership(c.id, S.me().id); m._was = m.roleId; m.roleId = c.roles.find((r) => r.rank <= 10 || r.id === "member").id; S.save(); });
  await goTo("home");
  for (const [h, mark] of [["admin-activity", "newest first"], ["admin-email", "Each person gets their own copy"], ["admin-campaigns", "Set a goal for a fund"], ["rollcall", "marked as here."]]) { await goTo(h); await page.waitForTimeout(120); if ((await text()).includes(mark)) throw new Error(`a member reached #${h}`); }
  await page.evaluate(() => { const S = __app.S, c = S.church(); c.ownerId = S.me().id; const m = S.membership(c.id, S.me().id); m.roleId = m._was; delete m._was; S.save(); });
  await goTo("home");
});
await step("campus map, first-time visitors and the welcome message", async () => {
  if (!(await page.evaluate(() => !!window.__app))) { await page.goto(base + "?debug#home"); await page.waitForSelector("#app"); }
  await page.evaluate(() => { const S = __app.S; S.setCurrent("riverside"); const c = S.church(); c.ownerId = S.me().id; const l = c.locations[0]; l.map = null; delete c.welcome; S.save(); });
  // Drawing the map: add places, name one, resize it, drag it.
  await goTo("admin-map"); await page.waitForSelector("svg.campus-map.editing");
  await page.click('[data-act=map-add][data-type=worship]'); await page.waitForSelector("form.map-edit"); await page.fill("form.map-edit input[name=name]", "Sanctuary");
  await page.click('[data-act=map-size][data-d="w+"]'); await page.fill("form.map-edit input[name=note]", "Services meet here."); await page.click("form.map-edit button.btn:not(.ghost):not(.danger)");
  await page.click('[data-act=map-add][data-type=restroom]'); await page.click("form.map-edit button.btn:not(.ghost):not(.danger)");
  const before = await page.evaluate(() => { const it = __app.S.church().locations[0].map.items[1]; return { id: it.id, x: it.x, y: it.y }; });
  await page.evaluate(() => window.scrollTo(0, 0)); await page.locator("svg.campus-map").scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -120));
  const box = await page.locator(`[data-place="${before.id}"] rect`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 120, { steps: 6 }); await page.mouse.up();
  const after = await page.evaluate((id) => { const it = __app.S.church().locations[0].map.items.find((i) => i.id === id); return { x: it.x, y: it.y }; }, before.id);
  if (after.y <= before.y) throw new Error(`dragging didn't move the place (${before.y} -> ${after.y})`);
  await page.click('svg.campus-map rect:first-child', { position: { x: 4, y: 4 } }).catch(() => {}); await shot("89-map-builder");
  const san = await page.evaluate(() => __app.S.church().locations[0].map.items[0]); if (san.name !== "Sanctuary" || san.w !== 11) throw new Error("the place wasn't saved as edited");
  // A visitor finds a place.
  await goTo(`map-${await page.evaluate(() => __app.S.church().locations[0].id)}`); await page.waitForSelector("svg.campus-map:not(.editing)"); await expectText("Find a place");
  await page.fill("[data-input=map-find]", "rest"); await page.waitForFunction(() => document.querySelectorAll("#map-list .row").length === 1);
  await page.fill("[data-input=map-find]", ""); await page.locator("#map-list .row", { hasText: "Sanctuary" }).click(); await expectText("Services meet here."); await page.waitForSelector(".campus-map .place.on"); await shot("90-map");
  await goTo("home"); await expectText("Campus map");
  // Settings for the welcome: a bad link is refused, a good one saves.
  await goTo("admin-welcome"); await page.fill("form[data-form=welcome-save] textarea[name=links]", "Bad one | javascript:alert(1)"); await page.click("form[data-form=welcome-save] button.btn:not(.ghost)"); await page.waitForSelector("form[data-form=welcome-save] .err");
  await page.fill("form[data-form=welcome-save] input[name=title]", "Hello from {church}"); await page.fill("form[data-form=welcome-save] textarea[name=links]", "Plan your visit | #visit\nOur website | https://example.org");
  await page.click("[data-act=welcome-preview]"); await page.waitForSelector("#scrim"); await page.waitForFunction(() => document.querySelector("#scrim")?.textContent.includes("Hello from Riverside Community Church")); await page.click("#scrim [data-act=close-sheet]"); await sheetGone();
  await page.click("form[data-form=welcome-save] button.btn:not(.ghost)"); await shot("91-welcome-settings");
  // Someone joins: asked if it's their first visit, fills in the card, lands on Plan your visit with the welcome.
  await page.evaluate(() => { const S = __app.S, c = S.church(); c.ownerId = "someone-else"; S.state.memberships = S.state.memberships.filter((m) => !(m.churchId === c.id && m.userId === S.me().id)); S.state.cards = S.state.cards.filter((x) => !x.firstVisit); sessionStorage.setItem("our-faithful-presence-asked", JSON.stringify(["x"])); S.me().prefs && (S.me().prefs.askPresence = false); S.save(); });
  await goTo("church-riverside"); await page.evaluate(() => __app.render()); await page.click("[data-act=join-church]");
  await page.waitForSelector("#scrim [data-act=visit-first]", { timeout: 5000 }); await shot("92-first-visit-question"); await page.click("#scrim [data-act=visit-first]");
  await page.waitForSelector("form[data-form=visitor-card]"); await page.fill("form[data-form=visitor-card] input[name=phone]", "(770) 555-0100"); await page.fill("form[data-form=visitor-card] input[name=adults]", "Sam"); await page.fill("form[data-form=visitor-card] textarea[name=children]", "Ella, 7\nNoah, 4");
  await shot("93-visitor-card"); await page.click("form[data-form=visitor-card] button.btn:not(.ghost)");
  await page.waitForFunction(() => location.hash === "#visit"); await page.waitForFunction(() => { const t = document.querySelector("#scrim")?.textContent || ""; return t.includes("Hello from Riverside Community Church") && t.includes("Our website"); }); await shot("94-welcome-message");
  await page.click("#scrim [data-act=close-sheet]"); await sheetGone(); await expectText("Plan your visit"); await shot("95-plan-your-visit");
  const card = await page.evaluate(() => { const S = __app.S, c = S.list("cards").find((x) => x.firstVisit); return c && { reason: c.reason, kids: c.children.length, fu: S.list("followups").some((f) => f.cardId === c.id || (f.personId === S.me().id && f.status !== "closed")) }; });
  if (!card || card.reason !== "First-time visitor" || card.kids !== 2 || !card.fu) throw new Error(`visitor card wrong: ${JSON.stringify(card)}`);
  await page.evaluate(() => { const S = __app.S; S.church().ownerId = S.me().id; S.save(); }); await goTo("home");
});
await step("dashboard and detailed reports", async () => {
  if (!(await page.evaluate(() => !!window.__app))) { await page.goto(base + "?debug#home"); await page.waitForSelector("#app"); }
  const asRole = (r) => page.evaluate((r) => { const S = __app.S, c = S.state.churches.riverside; if (r === "primary") c.ownerId = S.me().id; else { if (c.ownerId === S.me().id) c.ownerId = "u-dana"; S.membership(c.id).roleId = r; } S.save(); __app.render(); }, r);
  const before = await page.evaluate(() => { __app.S.setCurrent("riverside"); return JSON.stringify(__app.S.state); });
  const widgets = () => page.evaluate(() => [...document.querySelectorAll(".dash-widget")].map((w) => w.dataset.widget));
  await asRole("primary"); await goTo("admin"); await page.click('a.row[href="#dashboard"]'); await page.waitForSelector(".dash-widget");
  let w = await widgets();
  for (const k of ["numbers", "attention", "attendance", "giving", "newcomers", "events", "serving", "groups"]) if (!w.includes(k)) throw new Error(`the dashboard is missing ${k}: ${w}`);
  for (const t of ["Members", "Average attendance", "Given this month", "Needs attention", "People each week", "Given each month", "Coming up"]) await expectText(t);
  if (await page.evaluate(() => [...document.querySelectorAll(".dash-widget .stat-tile b")].some((b) => /NaN|undefined/.test(b.textContent)))) throw new Error("a dashboard number didn't work out");
  await shot("75-dashboard");
  // Each person arranges their own: hide one widget, move another to the top.
  await page.click("[data-act=dash-edit]"); await page.waitForSelector("#scrim .dash-edit"); await shot("76-dashboard-customize");
  await page.uncheck('#scrim input[data-id="giving"]');
  for (let i = 0; i < 8; i++) { const up = await page.$('#scrim [data-act=dash-move][data-id="events"][data-dir="-1"]:not([disabled])'); if (!up) break; await up.click(); await page.waitForTimeout(60); }
  await page.click("#scrim [data-act=dash-done]"); await sheetGone();
  w = await widgets();
  if (w[0] !== "events" || w.includes("giving")) throw new Error(`customizing didn't stick: ${w}`);
  await page.reload(); await page.waitForSelector(".dash-widget");
  if ((await widgets())[0] !== "events") throw new Error("the dashboard layout wasn't remembered");
  // The report pages: each has numbers, a table and a download.
  for (const [tab, heading, table] of [["people", "Everyone", "people"], ["groups", "All classes and groups", "groups"], ["serving", "Times scheduled", "serving"], ["events", "All events", "events"], ["giving", "By giver", "givers"]]) {
    await goTo(`reports-${tab}`); await page.waitForSelector(`[data-act=report-csv][data-id="${table}"]`).catch(() => { throw new Error(`the ${tab} report didn't open, or has no download`); });
    if (!(await page.$$eval(".mini-table tbody tr", (r) => r.length))) throw new Error(`the ${tab} report has no rows`);
    if (/NaN|undefined/.test(await page.textContent("#main"))) throw new Error(`the ${tab} report shows a broken value`);
    if (tab === "people" || tab === "giving") await shot(`77-report-${tab}`);
  }
  await goTo("reports"); await expectText("Overview"); await page.click('.report-tabs a[href="#reports-people"]'); await page.waitForSelector('[data-act=report-csv][data-id="people"]');
  // Someone who can't see giving gets no giving widget and no giving report; a member gets no dashboard.
  await page.evaluate(() => { const r = __app.S.church().roles.find((x) => x.id === "staff"); r.perms["view.giving"] = false; r.perms["view.reports"] = true; });
  await asRole("staff"); await goTo("dashboard"); await page.waitForSelector(".dash-widget");
  if ((await widgets()).includes("giving") || (await text()).includes("Given this month")) throw new Error("someone without the giving permission sees giving on the dashboard");
  await goTo("reports-giving"); await page.waitForTimeout(150); if (await page.$('[data-act=report-csv][data-id="givers"]')) throw new Error("someone without the giving permission opened the giving report");
  await asRole("member"); await goTo("dashboard"); await page.waitForTimeout(150);
  if (await page.$(".dash-widget")) throw new Error("a member can open the dashboard");
  await page.evaluate((s) => { __app.S.state = JSON.parse(s); __app.S.save(); location.hash = "home"; __app.render(); }, before);
});
await step("deactivating a church account", async () => {
  if (!(await page.evaluate(() => !!window.__app))) { await page.goto(base + "?debug#home"); await page.waitForSelector("#app"); }
  const asRole = (r) => page.evaluate((r) => { const S = __app.S, c = S.state.churches.riverside; if (r === "primary") c.ownerId = S.me().id; else { if (c.ownerId === S.me().id) c.ownerId = "u-dana"; S.membership(c.id).roleId = r; } S.save(); __app.render(); }, r);
  const church = () => page.evaluate(() => { const S = __app.S, c = S.state.churches.riverside; return c ? { status: c.deactivation?.status || "active", d: c.deactivation || {}, seen: !!S.church("riverside"), listed: S.churches().some((x) => x.id === "riverside") } : null; });
  const before = await page.evaluate(() => { __app.S.setCurrent("riverside"); return JSON.stringify(__app.S.state); });
  const me = await page.evaluate(() => __app.S.me().id), name = "Riverside Community Church";
  const confirm = async (button) => {   // the verification sheet: the name typed out and the box ticked
    await page.click("[data-act=deact-start]"); await page.waitForSelector("#scrim form[data-form=deact-confirm]");
    const warn = await page.textContent("#scrim [role=alert]");
    if (!/will no longer be visible to all other users, and it will be removed from the list of available churches/.test(warn)) throw new Error("the warning doesn't say the church is hidden and removed from the list");
    await sheetSubmit(); await page.waitForSelector("#scrim .err");
    if ((await church()).status === "deactivated") throw new Error("deactivated without typing the name");
    await page.fill("#scrim input[name=confirmName]", "riverside community church "); await sheetSubmit(); await page.waitForTimeout(120);
    if (!/Tick the box/.test(await page.textContent("#scrim"))) throw new Error("it didn't ask for the box to be ticked");
    await page.check("#scrim input[name=understand]");
    if (!(await page.textContent("#scrim button.btn.danger")).includes(button)) throw new Error(`the button should say "${button}"`);
    await sheetSubmit(); await sheetGone();
  };
  // Nobody has the privilege to start with, and an administrator can't give it out.
  await asRole("admin");
  if (await page.evaluate(() => __app.S.can("church.deactivate"))) throw new Error("administrators shouldn't have the privilege by default");
  await goTo("admin"); if ((await text()).includes("Deactivate church account")) throw new Error("an admin without the privilege sees the option");
  await goTo("admin-deactivate"); await expectText("Only the primary account holder");
  await goTo("role-staff"); if (!(await page.isDisabled('input[name=p][value="church.deactivate"]'))) throw new Error("an admin can hand out the deactivate privilege");
  // The primary account holder gives it to administrators.
  await asRole("primary"); await goTo("role-admin"); await page.check('input[name=p][value="church.deactivate"]'); await page.click("form[data-form=role-save] button.btn"); await page.waitForTimeout(120);
  // An administrator asks. Nothing changes; the primary account holder is told.
  await asRole("admin"); await goTo("admin"); await expectText("Deactivate church account"); await goTo("admin-deactivate");
  await expectText("will no longer be visible to all other users"); await expectText("removed from the list of available churches"); await expectText("has to approve it"); await shot("70-deactivate-admin");
  await confirm("Send the request");
  await expectText("Waiting for"); await expectText("Take back the request");
  let c = await church();
  if (c.status !== "requested" || c.d.requestedBy !== me || !c.listed) throw new Error(`an admin's request should wait for the primary: ${JSON.stringify(c)}`);
  if (!(await page.evaluate(() => __app.S.state.notifications.some((n) => n.userId === "u-dana" && /asked to deactivate Riverside/.test(n.title))))) throw new Error("the primary account holder wasn't told about the request");
  // The primary sees it on Home and in Admin, and declines. The admin hears back.
  await asRole("primary"); await goTo("home"); await expectText("asked to deactivate Riverside Community Church"); await goTo("admin"); await expectText("A request is waiting for your decision");
  await goTo("admin-deactivate"); await expectText("Nothing changes unless you approve it"); await shot("71-deactivate-request"); await page.click("[data-act=deact-decline]"); await page.waitForTimeout(150);
  if ((await church()).status !== "active") throw new Error("declining didn't clear the request");
  if (!(await page.evaluate((u) => __app.S.state.notifications.some((n) => n.userId === u && /stays active/.test(n.title)), me))) throw new Error("the admin wasn't told the request was declined");
  // Asked again; this time the primary approves, after the same verification.
  await asRole("admin"); await goTo("admin-deactivate"); await confirm("Send the request");
  await asRole("primary"); await goTo("admin-deactivate"); await page.click("[data-act=deact-start]"); await page.waitForSelector("#scrim form"); await shot("72-deactivate-verify"); await page.click("#scrim [data-act=close-sheet]"); await sheetGone();
  await confirm("Deactivate Riverside Community Church");
  await page.waitForFunction(() => /is deactivated/.test(document.querySelector("#app").textContent)); await shot("73-deactivated");
  c = await church();
  const days = Math.round((new Date(c.d.purgeAt) - Date.now()) / 86400e3);
  if (c.status !== "deactivated" || days < 364 || days > 366) throw new Error(`deactivating should keep the data for a year: ${JSON.stringify(c)}`);
  await expectText("Reactivate Riverside Community Church"); await expectText("days left");
  // The primary can't wander back into it, and it's gone from the list of churches.
  await goTo("home"); await expectText("is deactivated"); await goTo("admin"); await expectText("is deactivated");
  await goTo("churches"); await expectText("Deactivated");
  if (await page.$('#church-list a[href="#church-riverside"]')) throw new Error("a deactivated church is still in the list of churches");
  // Everyone else: the church is gone, and they land on the list of churches.
  await asRole("member"); await goTo("home"); await page.waitForTimeout(120);
  c = await church();
  if (c.seen || c.listed) throw new Error("a member can still see the deactivated church");
  if ((await text()).includes("Riverside Community Church")) throw new Error("the deactivated church still shows for a member");
  await expectText("Find your church"); await expectText("Cornerstone Bible Fellowship");
  // Reminders at the set marks, once each, with the way back.
  await asRole("primary");
  await page.evaluate(() => { __app.S.state.churches.riverside.deactivation.purgeAt = new Date(Date.now() + 28.5 * 86400e3).toISOString(); __app.render(); __app.render(); });
  const reminders = () => page.evaluate(() => __app.S.state.notifications.filter((n) => /^n-deact-riverside-/.test(n.id)).map((n) => `${n.title} -> ${n.link}`));
  let rem = await reminders();
  if (rem.length !== 1 || !/will be deleted in 29 days -> #reactivate-riverside/.test(rem[0])) throw new Error(`expected one reminder at the 30-day mark: ${JSON.stringify(rem)}`);
  await page.evaluate(() => { __app.S.state.churches.riverside.deactivation.purgeAt = new Date(Date.now() + 6.5 * 86400e3).toISOString(); __app.render(); });
  if ((rem = await reminders()).length !== 2) throw new Error(`expected a second reminder at the 7-day mark: ${JSON.stringify(rem)}`);
  // From another church, Home keeps saying so, and leads back.
  await page.evaluate(() => { const S = __app.S; if (!S.membership("cornerstone")) S.state.memberships.push({ churchId: "cornerstone", userId: S.me().id, roleId: "member", locations: [], listed: true, joined: new Date().toISOString() }); S.setCurrent("cornerstone"); location.hash = "home"; __app.render(); });
  await page.waitForSelector('a.alert[href="#reactivate-riverside"]'); await expectText("Riverside Community Church is deactivated"); await shot("74-deactivated-alert");
  await page.click('a.alert[href="#reactivate-riverside"]'); await page.waitForFunction(() => /7 days left/.test(document.querySelector("#app").textContent));
  // Reactivating brings it back for everyone.
  await page.click("[data-act=deact-reactivate]"); await page.waitForSelector("#scrim [data-act=deact-reactivate-yes]"); await page.click("#scrim [data-act=deact-reactivate-yes]"); await sheetGone();
  c = await church();
  if (c.status !== "active" || !c.listed) throw new Error(`reactivating didn't bring the church back: ${JSON.stringify(c)}`);
  await asRole("member"); await goTo("home"); if (!(await church()).seen) throw new Error("a member can't see the reactivated church");
  // A year on with no reactivation: the church and everything in it are removed.
  await asRole("primary"); await goTo("admin-deactivate"); await confirm("Deactivate Riverside Community Church");
  const gone = await page.evaluate(() => { const S = __app.S; S.state.churches.riverside.deactivation.purgeAt = new Date(Date.now() - 1000).toISOString(); __app.render();
    return { church: !!S.state.churches.riverside, records: __app.RECORD_KINDS.reduce((n, k) => n + (S.state[k] || []).filter((r) => r.churchId === "riverside").length, 0), members: S.state.memberships.filter((m) => m.churchId === "riverside").length, others: Object.keys(S.state.churches).length }; });
  if (gone.church || gone.records || gone.members || !gone.others) throw new Error(`after a year the church's data should be gone: ${JSON.stringify(gone)}`);
  await page.evaluate((s) => { __app.S.state = JSON.parse(s); __app.S.save(); location.hash = "home"; __app.render(); }, before);
});
await step("basic role is limited", async () => {
  await goTo("home"); await page.click("[data-act=open-switcher]"); await page.click('#scrim [data-id="riverside"]'); await page.waitForSelector(".home-top");
  await goTo("me"); await page.click("[data-act=demo-role]"); await page.click('#scrim [data-act=demo-role-set][data-id="member"]');
  await goTo("admin"); await expectText("doesn't include this");
  await goTo("docs-sermon"); if ((await page.evaluate(() => location.hash)) !== "#me" && (await page.evaluate(() => location.hash)) !== "#ministry") { /* redirected */ }
});
await step("persists after reload", async () => {
  await page.reload(); await page.waitForSelector("#app");
  await goTo("household"); await expectText("Ellie");
});
await step("dark mode", async () => {
  await page.emulateMedia({ colorScheme: "dark" }); await goTo("home"); await shot("18-dark");
});

await step("backend sync round trip", async () => {
  // Runs the Supabase adapter against an in-memory stand-in for the database: what it writes, it must read back the same,
  // and right after reading nothing should look changed.
  await page.goto(base + "?debug#home"); await page.waitForSelector("#app");
  const r = await page.evaluate(async () => {
    const { S, Backend, RECORD_KINDS, SPLIT } = window.__app;
    const before = JSON.parse(JSON.stringify(S.state));
    Backend.user = { id: S.me().id, email: "test@example.com" };
    const db = {};
    Backend.rows().forEach((row) => (db[row.table] ||= []).push(JSON.parse(row.json)));
    const query = (rows) => { let out = rows.slice(); const q = { select: () => q, order: () => q, eq: (k, v) => { out = out.filter((x) => x[k] === v); return q; }, in: (k, vs) => { out = out.filter((x) => vs.includes(x[k])); return q; },
      range: async (a, b) => ({ data: out.slice(a, b + 1), error: null }), maybeSingle: async () => ({ data: out[0] || null }), single: async () => ({ data: out[0] || null }) }; return q; };
    Backend.client = { from: (t) => query(db[t] || []), rpc: async () => ({ data: [] }) };
    await Backend.pull(before.current);
    const after = S.state, diffs = [];
    const mine = Backend.loaded;
    for (const k of RECORD_KINDS) { const a = before[k].filter((x) => mine.has(x.churchId)).length, b = after[k].length; if (a !== b) diffs.push(`${k}: ${a} then ${b}`); }
    for (const [k, spec] of Object.entries(SPLIT)) before[k].filter((x) => mine.has(x.churchId)).forEach((x) => { const y = after[k].find((z) => z.id === x.id); if ((x[spec.field] || []).length !== (y?.[spec.field] || []).length) diffs.push(`${k} ${x.id} ${spec.field}`); });
    Object.values(before.churches).forEach((c) => { const d = after.churches[c.id]; if (!d || (mine.has(c.id) && d.roles.length !== c.roles.length) || d.locations.length !== c.locations.length || d.funds?.length !== c.funds?.length) diffs.push(`church ${c.id}`); });
    if (after.memberships.length !== before.memberships.length) diffs.push("memberships");
    const changed = Backend.rows().filter((row) => Backend.snap.get(row.key) !== row.json).map((row) => row.key);
    return { diffs, changed: changed.slice(0, 5), rows: Backend.snap.size };
  });
  if (r.diffs.length) throw new Error(`round trip lost data: ${r.diffs.slice(0, 6).join("; ")}`);
  if (r.changed.length) throw new Error(`rows look changed right after loading: ${r.changed.join(", ")}`);
  if (r.rows < 500) throw new Error(`only ${r.rows} rows`);
});

await browser.close(); server.close();
if (errors.length) { console.error(`FAILED (${errors.length})\n` + errors.join("\n")); process.exit(1); }
console.log("All screens rendered without errors. Screenshots in .shots/");
