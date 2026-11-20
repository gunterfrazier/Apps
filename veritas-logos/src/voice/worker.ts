/**
 * The built-in voice, run in a worker so the page stays smooth. It downloads the voice and the ONNX Runtime engine
 * once (kept in IndexedDB), then turns text into speech: eSpeak NG gives the phonemes (src/voice/espeak.ts, bundled
 * here, which makes this worker GPL-3.0-or-later) and the Piper model the sound.
 * It runs on one thread, because a page in Claude can't use the shared memory that threads need.
 *
 * In:  { type: "load", manifest }            the voice's manifest URL
 *      { type: "speak", id, text, rate }      one unit of text (src/voice/text.ts speechUnits)
 *      { type: "cancel" }                     drops units not yet started
 * Out: { type: "progress", loaded, total } while downloading, { type: "preparing" }, { type: "ready" },
 *      { type: "audio", id, pcm, sampleRate }, { type: "failed", id?, message }
 */
import * as ort from "onnxruntime-web/wasm";
import { phonemize } from "./espeak";
import { cacheGet, cachePut, engineKey, sha256Hex, unpackPiece, voiceKey, widen, type VoiceManifest } from "./model";
import { clauses, phonemeIds, phonemeString } from "./text";

export type VoiceRequest =
  | { type: "load"; manifest: string }
  | { type: "speak"; id: number; text: string; rate: number }
  | { type: "cancel" };
export type VoiceReply =
  | { type: "progress"; loaded: number; total: number }
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "audio"; id: number; pcm: Float32Array; sampleRate: number }
  | { type: "failed"; id?: number; message: string };

const scope = self as unknown as {
  postMessage(m: VoiceReply, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<VoiceRequest>) => void) | null;
};
const post = (m: VoiceReply, transfer?: Transferable[]) => scope.postMessage(m, transfer);

let voice: VoiceManifest | null = null;
let session: ort.InferenceSession | null = null;
let loading: Promise<void> | null = null;
const queue: { id: number; text: string; rate: number }[] = [];
let busy = false;

/** Reads a response's body, reporting bytes as they arrive. */
async function readAll(url: URL, onBytes: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Couldn't download ${url.pathname.split("/").pop()} (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.byteLength;
    onBytes(n);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

async function load(manifestUrl: string): Promise<void> {
  const url = new URL(manifestUrl, location.href);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load the voice's settings (HTTP ${res.status})`);
  const m = (await res.json()) as VoiceManifest;
  let stored = await cacheGet(voiceKey(m));
  let engine = await cacheGet(engineKey(m));
  const total = (stored ? 0 : m.pieces.reduce((a, p) => a + p.bytes, 0)) + (engine ? 0 : m.engineBytes);
  let done = 0;
  const progress = (n: number) => post({ type: "progress", loaded: Math.min(total, done + n), total });
  if (total) progress(0);
  if (!engine) {
    engine = await readAll(new URL(m.engineFile, url), progress);
    done += engine.byteLength;
    await cachePut(engineKey(m), engine);
  }
  if (!stored) {
    const parts: Uint8Array[] = [];
    for (const p of m.pieces) {
      const bytes = await readAll(new URL(p.file, url), progress);
      done += bytes.byteLength;
      parts.push(await unpackPiece(new TextDecoder().decode(bytes)));
    }
    stored = new Uint8Array(parts.reduce((a, p) => a + p.byteLength, 0));
    let at = 0;
    for (const p of parts) { stored.set(p, at); at += p.byteLength; }
    if (stored.byteLength !== m.bytes || (await sha256Hex(stored)) !== m.sha256) throw new Error("The voice didn't download completely. Try again.");
    await cachePut(voiceKey(m), stored);
  }
  post({ type: "preparing" });
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = engine.byteOffset === 0 && engine.byteLength === engine.buffer.byteLength ? engine.buffer as ArrayBuffer : engine.slice().buffer;
  const { graph, weights } = widen(m, stored);
  stored = null;
  session = await ort.InferenceSession.create(graph, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    externalData: [{ path: m.weightsName, data: weights }],
  });
  await phonemize("Amen.", m.espeakVoice);
  voice = m;
}

async function speak(text: string, rate: number): Promise<Float32Array> {
  const v = voice!, s = session!;
  const parts: { ipa: string; end: string }[] = [];
  for (const c of clauses(text)) parts.push({ ipa: (await phonemize(c.text, v.espeakVoice)).join(" "), end: c.end });
  if (!parts.length) return new Float32Array(0);
  const ids = phonemeIds(phonemeString(parts), v.phonemeIds);
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.of(BigInt(ids.length)), [1]),
    scales: new ort.Tensor("float32", Float32Array.of(v.noiseScale, v.lengthScale / Math.max(0.5, Math.min(2, rate || 1)), v.noiseW), [3]),
  };
  const out = await s.run(feeds);
  const result = out[s.outputNames[0]];
  const pcm = (result.data as Float32Array).slice();
  result.dispose();
  return pcm;
}

async function drain(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const pcm = await speak(job.text, job.rate);
        post({ type: "audio", id: job.id, pcm, sampleRate: voice!.sampleRate }, [pcm.buffer]);
      } catch (e) {
        post({ type: "failed", id: job.id, message: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    busy = false;
  }
}

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "load") {
    loading ??= load(msg.manifest);
    loading.then(() => post({ type: "ready" }), (err) => {
      loading = null;
      post({ type: "failed", message: err instanceof Error ? err.message : String(err) });
    });
  } else if (msg.type === "speak") {
    queue.push({ id: msg.id, text: msg.text, rate: msg.rate });
    if (voice) drain();
    else loading?.then(drain, () => {});
  } else if (msg.type === "cancel") {
    queue.length = 0;
  }
};
