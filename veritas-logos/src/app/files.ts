import { toast } from "./store";

/** True when the page runs in a host that blocks print and direct downloads. */
export const IS_ARTIFACT = Boolean((window as any).VERITAS_CONFIG?.artifact);

export async function saveFile(filename: string, data: string | Blob, mime: string): Promise<void> {
  const claude = (window as any).claude;
  if (claude?.use) {
    try {
      const downloads = await claude.use("downloads");
      if (downloads) {
        await downloads.save({ filename, data });
        toast(`Saved ${filename}`);
        return;
      }
    } catch (e: any) {
      if (e?.code === "declined") return;
      if (e?.code === "rejected_extension" || e?.code === "unavailable") { toast("This file type can't be saved here. Use Copy instead."); return; }
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string, done = "Copied"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("Your browser blocked copying. Select the text and copy it yourself.");
  }
}

// ---------- Files the owner attaches ----------
// Inside Claude they go to the page's private store, which follows the owner. Elsewhere they stay in this browser.
const MAX_FILE = 20 * 1024 * 1024;
function idb(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open("veritas-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export interface StoredFile { id: string; name: string; size: number; assetId?: string; url?: string; local?: boolean }
export async function storeFile(file: File): Promise<StoredFile> {
  if (file.size > MAX_FILE) throw new Error("That file is over 20 MB.");
  const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const claude = (window as any).claude;
  if (claude?.use) {
    try {
      const assets = await claude.use("assets");
      if (assets) {
        const a = await assets.upload(file);
        return { id, name: file.name, size: file.size, assetId: a.id, url: a.url };
      }
    } catch { /* fall back to this browser */ }
  }
  const db = await idb();
  await new Promise<void>((ok, no) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => ok();
    tx.onerror = () => no(tx.error);
  });
  return { id, name: file.name, size: file.size, local: true };
}
export async function openStoredFile(f: StoredFile): Promise<void> {
  if (f.url) { window.open(f.url, "_blank", "noopener"); return; }
  const db = await idb();
  const blob = await new Promise<Blob | undefined>((ok, no) => {
    const r = db.transaction("files").objectStore("files").get(f.id);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  if (!blob) throw new Error("This file isn't in this browser.");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function removeStoredFile(f: StoredFile): Promise<void> {
  try {
    if (f.assetId) {
      const assets = await (window as any).claude?.use?.("assets");
      await assets?.delete(f.assetId);
    } else if (f.local) {
      const db = await idb();
      db.transaction("files", "readwrite").objectStore("files").delete(f.id);
    }
  } catch { /* the listing is what the reader sees */ }
}

// ---------- Share links ----------
// A guide is compressed and base32-encoded into the link, so sharing needs no server.
const B32 = "abcdefghijklmnopqrstuvwxyz234567";
function toBase32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  if (bits) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function fromBase32(text: string): Uint8Array {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of text) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("bad link");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    value &= (1 << bits) - 1;
  }
  return new Uint8Array(out);
}
async function pipe(data: Uint8Array, stream: any): Promise<Uint8Array> {
  const res = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
export async function encodeForLink(value: unknown): Promise<string> {
  return toBase32(await pipe(new TextEncoder().encode(JSON.stringify(value)), new CompressionStream("deflate-raw")));
}
export async function decodeFromLink(code: string): Promise<unknown> {
  const bytes = await pipe(fromBase32(code), new DecompressionStream("deflate-raw"));
  if (bytes.length > 2_000_000) throw new Error("too large");
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The app's address without any route, for building share and embed links. */
export const appBase = () => location.href.split("#")[0].replace(/[?].*$/, "").replace(/index\.html$/, "");
