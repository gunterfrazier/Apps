// ---------- The desktop layout ----------
// On a computer (a window at least 1100px wide) the app trades the phone's bottom tabs for a sidebar, and pages get
// room to breathe. The sidebar has the same main tabs, then the workspaces this person's role opens: presenting and
// the booth, screens, security, the builders, the dashboard, reports, finance, scheduling, check-in and admin. Each
// shows only when the role allows it and the church has the feature on, the same checks each page makes for itself.
// It can fold to icons; the choice is kept on the computer. Presenting, kiosks, paired devices and full-page screens
// (the workstation lock screen, a stage display) keep their own layout.

const SIDE_KEY = "ofc-side";
const DESKTOP_MIN = 1100;
const isDesktop = () => innerWidth >= DESKTOP_MIN;
const sideFolded = () => { try { return localStorage.getItem(SIDE_KEY) === "folded"; } catch { return false; } };
// Workspaces get the full width of the window; other pages a comfortable reading width.
const WIDE_HEADS = new Set(["offering", "wall", "directory", "person", "dashboard", "reports", "treasurer", "security", "admin", "devices", "services", "docs", "build", "teams", "admin-checkin", "rooms", "people", "report", "insights", "safety", "incident"]);

/** The workspaces this person's role opens, grouped. Each item: [route, icon, label, which heads count as "here"]. */
function workspacesFor() {
  if (!S.isMember() || thisDevice()) return [];
  const on = (m) => S.on(m), off = (h) => typeof featureOffFor === "function" && !!featureOffFor(h);
  const groups = [
    ["Sunday", [
      S.can("present") && on("presentations") && ["services", "screen", "Booth and presenting", ["services", "service", "present", "booth", "slides", "setlist"]],
      S.can("services.plan") && !S.can("present") && on("presentations") && ["services", "list", "Service plans", ["services", "service", "slides", "setlist"]],
      typeof canWall === "function" && canWall() && ["wall", "layers", "Screen wall", ["wall"]],
      S.can("manage.devices") && ["devices", "lock", "Screens and devices", ["devices", "booth-screens", "booth-check", "control-keys", "signs"]],
      S.can("schedule.teams") && on("volunteers") && ["teams", "hand", "Volunteer scheduling", ["teams", "team"]],
      S.can("checkin.station") && on("checkin") && ["admin-checkin", "kid", "Check-in", ["admin-checkin", "kiosk"]],
    ]],
    ["Teaching", [
      S.can("build.sermons") && !off("#docs-sermon") && ["docs-sermon", "word", "Sermon builder", ["docs-sermon"]],
      S.can("build.lessons") && !off("#docs-lesson") && ["docs-lesson", "door", "Lesson builder", ["docs-lesson"]],
      S.can("build.studies") && !off("#docs-study") && ["docs-study", "book", "Study builder", ["docs-study"]],
    ]],
    ["Safety", [
      typeof isSecurityMember === "function" && on("safety") && (isSecurityMember() || securityAdmin()) && ["security", "shield", "Security command", ["security"]],
    ]],
    ["Office", [
      hasAdminTools() && ["dashboard", "layers", "Dashboard", ["dashboard"]],
      canReports() && ["reports", "chart", "Reports", ["reports", "report"]],
      typeof canTreasurer === "function" && canTreasurer() && on("finance") && ["treasurer", "give", "Finance", ["treasurer"]],
      typeof canOffering === "function" && canOffering() && on("finance") && ["offering", "list", "Offering count", ["offering"]],
      hasAdminTools() && ["admin", "gear", "Admin", ["admin"]],
    ]],
  ];
  return groups.map(([name, items]) => [name, items.filter(Boolean)]).filter(([, items]) => items.length);
}

/** The sidebar, or nothing where a page keeps its own layout. */
function sideNav(view, head) {
  const c = S.church();
  if (!c || !isDesktop() || view.present || view.kiosk || view.page || thisDevice()) return "";
  const route = location.hash.slice(1), here = (heads) => heads.some((h) => route === h || route.startsWith(`${h}-`) || head === h);
  const link = ([to, ic, label, heads]) => html`<a href="#${to}" class="side-link" ${attr(here(heads), 'aria-current="page"')} title="${label}">${icon(ic)}<span>${label}</span></a>`;
  const main = tabsFor().map((t) => [t.route || t.id, t.icon, t.label, [t.id, ...(t.screens || [])]]);
  const me = S.me();
  return html`<nav class="side" aria-label="Main and workspaces">
    <a class="side-church" href="#home" title="${c.name}">${churchMark(c, 34)}<span>${c.name}</span></a>
    ${S.isMember() ? html`<button type="button" class="side-link side-search" data-act="cmdk" title="Search and commands (${modKey()}+K)">${icon("search")}<span>Search</span><kbd>${modKey()} K</kbd></button>` : ""}
    <div class="side-group">${main.map(link)}</div>
    ${workspacesFor().map(([name, items]) => html`<div class="side-group"><p class="side-h">${name}</p>${items.map(link)}</div>`)}
    <div class="side-foot">
      <a href="#me" class="side-link side-me" ${attr(route === "me", 'aria-current="page"')} title="${me.name || "Me"}">${avatar(me, "sm")}<span>${me.name || "Me"}</span></a>
      <button type="button" class="side-link side-fold" data-act="side-fold" aria-pressed="${sideFolded()}" title="${sideFolded() ? "Show labels" : "Icons only"}">${icon(sideFolded() ? "next" : "back")}<span>Icons only</span></button>
    </div></nav>`;
}
/** Marks the page for the desktop layout: a sidebar is showing, and how wide the page should be. */
function desktopClasses(view, head) {
  const side = !!$(".side");
  document.body.classList.toggle("has-side", side);
  document.body.classList.toggle("side-folded", side && sideFolded());
  document.body.classList.toggle("page-wide", side && (WIDE_HEADS.has(head) || !!view.wide));
}
Actions["side-fold"] = () => { try { localStorage.setItem(SIDE_KEY, sideFolded() ? "open" : "folded"); } catch { /* private mode */ } render(); };
// Crossing the desktop width redraws once, so the sidebar comes and goes with the window.
let wasDesktop = isDesktop();
addEventListener("resize", () => { if (isDesktop() !== wasDesktop) { wasDesktop = isDesktop(); render(); } });
