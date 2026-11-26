// Checks the time zone helpers in src/js/00-util.js: the church's zone, not the phone's, decides days and times.
// Runs the phone in Los Angeles (or whatever TZ says) against a church in New York, across both clock changes.
// Run: TZ=America/Los_Angeles node test/timezones.mjs   (also try TZ=Asia/Tokyo and TZ=America/New_York)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "js", "00-util.js"), "utf8");
const block = src.slice(src.indexOf("// ---------- Time zones"), src.indexOf("// ---------- Money"));
const church = { timeZone: "America/New_York", locations: [{ id: "c-main" }, { id: "c-west", timeZone: "America/Denver" }] };
let campus = "all";
const S = { state: {}, church: () => church, campus: () => campus };
const api = new Function("S", "appLocale", "lang", `${block}; return { DEVICE_TZ, tz, zp, zDate, zoneOffset, isoDay, today, fromIsoDay, startOfDay, addDays, addMonths, isoAdd, isoDow, isoWeekStart, hhmmOf, fmt, fmtDay, fmtShort, fmtTime, fmtClock, fmtWhen, timeLabel, tzDiffers, tzLabel, tzLongName, yourTime, nextWeekday, ageFrom, dayNum };`)(S, () => "en-US", () => "en");
const { tz, zp, zDate, isoDay, fromIsoDay, startOfDay, addDays, addMonths, isoAdd, isoDow, isoWeekStart, hhmmOf, fmtTime, fmtClock, timeLabel, tzDiffers, yourTime, nextWeekday, dayNum, fmtDay } = api;
const phone = api.DEVICE_TZ, NY = "America/New_York";
let n = 0;
const check = (name, fn) => { fn(); n++; console.log(`ok  ${name}`); };

check("zone comes from the church, a campus override, or the phone", () => {
  assert.equal(tz(), NY);
  assert.equal(tz("c-west"), "America/Denver");
  assert.equal(tz("c-main"), NY);
  campus = "c-west"; assert.equal(tz(), "America/Denver"); campus = "all";
  church.timeZone = "Not/AZone"; assert.equal(tz(), phone); church.timeZone = NY;
});

check("a calendar day starts at the church's midnight", () => {
  const d = fromIsoDay("2026-03-08");          // the day clocks go forward
  assert.equal(d.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(isoDay(d), "2026-03-08");
  assert.equal(dayNum(d), 8);
  assert.equal(fromIsoDay("2026-03-08", "09:00").toISOString(), "2026-03-08T13:00:00.000Z");   // after the change: EDT
  assert.equal(fromIsoDay("2026-11-01", "09:00").toISOString(), "2026-11-01T14:00:00.000Z");   // after fall back: EST
  assert.equal(fromIsoDay("2026-11-01", "01:30").toISOString(), "2026-11-01T05:30:00.000Z");   // repeated hour: the first
  assert.equal(fromIsoDay("2026-03-08", "02:30").toISOString(), "2026-03-08T07:30:00.000Z");   // skipped hour: just after
});

check("late-evening moments belong to the church's day, not the phone's", () => {
  const t = new Date("2026-06-15T02:30:00Z");   // 10:30 PM June 14 in New York, 7:30 PM in LA, June 15 in Tokyo
  assert.equal(isoDay(t), "2026-06-14");
  assert.equal(zp(t).dow, 0);
  assert.equal(hhmmOf(t), "22:30");
  assert.equal(startOfDay(t).toISOString(), "2026-06-14T04:00:00.000Z");
});

check("adding days keeps the clock time across a clock change", () => {
  const sat = fromIsoDay("2026-10-31", "09:00");
  assert.equal(addDays(sat, 1).toISOString(), "2026-11-01T14:00:00.000Z");
  assert.equal(addDays(sat, 7).toISOString(), "2026-11-07T14:00:00.000Z");
  assert.equal(addMonths(fromIsoDay("2026-01-31", "10:00"), 1).toISOString(), "2026-02-28T15:00:00.000Z");
  assert.equal(isoAdd("2026-12-31", 1), "2027-01-01");
  assert.equal(isoDow("2026-11-29"), 0);
  assert.equal(isoWeekStart("2026-11-25"), "2026-11-22");
});

check("next Sunday 9:00 is the church's Sunday", () => {
  const from = new Date("2026-11-29T04:30:00Z");          // 11:30 PM Saturday in NY, still Saturday in LA, Sunday in Tokyo
  assert.equal(nextWeekday(0, "09:00", 0, from).toISOString(), "2026-11-29T14:00:00.000Z");
  assert.equal(nextWeekday(0, "09:00", 1, from).toISOString(), "2026-12-06T14:00:00.000Z");
  const sundayNoon = new Date("2026-11-29T17:00:00Z");    // after the 9:00 service
  assert.equal(nextWeekday(0, "09:00", 0, sundayNoon).toISOString(), "2026-12-06T14:00:00.000Z");
});

check("times show on the church's clock, labeled only when the phone differs", () => {
  const t = fromIsoDay("2026-12-06", "09:00");
  assert.equal(fmtClock(t), "9:00 AM");
  if (tzDiffers(t)) {
    assert.match(fmtTime(t), /^9:00 AM (ET|EST)$/);
    assert.match(timeLabel("09:00"), /^9:00 AM (ET|EST|EDT)$/);
    assert.notEqual(yourTime(t), "");
  } else {
    assert.equal(fmtTime(t), "9:00 AM");
    assert.equal(yourTime(t), "");
  }
  assert.equal(fmtDay("2026-12-06"), "Sunday, December 6");
  assert.equal(fmtTime(t, NY), fmtTime(t));
});

check("a zone label is never added when the phone is in the church's zone", () => {
  assert.equal(tzDiffers(new Date(), phone), false);
  assert.equal(fmtTime(new Date("2026-12-06T14:00:00Z"), phone).includes(" ET"), false);
});

check("ages use the church's today", () => {
  const y = zp(new Date()).y;
  assert.equal(api.ageFrom(`${y - 30}-01-01`), 30);
});

check("invalid input doesn't throw", () => {
  assert.equal(api.fmt("", { month: "short" }), "");
  assert.equal(fmtTime(undefined), "");
  assert.ok(isNaN(fromIsoDay("")));
  assert.ok(isNaN(zDate(NaN, 1, 1)));
});

console.log(`\n${n} checks passed (phone: ${phone}, church: ${NY})`);
