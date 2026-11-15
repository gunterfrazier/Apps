// Just enough of a browser for src/app/store.ts to load under Node: storage, window and document events.
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const target = () => { const l = new Map<string, Set<(e: unknown) => void>>(); return { addEventListener: (t: string, f: (e: unknown) => void) => { if (!l.has(t)) l.set(t, new Set()); l.get(t)!.add(f); }, removeEventListener: (t: string, f: (e: unknown) => void) => { l.get(t)?.delete(f); }, dispatch: (t: string) => l.get(t)?.forEach((f) => f({ type: t })) }; };
const win = target();
const doc = { ...target(), visibilityState: "visible" };
Object.assign(globalThis, { localStorage: storage, window: Object.assign(win, { localStorage: storage }), document: doc });
export const browser = { storage, win, doc };
