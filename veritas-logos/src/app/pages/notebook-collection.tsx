import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { newId, type GuideSection } from "../../core/guide";
import { IS_ARTIFACT, saveFile } from "../files";
import { notebookEntries, notebookEntryText, notebookToMarkdown, resolveNotebook, type NotebookEntry, type ResolvedNotebook } from "../notebook-entries";
import { hashForReference } from "../routes";
import { HIGHLIGHT_COLORS, navigate, saveNote, toast, update, useData, type HighlightColor, type NotebookCollection, type UserData } from "../store";
import { Empty, RefText } from "../ui";
import { addSectionsToGuide } from "./insights";

const hashtags = (s: string) => [...new Set((s.match(/(^|\s)#([a-z][\w-]{1,30})/gi) ?? []).map((t) => t.trim().slice(1).toLowerCase()))];

export function NotebookPicker({ entry, title, onSave }: { entry: string; title: string; onSave?: (data: UserData) => UserData }) {
  const { notebookCollections } = useData();
  const [open, setOpen] = useState(false);
  const count = notebookCollections.filter((c) => c.entries.includes(entry)).length;
  return (
    <div className="notebook-picker">
      <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>{count ? `Notebooks (${count})` : "Add to notebook"}</button>
      {open && (
        <fieldset className="notebook-memberships">
          <legend className="label">Notebooks for {title}</legend>
          {notebookCollections.map((c) => (
            <label className="reader-check" key={c.id}>
              <input type="checkbox" checked={c.entries.includes(entry)} onChange={(e) => {
                const checked = e.target.checked;
                update((before) => {
                  const data = checked && onSave ? onSave(before) : before;
                  return { ...data, notebookCollections: data.notebookCollections.map((item) => item.id === c.id
                    ? { ...item, entries: checked ? [...new Set([...item.entries, entry])] : item.entries.filter((id) => id !== entry) }
                    : item) };
                });
              }} />
              {c.name}
            </label>
          ))}
          <a href="#notebook">Manage notebooks</a>
        </fieldset>
      )}
    </div>
  );
}

function NotebookPrint({ title, entries }: { title: string; entries: ResolvedNotebook }) {
  const notices = [...new Set(entries.flatMap((entry) => entry.quote && entry.notice ? [entry.notice] : []))];
  return (
    <div className="doc notebook-print">
      <h1>{title}</h1>
      {entries.map((entry) => (
        <section className="doc-section" key={entry.id}>
          <h2>{entry.title || "Untitled note"}</h2>
          {notebookEntryText(entry) && <p>{notebookEntryText(entry)}</p>}
          {entry.quote && <blockquote>{entry.quote}<cite>{entry.ref} ({entry.translation})</cite></blockquote>}
          {entry.body && <p className="notebook-body">{entry.body}</p>}
          {entry.tags.length > 0 && <p>{entry.tags.map((tag) => `#${tag}`).join(" ")}</p>}
        </section>
      ))}
      {notices.map((notice) => <p className="fine" key={notice}>{notice}</p>)}
    </div>
  );
}

export function NotebookCollectionView() {
  const { notebook, notes, highlights, bookmarks, notebookCollections, guides, activeGuideId, prefs } = useData();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [color, setColor] = useState<HighlightColor | "">("");
  const [tag, setTag] = useState("");
  const [collection, setCollection] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [print, setPrint] = useState<{ title: string; entries: ResolvedNotebook } | null>(null);
  const all = useMemo(() => notebookEntries({ notebook, notes, highlights, bookmarks }), [notebook, notes, highlights, bookmarks]);
  const active = notebookCollections.find((c) => c.id === collection);
  const allowed = active ? new Set(active.entries) : null;
  const available = allowed ? all.filter((entry) => allowed.has(entry.id)) : all;
  const tags = [...new Set(available.flatMap((entry) => [...entry.tags, ...hashtags(entry.body)]))].sort();
  const s = query.trim().toLowerCase();
  const visible = available.filter((entry) => {
    if (kind === "notes" && !entry.noteId && !entry.body) return false;
    if (kind === "highlights" && !entry.colors.length) return false;
    if (kind === "bookmarks" && !entry.bookmarked) return false;
    if (color && !entry.colors.includes(color)) return false;
    if (tag && !entry.tags.includes(tag) && !hashtags(entry.body).includes(tag)) return false;
    return !s || `${entry.title} ${entry.body}`.toLowerCase().includes(s);
  });
  const title = active?.name ?? "Notebook";

  const createNote = () => {
    const now = new Date().toISOString();
    const id = newId("n");
    saveNote({ id, title: "", body: "", tags: [], createdAt: now, updatedAt: now });
    if (active) update((d) => ({ ...d, notebookCollections: d.notebookCollections.map((c) =>
      c.id === active.id ? { ...c, entries: [...c.entries, `note:${id}`] } : c) }));
    navigate(`note-${id}`);
  };
  const createNotebook = () => {
    const label = name?.trim();
    if (!label) return;
    const existing = notebookCollections.find((c) => c.name.toLowerCase() === label.toLowerCase());
    const created: NotebookCollection = existing ?? { id: newId("nb"), name: label, entries: [] };
    if (!existing) update((d) => ({ ...d, notebookCollections: [...d.notebookCollections, created] }));
    setCollection(created.id);
    setTag("");
    setName(null);
  };
  const add = (entries: NotebookEntry[]) => {
    const sections = entries.flatMap((entry): GuideSection[] => {
      const result: GuideSection[] = [];
      if (entry.ref) result.push({ id: newId(), kind: "passage", heading: entry.ref, ref: entry.ref, body: notebookEntryText(entry), origin: "assembled" });
      if (entry.noteId || entry.body) result.push({ id: newId(), kind: "text", heading: entry.ref ? `Note on ${entry.ref}` : entry.title || "Untitled note", body: entry.body, origin: "you" });
      return result;
    });
    if (sections.length) addSectionsToGuide(sections, title, guides, activeGuideId, prefs.translation, prefs.lens);
  };
  const exportEntries = async (format: "md" | "pdf") => {
    setExporting(true);
    try {
      const entries = await resolveNotebook(visible, prefs.translation);
      if (format === "md") {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "notebook";
        await saveFile(`${slug}.md`, notebookToMarkdown(title, entries), "text/markdown");
      } else {
        flushSync(() => setPrint({ title, entries }));
        if (document.querySelector(".notebook-print")) window.print();
      }
    } catch {
      toast("Couldn't export the notebook.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="notebook-screen">
        <div className="action-row">
          <button type="button" className="btn small primary" onClick={createNote}>New note</button>
          <button type="button" className="btn small" aria-expanded={name !== null} onClick={() => setName(name === null ? "" : null)}>New notebook</button>
        </div>
        {name !== null && <form className="filters" onSubmit={(e) => { e.preventDefault(); createNotebook(); }}>
          <input className="input" aria-label="Notebook name" placeholder="Notebook name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn small" disabled={!name.trim()}>Create</button>
        </form>}
        <div className="filters">
          <select aria-label="Notebook" value={collection} onChange={(e) => { setCollection(e.target.value); setTag(""); }}>
            <option value="">All notebooks and saved passages</option>
            {notebookCollections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Saved item type" value={kind} onChange={(e) => { setKind(e.target.value); setColor(""); }}>
            <option value="all">All saved items</option><option value="notes">Notes</option>
            <option value="highlights">Highlights</option><option value="bookmarks">Bookmarks</option>
          </select>
          {kind !== "notes" && kind !== "bookmarks" && <select aria-label="Highlight color" value={color} onChange={(e) => setColor(HIGHLIGHT_COLORS.find((c) => c === e.target.value) ?? "")}>
            <option value="">Any highlight color</option>
            {HIGHLIGHT_COLORS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>}
        </div>
        <input className="input" type="search" placeholder="Search notes and saved passages" aria-label="Search notebook" value={query} onChange={(e) => setQuery(e.target.value)} />
        {tags.length > 0 && <div className="chips">{tags.map((t) => <button type="button" key={t} className={`chip ${tag === t ? "on" : ""}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? "" : t)}>#{t}</button>)}</div>}
        {visible.length > 0 && <div className="action-row">
          <button type="button" className="btn small" onClick={() => add(visible)}>Add results to guide</button>
          <button type="button" className="btn small" disabled={exporting} onClick={() => exportEntries("md")}>Export as Markdown</button>
          {!IS_ARTIFACT && <button type="button" className="btn small" disabled={exporting} onClick={() => exportEntries("pdf")}>Print or PDF</button>}
        </div>}
        <div className="writer-list">
          {visible.map((entry) => {
            const hash = entry.noteId ? `note-${entry.noteId}` : entry.ref && hashForReference(entry.ref);
            return (
              <article className="note-card" key={entry.id}>
                <h3>{hash ? <a href={`#${hash}`}>{entry.title || "Untitled note"}</a> : entry.title}</h3>
                {notebookEntryText(entry) && <p className="fine">{entry.colors.map((c) => <span key={c} className={`swatch inline hl-${c}`} aria-hidden="true" />)}{notebookEntryText(entry)}</p>}
                {entry.body && <p className="notebook-body"><RefText text={entry.body} /></p>}
                <div className="action-row">
                  <button type="button" className="btn small" onClick={() => add([entry])}>Add to guide</button>
                  <NotebookPicker entry={entry.id} title={entry.title || "Untitled note"} />
                </div>
              </article>
            );
          })}
        </div>
        {!visible.length && <Empty>{all.length ? "No saved items match these filters." : "Save a note, highlight, or bookmark to get started."}</Empty>}
      </div>
      {print && <NotebookPrint {...print} />}
    </>
  );
}
