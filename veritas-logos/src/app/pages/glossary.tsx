import { useMemo, useState } from "react";
import { getGlossary, termById, termText } from "../../core/glossary";
import { newId } from "../../core/guide";
import { useData } from "../store";
import { Empty, ErrorNote, Loading, Paras, RefLink, Tag, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";
import { centuryLabel, eventHash, eventsForTerm, getDoctrine } from "../../core/scholar";
import { excerptsAt } from "../../core/writings";
import { ExcerptCard } from "./writers";
import { Backlinks, CenturyBars, CiteButton, ScholarshipLinks, saveQuoteToNotebook } from "./scholar-ui";
import { citeId, parseSourceLine } from "../../core/cite";

export function GlossaryPage() {
  const { data, error } = useAsync(getGlossary, []);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | "quoted" | "own" | "corrected" | "none">("all");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((t) => {
      if (show === "quoted" && !t.defs.length) return false;
      if (show === "own" && !t.own) return false;
      if (show === "corrected" && !t.corrections?.length) return false;
      if (show === "none" && (t.own || t.defs.length || t.see)) return false;
      return !s || termText(t).includes(s);
    });
  }, [data, q, show]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const t of list) {
      const letter = t.term.replace(/^The /, "")[0].toUpperCase();
      m.set(letter, [...(m.get(letter) ?? []), t]);
    }
    return [...m];
  }, [list]);
  const quoted = (data ?? []).filter((t) => t.defs.length).length;
  const own = (data ?? []).filter((t) => t.own).length;
  const corrected = (data ?? []).filter((t) => t.corrections?.length).length;
  const none = (data ?? []).filter((t) => !t.own && !t.defs.length && !t.see).length;
  return (
    <div className="page">
      <h1 className="page-title">Theological terms</h1>
      <p className="sub">Your glossary, alongside definitions quoted from named dictionaries, catechisms and histories.</p>
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <input className="input" type="search" placeholder="Find a term or word" aria-label="Find a term" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="filters">
            <select aria-label="Which terms" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
              <option value="all">All {data.length} terms</option>
              <option value="own">In your glossary ({own})</option>
              <option value="quoted">With a quoted source ({quoted})</option>
              <option value="corrected">Corrected ({corrected})</option>
              {none > 0 && <option value="none">No definition yet ({none})</option>}
            </select>
          </div>
          {groups.map(([letter, terms]) => (
            <section key={letter}>
              <h3>{letter}</h3>
              <div className="term-list">
                {terms.map((t) => <a key={t.id} href={`#term-${t.see || t.id}`} className={`chip ${t.defs.length || t.own || t.see ? "" : "term-empty"}`}>{t.term}</a>)}
              </div>
            </section>
          ))}
          {!list.length && <Empty>No term matches that.</Empty>}
          <p className="fine">Entries marked “Your glossary” come from your Theological Terms document, which names no sources, so check them as you would your own notes. Those marked “Corrected” were reworded by Claude at your request, and each one shows your original wording and the reason. The other entries are word for word. The quoted sources come mostly from one stream, 1800s Protestant scholarship and Reformed and Baptist catechisms, and other traditions may define a term differently. Entries from Hodge, Schaff and Watson are the opening of a section on the subject, so they may describe the term more than define it. Compare them with the <a href="#writers">Church Fathers and teachers</a>.</p>
        </>
      )}
    </div>
  );
}

/** Where a term appears in the writers, by century. The counts are of words in the excerpts, so they show use, not teaching. */
function ThroughCenturies({ id }: { id: string }) {
  const { data } = useAsync(async () => (await getDoctrine())[id] ?? null, [id]);
  const [picked, setPicked] = useState<number | null>(null);
  const first = data ? Number(Object.keys(data.n)[0]) : null;
  const c = picked ?? first;
  const excerpts = useAsync(async () => (data && c ? excerptsAt(data.s[String(c)] ?? []) : []), [data, c]);
  if (!data) return null;
  const total = Object.values(data.n).reduce((a, b) => a + b, 0);
  return (
    <section>
      <h3>Through the centuries</h3>
      <p className="fine">{total.toLocaleString()} excerpts use this word. Choose a century to see early uses.</p>
      <CenturyBars counts={data.n} picked={c} onPick={setPicked} />
      {c && <h4>{centuryLabel(c)}</h4>}
      {excerpts.loading && <Loading label="Opening the writings" />}
      {excerpts.data?.map((e, i) => <ExcerptCard key={i} e={e} hit={undefined} />)}
      <p className="fine">Counts come from the excerpts in this app, so they reflect what's been kept here more than how common a teaching was. Spelling and translation also affect them.</p>
    </section>
  );
}

export function TermPage({ id }: { id: string }) {
  const { guides, activeGuideId, prefs } = useData();
  const { data: t, loading, error } = useAsync(() => termById(id), [id]);
  const events = useAsync(async () => (t ? eventsForTerm(t.id) : []), [t?.id]);
  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!t) return <div className="page"><p className="empty">That term isn't in the glossary. <a href="#glossary">See all terms</a>.</p></div>;
  const addOwn = () => addSectionsToGuide(
    [{ id: newId(), kind: "text", heading: `Definition: ${t.term}`, origin: t.corrections?.length ? "ai" : "you", body: t.own }],
    t.term, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  const addDef = (d: (typeof t.defs)[number]) => addSectionsToGuide(
    [{ id: newId(), kind: "views", heading: `Definition: ${t.term}`, origin: "assembled", items: [{ label: d.source, text: d.text }] }],
    t.term, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  return (
    <div className="page">
      <p className="eyebrow"><a href="#glossary">Theological terms</a></p>
      <h1 className="page-title">{t.term}</h1>
      {t.aliases.length > 0 && <p className="sub">Also called {t.aliases.join(", ")}</p>}
      {t.see && <p><a className="btn small" href={`#term-${t.see}`}>See the entry for this term</a></p>}
      {t.own && (
        <article className="excerpt">
          <header><strong>Your glossary</strong> <Tag>No source named</Tag>{t.corrections?.length ? <Tag>Corrected</Tag> : null}</header>
          {t.ownHead && !t.ownHead.toLowerCase().includes(t.term.toLowerCase()) && <p className="ex-on">Under “{t.ownHead}”</p>}
          <div className="ex-text"><Paras text={t.own} /></div>
          {!!t.corrections?.length && (
            <details className="what-changed">
              <summary>What changed</summary>
              {t.corrections.map((c, i) => (
                <div key={i}>
                  <p><strong>{c.kind === "inaccurate" ? "Inaccurate or imprecise" : "Contested view"}:</strong> {c.why}</p>
                  <p><strong>Your original:</strong> {c.original}</p>
                  {c.basis && <p><strong>Checked against:</strong> {c.basis}</p>}
                </div>
              ))}
              <p className="fine">Claude reworded this at your request. Your document hasn't changed.</p>
            </details>
          )}
          <div className="ex-actions"><button type="button" className="link-btn" onClick={addOwn}>Add to guide</button></div>
        </article>
      )}
      {t.defs.map((d, i) => (
        <article key={i} className="excerpt">
          <header><strong>{d.short}</strong>{d.modern ? <Tag>Modern, copyrighted</Tag> : null}</header>
          {d.head.toLowerCase() !== t.term.toLowerCase() && <p className="ex-on">Under “{d.head}”</p>}
          <div className="ex-text"><Paras text={d.text} /></div>
          <p className="fine ex-source">{d.source}</p>
          <div className="ex-actions">
            <button type="button" className="link-btn" onClick={() => addDef(d)}>Add to guide</button>
            <CiteButton record={{ id: citeId(t.id, d.short), kind: "section", title: d.head, ...parseSourceLine(d.source), url: d.url || undefined }} />
            <button type="button" className="link-btn" onClick={() => saveQuoteToNotebook(`${t.term}: ${d.short}`, d.text, d.source, [t.term.toLowerCase().replace(/\s+/g, "-")])}>Save to notebook</button>
            {d.url && <a className="link-btn" href={d.url} target="_blank" rel="noreferrer">Check the source</a>}
          </div>
        </article>
      ))}
      {t.note && <p className="note"><strong>Added by Claude, not from the source:</strong> {t.note}</p>}
      {!t.defs.length && !t.own && !t.see && <p className="note">Neither your glossary nor the sources in this app have an entry for this term, so it has no definition here yet. <a href="#ask">Ask the AI assistant</a> for a draft, and check it against Scripture and the writers below.</p>}
      {!t.defs.length && t.own && <p className="fine">The sources in this app have no entry for this term to compare with.</p>}
      {t.refs.length > 0 && (
        <section>
          <h3>{t.note ? "Verses" : "Verses the sources cite"}</h3>
          <div className="chips">{t.refs.map((r) => <RefLink key={r} refText={r} />)}</div>
        </section>
      )}
      {(events.data?.length ?? 0) > 0 && <section><h3>In church history</h3><div className="chips">{events.data!.map((e) => <a key={e.id} className="chip" href={`#${eventHash(e.id)}`}>{e.title}, {e.y1}</a>)}</div></section>}
      {!t.see && <ThroughCenturies id={t.id} />}
      <Backlinks names={[t.term, ...t.aliases]} />
      <section>
        <h3>Keep studying</h3>
        <div className="action-row">
          {t.writer && <a className="btn small primary" href={`#writer-${t.writer}`}>Read this writer</a>}
          {t.topic && <a className="btn small" href={`#topic-${t.topic}`}>Nave's topic</a>}
          <a className="btn small" href={`#writers-q-${encodeURIComponent(t.term.replace(/^The /, "").toLowerCase()).replace(/%20/g, "-")}`}>What writers said</a>
          <a className="btn small" href={`#search-${encodeURIComponent(t.term.toLowerCase()).replace(/%20/g, "-")}`}>Search everything</a>
        </div>
        <ScholarshipLinks query={t.term} />
      </section>
    </div>
  );
}
