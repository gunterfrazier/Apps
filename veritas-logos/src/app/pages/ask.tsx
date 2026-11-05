import { useEffect, useRef, useState } from "react";
import { checkReferences } from "../../core/ai";
import { lensName, newId } from "../../core/guide";
import { detectAi, type AiMode, type Turn } from "../ai-client";
import { askChat, markSeen, newChat, stopJob, useChat, useJob } from "../ai-jobs";
import type { CheckedClaim, ResearchAnswer } from "../../core/research";
import { saveGuide, setPref, useData, toast, navigate } from "../store";
import { copyText } from "../files";
import { Loading, LensSelect, RefText, TranslationSelect, OriginTag, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";

const STARTERS = [
  "How would Paul's first readers have heard “adoption” in Romans 8:15?",
  "Why do Reformed and Arminian Christians read Romans 9 differently?",
  "What idioms in the Sermon on the Mount do modern readers miss?",
  "Where does the New Testament quote Psalm 110, and why does it matter?",
];

export function AiSetupNote() {
  return (
    <div className="note">
      <p><strong>The AI assistant isn't set up in this copy of the app.</strong></p>
      <p>It works automatically when the app is opened inside Claude. Reading, word study, sourced insights, guides and people all work without it.</p>
      <a className="btn small" href="#library">Open AI settings</a>
    </div>
  );
}

const research0 = (job: { payload: { research?: boolean } }) => Boolean(job.payload?.research);

export function AskPage({ contextRef }: { contextRef?: string }) {
  const { prefs, guides, activeGuideId } = useData();
  const [mode, setMode] = useState<AiMode | null>(null);
  const { turns, checked: checkedRaw, error: chatError } = useChat();
  const checked = checkedRaw as Record<number, ResearchAnswer>;
  const job = useJob("chat");
  const working = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  const streaming = working ? (job.partial && !research0(job) ? job.partial : "") : null;
  const error = chatError;
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState(contextRef);
  const [research, setResearch] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { let live = true; detectAi().then((m) => live && setMode(m)); return () => { live = false; }; }, []);
  useEffect(() => { setContext(contextRef); }, [contextRef]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length, streaming]);
  useEffect(() => { if (job && !working) markSeen(job.id); }, [job?.id, working]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || working) return;
    setDraft("");
    askChat(question, { translation: prefs.translation, lens: prefs.lens, contextRef: context, research });
  };
  const addAnswer = (content: string, question: string) =>
    addSectionsToGuide([{ id: newId(), kind: "text", heading: question.slice(0, 90), origin: "ai", body: content }], question.slice(0, 60), guides, activeGuideId, prefs.translation, prefs.lens);

  if (mode === null) return <div className="page"><Loading /></div>;
  return (
    <div className="page ask">
      <h1 className="page-title">Ask</h1>
      <p className="fine">A study helper that checks the app's Bible text and reference data. It can still make mistakes, so test its answers against Scripture and your own teachers.</p>
      {mode === "none" ? <AiSetupNote /> : (
        <>
          <div className="filters">
            <label className="field-inline" htmlFor="ask-lens">Lens <LensSelect id="ask-lens" value={prefs.lens} onChange={(l) => setPref("lens", l)} /></label>
            <label className="field-inline" htmlFor="ask-research"><input id="ask-research" type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} /> Research mode</label>
            <label className="field-inline" htmlFor="ask-translation">Text <TranslationSelect id="ask-translation" value={prefs.translation} onChange={(t) => setPref("translation", t)} /></label>
          </div>
          {research && <p className="fine">In research mode, the assistant must tie every claim to a passage, writer, creed or term in this app. The app then checks each quote word for word, and marks anything it can't confirm as unsupported.</p>}
          {context && <p className="context-chip">Looking at <RefText text={context} /> <button type="button" className="link-btn" onClick={() => setContext(undefined)}>Remove</button></p>}
          {!turns.length && streaming === null && (
            <div className="tool-list">
              {(context ? [`How would the first audience have understood ${context}?`, `What idioms or customs in ${context} might I miss?`, `How do different traditions use ${context} in theology?`, `Is ${context} quoted or alluded to elsewhere in Scripture?`] : STARTERS).map((s) => (
                <button type="button" key={s} className="tool-row" onClick={() => send(s)}><span>{s}</span></button>
              ))}
            </div>
          )}
          <div className="chat">
            {turns.map((t, i) => (
              <div key={i} className={`bubble ${t.role}`}>
                {t.role === "assistant" ? (checked[i] ? <CheckedAnswer a={checked[i]} onAdd={() => addAnswer(t.content, turns[i - 1]?.content ?? "AI answer")} /> : <Answer text={t.content} onAdd={() => addAnswer(t.content, turns[i - 1]?.content ?? "AI answer")} />) : <p>{t.content}</p>}
              </div>
            ))}
            {streaming !== null && <div className="bubble assistant">{streaming ? <Prose text={streaming} /> : <Loading label={job?.progress || "Thinking"} />}<button type="button" className="link-btn" onClick={() => job && stopJob(job.id)}>Stop</button></div>}
            {error && <p className="note warn">{error}</p>}
            {turns.length > 0 && streaming === null && <button type="button" className="link-btn" onClick={newChat}>Start a new conversation</button>}
            <div ref={end} />
          </div>
          <form className="ask-box" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
            <textarea id="ask-input" className="input" rows={2} placeholder={`Ask about a passage, word or doctrine (${lensName(prefs.lens)})`} aria-label="Your question" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button type="submit" className="btn primary" disabled={!draft.trim() || Boolean(working)}>Send</button>
          </form>
        </>
      )}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i} style={{ whiteSpace: "pre-wrap" }}><RefText text={p.replace(/\*\*/g, "")} /></p>)}</>;
}

function ClaimRow({ c }: { c: CheckedClaim }) {
  return (
    <li className={`claim ${c.supported ? "ok" : "bad"}`}>
      <p><strong>{c.supported ? "Supported" : "Unsupported"}.</strong> <RefText text={c.text} /></p>
      <ul className="fine-list">
        {c.sources.map((s, i) => (
          <li key={i}>
            <span className={s.ok ? "ok-mark" : "bad-mark"}>{s.ok ? "Checked" : "Not confirmed"}</span>{" "}
            {s.hash ? <a href={`#${s.hash}`}>{s.label}</a> : <RefText text={s.label} />}{s.detail ? `: “${s.detail}”` : ""}
            <span className="fine"> {s.why}</span>
          </li>
        ))}
        {!c.sources.length && <li>No source was given.</li>}
      </ul>
    </li>
  );
}
function CheckedAnswer({ a, onAdd }: { a: ResearchAnswer; onAdd: () => void }) {
  const ok = a.claims.filter((c) => c.supported).length;
  return (
    <>
      {a.summary && <p><RefText text={a.summary} /></p>}
      <p className="fine">{ok} of {a.claims.length} claims have a source the app could confirm. A confirmed source shows the words exist, and you still need to judge whether they support the claim.</p>
      <ul className="claims">{a.claims.map((c, i) => <ClaimRow key={i} c={c} />)}</ul>
      {a.gaps.length > 0 && <><h4>What the app's sources don't settle</h4><ul className="fine-list">{a.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
      <div className="bubble-actions">
        <OriginTag origin="ai" />
        <button type="button" className="link-btn" onClick={onAdd}>Add to guide</button>
      </div>
    </>
  );
}

function Answer({ text, onAdd }: { text: string; onAdd: () => void }) {
  const { data: checks } = useAsync(() => checkReferences(text), [text]);
  const bad = (checks ?? []).filter((c) => !c.ok);
  return (
    <>
      <Prose text={text} />
      {bad.length > 0 && <p className="note warn">These references don't exist in the Bible text: {bad.map((b) => b.ref).join(", ")}.</p>}
      <div className="bubble-actions">
        <OriginTag origin="ai" />
        <button type="button" className="link-btn" onClick={onAdd}>Add to guide</button>
        <button type="button" className="link-btn" onClick={() => copyText(text)}>Copy</button>
      </div>
    </>
  );
}
export { saveGuide, toast, navigate };
