import { useMemo, useState } from "react";
import { getGlossary, termById } from "../../core/glossary";
import { newId } from "../../core/guide";
import { useData } from "../store";
import { Empty, ErrorNote, Loading, Paras, RefLink, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";

const OTHER_SITE = "http://rebecca-writes.com/theological-terms-in-ao/";

export function GlossaryPage() {
  const { data, error } = useAsync(getGlossary, []);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((t) => !s || t.term.toLowerCase().includes(s) || t.defs.some((d) => d.text.toLowerCase().includes(s)));
  }, [data, q]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const t of list) {
      const letter = t.term.replace(/^The /, "")[0].toUpperCase();
      m.set(letter, [...(m.get(letter) ?? []), t]);
    }
    return [...m];
  }, [list]);
  const defined = (data ?? []).filter((t) => t.defs.length).length;
  return (
    <div className="page">
      <h1 className="page-title">Theological terms</h1>
      <p className="sub">Definitions quoted from public-domain dictionaries, catechisms and histories. Each one names its source.</p>
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <input className="input" type="search" placeholder="Find a term or word" aria-label="Find a term" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="fine">{defined} of {data.length} terms have a definition here. The rest are listed so the gap is plain, and you can ask the AI assistant for a labeled draft.</p>
          {groups.map(([letter, terms]) => (
            <section key={letter}>
              <h3>{letter}</h3>
              <div className="term-list">
                {terms.map((t) => <a key={t.id} href={`#term-${t.id}`} className={`chip ${t.defs.length ? "" : "term-empty"}`}>{t.term}</a>)}
              </div>
            </section>
          ))}
          {!list.length && <Empty>No term matches that.</Empty>}
          <p className="fine">These sources come mostly from one stream, 1800s Protestant scholarship and Reformed and Baptist catechisms, and other traditions may define a term differently. Compare them with the <a href="#writers">Church Fathers and teachers</a>.</p>
          <p className="fine">For another glossary, see <a href={OTHER_SITE} target="_blank" rel="noreferrer">Theological Terms in Alphabetical Order</a> on Rebecca Writes. That's an outside site, and its definitions aren't part of this app or checked by it.</p>
        </>
      )}
    </div>
  );
}

export function TermPage({ id }: { id: string }) {
  const { guides, activeGuideId, prefs } = useData();
  const { data: t, loading, error } = useAsync(() => termById(id), [id]);
  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!t) return <div className="page"><p className="empty">That term isn't in the glossary. <a href="#glossary">See all terms</a>.</p></div>;
  const addDef = (d: (typeof t.defs)[number]) => addSectionsToGuide(
    [{ id: newId(), kind: "views", heading: `Definition: ${t.term}`, origin: "assembled", items: [{ label: d.source, text: d.text }] }],
    t.term, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  return (
    <div className="page">
      <p className="eyebrow"><a href="#glossary">Theological terms</a></p>
      <h1 className="page-title">{t.term}</h1>
      {t.defs.map((d, i) => (
        <article key={i} className="excerpt">
          <header><strong>{d.short}</strong></header>
          {d.head.toLowerCase() !== t.term.toLowerCase() && <p className="ex-on">Under “{d.head}”</p>}
          <div className="ex-text"><Paras text={d.text} /></div>
          <p className="fine ex-source">{d.source}</p>
          <div className="ex-actions">
            <button type="button" className="link-btn" onClick={() => addDef(d)}>Add to guide</button>
            {d.url && <a className="link-btn" href={d.url} target="_blank" rel="noreferrer">Check the source</a>}
          </div>
        </article>
      ))}
      {!t.defs.length && <p className="note">The public-domain sources in this app don't have an entry for this term, so it has no definition here yet. <a href="#ask">Ask the AI assistant</a> for a draft, and check it against Scripture and the writers below.</p>}
      {t.refs.length > 0 && (
        <section>
          <h3>Verses the sources cite</h3>
          <div className="chips">{t.refs.map((r) => <RefLink key={r} refText={r} />)}</div>
        </section>
      )}
      <section>
        <h3>Keep studying</h3>
        <div className="action-row">
          {t.topic && <a className="btn small" href={`#topic-${t.topic}`}>Nave's topic</a>}
          <a className="btn small" href={`#writers-q-${encodeURIComponent(t.term.replace(/^The /, "").toLowerCase()).replace(/%20/g, "-")}`}>What writers said</a>
        </div>
      </section>
    </div>
  );
}
