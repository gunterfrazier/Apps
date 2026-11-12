import { useEffect, useMemo, useRef, useState } from "react";
import { searchText } from "../../core/bible";
import { citeFromCsl, citeId, exportAll, formatBibliography, formatCitation, scholarshipLinks, type CiteRecord, type CiteStyle } from "../../core/cite";
import { getGlossary } from "../../core/glossary";
import { newId } from "../../core/guide";
import { findReferences } from "../../core/references";
import { creedText, eventHash, getChurchEvents, getCreed, getCreedIndex, TRADITIONS, yearToCentury } from "../../core/scholar";
import { excerptsFromSearch, getWritingsIndex, writerTradition, TRADITION_ORDER, type SearchHit } from "../../core/writings";
import { copyText, openStoredFile, removeStoredFile, saveFile, storeFile } from "../files";
import { deleteNote, deleteSource, navigate, saveNote, saveSource, toast, update, useData, type NoteEntry, type SavedSearch, type SourceEntry } from "../store";
import { Empty, ErrorNote, Loading, RefLink, RefText, Tag, useAsync } from "../ui";
import { addSectionsToGuide } from "./insights";
import { ExcerptCard } from "./writers";

export const StudyNav = ({ active }: { active: string }) => (
  <div className="subnav" role="tablist">
    {[["guides", "Guides"], ["notebook", "Notebook"], ["sources-list", "My sources"], ["search", "Advanced search"]].map(([h, label]) => (
      <a key={h} href={`#${h}`} className={active === h ? "on" : ""}>{label}</a>
    ))}
  </div>
);

const hashtags = (s: string) => [...new Set((s.match(/(^|\s)#([a-z][\w-]{1,30})/gi) ?? []).map((t) => t.trim().slice(1).toLowerCase()))];

// ---------- Notebook ----------
export function NotebookPage() {
  const { notebook, notes } = useData();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const all = useMemo(() => {
    const verse = Object.values(notes).map((n) => ({ id: n.key, title: `Note on ${n.ref}`, body: n.text, tags: n.tags ?? [], updatedAt: n.updatedAt, verse: n.ref }));
    return [...notebook.map((n) => ({ ...n, verse: "" })), ...verse].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notebook, notes]);
  const tags = useMemo(() => [...new Set(all.flatMap((n) => [...n.tags, ...hashtags(n.body)]))].sort(), [all]);
  const s = q.trim().toLowerCase();
  const list = all.filter((n) => (!tag || n.tags.includes(tag) || hashtags(n.body).includes(tag)) && (!s || `${n.title} ${n.body}`.toLowerCase().includes(s)));
  const create = () => {
    const now = new Date().toISOString();
    const n: NoteEntry = { id: newId("n"), title: "", body: "", tags: [], createdAt: now, updatedAt: now };
    saveNote(n);
    navigate(`note-${n.id}`);
  };
  const exportMd = () => saveFile("notebook.md", all.map((n) => `# ${n.title || "Untitled"}\n\n${n.body}\n`).join("\n"), "text/markdown");
  return (
    <div className="page">
      <h1 className="page-title">Notebook</h1>
      <p className="sub">Research notes in one place. Name a passage, term or writer and the note links to it, and shows up on its page.</p>
      <StudyNav active="notebook" />
      <div className="action-row">
        <button type="button" className="btn small primary" onClick={create}>New note</button>
        {all.length > 0 && <button type="button" className="btn small" onClick={exportMd}>Export as Markdown</button>}
      </div>
      {all.length > 0 && <input className="input" type="search" placeholder="Search your notes" aria-label="Search your notes" value={q} onChange={(e) => setQ(e.target.value)} />}
      {tags.length > 0 && <div className="chips">{tags.map((t) => <button type="button" key={t} className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(tag === t ? "" : t)}>#{t}</button>)}</div>}
      <div className="writer-list">
        {list.map((n) => (
          <a key={n.id} className="tool-row" href={n.verse ? `#read-${readHashFor(n.verse)}` : `#note-${n.id}`}>
            <strong>{n.title || "Untitled note"}</strong>
            <span>{n.body.slice(0, 140) || "Empty"}</span>
          </a>
        ))}
      </div>
      {!all.length && <Empty>Nothing yet. Save quotes from any writer or creed here, or start a note.</Empty>}
      <p className="fine">Notes save as you type and follow you between devices when the app is open in Claude. Add a tag by typing it with a # sign, such as #atonement.</p>
    </div>
  );
}
function readHashFor(ref: string) {
  const m = /^(.*?) (\d+):(\d+)/.exec(ref);
  return m ? `${m[1].toLowerCase().replace(/\s+/g, "")}-${m[2]}-${m[3]}` : "";
}

export function NotePage({ id }: { id: string }) {
  const { notebook, guides, activeGuideId, prefs } = useData();
  const n = notebook.find((x) => x.id === id);
  const links = useAsync(async () => {
    if (!n) return null;
    const lower = `${n.title}\n${n.body}`.toLowerCase();
    const [terms, ix, events, creeds] = await Promise.all([getGlossary(), getWritingsIndex(), getChurchEvents(), getCreedIndex()]);
    const has = (s: string) => s.length > 3 && new RegExp(`\\b${s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower);
    return {
      terms: terms.filter((t) => !t.see && (has(t.term) || t.aliases.some(has))).slice(0, 16),
      writers: ix.authors.filter((a) => has(a.name)).slice(0, 12),
      events: events.filter((e) => has(e.title)).slice(0, 10),
      creeds: creeds.docs.filter((d) => has(d.name)).slice(0, 10),
    };
  }, [n?.title, n?.body]);
  if (!n) return <div className="page"><p className="empty">That note isn't here. <a href="#notebook">Open your notebook</a>.</p></div>;
  const refs = [...new Set(findReferences(n.body).flatMap((p) => (p.ref ? [p.ref] : [])))];
  const addToGuide = () => addSectionsToGuide([{ id: newId(), kind: "text", heading: n.title || "Note", origin: "you", body: n.body }], n.title || "Notes", guides, activeGuideId, prefs.translation, prefs.lens);
  return (
    <div className="page">
      <p className="eyebrow"><a href="#notebook">Notebook</a></p>
      <input className="input title-input" aria-label="Title" placeholder="Title" value={n.title} onChange={(e) => saveNote({ ...n, title: e.target.value })} />
      <textarea className="input note-body" rows={14} aria-label="Note" placeholder="Write freely. References such as Romans 8:28 become links. Tag with #atonement." value={n.body} onChange={(e) => saveNote({ ...n, body: e.target.value })} />
      <div className="action-row">
        <button type="button" className="btn small" onClick={addToGuide}>Add to guide</button>
        <button type="button" className="btn small" onClick={() => copyText(n.body, "Note copied")}>Copy</button>
        <button type="button" className="btn small" onClick={() => { deleteNote(n.id); navigate("notebook"); }}>Delete</button>
      </div>
      {refs.length > 0 && <><h4>Passages</h4><div className="chips">{refs.map((r) => <RefLink key={r} refText={r} />)}</div></>}
      {links.data && links.data.terms.length > 0 && <><h4>Terms</h4><div className="chips">{links.data.terms.map((t) => <a key={t.id} className="chip" href={`#term-${t.id}`}>{t.term}</a>)}</div></>}
      {links.data && links.data.writers.length > 0 && <><h4>Writers</h4><div className="chips">{links.data.writers.map((w) => <a key={w.id} className="chip" href={`#writer-${w.id}`}>{w.name}</a>)}</div></>}
      {links.data && links.data.events.length > 0 && <><h4>Church history</h4><div className="chips">{links.data.events.map((e) => <a key={e.id} className="chip" href={`#${eventHash(e.id)}`}>{e.title}</a>)}</div></>}
      {links.data && links.data.creeds.length > 0 && <><h4>Creeds</h4><div className="chips">{links.data.creeds.map((d) => <a key={d.id} className="chip" href={`#creed-${d.id}`}>{d.name}</a>)}</div></>}
    </div>
  );
}

// ---------- My sources ----------
const EMPTY_SOURCE: CiteRecord = { id: "", kind: "article", title: "" };
export function SourcesPage() {
  const { sources } = useData();
  const [style, setStyle] = useState<CiteStyle>("chicago");
  const [doi, setDoi] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CiteRecord | null>(null);
  const [q, setQ] = useState("");
  const fileFor = useRef<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const addDoi = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    const id = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`https://doi.org/${encodeURI(id)}`, { headers: { Accept: "application/vnd.citationstyles.csl+json" } });
      if (!res.ok) throw new Error();
      const rec = citeFromCsl(await res.json());
      setForm({ ...rec, id: citeId(rec.doi ?? rec.title) });
      setDoi("");
    } catch {
      toast("That DOI couldn't be read from here. Fill in the details by hand.");
      setForm({ ...EMPTY_SOURCE, doi: id });
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof CiteRecord, label: string) => form && (
    <label className="label" key={k}>{label}<input className="input" value={(form[k] as string) ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
  );
  const attach = async (f: File | undefined) => {
    const id = fileFor.current;
    if (!f || !id) return;
    try {
      const stored = await storeFile(f);
      const s = sources.find((x) => x.id === id)!;
      saveSource({ ...s, files: [...(s.files ?? []), stored] });
      toast(stored.local ? "Attached. It's kept in this browser only." : "Attached");
    } catch (err: any) { toast(err?.message ?? "That file couldn't be attached."); }
    if (picker.current) picker.current.value = "";
  };
  const removeFile = (s: SourceEntry, id: string) => {
    const f = s.files?.find((x) => x.id === id);
    if (f) removeStoredFile(f);
    saveSource({ ...s, files: s.files?.filter((x) => x.id !== id) });
  };
  const list = sources.filter((s) => !q.trim() || `${s.title} ${s.author ?? ""} ${s.journal ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="page">
      <h1 className="page-title">My sources</h1>
      <p className="sub">Your working bibliography, with anything saved from the app and modern books and articles you add yourself.</p>
      <StudyNav active="sources-list" />
      <form className="search-row" onSubmit={addDoi}>
        <input className="input" placeholder="Add by DOI, such as 10.1017/..." aria-label="DOI" value={doi} onChange={(e) => setDoi(e.target.value)} />
        <button type="submit" className="btn small primary" disabled={busy}>{busy ? "Reading" : "Add"}</button>
      </form>
      <div className="action-row">
        <button type="button" className="btn small" onClick={() => setForm({ ...EMPTY_SOURCE })}>Add by hand</button>
        {sources.length > 0 && <>
          <button type="button" className="btn small" onClick={() => saveFile("sources.bib.txt", exportAll(sources, "bibtex"), "text/plain")}>Export BibTeX</button>
          <button type="button" className="btn small" onClick={() => saveFile("sources.ris.txt", exportAll(sources, "ris"), "text/plain")}>Export RIS</button>
          <button type="button" className="btn small" onClick={() => copyText(sources.map(formatBibliography).sort().join("\n\n"), "Bibliography copied")}>Copy bibliography</button>
        </>}
      </div>
      {form && (
        <div className="note form-card">
          <label className="label">Type
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CiteRecord["kind"] })}>
              <option value="article">Journal article</option><option value="book">Book</option><option value="section">Chapter or section</option><option value="web">Web page</option>
            </select>
          </label>
          {field("title", "Title")}{field("author", "Author")}
          {form.kind === "article" ? <>{field("journal", "Journal")}{field("volume", "Volume")}{field("issue", "Issue")}</> : <>{form.kind === "section" && field("container", "In")}{field("editors", "Editors")}{field("volume", "Volume")}{field("publisher", "Publisher")}{field("place", "Place")}</>}
          {field("year", "Year")}{field("pages", "Pages")}{field("doi", "DOI")}{field("url", "Link")}
          <div className="action-row">
            <button type="button" className="btn small primary" disabled={!form.title.trim()} onClick={() => { saveSource({ ...form, id: form.id || citeId(form.author, form.year, form.title) }); setForm(null); toast("Saved to your sources"); }}>Save</button>
            <button type="button" className="btn small" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}
      {sources.length > 0 && (
        <div className="filters">
          <input className="input" type="search" placeholder="Search your sources" aria-label="Search your sources" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Citation style" value={style} onChange={(e) => setStyle(e.target.value as CiteStyle)}>
            <option value="chicago">Chicago</option><option value="turabian">Turabian</option><option value="sbl">SBL</option>
          </select>
        </div>
      )}
      {list.map((s) => (
        <article key={s.id} className="excerpt">
          <p className="cite-text">{formatCitation(s, style)}</p>
          {s.doi && <p className="fine"><a href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">doi:{s.doi}</a></p>}
          {(s.files ?? []).map((f) => (
            <p key={f.id} className="fine">
              <button type="button" className="link-btn" onClick={() => openStoredFile(f).catch((e) => toast(e?.message ?? "That file couldn't be opened."))}>{f.name}</button>
              {f.local && " (in this browser only)"}{" "}
              <button type="button" className="link-btn" onClick={() => removeFile(s, f.id)}>Remove</button>
            </p>
          ))}
          <div className="ex-actions">
            <button type="button" className="link-btn" onClick={() => copyText(formatCitation(s, style), "Citation copied")}>Copy</button>
            <button type="button" className="link-btn" onClick={() => setForm({ ...s })}>Edit</button>
            <button type="button" className="link-btn" onClick={() => { fileFor.current = s.id; picker.current?.click(); }}>Attach PDF</button>
            <button type="button" className="link-btn" onClick={() => deleteSource(s.id)}>Remove</button>
          </div>
        </article>
      ))}
      {!sources.length && !form && <Empty>Nothing yet. Tap Cite on anything in the app and save it here, or add a DOI above.</Empty>}
      <input ref={picker} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => attach(e.target.files?.[0])} />
      <h3>Find modern scholarship</h3>
      <FindScholarship />
      <p className="fine">This list holds only what you add, so check each entry. A DOI lookup reads the publisher's record through doi.org, and only the DOI is sent. PDFs of licensed books and journals stay private to you.</p>
    </div>
  );
}
function FindScholarship() {
  const [q, setQ] = useState("");
  const links = q.trim() ? scholarshipLinks(q.trim()) : [];
  return (
    <>
      <input className="input" type="search" placeholder="A subject, such as penal substitution in Hebrews" aria-label="Find modern scholarship" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">{links.map((l) => <a key={l.name} className="chip" href={l.url} target="_blank" rel="noreferrer" title={l.hint}>{l.name}</a>)}</div>
    </>
  );
}

// ---------- Search everything ----------
const SCOPES: [string, string][] = [["bible", "Bible"], ["terms", "Terms"], ["events", "Church history"], ["creeds", "Creeds"], ["notes", "My notes"], ["writers", "Writers"]];

export function AdvancedSearchPage({ initial }: { initial?: string }) {
  const { prefs, notebook, notes, savedSearches } = useData();
  const [q, setQ] = useState(initial ?? "");
  const [scopes, setScopes] = useState<string[]>(["bible", "terms", "events", "creeds", "notes"]);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(21);
  const [tradition, setTradition] = useState("all");
  const [book, setBook] = useState(0);
  const [results, setResults] = useState<any>(null);
  const [writers, setWriters] = useState<SearchHit[] | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const live = useRef(0);
  const run = async (query = q, sc = scopes) => {
    const s = query.trim().toLowerCase();
    if (s.length < 2) return;
    const me = ++live.current;
    setResults("loading");
    setWriters(null);
    const has = (x: string) => sc.includes(x);
    const [bible, terms, events, creeds] = await Promise.all([
      has("bible") ? searchText(prefs.translation, query.trim(), { mode: "words", scope: "all", limit: 30 }).catch(() => ({ hits: [], total: 0 })) : null,
      has("terms") ? getGlossary().then((g) => g.filter((t) => !t.see && (t.term.toLowerCase().includes(s) || t.own.toLowerCase().includes(s))).slice(0, 20)) : null,
      has("events") ? getChurchEvents().then((e) => e.filter((x) => `${x.title} ${x.summary}`.toLowerCase().includes(s) && yearToCentury(x.y1) >= from && yearToCentury(x.y1) <= to).slice(0, 20)) : null,
      has("creeds") ? getCreedIndex().then(async (ix) => {
        const out: { id: string; name: string; tradition: string; year: number; line: string }[] = [];
        for (const d of ix.docs) {
          if (yearToCentury(d.year) < from || yearToCentury(d.year) > to) continue;
          const doc = await getCreed(d.id);
          if (!doc) continue;
          const t = creedText(doc), at = t.toLowerCase().indexOf(s);
          if (at >= 0) out.push({ id: d.id, name: d.name, tradition: d.tradition, year: d.year, line: t.slice(Math.max(0, at - 60), at + 120).replace(/\s+/g, " ") });
        }
        return out;
      }) : null,
    ]);
    if (me !== live.current) return;
    const noteHits = has("notes") ? [
      ...notebook.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(s)).map((n) => ({ hash: `note-${n.id}`, title: n.title || "Untitled note" })),
      ...Object.values(notes).filter((n) => n.text.toLowerCase().includes(s)).map((n) => ({ hash: "notebook", title: `Note on ${n.ref}` })),
    ] : null;
    setResults({ bible, terms, events, creeds, notes: noteHits, q: query.trim() });
    if (has("writers")) {
      const hits = await excerptsFromSearch(query.trim(), { from, to, tradition, book: book || undefined, limit: 80, onProgress: (d, t) => { if (me === live.current) setProgress([d, t]); }, cancelled: () => me !== live.current });
      if (me === live.current) { setWriters(hits); setProgress(null); }
    }
  };
  useEffect(() => { if (initial) run(initial); }, []);
  const toggle = (id: string) => setScopes((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const save = () => {
    const entry: SavedSearch = { id: newId("s"), label: q.trim(), q: q.trim(), scopes, from, to, tradition };
    update((d) => ({ ...d, savedSearches: [entry, ...d.savedSearches].slice(0, 30) }));
    toast("Search saved");
  };
  const load = (s: SavedSearch) => { setQ(s.q); setScopes(s.scopes); setFrom(s.from); setTo(s.to); setTradition(s.tradition); run(s.q, s.scopes); };
  return (
    <div className="page">
      <h1 className="page-title">Advanced search</h1>
      <p className="sub">Search the Bible, terms, church history, creeds, writers and your notes together.</p>
      <StudyNav active="search" />
      <form onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="search-row">
          <input className="input big" type="search" placeholder="A word or phrase" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <button type="submit" className="btn small primary">Search</button>
        </div>
        <div className="chips" role="group" aria-label="What to search">
          {SCOPES.map(([id, label]) => <button type="button" key={id} aria-pressed={scopes.includes(id)} className={`chip ${scopes.includes(id) ? "on" : ""}`} onClick={() => toggle(id)}>{label}</button>)}
        </div>
        <div className="filters">
          <label className="field-inline">From century <input className="input tiny" type="number" min={1} max={21} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} /></label>
          <label className="field-inline">to <input className="input tiny" type="number" min={1} max={21} value={to} onChange={(e) => setTo(Number(e.target.value) || 21)} /></label>
          <select aria-label="Writer's tradition" value={tradition} onChange={(e) => setTradition(e.target.value)}>
            <option value="all">Every tradition</option>
            {TRADITION_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" className="btn small" disabled={!q.trim()} onClick={save}>Save this search</button>
        </div>
        {scopes.includes("writers") && <p className="fine">Searching all the writers downloads about 140 MB, one book at a time, so it's slow on a phone. The century and tradition apply to the results shown.</p>}
      </form>
      {savedSearches.length > 0 && <div className="chips">{savedSearches.map((s) => <span key={s.id} className="chip saved"><button type="button" className="link-btn" onClick={() => load(s)}>{s.label}</button><button type="button" className="icon-x" aria-label={`Delete saved search ${s.label}`} onClick={() => update((d) => ({ ...d, savedSearches: d.savedSearches.filter((x) => x.id !== s.id) }))}>×</button></span>)}</div>}
      {results === "loading" && <Loading label="Searching" />}
      {progress && <p className="loading" role="status"><span className="dot" />Searching writers: book {progress[0]} of {progress[1]}…</p>}
      {results && results !== "loading" && (
        <div className="results">
          {results.bible && results.bible.hits.length > 0 && <section><h3>Bible ({results.bible.total.toLocaleString()})</h3><ul className="link-list">{results.bible.hits.slice(0, 15).map((h: any) => <li key={h.ref}><RefLink refText={h.ref} /><span className="shared">{h.text}</span></li>)}</ul></section>}
          {results.terms?.length > 0 && <section><h3>Terms</h3><div className="chips">{results.terms.map((t: any) => <a key={t.id} className="chip" href={`#term-${t.id}`}>{t.term}</a>)}</div></section>}
          {results.events?.length > 0 && <section><h3>Church history</h3><ul className="link-list">{results.events.map((e: any) => <li key={e.id}><a href={`#${eventHash(e.id)}`}>{e.title}</a> <span className="fine">{e.y1}</span></li>)}</ul></section>}
          {results.creeds?.length > 0 && <section><h3>Creeds</h3><ul className="link-list">{results.creeds.map((c: any) => <li key={c.id}><a href={`#creed-${c.id}`}>{c.name}</a> <Tag>{c.tradition}</Tag><span className="shared">… {c.line} …</span></li>)}</ul></section>}
          {results.notes?.length > 0 && <section><h3>My notes</h3><ul className="link-list">{results.notes.map((n: any, i: number) => <li key={i}><a href={`#${n.hash}`}>{n.title}</a></li>)}</ul></section>}
          {writers && <section><h3>Writers ({writers.length >= 80 ? "first 80" : writers.length})</h3>{writers.map((e, i) => <ExcerptCard key={i} e={e} hit={results.q} />)}{!writers.length && <Empty>No excerpt matched.</Empty>}</section>}
          {!results.bible?.hits.length && !results.terms?.length && !results.events?.length && !results.creeds?.length && !results.notes?.length && !scopes.includes("writers") && <Empty>Nothing matched.</Empty>}
        </div>
      )}
    </div>
  );
}
export { writerTradition, TRADITIONS, RefText };
