import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { decodeVerseCode, getVerse, refOf, type TranslationId } from "../../core/bible";
import { getConcordance, getLexEntry, normalizeStrongs } from "../../core/lexicon";
import { readingWords, readingWordTag, type ReadingWord } from "../../core/reader-text";
import { taggedVerse } from "../../core/scholar";
import { readHash } from "../routes";
import { ErrorNote, LexText, Loading, useAsync } from "../ui";

export function ReaderWords({ text, words, differences, onWord }: {
  text: string;
  words: ReadingWord[];
  differences?: Set<number>;
  onWord?: (index: number, trigger: HTMLButtonElement) => void;
}) {
  if (!onWord && !differences?.size) return text;
  return (
    <>
      {words.map((word, index) => {
        const content = differences?.has(index) ? <mark className="word-difference">{word.text}</mark> : word.text;
        return (
          <Fragment key={word.start}>
            {text.slice(words[index - 1]?.end ?? 0, word.start)}
            {onWord
              ? <button type="button" className="reader-word" aria-haspopup="dialog" onClick={(e) => onWord(index, e.currentTarget)}>{content}</button>
              : content}
          </Fragment>
        );
      })}
      {text.slice(words.at(-1)?.end ?? 0)}
    </>
  );
}

export interface WordSelection {
  verse: number;
  translation: TranslationId;
  words: ReadingWord[];
  index: number;
  trigger: HTMLButtonElement;
}

function Lemma({ id, book, chapter, verse }: { id: string; book: number; chapter: number; verse: number }) {
  const [showOccurrences, setShowOccurrences] = useState(false);
  const { data: entry, loading } = useAsync(() => getLexEntry(id), [id]);
  const { data: codes, loading: finding } = useAsync(() => showOccurrences ? getConcordance(id) : Promise.resolve(null), [id, showOccurrences]);
  const otherVerses = codes?.filter((code) => code !== book * 1000000 + chapter * 1000 + verse);
  const hebrew = id.startsWith("H");
  const sense = entry?.m?.[0];

  if (loading) return <Loading label="Loading lexicon" />;
  return (
    <>
      <p className="fine lemma-source">{hebrew ? "Hebrew" : "Greek"} · {id}</p>
      <p className="reader-lemma">
        <strong lang={hebrew ? "he" : "grc"} dir={hebrew ? "rtl" : "ltr"}>{entry?.l ?? sense?.l ?? id}</strong>
        {(entry?.x || sense?.x) && <span> {entry?.x ?? sense?.x}</span>}
      </p>
      {sense?.g && <p><strong>{sense.g}</strong></p>}
      {sense?.t ? <div className="lex-text"><LexText text={sense.t} /></div> : <p>{entry?.s?.trim() || "No definition is available for this tag."}</p>}
      <div className="action-row">
        <button type="button" className="btn small" aria-expanded={showOccurrences} aria-controls="reader-occurrences"
          onClick={() => setShowOccurrences(!showOccurrences)}>Other occurrences</button>
        <a className="btn small" href={`#word-${id.toLowerCase()}`}>Full lexicon and concordance</a>
      </div>
      <div id="reader-occurrences" hidden={!showOccurrences}>
        {finding ? <Loading label="Finding occurrences" /> : otherVerses?.length ? (
          <>
            <p className="fine">{otherVerses.length.toLocaleString()} other {otherVerses.length === 1 ? "verse" : "verses"}</p>
            <ul className="reader-occurrences">
              {otherVerses.slice(0, 8).map((code) => {
                const place = decodeVerseCode(code);
                return <li key={code}><a href={`#${readHash(place)}`}>{refOf(place.book, place.chapter, place.verse)}</a></li>;
              })}
            </ul>
          </>
        ) : <p className="fine">No other verses found for this lemma.</p>}
      </div>
      <p className="fine lemma-source">Definitions from STEP Bible and Open Scriptures.</p>
    </>
  );
}

export function ReaderLexicon({ book, chapter, selection, onClose, onStudy }: {
  book: number;
  chapter: number;
  selection: WordSelection;
  onClose: (restoreFocus?: boolean) => void;
  onStudy: () => void;
}) {
  const { verse, words, index, translation, trigger } = selection;
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [picked, setPicked] = useState("");
  const { data, loading, error } = useAsync(async () => {
    const [tags, bsb] = await Promise.all([
      taggedVerse(book, chapter, verse),
      translation === "BSB" ? Promise.resolve("") : getVerse("BSB", book, chapter, verse),
    ]);
    const bsbWords = readingWords(bsb);
    const sameWording = bsbWords.length === words.length && bsbWords.every((word, i) => word.key === words[i].key);
    const strong = translation === "BSB" || sameWording ? readingWordTag(words, index, tags) : "";
    return { id: normalizeStrongs(strong), tags };
  }, [book, chapter, selection]);

  useLayoutEffect(() => {
    const card = panel.current;
    if (!card) return;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const margin = 12;
      const width = card.offsetWidth;
      const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
      const below = window.innerHeight - anchor.bottom - margin;
      const above = anchor.top - margin;
      const openAbove = below < 250 && above > below;
      card.style.left = `${left}px`;
      card.style.top = openAbove ? "auto" : `${anchor.bottom + 4}px`;
      card.style.bottom = openAbove ? `${window.innerHeight - anchor.top + 4}px` : "auto";
      card.style.maxHeight = `${Math.max(100, (openAbove ? above : below) - 4)}px`;
    };
    place();
    card.focus({ preventScroll: true });
    const onScroll = () => {
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom <= 0 || anchor.top >= window.innerHeight) close.current(false);
      else place();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll);
    };
  }, [trigger]);

  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (e.target instanceof Node && !panel.current?.contains(e.target) && !trigger.contains(e.target)) close.current(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [trigger]);

  const id = picked || data?.id;
  return (
    <section className="reader-lexicon" ref={panel} role="dialog" aria-labelledby="reader-lexicon-title" tabIndex={-1}
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget) && e.relatedTarget !== trigger) close.current(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        close.current();
      }}>
      <div className="reader-lexicon-head">
        <div><h3 id="reader-lexicon-title">{words[index].text}</h3><p className="fine">{refOf(book, chapter, verse)} · {translation}</p></div>
        <button className="icon-btn" type="button" aria-label="Close word lookup" onClick={() => close.current()}>×</button>
      </div>
      {loading && <Loading label="Looking up word" />}
      <ErrorNote error={error} />
      {id && <Lemma key={id} id={id} book={book} chapter={chapter} verse={verse} />}
      {data && !loading && !id && <p>This word has no confirmed original-language match in the bundled BSB alignment.</p>}
      {data && !loading && !data.id && data.tags.some((tag) => normalizeStrongs(tag.strong)) && (
        <div className="reader-tagged">
          <h4>Tagged BSB wording</h4>
          {data.tags.map((tag, i) => {
            const strong = normalizeStrongs(tag.strong);
            return strong
              ? <button type="button" key={i} className="tag-word" aria-pressed={picked === strong} onClick={() => setPicked(strong)}>{tag.text}</button>
              : <Fragment key={i}>{` ${tag.text} `}</Fragment>;
          })}
        </div>
      )}
      <button type="button" className="link-btn" onClick={onStudy}>Study this verse</button>
    </section>
  );
}
