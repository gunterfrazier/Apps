import { useEffect, useMemo, useRef, useState } from "react";
import type { TranslationId } from "../../core/bible";
import { checkReferences, type AiInsight } from "../../core/ai";
import type { LensId } from "../../core/content";
import { lensName, newId, type Guide, type GuideSection } from "../../core/guide";
import { getInsights } from "../../core/insights";
import { detectAi, type AiMode } from "../ai-client";
import { enqueueJob, insightKey, markSeen, removeJob, useJob } from "../ai-jobs";
import { saveGuide, setPref, toast, useData } from "../store";
import { WritersPreview } from "./writers";
import { ExegesisBlock, ExploreSheet, JobError, JobProgress } from "./ai-explore";
import { PassageSearchBlock } from "./passage-search";
import { Empty, ErrorNote, Loading, LensSelect, OriginTag, RefLink, RefText, Tag, useAsync } from "../ui";

/** Adds sections to the guide being worked on, starting one if needed. */
export function addSectionsToGuide(sections: GuideSection[], title: string, guides: Guide[], activeId: string | null, translation: TranslationId, lens: LensId) {
  const active = guides.find((g) => g.id === activeId);
  if (active) {
    saveGuide({ ...active, sections: [...active.sections, ...sections] });
    toast(`Added to "${active.title}"`);
  } else {
    const now = new Date().toISOString();
    saveGuide({ id: newId("g"), title, format: "inductive", lens, translation, createdAt: now, updatedAt: now, sections, subtitle: "Started from the reader" });
    toast("Started a new guide. Find it under Guides.");
  }
}

function LinkList({ items }: { items: { ref: string; shared?: string }[] }) {
  return (
    <ul className="link-list">
      {items.map((x) => <li key={x.ref}><RefLink refText={x.ref} />{x.shared && <span className="shared">“{x.shared}”</span>}</li>)}
    </ul>
  );
}

export function InsightsPanel({ reference, translation }: { reference: string; translation: TranslationId }) {
  const { prefs, guides, activeGuideId } = useData();
  const lens = prefs.lens;
  const [explore, setExplore] = useState<{ heading: string; kind: string; text: string } | null>(null);
  const { data, loading, error } = useAsync(() => getInsights(reference), [reference]);
  if (loading) return <Loading label="Gathering insights" />;
  if (error || !data) return <ErrorNote error={error} />;
  const linkCount = data.quotes.length + data.quotedBy.length + data.parallels.length + data.possibleAllusions.length;
  const addLinks = () => {
    const items = [
      ...data.quotes.map((q) => ({ label: "Quotes", ref: q.ref, text: "" })),
      ...data.quotedBy.map((q) => ({ label: "Quoted in", ref: q.ref, text: "" })),
      ...data.parallels.map((q) => ({ label: "Parallel wording", ref: q.ref, text: "" })),
      ...data.possibleAllusions.map((q) => ({ label: "Possible link", ref: q.ref, text: "" })),
    ];
    addSectionsToGuide([{ id: newId(), kind: "crossrefs", heading: `Quoted and referenced: ${data.reference}`, origin: "assembled", items }], data.reference, guides, activeGuideId, translation, lens);
  };
  const addConfessions = () =>
    addSectionsToGuide([{ id: newId(), kind: "views", heading: `Cited in historic confessions: ${data.reference}`, origin: "assembled", items: data.confessions.map((c) => ({ label: `${c.docName} (${c.year}) ${c.label}`, text: c.text })) }], data.reference, guides, activeGuideId, translation, lens);

  return (
    <div className="insights">
      <label className="field-inline" htmlFor="insight-lens">Theological lens <LensSelect id="insight-lens" value={lens} onChange={(l) => setPref("lens", l)} /></label>
      <PassageSearchBlock reference={data.reference} translation={translation} lens={lens} onAdd={(n) => addSectionsToGuide(n, data.reference, guides, activeGuideId, translation, lens)} />
      <AiInsightBlock reference={data.reference} translation={translation} lens={lens} />
      <ExegesisBlock compact reference={data.reference} translation={translation} lens={lens} onAdd={(n) => addSectionsToGuide(n, data.reference, guides, activeGuideId, translation, lens)} />
      {explore && <ExploreSheet where={data.reference} context={{ ...explore, refs: [data.reference], lens, translation }} onClose={() => setExplore(null)} onAdd={(n) => { addSectionsToGuide([n], data.reference, guides, activeGuideId, translation, lens); setExplore(null); }} />}

      <section>
        <div className="sec-head"><h3>Quoted and referenced</h3><span className="sec-actions">{linkCount > 0 && <button type="button" className="link-btn" onClick={() => setExplore({ heading: `Quoted and referenced: ${data.reference}`, kind: "crossrefs", text: [...data.quotes, ...data.quotedBy, ...data.parallels, ...data.possibleAllusions].map((q) => q.ref).join("; ") })}>Explore</button>}{linkCount > 0 && <button type="button" className="link-btn" onClick={addLinks}>Add to guide</button>}</span></div>
        {data.quotes.length > 0 && <><h4>This passage quotes</h4><LinkList items={data.quotes} /></>}
        {data.quotedBy.length > 0 && <><h4>Quoted in</h4><LinkList items={data.quotedBy} /></>}
        {data.parallels.length > 0 && <><h4>Parallel wording</h4><LinkList items={data.parallels} /></>}
        {data.possibleAllusions.length > 0 && (
          <>
            <h4>Possible allusions or links</h4>
            <p className="fine">Strong cross-references between the Testaments with no matching wording. Treat these as leads to check.</p>
            <LinkList items={data.possibleAllusions.slice(0, 8)} />
          </>
        )}
        {!linkCount && <Empty>No direct quotations were found for this passage.</Empty>}
        <p className="fine">Quotations and parallels are found by matching the wording of OpenBible.info cross-references across translations, so you can check each one by its shared words. A loose paraphrase can be missed.</p>
      </section>

      <section>
        <div className="sec-head"><h3>Cited in historic confessions</h3><span className="sec-actions">{data.confessions.length > 0 && <button type="button" className="link-btn" onClick={() => setExplore({ heading: `Confessions on ${data.reference}`, kind: "views", text: data.confessions.map((c) => `${c.docName} ${c.label}: ${c.text}`).join("\n") })}>Explore</button>}{data.confessions.length > 0 && <button type="button" className="link-btn" onClick={addConfessions}>Add to guide</button>}</span></div>
        {data.confessions.map((c, i) => (
          <details key={i} className="doctrine">
            <summary>{c.docName} {c.label}{c.title ? `: ${c.title}` : ""}</summary>
            <p className="fine">{c.tradition}, {c.year}</p>
            <p>{c.text}{c.text.length >= 420 ? "…" : ""}</p>
          </details>
        ))}
        {!data.confessions.length && <Empty>The confessions in this app don't cite this passage.</Empty>}
        <p className="fine">Proof texts listed in the Westminster Confession and Larger Catechism, the Heidelberg Catechism and a Baptist Catechism. This open data covers Reformed and Baptist documents only. Ask the AI about other traditions.</p>
      </section>

      <WritersPreview reference={data.reference} />

      <section>
        <div className="sec-head"><h3>Topics citing this passage</h3>{data.topics.length > 0 && <button type="button" className="link-btn" onClick={() => setExplore({ heading: `Topics in ${data.reference}`, kind: "text", text: data.topics.map((t) => t.name).join(", ") })}>Explore</button>}</div>
        {data.topics.length ? <div className="chips">{data.topics.map((t) => <a key={t.slug} className="chip" href={`#topic-${t.slug}`}>{t.name}</a>)}</div> : <Empty>Nave's Topical Bible doesn't cite this passage directly.</Empty>}
        <p className="fine">From Nave's Topical Bible (1896).</p>
      </section>
    </div>
  );
}

function AiInsightBlock({ reference, translation, lens }: { reference: string; translation: TranslationId; lens: LensId }) {
  const [mode, setMode] = useState<AiMode | null>(null);
  const { guides, activeGuideId } = useData();
  const key = insightKey(reference, translation, lens);
  const job = useJob(key);
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  useEffect(() => { let live = true; detectAi().then((m) => live && setMode(m)); return () => { live = false; }; }, []);
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  const run = () => enqueueJob({ kind: "insight", key, title: `Culture and theology: ${reference}`, payload: { reference, translation, lens } });

  if (mode === null) return null;
  if (mode === "none") return <p className="note">Culture, idioms, the first audience and theological readings come from the AI assistant, which isn't available in this copy of the app. The sections below come from cited sources.</p>;
  return (
    <section className="ai-block">
      <div className="sec-head">
        <h3>Culture, idioms and theology</h3>
        {!job && <button type="button" className="btn primary small" onClick={run}>Explain with AI</button>}
        {job?.status === "done" && <button type="button" className="link-btn" onClick={() => removeJob(job.id)}>Clear</button>}
      </div>
      {!job && <p className="fine">Drafts how the first audience heard this, idioms a modern reader may miss, how {lens === "all" ? "traditions read" : `the ${lensName(lens)} tradition reads`} it, doctrines it's used to support, and what each claim rests on. The app stores no written notes on these, so this is always a draft to check.{mode === "viewer" ? " It uses your Claude account." : ""}</p>}
      {active && <JobProgress job={job} />}
      {job?.status === "error" && <JobError job={job} />}
      {job?.status === "done" && <AiInsightView insight={job.result} reference={reference} onAdd={(sections) => addSectionsToGuide(sections, reference, guides, activeGuideId, translation, lens)} lens={lens} />}
    </section>
  );
}

const Basis = ({ text }: { text: string }) => (text ? <span className="basis">Rests on: <RefText text={text} /></span> : null);

export function AiInsightView({ insight, reference, onAdd, lens }: { insight: AiInsight; reference: string; onAdd: (s: GuideSection[]) => void; lens: LensId }) {
  const allText = useMemo(() => JSON.stringify(insight).replace(/\\n/g, " "), [insight]);
  const { data: checks } = useAsync(async () => {
    const text = await checkReferences(allText);
    const named = await checkReferences(insight.intertext.map((x) => x.reference).join("; "));
    return [...text, ...named];
  }, [allText]);
  const bad = [...new Set((checks ?? []).filter((c) => !c.ok).map((c) => c.ref))];
  const withBasis = (t: string, b: string) => (b ? `${t} (Rests on: ${b})` : t);
  const toSections = (): GuideSection[] => {
    const out: GuideSection[] = [{ id: newId(), kind: "text", heading: `Background: ${reference}`, origin: "ai", body: [insight.summary, insight.writerAndAudience].filter(Boolean).join("\n\n"), items: [...insight.culture.map((c) => ({ label: c.point, text: withBasis(c.detail, c.basis) })), ...insight.idioms.map((i) => ({ label: `Idiom: ${i.phrase}`, text: withBasis(`${i.meaning} ${i.modernMisreading}`.trim(), i.basis) }))] }];
    if (insight.lensReading || insight.otherReadings.length || insight.doctrines.length)
      out.push({ id: newId(), kind: "views", heading: `Theological readings: ${reference}`, origin: "ai", body: insight.lensReading, items: [...insight.otherReadings.map((o) => ({ label: o.tradition, text: o.reading })), ...insight.doctrines.map((d) => ({ label: `${d.doctrine} (${d.traditions})`, text: d.howUsed }))] });
    if (insight.intertext.length) out.push({ id: newId(), kind: "crossrefs", heading: `Connections: ${reference}`, origin: "ai", items: insight.intertext.map((x) => ({ label: x.relation, ref: x.reference, text: x.note ? ` ${x.note}` : "" })) });
    return out;
  };
  return (
    <div>
      <OriginTag origin="ai" />
      {bad.length > 0 && <p className="note warn">These references don't exist in the Bible text, so the AI got them wrong: {bad.join(", ")}.</p>}
      <p><RefText text={insight.summary} /></p>
      {insight.writerAndAudience && <><h4>Writer and first audience</h4><p><RefText text={insight.writerAndAudience} /></p></>}
      {insight.culture.length > 0 && <><h4>Culture</h4>{insight.culture.map((c, i) => <p key={i}><strong>{c.point}. </strong><RefText text={c.detail} /> <Basis text={c.basis} /></p>)}</>}
      {insight.idioms.length > 0 && <><h4>Idioms</h4>{insight.idioms.map((c, i) => <p key={i}><strong>{c.phrase}. </strong><RefText text={c.meaning} /> {c.modernMisreading && <em><RefText text={c.modernMisreading} /></em>} <Basis text={c.basis} /></p>)}</>}
      {insight.lensReading && <><h4>{lens === "all" ? "Broadly shared" : `${lensName(lens)} reading`}</h4><p><RefText text={insight.lensReading} /></p></>}
      {insight.otherReadings.length > 0 && <><h4>Other readings</h4>{insight.otherReadings.map((c, i) => <p key={i}><strong>{c.tradition}. </strong><RefText text={c.reading} /></p>)}</>}
      {insight.doctrines.length > 0 && <><h4>Doctrines it is used to support</h4>{insight.doctrines.map((c, i) => <p key={i}><strong>{c.doctrine}</strong> ({c.traditions}). <RefText text={c.howUsed} /></p>)}</>}
      {insight.intertext.length > 0 && <><h4>Connections to other Scripture</h4><ul className="link-list">{insight.intertext.map((x, i) => <li key={i}><RefLink refText={x.reference} /> <Tag>{x.relation}</Tag> <span className="shared"><RefText text={x.note} /></span></li>)}</ul></>}
      {insight.uncertain.length > 0 && <><h4>Uncertain or debated</h4><ul>{insight.uncertain.map((u, i) => <li key={i}><RefText text={u} /></li>)}</ul></>}
      <button type="button" className="btn small" onClick={() => onAdd(toSections())}>Add to guide</button>
    </div>
  );
}
