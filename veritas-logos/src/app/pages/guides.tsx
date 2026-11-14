import { useEffect, useMemo, useRef, useState } from "react";
import { getPassage, TRANSLATIONS, type TranslationId } from "../../core/bible";
import { guideRequestPresets } from "../../core/ai";
import type { LensId } from "../../core/content";
import { blankGuide, generateGuide, GUIDE_FORMATS, GuideInputError, guideToHtml, guideToMarkdown, guideToText, guideToWord, lensName, newId, ORIGIN_LABEL, resolveGuide, sanitizeGuide, type Guide, type GuideFormat, type GuideSection, type SectionItem } from "../../core/guide";
import { peopleInPassage } from "../../core/people";
import { aiDraft, detectAi, friendlyAiError, type AiMode } from "../ai-client";
import { guideToDocx } from "../../core/docx";
import { StudyNav } from "./notebook";
import { EXPLORE_PRESETS } from "../../core/ai";
import { ExegesisBlock, ExploreSheet, JobError, JobProgress, sectionText, useAiMode } from "./ai-explore";
import { PassageSearchBlock } from "./passage-search";
import { symbolsHash } from "./symbols-link";
import { draftKey, enqueueJob, exploreKey, markSeen, removeJob, useJob } from "../ai-jobs";
import { appBase, copyText, decodeFromLink, encodeForLink, IS_ARTIFACT, saveFile } from "../files";
import { deleteGuide, navigate, saveGuide, toast, update, useData } from "../store";
import { Empty, ErrorNote, LensSelect, Loading, OriginTag, Paras, RefLink, RefText, Sheet, TranslationSelect, useAsync } from "../ui";

const STARTERS = ["Forgiveness", "Psalm 23", "Romans 8:28-39", "Prayer", "John 1:1-18", "Grace", "Matthew 5:1-12", "Covenant"];

// ---------- Guide list ----------
export function GuidesPage() {
  const { guides } = useData();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const guide = sanitizeGuide(parsed);
      if (!guide) { toast("That file isn't a Veritas guide."); return; }
      saveGuide({ ...guide, id: newId("g") });
      toast("Guide imported");
    } catch { toast("That file couldn't be read."); }
  };
  return (
    <div className="page">
      <h1 className="page-title">Study guides</h1>
      <StudyNav active="guides" />
      <a className="cta" href="#new"><strong>Build a study guide</strong><span>From any passage or topic, with real Scripture, word studies, cross-references and questions</span></a>
      <h3>Start with</h3>
      <div className="chips">{STARTERS.map((s) => <a className="chip" key={s} href={`#new-${encodeTopic(s)}`}>{s}</a>)}</div>
      <div className="sec-head">
        <h3>Your guides</h3>
        <button type="button" className="link-btn" onClick={() => fileInput.current?.click()}>Import a guide</button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
      </div>
      {guides.length === 0 && <Empty>Your guides will appear here. They save on this device, and you can back them up from Library.</Empty>}
      <div className="tool-list">
        {guides.map((g) => (
          <a key={g.id} className="tool-row" href={`#guide-${g.id}`}>
            <strong>{g.title}</strong>
            <span>{g.subtitle ?? GUIDE_FORMATS.find((f) => f.id === g.format)?.name} · {g.sections.length} sections · {new Date(g.updatedAt).toLocaleDateString()}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export const encodeTopic = (s: string) => encodeURIComponent(s).replace(/%/g, "~");
export const decodeTopic = (s: string) => { try { return decodeURIComponent(s.replace(/~/g, "%")); } catch { return s; } };

// ---------- Builder ----------
const STEPS = [
  { key: "scope", title: "Scope and lens" },
  { key: "scripture", title: "Scripture and links" },
  { key: "context", title: "Historical context" },
  { key: "language", title: "Language and structure" },
  { key: "theology", title: "Theology and other views" },
  { key: "questions", title: "Questions and finish" },
] as const;

const stepOf = (s: GuideSection): number => {
  if (s.kind === "passage" || s.kind === "crossrefs" || s.kind === "people") return 1;
  if (s.kind === "words" || s.kind === "structure") return 3;
  if (s.kind === "views") return 4;
  if (/background|overview/i.test(s.heading)) return 2;
  if (s.kind === "questions" || s.origin === "you") return 5;
  return 2;
};

export function NewGuidePage({ initial }: { initial?: string }) {
  const { prefs } = useData();
  const [mode, setMode] = useState<"auto" | "steps">("auto");
  const [input, setInput] = useState(initial ?? "");
  const [format, setFormat] = useState<GuideFormat>("inductive");
  const [lens, setLens] = useState<LensId>(prefs.lens);
  const [translation, setTranslation] = useState<TranslationId>(prefs.translation);
  const [title, setTitle] = useState("");
  const [inc, setInc] = useState({ words: true, xrefs: true, views: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wizard, setWizard] = useState<Guide | null>(null);
  const [step, setStep] = useState(0);
  useEffect(() => { if (initial) setInput(initial); }, [initial]);

  const build = async () => {
    setBusy(true);
    setError("");
    try {
      const guide = await generateGuide({ input, format, lens, translation, title, includeWords: inc.words, includeCrossRefs: inc.xrefs, includeViews: inc.views, peopleFor: peopleInPassage });
      if (mode === "auto") {
        saveGuide(guide);
        navigate(`guide-${guide.id}`);
      } else {
        setWizard(guide);
        setStep(1);
      }
    } catch (e) {
      setError(e instanceof GuideInputError ? e.message : "The guide couldn't be built. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const blank = () => {
    const g = blankGuide(title || input || "Untitled study", format, lens, translation);
    saveGuide(g);
    navigate(`guide-${g.id}`);
  };

  if (wizard && step > 0) {
    return <Wizard guide={wizard} setGuide={setWizard} step={step} setStep={setStep} onFinish={() => { saveGuide(wizard); navigate(`guide-${wizard.id}`); }} />;
  }

  return (
    <div className="page prose">
      <h1 className="page-title">New study guide</h1>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "auto"} className={mode === "auto" ? "on" : ""} onClick={() => setMode("auto")}>Build it for me</button>
        <button type="button" role="tab" aria-selected={mode === "steps"} className={mode === "steps" ? "on" : ""} onClick={() => setMode("steps")}>Guide me in 6 steps</button>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); build(); }} className="form">
        <div>
          <label className="label" htmlFor="guide-input">Passage or topic</label>
          <input id="guide-input" className="input big" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Matthew 18:21-35, forgiveness, or Romans" required />
        </div>
        <div>
          <span className="label">Format</span>
          <div className="radio-cards">
            {GUIDE_FORMATS.map((f) => (
              <label key={f.id} className={format === f.id ? "on" : ""}>
                <input type="radio" name="format" value={f.id} checked={format === f.id} onChange={() => setFormat(f.id)} />
                <strong>{f.name}</strong><span>{f.blurb}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="two-col">
          <div><label className="label" htmlFor="guide-lens">Theological lens</label><LensSelect id="guide-lens" value={lens} onChange={setLens} /></div>
          <div><label className="label" htmlFor="guide-translation">Translation</label><TranslationSelect localOnly id="guide-translation" value={translation} onChange={setTranslation} /></div>
        </div>
        <div><label className="label" htmlFor="guide-title">Title (optional)</label><input id="guide-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <fieldset className="checks">
          <legend className="label">Include</legend>
          <label className="check"><input id="inc-words" type="checkbox" checked={inc.words} onChange={(e) => setInc({ ...inc, words: e.target.checked })} /> Hebrew and Greek word studies</label>
          <label className="check"><input id="inc-xrefs" type="checkbox" checked={inc.xrefs} onChange={(e) => setInc({ ...inc, xrefs: e.target.checked })} /> Related passages</label>
          <label className="check"><input id="inc-views" type="checkbox" checked={inc.views} onChange={(e) => setInc({ ...inc, views: e.target.checked })} /> Questions on the theological lens</label>
        </fieldset>
        {error && <p className="note warn">{error}</p>}
        <button type="submit" className="btn primary big" disabled={busy || !input.trim()}>{busy ? "Building…" : mode === "auto" ? "Build guide" : "Continue"}</button>
        <button type="button" className="link-btn" onClick={blank}>Or start with a blank guide</button>
      </form>
    </div>
  );
}

function Wizard({ guide, setGuide, step, setStep, onFinish }: { guide: Guide; setGuide: (g: Guide) => void; step: number; setStep: (n: number) => void; onFinish: () => void }) {
  const sections = guide.sections.filter((s) => stepOf(s) === step);
  const setSection = (s: GuideSection) => setGuide({ ...guide, sections: guide.sections.map((x) => (x.id === s.id ? s : x)) });
  const remove = (id: string) => setGuide({ ...guide, sections: guide.sections.filter((x) => x.id !== id) });
  const addNote = () => setGuide({ ...guide, sections: [...guide.sections, { id: newId(), kind: step === 5 ? "questions" : step === 4 ? "views" : step === 3 ? "structure" : "text", heading: "Your notes", origin: "you", body: step === 5 ? undefined : "", items: step === 5 ? [{ text: "" }] : undefined }] });
  return (
    <div className="page">
      <p className="eyebrow">Step {step + 1} of 6</p>
      <h1 className="page-title">{STEPS[step].title}</h1>
      <ol className="stepper" aria-label="Steps">{STEPS.map((s, i) => <li key={s.key} className={i === step ? "on" : i < step ? "done" : ""}><button type="button" onClick={() => setStep(i === 0 ? 1 : i)} aria-label={s.title}>{i + 1}</button></li>)}</ol>
      {sections.length === 0 && <Empty>Nothing was found for this step. Add your own notes, or continue.</Empty>}
      {sections.map((s) => <SectionEditor key={s.id} guide={guide} onInsert={(after, n) => { const i = guide.sections.findIndex((x) => x.id === after); const list = [...guide.sections]; list.splice(i + 1, 0, n); setGuide({ ...guide, sections: list }); }} section={s} translation={guide.translation} onChange={setSection} onDelete={() => remove(s.id)} compact />)}
      <button type="button" className="btn" onClick={addNote}>Add your own {step === 5 ? "questions" : "notes"}</button>
      <div className="chapter-nav">
        <button type="button" className="btn" onClick={() => setStep(step - 1)} disabled={step <= 1}>Back</button>
        {step < 5 ? <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>Next</button> : <button type="button" className="btn primary" onClick={onFinish}>Finish guide</button>}
      </div>
    </div>
  );
}

// ---------- Editing ----------
function AutoText({ id, value, onChange, placeholder, label }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; label: string }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } }, [value]);
  return <textarea ref={ref} id={id} aria-label={label} className="input grow" rows={1} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function PassageText({ refText, translation }: { refText: string; translation: TranslationId }) {
  const { data, loading } = useAsync(() => getPassage(translation, refText), [refText, translation]);
  if (loading) return <Loading />;
  if (!data) return <p className="note warn">“{refText}” isn't a reference this app can find. Check the book, chapter and verse.</p>;
  return (
    <div className="scripture small">
      {data.parts.map((p, i) => <p key={i}>{data.parts.length > 1 && <strong>{p.label} </strong>}{p.verses.map((v) => <span key={`${v.chapter}.${v.verse}`}><sup>{v.verse}</sup>{v.text || "(not in this translation)"} </span>)}</p>)}
      <p className="fine">{translation}</p>
    </div>
  );
}

function SectionEditor({ section: s, translation, onChange, onDelete, onMove, compact, guide, onInsert }: { guide: Guide; onInsert: (after: string, s: GuideSection) => void; section: GuideSection; translation: TranslationId; onChange: (s: GuideSection) => void; onDelete: () => void; onMove?: (d: number) => void; compact?: boolean }) {
  const setItem = (i: number, patch: Partial<SectionItem>) => onChange({ ...s, items: s.items!.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const [explore, setExplore] = useState<"" | "open" | "background">("");
  const isBackground = /background to research/i.test(s.heading);
  const passages = guide.sections.flatMap((x) => (x.kind === "passage" && x.ref ? [x.ref] : []));
  const exploreJob = useJob(exploreKey(`${guide.id}:${s.id}`, s.heading));
  const [searching, setSearching] = useState(false);
  return (
    <article className={`section-card origin-card-${s.origin}`}>
      <div className="section-top">
        <input id={`h-${s.id}`} aria-label="Section heading" className="heading-input" value={s.heading} onChange={(e) => onChange({ ...s, heading: e.target.value })} />
        <div className="section-tools">
          {onMove && <><button type="button" className="icon-btn" aria-label="Move up" onClick={() => onMove(-1)}>↑</button><button type="button" className="icon-btn" aria-label="Move down" onClick={() => onMove(1)}>↓</button></>}
          <button type="button" className="icon-btn" aria-label="Remove section" onClick={onDelete}>×</button>
        </div>
      </div>
      <div className="section-meta">
        <OriginTag origin={s.origin} />
        {s.origin === "ai" && <button type="button" className="link-btn" onClick={() => onChange({ ...s, origin: "you" })}>I've checked this</button>}
      </div>
      {s.ref !== undefined && (
        <>
          {!compact && <input id={`r-${s.id}`} aria-label="Passage reference" className="input" value={s.ref} onChange={(e) => onChange({ ...s, ref: e.target.value, heading: s.heading === s.ref ? e.target.value : s.heading })} />}
          <PassageText refText={s.ref} translation={translation} />
        </>
      )}
      {s.body !== undefined && <AutoText id={`b-${s.id}`} label="Section text" value={s.body} onChange={(v) => onChange({ ...s, body: v })} placeholder="Write here" />}
      {s.items?.map((it, i) => (
        <div key={i} className="item-row">
          {s.kind === "questions" && <span className="item-num">{i + 1}.</span>}
          <div className="item-main">
            {it.ref && <p className="item-ref">{it.label && <strong>{it.label}: </strong>}<RefLink refText={it.ref} /></p>}
            {!it.ref && it.label && <p className="item-label">{it.wordId ? <a href={`#word-${it.wordId.toLowerCase()}`}>{it.label}</a> : it.personId ? <a href={`#person-${it.personId}`}>{it.label}</a> : it.label}</p>}
            {(!it.ref || it.text) && <AutoText id={`i-${s.id}-${i}`} label="Item text" value={it.text} onChange={(v) => setItem(i, { text: v })} />}
          </div>
          <button type="button" className="icon-btn small" aria-label="Remove item" onClick={() => onChange({ ...s, items: s.items!.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      {s.items && (s.kind === "questions" || s.kind === "text") && <button type="button" className="link-btn" onClick={() => onChange({ ...s, items: [...s.items!, { text: "" }] })}>Add a line</button>}
      <div className="section-explore">
        {exploreJob?.status === "done" && <button type="button" className="btn small primary" onClick={() => setExplore("open")}>AI draft ready: review</button>}
        {exploreJob?.status === "error" && <button type="button" className="btn small" onClick={() => setExplore("open")}>AI couldn't finish: see why</button>}
        {exploreJob && exploreJob.status !== "done" && exploreJob.status !== "error" && <button type="button" className="link-btn" onClick={() => setExplore("open")}>AI is working on this…</button>}
        {!exploreJob && isBackground && <button type="button" className="btn small primary" onClick={() => setExplore("background")}>Research this with AI</button>}
        {!exploreJob && <button type="button" className="link-btn" onClick={() => setExplore("open")}>Explore and expand</button>}
        {s.kind === "passage" && s.ref && <button type="button" className="link-btn" onClick={() => setSearching(true)}>Search this passage</button>}
        {s.kind === "passage" && s.ref && <a className="link-btn" href={`#${symbolsHash(s.ref)}`}>Genre and symbols</a>}
      </div>
      {searching && s.ref && (
        <Sheet wide title={`Search ${s.ref}`} onClose={() => setSearching(false)}>
          <PassageSearchBlock bare reference={s.ref} translation={translation} lens={guide.lens} target={{ guideId: guide.id, sectionId: s.id }} onAdd={(n) => { n.reduceRight((_, x) => { onInsert(s.id, x); return x; }, n[0]); setSearching(false); toast("Added below this passage"); }} />
        </Sheet>
      )}
      {explore && (
        <ExploreSheet
          where={`${guide.id}:${s.id}`}
          target={{ guideId: guide.id, sectionId: s.id, canReplace: isBackground || s.kind === "text" }}
          context={{ heading: s.heading, kind: s.kind, text: sectionText(s), refs: s.ref ? [s.ref] : passages, lens: guide.lens, translation, guideTitle: guide.title }}
          initialAsk={explore === "background" ? EXPLORE_PRESETS.find((p) => p.id === "background")!.ask : undefined}
          onClose={() => setExplore("")}
          onAdd={(n) => { onInsert(s.id, n); setExplore(""); toast("Added below this section"); }}
          onReplace={isBackground || s.kind === "text" ? (n) => { onChange({ ...s, ...n, id: s.id, heading: isBackground ? n.heading : s.heading }); setExplore(""); toast("Section updated. It's marked as an AI draft."); } : undefined}
        />
      )}
    </article>
  );
}

// ---------- Guide page: edit, read, share ----------
export function GuidePage({ id }: { id: string }) {
  const { guides } = useData();
  const guide = guides.find((g) => g.id === id);
  const [view, setView] = useState<"edit" | "read" | "share">("edit");
  const [aiOpen, setAiOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { update((d) => (d.activeGuideId === id ? d : { ...d, activeGuideId: id })); }, [id]);
  if (!guide) return <div className="page"><Empty>This guide isn't on this device. <a href="#guides">See your guides</a></Empty></div>;
  const set = (g: Guide) => saveGuide(g);
  const setSection = (s: GuideSection) => set({ ...guide, sections: guide.sections.map((x) => (x.id === s.id ? s : x)) });
  const move = (i: number, d: number) => {
    const list = [...guide.sections];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ ...guide, sections: list });
  };
  const add = (kind: GuideSection["kind"]) => {
    const section: GuideSection = kind === "passage" ? { id: newId(), kind, heading: "Passage", origin: "you", ref: "John 1:1" } : kind === "questions" ? { id: newId(), kind, heading: "Questions", origin: "you", items: [{ text: "" }] } : { id: newId(), kind: "text", heading: "Notes", origin: "you", body: "" };
    set({ ...guide, sections: [...guide.sections, section] });
  };
  return (
    <div className="page guide">
      <a className="back" href="#guides">‹ Study guides</a>
      <input id="guide-title-edit" aria-label="Guide title" className="title-input" value={guide.title} onChange={(e) => set({ ...guide, title: e.target.value })} />
      {guide.subtitle && <p className="sub">{guide.subtitle}</p>}
      <div className="two-col">
        <div><label className="label" htmlFor="gt">Translation</label><TranslationSelect localOnly id="gt" value={guide.translation} onChange={(t) => set({ ...guide, translation: t })} /></div>
        <div><label className="label" htmlFor="gl">Lens</label><LensSelect id="gl" value={guide.lens} onChange={(l) => set({ ...guide, lens: l, subtitle: `${GUIDE_FORMATS.find((f) => f.id === guide.format)?.name} · ${lensName(l)}` })} /></div>
      </div>
      <div className="segmented" role="tablist">
        {(["edit", "read", "share"] as const).map((v) => <button type="button" key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => setView(v)}>{v === "edit" ? "Edit" : v === "read" ? "Read" : "Share and export"}</button>)}
      </div>

      {view === "edit" && (
        <>
          <button type="button" className="ai-cta" onClick={() => setAiOpen(true)}><strong>Draft with AI</strong><span>Culture and idioms, theological views, questions, an outline or applications</span></button>
          <GuideExegesis guide={guide} onAdd={(n) => { const i = guide.sections.findIndex((x) => x.kind === "passage"); const list = [...guide.sections]; list.splice(i + 1, 0, ...n); set({ ...guide, sections: list }); toast("Added after the passage"); }} />
          {guide.sections.length === 0 && <Empty>This guide is empty. Add a passage below, or tap a verse in the reader and choose “Add to guide”.</Empty>}
          {guide.sections.map((s, i) => <SectionEditor key={s.id} guide={guide} onInsert={(after, n) => { const at = guide.sections.findIndex((x) => x.id === after); const list = [...guide.sections]; list.splice(at + 1, 0, n); set({ ...guide, sections: list }); }} section={s} translation={guide.translation} onChange={setSection} onDelete={() => set({ ...guide, sections: guide.sections.filter((x) => x.id !== s.id) })} onMove={(d) => move(i, d)} />)}
          <div className="action-row">
            <button type="button" className="btn small" onClick={() => add("passage")}>Add passage</button>
            <button type="button" className="btn small" onClick={() => add("text")}>Add notes</button>
            <button type="button" className="btn small" onClick={() => add("questions")}>Add questions</button>
          </div>
          <div className="danger-zone">
            {confirmDelete ? (
              <p>Delete this guide? <button type="button" className="btn small danger" onClick={() => { deleteGuide(guide.id); navigate("guides"); }}>Delete</button> <button type="button" className="btn small" onClick={() => setConfirmDelete(false)}>Keep</button></p>
            ) : <button type="button" className="link-btn" onClick={() => setConfirmDelete(true)}>Delete guide</button>}
          </div>
        </>
      )}
      {view === "read" && <GuideReader guide={guide} />}
      {view === "share" && <GuideShare guide={guide} />}
      {aiOpen && <AiDraftSheet guide={guide} onClose={() => setAiOpen(false)} onAccept={(sections) => { set({ ...guide, sections: [...guide.sections, ...sections] }); setAiOpen(false); toast("Added to the end of your guide"); }} />}
    </div>
  );
}

function GuideExegesis({ guide, onAdd }: { guide: Guide; onAdd: (s: GuideSection[]) => void }) {
  const refs = [...new Set(guide.sections.flatMap((x) => (x.kind === "passage" && x.ref ? [x.ref] : [])))];
  const [pick, setPick] = useState(refs[0] ?? "");
  const current = refs.includes(pick) ? pick : refs[0];
  if (!current) return null;
  return (
    <div className="guide-exegesis">
      {refs.length > 1 && <select aria-label="Passage for the exegesis" value={current} onChange={(e) => setPick(e.target.value)}>{refs.map((r) => <option key={r} value={r}>{r}</option>)}</select>}
      <ExegesisBlock reference={current} translation={guide.translation} lens={guide.lens} onAdd={onAdd} target={{ guideId: guide.id }} />
    </div>
  );
}

export function DraftPreview({ sections }: { sections: GuideSection[] }) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.id} className="doc-section">
          <h3>{s.heading}</h3>
          {s.body && <Paras text={s.body} />}
          {s.items && (s.kind === "questions" ? <ol>{s.items.map((it, i) => <li key={i}><RefText text={it.text} /></li>)}</ol> : <ul>{s.items.map((it, i) => <li key={i}>{it.label && <strong>{it.label}: </strong>}{it.ref && <><RefLink refText={it.ref} /> </>}<RefText text={it.text} /></li>)}</ul>)}
        </div>
      ))}
    </>
  );
}

function AiDraftSheet({ guide, onClose, onAccept }: { guide: Guide; onClose: () => void; onAccept: (s: GuideSection[]) => void }) {
  const mode = useAiMode();
  const [custom, setCustom] = useState("");
  const key = draftKey(guide);
  const job = useJob(key);
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  const run = (request: string) => enqueueJob({ kind: "draft", key, title: `Draft for "${guide.title}"`, payload: { guide, request }, target: { guideId: guide.id } });
  const result = job?.status === "done" ? (job.result as GuideSection[]) : null;
  return (
    <Sheet title="Draft with AI" onClose={onClose}>
      {mode === null && <Loading />}
      {mode === "none" && <p className="note">The AI assistant isn't set up in this copy of the app. See Library for how to turn it on.</p>}
      {mode && mode !== "none" && !job && (
        <>
          <p className="fine">The AI sees this guide's passages and the app's reference data. Anything it writes is labeled as an AI draft until you mark it checked.</p>
          <div className="tool-list">{guideRequestPresets.map((p) => <button type="button" key={p.id} className="tool-row" onClick={() => run(p.ask)}><strong>{p.label}</strong></button>)}</div>
          <label className="label" htmlFor="ai-custom">Or ask for something else</label>
          <textarea id="ai-custom" className="input" rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Write a closing prayer based on these passages" />
          <button type="button" className="btn primary" disabled={!custom.trim()} onClick={() => run(custom)}>Draft it</button>
        </>
      )}
      {active && <JobProgress job={job} />}
      {job?.status === "error" && <JobError job={job} />}
      {result && (
        <>
          <DraftPreview sections={result} />
          <div className="action-row">
            <button type="button" className="btn primary" onClick={() => { removeJob(job!.id); onAccept(result); }}>Add to guide</button>
            <button type="button" className="btn" onClick={() => removeJob(job!.id)}>Discard</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

export function GuideDocument({ guide }: { guide: Guide }) {
  const { data, loading, error } = useAsync(() => resolveGuide(guide), [guide]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorNote error={error} />;
  return (
    <div className="doc">
      <h1>{data.title}</h1>
      {data.subtitle && <p className="sub">{data.subtitle}</p>}
      {data.sections.map((s) => (
        <section key={s.id} className="doc-section">
          <h2>{s.heading}</h2>
          {s.origin !== "you" && <p className={`origin-line origin-${s.origin}`}>{ORIGIN_LABEL[s.origin]}</p>}
          {s.body && <Paras text={s.body} />}
          {s.verses && (
            <blockquote className="scripture small">
              {s.verses.map((v) => <span key={`${v.chapter}.${v.verse}`}><sup>{v.verse}</sup>{v.text || "(not in this translation)"} </span>)}
              <cite>{s.ref} ({data.translation})</cite>
            </blockquote>
          )}
          {s.items && (s.kind === "questions" ? (
            <ol>{s.items.map((it, i) => <li key={i}><RefText text={it.text} /></li>)}</ol>
          ) : (
            <ul className={s.kind === "structure" ? "structure" : ""}>
              {s.items.map((it, i) => (
                <li key={i} style={{ marginLeft: (it.level ?? 0) * 16 }}>
                  {it.label && <strong>{it.wordId ? <a href={`#word-${it.wordId.toLowerCase()}`}>{it.label}</a> : it.personId ? <a href={`#person-${it.personId}`}>{it.label}</a> : it.label}{it.text || it.ref ? ": " : ""}</strong>}
                  {it.ref && <><RefLink refText={it.ref} />{it.quote ? `: ${it.quote}` : ""}</>}
                  <RefText text={it.text} />
                </li>
              ))}
            </ul>
          ))}
        </section>
      ))}
      <p className="fine doc-foot">{data.notice}</p>
    </div>
  );
}

const GuideReader = ({ guide }: { guide: Guide }) => <GuideDocument guide={guide} />;

function GuideShare({ guide }: { guide: Guide }) {
  const [link, setLink] = useState("");
  const slug = useMemo(() => guide.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "study-guide", [guide.title]);
  useEffect(() => { let live = true; encodeForLink(guide).then((code) => live && setLink(`${appBase()}#shared-${code}`)).catch(() => live && setLink("")); return () => { live = false; }; }, [guide]);
  const embed = useMemo(() => (link ? `<iframe src="${appBase()}embed.html#${link.split("#")[1].replace("shared-", "guide-")}" title="${guide.title.replace(/"/g, "&quot;")}" style="width:100%;height:600px;border:0" loading="lazy"></iframe>` : ""), [link, guide.title]);
  const doExport = async (kind: "md" | "html" | "txt" | "doc" | "json" | "copy") => {
    const r = await resolveGuide(guide);
    if (kind === "copy") return copyText(guideToText(r), "Guide copied");
    if (kind === "md") return saveFile(`${slug}.md`, guideToMarkdown(r), "text/markdown");
    if (kind === "html") return saveFile(`${slug}.html`, guideToHtml(r), "text/html");
    if (kind === "txt") return saveFile(`${slug}.txt`, guideToText(r), "text/plain");
    if (kind === "doc") return saveFile(`${slug}.docx`, new Blob([guideToDocx(r) as BlobPart], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    return saveFile(`${slug}.json`, JSON.stringify(guide, null, 2), "application/json");
  };
  return (
    <div className="prose">
      <h3>Export</h3>
      <div className="action-row">
        <button type="button" className="btn small primary" onClick={() => doExport("copy")}>Copy text</button>
        <button type="button" className="btn small" onClick={() => doExport("doc")}>Word (.docx) with footnotes</button>
        <button type="button" className="btn small" onClick={() => doExport("html")}>HTML</button>
        <button type="button" className="btn small" onClick={() => doExport("md")}>Markdown</button>
        <button type="button" className="btn small" onClick={() => doExport("txt")}>Plain text</button>
        <button type="button" className="btn small" onClick={() => doExport("json")}>Guide file</button>
        {!IS_ARTIFACT && <button type="button" className="btn small" onClick={() => window.print()}>Print or PDF</button>}
      </div>
      {IS_ARTIFACT && <p className="fine">Printing works once the app is on your own website.</p>}
      <h3>Share a link</h3>
      <p>The whole guide travels inside the link, so anyone who opens it gets a copy they can read and save.</p>
      {link ? <><textarea id="share-link" aria-label="Share link" className="input mono" rows={3} readOnly value={link} onFocus={(e) => e.currentTarget.select()} /><button type="button" className="btn small" onClick={() => copyText(link, "Link copied")}>Copy link</button>{link.length > 8000 && <p className="fine">This link is long, and some apps may cut it off. For a long guide, share the guide file instead.</p>}</> : <Loading />}
      <h3>Embed on another site</h3>
      {IS_ARTIFACT ? <p className="fine">Embedding works once the app is on your own website. Other websites can't frame this preview.</p> : (
        <>
          <p>Paste this into any web page to show this guide.</p>
          <textarea id="embed-code" aria-label="Embed code" className="input mono" rows={4} readOnly value={embed} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn small" onClick={() => copyText(embed, "Embed code copied")}>Copy embed code</button>
        </>
      )}
    </div>
  );
}

export function SharedGuidePage({ code }: { code: string }) {
  const { data, loading, error } = useAsync(async () => sanitizeGuide(await decodeFromLink(code)), [code]);
  if (loading) return <div className="page"><Loading label="Opening shared guide" /></div>;
  if (error || !data) return <div className="page"><p className="note warn">This link doesn't contain a readable guide. It may have been cut off when it was shared.</p></div>;
  return (
    <div className="page guide">
      <div className="note">
        <p>Someone shared this study guide with you.</p>
        <button type="button" className="btn small primary" onClick={() => { const copy = { ...data, id: newId("g") }; saveGuide(copy); navigate(`guide-${copy.id}`); }}>Save a copy to edit</button>
      </div>
      <GuideDocument guide={data} />
    </div>
  );
}
export { TRANSLATIONS };
