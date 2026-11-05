import { useEffect, useRef, useState } from "react";
import { checkReferences } from "../../core/ai";
import { lensName, newId } from "../../core/guide";
import { aiChat, detectAi, friendlyAiError, type AiMode, type Turn } from "../ai-client";
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

export function AskPage({ contextRef }: { contextRef?: string }) {
  const { prefs, guides, activeGuideId } = useData();
  const [mode, setMode] = useState<AiMode | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [context, setContext] = useState(contextRef);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { let live = true; detectAi().then((m) => live && setMode(m)); return () => { live = false; ctl.current?.abort(); }; }, []);
  useEffect(() => { setContext(contextRef); }, [contextRef]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length, streaming]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || streaming !== null) return;
    const next = [...turns, { role: "user" as const, content: question }];
    setTurns(next);
    setDraft("");
    setError("");
    setStreaming("");
    ctl.current = new AbortController();
    try {
      const answer = await aiChat(next, prefs.translation, prefs.lens, context, { signal: ctl.current.signal, onText: setStreaming });
      setTurns([...next, { role: "assistant", content: answer }]);
    } catch (e: any) {
      if (e?.text) setTurns([...next, { role: "assistant", content: e.text }]);
      setError(friendlyAiError(e));
    } finally {
      setStreaming(null);
    }
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
            <label className="field-inline" htmlFor="ask-translation">Text <TranslationSelect id="ask-translation" value={prefs.translation} onChange={(t) => setPref("translation", t)} /></label>
          </div>
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
                {t.role === "assistant" ? <Answer text={t.content} onAdd={() => addAnswer(t.content, turns[i - 1]?.content ?? "AI answer")} /> : <p>{t.content}</p>}
              </div>
            ))}
            {streaming !== null && <div className="bubble assistant">{streaming ? <Prose text={streaming} /> : <Loading label="Thinking" />}<button type="button" className="link-btn" onClick={() => ctl.current?.abort()}>Stop</button></div>}
            {error && <p className="note warn">{error}</p>}
            <div ref={end} />
          </div>
          <form className="ask-box" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
            <textarea id="ask-input" className="input" rows={2} placeholder={`Ask about a passage, word or doctrine (${lensName(prefs.lens)})`} aria-label="Your question" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button type="submit" className="btn primary" disabled={!draft.trim() || streaming !== null}>Send</button>
          </form>
        </>
      )}
    </div>
  );
}

function Prose({ text }: { text: string }) {
  return <>{text.split(/\n{2,}/).map((p, i) => <p key={i} style={{ whiteSpace: "pre-wrap" }}><RefText text={p.replace(/\*\*/g, "")} /></p>)}</>;
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
