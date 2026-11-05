import { useSyncExternalStore } from "react";
import { emptyExegesis, exegesisPartHasContent, exegesisPlan, exegesisSoFar, mergeExegesis, strayWords, type Exegesis, type ExegesisStage, type ExploreContext } from "../core/ai";
import type { TranslationId } from "../core/bible";
import type { LensId } from "../core/content";
import type { Guide } from "../core/guide";
import { checkSources, type CheckedSource } from "../core/research";
import { aiChat, aiDraft, aiExegesisStage, aiExplore, aiInsight, aiResearch, aiTopicReading, detectAi, friendlyAiError, type AskOpts, type Turn } from "./ai-client";
import { toast } from "./store";

/**
 * AI requests live here, outside any screen, so moving around the app doesn't stop them.
 * Each one is saved as it goes. If the phone pauses the app or the connection drops while it's
 * in the background, the work picks up again when the app comes back.
 */
export type JobKind = "explore" | "exegesis" | "insight" | "draft" | "chat" | "topic";
export type JobStatus = "queued" | "running" | "done" | "error" | "interrupted";
export interface JobTarget { guideId?: string; sectionId?: string; canReplace?: boolean }
export interface AiJob {
  id: string;
  key: string;
  kind: JobKind;
  title: string;
  status: JobStatus;
  progress: string;
  payload: any;
  /** Finished steps, kept so a job can resume instead of starting over. */
  state?: any;
  result?: any;
  error?: string;
  errorCode?: string;
  target?: JobTarget;
  /** Text streamed so far, for chat. It isn't saved. */
  partial?: string;
  seen: boolean;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}
export interface ChatState { turns: Turn[]; checked: Record<number, unknown>; error: string }

const KEY = "veritas.ai.jobs.v1";
const MAX_RUNNING = 2;
const MAX_ATTEMPTS = 4;
const MAX_KEPT = 24;
const RESUME_WITHIN = 24 * 3600 * 1000;
/** A round can take about five minutes, so this much silence means the call is lost. */
const SILENT_LIMIT = 7 * 60 * 1000;
const SILENT_AFTER_RETURN = 3 * 60 * 1000;

let jobs: AiJob[] = [];
let chat: ChatState = { turns: [], checked: {}, error: "" };
const listeners = new Set<() => void>();
const live = new Map<string, { ctl: AbortController; startedAt: number; lastActivity: number; stop: "user" | "restart" | "" }>();
let hiddenAt = 0;
let returnedAt = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  const save = (list: AiJob[]) => localStorage.setItem(KEY, JSON.stringify({ jobs: list.map(({ partial, ...j }) => j), chat }));
  try {
    save(jobs);
  } catch {
    // Storage is full or blocked. Keep the unfinished work, and drop finished results if that's what it takes.
    try { save(jobs.filter((j) => j.status !== "done")); } catch { /* this browser can't save, so it stays in memory */ }
  }
}
function schedulePersist() {
  if (!persistTimer) persistTimer = setTimeout(persistNow, 400);
}
function emit(saveIt = true) {
  listeners.forEach((l) => l());
  if (saveIt) schedulePersist();
}
function patch(id: string, p: Partial<AiJob>, saveIt = true) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...p, updatedAt: Date.now() } : j));
  emit(saveIt);
}
const get = (id: string) => jobs.find((j) => j.id === id);
const isActive = (j: AiJob) => j.status === "queued" || j.status === "running" || j.status === "interrupted";

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useJobs = () => useSyncExternalStore(subscribe, () => jobs);
export const useChat = () => useSyncExternalStore(subscribe, () => chat);
export function useJob(key: string | null): AiJob | undefined {
  return useSyncExternalStore(subscribe, () => (key ? [...jobs].reverse().find((j) => j.key === key) : undefined));
}

export function enqueueJob(input: { kind: JobKind; key: string; title: string; payload: any; target?: JobTarget }): AiJob {
  const existing = jobs.find((j) => j.key === input.key && isActive(j));
  if (existing) return existing;
  const now = Date.now();
  const job: AiJob = { ...input, id: `j${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, status: "queued", progress: "Waiting its turn", seen: false, attempts: 0, createdAt: now, updatedAt: now };
  jobs = [...jobs.filter((j) => j.key !== input.key), job];
  const finished = jobs.filter((j) => !isActive(j));
  if (finished.length > MAX_KEPT) { const drop = new Set(finished.slice(0, finished.length - MAX_KEPT).map((j) => j.id)); jobs = jobs.filter((j) => !drop.has(j.id)); }
  emit();
  pump();
  return job;
}

/** Stops a job and forgets it. */
export function stopJob(id: string) {
  const run = live.get(id);
  if (run) { run.stop = "user"; run.ctl.abort(); }
  jobs = jobs.filter((x) => x.id !== id);
  emit();
  pump();
}
export function removeJob(id: string) {
  if (live.has(id)) return stopJob(id);
  jobs = jobs.filter((x) => x.id !== id);
  emit();
}
export function clearFinished() {
  jobs = jobs.filter(isActive);
  emit();
}
export function markSeen(id: string) {
  const j = get(id);
  if (j && !j.seen && !isActive(j)) patch(id, { seen: true });
}
/** Starts a failed or interrupted job again, from its last finished step. */
export function retryJob(id: string) {
  const j = get(id);
  if (!j || live.has(id)) return;
  patch(id, { status: "queued", progress: "Waiting its turn", error: undefined, errorCode: undefined, attempts: 0 });
  pump();
}

function pump() {
  while (live.size < MAX_RUNNING) {
    const next = jobs.find((j) => j.status === "queued" && !live.has(j.id));
    if (!next) return;
    void start(next);
  }
}

async function start(job: AiJob) {
  const ctl = new AbortController();
  const run = { ctl, startedAt: Date.now(), lastActivity: Date.now(), stop: "" as "user" | "restart" | "" };
  live.set(job.id, run);
  patch(job.id, { status: "running", attempts: job.attempts + 1, progress: job.state ? "Picking up where it left off" : "Thinking" });
  const touch = () => { run.lastActivity = Date.now(); };
  const opts: AskOpts = {
    signal: ctl.signal,
    onText: (text) => { touch(); patch(job.id, { partial: text, progress: `Writing (${text.length.toLocaleString()} characters)` }, false); },
    onTool: (label) => { touch(); patch(job.id, { progress: label }, false); },
  };
  try {
    const result = await RUNNERS[job.kind](job, opts, touch);
    live.delete(job.id);
    if (run.stop === "user" || !get(job.id)) return;
    patch(job.id, { status: "done", result, progress: "", partial: undefined, error: undefined, errorCode: undefined });
    persistNow();
    toast(`Ready: ${job.title}`);
  } catch (e: any) {
    live.delete(job.id);
    if (run.stop === "user" || !get(job.id)) return;
    failed(job.id, e, run);
    persistNow();
  } finally {
    pump();
  }
}

function failed(id: string, e: any, run: { startedAt: number; stop: string }) {
  const j = get(id)!;
  const code = e?.code ?? (e instanceof TypeError ? "network" : "");
  const inBackground = document.hidden || hiddenAt >= run.startedAt || returnedAt >= run.startedAt;
  // The platform can end a call that was running while the app was paused. That's not the reader's choice, so it picks up again.
  const lost = code === "cancelled" || ((code === "upstream_error" || code === "network") && inBackground) || run.stop === "restart";
  if (lost && j.attempts < MAX_ATTEMPTS) {
    if (document.hidden) patch(id, { status: "interrupted", progress: "Paused while the app is in the background", partial: undefined });
    else patch(id, { status: "queued", progress: "Picking up where it left off", partial: undefined });
    return;
  }
  if (j.kind === "chat") {
    const message = friendlyAiError(e);
    chat = { ...chat, error: message, turns: e?.text ? [...chat.turns, { role: "assistant", content: e.text }] : chat.turns };
  }
  patch(id, { status: "error", error: friendlyAiError(e) || "This stopped before it finished.", errorCode: code, partial: undefined, progress: "" });
  toast(`Couldn't finish: ${j.title}`);
}

function resumeInterrupted() {
  for (const j of jobs) if (j.status === "interrupted" && j.attempts < MAX_ATTEMPTS) patch(j.id, { status: "queued", progress: "Picking up where it left off" });
  pump();
}

function watchdog() {
  if (document.hidden) return;
  const now = Date.now();
  live.forEach((run) => {
    const quiet = now - run.lastActivity;
    const lostOnReturn = returnedAt > run.lastActivity && now - returnedAt > SILENT_AFTER_RETURN;
    if (quiet > SILENT_LIMIT || lostOnReturn) { run.stop = "restart"; run.ctl.abort(); }
  });
}

// ---------- What each kind of job does ----------
type Runner = (job: AiJob, opts: AskOpts, touch: () => void) => Promise<any>;
const RUNNERS: Record<JobKind, Runner> = {
  insight: (job, opts) => aiInsight(job.payload.reference, job.payload.translation, job.payload.lens, opts),
  draft: (job, opts) => aiDraft(job.payload.guide, job.payload.request, opts),
  explore: (job, opts) => aiExplore(job.payload.context, job.payload.request, opts),
  topic: (job, opts) => aiTopicReading(job.payload.reference, job.payload.query, job.payload.translation, job.payload.lens, opts),
  chat: async (job, opts) => {
    const { turns, translation, lens, contextRef, research } = job.payload as { turns: Turn[]; translation: TranslationId; lens: LensId; contextRef?: string; research: boolean };
    if (research) {
      const { raw, answer } = await aiResearch(turns, translation, lens, contextRef, { ...opts, onText: (t) => opts.onTool?.(`Finding and checking sources (${t.length.toLocaleString()} characters)`) });
      const shown = answer ? [answer.summary, ...answer.claims.map((c) => c.text)].filter(Boolean).join("\n\n") : raw;
      chat = { ...chat, turns: [...turns, { role: "assistant", content: shown }], checked: answer ? { ...chat.checked, [turns.length]: answer } : chat.checked };
    } else {
      const answer = await aiChat(turns, translation, lens, contextRef, opts);
      chat = { ...chat, turns: [...turns, { role: "assistant", content: answer }] };
    }
    return {};
  },
  exegesis: async (job, opts, touch) => {
    const { reference, translation, lens } = job.payload as { reference: string; translation: TranslationId; lens: LensId };
    const initial = job.state ?? { plan: await exegesisPlan(reference, translation), done: 0, exegesis: emptyExegesis(), checked: [] as CheckedSource[], thin: [] as string[] };
    let st: { plan: ExegesisStage[]; done: number; exegesis: Exegesis; checked: CheckedSource[]; thin: string[] } = initial;
    if (!job.state) patch(job.id, { state: st });
    for (let i = st.done; i < st.plan.length; i++) {
      const stage = st.plan[i];
      const step = `Step ${i + 1} of ${st.plan.length}: ${stage.label}`;
      patch(job.id, { progress: step }, false);
      const part = await aiExegesisStage(reference, translation, lens, stage, stage.id === "overview" ? "" : stage.id === "verses" ? st.exegesis.thesis : exegesisSoFar(st.exegesis), {
        ...opts,
        onText: (t) => { touch(); patch(job.id, { progress: `${step} (writing, ${t.length.toLocaleString()} characters)` }, false); },
        onTool: (label) => { touch(); patch(job.id, { progress: `${step} (${label.toLowerCase()})` }, false); },
      });
      const sources = (part as any)?.sources;
      const checked = await checkSources(sources, translation);
      st = { ...st, done: i + 1, exegesis: mergeExegesis(st.exegesis, part), checked: [...st.checked, ...checked], thin: exegesisPartHasContent(part) ? st.thin : [...st.thin, stage.label] };
      patch(job.id, { state: st });
      persistNow();
    }
    return { exegesis: st.exegesis, checked: st.checked, thin: st.thin, stray: await strayWords(reference, st.exegesis.words) };
  },
};

// ---------- Helpers for each feature ----------
export const exegesisKey = (reference: string, translation: TranslationId, lens: LensId) => `exegesis:${reference}:${lens}:${translation}`;
export const insightKey = (reference: string, translation: TranslationId, lens: LensId) => `insight:${reference}:${lens}:${translation}`;
export const topicKey = (reference: string, query: string, translation: TranslationId, lens: LensId) => `topic:${reference}:${query.trim().toLowerCase()}:${lens}:${translation}`;
export const draftKey = (guide: Guide) => `draft:${guide.id}`;
export const exploreKey = (where: string, heading: string) => `explore:${where}:${heading}`;
export type ExplorePayload = { context: ExploreContext; request: string };

export function askChat(question: string, cfg: { translation: TranslationId; lens: LensId; contextRef?: string; research: boolean }) {
  const shown: Turn[] = [...chat.turns, { role: "user", content: question }];
  chat = { ...chat, turns: shown, error: "" };
  emit();
  enqueueJob({ kind: "chat", key: "chat", title: `Question: ${question.slice(0, 60)}`, payload: { turns: shown, ...cfg } });
}
export function newChat() {
  const j = jobs.find((x) => x.key === "chat");
  if (j) removeJob(j.id);
  chat = { turns: [], checked: {}, error: "" };
  emit();
}

// ---------- Start-up ----------
export function initJobs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && Array.isArray(raw.jobs)) jobs = raw.jobs.filter((j: any) => j && typeof j.id === "string" && typeof j.kind === "string" && j.kind in RUNNERS);
    if (raw?.chat && Array.isArray(raw.chat.turns)) chat = { turns: raw.chat.turns, checked: raw.chat.checked ?? {}, error: "" };
  } catch { /* nothing saved */ }
  const now = Date.now();
  let resuming = false;
  jobs = jobs.map((j) => {
    if (j.status !== "queued" && j.status !== "running" && j.status !== "interrupted") return j;
    const recent = now - j.updatedAt < RESUME_WITHIN && j.attempts < MAX_ATTEMPTS;
    if (recent) resuming = true;
    return { ...j, status: recent ? ("queued" as const) : ("interrupted" as const), progress: recent ? "Picking up where it left off" : "Stopped when the app closed" };
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); persistNow(); return; }
    if (hiddenAt) returnedAt = Date.now();
    resumeInterrupted();
    watchdog();
  });
  window.addEventListener("pagehide", persistNow);
  window.addEventListener("online", resumeInterrupted);
  setInterval(watchdog, 30000);
  if (resuming) void detectAi().then((m) => { if (m !== "none") pump(); });
  emit(false);
}
