import { Fragment, useMemo, useState } from "react";
import { getTyndaleDictionaryArticle, getTyndaleDictionaryIndex, searchTyndaleDictionary } from "../../core/tyndale-dictionary";
import { readHash } from "../routes";
import { Empty, ErrorNote, Loading, RefLink, useAsync } from "../ui";

const PAGE = 40;
const articleHash = (id: string) => `#dictionary-${id}`;
const sectionId = (anchor: string) => `dictionary-section-${anchor}`;

function Credit() {
  return (
    <p className="fine">Adapted from Tyndale Open Bible Dictionary. Copyright © 2023 Tyndale House Publishers. The original work is available from <a href="https://tyndaleopenresources.com/">Tyndale Open Resources</a>, licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
  );
}

function DictionaryArticle({ id }: { id: string }) {
  const { data, loading, error } = useAsync(() => getTyndaleDictionaryArticle(id), [id]);
  if (loading) return <Loading label="Opening dictionary article" />;
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Empty>This article was not found in the dictionary.</Empty>;
  const [, title, , , place] = data.entry;
  const sections = new Set(data.paragraphs.flatMap(([, anchor]) => anchor ? [anchor] : []));
  const rendered = new Set<string>();
  return (
    <article className="prose">
      <h1 className="page-title">{title}</h1>
      {place && <p><a className="btn small" href={`#places-${readHash({ book: place[0], chapter: place[1], verse: place[2] }).slice(5)}`}>View in passage map</a></p>}
      {data.paragraphs.map(([heading, anchor, runs], i) => {
        const Tag = heading ? "h2" : "p";
        const targetId = anchor && !rendered.has(anchor) ? sectionId(anchor) : undefined;
        rendered.add(anchor);
        return (
          <Tag key={i} id={targetId} className={targetId ? "dictionary-section" : undefined} tabIndex={targetId ? -1 : undefined}>
            {runs.map(([text, kind, target], j) => {
              if (!target) return <Fragment key={j}>{text}</Fragment>;
              if (kind === "article") return <a key={j} href={articleHash(target)}>{text}</a>;
              if (kind === "scripture") return <RefLink key={j} refText={target}>{text}</RefLink>;
              if (kind === "section" && sections.has(target)) return (
                <button key={j} type="button" className="link-btn dictionary-section-link" onClick={() => {
                  const section = document.getElementById(sectionId(target));
                  section?.focus({ preventScroll: true });
                  section?.scrollIntoView();
                }}>{text}</button>
              );
              return <Fragment key={j}>{text}</Fragment>;
            })}
          </Tag>
        );
      })}
      <Credit />
    </article>
  );
}

function DictionaryIndex({ query, onQuery, shown, onMore }: {
  query: string; onQuery: (query: string) => void; shown: number; onMore: () => void;
}) {
  const { data, loading, error } = useAsync(getTyndaleDictionaryIndex, []);
  const matches = useMemo(() => searchTyndaleDictionary(data ?? [], query), [data, query]);
  return (
    <>
      <h1 className="page-title">Tyndale Open Bible Dictionary</h1>
      <input className="input" type="search" aria-label="Search dictionary" placeholder="Search people, places and subjects"
        value={query} onChange={(event) => onQuery(event.target.value)} />
      {loading ? <Loading label="Opening dictionary index" /> : <ErrorNote error={error} />}
      {data && (
        <>
          <p className="fine" role="status">{matches.length.toLocaleString()} {matches.length === 1 ? "article" : "articles"}</p>
          <div className="tool-list">{matches.slice(0, shown).map(([id, title, , aliases]) => (
            <a className="tool-row" key={id} href={articleHash(id)}>
              <strong>{title}</strong>
              {query.trim() && aliases.length > 0 && <span>{aliases.slice(0, 3).join(", ")}</span>}
            </a>
          ))}</div>
          {!matches.length && <Empty>No dictionary articles match that search.</Empty>}
          {matches.length > shown && <button className="btn" type="button" onClick={onMore}>Show more articles</button>}
        </>
      )}
      <Credit />
    </>
  );
}

export function TyndaleDictionaryPage({ id }: { id: string }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  return (
    <div className="page">
      <p className="eyebrow">{id ? <a href="#dictionary">Tyndale Open Bible Dictionary</a> : <a href="#explore">Explore</a>}</p>
      {id ? <DictionaryArticle key={id} id={id} /> : <DictionaryIndex query={query} onQuery={(value) => {
        setQuery(value);
        setShown(PAGE);
      }} shown={shown} onMore={() => setShown(shown + PAGE)} />}
    </div>
  );
}
