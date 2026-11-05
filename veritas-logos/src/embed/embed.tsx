/**
 * The small page other sites frame: embed.html#passage-john-3-16-18-kjv, #guide-<code>, #word-g26, #person-david.
 * It reports its height to the parent so the frame can size itself.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getPassage, isTranslationId, DEFAULT_TRANSLATION, translationInfo, type Passage, refOf } from "../core/bible";
import { resolveGuide, sanitizeGuide, type ResolvedGuide, ORIGIN_LABEL } from "../core/guide";
import { decodeFromLink } from "../app/files";
import { parseReadParts } from "../app/routes";
import { getLexEntry } from "../core/lexicon";
import { ensureFigures } from "../core/people";
import { getFigure } from "../core/figure-graph";

const params = new URLSearchParams(location.search);
if (params.get("theme")) document.documentElement.setAttribute("data-theme", params.get("theme")!);
const appUrl = new URL("./", location.href).href;

function Credit({ hash, children }: { hash?: string; children?: ReactNode }) {
  return <p className="fine e-credit">{children} <a href={`${appUrl}${hash ? `#${hash}` : ""}`} target="_blank" rel="noopener">Open in Veritas Logos</a></p>;
}

function PassageView({ passage, hash }: { passage: Passage; hash: string }) {
  return (
    <article>
      <h2 className="e-title">{passage.reference}</h2>
      <div className="scripture small">{passage.parts.map((p, i) => <p key={i}>{p.verses.map((v) => <span key={`${v.chapter}.${v.verse}`}><sup>{v.verse}</sup>{v.text || "(not in this translation)"} </span>)}</p>)}</div>
      <Credit hash={hash}>{translationInfo(passage.translation).notice}</Credit>
    </article>
  );
}

function GuideView({ guide }: { guide: ResolvedGuide }) {
  return (
    <article className="doc">
      <h1>{guide.title}</h1>
      {guide.subtitle && <p className="sub">{guide.subtitle}</p>}
      {guide.sections.map((s) => (
        <section key={s.id}>
          <h2>{s.heading}</h2>
          {s.origin !== "you" && <p className="fine">{ORIGIN_LABEL[s.origin]}</p>}
          {s.body && s.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
          {s.verses && <blockquote className="scripture small">{s.verses.map((v) => <span key={`${v.chapter}.${v.verse}`}><sup>{v.verse}</sup>{v.text} </span>)}<cite>{s.ref} ({guide.translation})</cite></blockquote>}
          {s.items && (s.kind === "questions" ? <ol>{s.items.map((it, i) => <li key={i}>{it.text}</li>)}</ol> : <ul>{s.items.map((it, i) => <li key={i}>{it.label && <strong>{it.label}: </strong>}{it.ref && <><strong>{it.ref}</strong>{it.quote ? `: ${it.quote}` : ""}</>}{it.text}</li>)}</ul>)}
        </section>
      ))}
      <Credit>{guide.notice}</Credit>
    </article>
  );
}

function Embed() {
  const [content, setContent] = useState<ReactNode>(<p className="fine">Loading…</p>);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let live = true;
    const route = location.hash.slice(1);
    const [head, ...rest] = route.split("-");
    const tail = rest.join("-");
    (async () => {
      if (head === "passage") {
        const r = parseReadParts(tail);
        if (!r) return <p>This passage link isn't valid.</p>;
        const t = r.translation && isTranslationId(r.translation) ? r.translation : DEFAULT_TRANSLATION;
        const p = await getPassage(t, refOf(r.book, r.chapter, r.verse, r.verseEnd));
        return p ? <PassageView passage={p} hash={`read-${tail}`} /> : <p>This passage link isn't valid.</p>;
      }
      if (head === "guide") {
        const g = sanitizeGuide(await decodeFromLink(tail));
        return g ? <GuideView guide={await resolveGuide(g)} /> : <p>This guide link isn't valid.</p>;
      }
      if (head === "word") {
        const e = await getLexEntry(tail);
        return e ? <article><h2 className="e-title orig-big" dir="auto">{e.l}</h2><p className="sub">{e.x} · {tail.toUpperCase()}</p><p>{e.s}</p><p className="fine">{e.c.toLocaleString()} occurrences</p><Credit hash={`word-${tail}`} /></article> : <p>That word wasn't found.</p>;
      }
      if (head === "person") {
        await ensureFigures();
        const f = getFigure(tail);
        return f ? <article><h2 className="e-title">{f.name}</h2><p className="sub">{f.title}</p><Credit hash={`person-${tail}`} /></article> : <p>That person wasn't found.</p>;
      }
      return <p>Nothing to show. Add a passage, guide, word or person to the link.</p>;
    })().then((node) => live && setContent(node), () => live && setContent(<p>This content couldn't load.</p>));
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!box.current || parent === window) return;
    const send = () => parent.postMessage({ type: "veritas:height", id: params.get("id"), height: document.documentElement.scrollHeight }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(box.current);
    send();
    return () => ro.disconnect();
  }, []);
  return <div ref={box} className="embed">{content}</div>;
}

createRoot(document.getElementById("root")!).render(<Embed />);
