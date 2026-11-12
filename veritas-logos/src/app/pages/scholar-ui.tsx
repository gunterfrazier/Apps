import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CITE_STYLES, formatBibliography, formatCitation, scholarshipLinks, type CiteRecord, type CiteStyle } from "../../core/cite";
import { newId } from "../../core/guide";
import { findReferences, parseReference } from "../../core/references";
import { segmentsOverlap } from "../../core/content";
import { copyText } from "../files";
import { saveNote, saveSource, toast, useData, type NoteEntry, type VerseNote } from "../store";
import { Sheet } from "../ui";

/** A row of the actions every source offers, in the same order everywhere. */
export const Actions = ({ children }: { children: ReactNode }) => <div className="ex-actions">{children}</div>;

export function CiteButton({ record, label = "Cite" }: { record: CiteRecord; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>{label}</button>
      {open && <CiteSheet record={record} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CiteSheet({ record, onClose }: { record: CiteRecord; onClose: () => void }) {
  const [style, setStyle] = useState<CiteStyle>("chicago");
  const text = formatCitation(record, style);
  const isCode = style === "bibtex" || style === "ris";
  const { sources } = useData();
  const saved = sources.some((s) => s.id === record.id);
  return (
    <Sheet title="Cite this source" onClose={onClose}>
      <div className="segmented" role="tablist" aria-label="Citation style">
        {CITE_STYLES.map((s) => <button type="button" key={s.id} role="tab" aria-selected={style === s.id} className={style === s.id ? "on" : ""} onClick={() => setStyle(s.id)}>{s.label}</button>)}
      </div>
      {isCode ? <pre className="cite-code">{text}</pre> : <p className="cite-text">{text}</p>}
      {!isCode && <><h4>Bibliography</h4><p className="cite-text">{formatBibliography(record)}</p></>}
      <div className="action-row">
        <button type="button" className="btn small primary" onClick={() => copyText(text, "Citation copied")}>Copy</button>
        <button type="button" className="btn small" disabled={saved} onClick={() => { saveSource(record); toast("Saved to your sources"); }}>{saved ? "In your sources" : "Save to my sources"}</button>
        <a className="btn small" href="#sources-list" onClick={onClose}>My sources</a>
      </div>
      <p className="fine">Built from what the source file gives. Page numbers follow the printed edition where the file marks them. Check the result against your style guide and the source before relying on it.</p>
    </Sheet>
  );
}

/** Saves a passage from anywhere as a new note, with its source. */
export function saveQuoteToNotebook(title: string, quote: string, source: string, tags: string[] = []) {
  const now = new Date().toISOString();
  const note: NoteEntry = { id: newId("n"), title, body: `“${quote}”\n\n${source}\n\n`, tags, createdAt: now, updatedAt: now };
  saveNote(note);
  toast("Saved to your notebook");
  return note;
}

export function ScholarshipLinks({ query }: { query: string }) {
  const links = useMemo(() => scholarshipLinks(query), [query]);
  return (
    <details className="doctrine">
      <summary>Find modern scholarship</summary>
      <p className="fine">These open a search for “{query}” on each site. Nothing here is checked by this app, so judge what you find as you would any source. Add what's useful under <a href="#sources-list">My sources</a>.</p>
      <div className="chips">{links.map((l) => <a key={l.name} className="chip" href={l.url} target="_blank" rel="noreferrer" title={l.hint}>{l.name}</a>)}</div>
    </details>
  );
}

export interface NoteHit { kind: "note" | "verse"; id: string; title: string; text: string; hash: string }
const allNotes = (notebook: NoteEntry[], notes: Record<string, VerseNote>): NoteHit[] => [
  ...notebook.map((n): NoteHit => ({ kind: "note", id: n.id, title: n.title || "Untitled note", text: `${n.title}\n${n.body}`, hash: `note-${n.id}` })),
  ...Object.values(notes).map((n): NoteHit => ({ kind: "verse", id: n.key, title: `Note on ${n.ref}`, text: `${n.ref}\n${n.text}`, hash: `notebook` })),
];

/** Your notes that name this passage, term or writer. */
export function Backlinks({ passage, names }: { passage?: string; names?: string[] }) {
  const { notebook, notes } = useData();
  const hits = useMemo(() => {
    const segs = passage ? parseReference(passage) ?? [] : [];
    const lower = (names ?? []).filter((n) => n.length > 2).map((n) => n.toLowerCase());
    return allNotes(notebook, notes).filter((n) => {
      const t = n.text.toLowerCase();
      if (lower.some((x) => new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t))) return true;
      if (!segs.length) return false;
      return findReferences(n.text).some((p) => p.ref && (parseReference(p.ref) ?? []).some((a) => segs.some((b) => a.book === b.book && segmentsOverlap(a, b))));
    });
  }, [notebook, notes, passage, (names ?? []).join("|")]);
  if (!hits.length) return null;
  return (
    <section>
      <h3>In your notes</h3>
      <ul className="link-list">{hits.slice(0, 12).map((n) => <li key={`${n.kind}-${n.id}`}><a href={`#${n.hash}`}>{n.title}</a></li>)}</ul>
    </section>
  );
}

/** Small bar chart of how often something appears by century. */
export function CenturyBars({ counts, onPick, picked }: { counts: Record<string, number>; onPick?: (c: number) => void; picked?: number | null }) {
  const rows = Object.entries(counts).map(([c, n]) => [Number(c), n] as [number, number]).sort((a, b) => a[0] - b[0]);
  if (!rows.length) return null;
  const min = rows[0][0], max = rows[rows.length - 1][0];
  const peak = Math.max(...rows.map((r) => r[1]));
  const map = new Map(rows);
  const list = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="c-bars" role="group" aria-label="Number of excerpts by century">
      {list.map((c) => {
        const n = map.get(c) ?? 0;
        return (
          <button type="button" key={c} className={`c-bar ${picked === c ? "on" : ""}`} disabled={!n} title={`${c}00s: ${n.toLocaleString()}`} aria-label={`Century ${c}, ${n} excerpts`} onClick={() => onPick?.(c)}>
            <span className="c-fill" style={{ height: `${n ? Math.max(6, (Math.log(n + 1) / Math.log(peak + 1)) * 100) : 0}%` }} />
            <span className="c-label">{c}</span>
          </button>
        );
      })}
    </div>
  );
}

export const useMedia = (q: string) => {
  const [on, setOn] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
};
