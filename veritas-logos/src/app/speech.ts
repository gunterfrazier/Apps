/**
 * Read aloud. The browser's own speech engine reads wherever it has one (Chrome, Safari, Edge, Firefox). Android's
 * in-app viewer, which the Claude app uses, has none, so there a voice built into the app reads instead: a Piper
 * voice run by ONNX Runtime in a worker (src/voice/worker.ts). It downloads once and is kept in this browser.
 * Settings can pick the built-in voice everywhere.
 */
import { speechUnits } from "../voice/text";
import type { VoiceReply, VoiceRequest } from "../voice/worker";
import { cacheHas, engineKey, voiceKey, type VoiceManifest } from "../voice/model";
import { getData, toast } from "./store";

export type SpeechStatus =
  | { state: "idle" }
  | { state: "downloading"; loaded: number; total: number }
  | { state: "preparing" }
  | { state: "reading"; verse: number };
export interface SpeechLine { verse: number; text: string }

declare const __VOICE__: Pick<VoiceManifest, "id" | "name" | "sha256" | "engineVersion"> & { manifest: string; downloadBytes: number } | undefined;
/** The built-in voice, as the build describes it, or null in a build without one. */
export const BUILT_IN = typeof __VOICE__ === "undefined" ? null : __VOICE__;
export const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;

const hasDeviceEngine = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
const canRunBuiltIn = () => Boolean(BUILT_IN) && typeof Worker !== "undefined" && typeof WebAssembly !== "undefined" && typeof AudioContext !== "undefined" && typeof DecompressionStream !== "undefined";

/** Whether this browser can read aloud at all. */
export const canReadAloud = () => hasDeviceEngine() || canRunBuiltIn();

/** Whether the built-in voice will read here: always when chosen in Settings, otherwise when the browser has no
 * speech engine. (A browser whose engine turns out to have no voices also gets it, decided when reading starts.) */
export const usesBuiltIn = () => canRunBuiltIn() && (getData().prefs.readVoice === "builtin" || !hasDeviceEngine());

/** Whether the built-in voice is already saved in this browser, so reading needs no download. */
export const builtInSaved = (): Promise<boolean> => (BUILT_IN ? cacheHas([voiceKey(BUILT_IN), engineKey(BUILT_IN)]) : Promise.resolve(false));

export const NO_SPEECH = "This browser can't read aloud: it has no speech engine, and it can't run the built-in voice. Updating it should fix this.";

/** Reads the lines aloud, reporting progress. Returns a function that stops reading. */
export function readAloud(lines: SpeechLine[], onStatus: (s: SpeechStatus) => void): () => void {
  if (!canReadAloud()) { toast(NO_SPEECH); return () => {}; }
  if (usesBuiltIn()) return readBuiltIn(lines, onStatus);
  if (window.speechSynthesis.getVoices().length || !canRunBuiltIn()) return readDevice(lines, onStatus);
  // Chrome lists its voices a moment after the page loads. If none appear, this engine can't speak.
  audio();
  let stop: (() => void) | null = null, stopped = false;
  const decide = () => {
    if (stop || stopped) return;
    stop = window.speechSynthesis.getVoices().length ? readDevice(lines, onStatus) : readBuiltIn(lines, onStatus);
  };
  window.speechSynthesis.addEventListener("voiceschanged", decide, { once: true });
  const timer = setTimeout(decide, 1200);
  onStatus({ state: "preparing" });
  return () => { stopped = true; clearTimeout(timer); window.speechSynthesis.removeEventListener("voiceschanged", decide); if (stop) stop(); else onStatus({ state: "idle" }); };
}

// ---------- The browser's own engine ----------
function readDevice(lines: SpeechLine[], onStatus: (s: SpeechStatus) => void): () => void {
  const synth = window.speechSynthesis;
  // Chrome can drop an utterance queued right after cancel(), so cancel only when something is playing.
  if (synth.speaking || synth.pending) synth.cancel();
  const { voice, rate } = getData().prefs;
  let cancelled = false;
  let i = 0;
  const next = () => {
    if (cancelled) return;
    if (i >= lines.length) { onStatus({ state: "idle" }); return; }
    const line = lines[i++];
    if (!line.text) { next(); return; }
    const u = new SpeechSynthesisUtterance(line.text);
    u.rate = rate;
    // Voices load after the page does in Chrome, so look them up for each verse, not once at the start.
    const chosen = voice ? synth.getVoices().find((x) => x.name === voice) : undefined;
    if (chosen) u.voice = chosen;
    u.onstart = () => onStatus({ state: "reading", verse: line.verse });
    u.onend = next;
    u.onerror = (e) => {
      onStatus({ state: "idle" });
      if (!cancelled && e.error !== "interrupted" && e.error !== "canceled") toast(`Reading aloud stopped: the speech engine reported "${e.error}".`);
    };
    synth.speak(u);
  };
  onStatus({ state: "reading", verse: lines.find((l) => l.text)?.verse ?? 1 });
  next();
  return () => { cancelled = true; synth.cancel(); onStatus({ state: "idle" }); };
}

// ---------- The built-in voice ----------
let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let onLoad: ((m: VoiceReply) => void) | null = null;
let onLoadStatus: ((s: SpeechStatus) => void) | null = null;
const waiting = new Map<number, { ok: (pcm: { pcm: Float32Array; sampleRate: number }) => void; no: (e: Error) => void }>();
let nextId = 1;

function failAll(message: string) {
  for (const w of waiting.values()) w.no(new Error(message));
  waiting.clear();
  onLoad?.({ type: "failed", message });
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("voice-worker.js", document.baseURI), { type: "module" });
  w.onmessage = (e: MessageEvent<VoiceReply>) => {
    const m = e.data;
    if (m.type === "audio") { waiting.get(m.id)?.ok(m); waiting.delete(m.id); }
    else if (m.type === "failed" && m.id !== undefined) { waiting.get(m.id)?.no(new Error(m.message)); waiting.delete(m.id); }
    else onLoad?.(m);
  };
  w.onerror = (e) => {
    e.preventDefault();
    worker = null;
    ready = null;
    w.terminate();
    failAll(e.message || "the voice's engine couldn't start");
  };
  return (worker = w);
}
const send = (m: VoiceRequest) => getWorker().postMessage(m);

/** Downloads (the first time) and starts the built-in voice. */
function loadVoice(onStatus: (s: SpeechStatus) => void): Promise<void> {
  if (!ready) {
    ready = new Promise<void>((ok, no) => {
      onLoad = (m) => {
        if (m.type === "progress") onLoadStatus?.({ state: "downloading", loaded: m.loaded, total: m.total });
        else if (m.type === "preparing") onLoadStatus?.({ state: "preparing" });
        else if (m.type === "ready") ok();
        else if (m.type === "failed") no(new Error(m.message));
      };
      send({ type: "load", manifest: BUILT_IN!.manifest });
    });
    ready.catch(() => { ready = null; });
  }
  onLoadStatus = onStatus;
  return ready;
}

function synthesize(text: string, rate: number): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const id = nextId++;
  return new Promise((ok, no) => {
    waiting.set(id, { ok, no });
    send({ type: "speak", id, text, rate });
  });
}

let ctx: AudioContext | null = null;
/** The page's audio output. Made or resumed during the tap, since browsers only start sound after one. */
function audio(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  return ctx;
}

function readBuiltIn(lines: SpeechLine[], onStatus: (s: SpeechStatus) => void): () => void {
  const ac = audio();
  const units = lines.flatMap((l) => speechUnits(l.text).map((text, k) => ({ verse: l.verse, text, first: k === 0 })));
  const rate = getData().prefs.rate;
  const made = new Map<number, Promise<{ pcm: Float32Array; sampleRate: number }>>();
  const make = (i: number) => {
    if (i >= units.length || made.has(i)) return;
    const p = synthesize(units[i].text, rate);
    p.catch(() => {});
    made.set(i, p);
  };
  let stopped = false;
  let source: AudioBufferSourceNode | null = null;
  let wake: { release(): Promise<void> } | null = null;
  const report = (s: SpeechStatus) => { if (!stopped) onStatus(s); };
  const onVisible = () => { if (document.visibilityState === "visible" && ac.state !== "running") ac.resume().catch(() => {}); };
  document.addEventListener("visibilitychange", onVisible);
  (navigator as any).wakeLock?.request("screen").then((w: typeof wake) => { if (stopped) w?.release(); else wake = w; }, () => {});

  /** Plays one unit, followed by a pause, and resolves when it has finished or been stopped. */
  const play = (pcm: Float32Array, sampleRate: number, pause: number) => new Promise<void>((done) => {
    const buf = ac.createBuffer(1, Math.max(1, pcm.length + Math.round(pause * sampleRate)), sampleRate);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const s = ac.createBufferSource();
    s.buffer = buf;
    s.connect(ac.destination);
    s.onended = () => done();
    source = s;
    s.start();
  });

  const finish = () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    wake?.release().catch(() => {});
    wake = null;
  };

  (async () => {
    try {
      if (!units.length) { finish(); onStatus({ state: "idle" }); return; }
      report({ state: "preparing" });
      await loadVoice(report);
      for (let i = 0; i < units.length && !stopped; i++) {
        make(i); make(i + 1); make(i + 2);
        const { pcm, sampleRate } = await made.get(i)!;
        made.delete(i);
        if (stopped) return;
        if (units[i].first || i === 0) report({ state: "reading", verse: units[i].verse });
        await play(pcm, sampleRate, units[i + 1]?.first === false ? 0.12 : 0.35);
      }
      if (!stopped) { finish(); onStatus({ state: "idle" }); }
    } catch (e) {
      if (stopped) return;
      finish();
      onStatus({ state: "idle" });
      toast(`Reading aloud stopped: ${e instanceof Error ? e.message : String(e)}`);
    }
  })();

  return () => {
    if (stopped) return;
    finish();
    if (worker) send({ type: "cancel" });
    try { source?.stop(); } catch { /* already ended */ }
    onStatus({ state: "idle" });
  };
}
