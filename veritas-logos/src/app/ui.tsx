import { useEffect, useRef, useState, type ReactNode } from "react";
import { getPassage, GROUP_NAMES, translationInfo, TRANSLATIONS, type TranslationGroup, type TranslationId } from "../core/bible";
import { LENS_IDS, type LensId } from "../core/content";
import { lensName, ORIGIN_LABEL, type Origin } from "../core/guide";
import { findReferences } from "../core/references";
import { hashForReference } from "./routes";
import { navigate, openPeek, useData, useUi } from "./store";

export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): { data?: T; error?: Error; loading: boolean } {
  const [s, setS] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setS((p) => ({ ...p, loading: true, error: undefined }));
    fn().then(
      (data) => live && setS({ data, loading: false }),
      (error) => live && setS({ error, loading: false }),
    );
    return () => { live = false; };
  }, deps);
  return s;
}

export const Loading = ({ label = "Loading" }: { label?: string }) => <div className="loading" role="status"><span className="dot" />{label}…</div>;
export const ErrorNote = ({ error }: { error?: Error | null }) =>
  error ? <p className="note warn">This couldn't load. Check your connection and try again.</p> : null;

export function RefLink({ refText, children }: { refText: string; children?: ReactNode }) {
  return <button type="button" className="ref" onClick={() => openPeek(refText)}>{children ?? refText}</button>;
}

/** Text with every Scripture reference tappable. */
export function RefText({ text }: { text: string }) {
  const parts = findReferences(text);
  return <>{parts.map((p, i) => (p.ref ? <RefLink key={i} refText={p.ref} /> : <span key={i}>{p.text}</span>))}</>;
}

export const Paras = ({ text }: { text: string }) => <>{text.split(/\n{2,}/).map((p, i) => <p key={i}><RefText text={p} /></p>)}</>;

export const OriginTag = ({ origin }: { origin: Origin }) =>
  origin === "you" ? null : <span className={`origin origin-${origin}`}>{ORIGIN_LABEL[origin]}</span>;

export function Tag({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`tag ${tone ? `tag-${tone}` : ""}`}>{children}</span>;
}

export function Sheet({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("sheet-open");
    // The phone's Back button closes the sheet instead of leaving the page.
    const startHref = location.href;
    let closedByBack = false;
    try { history.pushState({ sheet: true }, ""); } catch { /* some hosts refuse this */ }
    const onPop = () => { if (location.href !== startHref) return; closedByBack = true; close.current(); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      document.body.classList.remove("sheet-open");
      if (!closedByBack && location.href === startHref && history.state?.sheet) { try { history.back(); } catch { /* fine */ } }
    };
  }, []);
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">{title}</div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Picks a translation, grouped. `localOnly` leaves out the licensed ones, for features that work on the built-in
 * text (search, AI, guides). */
export function TranslationSelect({ value, onChange, id = "translation", allowNone, short, localOnly }: { value: TranslationId | ""; onChange: (v: any) => void; id?: string; allowNone?: boolean; short?: boolean; localOnly?: boolean }) {
  const groups = (Object.keys(GROUP_NAMES) as TranslationGroup[]).filter((g) => !(localOnly && g === "online"));
  return (
    <select id={id} aria-label="Bible translation" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">None</option>}
      {groups.map((g) => (
        <optgroup key={g} label={GROUP_NAMES[g]}>
          {TRANSLATIONS.filter((t) => t.group === g).map((t) => <option key={t.id} value={t.id}>{short ? t.id : `${t.id} · ${t.name}`}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function LensSelect({ value, onChange, id = "lens" }: { value: LensId; onChange: (v: LensId) => void; id?: string }) {
  return (
    <select id={id} aria-label="Theological lens" value={value} onChange={(e) => onChange(e.target.value as LensId)}>
      {LENS_IDS.map((l) => <option key={l} value={l}>{lensName(l)}</option>)}
    </select>
  );
}

/** Shows a passage from anywhere in the app. Mounted once at the root. */
export function PassagePeek() {
  const { peek } = useUi();
  const { prefs } = useData();
  const { data, loading } = useAsync(() => (peek ? getPassage(prefs.translation, peek) : Promise.resolve(null)), [peek, prefs.translation]);
  if (!peek) return null;
  const hash = hashForReference(peek);
  return (
    <Sheet title={peek} onClose={() => openPeek(null)}>
      {loading && <Loading />}
      {!loading && !data && <p className="note warn">{peek} isn't a reference this app can find.</p>}
      {data && (
        <>
          <div className="scripture small">
            {data.parts.map((p, i) => (
              <p key={i}>{data.parts.length > 1 && <strong>{p.label} </strong>}{p.verses.map((v) => <span key={v.verse}><sup>{v.verse}</sup>{v.text || "(not in this translation)"} </span>)}</p>
            ))}
          </div>
          <p className="fine">{translationInfo(data?.translation ?? prefs.translation).name}</p>
          {hash && <button type="button" className="btn" onClick={() => { openPeek(null); navigate(hash); }}>Open in reader</button>}
        </>
      )}
    </Sheet>
  );
}

export function Toast() {
  const { toast } = useUi();
  return toast ? <div className="toast" role="status">{toast}</div> : null;
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;

/** Renders the lexicon's limited markup (<b>, <i>, newlines) without using raw HTML. */
export function LexText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /<(b|i)>(.*?)<\/\1>/gs;
  let last = 0, m: RegExpExecArray | null, k = 0;
  const pushPlain = (s: string) => {
    s.split("\n").forEach((line, i) => {
      if (i) nodes.push(<br key={`br${k++}`} />);
      if (line) nodes.push(<span key={`t${k++}`}>{line}</span>);
    });
  };
  while ((m = re.exec(text))) {
    pushPlain(text.slice(last, m.index));
    nodes.push(m[1] === "b" ? <strong key={`b${k++}`}>{m[2].replace(/<[^>]+>/g, "")}</strong> : <em key={`i${k++}`}>{m[2].replace(/<[^>]+>/g, "")}</em>);
    last = m.index + m[0].length;
  }
  pushPlain(text.slice(last));
  return <>{nodes}</>;
}
