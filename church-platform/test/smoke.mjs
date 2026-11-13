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
const page = await ctx.newPage();
page.setDefaultTimeout(+process.env.STEP_TIMEOUT || 8000);
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|Failed to load resource|ERR_/.test(m.text())) errors.push(`console: ${m.text()}`); });
await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());

let current = "";
const step = async (name, fn) => { current = name; try { await fn(); } catch (e) { errors.push(`${name}: ${e.message.split("\n")[0]}`); await shot(`fail-${name.replace(/\W+/g, "-")}`).catch(() => {}); } };
const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });
const goTo = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(90); };
const text = () => page.textContent("#app");
const expectText = async (s) => { const t = await text(); if (!t.includes(s)) throw new Error(`expected "${s}" on #${await page.evaluate(() => location.hash.slice(1))}`); };
const sheetSubmit = () => page.click("#scrim form button.btn:not([type=button])");
const sheetGone = () => page.waitForSelector("#scrim", { state: "detached", timeout: 4000 });

await page.goto(base + "#event-riverside-e1");
await step("welcome", async () => {
  await shot("01-welcome");
  await page.fill("input[name=name]", "Gunter Frazier");
  await page.fill("input[name=email]", "gunter@example.com");
  await page.click("form[data-form=welcome] button");
  await page.waitForSelector("h1:has-text('Thanksgiving potluck')"); // the link they arrived with
});
await step("join as basic member", async () => {
  await goTo("church-riverside"); await page.click("[data-act=join-church]");
  await page.waitForSelector(".home-top"); await shot("02-home");
  await goTo("me"); await expectText("Member");
  if (await page.$('a[href="#admin"]')) throw new Error("a new member should not see Admin");
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
    await page.fill("#scrim input[name=name]", name); await page.fill("#scrim input[name=birth]", birth); await page.fill("#scrim input[name=notes]", notes);
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
await step("become primary", async () => {
  await goTo("me"); await page.click("[data-act=demo-primary]"); await page.waitForSelector("text=Account details"); await shot("06-admin");
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
  await h.scrollIntoViewIfNeeded(); const a = await h.boundingBox(); const b = await target.boundingBox();
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
  await page.fill("input[name=kid0]", "Ava"); await page.fill("input[name=allergy0]", "Eggs"); await page.click("[data-act=kiosk-more]"); await page.fill("input[name=kid1]", "Leo");
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
  const k = await tab(1024, 768); await k.goto(base + "#pair"); await k.fill("input[name=code]", code.toLowerCase()); await k.click("form[data-form=pair] button");
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
