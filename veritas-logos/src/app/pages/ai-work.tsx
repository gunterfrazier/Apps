import { useEffect, useRef, useState } from "react";
import type { GuideSection } from "../../core/guide";
import { aiSelfTest, aiStatus, friendlyAiError } from "../ai-client";
import { clearFinished, markSeen, removeJob, retryJob, useJobs, type AiJob } from "../ai-jobs";
import { getData } from "../store";
import { Loading, useAsync } from "../ui";
import { ExegesisView, ExploreResult, JobProgress, draftToSection, placeInGuide } from "./ai-explore";
import { DraftPreview } from "./guides";
import { addSectionsToGuide, AiInsightView } from "./insights";

const activeJob = (j: AiJob) => j.status === "queued" || j.status === "running" || j.status === "interrupted";

/** A small marker on every screen, so work in the background is never out of sight. */
export function AiWorkPill({ route }: { route: string }) {
  const jobs = useJobs();
  if (route.startsWith("ai")) return null;
  // The Ask page already shows its own answer, and the marker would sit over its Send button.
  const onAsk = route.startsWith("ask");
  const shown = onAsk ? jobs.filter((j) => j.kind !== "chat") : jobs;
  const running = shown.filter(activeJob).length;
  const ready = shown.filter((j) => !activeJob(j) && !j.seen).length;
  if (!running && !ready) return null;
  return (
    <a href="#ai" className={`ai-pill ${ready ? "ready" : ""} ${onAsk ? "raised" : ""}`}>
      {running > 0 && <span className="dot" aria-hidden="true" />}
      {[running ? `AI working (${running})` : "", ready ? `${ready} ready` : ""].filter(Boolean).join(" · ")}
    </a>
  );
}

function addAnywhere(sections: GuideSection[], title: string, job: AiJob) {
  const d = getData();
  const p = job.payload ?? {};
  placeInGuide(job.target, sections, (s) => addSectionsToGuide(s, title, d.guides, d.activeGuideId, p.translation ?? p.context?.translation ?? d.prefs.translation, p.lens ?? p.context?.lens ?? d.prefs.lens));
}

function JobResult({ job }: { job: AiJob }) {
  useEffect(() => { markSeen(job.id); }, [job.id]);
  const done = () => removeJob(job.id);
  if (job.kind === "chat") return <p><a className="btn small primary" href="#ask">Read the answer</a></p>;
  if (job.kind === "explore") {
    const heading = job.payload.context.heading as string;
    const { draft, checked } = job.result;
    return <ExploreResult job={job} heading={heading} onAdd={() => { addAnywhere([draftToSection(draft, checked, heading)], heading, job); done(); }} onReplace={job.target?.canReplace ? () => { placeInGuide(job.target, [draftToSection(draft, checked, heading)], (s) => addAnywhere(s, heading, job), true); done(); } : undefined} />;
  }
  if (job.kind === "exegesis") {
    const r = job.result;
    return <ExegesisView e={r.exegesis} checked={r.checked} stray={r.stray} thin={r.thin} reference={job.payload.reference} lens={job.payload.lens} onAdd={(s) => { addAnywhere(s, job.payload.reference, job); done(); }} />;
  }
  if (job.kind === "insight") return <AiInsightView insight={job.result} reference={job.payload.reference} lens={job.payload.lens} onAdd={(s) => { addAnywhere(s, job.payload.reference, job); done(); }} />;
  return (
    <>
      <DraftPreview sections={job.result} />
      <button type="button" className="btn small primary" onClick={() => { addAnywhere(job.result, job.title, job); done(); }}>Add to guide</button>
    </>
  );
}

function JobRow({ job }: { job: AiJob }) {
  const [open, setOpen] = useState(!job.seen);
  return (
    <article className="job-row">
      <h3>{job.title}</h3>
      {activeJob(job) && <JobProgress job={job} leaveNote={false} />}
      {job.status === "interrupted" && <button type="button" className="btn small" onClick={() => retryJob(job.id)}>Carry on now</button>}
      {job.status === "error" && (
        <>
          <p className="job-state bad">{job.error}{job.errorCode ? ` (Code: ${job.errorCode})` : ""}</p>
          <div className="action-row">
            <button type="button" className="btn small primary" onClick={() => retryJob(job.id)}>{job.state?.done ? "Carry on from here" : "Try again"}</button>
            <button type="button" className="btn small" onClick={() => removeJob(job.id)}>Dismiss</button>
          </div>
        </>
      )}
      {job.status === "done" && (
        <>
          <p className="job-state ready">Ready</p>
          <div className="action-row">
            <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>
            <button type="button" className="btn small" onClick={() => removeJob(job.id)}>Discard</button>
          </div>
          {open && <JobResult job={job} />}
        </>
      )}
    </article>
  );
}

/** Tells the reader, in plain terms, whether AI can run here, and sends a small test only when asked. */
function AiCheck() {
  const { data } = useAsync(() => aiStatus(), []);
  const [state, setState] = useState<{ busy: boolean; lines: string[] }>({ busy: false, lines: [] });
  const ctl = useRef<AbortController | null>(null);
  const run = async () => {
    ctl.current = new AbortController();
    const lines: string[] = [];
    setState({ busy: true, lines });
    for (const [label, withTool] of [["A plain request", false], ["A request using the app's lookups", true]] as const) {
      if (withTool && data?.mode === "viewer" && data.tools === null) { lines.push(`${label}: not available in this view, so the AI works without lookups.`); continue; }
      try {
        await aiSelfTest(withTool, ctl.current.signal);
        lines.push(`${label}: working.`);
      } catch (e: any) {
        lines.push(`${label}: failed. ${friendlyAiError(e)} ${e?.code ? `(Code: ${e.code}${e.message ? `, ${e.message}` : ""})` : ""}`);
      }
      setState({ busy: true, lines: [...lines] });
    }
    setState({ busy: false, lines: [...lines] });
  };
  const where = data?.mode === "viewer" ? "through your Claude account" : data?.mode === "server" ? "through this app's server" : "not available in this copy";
  return (
    <section className="ai-check">
      <h2>Check the AI connection</h2>
      {!data ? <Loading /> : <p className="fine">AI here runs {where}.{data.mode === "viewer" ? (data.tools !== null ? " This view can use the app's lookups." : " This view can't use the app's lookups, so answers rely on what the app sends with each request.") : ""}</p>}
      {data && data.mode !== "none" && <button type="button" className="btn small" disabled={state.busy} onClick={run}>{state.busy ? "Testing…" : "Run a short test"}</button>}
      <p className="fine">The test sends two very short requests, which use a little of your Claude usage.</p>
      {state.lines.length > 0 && <ul className="fine-list">{state.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
    </section>
  );
}

export function AiWorkPage() {
  const jobs = useJobs();
  const list = [...jobs].reverse();
  const finished = jobs.some((j) => !activeJob(j));
  return (
    <div className="page">
      <h1 className="page-title">AI work</h1>
      <p className="fine">AI requests keep going while you move around the app. A phone can pause an app that's minimized. If that happens, the work carries on when you come back, and a long exegesis picks up from its last finished step.</p>
      {list.length === 0 && <p className="note">Nothing is running. Anything you ask the AI to do will show here.</p>}
      {list.map((j) => <JobRow key={j.id} job={j} />)}
      {finished && <button type="button" className="link-btn" onClick={clearFinished}>Clear finished work</button>}
      <AiCheck />
    </div>
  );
}
