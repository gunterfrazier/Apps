import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { connectCloud, getData, isOwnNavigation, navigate, noteNavigation, onLeave, useData, useRoute } from "./store";
import { PassagePeek, Toast } from "./ui";
import { hashForReference, parseReadParts, readHash } from "./routes";
import { refOf } from "../core/bible";
import { ReadPage } from "./pages/read";
import { BookPage, BooksPage, ExplorePage, LettersPage, LexiconPage, TopicPage, TopicsPage, WordPage } from "./pages/explore";
import { decodeTopic, GuidePage, GuidesPage, NewGuidePage, SharedGuidePage } from "./pages/guides";
import { PathsPage, PeopleDataPage, PeoplePage, PersonPage, TreePage } from "./pages/people";
import { GlossaryPage, TermPage } from "./pages/glossary";
import { ChurchHistoryPage, DatingPage, TimelinePage } from "./pages/timeline";
import { ApostolicPage, ComparePage, DcPage, JosephusPage, MorphPage, OriginalsPage, SynopsisPage, TextualPage } from "./pages/texts";
import { CreedPage, CreedsPage } from "./pages/creeds";
import { AdvancedSearchPage, NotebookPage, NotePage, SourcesPage } from "./pages/notebook";
import { CommandPalette, HistoryHub, StudyHome, rememberPlace } from "./pages/hubs";
import { PassageWritersPage, WriterExcerptPage, WriterPage, WritersPage } from "./pages/writers";
import { parseTimelineRoute } from "../core/timeline";
import { TyndaleDictionaryPage } from "./pages/tyndale-dictionary";
import { PlacesPage } from "./pages/study-resources";
import { LibraryPage } from "./pages/library";
import { AccountPage } from "./pages/account";
import { FamilyPage, KidsPage } from "./pages/family";
import { ACCOUNTS_ON, initAccounts, useAccount } from "./account";
import { getGlossary } from "../core/glossary";
import { getWritingsIndex } from "../core/writings";
import { getChurchEvents, getCreedIndex } from "../core/scholar";
import { AskPage } from "./pages/ask";
import { AiWorkPage, AiWorkPill } from "./pages/ai-work";
import { SymbolsPage } from "./pages/symbols";
import { prepareOffline } from "./offline";
import { localTranslation } from "../core/bible";
import { initJobs } from "./ai-jobs";
import { initOnlineBible } from "./online-bible";

class Boundary extends Component<{ children: ReactNode; route: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { route: string }) { if (prev.route !== this.props.route && this.state.failed) this.setState({ failed: false }); }
  render() {
    if (this.state.failed) return <div className="page"><p className="note warn">This screen hit a problem. Your saved work is safe. <a href="#read">Go to the reader</a></p></div>;
    return this.props.children;
  }
}

type MainTab = "read" | "study" | "search" | "library";

function pageFor(route: string, askDraft: { text: string } | null, consumeAskDraft: () => void): { node: ReactNode; tab: MainTab } {
  const [head, ...rest] = route.split("-");
  const tail = rest.join("-");
  switch (head) {
    case "": case "read": return { node: <ReadPage route={tail ? parseReadParts(tail) : null} />, tab: "read" };
    case "study": return { node: <StudyHome />, tab: "study" };
    case "explore": return { node: <ExplorePage />, tab: "search" };
    case "family": return { node: <FamilyPage />, tab: "study" };
    case "morph": return { node: <MorphPage key={tail} initial={tail || undefined} />, tab: "study" };
    case "compare": return { node: <ComparePage key={tail} tail={tail || undefined} />, tab: "study" };
    case "synopsis": return { node: <SynopsisPage key={tail} n={tail ? Number(tail) : undefined} />, tab: "study" };
    case "textual": return { node: <TextualPage />, tab: "study" };
    case "dc": return { node: <DcPage key={tail} tail={tail || undefined} />, tab: "study" };
    case "originals": return { node: <OriginalsPage />, tab: "study" };
    case "af": return { node: <ApostolicPage key={tail} tail={tail} />, tab: "study" };
    case "josephus": return { node: <JosephusPage key={tail} tail={tail} />, tab: "study" };
    case "history": return { node: <HistoryHub />, tab: "study" };
    case "church": return { node: <ChurchHistoryPage />, tab: "study" };
    case "event": return { node: <ChurchHistoryPage eventId={tail} />, tab: "study" };
    case "dating": return { node: <DatingPage />, tab: "study" };
    case "creeds": return { node: <CreedsPage />, tab: "study" };
    case "creed": return { node: <CreedPage key={tail} id={tail} />, tab: "study" };
    case "notebook": return { node: <NotebookPage />, tab: "library" };
    case "note": return { node: <NotePage key={tail} id={tail} />, tab: "library" };
    case "sources": return { node: <SourcesPage />, tab: "library" };
    case "search": return { node: <AdvancedSearchPage key={tail} initial={tail ? decodeURIComponent(tail).replace(/-/g, " ") : undefined} />, tab: "search" };
    case "lexicon": return { node: <LexiconPage />, tab: "study" };
    case "word": return { node: <WordPage key={tail} id={tail} />, tab: "study" };
    case "books": return { node: <BooksPage />, tab: "study" };
    case "book": return { node: <BookPage slug={tail} />, tab: "study" };
    case "topics": return { node: <TopicsPage />, tab: "study" };
    case "topic": return { node: <TopicPage slug={tail} />, tab: "study" };
    case "letters": return { node: <LettersPage />, tab: "study" };
    case "guides": return { node: <GuidesPage />, tab: "library" };
    case "new": return { node: <NewGuidePage key={tail} initial={tail ? decodeTopic(tail) : undefined} />, tab: "library" };
    case "guide": return { node: <GuidePage key={tail} id={tail} />, tab: "library" };
    case "shared": return { node: <SharedGuidePage code={tail} />, tab: "library" };
    case "people": return { node: tail === "data" ? <PeopleDataPage /> : <PeoplePage />, tab: "study" };
    case "person": return { node: <PersonPage key={tail} id={tail} />, tab: "study" };
    case "tree": return { node: <TreePage id={tail || undefined} />, tab: "study" };
    case "paths": return { node: <PathsPage />, tab: "study" };
    case "timeline": return { node: <TimelinePage at={parseTimelineRoute(tail)} />, tab: "study" };
    case "writers": return { node: <WritersPage key={tail} initialSearch={tail.startsWith("q-") ? decodeURIComponent(tail.slice(2)).replace(/-/g, " ") : undefined} />, tab: "study" };
    case "glossary": return { node: <GlossaryPage />, tab: "study" };
    case "dictionary": return { node: <TyndaleDictionaryPage id={tail} />, tab: "study" };
    case "term": return { node: <TermPage key={tail} id={tail} />, tab: "study" };
    case "excerpt": return { node: <WriterExcerptPage key={tail} locator={tail} />, tab: "study" };
    case "writer": return { node: <WriterPage key={tail} id={tail} />, tab: "study" };
    case "on": {
      const r = tail ? parseReadParts(tail) : null;
      return r ? { node: <PassageWritersPage key={tail} reference={refOf(r.book, r.chapter, r.verse, r.verseEnd)} />, tab: "study" } : { node: <WritersPage />, tab: "study" };
    }
    case "ask": {
      const r = tail ? parseReadParts(tail) : null;
      return { node: <AskPage initialQuestion={askDraft} onQuestionUsed={consumeAskDraft} contextRef={r ? refOf(r.book, r.chapter, r.verse, r.verseEnd) : undefined} />, tab: "study" };
    }
    case "ai": return { node: <AiWorkPage />, tab: "study" };
    case "places": {
      const selection = parseReadParts(tail);
      const r = selection ?? getData().lastRead;
      return { node: <PlacesPage key={tail} reference={refOf(r.book, r.chapter, selection?.verse, selection?.verseEnd)} />, tab: "study" };
    }
    case "symbols": {
      const r = tail ? parseReadParts(tail) : null;
      return { node: <SymbolsPage key={tail} initial={r ? refOf(r.book, r.chapter, r.verse, r.verseEnd) : undefined} />, tab: "study" };
    }
    case "library": return { node: <LibraryPage />, tab: "library" };
    case "account": return { node: <AccountPage />, tab: "library" };
    default: return { node: <ReadPage route={null} />, tab: "read" };
  }
}

const TABS: { id: MainTab; hash: string; label: string; icon: ReactNode }[] = [
  { id: "read", hash: "read", label: "Read", icon: <path d="M3 5.5C5.5 4 8.5 4 12 6c3.5-2 6.5-2 9-.5V19c-2.5-1.5-5.5-1.5-9 .5-3.5-2-6.5-2-9-.5V5.5ZM12 6v13.5" /> },
  { id: "study", hash: "study", label: "Study", icon: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /> },
  { id: "search", hash: "explore", label: "Search", icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></> },
  { id: "library", hash: "library", label: "Library", icon: <path d="M4 4h4v16H4zM9 4h4v16H9zM15 5l3-1 4 15-4 1z" /> },
];

const ROOTS = new Set(["", "read", "study", "explore", "library"]);
/** Routes that show the same page stay mounted, so opening a church event keeps the chart as it was. */
const pageKey = (route: string) => { const head = route.split("-")[0]; return head === "event" ? "church" : head; };
const LABELS: Record<string, string> = { church: "Church history", timeline: "Bible timeline", creeds: "Creeds", writers: "Writers", glossary: "Theological terms", notebook: "Notebook", places: "Bible places", dictionary: "Tyndale Bible Dictionary", compare: "Compare texts", synopsis: "Gospel synopsis", dc: "Deuterocanon", morph: "Search by grammar", textual: "Textual notes", originals: "Primary texts", people: "People" };
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
  const [askDraft, setAskDraft] = useState<{ text: string } | null>(null);
  // Going back returns to where you were on the page. Going somewhere new starts at the top.
  const places = useRef(new Map<string, number>());
  const lastRoute = useRef(route);
  const wasPop = useRef(false);
  useEffect(() => {
    // Where you were is saved just before leaving, while the page is still there. Saved any later, the next
    // page has already replaced it and the browser has cut the position short.
    const save = () => { if (location.hash.slice(1) === lastRoute.current) places.current.set(lastRoute.current, window.scrollY); };
    const stopLeave = onLeave(save);
    // A link tap or navigate() also fires popstate, so only a move the app didn't make counts as Back or Forward.
    const onPop = () => { const own = isOwnNavigation(); wasPop.current = !own; if (!own) places.current.set(lastRoute.current, window.scrollY); };
    const onClick = (e: MouseEvent) => { if ((e.target as Element | null)?.closest?.('a[href^="#"]')) { noteNavigation(); wasPop.current = false; } };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    const onKey = (e: KeyboardEvent) => {
      if (location.hash.startsWith("#kids-")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => { stopLeave(); window.removeEventListener("popstate", onPop); document.removeEventListener("click", onClick, true); window.removeEventListener("keydown", onKey); };
  }, []);
  useEffect(() => {
    if (route === lastRoute.current) return;
    const was = lastRoute.current;
    lastRoute.current = route;
    if (wasPop.current) {
      wasPop.current = false;
      const y = places.current.get(route) ?? 0;
      // A page that loads its data or measures itself first is short at the start, so keep trying for a moment,
      // and stop as soon as you scroll or touch the screen yourself.
      let stop = false;
      const halt = () => { stop = true; };
      for (const ev of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(ev, halt, { once: true, passive: true });
      const restore = (tries: number) => {
        if (stop) return;
        window.scrollTo(0, y);
        if (Math.abs(window.scrollY - y) > 2 && tries < 40) requestAnimationFrame(() => restore(tries + 1));
      };
      requestAnimationFrame(() => requestAnimationFrame(() => restore(0)));
    } else if (!route.startsWith("event-") && !/^read-.*-\d+-\d+/.test(route) && pageKey(route) !== pageKey(was)) {
      window.scrollTo(0, 0);
    }
    const label = labelFor(route);
    if (label.trim()) rememberPlace(route, label);
  }, [route]);
  const { prefs } = useData();
  useEffect(() => prepareOffline(localTranslation(prefs.translation)), [prefs.translation]);
  useEffect(() => {
    const el = document.documentElement;
    if (prefs.theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", prefs.theme);
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const deviceScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateThemeColor = () => {
      if (themeColor) themeColor.content = prefs.theme === "dark" || (prefs.theme === "system" && deviceScheme.matches)
        ? "#000000" : prefs.theme === "sepia" ? "#f4ead7" : "#ffffff";
    };
    updateThemeColor();
    if (prefs.theme !== "system") return;
    deviceScheme.addEventListener("change", updateThemeColor);
    return () => deviceScheme.removeEventListener("change", updateThemeColor);
  }, [prefs.theme]);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const measure = () => el.parentElement?.style.setProperty("--header-height", `${el.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [route.startsWith("kids-")]);
  if (route.startsWith("kids-")) return <Boundary route={route}><KidsPage route={route.slice(5)} /></Boundary>;
  const { node, tab } = pageFor(route, askDraft, () => setAskDraft(null));
  return (
    <div className="app">
      <header ref={header} className="top">
        <div className="top-left">
          {!ROOTS.has(route.split("-")[0]) && <button type="button" className="back-btn" aria-label="Back" onClick={() => history.back()}>‹</button>}
          <a href="#read" className="brand" aria-label="Veritas Logos">
            <svg className="brand-mark" viewBox="0 0 48 52" aria-hidden="true">
              <path className="leaf-blue" d="M2 51 14 12 38 1 31 24Z" />
              <path className="leaf-silver" d="M4 51 30 31 47 27 42 42Z" />
            </svg>
            <span className="brand-name" aria-hidden="true"><strong>Veritas</strong><span>Logos</span></span>
          </a>
        </div>
        <div className="top-right">
          <button type="button" className="find-btn" aria-label="Go anywhere" onClick={() => setPalette(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            <span className="find-label">Go anywhere</span><kbd className="find-kbd">Ctrl K</kbd>
          </button>
          {ACCOUNTS_ON && <AccountButton on={route === "account"} />}
        </div>
      </header>
      <main key={pageKey(route)} className="route-fade"><Boundary route={route}>{node}</Boundary></main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#${t.hash}`} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      {palette && <CommandPalette onClose={() => setPalette(false)} onAsk={(text) => { setAskDraft({ text }); navigate("ask"); }} />}
      <PassagePeek />
      <AiWorkPill route={route} />
      <Toast />
    </div>
  );
}

/** The header's way into the account: a person outline before signing in, the reader's initial after. */
function AccountButton({ on }: { on: boolean }) {
  const { status, user } = useAccount();
  const initial = status === "signed-in" ? (user?.email || "?").trim().charAt(0).toUpperCase() : "";
  return (
    <a href="#account" className={`acct-btn${on ? " on" : ""}${initial ? " signed-in" : ""}`} aria-label={initial ? `Your account, ${user?.email}` : "Sign in"} title={initial ? user?.email : "Sign in"}>
      {initial || <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.9-3.6 3.6-5.6 7-5.6s6.1 2 7 5.6" /></svg>}
    </a>
  );
}

initJobs();
createRoot(document.getElementById("root")!).render(<App />);
connectCloud();
initAccounts();
initOnlineBible();

// Small lookups used everywhere load quietly once the app is idle, so later screens open at once.
const idle = (window as any).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1200));
idle(() => { getGlossary().catch(() => {}); getWritingsIndex().catch(() => {}); getChurchEvents().catch(() => {}); getCreedIndex().catch(() => {}); });

export { navigate, hashForReference, readHash };
