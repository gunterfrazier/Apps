import { useSyncExternalStore } from "react";
import type { TranslationId } from "../core/bible";
import { IS_ARTIFACT } from "./files";

type OfflineStatus = { translation?: TranslationId; state: "preparing" | "ready" | "failed" | "idle" };
const listeners = new Set<() => void>();
let status: OfflineStatus = { state: "idle" };
let job = 0;
let registration: Promise<ServiceWorkerRegistration> | undefined;
let watching = false;

export const offlineSupported = !IS_ARTIFACT && window.isSecureContext && "serviceWorker" in navigator;

function show(next: OfflineStatus) {
  status = next;
  listeners.forEach((listener) => listener());
}

export const useOfflineStatus = () => useSyncExternalStore((listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
}, () => status);

function readyWorker() {
  registration ??= navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).catch((error) => {
    registration = undefined;
    throw error;
  });
  return registration;
}

function download(translation: TranslationId): Promise<void> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      channel.port1.close();
      if (ready) resolve();
      else reject(new Error("The study download did not finish."));
    };
    const timer = setTimeout(() => finish(false), 120_000);
    channel.port1.onmessage = (event) => finish(event.data?.ready === true);
    readyWorker().then((reg) => {
      if (!reg.active) { finish(false); return; }
      reg.active.postMessage({ type: "prepare-study", translation }, [channel.port2]);
    }).catch(() => finish(false));
  });
}

export function prepareOffline(translation: TranslationId, retry = false) {
  if (!offlineSupported || (!retry && status.translation === translation && status.state !== "failed")) return;
  if (!watching) {
    watching = true;
    // A newly activated build has its own asset revision, so warm it even if the page hasn't reloaded yet.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (status.translation) prepareOffline(status.translation, true);
    });
    window.addEventListener("online", () => {
      if (status.translation && status.state === "failed") prepareOffline(status.translation, true);
    });
  }
  const current = ++job;
  show({ translation, state: "preparing" });
  download(translation).then(
    () => { if (current === job) show({ translation, state: "ready" }); },
    () => { if (current === job) show({ translation, state: "failed" }); },
  );
}
