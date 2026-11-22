import { useSyncExternalStore } from "react";
import { DEFAULT_TRANSLATION, isOffered, type TranslationId } from "../core/bible";
import { LENS_IDS, type LensId } from "../core/content";
import { sanitizeGuide, type Guide } from "../core/guide";
import type { CiteRecord } from "../core/cite";
import type { CloudCollection } from "../account/types";
import { combineRead, sanitizeMemory, sanitizeRead, type MemoryVerse, type ReadMap } from "../core/practice";

export const THEMES = [
  ["system", "Match this device"],
  ["light", "Light"],
  ["sepia", "Sepia"],
  ["dark", "Dark"],
] as const;
export type Theme = (typeof THEMES)[number][0];
export type HighlightColor = "amber" | "green" | "blue" | "rose";
export const HIGHLIGHT_COLORS: HighlightColor[] = ["amber", "green", "blue", "rose"];
export interface NotebookCollection { id: string; name: string; entries: string[] }
export interface VerseNote { key: string; ref: string; text: string; updatedAt: string; tags?: string[] }
/** A research note, not tied to one verse. Passages, terms and writers it names become links both ways. */
export interface NoteEntry { id: string; title: string; body: string; tags: string[]; createdAt: string; updatedAt: string }
/** A file the owner attached to a source. It's kept in the page's private storage or in this browser. */
export interface Attachment { id: string; name: string; size: number; assetId?: string; url?: string; local?: boolean }
export interface SourceEntry extends CiteRecord { addedAt: string; files?: Attachment[]; notes?: string }
export interface SavedSearch { id: string; label: string; q: string; scopes: string[]; from: number; to: number; tradition: string }
export interface Prefs {
  translation: TranslationId;
  compare: TranslationId | "";
  highlightDifferences: boolean;
  wordStudy: boolean;
  hideVerseNumbers: boolean;
  hideSectionHeadings: boolean;
  hideStudyPrompt: boolean;
  lens: LensId;
  theme: Theme;
  textSize: number;
  voice: string;
  /** Who reads aloud: the browser's own engine when it has one, or always the voice built into the app. */
  readVoice: "device" | "builtin";
  rate: number;
  /** Whether listening carries on into the next chapter. */
  listenContinue: boolean;
  apiBase: string;
  apiKey: string;
}
export interface UserData {
  prefs: Prefs;
  guides: Guide[];
  /** "book:chapter:verse" -> color */
  highlights: Record<string, HighlightColor>;
  bookmarks: string[];
  notes: Record<string, VerseNote>;
  figures: string[];
  lastRead: { book: number; chapter: number };
  activeGuideId: string | null;
  notebook: NoteEntry[];
  notebookCollections: NotebookCollection[];
  sources: SourceEntry[];
  savedSearches: SavedSearch[];
  /** The last few places visited, for picking up where you left off. */
  recent: { hash: string; label: string }[];
  /** Verses being memorized (src/core/practice.ts). */
  memory: MemoryVerse[];
  /** Chapters marked read: "book:chapter" -> the day. */
  chaptersRead: ReadMap;
}

const KEY = "veritas.logos.v2";
const defaults: UserData = {
  prefs: { translation: DEFAULT_TRANSLATION, compare: "", highlightDifferences: false, wordStudy: false, hideVerseNumbers: false, hideSectionHeadings: false, hideStudyPrompt: false, lens: "all", theme: "system", textSize: 19, voice: "", readVoice: "device", rate: 1, listenContinue: true, apiBase: "", apiKey: "" },
  guides: [],
  highlights: {},
  bookmarks: [],
  notes: {},
  figures: [],
  lastRead: { book: 43, chapter: 3 },
  activeGuideId: null,
  notebook: [],
  notebookCollections: [],
  sources: [],
  savedSearches: [],
  recent: [],
  memory: [],
  chaptersRead: {},
};

function loadInitial(): UserData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return mergeData(JSON.parse(raw));
  } catch {
    return defaults;
  }
}

/** Accepts stored data or a backup file, keeping only what fits the expected shape. */
export function mergeData(raw: any): UserData {
  const p = raw?.prefs ?? {};
  return {
    prefs: {
      translation: isOffered(p.translation) ? p.translation : DEFAULT_TRANSLATION,
      compare: isOffered(p.compare) ? p.compare : "",
      highlightDifferences: p.highlightDifferences === true,
      wordStudy: p.wordStudy === true,
      hideVerseNumbers: p.hideVerseNumbers === true,
      hideSectionHeadings: p.hideSectionHeadings === true,
      hideStudyPrompt: p.hideStudyPrompt === true,
      lens: LENS_IDS.includes(p.lens) ? p.lens : "all",
      theme: THEMES.find(([theme]) => theme === p.theme)?.[0] ?? "system",
      textSize: typeof p.textSize === "number" ? Math.min(30, Math.max(14, p.textSize)) : 19,
      voice: typeof p.voice === "string" ? p.voice : "",
      readVoice: p.readVoice === "builtin" ? "builtin" : "device",
      rate: typeof p.rate === "number" ? p.rate : 1,
      listenContinue: p.listenContinue !== false,
      apiBase: typeof p.apiBase === "string" ? p.apiBase : "",
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
    },
    guides: Array.isArray(raw?.guides) ? raw.guides.map(sanitizeGuide).filter(Boolean) : [],
    highlights: raw?.highlights && typeof raw.highlights === "object" ? raw.highlights : {},
    bookmarks: Array.isArray(raw?.bookmarks) ? raw.bookmarks.filter((x: unknown) => typeof x === "string") : [],
    notes: raw?.notes && typeof raw.notes === "object" ? raw.notes : {},
    figures: Array.isArray(raw?.figures) ? raw.figures.filter((x: unknown) => typeof x === "string") : [],
    lastRead: raw?.lastRead?.book ? raw.lastRead : defaults.lastRead,
    activeGuideId: typeof raw?.activeGuideId === "string" ? raw.activeGuideId : null,
    notebook: Array.isArray(raw?.notebook) ? raw.notebook.filter((n: any) => n && typeof n.id === "string") : [],
    notebookCollections: Array.isArray(raw?.notebookCollections) ? raw.notebookCollections.flatMap((n: any) => (
      n && typeof n.id === "string" && typeof n.name === "string" && n.name.trim() && Array.isArray(n.entries)
        ? [{ id: n.id, name: n.name.trim().slice(0, 80), entries: [...new Set<string>(n.entries.filter((key: unknown) => typeof key === "string"))] }]
        : []
    )) : [],
    sources: Array.isArray(raw?.sources) ? raw.sources.filter((n: any) => n && typeof n.id === "string" && typeof n.title === "string") : [],
    savedSearches: Array.isArray(raw?.savedSearches) ? raw.savedSearches.filter((n: any) => n && typeof n.id === "string") : [],
    recent: Array.isArray(raw?.recent) ? raw.recent.filter((n: any) => n && typeof n.hash === "string").slice(0, 8) : [],
    memory: sanitizeMemory(raw?.memory),
    chaptersRead: sanitizeRead(raw?.chaptersRead),
  };
}

let state = loadInitial();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveFailed = false;

function writeNow() {
  saveTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    if (!saveFailed) toast("Couldn't save to this browser. Back up your work from Library.");
    saveFailed = true;
  }
}
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 150);
}
// Don't lose the last few keystrokes when the tab closes or the phone switches apps.
const flush = () => { if (saveTimer) { clearTimeout(saveTimer); writeNow(); } };
window.addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

export function update(fn: (d: UserData) => UserData) {
  state = fn(state);
  persist();
  queueCloudSave();
  listeners.forEach((l) => l());
}
export const getData = () => state;

// ---------- Saving to an account ----------
// Inside Claude, browser storage alone can come back empty, so everything is also kept in the page's private database,
// which follows the owner between devices. On the website, a reader who signs in gets the same from their Veritas Logos
// account (src/account). Either way each guide is its own document and everything else shares one profile document.
export type SyncState = "local" | "connecting" | "saved" | "saving" | "failed";
/** Where the data is being saved besides this browser: the owner's Claude account, or a Veritas Logos account. */
export type SyncTarget = "claude" | "account";
let syncState: SyncState = "local";
let syncTarget: SyncTarget | null = null;
const syncListeners = new Set<() => void>();
const setSync = (s: SyncState) => { syncState = s; syncListeners.forEach((l) => l()); };
const subscribeSync = (cb: () => void) => { syncListeners.add(cb); return () => { syncListeners.delete(cb); }; };
export const useSyncState = () => useSyncExternalStore(subscribeSync, () => syncState);
export const useSyncTarget = () => useSyncExternalStore(subscribeSync, () => syncTarget);

let cloud: CloudCollection | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let lastSaved = new Map<string, string>();
/** Waiting to connect after a failed first try: retried when the page comes back into view or the network returns. */
let pending: { collection: CloudCollection; target: SyncTarget; owner: string } | null = null;
// Which account this browser's copy belongs to: "1" inside Claude, the reader's account id on the website, and
// "left:<id>" once that reader has signed out and kept their data here.
const SYNCED_FLAG = "veritas.logos.synced";
const profileOf = (d: UserData) => ({ notebook: d.notebook, notebookCollections: d.notebookCollections, sources: d.sources, savedSearches: d.savedSearches, highlights: d.highlights, bookmarks: d.bookmarks, notes: d.notes, figures: d.figures, lastRead: d.lastRead, activeGuideId: d.activeGuideId, memory: d.memory, chaptersRead: d.chaptersRead, prefs: { ...d.prefs, apiKey: "" } });
const guideDocId = (id: string) => `guide-${id}`;

/** The later of two versions of the same item. On a tie, or with no dates, the first one stays. */
const later = <T extends { updatedAt?: string }>(a: T, b: T): T => ((b.updatedAt ?? "") > (a.updatedAt ?? "") ? b : a);
function byId<T extends { id: string; updatedAt?: string }>(first: T[], second: T[]): T[] {
  const out = first.map((f) => { const s = second.find((x) => x.id === f.id); return s ? later(f, s) : f; });
  return [...out, ...second.filter((s) => !first.some((f) => f.id === s.id))];
}
const union = (a: string[], b: string[]) => [...a, ...b.filter((x) => !a.includes(x))];

/**
 * Everything in either copy, with the later version of anything both have. Settings, the last place read and the open
 * guide come from the first copy, and so do highlight colors both copies set.
 */
export function combineData(first: UserData, second: UserData): UserData {
  const notes = { ...first.notes };
  for (const [k, n] of Object.entries(second.notes)) notes[k] = notes[k] ? later(notes[k], n) : n;
  return {
    ...first,
    guides: byId(first.guides, second.guides),
    highlights: { ...second.highlights, ...first.highlights },
    bookmarks: union(first.bookmarks, second.bookmarks),
    notes,
    figures: union(first.figures, second.figures),
    notebook: byId(first.notebook, second.notebook),
    notebookCollections: byId(first.notebookCollections, second.notebookCollections).map((collection) => {
      const other = second.notebookCollections.find((item) => item.id === collection.id);
      return other ? { ...collection, entries: union(collection.entries, other.entries) } : collection;
    }),
    sources: byId(first.sources, second.sources),
    savedSearches: byId(first.savedSearches, second.savedSearches),
    recent: [...first.recent, ...second.recent.filter((r) => !first.recent.some((x) => x.hash === r.hash))].slice(0, 8),
    memory: byId(first.memory, second.memory),
    chaptersRead: combineRead(first.chaptersRead, second.chaptersRead),
  };
}

function queueCloudSave() {
  if (!cloud) return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => { cloudTimer = null; saveToCloud(); }, 800);
}

/** Sends whatever changed since the last save. Resolves true once the account has everything. */
async function saveToCloud(): Promise<boolean> {
  const target = cloud;
  if (!target) return false;
  const wanted = new Map<string, string>([["profile", JSON.stringify(profileOf(state))]]);
  for (const g of state.guides) wanted.set(guideDocId(g.id), JSON.stringify({ guide: g }));
  const writes = [...wanted].filter(([k, v]) => lastSaved.get(k) !== v);
  const removals = [...lastSaved.keys()].filter((k) => !wanted.has(k));
  if (!writes.length && !removals.length) return true;
  setSync("saving");
  saving = true;
  try {
    if (target.setMany) {
      if (writes.length) await target.setMany(writes.map(([k, v]) => [k, JSON.parse(v)]));
      writes.forEach(([k, v]) => lastSaved.set(k, v));
    } else {
      // One write at a time per document.
      for (const [k, v] of writes) {
        await target.doc(k).set(JSON.parse(v));
        lastSaved.set(k, v);
      }
    }
    if (target.deleteMany) {
      if (removals.length) await target.deleteMany(removals);
      removals.forEach((k) => lastSaved.delete(k));
    } else {
      for (const k of removals) {
        await target.doc(k).delete();
        lastSaved.delete(k);
      }
    }
    if (cloud === target) setSync("saved");
    return true;
  } catch (e: any) {
    if (cloud !== target) return false;
    setSync("failed");
    // The account's own limits come with a message worth showing as it is.
    const own = typeof e?.message === "string" && e.message.startsWith("Your account") ? e.message : "";
    toast(syncTarget === "account" ? own || "Couldn't save to your account. Your work is still in this browser." : "Couldn't save to your Claude account. Your work is still in this browser.");
    return false;
  } finally {
    saving = false;
  }
}

/**
 * Reads the account and decides what this browser shows.
 *   merge    the first time this browser meets the account: keep what's in both
 *   record   after that the account is the record, so a guide deleted on the phone doesn't come back from the laptop
 *   replace  this browser's copy belongs to another account, so it's set aside for this one
 */
async function loadFromCloud(mode: "merge" | "record" | "replace") {
  const target = cloud;
  if (!target) return;
  const snap = await target.get();
  if (cloud !== target) return;
  const remote = new Map<string, any>(snap.docs.map((d) => [d.id, d.data()]));
  lastSaved = new Map([...remote].map(([k, v]) => [k, JSON.stringify(v)]));
  const remoteGuides = [...remote.entries()].filter(([k]) => k.startsWith("guide-")).map(([, v]) => sanitizeGuide(v?.guide)).filter(Boolean) as Guide[];
  const profile = remote.get("profile");
  const local = state;
  const fromAccount = mergeData({ ...(profile ?? {}), guides: remoteGuides });
  let next: UserData;
  if (mode === "replace") next = fromAccount;
  // An account with no profile has never been saved to, so nothing it lacks counts as deleted.
  else if (!profile) next = combineData(local, fromAccount);
  else if (mode === "merge") next = combineData(fromAccount, local);
  else {
    next = profile.notebookCollections === undefined
      ? { ...fromAccount, notebookCollections: local.notebookCollections } : fromAccount;
    // An account saved before memory verses and reading progress existed keeps this browser's.
    if (profile.memory === undefined) next = { ...next, memory: local.memory };
    if (profile.chaptersRead === undefined) next = { ...next, chaptersRead: local.chaptersRead };
  }
  state = { ...next, recent: mode === "replace" ? [] : local.recent, prefs: { ...next.prefs, apiKey: local.prefs.apiKey, apiBase: local.prefs.apiBase } };
  persist();
  listeners.forEach((l) => l());
}

let hooked = false;
function hookPageEvents() {
  if (hooked) return;
  hooked = true;
  const retry = () => { if (pending && !cloud) { const p = pending; attachCloud(p.collection, p.target, p.owner); } };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!cloud) retry();
      else if (!cloudTimer && !saving) loadFromCloud("record").catch(() => {});
    }
    if (document.visibilityState === "hidden" && cloud && cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; saveToCloud(); }
  });
  window.addEventListener("online", retry);
}

/**
 * Starts saving this browser's data to an account and keeping it in step. owner names the account, so a browser that
 * held someone else's data doesn't pour it into this one.
 */
export async function attachCloud(collection: CloudCollection, target: SyncTarget, owner: string): Promise<boolean> {
  hookPageEvents();
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  cloud = collection;
  syncTarget = target;
  pending = null;
  lastSaved = new Map();
  setSync("connecting");
  let flag: string | null = null;
  try { flag = localStorage.getItem(SYNCED_FLAG); } catch { /* treat as never synced */ }
  const mode = !flag || flag === `left:${owner}` ? "merge" : flag === owner ? "record" : "replace";
  try {
    await loadFromCloud(mode);
    if (cloud !== collection) return false;
    try { localStorage.setItem(SYNCED_FLAG, owner); } catch { /* fine */ }
    setSync("saved");
    await saveToCloud();
    return true;
  } catch {
    if (cloud === collection) {
      cloud = null;
      pending = { collection, target, owner };
      setSync("failed");
    }
    return false;
  }
}

/** Stops saving to the account. With keptBy, this browser keeps its copy and remembers whose it was. */
export function detachCloud(keptBy?: string) {
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  cloud = null;
  pending = null;
  syncTarget = null;
  lastSaved = new Map();
  if (keptBy) try { localStorage.setItem(SYNCED_FLAG, `left:${keptBy}`); } catch { /* fine */ }
  setSync("local");
}

/** Saves anything waiting. Resolves false if the account couldn't be reached. */
export async function flushCloud(): Promise<boolean> {
  if (!cloud) return syncState !== "failed";
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  return saveToCloud();
}

/** Lets this browser's copy count as nobody's, so the next account to sign in here keeps it. */
export function releaseDeviceData() {
  try { localStorage.removeItem(SYNCED_FLAG); } catch { /* fine */ }
}

/** Removes the reader's data from this browser, for signing out on a shared device. The page reloads after this. */
export function clearDeviceData() {
  detachCloud();
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  state = defaults;
  for (const k of [KEY, SYNCED_FLAG, "veritas.ai.jobs.v1"]) try { localStorage.removeItem(k); } catch { /* fine */ }
}

/** Connects to the owner's private storage inside Claude. On the website, accounts connect from src/app/account.ts. */
export async function connectCloud() {
  const claude = (window as any).claude;
  if (!claude?.use) return;
  setSync("connecting");
  try {
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    const id = db && user ? await user.id() : null;
    if (!id) { setSync("local"); return; }
    await attachCloud(db.collection(`data/users/${id}`), "claude", "1");
  } catch {
    cloud = null;
    setSync("failed");
  }
}
export function useData(): UserData {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => state);
}
export const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => update((d) => ({ ...d, prefs: { ...d.prefs, [k]: v } }));

export function saveGuide(g: Guide) {
  const next = { ...g, updatedAt: new Date().toISOString() };
  update((d) => ({ ...d, guides: d.guides.some((x) => x.id === g.id) ? d.guides.map((x) => (x.id === g.id ? next : x)) : [next, ...d.guides], activeGuideId: g.id }));
}
export function deleteGuide(id: string) {
  update((d) => ({ ...d, guides: d.guides.filter((g) => g.id !== id), activeGuideId: d.activeGuideId === id ? null : d.activeGuideId }));
}

// ---------- Short-lived UI state ----------
type UiState = { toast: string | null; peek: string | null };
let ui: UiState = { toast: null, peek: null };
const uiListeners = new Set<() => void>();
const setUi = (patch: Partial<UiState>) => { ui = { ...ui, ...patch }; uiListeners.forEach((l) => l()); };
export const useUi = () => useSyncExternalStore((cb) => { uiListeners.add(cb); return () => { uiListeners.delete(cb); }; }, () => ui);
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(message: string) {
  setUi({ toast: message });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUi({ toast: null }), 2600);
}
export const openPeek = (ref: string | null) => setUi({ peek: ref });

// ---------- Saved notes and sources ----------
export function saveNote(n: NoteEntry) {
  const next = { ...n, updatedAt: new Date().toISOString() };
  update((d) => ({ ...d, notebook: d.notebook.some((x) => x.id === n.id) ? d.notebook.map((x) => (x.id === n.id ? next : x)) : [next, ...d.notebook] }));
}
export const deleteNote = (id: string) => update((d) => ({
  ...d, notebook: d.notebook.filter((n) => n.id !== id),
  notebookCollections: d.notebookCollections.map((collection) => ({ ...collection, entries: collection.entries.filter((entry) => entry !== `note:${id}`) })),
}));
export function saveSource(r: CiteRecord | SourceEntry) {
  const now = new Date().toISOString();
  update((d) => ({ ...d, sources: d.sources.some((x) => x.id === r.id) ? d.sources.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [{ addedAt: now, ...r }, ...d.sources] }));
}
export const deleteSource = (id: string) => update((d) => ({ ...d, sources: d.sources.filter((n) => n.id !== id) }));

// ---------- Hash routes ----------
// Routes use letters, digits and hyphens only, so links survive every host.
let ownNavigation = -Infinity;
const leaving: (() => void)[] = [];
/** Runs just before the app moves to another route, while the old page is still on screen. */
export const onLeave = (f: () => void) => { leaving.push(f); return () => { leaving.splice(leaving.indexOf(f), 1); }; };
/** Marks a move the app or a link made, so it isn't mistaken for the Back button. Browsers report both as popstate. */
export function noteNavigation() { ownNavigation = performance.now(); for (const f of leaving) f(); }
export const isOwnNavigation = () => performance.now() - ownNavigation < 600;
export function navigate(hash: string) {
  if (location.hash.slice(1) === hash) return;
  noteNavigation();
  location.hash = hash;
}
export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); },
    () => location.hash.slice(1),
  );
}
