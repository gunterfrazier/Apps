/**
 * The built-in voice's files. scripts/build_voice.py stores the model compactly (the graph, then its large weights
 * as 16-bit floats), and scripts/build.mjs splits that into packed JSON pieces, because the host serves only text
 * and .wasm files. This module puts the pieces back together and widens the weights to the 32-bit floats the
 * model runs on. It's shared by the voice's worker, the reader and the tests.
 */

export interface VoiceManifest {
  id: string;
  name: string;
  engine: "piper-vits";
  sampleRate: number;
  espeakVoice: string;
  noiseScale: number;
  lengthScale: number;
  noiseW: number;
  phonemeIds: Record<string, number[]>;
  /** [offset, length] of the ONNX graph in the stored file. */
  graph: [number, number];
  /** The name the graph gives its weights file, and that file's size once widened. */
  weightsName: string;
  weightsBytes: number;
  /** [offset in the stored file, number of values, offset in the weights file, how they're stored]. */
  segments: [number, number, number, "f16" | "f32"][];
  /** Size and SHA-256 of the stored file, before packing. */
  bytes: number;
  sha256: string;
  /** Added by the build: the packed pieces, the engine's .wasm and their sizes as downloaded. */
  pieces: { file: string; bytes: number }[];
  engineFile: string;
  engineBytes: number;
  engineVersion: string;
}

/** Unpacks one piece: a JSON string holding base64 of gzip data (the same packing as the app's data files). */
export async function unpackPiece(text: string): Promise<Uint8Array> {
  const b64 = JSON.parse(text) as string;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

let halfToFloat: Float32Array | null = null;
/** Every 16-bit float's value, so widening is one lookup per weight. */
function halfTable(): Float32Array {
  if (halfToFloat) return halfToFloat;
  const t = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const sign = h & 0x8000 ? -1 : 1, exp = (h >> 10) & 0x1f, frac = h & 0x3ff;
    t[h] = exp === 0 ? sign * frac * 2 ** -24 : exp === 31 ? (frac ? NaN : sign * Infinity) : sign * (1 + frac / 1024) * 2 ** (exp - 15);
  }
  return (halfToFloat = t);
}

/** The ONNX graph and its weights file, widened to 32-bit floats, from the stored file. */
export function widen(m: VoiceManifest, stored: Uint8Array): { graph: Uint8Array; weights: Uint8Array } {
  if (stored.byteLength !== m.bytes) throw new Error(`The voice file is ${stored.byteLength} bytes, not ${m.bytes}`);
  const buf = stored.byteOffset % 4 === 0 ? stored : stored.slice();
  const weights = new Float32Array(m.weightsBytes / 4);
  const table = halfTable();
  for (const [at, count, out, kind] of m.segments) {
    const dest = weights.subarray(out / 4, out / 4 + count);
    if (kind === "f16") {
      const src = new Uint16Array(buf.buffer, buf.byteOffset + at, count);
      for (let i = 0; i < count; i++) dest[i] = table[src[i]];
    } else {
      dest.set(new Float32Array(buf.buffer, buf.byteOffset + at, count));
    }
  }
  return { graph: buf.slice(m.graph[0], m.graph[0] + m.graph[1]), weights: new Uint8Array(weights.buffer) };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- This browser's copy ----------
// Kept in IndexedDB so the voice downloads once. The page's storage can be missing or cleared, so every call
// fails quietly and the voice is downloaded again.
const DB = "veritas-voice";
function db(): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export async function cacheGet(key: string): Promise<Uint8Array | null> {
  try {
    const d = await db();
    return await new Promise((ok) => {
      const r = d.transaction("files").objectStore("files").get(key);
      r.onsuccess = () => ok(r.result instanceof ArrayBuffer ? new Uint8Array(r.result) : null);
      r.onerror = () => ok(null);
    });
  } catch { return null; }
}
export async function cacheHas(keys: string[]): Promise<boolean> {
  try {
    const d = await db();
    return await new Promise((ok) => {
      const r = d.transaction("files").objectStore("files").getAllKeys();
      r.onsuccess = () => ok(keys.every((k) => r.result.includes(k)));
      r.onerror = () => ok(false);
    });
  } catch { return false; }
}
/** Stores a file and drops any other version of it (keys share the part before "@"). */
export async function cachePut(key: string, bytes: Uint8Array): Promise<void> {
  try {
    const d = await db();
    const family = key.split("@")[0];
    await new Promise<void>((ok) => {
      const tx = d.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const k of keys.result) if (String(k).split("@")[0] === family && k !== key) store.delete(k);
        store.put(bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer, key);
      };
      tx.oncomplete = () => ok();
      tx.onerror = () => ok();
      tx.onabort = () => ok();
    });
  } catch { /* downloads again next time */ }
}
export const voiceKey = (m: Pick<VoiceManifest, "id" | "sha256">) => `voice-${m.id}@${m.sha256}`;
export const engineKey = (m: Pick<VoiceManifest, "engineVersion">) => `engine@${m.engineVersion}`;
