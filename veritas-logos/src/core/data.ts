/**
 * Where data files come from. The browser fetches them; the API server reads them from disk.
 * Everything else in core is written against this one function.
 */
export type Loader = (path: string) => Promise<unknown>;

/** A data file's bytes as JSON. The published build stores every data file gzip-compressed under its own name, to fit
 * the host's size limit (scripts/build.mjs), so a file that starts with gzip's two magic bytes is unpacked here first;
 * a plain one (a dev server, or a host that has already undone the compression) is read as it is. */
export async function parseData(bytes: Uint8Array<ArrayBuffer>): Promise<unknown> {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser can't unpack the app's data. Updating it should fix this.");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

let loader: Loader = async (path) => {
  const res = await fetch(`data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return parseData(new Uint8Array(await res.arrayBuffer()));
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
