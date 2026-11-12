/**
 * Where data files come from. The browser fetches them; the API server reads them from disk.
 * Everything else in core is written against this one function.
 */
export type Loader = (path: string) => Promise<unknown>;

/** Marks a packed data file: a JSON string whose base64 starts with gzip's magic bytes (1f 8b 08). */
export const PACKED = '"H4sI';

/** A data file's text as JSON. The published build packs each data file to fit the host's size limit
 * (scripts/build.mjs): gzip-compressed, then base64-encoded into a JSON string under the file's own name, because the
 * host serves .json files only as text. A packed file is unpacked here; a plain one (the dev server, public/data) is
 * read as it is. */
export async function parseData(text: string): Promise<unknown> {
  if (!text.startsWith(PACKED)) return JSON.parse(text);
  if (typeof DecompressionStream === "undefined") throw new Error("This browser can't unpack the app's data. Updating it should fix this.");
  const b64 = JSON.parse(text) as string;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

let loader: Loader = async (path) => {
  const res = await fetch(`data/${path}`);
  if (!res.ok) throw new Error(`Could not load ${path} (HTTP ${res.status})`);
  return parseData(await res.text());
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
