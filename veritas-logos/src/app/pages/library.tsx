import { useEffect, useRef, useState } from "react";
import { TRANSLATIONS } from "../../core/bible";
import { getFigure } from "../../core/figure-graph";
import { ensureFigures } from "../../core/people";
import { bookName } from "../../core/references";
import { detectAi, resetAiDetection, type AiMode } from "../ai-client";
import { IS_ARTIFACT, saveFile, copyText } from "../files";
import { mergeData, setPref, toast, update, useData, useSyncState, getData } from "../store";
import { Empty, RefLink, TranslationSelect, LensSelect, useAsync } from "../ui";

const keyToRef = (k: string) => {
  const [b, c, rest] = k.split(":");
  return `${bookName(Number(b))} ${c}:${(rest ?? "").replace("-", "–")}`;
};

export function LibraryPage() {
  const { prefs, notes, highlights, bookmarks, figures, guides } = useData();
  const [tab, setTab] = useState<"notes" | "marks" | "settings" | "about">("notes");
  const file = useRef<HTMLInputElement | null>(null);
  const [ai, setAi] = useState<AiMode | null>(null);
  const sync = useSyncState();
  useEffect(() => { detectAi().then(setAi); }, []);
  useAsync(ensureFigures, []);
  const notesList = Object.values(notes).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const hlList = Object.entries(highlights);

  const backup = () => saveFile("veritas-logos-backup.json", JSON.stringify({ ...getData(), prefs: { ...getData().prefs, apiKey: "" } }, null, 1), "application/json");
  const restore = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const data = mergeData(raw);
      update((d) => ({ ...data, prefs: { ...data.prefs, apiKey: d.prefs.apiKey, apiBase: d.prefs.apiBase } }));
      toast("Backup restored");
    } catch { toast("That file couldn't be read."); }
  };

  return (
    <div className="page prose">
      <h1 className="page-title">Library</h1>
      <div className="segmented" role="tablist">
        {(["notes", "marks", "settings", "about"] as const).map((t) => <button type="button" key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "notes" ? "Notes" : t === "marks" ? "Saved" : t === "settings" ? "Settings" : "About"}</button>)}
      </div>

      {tab === "notes" && (notesList.length ? notesList.map((n) => (
        <article key={n.key} className="note-card"><h4><RefLink refText={n.ref} /></h4><p style={{ whiteSpace: "pre-wrap" }}>{n.text}</p><p className="fine">{new Date(n.updatedAt).toLocaleDateString()}</p></article>
      )) : <Empty>Tap any verse in the reader and choose “My note” to start. Notes stay on this device.</Empty>)}

      {tab === "marks" && (
        <>
          <h3>Bookmarks</h3>
          {bookmarks.length ? <ul className="link-list">{bookmarks.map((k) => <li key={k}><RefLink refText={keyToRef(k)} /></li>)}</ul> : <Empty>No bookmarks yet.</Empty>}
          <h3>Highlights</h3>
          {hlList.length ? <ul className="link-list">{hlList.map(([k, c]) => <li key={k}><span className={`swatch inline hl-${c}`} /><RefLink refText={keyToRef(k)} /></li>)}</ul> : <Empty>No highlights yet.</Empty>}
          <h3>Saved people</h3>
          {figures.length ? <ul className="link-list">{figures.map((id) => <li key={id}><a href={`#person-${id}`}>{getFigure(id)?.name ?? id}</a></li>)}</ul> : <Empty>No saved people yet.</Empty>}
        </>
      )}

      {tab === "settings" && (
        <div className="form">
          <h3>Reading</h3>
          <div><label className="label" htmlFor="set-translation">Bible translation</label><TranslationSelect id="set-translation" value={prefs.translation} onChange={(t) => setPref("translation", t)} /></div>
          <ul className="fine-list">{TRANSLATIONS.map((t) => <li key={t.id}><strong>{t.id}</strong> {t.name} ({t.year}). {t.style}.</li>)}</ul>
          <div><label className="label" htmlFor="set-lens">Theological lens</label><LensSelect id="set-lens" value={prefs.lens} onChange={(l) => setPref("lens", l)} /></div>
          <div><label className="label" htmlFor="set-theme">Appearance</label><select id="set-theme" value={prefs.theme} onChange={(e) => setPref("theme", e.target.value as "system" | "light" | "dark")}><option value="system">Match this device</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
          <div><label className="label" htmlFor="set-rate">Read-aloud speed</label><select id="set-rate" value={prefs.rate} onChange={(e) => setPref("rate", Number(e.target.value))}>{[0.85, 1, 1.15, 1.3].map((r) => <option key={r} value={r}>{r}×</option>)}</select></div>

          <h3>AI assistant</h3>
          <p>{ai === "viewer" ? "On. It runs through your Claude account, so there's nothing to set up or pay for separately. You'll be asked to allow it the first time." : ai === "server" ? "On. It runs through this app's API server." : "Not available in this copy of the app."}</p>
          {!IS_ARTIFACT && (
            <>
              <p className="fine">If you host your own API server, enter its address and your API key. The AI provider's key stays on the server.</p>
              <div><label className="label" htmlFor="set-api">API server address</label><input id="set-api" className="input" value={prefs.apiBase} placeholder="https://api.example.org" onChange={(e) => setPref("apiBase", e.target.value)} /></div>
              <div><label className="label" htmlFor="set-key">Your API key</label><input id="set-key" className="input" type="password" autoComplete="off" value={prefs.apiKey} onChange={(e) => setPref("apiKey", e.target.value)} /></div>
              <button type="button" className="btn small" onClick={() => { resetAiDetection(); detectAi().then((m) => { setAi(m); toast(m === "server" ? "AI assistant connected" : "Couldn't reach an AI server there"); }); }}>Test connection</button>
            </>
          )}

          <h3>Your data</h3>
          <p>{guides.length} guides, {notesList.length} notes, {hlList.length} highlights.</p>
          <p className="sync-state">{sync === "saved" ? "Saved privately to your Claude account, so it follows you between devices." : sync === "saving" ? "Saving to your Claude account…" : sync === "connecting" ? "Connecting to your Claude account…" : sync === "failed" ? "Couldn't reach your Claude account, so this is only in this browser for now. Back up anything you want to keep." : "Stored only in this browser. Clearing browser data removes it, so back up anything you want to keep."}</p>
          <div className="action-row">
            <button type="button" className="btn small primary" onClick={backup}>Back up</button>
            <button type="button" className="btn small" onClick={() => file.current?.click()}>Restore or import</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
          </div>
        </div>
      )}

      {tab === "about" && <About />}
    </div>
  );
}

function About() {
  const [host, setHost] = useState("");
  useEffect(() => { setHost(location.origin); }, []);
  const sample = `<script src="${host}/veritas-embed.js" async></script>\n<veritas-passage reference="John 3:16-18" translation="BSB"></veritas-passage>`;
  return (
    <>
      <h3>About Veritas Logos</h3>
      <p>A personal Bible study guide builder and reference tool. Everything it stores comes from a named source that you can check. It holds no hand-written commentary.</p>
      <h3>How to weigh what you read</h3>
      <dl className="facts">
        <dt>From cited sources</dt><dd>Looked up from the datasets below, chosen by rule.</dd>
        <dt>AI draft</dt><dd>Written on request by an AI model. It isn't stored as reference data, it can be wrong, and it stays labeled until you mark it checked.</dd>
        <dt>Your writing</dt><dd>What you add yourself.</dd>
      </dl>
      <h3>Sources and licenses</h3>
      <ul className="fine-list">
        <li><strong>Bible text:</strong> BSB (CC0), NHEB, KJV (Crown rights apply in the UK), ASV and YLT (public domain), via scrollmapper/bible_databases.</li>
        <li><strong>Hebrew, Greek and lexicons:</strong> TAHOT, TAGNT, TBESH and TBESG from STEP Bible (Tyndale House, Cambridge), CC BY 4.0.</li>
        <li><strong>Strong's dictionaries:</strong> Open Scriptures, CC BY-SA.</li>
        <li><strong>Cross-references:</strong> OpenBible.info, CC BY. Quotations are detected from these by matching wording.</li>
        <li><strong>Topics:</strong> Nave's Topical Bible (public domain), via BibleData by Brady Stephenson, CC BY 4.0.</li>
        <li><strong>People, family links, book names and chronology:</strong> BibleData, CC BY 4.0.</li>
        <li><strong>Confessions:</strong> public-domain texts and proof lists via Creeds.json.</li>
        <li><strong>Church Fathers:</strong> public-domain translations, chiefly the Ante-Nicene and Nicene and Post-Nicene Fathers and Newman's Catena Aurea, via HistoricalChristianFaith's Commentaries and Writings databases. Each quote was matched word for word against the named edition, and quotes that failed were dropped.</li>
        <li><strong>Citations and Calvin's commentaries:</strong> tagged Scripture references and commentary sections from CCEL's files, used where a file's rights field says public domain, plus older works with no rights statement after checking each edition's date. DATA-LICENSES.md lists them. CCEL's site can't be reached from where this app was built, so these came from a third-party copy of its files on GitHub.</li>
        <li><strong>Theological terms:</strong> Easton's Bible Dictionary (1897), Schaff's Dictionary of the Bible (1880) and Smith's Bible Dictionary from CCEL's files via the NEUU dataset (CC BY 4.0), the catechisms above, Schaff's History of the Christian Church, Hodge's Systematic Theology and Watson's A Body of Divinity.</li>
        <li><strong>Your glossary:</strong> your Theological Terms document, word for word and labeled as yours. It names no sources, so it isn't treated as a cited source.</li>
        <li><strong>Later teachers:</strong> Matthew Henry and Spurgeon's Treasury of David via LyteWord (CC0); Wesley's Explanatory Notes (public domain, structured by History of Methodism, CC BY 4.0); Calvin's Institutes, Luther on Galatians (Graebner's 1949 abridgment) and Edwards's sermons via Project Gutenberg. Spurgeon's sermons are an index that links out.</li>
        <li><strong>New Testament dates:</strong> the years in Ussher's Annals of the World (1650), via BibleData. The captions are plain labels for the cited passages.</li>
      </ul>
      <p className="fine">A source can still contain errors, and its chronology and family links reflect its editors' judgment. Citations let you check them against the verses.</p>
      <p className="fine">NIV, ESV, NASB, NLT and CJB are under copyright, so they aren't included.</p>
      <h3>Connect other apps</h3>
      {IS_ARTIFACT ? <p className="fine">Embeds and the public API are available once the app is on your own website. See the API guide in the project files.</p> : (
        <>
          <p>Show a live passage on any web page:</p>
          <textarea id="embed-sample" aria-label="Embed sample" className="input mono" rows={3} readOnly value={sample} />
          <button type="button" className="btn small" onClick={() => copyText(sample)}>Copy</button>
          <p className="fine">Link to any screen by copying its address. Developers can use the REST API described at <code>/v1/openapi.json</code> on the API server.</p>
        </>
      )}
    </>
  );
}
