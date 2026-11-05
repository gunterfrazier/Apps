/**
 * Where data files come from. The browser fetches them; the API server reads them from disk.
 * Everything else in core is written against this one function.
 */
export type Loader = (path: string) => Promise<unknown>;

let loader: Loader = async (path) => {
  const res = await fetch(`data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return res.json();
};
const cache = new Map<string, Promise<unknown>>();

export function setLoader(next: Loader): void {
  loader = next;
  cache.clear();
}

export function load<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = loader(path).catch((e) => {
      cache.delete(path);
      throw e;
    });
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
