import { useEffect, useMemo, useState, type ReactNode } from "react";
import { checkReferences, type TopicReading } from "../../core/ai";
import type { TranslationId } from "../../core/bible";
import type { LensId } from "../../core/content";
import { lensName, newId, type GuideSection, type SectionItem } from "../../core/guide";
import { queryPattern, searchPassage, type PassageSearch } from "../../core/passage-search";
import type { CheckedSource } from "../../core/research";
import { enqueueJob, markSeen, removeJob, topicKey, useJob, type JobTarget } from "../ai-jobs";
import { ErrorNote, Loading, OriginTag, Paras, RefLink, RefText, useAsync } from "../ui";
import { CheckedSources, JobError, JobProgress, useAiMode } from "./ai-explore";

function Marked({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    const re = queryPattern(query);
    if (!re) return [text];
    const global = new RegExp(re.source, "giu");
    const out: ReactNode[] = [];
    let last = 0, n = 0;
    for (const m of text.matchAll(global)) {
      const at = m.index ?? 0;
      out.push(text.slice(last, at), <mark key={n++}>{m[0]}</mark>);
      last = at + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, query]);
  return <>{parts}</>;
}

const LensTag = ({ on }: { on: boolean }) => (on ? <span className="lens-tag">Your lens</span> : null);

/** The checked findings, as sections for a guide. */
function findingsToSections(s: PassageSearch): GuideSection[] {
  const items: SectionItem[] = [
    ...s.verses.map((v) => ({ ref: v.ref, text: "" })),
    ...s.originals.map((o) => ({ label: `${o.lemma} (${o.translit})`, wordId: o.strong, text: `${o.meaning}. ${o.uses.map((u) => `${u.ref} “${u.rendered}”`).join("; ")}` })),
    ...s.confessions.map((c) => ({ label: `${c.docName} ${c.label}`, text: c.text })),
    ...s.writers.map((w) => ({ label: `${w.writer}, ${w.title}`, text: w.snippet })),
  ];
  return [{ id: newId(), kind: "text", heading: `“${s.query}” in ${s.reference}`, origin: "assembled", items }];
}

function Findings({ s, onAdd }: { s: PassageSearch; onAdd: (n: GuideSection[]) => void }) {
  const here = s.originals.filter((o) => o.how === "here" || o.how === "asked");
  const likely = s.originals.filter((o) => o.how === "likely");
  const lexicon = s.originals.filter((o) => o.how === "lexicon");
  const anything = s.direct || lexicon.length > 0 || s.topics.length > 0 || s.terms.length > 0 || s.confessions.length > 0 || s.writers.length > 0;
  return (
    <div className="ps-found">
      {s.verses.length > 0
        ? <p className="ps-count">In {s.verses.length} of {s.verseCount} verse{s.verseCount === 1 ? "" : "s"} ({s.translation})</p>
        : s.originals.some((o) => o.how === "asked") ? null : <p className="note">“{s.query}” doesn't appear in {s.reference} in {s.translation}.{here.length + likely.length > 0 ? " The Hebrew or Greek below does stand behind this text." : " No Hebrew or Greek word here is translated that way in the tagged text, so any connection to this topic is a matter of interpretation, not wording."}</p>}
      {s.verses.map((v) => <p key={v.ref} className="ps-verse"><RefLink refText={v.ref} /> <Marked text={v.text} query={s.query} /></p>)}

      {here.length > 0 && (
        <div className="ps-group">
          <h4>Hebrew and Greek behind it</h4>
          {here.map((o) => (
            <div key={o.strong} className="ps-word">
              <a href={`#word-${o.strong.toLowerCase()}`}><strong>{o.lemma}</strong></a> <span className="fine">{o.translit} · {o.strong}</span>{o.meaning && <> · {o.meaning}</>}
              <p className="uses">{o.uses.map((u, i) => <span key={i}>{i > 0 && "; "}<RefLink refText={u.ref} /> “{u.rendered}”</span>)}</p>
            </div>
          ))}
          {here.some((o) => o.uses.length > 1) && <p className="fine">The same word can carry different senses from verse to verse. The list shows where each one occurs, not what it means there.</p>}
        </div>
      )}
      {likely.length > 0 && (
        <div className="ps-group">
          <h4>Likely behind it</h4>
          <p className="fine">Your translation uses “{s.query}” in these verses, and the lexicon lists it as a translation of these words. The word tags can't confirm the exact match.</p>
          {likely.map((o) => (
            <div key={o.strong} className="ps-word">
              <a href={`#word-${o.strong.toLowerCase()}`}><strong>{o.lemma}</strong></a> <span className="fine">{o.translit} · {o.strong}</span>{o.meaning && <> · {o.meaning}</>}
              <p className="uses">{o.uses.slice(0, 12).map((u, i) => <span key={i}>{i > 0 && "; "}<RefLink refText={u.ref} /> “{u.rendered}”</span>)}</p>
            </div>
          ))}
        </div>
      )}
      {(here.length > 0 || likely.length > 0) && <p className="fine">English in quotes is the word-by-word gloss, which can differ from your translation.</p>}
      {lexicon.length > 0 && (
        <details className="doctrine">
          <summary>Possibly related words ({lexicon.length})</summary>
          <p className="fine">The lexicon lists “{s.query}” as one possible translation of these words, though they read differently here. Many won't bear on your topic.</p>
          {lexicon.slice(0, 12).map((o) => (
            <div key={o.strong} className="ps-word">
              <a href={`#word-${o.strong.toLowerCase()}`}><strong>{o.lemma}</strong></a> <span className="fine">{o.translit} · {o.strong}</span>
              <p className="uses">{o.uses.slice(0, 6).map((u, i) => <span key={i}>{i > 0 && "; "}<RefLink refText={u.ref} /> “{u.rendered}”</span>)}</p>
            </div>
          ))}
        </details>
      )}
      {(s.topics.length > 0 || s.terms.length > 0) && (
        <div className="ps-group">
          <h4>Topics and terms</h4>
          <ul className="fine-list">
            {s.topics.map((t) => <li key={t.slug}><a href={`#topic-${t.slug}`}>{t.name}</a> (Nave's Topical Bible)</li>)}
            {s.terms.map((t) => <li key={t.id}><a href={`#term-${t.id}`}>{t.term}</a> (glossary)</li>)}
          </ul>
        </div>
      )}
      {s.confessions.length > 0 && (
        <div className="ps-group">
          <h4>Confessions that cite this and mention it</h4>
          {s.confessions.map((c, i) => <p key={i} className="fine"><strong>{c.docName} {c.label}</strong><LensTag on={c.fromLens} /> <Marked text={c.text.length > 320 ? `${c.text.slice(0, 320)}…` : c.text} query={s.query} /></p>)}
        </div>
      )}
      {s.writers.length > 0 && (
        <div className="ps-group">
          <h4>Historic writers on these verses</h4>
          {s.writers.map((w, i) => <p key={i} className="fine"><a href={`#writer-${w.writerId}`}><strong>{w.writer}</strong></a>{w.year ? ` (${w.year})` : ""}, {w.title}<LensTag on={w.fromLens} /><br /><Marked text={w.snippet} query={s.query} /></p>)}
          {s.writerTotal > s.writers.length && <p className="fine">Showing one passage per writer, out of {s.writerTotal}.</p>}
        </div>
      )}
      {anything && <button type="button" className="btn small" onClick={() => onAdd(findingsToSections(s))}>Add these findings to guide</button>}
    </div>
  );
}

function readingToSections(r: { reading: TopicReading; checked: CheckedSource[] }, query: string, reference: string, lens: LensId): GuideSection[] {
  const name = lens === "all" ? "shared reading" : `${lensName(lens)} lens`;
  const t = r.reading;
  const body = [t.definition, t.conceptual, t.fromText && `From the text. ${t.fromText}`, t.fromFramework && `From the wider theology. ${t.fromFramework}`].filter(Boolean).join("\n\n");
  const out: GuideSection[] = [{ id: newId(), kind: "views", heading: `“${query}” in ${reference} (${name})`, origin: "ai", body, items: [
    ...t.occurrences.map((o) => ({ ref: o.ref, label: o.word, text: `${o.sense} ${o.reading}`.trim() })),
    ...t.doctrines.map((d) => ({ label: d.name, text: d.connection })),
  ] }];
  if (t.otherReadings.length) out.push({ id: newId(), kind: "views", heading: "How others read it", origin: "ai", items: t.otherReadings.map((o) => ({ label: o.tradition, text: o.reading })) });
  const kept = r.checked.filter((c) => c.ok).map((c) => ({ label: c.label, text: c.detail ? `“${c.detail}”` : "" }));
  if (t.debated.length || kept.length) out.push({ id: newId(), kind: "text", heading: "Debated, and sources confirmed", origin: "ai", items: [...t.debated.map((text) => ({ text })), ...kept] });
  return out;
}

export function TopicReadingView({ r, query, reference, lens, onAdd }: { r: { reading: TopicReading; checked: CheckedSource[]; outside: string[] }; query: string; reference: string; lens: LensId; onAdd: (n: GuideSection[]) => void }) {
  const t = r.reading;
  const text = JSON.stringify({ ...t, sources: [] }).replace(/\\n/g, " ");
  const refs = useAsync(() => checkReferences(text), [text]);
  const bad = [...new Set((refs.data ?? []).filter((c) => !c.ok).map((c) => c.ref))];
  const title = lens === "all" ? "Shared reading" : `${lensName(lens)} reading`;
  return (
    <div className="exegesis">
      <OriginTag origin="ai" />
      {bad.length > 0 && <p className="note warn">These references don't exist in the Bible text, so the AI got them wrong: {bad.join(", ")}.</p>}
      {r.outside.length > 0 && <p className="note warn">The AI commented on verses outside your selection, so check them: {r.outside.join(", ")}.</p>}
      <h4>{title} of “{query}”</h4>
      {t.definition && <Paras text={t.definition} />}
      {t.conceptual && <><h4>No direct match: how the idea is connected</h4><Paras text={t.conceptual} /></>}
      {t.occurrences.length > 0 && <><h4>In these verses</h4>{t.occurrences.map((o, i) => <p key={i}><RefLink refText={o.ref} /> {o.word && <strong>{o.word}. </strong>}{o.sense && <em><RefText text={o.sense} /> </em>}<RefText text={o.reading} /></p>)}</>}
      {t.fromText && <><h4>What the text itself establishes</h4><Paras text={t.fromText} /></>}
      {t.fromFramework && <><h4>What the tradition brings to it</h4><Paras text={t.fromFramework} /></>}
      {t.doctrines.length > 0 && <><h4>Doctrines</h4>{t.doctrines.map((d, i) => <p key={i}><strong>{d.name}.</strong> <RefText text={d.connection} /></p>)}</>}
      {t.otherReadings.length > 0 && <><h4>How others read it</h4>{t.otherReadings.map((o, i) => <p key={i}><strong>{o.tradition}.</strong> <RefText text={o.reading} /></p>)}</>}
      {t.debated.length > 0 && <><h4>Still debated</h4><ul>{t.debated.map((d, i) => <li key={i}><RefText text={d} /></li>)}</ul></>}
      <CheckedSources list={r.checked} />
      <button type="button" className="btn small primary" onClick={() => onAdd(readingToSections(r, query, reference, lens))}>Add this reading to guide</button>
    </div>
  );
}

function LensReading({ s, lens, target, onAdd }: { s: PassageSearch; lens: LensId; target?: JobTarget; onAdd: (n: GuideSection[]) => void }) {
  const mode = useAiMode();
  const key = topicKey(s.reference, s.query, s.translation, lens);
  const job = useJob(key);
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  if (mode === null) return null;
  if (mode === "none") return <p className="fine">The reading from your lens comes from the AI assistant, which isn't available in this copy of the app.</p>;
  const label = lens === "all" ? "the reading traditions share" : `the ${lensName(lens)} lens`;
  const run = () => enqueueJob({ kind: "topic", key, title: `“${s.query}” in ${s.reference} (${lens === "all" ? "shared reading" : lensName(lens)})`, payload: { reference: s.reference, query: s.query, translation: s.translation, lens }, target });
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  return (
    <div className="ps-ai ai-block">
      {!job && <><button type="button" className="btn primary small" onClick={run}>Read this through {label}</button><p className="fine">An AI draft of how {lens === "all" ? "traditions understand" : "this tradition understands"} “{s.query}” in these verses, keeping what the text says apart from what the tradition brings. The app checks its references and quotes.{s.direct ? "" : " Because there's no direct match, it will treat this as a connection of ideas, not as something the verses say outright."}</p></>}
      {active && <JobProgress job={job} />}
      {job?.status === "error" && <JobError job={job} />}
      {job?.status === "done" && <><TopicReadingView r={job.result} query={s.query} reference={s.reference} lens={lens} onAdd={onAdd} /><button type="button" className="link-btn" onClick={() => removeJob(job.id)}>Clear</button></>}
    </div>
  );
}

/** Search box for selected verses. The first part is checked data and needs no AI. */
export function PassageSearchBlock({ reference, translation, lens, onAdd, target, bare }: { reference: string; translation: TranslationId; lens: LensId; onAdd: (n: GuideSection[]) => void; target?: JobTarget; bare?: boolean }) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => { setQuery(""); setDraft(""); }, [reference]);
  const { data, loading, error } = useAsync(() => (query ? searchPassage(reference, query, translation, lens) : Promise.resolve(null)), [reference, query, translation, lens]);
  const tooShort = query.length > 0 && query.length < 2;
  return (
    <section className={`ps-block ${bare ? "bare" : ""}`}>
      {!bare && <h3>Search this passage</h3>}
      <form className="ps-form" onSubmit={(e) => { e.preventDefault(); setQuery(draft.trim()); }}>
        <input className="input" aria-label={`Word or topic to find in ${reference}`} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A word or topic, like righteousness" maxLength={80} />
        <button type="submit" className="btn" disabled={draft.trim().length < 2}>Search</button>
      </form>
      {!query && <p className="fine">Finds it in {reference}, including the Hebrew or Greek behind it, then reads it through your lens if you ask. You can also type a Strong's number like G26, or an original word.</p>}
      {tooShort && <p className="fine">Type at least two letters.</p>}
      {query && loading && <Loading label="Searching" />}
      {query && error && <ErrorNote error={error} />}
      {query && data && (
        <>
          <Findings s={data} onAdd={onAdd} />
          <LensReading s={data} lens={lens} target={target} onAdd={onAdd} />
        </>
      )}
    </section>
  );
}
