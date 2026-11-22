/**
 * The player: reads a chapter aloud, or plays a Family Library video, and keeps going while you move around the app,
 * like a music player. One thing plays at a time. A chapter It can pause, jump to any verse, skip a verse either way, change speed, stop on a
 * sleep timer, carry on into the next chapter, and pick up where you left off in each chapter. The voice itself is
 * speech.ts (the browser's engine or the built-in voice); this file decides what it reads and when.
 */
import { useSyncExternalStore } from "react";
import { chapterCount, getChapter, isOnline, type TranslationId } from "../core/bible";
import { bookName } from "../core/references";
import { readAloud, type SpeechStatus } from "./speech";
import { getData, setPref, toast } from "./store";

export interface PlayerLine { verse: number; text: string }
/** A video that plays inside the player (YouTube or Vimeo), or opens on its own site when it can't. */
export interface PlayerVideo { id: string; title: string; creator: string; format: string; url: string; embed: string | null }
export interface PlayerState {
  kind: "chapter" | "video" | null;
  /** The video playing, the others it came with (Up next), and what they're from, such as a story's title. */
  video: PlayerVideo | null;
  queue: PlayerVideo[];
  from: string;
  /** Where the video is, in seconds, as its player reports it. */
  time: number;
  duration: number;
  translation: TranslationId | null;
  book: number;
  chapter: number;
  lines: PlayerLine[];
  /** The verse being read, or where a pause or a jump left it. */
  verse: number;
  status: "idle" | "loading" | "playing" | "paused";
  /** What the voice is doing before it speaks (downloading, getting ready), for the status line. */
  note: string;
  /** Sleep timer: a time to stop at, or the end of this chapter. */
  sleepAt: number | null;
  sleepEndOfChapter: boolean;
  /** Whether the full-screen player is showing. */
  open: boolean;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const POS_KEY = "veritas-listen-positions";
let state: PlayerState = { kind: null, video: null, queue: [], from: "", time: 0, duration: 0, translation: null, book: 1, chapter: 1, lines: [], verse: 1, status: "idle", note: "", sleepAt: null, sleepEndOfChapter: false, open: false };
const subs = new Set<() => void>();
const set = (patch: Partial<PlayerState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); mediaSession(); };
export const usePlayer = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
export const playerState = () => state;

// ----- Where you stopped in each chapter, kept on this device -----
type Positions = Record<string, { verse: number; at: number }>;
const posKey = (b: number, c: number) => `${b}:${c}`;
function positions(): Positions { try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}"); } catch { return {}; } }
function savePosition(b: number, c: number, verse: number | null) {
  const all = positions();
  if (verse === null) delete all[posKey(b, c)]; else all[posKey(b, c)] = { verse, at: Date.now() };
  // Keep the 60 most recent chapters.
  const keep = Object.entries(all).sort((x, y) => y[1].at - x[1].at).slice(0, 60);
  try { localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(keep))); } catch { /* storage full or off */ }
}
/** The verse you stopped at in a chapter, if you stopped partway. */
export const resumeVerse = (b: number, c: number): number | null => positions()[posKey(b, c)]?.verse ?? null;

// ----- The voice -----
let stopVoice: (() => void) | null = null;
let run = 0;
function silence() { const s = stopVoice; stopVoice = null; run++; s?.(); }

function speakFrom(verse: number) {
  silence();
  const mine = run;
  const from = state.lines.filter((l) => l.verse >= verse && l.text);
  if (!from.length) { finished(); return; }
  set({ status: "playing", verse: from[0].verse, note: "" });
  stopVoice = readAloud(from, (s: SpeechStatus) => {
    if (mine !== run) return;
    if (s.state === "downloading") set({ note: `Downloading the voice: ${Math.round(s.loaded / 1e6)} of ${Math.max(1, Math.round(s.total / 1e6))} MB` });
    else if (s.state === "preparing") set({ note: "Getting the voice ready…" });
    else if (s.state === "reading") {
      if (state.sleepAt && Date.now() >= state.sleepAt) { pause(); set({ sleepAt: null }); toast("Sleep timer: stopped reading"); return; }
      set({ verse: s.verse, note: "" });
      savePosition(state.book, state.chapter, s.verse);
    } else if (s.state === "idle") {
      stopVoice = null;
      if (s.finished) finished();
      else if (state.status === "playing") set({ status: "paused", note: "" });
    }
  });
}

/** The chapter came to its end: stop for the sleep timer, or carry on into the next chapter. */
async function finished() {
  savePosition(state.book, state.chapter, null);
  if (state.sleepEndOfChapter) { set({ status: "paused", sleepEndOfChapter: false, verse: state.lines[0]?.verse ?? 1 }); toast("Sleep timer: finished the chapter"); return; }
  const next = await nextChapterOf(state.book, state.chapter);
  if (!next || getData().prefs.listenContinue === false) { set({ status: "paused", verse: state.lines[0]?.verse ?? 1 }); return; }
  await playChapter(state.translation!, next.book, next.chapter, 1);
}

export async function nextChapterOf(b: number, c: number) {
  if (c < (await chapterCount(b))) return { book: b, chapter: c + 1 };
  return b < 66 ? { book: b + 1, chapter: 1 } : null;
}
export async function prevChapterOf(b: number, c: number) {
  if (c > 1) return { book: b, chapter: c - 1 };
  return b > 1 ? { book: b - 1, chapter: await chapterCount(b - 1) } : null;
}

// ----- What the controls do -----
/** Starts reading a chapter: from the verse given, or where you left off, or the top. */
export async function playChapter(translation: TranslationId, book: number, chapter: number, from?: number) {
  if (isOnline(translation)) { toast("Read aloud is available for built-in translations such as the BSB."); return; }
  silence(); stopVideo();
  const same = state.kind === "chapter" && state.translation === translation && state.book === book && state.chapter === chapter && state.lines.length;
  set({ kind: "chapter", video: null, queue: [], translation, book, chapter, status: "loading", note: "", ...(same ? {} : { lines: [], verse: from ?? 1 }) });
  try {
    const lines = same ? state.lines : (await getChapter(translation, book, chapter)).map((l) => ({ verse: l.verse, text: l.text }));
    if (state.book !== book || state.chapter !== chapter) return; // Something else was chosen meanwhile.
    const last = lines[lines.length - 1]?.verse ?? 1;
    const resume = from ?? resumeVerse(book, chapter);
    set({ lines });
    speakFrom(resume && resume <= last ? resume : lines[0]?.verse ?? 1);
  } catch (e) {
    set({ status: "idle" });
    toast(`Couldn't load ${bookName(book)} ${chapter}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
export function pause() {
  if (state.kind === "video") { videoCommand("pause"); set({ status: "paused" }); return; }
  if (state.status !== "playing" && state.status !== "loading") return; silence(); set({ status: "paused", note: "" });
}
export function resume() {
  if (state.kind === "video") { videoCommand("play"); set({ status: "playing" }); return; }
  if (state.lines.length) speakFrom(state.verse);
}
export const togglePlay = () => (state.status === "playing" || state.status === "loading" ? pause() : resume());
/** Jumps to a verse: reads on from there if it was reading, or waits there if paused. */
export function seekVerse(verse: number) {
  if (!state.lines.length) return;
  const v = Math.max(state.lines[0].verse, Math.min(verse, state.lines[state.lines.length - 1].verse));
  if (state.status === "playing" || state.status === "loading") speakFrom(v);
  else { set({ verse: v }); savePosition(state.book, state.chapter, v); }
}
export const skipVerse = (by: number) => seekVerse(state.verse + by);
export async function skipChapter(by: 1 | -1) {
  if (state.kind === "video") { skipVideo(by); return; }
  if (!state.translation) return;
  // Back goes to the start of this chapter first, unless you're already near the top.
  if (by < 0 && state.verse > (state.lines[0]?.verse ?? 1) + 2) { seekVerse(state.lines[0].verse); return; }
  const to = by > 0 ? await nextChapterOf(state.book, state.chapter) : await prevChapterOf(state.book, state.chapter);
  if (to) { const wasPaused = state.status === "paused"; await playChapter(state.translation, to.book, to.chapter, 1); if (wasPaused) pause(); }
}
/** Speed: 0.75× to 2×. Takes effect from the verse being read. */
export function cycleSpeed() {
  const now = getData().prefs.rate;
  const next = SPEEDS[(SPEEDS.findIndex((x) => x >= now - 0.01) + 1) % SPEEDS.length] ?? 1;
  setPref("rate", next);
  if (state.kind === "video") videoCommand("rate", next);
  else if (state.status === "playing") speakFrom(state.verse);
  return next;
}
export function setSleep(minutes: number | "chapter" | null) {
  if (minutes === "chapter") set({ sleepAt: null, sleepEndOfChapter: true });
  else set({ sleepAt: minutes ? Date.now() + minutes * 60e3 : null, sleepEndOfChapter: false });
  if (typeof minutes === "number") armSleep();
}
let sleepTimer: ReturnType<typeof setTimeout> | null = null;
function armSleep() {
  if (sleepTimer) clearTimeout(sleepTimer);
  if (!state.sleepAt) return;
  sleepTimer = setTimeout(() => { if (state.kind === "video" && state.sleepAt) { pause(); set({ sleepAt: null }); toast("Sleep timer: paused the video"); return; } if (state.sleepAt && Date.now() >= state.sleepAt - 500) { pause(); set({ sleepAt: null }); toast("Sleep timer: stopped reading"); } }, Math.max(0, state.sleepAt - Date.now()));
}
export const openPlayer = (open = true) => set({ open });
/** Stops and closes the player. */
export function closePlayer() {
  silence(); stopVideo();
  if (sleepTimer) clearTimeout(sleepTimer);
  set({ kind: null, video: null, queue: [], status: "idle", translation: null, lines: [], open: false, sleepAt: null, sleepEndOfChapter: false, note: "" });
}

// ----- Time left, from the words still to read (the voice gives no clock) -----
const WORDS_PER_MIN = 155;
export function minutesLeft(s = state) {
  const words = s.lines.filter((l) => l.verse >= s.verse).reduce((n, l) => n + l.text.split(/\s+/).length, 0);
  return words / (WORDS_PER_MIN * (getData().prefs.rate || 1));
}
export const fmtMinutes = (m: number) => { const secs = Math.round(m * 60); return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`; };

// ----- The phone's lock screen and headphone buttons -----
function mediaSession() {
  const ms = typeof navigator !== "undefined" ? (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession : undefined;
  if (!ms || typeof MediaMetadata === "undefined") return;
  if (!state.kind) { ms.metadata = null; return; }
  if (state.kind === "video") { if (ms.metadata?.title !== state.video?.title) ms.metadata = new MediaMetadata({ title: state.video?.title ?? "", artist: state.video?.creator ?? "", album: state.from || "Veritas Logos" }); }
  else {
    const title = `${bookName(state.book)} ${state.chapter}`;
    if (ms.metadata?.title !== title) ms.metadata = new MediaMetadata({ title, artist: `Verse ${state.verse} · ${state.translation}`, album: "Veritas Logos" });
  }
  ms.playbackState = state.status === "playing" ? "playing" : "paused";
}
if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const on = (a: MediaSessionAction, f: () => void) => { try { ms.setActionHandler(a, f); } catch { /* not supported */ } };
  on("play", resume); on("pause", pause);
  on("nexttrack", () => void skipChapter(1)); on("previoustrack", () => void skipChapter(-1));
  on("seekforward", () => skipVerse(1)); on("seekbackward", () => skipVerse(-1));
}

// ----- Videos: YouTube and Vimeo play inside the player; everything else opens on its own site -----
/** The address that plays a video inside the app, or null when its site doesn't allow that. */
export function embedFor(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./, "");
  const origin = typeof location !== "undefined" && location.origin.startsWith("http") ? location.origin : "";
  const yt = (path: string, extra: Record<string, string> = {}) => `https://www.youtube-nocookie.com/embed/${path}?${new URLSearchParams({ enablejsapi: "1", playsinline: "1", rel: "0", autoplay: "1", ...(origin ? { origin } : {}), ...extra })}`;
  if (host === "youtu.be") return yt(u.pathname.slice(1));
  if (host === "youtube.com") {
    if (u.searchParams.get("v")) return yt(u.searchParams.get("v")!);
    if (u.pathname === "/playlist" && u.searchParams.get("list")) return yt("videoseries", { list: u.searchParams.get("list")! });
    const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/); if (m) return yt(m[1]);
    return null; // A channel page.
  }
  if (host === "vimeo.com") { const m = u.pathname.match(/^\/(\d+)/); return m ? `https://player.vimeo.com/video/${m[1]}?autoplay=1&playsinline=1&dnt=1` : null; }
  return null;
}
let frame: HTMLIFrameElement | null = null;
/** The player's video frame, so the controls can reach it. */
export function registerFrame(el: HTMLIFrameElement | null) {
  frame = el;
  if (el) el.addEventListener("load", () => { post({ event: "listening", id: 1, channel: "widget" }); for (const ev of ["play", "pause", "ended", "timeupdate"]) post({ method: "addEventListener", value: ev }); }, { once: true });
}
const isVimeo = () => Boolean(state.video?.embed?.includes("vimeo"));
function post(msg: unknown) { try { frame?.contentWindow?.postMessage(JSON.stringify(msg), "*"); } catch { /* the frame is gone */ } }
/** Sends a command to the video's own player. */
function videoCommand(cmd: "play" | "pause" | "seek" | "rate", value?: number) {
  if (isVimeo()) post(cmd === "seek" ? { method: "setCurrentTime", value } : cmd === "rate" ? { method: "setPlaybackRate", value } : { method: cmd });
  else post({ event: "command", func: cmd === "play" ? "playVideo" : cmd === "pause" ? "pauseVideo" : cmd === "seek" ? "seekTo" : "setPlaybackRate", args: cmd === "seek" ? [value, true] : cmd === "rate" ? [value] : [] });
}
export function seekVideo(seconds: number) { set({ time: seconds }); videoCommand("seek", seconds); }
/** Back 15 seconds or forward 30. */
export const nudgeVideo = (by: number) => seekVideo(Math.max(0, Math.min(state.duration || Infinity, state.time + by)));
function stopVideo() { if (state.kind === "video") { videoCommand("pause"); frame = null; } }
/** Plays a video in the player, with the others from the same place as Up next. */
export function playVideo(video: Omit<PlayerVideo, "embed">, queue: Omit<PlayerVideo, "embed">[] = [], from = "") {
  const withEmbed = (v: Omit<PlayerVideo, "embed">): PlayerVideo => ({ ...v, embed: embedFor(v.url) });
  const item = withEmbed(video);
  if (!item.embed) { window.open(item.url, "_blank", "noopener"); return; }
  silence();
  set({ kind: "video", video: item, queue: queue.map(withEmbed), from, time: 0, duration: 0, status: "playing", open: true, translation: null, lines: [], note: "", sleepEndOfChapter: false });
}
/** The next or previous video that can play here, in the order they came. */
function skipVideo(by: 1 | -1) {
  const list = state.queue.filter((v) => v.embed), i = list.findIndex((v) => v.id === state.video?.id);
  const to = list[i + by];
  if (to) playVideo(to, state.queue, state.from); else if (by < 0) seekVideo(0);
}
export const upNextVideos = () => { const list = state.queue.filter((v) => v.embed), i = list.findIndex((v) => v.id === state.video?.id); return list.slice(i + 1); };
// What the video's player reports: playing, paused, ended, and where it is.
if (typeof window !== "undefined") window.addEventListener("message", (e) => {
  if (state.kind !== "video" || !frame || e.source !== frame.contentWindow) return;
  let d: any; try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
  if (!d) return;
  const ended = () => {
    if (state.sleepEndOfChapter) { set({ status: "paused", sleepEndOfChapter: false }); toast("Sleep timer: finished the video"); return; }
    const next = upNextVideos()[0];
    if (next && getData().prefs.listenContinue !== false) playVideo(next, state.queue, state.from); else set({ status: "paused" });
  };
  // YouTube: 1 playing, 2 paused, 0 ended.
  const ps = d.event === "onStateChange" ? d.info : d.info?.playerState;
  if (ps === 1 && state.status !== "playing") set({ status: "playing" });
  else if (ps === 2 && state.status !== "paused") set({ status: "paused" });
  else if (ps === 0) ended();
  if (d.event === "infoDelivery" && d.info && (typeof d.info.currentTime === "number" || typeof d.info.duration === "number"))
    set({ time: d.info.currentTime ?? state.time, duration: d.info.duration || state.duration });
  // Vimeo.
  if (d.event === "play") set({ status: "playing" });
  else if (d.event === "pause") set({ status: "paused" });
  else if (d.event === "ended") ended();
  else if (d.event === "timeupdate" && d.data) set({ time: d.data.seconds, duration: d.data.duration || state.duration });
});
