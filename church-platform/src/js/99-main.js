// ---------- Start ----------
// Opened at the www name or an old address? Go to the app's one address instead of starting here (see forwardHome).
if (!FORWARDING) {
  S.load();
  sandboxStart();
  applyDisplay();
  window.addEventListener("hashchange", () => { ForegroundAlerts.hide(); closeSheet(true); render(); });
  document.addEventListener("click", () => ForegroundAlerts.unlockAudio());
  document.addEventListener("keydown", () => ForegroundAlerts.unlockAudio());
  window.addEventListener("pagehide", () => S.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      S.flush();
      OpeningSummary.pending = true;
    } else OpeningSummary.show();
  });
  // Without a server, every tab of this browser shares one saved copy. When another tab saves (an admin making a pairing
  // code, a display showing the next slide), pick it up, so this tab doesn't later save its older copy over it.
  window.addEventListener("storage", (e) => {
    if (e.key !== PLATFORM.storageKey || !e.newValue || Backend.on || S._timer) return;
    S.load();
    const busy = document.getElementById("scrim") || document.activeElement?.matches?.("input, textarea, select, [contenteditable]");
    if (!busy) render();
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("presenting")) render(); });
  render();
  Backend.start();
  setTimeout(runReminders, 1500);

  // Offline support when the app runs on its own website. Inside the preview frame this is refused, which is fine.
  try {
    if ("serviceWorker" in navigator && window.isSecureContext && !IN_PREVIEW) navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch { /* not available here */ }
}

// For local testing only: open the app with ?debug to reach the store from the console.
if (/[?&]debug\b/.test(location.search)) window.__app = { S, roomUses, bookingConflicts, meetingTimes, Backend, RECORD_KINDS, SPLIT, signPlay, render, pres, roomAccess, activeRoomSession, DeviceSignin, deactTick, presencePrompt, serviceNow, welcomeOf, PLACE_TYPES, emailAudiences, datesComing };
