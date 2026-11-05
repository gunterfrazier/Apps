import { toast } from "./store";

/** True when the page runs in a host that blocks print and direct downloads. */
export const IS_ARTIFACT = Boolean((window as any).VERITAS_CONFIG?.artifact);

export async function saveFile(filename: string, data: string, mime: string): Promise<void> {
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
