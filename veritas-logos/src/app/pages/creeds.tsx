import { useEffect, useMemo, useState } from "react";
import { CREED_CREDIT, eventHash, eventsForCreed, getCreed, getCreedIndex, type CreedBlock, type CreedDoc } from "../../core/scholar";
import { newId } from "../../core/guide";
import { useData } from "../store";
import { Empty, ErrorNote, Loading, RefText, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";
import { SubNav } from "./people";
import { Actions, Backlinks, CiteButton, saveQuoteToNotebook } from "./scholar-ui";

export function CreedsPage() {
  const { data, error } = useAsync(getCreedIndex, []);
  const [trad, setTrad] = useState("all");
  const [q, setQ] = useState("");
  const list = useMemo(() => (data?.docs ?? []).filter((d) => (trad === "all" || d.tradition === trad) && (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()))), [data, trad, q]);
  const traditions = useMemo(() => [...new Set((data?.docs ?? []).map((d) => d.tradition))], [data]);
  return (
    <div className="page">
      <h1 className="page-title">Creeds and confessions</h1>
      <p className="sub">{data?.docs.length ?? ""} documents across Catholic, Orthodox and Protestant traditions, many with their Latin or Greek beside the English.</p>
      <SubNav active="creeds" />
      <ErrorNote error={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <div className="filters">
            <input className="input" type="search" placeholder="Find a document" aria-label="Find a document" value={q} onChange={(e) => setQ(e.target.value)} />
            <select aria-label="Tradition" value={trad} onChange={(e) => setTrad(e.target.value)}>
              <option value="all">All traditions</option>
              {traditions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="writer-list">
            {list.map((d) => <a key={d.id} className="tool-row" href={`#creed-${d.id}`}><strong>{d.name}</strong><span>{d.year < 700 ? "about " : ""}AD {d.year} · {d.tradition} · {d.words.toLocaleString()} words</span></a>)}
          </div>
          {!list.length && <Empty>No document matches that.</Empty>}
          <p className="fine">{CREED_CREDIT} Schaff was a Protestant editor writing before Vatican II, so later Catholic and Orthodox statements aren't here. Dates are the ones his titles give.</p>
        </>
      )}
    </div>
  );
}

function Block({ b }: { b: CreedBlock }) {
  if (b[0] === "pg") return <span className="page-mark" aria-label={`Page ${b[1]}`}>p. {b[1]}</span>;
  if (b[0] === "h") return <h3>{b[1]}</h3>;
  if (b[0] === "2") return <div className="pair-row"><p><RefText text={b[1]} /></p><p><RefText text={b[2]} /></p></div>;
  return <p><RefText text={b[1]} /></p>;
}

export function CreedPage({ id }: { id: string }) {
  const { guides, activeGuideId, prefs } = useData();
  const { data: d, loading, error } = useAsync(() => getCreed(id), [id]);
  const events = useAsync(() => eventsForCreed(id), [id]);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(240);
  useEffect(() => setShown(240), [id, q]);
  const blocks = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    if (!s) return d.blocks;
    return d.blocks.filter((b) => b[0] !== "pg" && b.slice(1).join(" ").toLowerCase().includes(s));
  }, [d, q]);
  if (loading) return <div className="page"><Loading /></div>;
  if (error) return <div className="page"><ErrorNote error={error} /></div>;
  if (!d) return <div className="page"><p className="empty">That document isn't here. <a href="#creeds">See all creeds</a>.</p></div>;
  const firstPage = d.blocks.find((b) => b[0] === "pg")?.[1] as string | undefined;
  const lastPage = [...d.blocks].reverse().find((b) => b[0] === "pg")?.[1] as string | undefined;
  const record = { id: `creed-${d.id}`, kind: "section" as const, title: d.name, container: "The Creeds of Christendom", editors: "Philip Schaff", volume: String(d.vol), publisher: "Harper", year: "6th ed.", pages: firstPage && lastPage && firstPage !== lastPage ? `${firstPage}–${lastPage}` : firstPage, url: d.url };
  const add = () => addSectionsToGuide(
    [{ id: newId(), kind: "views", heading: d.name, origin: "assembled", items: [{ label: `${d.name} (${d.year}). Schaff, Creeds of Christendom, vol. ${d.vol}`, text: blocks.filter((b) => b[0] !== "pg").slice(0, 12).map((b) => b[b.length - 1]).join("\n\n") }] }],
    d.name, guides, activeGuideId, prefs.translation, prefs.lens,
  );
  return (
    <div className="page wide-page">
      <p className="eyebrow"><a href="#creeds">Creeds and confessions</a></p>
      <h1 className="page-title">{d.name}</h1>
      <p className="sub">AD {d.year} · {d.tradition}</p>
      {(events.data?.length ?? 0) > 0 && <div className="chips">{events.data!.map((e) => <a key={e.id} className="chip" href={`#${eventHash(e.id)}`}>{e.title}, {e.y1}</a>)}</div>}
      <input className="input" type="search" placeholder="Find a word in this document" aria-label="Find in this document" value={q} onChange={(e) => setQ(e.target.value)} />
      <Actions>
        <CiteButton record={record} />
        <button type="button" className="link-btn" onClick={add}>Add to guide</button>
        <button type="button" className="link-btn" onClick={() => saveQuoteToNotebook(d.name, blocks.filter((b) => b[0] !== "pg").slice(0, 4).map((b) => b[b.length - 1]).join(" ").slice(0, 2500), `${d.name} (${d.year}). Schaff, Creeds of Christendom, vol. ${d.vol}.`, [d.tradition.toLowerCase()])}>Save to notebook</button>
        <a className="link-btn" href={d.url} target="_blank" rel="noreferrer">Check the source</a>
      </Actions>
      <div className="creed-body">
        {blocks.slice(0, shown).map((b, i) => <Block key={i} b={b} />)}
        {!blocks.length && <Empty>That word isn't in this document.</Empty>}
      </div>
      {shown < blocks.length && <button type="button" className="btn small" onClick={() => setShown(shown + 300)}>Show more ({blocks.length - shown} left)</button>}
      <Backlinks names={[d.name]} />
      <p className="fine">{CREED_CREDIT} Schaff's footnotes are left out here and are at the source. Where the printed page has two columns, they appear side by side.</p>
    </div>
  );
}
export type { CreedDoc };
