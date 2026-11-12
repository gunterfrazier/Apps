import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getVerse, translationInfo } from "../../core/bible";
import { at, guideDigest, type BookGuide, type KeyWord, type Witness } from "../../core/bookguide";
import { blankGuide, lensName, newId, type Guide, type GuideSection } from "../../core/guide";
import { getChronology, getDictionary, DICT_NAMES } from "../../core/scholar";
import { excerptsByWriter, henryNote } from "../../core/writings";
import { enqueueJob, exploreKey, markSeen, removeJob, useJob } from "../ai-jobs";
import { BOOKS } from "../../core/references";
import { readHash } from "../routes";
import { getData, navigate, saveGuide, saveNote, setPref, toast, useData } from "../store";
import { LensSelect, Loading, Paras, RefLink, useAsync } from "../ui";
import { ExploreResult, JobError, JobProgress, useAiMode } from "./ai-explore";

type Basis = "counted" | "quoted" | "ai" | "you";
const BASIS: Record<Basis, [string, string]> = {
  counted: ["Counted", "Worked out from the app's data: the Hebrew or Greek text as STEPBible tags it, its lexicon, cross-references and the comparison of editions and readings."],
  quoted: ["Quoted", "Copied word for word from the edition named under each passage."],
  ai: ["AI draft", "Written by the AI when you ask. Check it before relying on it."],
  you: ["Yours", "Your own notes."],
};
const BasisTag = ({ kind }: { kind: Basis }) => <span className={`basis-tag b-${kind}`}>{BASIS[kind][0]}</span>;

function Sec({ id, title, basis, children, intro }: { id: string; title: string; basis: Basis[]; children: ReactNode; intro?: ReactNode }) {
  return (
    <section className="bg-sec" id={`bg-${id}`} aria-labelledby={`bg-${id}-h`}>
      <div className="bg-head"><h2 id={`bg-${id}-h`}>{title}</h2><span className="bg-tags">{basis.map((b) => <BasisTag key={b} kind={b} />)}</span></div>
      {intro && <p className="fine">{intro}</p>}
      {children}
    </section>
  );
}

const pct = (x: number) => (x >= 0.1 ? Math.round(x * 100) : Math.round(x * 1000) / 10);
const PEOPLE_SHOWN = 80;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const slugOf = (name: string) => name.toLowerCase().replace(/\s+/g, "");
/** The book's own Testament, for the words a figure is measured against. */
const isOT = (g: BookGuide) => g.book < 40;
const tName = (g: BookGuide) => (isOT(g) ? "Old Testament" : "New Testament");
/** A Hebrew or Greek word, set in its own script and direction. */
function Orig({ id, text, className = "" }: { id: string; text: string; className?: string }) {
  return id.startsWith("H") ? <span className={`hebrew ${className}`.trim()} lang="he" dir="rtl">{text}</span> : <span className={`greek ${className}`.trim()} lang="grc">{text}</span>;
}

function VerseLine({ book, cv }: { book: number; cv: string }) {
  const { prefs } = useData();
  const [c, v] = cv.split(":").map(Number);
  const { data } = useAsync(() => getVerse(prefs.translation, book, c, v), [prefs.translation, book, cv]);
  return (
    <li className="bg-verse">
      <RefLink refText={at(book, cv)}>{cv}</RefLink> <span className="verse-text">{data ?? "…"}</span>
    </li>
  );
}

/** The first sentences of a long passage, ending at a sentence break. */
function opening(text: string, max = 420) {
  if (text.length <= max * 1.4) return null;
  const cut = text.slice(0, max).search(/[.;:?!][”’]?\s[^.;:?!]*$/);
  return cut > 120 ? text.slice(0, cut + 1).replace(/[;:]$/, "") + " …" : null;
}

function WitnessCard({ w }: { w: Witness }) {
  const [all, setAll] = useState(false);
  const short = opening(w.text);
  return (
    <article className="excerpt">
      <header>
        {w.writer ? <a className="ex-writer" href={`#writer-${w.writer}`}>{w.name}</a> : <strong>{w.name}</strong>}
        {w.via && <span className="fine">quoted by <a href={`#writer-${w.via}`}>{w.viaName}</a></span>}
      </header>
      <p className="ex-on">{w.cite}</p>
      <blockquote className="ex-text bg-quote">{short && !all ? short : w.text}</blockquote>
      {short && <button type="button" className="link-btn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show less" : "Read the whole passage"}</button>}
      <p className="fine ex-source">{w.edition}{w.translator ? `, ${w.translator}` : ""}{w.page ? `, p. ${w.page}` : ""}. {w.url.startsWith("#") ? <a href={w.url}>Read it in the app</a> : <a href={w.url} target="_blank" rel="noopener noreferrer">Read the chapter at CCEL</a>}</p>
    </article>
  );
}

function WordCard({ k, guide }: { k: KeyWord; guide: BookGuide }) {
  const share = k.n / k.nt;
  return (
    <li className="kw">
      <a className="kw-main" href={`#word-${k.id.toLowerCase()}`}>
        <Orig id={k.id} text={k.lemma} className="kw-lemma" />
        <span className="kw-gloss"><strong>{k.translit}</strong> {k.gloss}{k.here ? <span className="fine"> · here usually “{k.here}”</span> : null}</span>
        <span className="kw-n">{k.n}×</span>
      </a>
      <p className="fine">
        {k.n === k.nt ? `Every ${tName(guide)} use is in this book.` : `${pct(share)}% of its ${k.nt.toLocaleString()} ${tName(guide)} uses are here.`}
        {k.tagged ? ` Strong's lists it under ${k.tagged}, ${k.id}.` : ""}
      </p>
      <details className="kw-refs">
        <summary>Where it's used</summary>
        <p className="chips">{k.refs.map((r) => <RefLink key={r} refText={at(guide.book, r)}>{r}</RefLink>)}</p>
      </details>
    </li>
  );
}

/** Which chapters an axis numbers, so the numbers never crowd on a phone: every chapter in a short book, then
 * every 5th, 10th or 25th. */
const axisStep = (n: number) => (n <= 16 ? 1 : n <= 40 ? 5 : n <= 80 ? 10 : 25);
/** Spacing between bars and squares: none once a phone has only a pixel or two for each chapter. */
const density = (n: number) => (n > 60 ? " dense" : n > 30 ? " mid" : "");

/** Chapter numbers under a graph, each centered on its chapter. */
function ChapterAxis({ n }: { n: number }) {
  const step = axisStep(n);
  const marks = Array.from({ length: n }, (_, i) => i + 1).filter((c) => c === 1 || c % step === 0);
  // Centered on its chapter, but kept inside the graph's edges.
  const at = (c: number) => { const half = String(c).length * 0.32; return `clamp(${half}em, ${((c - 0.5) / n) * 100}%, calc(100% - ${half}em))`; };
  return <div className="ch-axis" aria-hidden="true">{marks.map((c) => <span key={c} style={{ left: at(c) }}>{c}</span>)}</div>;
}

/** A key word's English: its lexicon gloss, with STEP's "base: sense" form read as a list. */
const english = (k: KeyWord) => k.gloss.replace(/\s*:\s*/g, ", ");

/** Where each key word falls, chapter by chapter. On a phone each word sits on its own line above its row of
 * squares, so the squares get the full width. */
function WordMap({ guide }: { guide: BookGuide }) {
  const n = guide.glance.chapters;
  if (n < 2) return null;
  const strip = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  return (
    <div className={`kw-map${density(n)}`}>
      <ul className="kw-map-rows" aria-label="Key words by chapter">
        {guide.keywords.map((k) => {
          const dens = k.byChapter.map((x, i) => x / guide.chapters[i].words);
          const max = Math.max(...dens);
          const top = dens.map((d, i) => [d, i + 1]).filter(([d]) => d > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, c]) => c).sort((a, b) => a - b);
          return (
            <li key={k.id} className="kw-map-row">
              <a className="kw-map-word" href={`#word-${k.id.toLowerCase()}`}><Orig id={k.id} text={k.lemma} /> <span className="kw-map-en">{english(k)}</span></a>
              <span className="kw-map-strip" style={strip} role="img" aria-label={`${k.translit}, “${english(k)}”: ${k.n} uses, densest in chapter${top.length > 1 ? "s" : ""} ${top.join(", ")}`}>
                {k.byChapter.map((x, i) => (
                  <span key={i} className="kw-map-cell" title={`${k.translit} in chapter ${i + 1}: ${x}`} style={{ opacity: x ? 0.18 + 0.82 * Math.min(1, dens[i] / max) : 0.06 }} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="kw-map-row kw-map-foot" aria-hidden="true"><span className="kw-map-word fine">Chapter</span><ChapterAxis n={n} /></div>
      <p className="fine">Where each key word is used most, for the length of each chapter. Each row is shaded on its own scale, so the darkest square is where that word is densest. Tap a word for its lexicon entry.</p>
    </div>
  );
}

function ChapterBars({ guide }: { guide: BookGuide }) {
  const n = guide.chapters.length;
  const max = Math.max(...guide.chapters.map((c) => c.words));
  return (
    <figure className="ch-chart">
      <div className={`ch-bars${density(n)}`} role="list" aria-label="Words in each chapter">
        {guide.chapters.map((c) => (
          <button key={c.c} type="button" role="listitem" className="ch-bar" onClick={() => navigate(readHash({ book: guide.book, chapter: c.c }))} aria-label={`Chapter ${c.c}: ${c.verses} verses, ${c.words} words`} title={`Chapter ${c.c}: ${c.words} words`}>
            <span className="ch-fill" style={{ height: `${Math.max(4, (c.words / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <ChapterAxis n={n} />
      <figcaption className="fine">Words in each chapter. Tap a bar to read that chapter.</figcaption>
    </figure>
  );
}

// ---------- AI drafts ----------
const ASKS = {
  setting: (name: string) => `Summarize the main views today on who wrote ${name}, when, where, and for whom. For each view, name who holds it (scholars or traditions) and what evidence they point to, including the early witnesses listed in the section. Don't present a disputed point as settled, and say plainly where the evidence is thin.`,
  outline: (name: string) => `Draft an outline of ${name}: its sections with verse ranges and one line on each. Where commentators divide the book differently, say so and give the main alternatives.`,
  themes: (name: string) => `Describe the main themes of ${name}, each tied to the verses where it appears, and how the themes connect. Use the key words listed in the section where they help.`,
  questions: (name: string) => `Write study questions for ${name} in the order of the book: questions that ask what the text says, what it means, and how to live it, each tied to a passage. Scale the number to the book's length.`,
} as const;
type AskId = keyof typeof ASKS;
const ASK_LABEL: Record<AskId, string> = { setting: "Modern views on author, date and setting", outline: "Outline", themes: "Themes", questions: "Questions for study" };

function bookGuideFor(g: BookGuide): Guide | undefined {
  return getData().guides.find((x) => x.source === `book:${slugOf(g.name)}`);
}

/** The counted and quoted parts of the page as study-guide sections, so they can be edited and exported. */
function assembledSections(g: BookGuide): GuideSection[] {
  const s = (heading: string, kind: GuideSection["kind"], extra: Partial<GuideSection>): GuideSection => ({ id: newId(), heading, kind, origin: "assembled", ...extra });
  const out: GuideSection[] = [
    s(`${g.name} at a glance`, "text", { body: `${plural(g.glance.chapters, "chapter")}, ${plural(g.glance.verses, "verse")}, ${g.glance.words.toLocaleString()} ${isOT(g) ? "Hebrew words (the Leningrad Codex as STEPBible's TAHOT gives it)" : "Greek words (the Nestle-Aland text as STEPBible tags it)"}.` }),
    s("In its own words", "crossrefs", { items: g.self.map((r) => ({ ref: at(g.book, r), text: "" })) }),
  ];
  const wit = g.witnesses.filter((w) => w.topic !== "background");
  if (wit.length) out.push(s("Early witnesses", "views", { items: wit.map((w) => ({ label: `${w.name}${w.viaName ? `, quoted by ${w.viaName}` : ""}, ${w.cite}`, text: `“${w.text}” (${w.edition}${w.page ? `, p. ${w.page}` : ""})` })) }));
  out.push(s("Key words", "words", { items: g.keywords.map((k) => ({ label: `${k.lemma} (${k.translit})`, wordId: k.id, text: `${k.gloss}. ${k.n} times here, of ${k.nt} in the ${tName(g)}.` })) }));
  if (g.people.length) out.push(s("People named", "people", { items: g.people.map((p) => ({ label: p.name, personId: p.id, text: `${plural(p.verses, "verse")}, first at ${p.first}` })) }));
  if (g.links.quotes.length) out.push(s("Earlier Scripture quoted", "crossrefs", { items: g.links.quotes.map((q) => ({ label: at(g.book, q.at), ref: q.ref, text: `Shared wording: “${q.shared}”` })) }));
  if (g.links.quotedBy.length) out.push(s("Quoted in the New Testament", "crossrefs", { items: g.links.quotedBy.map((q) => ({ label: at(g.book, q.at), ref: q.ref, text: `Shared wording: “${q.shared}”` })) }));
  if (g.textual.disputed.length) out.push(s("Disputed passages", "text", { items: g.textual.disputed.map((d) => ({ label: d.ref, text: `${d.label}. ${d.note}` })) }));
  return out;
}

function addToBookGuide(g: BookGuide, sections: GuideSection[]) {
  const d = getData();
  const existing = bookGuideFor(g);
  if (existing) {
    saveGuide({ ...existing, sections: [...existing.sections, ...sections] });
    toast(`Added to "${existing.title}"`);
    return existing.id;
  }
  const guide: Guide = { ...blankGuide(`${g.name}: book study`, "teaching", d.prefs.lens, d.prefs.translation), source: `book:${slugOf(g.name)}`, subtitle: "Started from the book guide" };
  guide.sections = [...assembledSections(g), ...sections];
  saveGuide(guide);
  toast(`Started "${guide.title}". Find it under Study.`);
  return guide.id;
}

function AiDraft({ g, ask }: { g: BookGuide; ask: AskId }) {
  const { prefs } = useData();
  const mode = useAiMode();
  const heading = `${ASK_LABEL[ask]}: ${g.name}`;
  const key = exploreKey(`book-${slugOf(g.name)}-${prefs.lens}-${prefs.translation}`, heading);
  const job = useJob(key);
  useEffect(() => { if (job?.status === "done") markSeen(job.id); }, [job?.id, job?.status]);
  if (mode === null) return null;
  if (mode === "none") return null;
  const run = () => enqueueJob({
    kind: "explore", key, title: heading,
    payload: { context: { heading, kind: "text", text: guideDigest(g), refs: [`${g.name} 1`], lens: prefs.lens, translation: prefs.translation, guideTitle: `${g.name} book guide` }, request: ASKS[ask](g.name) },
  });
  const active = job && (job.status === "queued" || job.status === "running" || job.status === "interrupted");
  return (
    <div className="ai-block bg-ai">
      <div className="sec-head"><h3>{ASK_LABEL[ask]}</h3>{!job && <BasisTag kind="ai" />}</div>
      {!job && <><p className="fine">{prefs.lens === "all" ? "Reads evenly across traditions." : `Reads from the ${lensName(prefs.lens)} lens.`} It works from this page's counted and quoted facts and the app's library.</p><button type="button" className="btn small primary" onClick={run}>Draft it</button></>}
      {active && <JobProgress job={job} />}
      {job?.status === "error" && <JobError job={job} />}
      {job?.status === "done" && (
        <>
          <ExploreResult job={job} heading={heading} onAdd={(s) => addToBookGuide(g, [s])} />
          <button type="button" className="link-btn" onClick={() => { removeJob(job.id); run(); }}>Draft it again</button>
        </>
      )}
    </div>
  );
}

function AiMissing() {
  const mode = useAiMode();
  if (mode !== "none") return null;
  return <p className="note">AI drafts need the assistant, which isn't turned on in this copy of the app. See Library for how to turn it on.</p>;
}

// ---------- Older introductions, loaded when opened ----------
function DictionaryEntry({ k, head }: { k: "easton" | "smith"; head: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useAsync(async () => (open ? (await getDictionary(k))[head] ?? "" : null), [open, k, head]);
  return (
    <details className="doctrine" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{DICT_NAMES[k]}: “{head}”</summary>
      {open && (data === undefined || data === null ? <Loading /> : <Paras text={data} />)}
    </details>
  );
}

function useHenryChapters(book: number, open: boolean) {
  return useAsync(async () => {
    if (!open) return null;
    const all = await excerptsByWriter("matthew-henry", book);
    return new Map(all.filter((e) => !e.v1).map((e) => [e.c1, e]));
  }, [book, open]);
}

// ---------- Notes ----------
function BookNotes({ g }: { g: BookGuide }) {
  const { notebook } = useData();
  const tag = `book-${slugOf(g.name)}`;
  const note = notebook.find((n) => n.tags.includes(tag));
  const [text, setText] = useState(note?.body ?? "");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { if (note && note.body !== text && document.activeElement?.id !== "bg-notes-text") setText(note.body); }, [note?.body]);
  const save = (body: string) => {
    const now = new Date().toISOString();
    const cur = getData().notebook.find((n) => n.tags.includes(tag));
    if (!cur && !body.trim()) return;
    saveNote(cur ? { ...cur, body } : { id: newId("n"), title: `Notes on ${g.name}`, body, tags: [tag], createdAt: now, updatedAt: now });
  };
  return (
    <>
      <label className="label" htmlFor="bg-notes-text">Your notes on {g.name}</label>
      <textarea id="bg-notes-text" className="input note-body bg-notes" value={text} placeholder="What stood out, questions to follow up, how it connects…"
        onChange={(e) => { const v = e.target.value; setText(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => save(v), 600); }}
        onBlur={(e) => { window.clearTimeout(timer.current); save(e.target.value); }} />
      <p className="fine">Saved in your Notebook as you type{note ? <>. <a href={`#note-${note.id}`}>Open it there</a></> : ""}.</p>
    </>
  );
}

const SELF_INTRO: Record<BookGuide["selfKind"], string> = {
  opening: "The opening verse. The writer doesn't speak of himself or his book anywhere else.",
  writing: "The opening verse, and every verse where the writer speaks of writing.",
  listed: "The opening, and the passages where the writer speaks about his book.",
  record: "The opening verse, and the verses that say who wrote these words down.",
  memoir: "The opening verse, and the verses where the writer begins to tell the story as “I”.",
  heading: "The opening verse, which says whose words these are, and any verse that speaks of writing them down.",
  headings: "The headings that say whose sayings follow.",
  titles: "The opening verse. The book doesn't say who gathered it, and Psalm 1 has no title; the names in the other psalms' titles are below.",
};
const selfIntro = (g: BookGuide) => (g.selfKind === "opening" && isOT(g) ? "The opening verse. The book doesn't say who wrote it." : SELF_INTRO[g.selfKind]);

// ---------- The page ----------
const TOC: [string, string][] = [["glance", "At a glance"], ["own", "Its own words"], ["author", "Author and date"], ["received", "How it was received"], ["shape", "Shape"], ["words", "Key words"], ["people", "People"], ["scripture", "Scripture"], ["text", "Manuscripts"], ["chapters", "Chapters"], ["older", "Older introductions"], ["themes", "Themes and questions"], ["notes", "Notes"]];

export function BookGuideView({ g, testament, greekName }: { g: BookGuide; testament?: string; greekName?: ReactNode }) {
  const { prefs, guides } = useData();
  const slug = slugOf(g.name);
  const dating = useAsync(async () => (g.dating ? (await getChronology()).books.find((b) => b.book === (g.datingAs ?? g.name)) : undefined), [g.name]);
  const [henryOpen, setHenryOpen] = useState(false);
  // 1 Chronicles names over a thousand people; the most-named come first.
  const [allPeople, setAllPeople] = useState(false);
  const henry = useHenryChapters(g.book, henryOpen);
  const [allOnly, setAllOnly] = useState(false);
  const [allReadings, setAllReadings] = useState(false);
  const existing = guides.find((x) => x.source === `book:${slug}`);
  const author = g.witnesses.filter((w) => w.topic === "author");
  const received = g.witnesses.filter((w) => w.topic === "reception");
  const background = g.witnesses.filter((w) => w.topic === "background");
  const toc = TOC.filter(([id]) => (id !== "received" || received.length) && (id !== "people" || g.people.length)).map(([id, label]) => [id, id === "text" && isOT(g) ? "Hebrew text" : label] as [string, string]);
  const go = (id: string) => {
    const el = document.getElementById(`bg-${id}`);
    if (!el) return;
    // A long way down, jump rather than glide, and never animate for readers who've asked for less motion.
    const far = Math.abs(el.getBoundingClientRect().top) > window.innerHeight * 3;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: far || still ? "auto" : "smooth", block: "start" });
  };
  const big = g.glance.chapters > 3;
  const otherBooks = useMemo(() => {
    const m = new Map<string, { at: string; ref: string; shared: string }[]>();
    for (const p of g.links.parallels) {
      const other = p.ref.replace(/ \d+:\d+.*$/, "");
      m.set(other, [...(m.get(other) ?? []), p]);
    }
    // The book itself first, then the rest in Bible order.
    const order = (name: string) => (name === g.name ? -1 : BOOKS.findIndex((x) => x.name === name));
    return [...m.entries()].sort((x, y) => order(x[0]) - order(y[0]));
  }, [g]);
  const only = allOnly ? g.onlyHere : g.onlyHere.slice(0, 16);
  const readings = allReadings ? g.textual.readings : g.textual.readings.slice(0, 12);
  const hb = g.textual.hebrew;
  const hbReadings = hb ? (allReadings ? hb.readings : hb.readings.slice(0, 12)) : [];

  return (
    <div className="page prose book-guide">
      <p className="eyebrow">{testament} · Book guide</p>
      <h1 className="page-title">{g.name}</h1>
      <nav className="subnav bg-toc" aria-label="Sections of this guide">
        {toc.map(([id, label]) => <a key={id} href={`#book-${slug}`} onClick={(e) => { e.preventDefault(); go(id); }}>{label}</a>)}
      </nav>
      <details className="bg-key">
        <summary>How this guide is made</summary>
        <ul className="fine-list">{(["counted", "quoted", "ai", "you"] as Basis[]).map((b) => <li key={b}><BasisTag kind={b} /> {BASIS[b][1]}</li>)}</ul>
      </details>

      <Sec id="glance" title="At a glance" basis={["counted"]}>
        <dl className="facts">
          <dt>Length</dt><dd>{plural(g.glance.chapters, "chapter")}, {plural(g.glance.verses, "verse")}</dd>
          <dt>{isOT(g) ? "Hebrew words" : "Greek words"}</dt><dd>{g.glance.words.toLocaleString()}, {pct(g.glance.words / g.glance.ntWords)}% of the {tName(g)}{g.glance.wordsInBrackets ? `, including ${g.glance.wordsInBrackets} in double brackets` : ""}{g.glance.aramaicWords ? `, ${g.glance.aramaicWords.toLocaleString()} of them in Aramaic` : ""}{g.psalmTitles ? ". The Psalm titles aren't counted: the app follows the English verse numbers, which leave them out" : ""}</dd>
          <dt>Different words</dt><dd>{g.glance.distinct.toLocaleString()} nouns, verbs, adjectives and adverbs</dd>
          {greekName}
          {g.people.length > 0 && <><dt>People named</dt><dd>{g.people.length}</dd></>}
          {g.links.quotes.length > 0 && <><dt>Quotations</dt><dd>{plural(g.links.quotes.length, "quotation")} of earlier Scripture with matching wording</dd></>}
          {g.links.quotedBy.length > 0 && <><dt>In the New Testament</dt><dd>{plural(new Set(g.links.quotedBy.map((q) => q.at)).size, "verse")} quoted with matching wording</dd></>}
        </dl>
        {g.renumbered.length > 0 && <p className="fine">Greek editions number {g.glance.greekVerses} verses. The Bibles in this app number {g.glance.verses}, joining {g.renumbered.map(([a, b]) => `${a} to ${b}`).join(" and ")}, so references here use their numbers.</p>}
        {isOT(g) ? (
          <p className="fine">Words are counted in the Leningrad Codex as STEPBible's Translators Amalgamated Hebrew OT gives it, reading the scribes' marginal corrections (the Qere){hb?.added.length ? `, and leaving out the words at ${hb.added.map((x) => x.at).join(", ")} that the codex lacks` : ""}. A Hebrew word here includes its attached prefixes and suffixes ("and", "the", "his"). Other counts give slightly different totals.</p>
        ) : (
          <p className="fine">Words are counted in the Nestle-Aland wording as STEPBible's Tagged Greek New Testament gives it{g.textual.outsideCritical.length ? `, leaving out ${g.textual.outsideCritical.join(", ")}, which only the traditional editions have` : ""}. Other editions give slightly different totals.</p>
        )}
        {g.glance.chapters > 1 && <ChapterBars guide={g} />}
      </Sec>

      <Sec id="own" title="In its own words" basis={["counted"]} intro={`${selfIntro(g)} Shown in the ${translationInfo(prefs.translation).name}.`}>
        <ul className="bg-verses">{g.self.map((cv) => <VerseLine key={cv} book={g.book} cv={cv} />)}</ul>
        {g.psalmTitles && (
          <>
            <h3>Names in the Psalm titles</h3>
            <p className="fine">{g.psalmTitles.titled} of the 150 psalms have a title. In the Hebrew a title is part of the psalm; English Bibles print it above, unnumbered. The Hebrew “of David” (<i>le-David</i>) can also mean “for David” or “about David”. Read from STEPBible's Hebrew text.</p>
            <ul className="fine-list">
              {g.psalmTitles.names.map((x) => (
                <li key={x.name}>
                  <strong>{x.name}</strong> <span className="fine">{plural(x.psalms.length, "psalm")}:</span>{" "}
                  {x.psalms.map((n, i) => <span key={n}>{i ? ", " : ""}<RefLink refText={`Psalms ${n}:1`}>{String(n)}</RefLink></span>)}
                </li>
              ))}
            </ul>
          </>
        )}
        {g.sources && g.sources.length > 0 && (
          <>
            <h3>Records it names <span className="count">{g.sources.reduce((n, x) => n + x.refs.length, 0)}</span></h3>
            <p className="fine">Books the writer names as a source, or sends the reader to for more, as the King James Version words them.</p>
            <ul className="fine-list">
              {g.sources.map((x) => (
                <li key={x.name}>
                  <strong>{x.name}</strong> <span className="fine">{plural(x.refs.length, "time")}:</span>{" "}
                  {x.refs.map((r, i) => <span key={r}>{i ? ", " : ""}<RefLink refText={at(g.book, r)}>{r}</RefLink></span>)}
                </li>
              ))}
            </ul>
          </>
        )}
      </Sec>

      <Sec id="author" title="Who wrote it, and when" basis={["quoted", "ai"]} intro="What early writers said, in their own words. They are witnesses to be weighed, and some depend on others.">
        {g.notes.author && <p className="note">{g.notes.author}</p>}
        {author.map((w, i) => <WitnessCard key={i} w={w} />)}
        {author.length === 0 && !g.notes.author && <p className="fine">No early writer quoted in this guide says who wrote it.{g.selfKind === "heading" ? " The opening verse, under “In its own words”, names whose words these are." : ""}</p>}
        {dating.data && (
          <div className="note">
            <strong>When it was written is disputed</strong>
            {g.datingAs && <p className="fine">The views are given under {g.datingAs} for all five books of Moses.</p>}
            <ul className="fine-list">{dating.data.views.map((v) => <li key={v.label}><strong>{v.label}.</strong> {v.who}</li>)}</ul>
            <a className="link-btn" href="#dating">See the sources for each view</a>
          </div>
        )}
        <AiDraft g={g} ask="setting" />
      </Sec>

      {received.length > 0 && (
        <Sec id="received" title="How the church received it" basis={["quoted"]}>
          {g.notes.reception && <p className="note">{g.notes.reception}</p>}
          {received.map((w, i) => <WitnessCard key={i} w={w} />)}
          {background.length > 0 && (
            <>
              <h3>{g.titles.background ?? "Background in early writers"}</h3>
              {g.notes.background && <p className="note">{g.notes.background}</p>}
              {background.map((w, i) => <WitnessCard key={i} w={w} />)}
            </>
          )}
        </Sec>
      )}

      <Sec id="shape" title="The shape of the book" basis={["counted", "ai"]}>
        <WordMap guide={g} />
        <AiDraft g={g} ask="outline" />
      </Sec>

      <Sec id="words" title="Key words" basis={["counted"]} intro={`Words ${g.name} uses far more often than the rest of the ${tName(g)}, strongest first. ${g.name} has ${pct(g.glance.words / g.glance.ntWords)}% of the ${tName(g)}'s words, so a word spread evenly would have about that share of its uses here. Tap a word for its lexicon entry and every use.`}>
        <ul className="kw-list">{g.keywords.map((k) => <WordCard key={k.id} k={k} guide={g} />)}</ul>
        {g.onlyHere.length > 0 && (
          <>
            <h3>Found only here in the {tName(g)} <span className="count">{g.onlyHere.length}</span></h3>
            <ul className="link-list">
              {only.map((w) => (
                <li key={w.id}>
                  <a href={`#word-${w.id.toLowerCase()}`}><Orig id={w.id} text={w.lemma} /> {w.translit}</a> <span className="fine">{w.gloss}{w.name ? " (a name)" : ""}</span>
                  <span className="shared">{w.refs.map((r, i) => <span key={r}>{i ? ", " : ""}<RefLink refText={at(g.book, r)}>{r}</RefLink></span>)}</span>
                </li>
              ))}
            </ul>
            {g.onlyHere.length > only.length && <button type="button" className="btn small" onClick={() => setAllOnly(true)}>Show all {g.onlyHere.length}</button>}
          </>
        )}
      </Sec>

      {g.people.length > 0 && (
        <Sec id="people" title="People named" basis={["counted"]} intro="From the app's people database. The count is of verses that name each person.">
          <p className="chips">{(allPeople ? g.people : g.people.slice(0, PEOPLE_SHOWN)).map((p) => <a key={p.id} className="chip" href={`#person-${p.id}`}>{p.name}{p.title && <span className="fine">&nbsp;· {p.title}</span>}<span className="count">{p.verses}</span></a>)}</p>
          {!allPeople && g.people.length > PEOPLE_SHOWN && <button type="button" className="btn small" onClick={() => setAllPeople(true)}>Show all {g.people.length.toLocaleString()}</button>}
        </Sec>
      )}

      <Sec id="scripture" title={isOT(g) ? "In the rest of Scripture" : "Scripture it quotes and echoes"} basis={["counted"]}>
        {isOT(g) ? (
          g.links.quotedBy.length > 0 ? (
            <>
              <h3>Quoted in the New Testament <span className="count">{g.links.quotedBy.length}</span></h3>
              <ul className="link-list">{g.links.quotedBy.map((q, i) => <li key={i}><RefLink refText={at(g.book, q.at)}>{q.at}</RefLink> in <RefLink refText={q.ref} /><span className="shared">“{q.shared}”</span></li>)}</ul>
              <p className="fine">Found by matching the wording of cross-references, five words or more. {g.links.shortQuotes > 0 ? `${plural(g.links.shortQuotes, "match", "matches")} under five words, or of a stock phrase (matched to several passages, or found in eight or more Old Testament verses), ${g.links.shortQuotes === 1 ? "is" : "are"} left out.` : ""} A shared phrase can still be an echo rather than a quotation.</p>
            </>
          ) : <p className="fine">No New Testament quotation with matching wording was found. A loose paraphrase can be missed.</p>
        ) : g.links.quotes.length > 0 ? (
          <>
            <h3>Quotations with matching wording</h3>
            <ul className="link-list">{g.links.quotes.map((q, i) => <li key={i}><RefLink refText={at(g.book, q.at)}>{q.at}</RefLink> quotes <RefLink refText={q.ref} /><span className="shared">“{q.shared}”</span></li>)}</ul>
            <p className="fine">Found by matching the wording of cross-references, five words or more. {g.links.shortQuotes > 0 ? `${plural(g.links.shortQuotes, "match", "matches")} under five words, or of a stock phrase (matched to several passages, or found in eight or more Old Testament verses), ${g.links.shortQuotes === 1 ? "is" : "are"} left out.` : ""} A shared phrase can still be an echo rather than a quotation.</p>
          </>
        ) : <p className="fine">No quotation of earlier Scripture with matching wording was found. A loose paraphrase can be missed.</p>}
        {g.links.parallelCount > 0 && (
          <>
            <h3>Shared wording elsewhere <span className="count">{g.links.parallelCount}</span></h3>
            {otherBooks.length ? otherBooks.map(([book, list]) => (
              <details key={book} className="doctrine" open={otherBooks.length < 4}>
                <summary>{book === g.name ? `Within ${g.name}` : book} <span className="count">{list.length}</span></summary>
                <ul className="link-list">{list.map((p, i) => <li key={i}><RefLink refText={at(g.book, p.at)}>{p.at}</RefLink> and <RefLink refText={p.ref} /><span className="shared">“{p.shared}”</span></li>)}</ul>
              </details>
            )) : <p className="fine">{g.name} shares long runs of wording with other passages {g.links.parallelCount.toLocaleString()} times. {g.book <= 43 ? <a href="#synopsis">Compare them in the Gospel synopsis</a> : null}</p>}
          </>
        )}
        {g.links.allusions.length > 0 && (
          <details className="doctrine">
            <summary>{isOT(g) ? "Possible echoes in the New Testament" : "Possible links to the Old Testament"} <span className="count">{g.links.allusionCount}</span></summary>
            <p className="fine">Cross-references from OpenBible.info with no matching wording, the most voted first. Treat these as leads to check.</p>
            <ul className="link-list">{g.links.allusions.map((x, i) => <li key={i}><RefLink refText={at(g.book, x.at)}>{x.at}</RefLink> and <RefLink refText={x.ref} /></li>)}</ul>
          </details>
        )}
      </Sec>

      {hb ? (
      <Sec id="text" title="The Hebrew text" basis={["counted"]} intro="The Leningrad Codex, the oldest complete Hebrew Bible, sometimes writes one word (the Ketiv) while its margin tells the reader to read another (the Qere). Translators generally follow the Qere, and so does the text counted here.">
        {hb.added.map((x) => (
          <p key={x.at + x.kind} className="note"><RefLink refText={at(g.book, x.at)} />: <span className="hebrew" lang="he" dir="rtl">{x.hebrew}</span> “{x.english.replace(/[<>]/g, "")}” isn't in the Leningrad Codex. {x.kind === "X" ? "STEP's text adds it from the Septuagint, turned back into Hebrew as the BHS or BHK apparatus gives it." : "STEP's text restores it from a parallel passage."} These words aren't counted above.</p>
        ))}
        <p className="stat-row">
          <span><strong>{hb.qere}</strong> words read differently from how they're written</span>
          <span><strong>{hb.qereMinor}</strong> more where the difference may not change a translation</span>
        </p>
        {hb.readings.length > 0 && (
          <>
            <h3>Read one way, written another <span className="count">{hb.readings.length}</span></h3>
            <ul className="variant-list">
              {hbReadings.map((r, i) => (
                <li key={i}>
                  <RefLink refText={at(g.book, r.at)}>{r.at}</RefLink>{" "}
                  Read <span className="orig hebrew" lang="he" dir="rtl">{r.read}</span> <span className="fine">“{r.english.replace(/[<>]/g, "")}”</span>
                  <div className="fine">Written <span className="hebrew" lang="he" dir="rtl">{r.written}</span> {r.translit} “{r.writtenEnglish.replace(/[<>]/g, "")}”</div>
                </li>
              ))}
            </ul>
            <p className="fine">English glosses are word for word from STEPBible, with a slash between the parts of one Hebrew word.</p>
            {hb.readings.length > hbReadings.length && <button type="button" className="btn small" onClick={() => setAllReadings(true)}>Show all {hb.readings.length}</button>}
          </>
        )}
      </Sec>
      ) : (
      <Sec id="text" title="Manuscripts and editions" basis={["counted"]} intro="Where the printed Greek editions differ: the critical editions (NA28, NA27, SBL, Westcott and Hort, Tregelles, Tyndale House) and the traditional ones (the Textus Receptus and the Byzantine text).">
        {g.textual.disputed.map((d) => (
          <div key={d.ref} className="note-card">
            <h4>{d.label}</h4>
            <p><RefLink refText={d.ref} /> {d.note}</p>
            <a className="link-btn" href="#textual">More on disputed passages</a>
          </div>
        ))}
        {g.textual.doubleBrackets.length > 0 && <p className="note">NA28 prints {g.textual.doubleBrackets.map(([a, b]) => (a === b ? `part of ${a}` : `${a}–${b.startsWith(a.split(":")[0] + ":") ? b.split(":")[1] : b}`)).join(" and ")} in double brackets, its sign for text it judges wasn't part of the original. The {g.glance.wordsInBrackets} words inside are counted above.</p>}
        <p className="stat-row">
          <span><strong>{g.textual.versesDiffer}</strong> of {g.glance.verses} verses differ</span>
          <span><strong>{g.textual.traditionalOnly}</strong> words the TR has and NA28 lacks</span>
          <span><strong>{g.textual.criticalOnly}</strong> words NA28 has and the TR lacks</span>
          <span><strong>{g.textual.readings.length}</strong> places where editions use different words</span>
        </p>
        {g.textual.readings.length > 0 && (
          <>
            <h3>Different words in the same place <span className="count">{g.textual.readings.length}</span></h3>
            <ul className="variant-list">
              {readings.map((r, i) => {
                const [c, v] = r.at.split(":").map(Number);
                return (
                  <li key={i}>
                    <RefLink refText={at(g.book, r.at)}>{r.at}</RefLink>{" "}
                    <span className="orig greek" lang="grc">{r.greek.replace(/[[\]]/g, "")}</span> <span className="fine">“{r.english.replace(/[<>]/g, "")}” in {r.editions.split("+").join(", ")}</span>
                    <div className="fine">Or <span className="greek" lang="grc">{r.other.greek}</span> “{r.other.english}” in {r.other.editions.split("+").join(", ")}. <a href={`#compare-${slug}-${c}-${v}`}>Compare</a></div>
                  </li>
                );
              })}
            </ul>
            {g.textual.readings.length > readings.length && <button type="button" className="btn small" onClick={() => setAllReadings(true)}>Show all {g.textual.readings.length}</button>}
          </>
        )}
      </Sec>
      )}

      <Sec id="chapters" title="Chapter by chapter" basis={["counted", "quoted"]}>
        <button type="button" className="btn small" aria-pressed={henryOpen} onClick={() => setHenryOpen(!henryOpen)}>{henryOpen ? "Hide" : "Show"} Matthew Henry's summary of each chapter</button>
        {henryOpen && <p className="fine">From his Commentary on the Whole Bible (1706–21). {henryNote(g.book)}</p>}
        {g.chapters.map((c) => {
          const h = henry.data?.get(c.c);
          return (
            <div key={c.c} className="section-card bg-ch">
              <div className="sec-head">
                <h3><a href={`#${readHash({ book: g.book, chapter: c.c })}`}>{g.glance.chapters === 1 ? g.name : `Chapter ${c.c}`}</a></h3>
                <span className="fine">{plural(c.verses, "verse")} · {c.words.toLocaleString()} words</span>
              </div>
              {c.keywords.length > 0 && <p className="fine">Key words: {c.keywords.map(([id, n], i) => { const k = g.keywords.find((x) => x.id === id); return <span key={id}>{i ? ", " : ""}<a href={`#word-${id.toLowerCase()}`}><Orig id={id} text={k?.lemma ?? ""} /></a> {n}</span>; })}</p>}
              {c.people.length > 0 && <p className="fine">People: {c.people.map((id, i) => <span key={id}>{i ? ", " : ""}<a href={`#person-${id}`}>{g.people.find((p) => p.id === id)?.name ?? id}</a></span>)}</p>}
              {c.quotes.length > 0 && <p className="fine">{isOT(g) ? "Quoted in" : "Quotes"}: {c.quotes.map((r, i) => <span key={i}>{i ? ", " : ""}<RefLink refText={r} /></span>)}</p>}
              {henryOpen && (henry.loading ? <Loading /> : h ? <blockquote className="bg-quote henry"><Paras text={h.text} /></blockquote> : null)}
              <p className="ex-actions"><a href={`#${readHash({ book: g.book, chapter: c.c })}`}>Read</a><a href={`#on-${slug}-${c.c}`}>What writers said</a></p>
            </div>
          );
        })}
      </Sec>

      <Sec id="older" title="Older introductions" basis={["quoted"]} intro="Introductions from public-domain reference works. They are older scholarship, so weigh them against newer work.">
        {g.henry && (
          <details className="doctrine">
            <summary>Matthew Henry's Commentary: introduction to {g.name}</summary>
            {g.henry.completedBy && <p className="fine">{henryNote(g.book)}</p>}
            <Paras text={g.henry.text} />
            <p className="fine">{g.henry.source}.</p>
          </details>
        )}
        {g.dictionaries.map(([k, head]) => <DictionaryEntry key={`${k}${head}`} k={k} head={head} />)}
      </Sec>

      <Sec id="themes" title="Themes and questions" basis={["ai"]}>
        <label className="field-inline" htmlFor="bg-lens">Theological lens <LensSelect id="bg-lens" value={prefs.lens} onChange={(l) => setPref("lens", l)} /></label>
        <AiMissing />
        <AiDraft g={g} ask="themes" />
        <AiDraft g={g} ask="questions" />
      </Sec>

      <Sec id="notes" title="Your notes" basis={["you"]}>
        <BookNotes g={g} />
        <h3>Edit, print or export</h3>
        <p className="fine">A study guide holds this page's counted and quoted sections, any AI drafts you add, and your own writing. From there it prints, and exports to Word or PDF.</p>
        {existing
          ? <a className="btn primary" href={`#guide-${existing.id}`}>Open “{existing.title}”</a>
          : <button type="button" className="btn primary" onClick={() => navigate(`guide-${addToBookGuide(g, [])}`)}>Make a study guide from this page</button>}
      </Sec>
    </div>
  );
}
