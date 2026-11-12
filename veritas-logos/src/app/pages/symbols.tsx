import { useEffect, useMemo, useState, type ReactNode } from "react";
import { checkReferences, type GenreReading, type SymbolGrade, type SymbolReading } from "../../core/ai";
import { echoCompare, findEchoes, type EchoGrade, type EchoResult, type EchoSearch, type EchoTerm } from "../../core/echoes";
import { lensName, newId, type GuideSection } from "../../core/guide";
import type { LensId } from "../../core/content";
import { queryPattern } from "../../core/passage-search";
import { parseReference } from "../../core/references";
import type { CheckedSource } from "../../core/research";
import { styleProfile, type StyleProfile } from "../../core/style";
import { enqueueJob, genreKey, markSeen, removeJob, symbolsKey, useJob } from "../ai-jobs";
import { hashForReference } from "../routes";
import { navigate, setPref, toast, useData } from "../store";
import { ErrorNote, LensSelect, Loading, OriginTag, Paras, RefLink, RefText, Sheet, Tag, useAsync } from "../ui";
import { CheckedSources, JobError, JobProgress, useAiMode } from "./ai-explore";
import { addSectionsToGuide } from "./insights";
import { symbolsHash } from "./symbols-link";


const ECHO_GRADE: Record<EchoGrade, { label: string; tone: string }> = {
  both: { label: "Shared wording and a recorded link", tone: "strong" },
  wording: { label: "Shared wording", tone: "strong" },
  crossref: { label: "Recorded link", tone: "mid" },
  spread: { label: "Spread across the chapter", tone: "low" },
};
const SYMBOL_GRADE: Record<SymbolGrade, { label: string; note: string; tone: string }> = {
  wording: { label: "Shared wording", note: "Checked by the app", tone: "strong" },
  crossref: { label: "Recorded cross-reference", note: "Checked by the app", tone: "strong" },
  theme: { label: "Shared theme", note: "AI judgment", tone: "mid" },
  tradition: { label: "Interpretive tradition", note: "Attributed by the AI", tone: "mid" },
  speculative: { label: "Speculative", note: "Thinly supported", tone: "low" },
};
const GradeTag = ({ tone, children }: { tone: string; children: ReactNode }) => <span className={`grade grade-${tone}`}>{children}</span>;

// ---------- Style ----------
function StyleCounts({ s }: { s: StyleProfile }) {
  const Row = ({ title, children }: { title: string; children: ReactNode }) => <div className="style-row"><h4>{title}</h4>{children}</div>;
  const nothing = !s.phrases.length && !s.formulas.length && !s.numbers.length && !s.colors.length && !s.sameOpening.length && !s.repeatedWords.length;
  return (
    <div className="style-counts">
      <p className="fine">{s.verseCount} verse{s.verseCount === 1 ? "" : "s"}, {s.wordCount.toLocaleString()} words in {s.translation}. These are counts of the text, not a judgment of its genre. Phrases and formulas are read from this translation, so they can vary by version.</p>
      {nothing && <p className="note">No repeated features stood out in these verses.</p>}
      {s.formulas.length > 0 && <Row title="Formulas"><ul className="fine-list">{s.formulas.map((f) => <li key={f.label}>{f.label}: {f.count} verse{f.count === 1 ? "" : "s"} <span className="fine">({f.refs.slice(0, 6).map((r) => r.split(" ").pop()).join(", ")}{f.refs.length > 6 ? "…" : ""})</span></li>)}</ul></Row>}
      {s.phrases.length > 0 && <Row title="Repeated phrases"><ul className="fine-list">{s.phrases.slice(0, 8).map((p) => <li key={p.phrase}>“{p.phrase}” ×{p.count}</li>)}</ul></Row>}
      {s.sameOpening.length > 0 && <Row title="Verses that open alike"><ul className="fine-list">{s.sameOpening.map((o) => <li key={o.opening}>“{o.opening}…” in {o.refs.map((r) => r.split(" ").pop()).join(", ")}</li>)}</ul></Row>}
      {s.numbers.length > 0 && <Row title="Numbers and series"><p className="chip-line">{s.numbers.map((n) => <Tag key={n.word}>{n.word} ×{n.count}</Tag>)}</p></Row>}
      {s.colors.length > 0 && <Row title="Colors"><p className="chip-line">{s.colors.map((n) => <Tag key={n.word}>{n.word} ×{n.count}</Tag>)}</p></Row>}
      {s.verbs.length > 0 && <Row title={`Verb forms (${s.verbTotal} verbs)`}><p className="chip-line">{s.verbs.slice(0, 7).map((v) => <Tag key={v.label}>{v.label} ×{v.count}</Tag>)}</p></Row>}
      {s.repeatedWords.length > 0 && <Row title="Most repeated words"><p className="chip-line">{s.repeatedWords.map((w) => <a key={w.id} className="chip" href={`#word-${w.id.toLowerCase()}`}>{w.gloss} ×{w.count}</a>)}</p></Row>}
    </div>
  );
}

export function GenreView({ r, onAdd }: { r: { reading: GenreReading; checked: CheckedSource[]; outside: string[] }; onAdd?: () => void }) {
  const g = r.reading;
  return (
    <div className="exegesis">
      <OriginTag origin="ai" />
      {r.outside.length > 0 && <p className="note warn">The AI pointed to verses outside your selection, so check them: {r.outside.join(", ")}.</p>}
      <p className="ex-thesis">{g.primary}</p>
      {g.confidence && <p className="fine">How sure: {g.confidence}. A genre label is a judgment, not a fact about the text.</p>}
      {g.mixed.length > 0 && <><h4>Other forms here</h4>{g.mixed.map((m, i) => <p key={i}><strong>{m.form}</strong>{m.verses && ` (${m.verses})`}. <RefText text={m.why} /></p>)}</>}
      {g.signals.length > 0 && <><h4>What points to it</h4>{g.signals.map((x, i) => <p key={i}><RefLink refText={x.ref} /> <strong>{x.signal}.</strong> <RefText text={x.meaning} /></p>)}</>}
      {g.howToRead && <><h4>How this kind of writing is usually read</h4><Paras text={g.howToRead} /></>}
      {g.cautions.length > 0 && <><h4>Cautions</h4><ul>{g.cautions.map((c, i) => <li key={i}><RefText text={c} /></li>)}</ul></>}
      {g.disputed && <><h4>What's disputed</h4><Paras text={g.disputed} /></>}
      <CheckedSources list={r.checked} />
      {onAdd && <button type="button" className="btn small primary" onClick={onAdd}>Add to guide</button>}
    </div>
  );
}
export function genreToSections(r: { reading: GenreReading }, reference: string): GuideSection[] {
  const g = r.reading;
  return [{ id: newId(), kind: "text", heading: `Genre of ${reference}: ${g.primary}`, origin: "ai", body: [g.confidence && `How sure: ${g.confidence}.`, g.howToRead, g.disputed && `Disputed: ${g.disputed}`].filter(Boolean).join("\n\n"), items: [...g.signals.map((x) => ({ ref: x.ref, label: x.signal, text: x.meaning })), ...g.cautions.map((text) => ({ label: "Caution", text }))] }];
}

function GenreBlock({ reference, style }: { reference: string; style: StyleProfile | null | undefined }) {
  const mode = useAiMode();
  const { prefs, guides, activeGuideId } = useData();
  const key = genreKey(reference, prefs.translation);
  const job = useJob(key);
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  const add = (s: GuideSection[]) => addSectionsToGuide(s, reference, guides, activeGuideId, prefs.translation, prefs.lens);
  return (
    <section className="ps-block">
      <div className="sec-head"><h2>Genre and style</h2></div>
      {style === undefined ? <Loading label="Counting" /> : style ? <StyleCounts s={style} /> : <p className="note">These verses couldn't be read.</p>}
      {mode && mode !== "none" && style && (
        <div className="ps-ai ai-block">
          {!job && <><button type="button" className="btn primary small" onClick={() => enqueueJob({ kind: "genre", key, title: `Genre of ${reference}`, payload: { reference, translation: prefs.translation } })}>Assess the genre with AI</button><p className="fine">An AI draft of the likely form, what points to it in the text, and how such writing is usually read.</p></>}
          {active && <JobProgress job={job} />}
          {job?.status === "error" && <JobError job={job} />}
          {job?.status === "done" && <><GenreView r={job.result} onAdd={() => add(genreToSections(job.result, reference))} /><button type="button" className="link-btn" onClick={() => removeJob(job.id)}>Clear</button></>}
        </div>
      )}
    </section>
  );
}

// ---------- Echoes ----------
function markText(text: string, words: string[]) {
  const patterns = words.map((w) => queryPattern(w.split(/[/:]/)[0].trim())).filter(Boolean) as RegExp[];
  if (!patterns.length) return text;
  const re = new RegExp(patterns.map((p) => `(?:${p.source})`).join("|"), "giu");
  const out: ReactNode[] = [];
  let last = 0, n = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index), <mark key={n++}>{m[0]}</mark>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

function VerseCompare({ ref_, english, highlight, words, greek }: { ref_: string; english: string; highlight: string[]; words: { text: string; on: boolean }[]; greek: { text: string; on: boolean }[] | null }) {
  const hebrew = words.some((w) => /[֐-׿]/.test(w.text));
  return (
    <div className="cmp-verse">
      <p className="ps-verse"><RefLink refText={ref_} /> {markText(english, highlight)}</p>
      {words.length > 0 && <p className={`cmp-orig ${hebrew ? "heb" : "grk"}`} dir={hebrew ? "rtl" : "ltr"} lang={hebrew ? "he" : "grc"}>{words.map((w, i) => <span key={i}>{w.on ? <mark>{w.text}</mark> : w.text} </span>)}</p>}
      {greek && <p className="cmp-orig grk" lang="grc"><span className="fine">Septuagint: </span>{greek.map((w, i) => <span key={i}>{w.on ? <mark>{w.text}</mark> : w.text} </span>)}</p>}
    </div>
  );
}

function CompareSheet({ reference, result, off, onClose }: { reference: string; result: EchoResult; off: string[]; onClose: () => void }) {
  const { prefs } = useData();
  const { data, loading, error } = useAsync(() => echoCompare(reference, result, prefs.translation, off), [reference, result.label, prefs.translation, off.join()]);
  return (
    <Sheet wide title={`${reference} and ${result.label}`} onClose={onClose}>
      {loading && !data && <Loading label="Lining up the passages" />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          {data.renderings.length > 0 && (
            <div className="note">
              <strong>Where the Greek and Hebrew differ</strong>
              <ul className="fine-list">{data.renderings.map((x, i) => <li key={i}><RefLink refText={x.ref} />: the Septuagint has <span lang="grc">{x.greek}</span> ({x.term}), where the Hebrew has <a href={`#word-${x.id.toLowerCase()}`} lang="he">{x.hebrew}</a> ({x.hebrewGloss}).</li>)}</ul>
              <p className="fine">So the word in one passage may carry the sense of the other. Whether it does here is a matter of interpretation.</p>
            </div>
          )}
          <div className="pair-grid">
            <div><h3>{reference}</h3>{data.source.map((v) => <VerseCompare key={v.ref} ref_={v.ref} english={v.english} highlight={v.highlight} words={v.words} greek={v.greek} />)}</div>
            <div><h3>{result.label}</h3>{data.target.map((v) => <VerseCompare key={v.ref} ref_={v.ref} english={v.english} highlight={v.highlight} words={v.words} greek={v.greek} />)}{data.target.length === 0 && <p className="fine">No shared key words here. This link comes from the recorded cross-references.</p>}</div>
          </div>
          <p className="fine">Highlighted words are the shared key words. Shared words show a possible link, not that the author intended one. Read the context, since the same word can have another sense.</p>
        </>
      )}
    </Sheet>
  );
}

function echoToSection(r: EchoResult, reference: string): GuideSection {
  return { id: newId(), kind: "crossrefs", heading: `Echo: ${reference} and ${r.label}`, origin: "assembled", body: `${ECHO_GRADE[r.grade].label}. Shared key words: ${r.terms.join(", ") || "none"}.`, items: [
    ...r.verses.slice(0, 12).map((v) => ({ ref: v.ref, text: v.hits.map((h) => h.term).join(", ") })),
    ...r.xrefs.map((x) => ({ label: "Cross-reference", ref: x.to, text: `from ${x.from}` })),
    ...r.quotes.map((q) => ({ label: q.kind, ref: q.ref, text: "" })),
  ] };
}

function EchoCard({ r, reference, onCompare, onAdd, hilite }: { r: EchoResult; reference: string; onCompare: () => void; onAdd: () => void; hilite?: boolean }) {
  const g = ECHO_GRADE[r.grade];
  return (
    <article className={`echo-card ${hilite ? "hilite" : ""}`}>
      <div className="echo-head"><a href={`#${hashForReference(r.close.groups >= 2 ? `${r.label}:${r.close.from}` : r.label) ?? ""}`}><strong>{r.label}</strong></a> <GradeTag tone={g.tone}>{g.label}</GradeTag></div>
      {r.fromVerse && r.fromVerse.count >= 2 && <p className="echo-line"><strong>{r.fromVerse.count} words from {r.fromVerse.ref.split(" ").pop()}</strong> appear close together: {r.fromVerse.terms.join(", ")}.</p>}
      {r.close.groups >= 2 && <p className="fine">Closest in verses {r.close.from === r.close.to ? r.close.from : `${r.close.from}–${r.close.to}`}: {r.close.terms.join(", ")}{r.sameOrder ? ". Same order as your passage" : ""}.</p>}
      {r.close.groups < 2 && r.terms.length > 0 && <p className="fine">In the chapter: {r.terms.join(", ")}.</p>}
      {r.xrefs.length > 0 && <p className="fine">Cross-references: {r.xrefs.slice(0, 3).map((x, i) => <span key={i}>{i > 0 && "; "}{x.from.split(" ").pop()} to <RefLink refText={x.to} /></span>)}</p>}
      {r.quotes.length > 0 && <p className="fine">{r.quotes.slice(0, 3).map((q, i) => <span key={i}>{i > 0 && "; "}{q.kind}: <RefLink refText={q.ref} /></span>)}</p>}
      {r.possible.length > 0 && <p className="fine echo-possible">Possible only, because the Greek reads differently here: {r.possible.slice(0, 6).join(", ")}.</p>}
      <div className="action-row"><button type="button" className="btn small" onClick={onCompare}>Compare side by side</button><button type="button" className="link-btn" onClick={onAdd}>Add to guide</button></div>
    </article>
  );
}

function EchoBlock({ reference, off, setOff, data, loading, error }: { reference: string; off: string[]; setOff: (o: string[]) => void; data: EchoSearch | null | undefined; loading: boolean; error?: Error }) {
  const { prefs, guides, activeGuideId } = useData();
  const book = parseReference(reference)?.[0]?.book ?? 1;
  const [scope, setScope] = useState<"other" | "all">("other");
  const [show, setShow] = useState(10);
  const [look, setLook] = useState("");
  const [looked, setLooked] = useState("");
  const [compare, setCompare] = useState<EchoResult | null>(null);
  useEffect(() => { setShow(10); setLooked(""); setLook(""); }, [reference, scope]);
  const isOther = (r: EchoResult) => (book > 39 ? r.book <= 39 : r.book > 39);
  const otherName = book > 39 ? "Old Testament" : "New Testament";
  const list = useMemo(() => (data?.results ?? []).filter((r) => scope === "all" || isOther(r)), [data, scope, book]);
  const lookSeg = looked ? parseReference(looked)?.[0] : null;
  const lookHit = lookSeg ? data?.results.find((r) => r.book === lookSeg.book && r.chapter === lookSeg.chapter) : undefined;
  const terms = data?.terms ?? [];
  const groups = useMemo(() => {
    const m = new Map<number, EchoTerm[]>();
    for (const t of terms) m.set(t.group, [...(m.get(t.group) ?? []), t]);
    return [...m.values()];
  }, [terms]);
  const toggle = (g: EchoTerm[]) => { const ids = g.map((t) => t.id); const isOff = ids.every((i) => off.includes(i)); setOff(isOff ? off.filter((i) => !ids.includes(i)) : [...off, ...ids.filter((i) => !off.includes(i))]); };
  const add = (r: EchoResult) => { addSectionsToGuide([echoToSection(r, reference)], reference, guides, activeGuideId, prefs.translation, prefs.lens); };
  return (
    <section className="ps-block">
      <div className="sec-head"><h2>Echoes in other passages</h2></div>
      <p className="fine">Passages that share this text's key words, found from the tagged Hebrew and Greek, the Septuagint, the cross-references and recorded quotations. No AI is involved. A match shows the words are shared, not what they mean or that the author intended a link.</p>
      {loading && !data && <Loading label="Searching. The first search takes a moment" />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <details className="doctrine">
            <summary>Key words searched ({groups.length - groups.filter((g) => g.every((t) => off.includes(t.id))).length} of {groups.length})</summary>
            <p className="fine">Tap a word to leave it out, which is useful for focusing on one image, like the judgments in verse 8. Very common words and names are already left out.</p>
            <div className="chip-line">{groups.map((g) => { const on = !g.every((t) => off.includes(t.id)); return <button type="button" key={g[0].id} aria-pressed={on} className={`chip ${on ? "on" : "off"}`} onClick={() => toggle(g)}>{g.map((t) => t.gloss || t.translit).filter((x, i, a) => a.indexOf(x) === i).join(" / ")}</button>; })}</div>
          </details>
          <div className="segmented small" role="tablist">
            <button type="button" role="tab" aria-selected={scope === "other"} className={scope === "other" ? "on" : ""} onClick={() => setScope("other")}>{otherName}</button>
            <button type="button" role="tab" aria-selected={scope === "all"} className={scope === "all" ? "on" : ""} onClick={() => setScope("all")}>Whole Bible</button>
          </div>
          <form className="ps-form" onSubmit={(e) => { e.preventDefault(); setLooked(look.trim()); }}>
            <input className="input" aria-label="Check a specific passage" value={look} onChange={(e) => setLook(e.target.value)} placeholder="Check a specific chapter, like Deuteronomy 28" />
            <button type="submit" className="btn" disabled={!look.trim()}>Check</button>
          </form>
          {looked && !lookSeg && <p className="note">That reference can't be read.</p>}
          {looked && lookSeg && !lookHit && <p className="note">No shared key words or recorded links with {looked} using the words selected above.</p>}
          {lookHit && <EchoCard hilite r={lookHit} reference={reference} onCompare={() => setCompare(lookHit)} onAdd={() => add(lookHit)} />}
          {list.length === 0 && <p className="note">No passages share enough of these key words. Aramaic sections of Daniel and Ezra have fewer links, so the cross-references matter more there.</p>}
          {list.slice(0, show).map((r) => <EchoCard key={r.label} r={r} reference={reference} onCompare={() => setCompare(r)} onAdd={() => add(r)} />)}
          {list.length > show && <button type="button" className="btn small" onClick={() => setShow(show + 15)}>Show more ({list.length - show} left)</button>}
        </>
      )}
      {compare && <CompareSheet reference={reference} result={compare} off={off} onClose={() => setCompare(null)} />}
    </section>
  );
}

// ---------- Symbols ----------
export function SymbolReadingView({ r, reference, lens, onAdd }: { r: { reading: SymbolReading; checked: CheckedSource[]; outside: string[] }; reference: string; lens: LensId; onAdd: (s: GuideSection[]) => void }) {
  const text = JSON.stringify({ ...r.reading, sources: [] }).replace(/\\n/g, " ");
  const refs = useAsync(() => checkReferences(text), [text]);
  const bad = [...new Set((refs.data ?? []).filter((c) => !c.ok).map((c) => c.ref))];
  const name = lens === "all" ? "Shared reading" : `${lensName(lens)} reading`;
  const down = r.reading.symbols.flatMap((s) => s.drawsOn).filter((d) => d.downgraded).map((d) => d.ref);
  return (
    <div className="exegesis">
      <OriginTag origin="ai" />
      <p className="fine">These are interpretations. Only the first two grades below are checked by the app, and they show that words or links exist, not what the symbol means.</p>
      {bad.length > 0 && <p className="note warn">These references don't exist in the Bible text, so the AI got them wrong: {bad.join(", ")}.</p>}
      {r.outside.length > 0 && <p className="note warn">The AI listed symbols from outside your selection, so check them: {r.outside.join(", ")}.</p>}
      {down.length > 0 && <p className="note warn">The AI claimed shared wording or a recorded link for {down.join(", ")}, but the app found neither, so these are marked as shared themes.</p>}
      {r.reading.symbols.map((s, i) => (
        <div key={i} className="symbol-card">
          <h4>{s.symbol}{s.ref && <> <span className="fine"><RefLink refText={s.ref} /></span></>}</h4>
          {s.meaning && <p><RefText text={s.meaning} /></p>}
          {s.drawsOn.length > 0 && <ul className="link-list spaced">{s.drawsOn.map((d, j) => <li key={j}><RefLink refText={d.ref} /> <GradeTag tone={SYMBOL_GRADE[d.grade].tone}>{SYMBOL_GRADE[d.grade].label}</GradeTag><span className="fine"> {SYMBOL_GRADE[d.grade].note}</span>{d.evidence?.length ? <span className="fine"> ({d.evidence.join(", ")})</span> : null}{d.aiGrade && <span className="fine"> The words are shared, but the AI rates the link itself as {d.aiGrade === "speculative" ? "speculative" : "one tradition's reading"}.</span>}<span className="shared"><RefText text={d.note} /></span></li>)}</ul>}
          {s.lensReading && <p><strong>{name}.</strong> <RefText text={s.lensReading} /></p>}
          {s.weakens && <p className="fine"><strong>What would weaken this:</strong> <RefText text={s.weakens} /></p>}
        </div>
      ))}
      {r.reading.schools.length > 0 && <><h4>Schools of interpretation</h4>{r.reading.schools.map((x, i) => <p key={i}><strong>{x.school}.</strong> <RefText text={x.reading} /></p>)}</>}
      {r.reading.otherReadings.length > 0 && <><h4>How others read it</h4>{r.reading.otherReadings.map((x, i) => <p key={i}><strong>{x.tradition}.</strong> <RefText text={x.reading} /></p>)}</>}
      {r.reading.cautions.length > 0 && <><h4>Limits</h4><ul>{r.reading.cautions.map((c, i) => <li key={i}><RefText text={c} /></li>)}</ul></>}
      <CheckedSources list={r.checked} />
      <button type="button" className="btn small primary" onClick={() => onAdd(symbolsToSections(r, reference, lens))}>Add to guide</button>
    </div>
  );
}

function symbolsToSections(r: { reading: SymbolReading; checked: CheckedSource[] }, reference: string, lens: LensId): GuideSection[] {
  const name = lens === "all" ? "shared reading" : `${lensName(lens)} lens`;
  const out: GuideSection[] = r.reading.symbols.map((s) => ({
    id: newId(), kind: "views" as const, heading: `Symbol: ${s.symbol}`, origin: "ai" as const, body: [s.meaning, s.lensReading, s.weakens && `What would weaken this: ${s.weakens}`].filter(Boolean).join("\n\n"),
    items: s.drawsOn.map((d) => ({ ref: d.ref, label: SYMBOL_GRADE[d.grade].label, text: d.note })),
  }));
  out.unshift({ id: newId(), kind: "text", heading: `Symbols in ${reference} (${name})`, origin: "ai", body: "An AI draft. Shared wording and recorded cross-references were checked by the app. Everything else is interpretation." });
  if (r.reading.schools.length) out.push({ id: newId(), kind: "views", heading: "Schools of interpretation", origin: "ai", items: r.reading.schools.map((x) => ({ label: x.school, text: x.reading })) });
  if (r.reading.otherReadings.length) out.push({ id: newId(), kind: "views", heading: "How others read it", origin: "ai", items: r.reading.otherReadings.map((x) => ({ label: x.tradition, text: x.reading })) });
  return out;
}

function SymbolBlock({ reference, off }: { reference: string; off: string[] }) {
  const mode = useAiMode();
  const { prefs, guides, activeGuideId } = useData();
  const lens = prefs.lens;
  const key = symbolsKey(reference, prefs.translation, lens);
  const job = useJob(key);
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  const label = lens === "all" ? "the reading traditions share" : `the ${lensName(lens)} lens`;
  return (
    <section className="ps-block">
      <div className="sec-head"><h2>Symbols</h2></div>
      {mode === "none" && <p className="fine">The symbol reading comes from the AI assistant, which isn't available in this copy of the app.</p>}
      {mode && mode !== "none" && (
        <div className="ai-block">
          {!job && <><button type="button" className="btn primary small" onClick={() => enqueueJob({ kind: "symbols", key, title: `Symbols in ${reference} (${lens === "all" ? "shared reading" : lensName(lens)})`, payload: { reference, translation: prefs.translation, lens, off } })}>Read the symbols through {label}</button><p className="fine">An AI draft of each main symbol: what it may draw on, how your lens reads it, and what would weaken that reading. It starts from the echoes above, using the key words you've left on. The app sets the grades for shared wording and recorded links itself.</p></>}
          {active && <JobProgress job={job} />}
          {job?.status === "error" && <JobError job={job} />}
          {job?.status === "done" && <><SymbolReadingView r={job.result} reference={reference} lens={lens} onAdd={(s) => addSectionsToGuide(s, reference, guides, activeGuideId, prefs.translation, lens)} /><button type="button" className="link-btn" onClick={() => removeJob(job.id)}>Clear</button></>}
        </div>
      )}
    </section>
  );
}

// ---------- The page ----------
export function SymbolsPage({ initial }: { initial?: string }) {
  const { prefs } = useData();
  const [reference, setReference] = useState(initial ?? "");
  const [draft, setDraft] = useState(initial ?? "");
  const [off, setOff] = useState<string[]>([]);
  useEffect(() => { setReference(initial ?? ""); setDraft(initial ?? ""); setOff([]); }, [initial]);
  const valid = reference && parseReference(reference)?.length ? reference : "";
  const style = useAsync(() => (valid ? styleProfile(valid, prefs.translation) : Promise.resolve(null)), [valid, prefs.translation]);
  const echoes = useAsync(() => (valid ? findEchoes(valid, off) : Promise.resolve(null)), [valid, off.join()]);
  const go = (ref: string) => {
    const r = ref.trim();
    if (!parseReference(r)?.length) { toast("That reference can't be read."); return; }
    setOff([]);
    setReference(r);
    const h = symbolsHash(r);
    if (h !== "symbols" && parseReference(r)?.length === 1) navigate(h);
  };
  return (
    <div className="page symbols">
      <a className="back" href="#explore">‹ Explore</a>
      <h1 className="page-title">Genre and symbols</h1>
      <p className="fine">Looks at how a passage is written and what its images may draw on. Counts and echoes are checked from the app's data. Interpretation is left to you and to labeled AI drafts.</p>
      <form className="ps-form" onSubmit={(e) => { e.preventDefault(); go(draft); }}>
        <input className="input" aria-label="Passage" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A passage, like Revelation 6:1-8" />
        <button type="submit" className="btn primary" disabled={!draft.trim()}>Study</button>
      </form>
      <label className="field-inline" htmlFor="sym-lens">Theological lens <LensSelect id="sym-lens" value={prefs.lens} onChange={(l) => setPref("lens", l)} /></label>
      {!valid && (
        <div className="tool-list">
          {["Revelation 6:1-8", "Revelation 13:1-4", "Daniel 7:1-14", "Ezekiel 1:4-14", "Isaiah 53:1-12"].map((r) => <button type="button" key={r} className="tool-row" onClick={() => { setDraft(r); go(r); }}><strong>{r}</strong></button>)}
        </div>
      )}
      {valid && (
        <>
          <h2 className="sym-ref"><RefLink refText={valid} /></h2>
          <GenreBlock reference={valid} style={style.loading ? undefined : style.data} />
          <EchoBlock reference={valid} off={off} setOff={setOff} data={echoes.data} loading={echoes.loading} error={echoes.error} />
          <SymbolBlock reference={valid} off={off} />
        </>
      )}
    </div>
  );
}
