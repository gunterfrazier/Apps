// ---------- Start ----------
S.load();
window.addEventListener("hashchange", () => { closeSheet(true); render(); });
window.addEventListener("pagehide", () => S.flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") S.flush(); });
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("presenting")) render(); });
render();

// Offline support when the app runs on its own website. Inside the preview frame this is refused, which is fine.
try {
  if ("serviceWorker" in navigator && location.protocol === "https:" && !IN_PREVIEW) navigator.serviceWorker.register("sw.js").catch(() => {});
} catch { /* not available here */ }
