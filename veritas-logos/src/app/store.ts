import { useSyncExternalStore } from "react";
import { DEFAULT_TRANSLATION, isTranslationId, type TranslationId } from "../core/bible";
import { LENS_IDS, type LensId } from "../core/content";
import { sanitizeGuide, type Guide } from "../core/guide";
import type { CiteRecord } from "../core/cite";

export type Theme = "system" | "light" | "dark";
export type HighlightColor = "amber" | "green" | "blue" | "rose";
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
  lens: LensId;
  theme: Theme;
  textSize: number;
  voice: string;
  rate: number;
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
  sources: SourceEntry[];
  savedSearches: SavedSearch[];
  /** The last few places visited, for picking up where you left off. */
  recent: { hash: string; label: string }[];
}

const KEY = "veritas.logos.v2";
const defaults: UserData = {
  prefs: { translation: DEFAULT_TRANSLATION, compare: "", lens: "all", theme: "system", textSize: 19, voice: "", rate: 1, apiBase: "", apiKey: "" },
  guides: [],
  highlights: {},
  bookmarks: [],
  notes: {},
  figures: [],
  lastRead: { book: 43, chapter: 3 },
  activeGuideId: null,
  notebook: [],
  sources: [],
  savedSearches: [],
  recent: [],
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
      translation: isTranslationId(p.translation) ? p.translation : DEFAULT_TRANSLATION,
      compare: isTranslationId(p.compare) ? p.compare : "",
      lens: LENS_IDS.includes(p.lens) ? p.lens : "all",
      theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
      textSize: typeof p.textSize === "number" ? Math.min(30, Math.max(14, p.textSize)) : 19,
      voice: typeof p.voice === "string" ? p.voice : "",
      rate: typeof p.rate === "number" ? p.rate : 1,
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
    sources: Array.isArray(raw?.sources) ? raw.sources.filter((n: any) => n && typeof n.id === "string" && typeof n.title === "string") : [],
    savedSearches: Array.isArray(raw?.savedSearches) ? raw.savedSearches.filter((n: any) => n && typeof n.id === "string") : [],
    recent: Array.isArray(raw?.recent) ? raw.recent.filter((n: any) => n && typeof n.hash === "string").slice(0, 8) : [],
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

// ---------- Saving to the owner's Claude account ----------
// Inside Claude, browser storage alone can come back empty, so everything is also kept in the page's private database,
// which follows the owner between devices. Each guide is its own document; everything else shares one profile document.
export type SyncState = "local" | "connecting" | "saved" | "saving" | "failed";
let syncState: SyncState = "local";
const syncListeners = new Set<() => void>();
const setSync = (s: SyncState) => { syncState = s; syncListeners.forEach((l) => l()); };
export const useSyncState = () => useSyncExternalStore((cb) => { syncListeners.add(cb); return () => { syncListeners.delete(cb); }; }, () => syncState);

let cloud: any = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let lastSaved = new Map<string, string>();
const SYNCED_FLAG = "veritas.logos.synced";
const profileOf = (d: UserData) => ({ notebook: d.notebook, sources: d.sources, savedSearches: d.savedSearches, highlights: d.highlights, bookmarks: d.bookmarks, notes: d.notes, figures: d.figures, lastRead: d.lastRead, activeGuideId: d.activeGuideId, prefs: { ...d.prefs, apiKey: "" } });
const guideDocId = (id: string) => `guide-${id}`;

function queueCloudSave() {
  if (!cloud) return;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => { cloudTimer = null; saveToCloud(); }, 800);
}

async function saveToCloud() {
  if (!cloud) return;
  const wanted = new Map<string, string>([["profile", JSON.stringify(profileOf(state))]]);
  for (const g of state.guides) wanted.set(guideDocId(g.id), JSON.stringify({ guide: g }));
  const writes = [...wanted].filter(([k, v]) => lastSaved.get(k) !== v);
  const removals = [...lastSaved.keys()].filter((k) => !wanted.has(k));
  if (!writes.length && !removals.length) return;
  setSync("saving");
  try {
    // One write at a time per document.
    for (const [k, v] of writes) {
      await cloud.doc(k).set(JSON.parse(v));
      lastSaved.set(k, v);
    }
    for (const k of removals) {
      await cloud.doc(k).delete();
      lastSaved.delete(k);
    }
    setSync("saved");
  } catch {
    setSync("failed");
    toast("Couldn't save to your Claude account. Your work is still in this browser.");
  }
}

async function loadFromCloud(firstRun: boolean) {
  const snap = await cloud.get();
  const remote = new Map<string, any>(snap.docs.map((d: any) => [d.id, d.data()]));
  lastSaved = new Map([...remote].map(([k, v]) => [k, JSON.stringify(v)]));
  const remoteGuides = [...remote.entries()].filter(([k]) => k.startsWith("guide-")).map(([, v]) => sanitizeGuide(v.guide)).filter(Boolean) as Guide[];
  const profile = remote.get("profile");
  const local = state;
  // An account with no profile has never been saved to, so nothing it lacks counts as deleted.
  if (!profile) firstRun = true;
  // The first time on a device, anything saved only here is kept. After that the account is the record, so a guide
  // deleted on the phone doesn't come back from the laptop.
  const guides = firstRun
    ? [...remoteGuides.map((r) => { const l = local.guides.find((x) => x.id === r.id); return l && l.updatedAt > r.updatedAt ? l : r; }), ...local.guides.filter((l) => !remoteGuides.some((r) => r.id === l.id))]
    : remoteGuides;
  const merged = mergeData({
    ...(profile ?? local),
    highlights: firstRun ? { ...local.highlights, ...(profile?.highlights ?? {}) } : profile?.highlights ?? local.highlights,
    notes: firstRun ? { ...local.notes, ...(profile?.notes ?? {}) } : profile?.notes ?? local.notes,
    guides,
  });
  state = { ...merged, prefs: { ...merged.prefs, apiKey: local.prefs.apiKey, apiBase: local.prefs.apiBase } };
  persist();
  listeners.forEach((l) => l());
}

/** Connects to the owner's private storage inside Claude. Elsewhere the app just uses the browser. */
export async function connectCloud() {
  const claude = (window as any).claude;
  if (!claude?.use) return;
  setSync("connecting");
  try {
    const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    const id = db && user ? await user.id() : null;
    if (!id) { setSync("local"); return; }
    cloud = db.collection(`data/users/${id}`);
    let firstRun = true;
    try { firstRun = localStorage.getItem(SYNCED_FLAG) !== "1"; } catch { /* treat as first run */ }
    await loadFromCloud(firstRun);
    try { localStorage.setItem(SYNCED_FLAG, "1"); } catch { /* fine */ }
    setSync("saved");
    await saveToCloud();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !cloudTimer) loadFromCloud(false).catch(() => {});
      if (document.visibilityState === "hidden" && cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; saveToCloud(); }
    });
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
export const deleteNote = (id: string) => update((d) => ({ ...d, notebook: d.notebook.filter((n) => n.id !== id) }));
export function saveSource(r: CiteRecord | SourceEntry) {
  const now = new Date().toISOString();
  update((d) => ({ ...d, sources: d.sources.some((x) => x.id === r.id) ? d.sources.map((x) => (x.id === r.id ? { ...x, ...r } : x)) : [{ addedAt: now, ...r }, ...d.sources] }));
}
export const deleteSource = (id: string) => update((d) => ({ ...d, sources: d.sources.filter((n) => n.id !== id) }));

// ---------- Hash routes ----------
// Routes use letters, digits and hyphens only, so links survive every host.
export function navigate(hash: string) {
  if (location.hash.slice(1) === hash) return;
  location.hash = hash;
}
export function useRoute(): string {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); },
    () => location.hash.slice(1),
  );
}
