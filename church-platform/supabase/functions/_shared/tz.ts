// Time zones on the server, matching src/js/00-util.js: a church has a time zone (churches.data.timeZone), and a
// campus in another zone has its own (locations.data.timeZone). Days ("YYYY-MM-DD") and clock times ("HH:MM") saved
// by the app are the church's; the server runs on UTC, so they're turned into moments here, never with new Date(`${day}T${time}`).

/** What a church that hasn't chosen a zone gets. Most churches on the platform so far are on Eastern time. */
export const DEFAULT_TZ = "America/New_York";

const ok = new Map<string, boolean>();
export function validTz(z: unknown): z is string {
  if (!z || typeof z !== "string") return false;
  if (!ok.has(z)) { try { new Intl.DateTimeFormat("en-US", { timeZone: z }); ok.set(z, true); } catch { ok.set(z, false); } }
  return ok.get(z)!;
}

type WithData = { data?: Record<string, unknown> | null } | null | undefined;
/** The zone for a church, or for one of its locations when that campus has its own. */
export function zoneOf(church: WithData, location?: WithData): string {
  const l = location?.data?.timeZone, c = church?.data?.timeZone;
  return validTz(l) ? l : validTz(c) ? c : DEFAULT_TZ;
}

// deno-lint-ignore no-explicit-any
type Db = any;
/** Each location's own zone, by location ID, for a church (only campuses that set one). */
export async function locationZones(db: Db, churchId: string): Promise<Map<string, string>> {
  const { data } = await db.from("locations").select("id, data").eq("church_id", churchId);
  const out = new Map<string, string>();
  for (const l of data || []) if (validTz(l.data?.timeZone)) out.set(l.id, l.data.timeZone);
  return out;
}

function parts(t: number, z: string) {
  const o: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", { timeZone: z, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date(t))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}
const offset = (t: number, z: string) => { const s = Math.floor(t / 1000) * 1000, p = parts(s, z); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - s; };

/** The moment (ms) a zone's clock reads `day` at `hhmm`. A skipped time lands just after the change; a repeated one takes the first. */
export function wallToUtc(day: string, hhmm: string, z: string): number {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number), [h, mi] = (hhmm || "00:00").split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h || 0, mi || 0);
  if (isNaN(wall)) return NaN;
  const a = wall - offset(wall, z), b = wall - offset(a, z);
  if (a === b) return a;
  const fits = [a, b].filter((t) => t + offset(t, z) === wall);
  return fits.length ? Math.min(...fits) : Math.max(a, b);
}

/** The zone's calendar day for a moment: "YYYY-MM-DD". */
export function dayIn(at: string | number | Date, z: string): string {
  const p = parts(new Date(at).getTime(), z);
  return `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
/** The hour (0-23) on the zone's clock now. */
export const hourIn = (z: string, at: number = Date.now()) => parts(at, z).h;

/** "Nov 29, 2026" in the zone. */
export const dateText = (at: string | number | Date, z: string) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: z });
/** "November 29, 2026" in the zone. */
export const longDateText = (at: string | number | Date, z: string) => new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: z });
/** "9:00 AM ET": a time in the zone, always labeled, since email and texts are read anywhere. */
export function timeText(at: string | number | Date, z: string): string {
  const t = new Date(at), clock = t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: z });
  let label = "";
  for (const style of ["shortGeneric", "short"] as const) {
    try { label = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: style }).formatToParts(t).find((p) => p.type === "timeZoneName")?.value || ""; } catch { /* older runtime */ }
    if (label) break;
  }
  return label ? `${clock} ${label}` : clock;
}
/** "Sun, Nov 29, 9:00 AM ET". */
export const whenText = (at: string | number | Date, z: string) => `${new Date(at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: z })}, ${timeText(at, z)}`;
