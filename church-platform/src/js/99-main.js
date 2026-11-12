// ---------- Start ----------
S.load();
applyDisplay();
window.addEventListener("hashchange", () => { closeSheet(true); render(); });
window.addEventListener("pagehide", () => S.flush());
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") S.flush(); });
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("presenting")) render(); });
render();
Backend.start();
setTimeout(runReminders, 1500);

// Offline support when the app runs on its own website. Inside the preview frame this is refused, which is fine.
try {
  if ("serviceWorker" in navigator && window.isSecureContext && !IN_PREVIEW) navigator.serviceWorker.register("sw.js").catch(() => {});
} catch { /* not available here */ }

// For local testing only: open the app with ?debug to reach the store from the console.
if (/[?&]debug\b/.test(location.search)) window.__app = { S, roomUses, bookingConflicts, meetingTimes, Backend, RECORD_KINDS, SPLIT, signPlay, render };
