// ---------- Desktop: a list beside the selected item's details ----------
// splitView(list, detail) shows a page's list on the left and what's picked on the right, on a computer (isDesktop);
// pages call it only there, so phones keep their list-then-page layout. The list scrolls on its own and keeps its place
// when the page redraws. Arrow keys on a row move to the next or previous one (skipping rows a search has hidden) and
// open it; Arrow Down in the list's search box goes to the first row. The row whose link matches the page, or that has
// .on, is shown as picked.

function splitView(list, detail, key) {
  return html`<div class="split" data-split="${key}"><div class="split-list">${list}</div>
    <div class="split-detail" aria-live="polite">${detail || html`<div class="split-none">${icon("user")}<p class="muted">Choose someone on the left.</p></div>`}</div></div>`;
}
const Split = { focus: false, scroll: null };
const splitRows = (root) => $$(".row", root).filter((r) => !r.hidden && r.offsetParent !== null && (r.matches("a[href^='#'], button[data-act]")));
function splitOpen(row) {
  Split.focus = true;
  const href = row.getAttribute("href");
  if (href?.startsWith("#")) location.replace(href); // moving through a list shouldn't fill Back with every row
  else row.click();
}
document.addEventListener("keydown", (e) => {
  const list = e.target.closest?.(".split-list"); if (!list || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const rows = splitRows(list);
  if (e.target.matches("input[type=search]")) { if (e.key === "ArrowDown" && rows[0]) { e.preventDefault(); rows[0].focus(); } return; }
  const at = rows.indexOf(e.target.closest(".row")); if (at < 0) return;
  const next = rows[at + (e.key === "ArrowDown" ? 1 : -1)]; if (!next) return;
  e.preventDefault(); splitOpen(next);
});
const splitRenderBase = render;
render = function (...a) { // eslint-disable-line no-func-assign
  const before = $(".split-list"); if (before) Split.scroll = { key: before.parentElement.dataset.split, y: before.scrollTop, q: $("input[type=search]", before)?.value || "" };
  const r = splitRenderBase.apply(this, a);
  splitAfter();
  return r;
};
function splitAfter() {
  const split = $(".split"); if (!split) { Split.focus = false; return; }
  const list = $(".split-list", split);
  if (Split.scroll?.key === split.dataset.split) {
    const q = $("input[type=search]", list); // a search keeps filtering while you pick people from it
    if (q && Split.scroll.q && !q.value) { q.value = Split.scroll.q; q.dispatchEvent(new Event("input", { bubbles: true })); }
    list.scrollTop = Split.scroll.y;
  }
  $$(".row", list).forEach((r) => { if (r.getAttribute("href") === location.hash) r.classList.add("on"); });
  const on = $(".row.on", list);
  if (on) { on.setAttribute("aria-current", "true"); on.scrollIntoView({ block: "nearest" }); if (Split.focus) on.focus({ preventScroll: true }); }
  Split.focus = false;
  split.style.height = `${Math.max(420, innerHeight - split.getBoundingClientRect().top - 12)}px`;
}
addEventListener("resize", () => { const s = $(".split"); if (s) s.style.height = `${Math.max(420, innerHeight - s.getBoundingClientRect().top - 12)}px`; });
