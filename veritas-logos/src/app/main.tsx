import { Component, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { connectCloud, navigate, useData, useRoute } from "./store";
import { PassagePeek, Toast } from "./ui";
import { hashForReference, parseReadParts, readHash } from "./routes";
import { refOf } from "../core/bible";
import { ReadPage } from "./pages/read";
import { BookPage, BooksPage, ExplorePage, LettersPage, LexiconPage, TopicPage, TopicsPage, WordPage } from "./pages/explore";
import { decodeTopic, GuidePage, GuidesPage, NewGuidePage, SharedGuidePage } from "./pages/guides";
import { PathsPage, PeoplePage, PersonPage, TimelinePage, TreePage } from "./pages/people";
import { LibraryPage } from "./pages/library";
import { AskPage } from "./pages/ask";

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
    case "people": return { node: <PeoplePage />, tab: "people" };
    case "person": return { node: <PersonPage key={tail} id={tail} />, tab: "people" };
    case "tree": return { node: <TreePage id={tail || undefined} />, tab: "people" };
    case "paths": return { node: <PathsPage />, tab: "people" };
    case "timeline": return { node: <TimelinePage />, tab: "people" };
    case "ask": {
      const r = tail ? parseReadParts(tail) : null;
      return { node: <AskPage contextRef={r ? refOf(r.book, r.chapter, r.verse, r.verseEnd) : undefined} />, tab: "ask" };
    }
    case "library": return { node: <LibraryPage />, tab: "library" };
    default: return { node: <ReadPage route={null} />, tab: "read" };
  }
}

const TABS: { id: string; hash: string; label: string; icon: ReactNode }[] = [
  { id: "read", hash: "read", label: "Read", icon: <path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5V5.5ZM12 6v13.5" /> },
  { id: "explore", hash: "explore", label: "Explore", icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></> },
  { id: "guides", hash: "guides", label: "Guides", icon: <path d="M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 16h7" /> },
  { id: "people", hash: "people", label: "People", icon: <path d="M12 3v6m0 0H6v5m6-5h6v5M6 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm12 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" /> },
  { id: "ask", hash: "ask", label: "Ask", icon: <path d="M4 5h16v11H9l-5 4V5Zm6 6h.01M14 11h.01" /> },
];

function App() {
  const route = useRoute();
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
        <a href="#read" className="brand"><span className="mark" aria-hidden="true">Λ</span>Veritas Logos</a>
        <a href="#library" className={`lib-link ${tab === "library" ? "on" : ""}`}>Library</a>
      </header>
      <main><Boundary route={route}>{node}</Boundary></main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.hash}`} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <PassagePeek />
      <Toast />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
connectCloud();

if ("serviceWorker" in navigator && !(window as any).VERITAS_CONFIG?.artifact && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
}
export { navigate, hashForReference, readHash };
