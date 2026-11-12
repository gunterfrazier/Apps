import { useEffect, useRef, useState } from "react";
import { EXPLORE_PRESETS, checkReferences, type Exegesis, type ExploreContext, type ExploreDraft } from "../../core/ai";
import type { TranslationId } from "../../core/bible";
import type { LensId } from "../../core/content";
import { lensName, newId, type GuideSection, type SectionItem } from "../../core/guide";
import { normalizeStrongs } from "../../core/lexicon";
import type { CheckedSource } from "../../core/research";
import { detectAi, type AiMode } from "../ai-client";
import { enqueueJob, exegesisKey, exploreKey, markSeen, removeJob, retryJob, stopJob, useJob, type AiJob, type JobTarget } from "../ai-jobs";
import { getData, saveGuide, toast } from "../store";
import { Loading, OriginTag, Paras, RefLink, RefText, Sheet, Tag, useAsync } from "../ui";

export const useAiMode = () => {
  const [mode, setMode] = useState<AiMode | null>(null);
  useEffect(() => { let live = true; detectAi().then((m) => live && setMode(m)); return () => { live = false; }; }, []);
  return mode;
};

/** Shows each citation and whether the app could confirm it. */
export function CheckedSources({ list }: { list: CheckedSource[] }) {
  if (!list.length) return <p className="fine">The assistant named no sources from the app, so treat this as unsourced.</p>;
  const ok = list.filter((s) => s.ok).length;
  return (
    <details className="doctrine" open={ok < list.length}>
      <summary>Sources: {ok} of {list.length} confirmed</summary>
      <ul className="fine-list">
        {list.map((s, i) => (
          <li key={i}>
            <span className={s.ok ? "ok-mark" : "bad-mark"}>{s.ok ? "Checked" : "Not confirmed"}</span>{" "}
            {s.hash ? <a href={`#${s.hash}`}>{s.label || "Source"}</a> : <RefText text={s.label || "Source"} />}{s.detail ? `: “${s.detail}”` : ""}
            <span className="fine"> {s.why}</span>
          </li>
        ))}
      </ul>
      <p className="fine">Confirmed means the words are in that source. It doesn't mean they prove the point, so read them in context.</p>
    </details>
  );
}

const sourceItems = (checked: CheckedSource[]): SectionItem[] => checked.filter((s) => s.ok).map((s) => ({ label: s.label, text: s.detail ? `“${s.detail}”` : "" }));

/** Turns a draft into a section for the guide. Only confirmed sources are carried over. */
export function draftToSection(d: ExploreDraft, checked: CheckedSource[], fallback: string): GuideSection {
  const unconfirmed = checked.filter((s) => !s.ok).length;
  const body = [d.body, d.gaps.length ? `Not settled: ${d.gaps.join(" ")}` : "", unconfirmed ? `${unconfirmed} citation${unconfirmed === 1 ? "" : "s"} couldn't be confirmed and ${unconfirmed === 1 ? "was" : "were"} left out.` : ""].filter(Boolean).join("\n\n");
  return { id: newId(), kind: "text", heading: d.heading || fallback, origin: "ai", body, items: [...d.items, ...sourceItems(checked)] };
}

/** Where a finished draft goes when it's accepted from somewhere other than its section. */
export function placeInGuide(target: JobTarget | undefined, sections: GuideSection[], fallback: (s: GuideSection[]) => void, replace = false) {
  const guide = target?.guideId ? getData().guides.find((g) => g.id === target.guideId) : undefined;
  if (!guide) return fallback(sections);
  const list = [...guide.sections];
  const at = target?.sectionId ? list.findIndex((x) => x.id === target.sectionId) : list.findIndex((x) => x.kind === "passage");
  if (replace && at >= 0) list[at] = { ...list[at], ...sections[0], id: list[at].id };
  else list.splice(at + 1, 0, ...sections);
  saveGuide({ ...guide, sections: list });
  toast(`Added to "${guide.title}"`);
}

/** Shows that a job is still going, and that it's safe to leave. */
export function JobProgress({ job, leaveNote = true }: { job: AiJob; leaveNote?: boolean }) {
  return (
    <div className="job-progress">
      <Loading label={job.progress || "Thinking"} />
      {leaveNote && <p className="fine">You can keep studying. This carries on while you move around the app, and <a href="#ai">AI work</a> shows when it's ready.</p>}
      <button type="button" className="btn small" onClick={() => stopJob(job.id)}>Stop</button>
    </div>
  );
}

export function JobError({ job, label = "Try again" }: { job: AiJob; label?: string }) {
  return (
    <>
      <p className="note warn">{job.error}{job.errorCode ? <span className="fine"> (Code: {job.errorCode})</span> : null}</p>
      <div className="action-row">
        <button type="button" className="btn small primary" onClick={() => retryJob(job.id)}>{label}</button>
        <button type="button" className="btn small" onClick={() => removeJob(job.id)}>Dismiss</button>
      </div>
    </>
  );
}

export function ExploreResult({ job, onAdd, onReplace, onAgain, heading }: { job: AiJob; onAdd: (s: GuideSection) => void; onReplace?: (s: GuideSection) => void; onAgain?: () => void; heading: string }) {
  const { draft, checked } = job.result as { draft: ExploreDraft; checked: CheckedSource[] };
  const allText = `${draft.body} ${draft.items.map((i) => i.text).join(" ")}`;
  const refs = useAsync(() => checkReferences(allText), [allText]);
  const bad = (refs.data ?? []).filter((c) => !c.ok).map((c) => c.ref);
  useEffect(() => { markSeen(job.id); }, [job.id]);
  return (
    <div className="explore-result">
      <OriginTag origin="ai" />
      <h3>{draft.heading}</h3>
      {bad.length > 0 && <p className="note warn">These references don't exist in the Bible text, so the AI got them wrong: {bad.join(", ")}.</p>}
      {draft.body && <Paras text={draft.body} />}
      {draft.items.length > 0 && <ul>{draft.items.map((it, i) => <li key={i}>{it.label && <strong>{it.label}: </strong>}<RefText text={it.text} /></li>)}</ul>}
      {draft.gaps.length > 0 && <><h4>Not settled</h4><ul className="fine-list">{draft.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
      <CheckedSources list={checked} />
      <div className="action-row">
        {onReplace && <button type="button" className="btn primary" onClick={() => onReplace(draftToSection(draft, checked, heading))}>Use in this section</button>}
        <button type="button" className={`btn ${onReplace ? "" : "primary"}`} onClick={() => onAdd(draftToSection(draft, checked, heading))}>{onReplace ? "Add as a new section" : "Add to guide"}</button>
        {onAgain && <button type="button" className="btn" onClick={onAgain}>Ask something else</button>}
      </div>
    </div>
  );
}

/**
 * Explore and expand any section. The assistant searches the app's library with its tools.
 * The request runs on its own, so closing this sheet or leaving the page doesn't stop it.
 * The result stays a labeled draft, and nothing joins the guide until it's accepted.
 */
export function ExploreSheet({ context, where, target, onClose, onAdd, onReplace, initialAsk }: { context: ExploreContext; where: string; target?: JobTarget; onClose: () => void; onAdd: (s: GuideSection) => void; onReplace?: (s: GuideSection) => void; initialAsk?: string }) {
  const mode = useAiMode();
  const [custom, setCustom] = useState("");
  const key = exploreKey(where, context.heading);
  const job = useJob(key);
  const started = useRef(false);
  const run = (request: string) => enqueueJob({ kind: "explore", key, title: `Explore: ${context.heading}`, payload: { context, request }, target });
  useEffect(() => {
    if (initialAsk && mode && mode !== "none" && !started.current && !job) { started.current = true; run(initialAsk); }
  }, [mode]);
  const presets = EXPLORE_PRESETS.filter((p) => !p.kinds || p.kinds.includes(context.kind));
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  return (
    <Sheet wide title={`Explore: ${context.heading}`} onClose={onClose}>
      {mode === null && <Loading />}
      {mode === "none" && <p className="note">The AI assistant isn't available in this copy of the app. See Library for how to turn it on.</p>}
      {mode && mode !== "none" && !job && (
        <>
          <p className="fine">The assistant searches this app's library: Scripture, Hebrew and Greek, the writers, Easton's and Smith's dictionaries, Josephus, the creeds and church history. It can't search the live web from here. It also draws on its own knowledge, and it says where it does.</p>
          <div className="tool-list">{presets.map((p) => <button type="button" key={p.id} className="tool-row" onClick={() => run(p.ask)}><strong>{p.label}</strong></button>)}</div>
          <label className="label" htmlFor="explore-custom">Or ask your own question about this section</label>
          <textarea id="explore-custom" className="input" rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="What did the term mean in first-century Judaism?" />
          <button type="button" className="btn primary" disabled={!custom.trim()} onClick={() => run(custom)}>Explore</button>
        </>
      )}
      {active && <JobProgress job={job} />}
      {job?.status === "error" && <JobError job={job} />}
      {job?.status === "done" && <ExploreResult job={job} heading={context.heading} onAdd={(n) => { removeJob(job.id); onAdd(n); }} onReplace={onReplace ? (n) => { removeJob(job.id); onReplace(n); } : undefined} onAgain={() => removeJob(job.id)} />}
    </Sheet>
  );
}

/** Section text the assistant should see. */
export const sectionText = (s: GuideSection) => [s.body, s.ref, ...(s.items ?? []).map((it) => [it.label, it.ref, it.text].filter(Boolean).join(": "))].filter(Boolean).join("\n");

export function exegesisToSections(e: Exegesis, reference: string, lens: LensId, checked: CheckedSource[]): GuideSection[] {
  const ai = (heading: string, kind: GuideSection["kind"], extra: Partial<GuideSection>): GuideSection => ({ id: newId(), kind, heading, origin: "ai", ...extra });
  const name = lens === "all" ? "shared reading" : `${lensName(lens)} lens`;
  const out: GuideSection[] = [ai(`Exegesis of ${reference} (${name})`, "text", { body: [e.thesis, e.historical && `Setting. ${e.historical}`, e.literary && `Literary context. ${e.literary}`].filter(Boolean).join("\n\n") })];
  if (e.structure.length) out.push(ai("Structure", "structure", { items: e.structure.map((s) => ({ label: s.verses, text: s.point })) }));
  if (e.verses.length) out.push(ai("Verse by verse", "text", { items: e.verses.map((v) => ({ label: v.ref, text: v.comment })) }));
  if (e.words.length) out.push(ai("Original-language notes", "words", { items: [...e.words.map((w) => ({ label: w.word, wordId: normalizeStrongs(w.strong) ?? undefined, text: `${w.meaning} ${w.significance}`.trim() })), ...e.grammar.map((g) => ({ label: g.ref, text: g.note }))] }));
  if (e.intertext.length) out.push(ai("Wider biblical links", "crossrefs", { items: e.intertext.map((x) => ({ label: x.relation, ref: x.ref, text: x.note })) }));
  if (e.lensReading || e.doctrines.length) out.push(ai(lens === "all" ? "Theological reading" : `${lensName(lens)} reading`, "views", { body: e.lensReading, items: e.doctrines.map((d) => ({ label: d.name, text: d.connection })) }));
  if (e.otherReadings.length) out.push(ai("How others read it", "views", { items: e.otherReadings.map((o) => ({ label: o.tradition, text: o.reading })) }));
  if (e.application) out.push(ai("Application", "text", { body: e.application }));
  if (e.uncertain.length) out.push(ai("Debated or uncertain", "text", { items: e.uncertain.map((text) => ({ text })) }));
  const confirmed = sourceItems(checked);
  if (confirmed.length) out.push(ai("Sources confirmed for this exegesis", "views", { items: confirmed }));
  return out;
}

export function ExegesisView({ e, checked, stray, reference, lens, onAdd, thin = [], unfinished }: { e: Exegesis; checked: CheckedSource[]; stray: string[]; reference: string; lens: LensId; onAdd: (s: GuideSection[]) => void; thin?: string[]; unfinished?: boolean }) {
  const text = JSON.stringify({ ...e, sources: [] }).replace(/\\n/g, " ");
  const refs = useAsync(() => checkReferences(text), [text]);
  const bad = [...new Set((refs.data ?? []).filter((c) => !c.ok).map((c) => c.ref))];
  return (
    <div className="exegesis">
      <OriginTag origin="ai" />
      {bad.length > 0 && <p className="note warn">These references don't exist in the Bible text, so the AI got them wrong: {bad.join(", ")}.</p>}
      {thin.length > 0 && <p className="note warn">The AI gave nothing usable for: {thin.join(", ")}. Write it again if you need that part.</p>}
      {stray.length > 0 && <p className="note warn">These word studies aren't words in this passage's Hebrew or Greek, so check them: {stray.join(", ")}.</p>}
      {e.thesis && <p className="ex-thesis"><RefText text={e.thesis} /></p>}
      {e.historical && <><h4>Setting</h4><Paras text={e.historical} /></>}
      {e.literary && <><h4>Literary context</h4><Paras text={e.literary} /></>}
      {e.structure.length > 0 && <><h4>Structure</h4><ul className="fine-list big">{e.structure.map((s, i) => <li key={i}><strong>{s.verses}</strong> <RefText text={s.point} /></li>)}</ul></>}
      {e.verses.length > 0 && <><h4>Verse by verse</h4>{e.verses.map((v, i) => <p key={i}><RefLink refText={v.ref} /> <RefText text={v.comment} /></p>)}</>}
      {e.words.length > 0 && <><h4>Key words</h4>{e.words.map((w, i) => <p key={i}>{normalizeStrongs(w.strong) ? <a href={`#word-${normalizeStrongs(w.strong)!.toLowerCase()}`}><strong>{w.word}</strong></a> : <strong>{w.word}</strong>} <RefText text={`${w.meaning} ${w.significance}`} /></p>)}</>}
      {e.grammar.length > 0 && <><h4>Grammar that affects meaning</h4>{e.grammar.map((g, i) => <p key={i}><RefLink refText={g.ref} /> <RefText text={g.note} /></p>)}</>}
      {e.intertext.length > 0 && <><h4>Wider biblical links</h4><ul className="link-list">{e.intertext.map((x, i) => <li key={i}><RefLink refText={x.ref} /> <Tag>{x.relation}</Tag><span className="shared"><RefText text={x.note} /></span></li>)}</ul></>}
      {e.lensReading && <><h4>{lens === "all" ? "Reading most traditions share" : `${lensName(lens)} reading`}</h4><Paras text={e.lensReading} /></>}
      {e.doctrines.length > 0 && <><h4>Doctrines</h4>{e.doctrines.map((d, i) => <p key={i}><strong>{d.name}.</strong> <RefText text={d.connection} /></p>)}</>}
      {e.otherReadings.length > 0 && <><h4>How others read it</h4>{e.otherReadings.map((o, i) => <p key={i}><strong>{o.tradition}.</strong> <RefText text={o.reading} /></p>)}</>}
      {e.application && <><h4>Application</h4><Paras text={e.application} /></>}
      {e.uncertain.length > 0 && <><h4>Debated or uncertain</h4><ul>{e.uncertain.map((u, i) => <li key={i}><RefText text={u} /></li>)}</ul></>}
      {!unfinished && <CheckedSources list={checked} />}
      {!unfinished && <button type="button" className="btn small primary" onClick={() => onAdd(exegesisToSections(e, reference, lens, checked))}>Add to guide</button>}
    </div>
  );
}

/** The button and result for a deep exegesis. Works in the reader and in a guide. */
export function ExegesisBlock({ reference, translation, lens, onAdd, compact, target }: { reference: string; translation: TranslationId; lens: LensId; onAdd: (s: GuideSection[]) => void; compact?: boolean; target?: JobTarget }) {
  const mode = useAiMode();
  const key = exegesisKey(reference, translation, lens);
  const job = useJob(key);
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  if (mode === null || mode === "none") return null;
  const lensName_ = lens === "all" ? "shared reading" : `${lensName(lens)} lens`;
  const run = () => enqueueJob({ kind: "exegesis", key, title: `Exegesis: ${reference} (${lensName_})`, payload: { reference, translation, lens }, target });
  const lensLabel = lens === "all" ? "the reading traditions share, with their differences" : `the ${lensName(lens)} lens`;
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  const partial = job?.state?.exegesis as Exegesis | undefined;
  const r = job?.status === "done" ? job.result : null;
  return (
    <section className="ai-block">
      <div className="sec-head">
        <h3>Deep exegesis{compact ? "" : `: ${reference}`}</h3>
        {!job && <button type="button" className="btn primary small" onClick={run}>Write exegesis</button>}
        {r && <button type="button" className="link-btn" onClick={() => { removeJob(job!.id); }}>Clear</button>}
      </div>
      {!job && <p className="fine">Works through the setting, structure, each verse, the Hebrew or Greek, and the wider biblical links, then reads it from {lensLabel}. It's written in steps and each step is saved, so it can carry on if the app is interrupted. It's an AI draft, and the app checks its references, word studies and quotes.</p>}
      {active && <JobProgress job={job} />}
      {job?.status === "error" && <JobError job={job} label={job.state?.done ? "Carry on from here" : "Try again"} />}
      {!r && partial && (partial.thesis || partial.verses.length > 0) && <ExegesisView unfinished e={partial} checked={[]} stray={[]} reference={reference} lens={lens} onAdd={onAdd} />}
      {r && <ExegesisView e={r.exegesis} checked={r.checked} stray={r.stray} thin={r.thin} reference={reference} lens={lens} onAdd={onAdd} />}
    </section>
  );
}
