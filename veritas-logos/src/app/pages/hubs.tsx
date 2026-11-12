import { useEffect, useMemo, useRef, useState } from "react";
import { getGlossary } from "../../core/glossary";
import { searchFigures } from "../../core/figure-search";
import { ensureFigures } from "../../core/people";
import { parseReference } from "../../core/references";
import { eventHash, getChurchEvents, getCreedIndex } from "../../core/scholar";
import { getWritingsIndex } from "../../core/writings";
import { searchTopics } from "../../core/content";
import { hashForReference } from "../routes";
import { navigate, useData, update } from "../store";
import { SubNav } from "./people";

const PLACES: [string, string, string][] = [
  ["read", "Reader", "Read and study the Bible"],
  ["compare", "Compare texts", "Hebrew, Septuagint, Greek, Vulgate and English"],
  ["synopsis", "Gospel synopsis", "Parallel accounts of the Gospels"],
  ["morph", "Search by grammar", "Find forms in Hebrew and Greek"],
  ["lexicon", "Lexicon", "Hebrew and Greek words"],
  ["glossary", "Theological terms", "Definitions from your glossary and named sources"],
  ["textual", "Textual notes", "Disputed passages and Greek editions"],
  ["dc", "Deuterocanon", "Books in Catholic and Orthodox Bibles"],
  ["originals", "Primary texts", "Apostolic Fathers and Josephus"],
  ["church", "Church history timeline", "Councils, schisms, reformations and creeds"],
  ["timeline", "Bible timeline", "People and events from creation on"],
  ["dating", "Disputed dates", "Where scholars date things differently"],
  ["writers", "Church Fathers and teachers", "Writers from the first century on"],
  ["creeds", "Creeds and confessions", "Catholic, Orthodox and Protestant documents"],
  ["people", "People", "Biblical people and their families"],
  ["notebook", "Notebook", "Your research notes"],
  ["sources-list", "My sources", "Your bibliography and PDFs"],
  ["search", "Advanced search", "Search everything at once"],
  ["guides", "Study guides", "Build and export a guide"],
  ["ask", "Ask the assistant", "Questions, with research mode"],
  ["library", "Library", "Settings, backups and data sources"],
];

interface Hit { hash: string; title: string; kind: string; sub?: string }

/** Jump anywhere. Opens with the search button, or with Ctrl K or Cmd K. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    const s = q.trim().toLowerCase();
    const t = setTimeout(async () => {
      const out: Hit[] = [];
      if (s) {
        if (parseReference(q.trim())) {
          const h = hashForReference(q.trim());
          if (h) {
            out.push({ hash: h, title: `Read ${q.trim()}`, kind: "Passage" });
            out.push({ hash: `on-${h.slice(5)}`, title: `What writers said on ${q.trim()}`, kind: "Passage" });
            out.push({ hash: `compare-${h.slice(5)}`, title: `Compare ${q.trim()} in Hebrew, Greek and Latin`, kind: "Passage" });
          }
        }
        for (const [hash, title, sub] of PLACES) if (`${title} ${sub}`.toLowerCase().includes(s)) out.push({ hash, title, sub, kind: "Open" });
        const [terms, ix, events, creeds, topics] = await Promise.all([getGlossary().catch(() => []), getWritingsIndex().catch(() => null), getChurchEvents().catch(() => []), getCreedIndex().catch(() => null), searchTopics(q.trim(), 3).catch(() => [])]);
        for (const t2 of terms.filter((x) => x.term.toLowerCase().includes(s) || x.aliases.some((a) => a.toLowerCase().includes(s))).slice(0, 6)) out.push({ hash: `term-${t2.see || t2.id}`, title: t2.term, kind: "Term" });
        for (const w of (ix?.authors ?? []).filter((a) => a.name.toLowerCase().includes(s)).slice(0, 5)) out.push({ hash: `writer-${w.id}`, title: w.name, kind: "Writer" });
        for (const e of events.filter((x) => x.title.toLowerCase().includes(s)).slice(0, 5)) out.push({ hash: eventHash(e.id), title: e.title, sub: String(e.y1), kind: "Church history" });
        for (const d of (creeds?.docs ?? []).filter((x) => x.name.toLowerCase().includes(s)).slice(0, 4)) out.push({ hash: `creed-${d.id}`, title: d.name, sub: d.tradition, kind: "Creed" });
        for (const t3 of topics) out.push({ hash: `topic-${t3[0]}`, title: t3[1], kind: "Topic" });
        if (s.length >= 3) {
          await ensureFigures().catch(() => {});
          for (const p of searchFigures(q.trim()).slice(0, 4)) out.push({ hash: `person-${p.id}`, title: p.name, sub: p.title, kind: "Person" });
        }
        out.push({ hash: `search-${encodeURIComponent(s).replace(/%20/g, "-")}`, title: `Search everything for “${q.trim()}”`, kind: "Search" });
      }
      if (live) { setHits(out.slice(0, 18)); setAt(0); }
    }, 90);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const go = (h: Hit) => { onClose(); navigate(h.hash); };
  const { recent } = useData();
  const shown: Hit[] = q.trim() ? hits : recent.map((r) => ({ hash: r.hash, title: r.label, kind: "Recent" }));
  return (
    <div className="sheet-wrap palette-wrap" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Go anywhere" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input} className="input big" type="search" placeholder="A verse, term, writer, event or tool" aria-label="Go anywhere" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((a) => Math.min(a + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && shown[at]) go(shown[at]);
            else if (e.key === "Escape") onClose();
          }}
        />
        <ul className="palette-list">
          {shown.map((h, i) => (
            <li key={`${h.hash}-${i}`}><button type="button" className={i === at ? "on" : ""} onMouseEnter={() => setAt(i)} onClick={() => go(h)}><span className="p-kind">{h.kind}</span><strong>{h.title}</strong>{h.sub && <span className="fine">{h.sub}</span>}</button></li>
          ))}
          {q.trim() && !hits.length && <li className="fine p-empty">Searching…</li>}
          {!q.trim() && !recent.length && <li className="fine p-empty">Type a reference such as Romans 8:28, or a term such as justification.</li>}
        </ul>
      </div>
    </div>
  );
}

export function HistoryHub() {
  return (
    <div className="page">
      <h1 className="page-title">History</h1>
      <p className="sub">The people, events and documents behind the text.</p>
      <SubNav active="" />
      <div className="tool-list">
        {[
          ["church", "Church history timeline", "Councils, schisms, reformations, creeds and theological shifts, from the apostles to today"],
          ["timeline", "Bible timeline", "People, kings and events, from creation through the New Testament"],
          ["dating", "Disputed dates", "Where scholars date events and books differently, and why"],
          ["writers", "Church Fathers and teachers", "About 120 writers on each passage, with how a verse was read century by century"],
          ["creeds", "Creeds and confessions", "45 documents across Catholic, Orthodox and Protestant traditions"],
          ["people", "People", "About 3,000 biblical people, with family trees and paths between them"],
        ].map(([h, t, s]) => <a key={h} className="tool-row" href={`#${h}`}><strong>{t}</strong><span>{s}</span></a>)}
      </div>
    </div>
  );
}

/** Keeps a short list of where you've been. */
export function rememberPlace(hash: string, label: string) {
  update((d) => (d.recent[0]?.hash === hash ? d : { ...d, recent: [{ hash, label }, ...d.recent.filter((r) => r.hash !== hash)].slice(0, 8) }));
}
export { useMemo };
