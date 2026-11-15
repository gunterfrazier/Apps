/**
 * Veritas Logos accounts, on the website only. When site.config.json names the account service, the app loads
 * account.js (src/account) and keeps a signed-in reader's data in step across their devices. Inside Claude the owner's
 * Claude account does that instead (connectCloud in store.ts), and a copy of the site without accounts just uses the
 * browser.
 */
import { useSyncExternalStore } from "react";
import type { AccountApi, AccountModule, AccountUser, SignInMethods } from "../account/types";
import { IS_ARTIFACT, clearStoredFiles } from "./files";
import { attachCloud, clearDeviceData, detachCloud, flushCloud, navigate, releaseDeviceData, toast } from "./store";

const cfg = (window as any).VERITAS_CONFIG?.accounts as { url?: string; key?: string } | undefined;
/** True on the website when accounts are set up. */
export const ACCOUNTS_ON = Boolean(!IS_ARTIFACT && !(window as any).claude?.use && cfg?.url && cfg?.key);
/** True inside Claude, where the owner's Claude account keeps the data. */
export const IN_CLAUDE = Boolean(IS_ARTIFACT || (window as any).claude?.use);

export type AccountStatus = "off" | "loading" | "signed-out" | "signed-in" | "unavailable";
export interface AccountState { status: AccountStatus; user: AccountUser | null; methods: SignInMethods | null }

let api: AccountApi | null = null;
let st: AccountState = { status: ACCOUNTS_ON ? "loading" : "off", user: null, methods: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<AccountState>) => { st = { ...st, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useAccount = () => useSyncExternalStore(subscribe, () => st);

/** The account service, once it has loaded. Pages call this only when the status says it's there. */
export function account(): AccountApi {
  if (!api) throw new Error("Sign-in hasn't loaded. Check your connection and reload the page.");
  return api;
}

let attachedFor: string | null = null;
function onUser(user: AccountUser | null) {
  if (user) {
    set({ status: "signed-in", user });
    if (attachedFor !== user.id) {
      attachedFor = user.id;
      attachCloud(account().collection, "account", user.id).then((ok) => { if (!ok) toast("Couldn't reach your account. Your work is kept in this browser and will be saved when it's back."); });
    }
  } else {
    set({ status: "signed-out", user: null });
    // Signed out here or elsewhere: this browser keeps its copy, marked as that reader's, until someone clears it.
    if (attachedFor) { const was = attachedFor; attachedFor = null; detachCloud(was); }
  }
}

const RETURN_KEY = "veritas.return";

export async function initAccounts() {
  if (!ACCOUNTS_ON) return;
  try {
    // Loaded at run time from the same folder as the app, so the page published to Claude never fetches it.
    const url = new URL("account.js", document.baseURI).href;
    const mod = (await import(/* webpackIgnore: true */ url)) as AccountModule;
    api = mod.createAccount({ url: cfg!.url!, key: cfg!.key!, redirectTo: location.origin + location.pathname });
    api.onChange(onUser);
    const { user, error } = await api.ready;
    if (error) toast(`Sign-in didn't finish: ${error}`);
    onUser(user);
    let back: string | null = null;
    try { back = sessionStorage.getItem(RETURN_KEY); sessionStorage.removeItem(RETURN_KEY); } catch { /* fine */ }
    if (back !== null && user) { navigate(back || "account"); toast("Signed in"); }
    api.methods().then((methods) => set({ methods }));
  } catch {
    set({ status: "unavailable" });
  }
}

/** Signs out on this device. With removeHere, the reader's data leaves this browser too, and the page reloads. */
export async function signOut(removeHere: boolean): Promise<void> {
  const saved = await flushCloud();
  if (!saved && !confirm("Some changes haven't reached your account yet. Sign out anyway and lose them?")) return;
  await account().signOut();
  if (removeHere) await wipeAndReload();
  else toast("Signed out. Your data stays in this browser.");
}

/** Deletes the account and everything saved in it. With removeHere, this browser's copy goes too. */
export async function deleteAccount(removeHere: boolean): Promise<void> {
  await account().deleteAccount();
  if (removeHere) await wipeAndReload();
  else {
    // What's left here is nobody's now, so a new account made on this device starts from it.
    releaseDeviceData();
    toast("Your account has been deleted. This browser still has its copy.");
  }
}

async function wipeAndReload() {
  clearDeviceData();
  await clearStoredFiles().catch(() => {});
  location.hash = "account";
  location.reload();
}

/** For the Google button: where to come back to after Google signs the reader in. */
export const currentHash = () => location.hash.slice(1);
