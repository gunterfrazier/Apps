import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { connectCloud, navigate, useData, useRoute } from "./store";
import { PassagePeek, Toast } from "./ui";
import { hashForReference, parseReadParts, readHash } from "./routes";
import { refOf } from "../core/bible";
import { ReadPage } from "./pages/read";
import { BookPage, BooksPage, ExplorePage, LettersPage, LexiconPage, TopicPage, TopicsPage, WordPage } from "./pages/explore";
import { decodeTopic, GuidePage, GuidesPage, NewGuidePage, SharedGuidePage } from "./pages/guides";
import { PathsPage, PeoplePage, PersonPage, TreePage } from "./pages/people";
import { GlossaryPage, TermPage } from "./pages/glossary";
import { ChurchHistoryPage, DatingPage, TimelinePage } from "./pages/timeline";
import { ApostolicPage, ComparePage, DcPage, JosephusPage, MorphPage, OriginalsPage, SynopsisPage, TextualPage } from "./pages/texts";
import { CreedPage, CreedsPage } from "./pages/creeds";
import { AdvancedSearchPage, NotebookPage, NotePage, SourcesPage } from "./pages/notebook";
import { CommandPalette, HistoryHub, rememberPlace } from "./pages/hubs";
import { PassageWritersPage, WriterPage, WritersPage } from "./pages/writers";
import { parseTimelineRoute } from "../core/timeline";
import { LibraryPage } from "./pages/library";
import { getGlossary } from "../core/glossary";
import { getWritingsIndex } from "../core/writings";
import { getChurchEvents, getCreedIndex } from "../core/scholar";
import { AskPage } from "./pages/ask";
import { AiWorkPage, AiWorkPill } from "./pages/ai-work";
import { SymbolsPage } from "./pages/symbols";
import { initJobs } from "./ai-jobs";

class Boundary extends Component<{ children: ReactNode; route: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { route: string }) { if (prev.route !== this.props.route && this.state.failed) this.setState({ failed: false }); }
  render() {
    if (this.state.failed) return <div className="page"><p className="note warn">This screen hit a problem. Your saved work is safe. <a href="#read">Go to the reader</a></p></div>;
    return this.props.children;
  }
}

function pageFor(route: string): { node: ReactNode; tab: string } {
  const [head, ...rest] = route.split("-");
  const tail = rest.join("-");
  switch (head) {
    case "": case "read": return { node: <ReadPage route={tail ? parseReadParts(tail) : null} />, tab: "read" };
    case "explore": return { node: <ExplorePage />, tab: "explore" };
    case "morph": return { node: <MorphPage key={tail} initial={tail || undefined} />, tab: "explore" };
    case "compare": return { node: <ComparePage key={tail} tail={tail || undefined} />, tab: "explore" };
    case "synopsis": return { node: <SynopsisPage key={tail} n={tail ? Number(tail) : undefined} />, tab: "explore" };
    case "textual": return { node: <TextualPage />, tab: "explore" };
    case "dc": return { node: <DcPage key={tail} tail={tail || undefined} />, tab: "explore" };
    case "originals": return { node: <OriginalsPage />, tab: "explore" };
    case "af": return { node: <ApostolicPage key={tail} tail={tail} />, tab: "explore" };
    case "josephus": return { node: <JosephusPage key={tail} tail={tail} />, tab: "explore" };
    case "history": return { node: <HistoryHub />, tab: "history" };
    case "church": return { node: <ChurchHistoryPage />, tab: "history" };
    case "event": return { node: <ChurchHistoryPage eventId={tail} />, tab: "history" };
    case "dating": return { node: <DatingPage />, tab: "history" };
    case "creeds": return { node: <CreedsPage />, tab: "history" };
    case "creed": return { node: <CreedPage key={tail} id={tail} />, tab: "history" };
    case "notebook": return { node: <NotebookPage />, tab: "guides" };
    case "note": return { node: <NotePage key={tail} id={tail} />, tab: "guides" };
    case "sources": return { node: <SourcesPage />, tab: "guides" };
    case "search": return { node: <AdvancedSearchPage key={tail} initial={tail ? decodeURIComponent(tail).replace(/-/g, " ") : undefined} />, tab: "guides" };
    case "lexicon": return { node: <LexiconPage />, tab: "explore" };
    case "word": return { node: <WordPage key={tail} id={tail} />, tab: "explore" };
    case "books": return { node: <BooksPage />, tab: "explore" };
    case "book": return { node: <BookPage slug={tail} />, tab: "explore" };
    case "topics": return { node: <TopicsPage />, tab: "explore" };
    case "topic": return { node: <TopicPage slug={tail} />, tab: "explore" };
    case "letters": return { node: <LettersPage />, tab: "explore" };
    case "guides": return { node: <GuidesPage />, tab: "guides" };
    case "new": return { node: <NewGuidePage key={tail} initial={tail ? decodeTopic(tail) : undefined} />, tab: "guides" };
    case "guide": return { node: <GuidePage key={tail} id={tail} />, tab: "guides" };
    case "shared": return { node: <SharedGuidePage code={tail} />, tab: "guides" };
    case "people": return { node: <PeoplePage />, tab: "history" };
    case "person": return { node: <PersonPage key={tail} id={tail} />, tab: "history" };
    case "tree": return { node: <TreePage id={tail || undefined} />, tab: "history" };
    case "paths": return { node: <PathsPage />, tab: "history" };
    case "timeline": return { node: <TimelinePage at={parseTimelineRoute(tail)} />, tab: "history" };
    case "writers": return { node: <WritersPage key={tail} initialSearch={tail.startsWith("q-") ? decodeURIComponent(tail.slice(2)).replace(/-/g, " ") : undefined} />, tab: "history" };
    case "glossary": return { node: <GlossaryPage />, tab: "explore" };
    case "term": return { node: <TermPage key={tail} id={tail} />, tab: "explore" };
    case "writer": return { node: <WriterPage key={tail} id={tail} />, tab: "history" };
    case "on": {
      const r = tail ? parseReadParts(tail) : null;
      return r ? { node: <PassageWritersPage key={tail} reference={refOf(r.book, r.chapter, r.verse, r.verseEnd)} />, tab: "history" } : { node: <WritersPage />, tab: "history" };
    }
    case "ask": {
      const r = tail ? parseReadParts(tail) : null;
      return { node: <AskPage contextRef={r ? refOf(r.book, r.chapter, r.verse, r.verseEnd) : undefined} />, tab: "ask" };
    }
    case "ai": return { node: <AiWorkPage />, tab: "ask" };
    case "symbols": {
      const r = tail ? parseReadParts(tail) : null;
      return { node: <SymbolsPage key={tail} initial={r ? refOf(r.book, r.chapter, r.verse, r.verseEnd) : undefined} />, tab: "explore" };
    }
    case "library": return { node: <LibraryPage />, tab: "library" };
    default: return { node: <ReadPage route={null} />, tab: "read" };
  }
}

const TABS: { id: string; hash: string; label: string; icon: ReactNode }[] = [
  { id: "read", hash: "read", label: "Read", icon: <path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5V5.5ZM12 6v13.5" /> },
  { id: "explore", hash: "explore", label: "Explore", icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></> },
  { id: "history", hash: "history", label: "History", icon: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></> },
  { id: "guides", hash: "guides", label: "Study", icon: <path d="M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 16h7" /> },
  { id: "ask", hash: "ask", label: "Ask", icon: <path d="M4 5h16v11H9l-5 4V5Zm6 6h.01M14 11h.01" /> },
];

const ROOTS = new Set(["", "read", "explore", "history", "guides", "ask", "library"]);
const LABELS: Record<string, string> = { church: "Church history", timeline: "Bible timeline", creeds: "Creeds", writers: "Writers", glossary: "Theological terms", notebook: "Notebook", compare: "Compare texts", synopsis: "Gospel synopsis", dc: "Deuterocanon", morph: "Search by grammar", textual: "Textual notes", originals: "Primary texts", people: "People" };
const labelFor = (route: string) => {
  const [head, ...rest] = route.split("-");
  if (LABELS[route]) return LABELS[route];
  const tail = rest.join(" ").replace(/\b\w/g, (c) => c.toUpperCase());
  const prefix: Record<string, string> = { symbols: "Symbols: ", read: "", term: "Term: ", writer: "", creed: "", event: "", person: "", on: "On ", note: "Note", compare: "Compare ", topic: "Topic: " };
  return head in prefix ? `${prefix[head]}${head === "note" ? "" : tail}` : "";
};

function App() {
  const route = useRoute();
  const [palette, setPalette] = useState(false);
  // Going back returns to where you were on the page. Going somewhere new starts at the top.
  const places = useRef(new Map<string, number>());
  const lastRoute = useRef(route);
  const wasPop = useRef(false);
  useEffect(() => {
    const onPop = () => { wasPop.current = true; };
    window.addEventListener("popstate", onPop);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("keydown", onKey); };
  }, []);
  useEffect(() => {
    if (route === lastRoute.current) return;
    places.current.set(lastRoute.current, window.scrollY);
    lastRoute.current = route;
    if (wasPop.current) {
      wasPop.current = false;
      const y = places.current.get(route) ?? 0;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    } else if (!route.startsWith("event-") && !/^read-.*-\d+-\d+/.test(route)) {
      window.scrollTo(0, 0);
    }
    const label = labelFor(route);
    if (label.trim()) rememberPlace(route, label);
  }, [route]);
  const { prefs } = useData();
  useEffect(() => {
    const el = document.documentElement;
    if (prefs.theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", prefs.theme);
  }, [prefs.theme]);
  const { node, tab } = pageFor(route);
  return (
    <div className="app">
      <header className="top">
        <div className="top-left">
          {!ROOTS.has(route.split("-")[0]) && <button type="button" className="back-btn" aria-label="Back" onClick={() => history.back()}>‹</button>}
          <a href="#read" className="brand"><span className="mark" aria-hidden="true">Λ</span><span className="brand-name">Veritas Logos</span></a>
        </div>
        <div className="top-right">
          <button type="button" className="find-btn" aria-label="Go anywhere" onClick={() => setPalette(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <span className="find-label">Go anywhere</span><kbd className="find-kbd">Ctrl K</kbd>
          </button>
          <a href="#library" className={`lib-link ${tab === "library" ? "on" : ""}`}>Library</a>
        </div>
      </header>
      <main key={route.split("-")[0]} className="route-fade"><Boundary route={route}>{node}</Boundary></main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.hash}`} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <PassagePeek />
      <AiWorkPill route={route} />
      <Toast />
    </div>
  );
}

initJobs();
createRoot(document.getElementById("root")!).render(<App />);
connectCloud();

// Small lookups used everywhere load quietly once the app is idle, so later screens open at once.
const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
idle(() => { getGlossary().catch(() => {}); getWritingsIndex().catch(() => {}); getChurchEvents().catch(() => {}); getCreedIndex().catch(() => {}); });

if ("serviceWorker" in navigator && !(window as any).VERITAS_CONFIG?.artifact && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
}
export { navigate, hashForReference, readHash };
