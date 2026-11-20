import { useEffect, useRef, useState } from "react";
import { GROUP_NAMES, OFFERED, TRANSLATIONS, localTranslation, type TranslationGroup } from "../../core/bible";
import { CONNECTOR } from "../online-bible";
import { getFigure } from "../../core/figure-graph";
import { ensureFigures } from "../../core/people";
import { passageMarkReference } from "../notebook-entries";
import { NotebookCollectionView } from "./notebook-collection";
import { detectAi, resetAiDetection, type AiMode } from "../ai-client";
import { IS_ARTIFACT, saveFile, copyText } from "../files";
import { offlineSupported, prepareOffline, useOfflineStatus } from "../offline";
import { BUILT_IN, mb } from "../speech";
import { combineData, mergeData, setPref, toast, update, useData, useSyncState, useSyncTarget, getData, type SyncState, type SyncTarget, type UserData } from "../store";
import { ACCOUNTS_ON, IN_CLAUDE, useAccount } from "../account";
import { Empty, RefLink, TranslationSelect, ThemeSelect, LensSelect, useAsync } from "../ui";


/** "NIV, NLT and NKJV": the licensed translations on offer, and a line for any still waiting for approval. */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const ONLINE_OFFERED = andList(OFFERED.filter((t) => t.group === "online").map((t) => t.id));
const WAITING_NOTE = TRANSLATIONS.filter((t) => t.waiting).map((t) => ` The ${t.id} will be added once its publisher approves the key.`).join("");

const SYNC_TEXT: Record<SyncTarget | "none", Record<SyncState, string>> = {
  claude: {
    saved: "Saved privately to your Claude account, so it follows you between devices.",
    saving: "Saving to your Claude account…",
    connecting: "Connecting to your Claude account…",
    failed: "Couldn't reach your Claude account, so this is only in this browser for now. Back up anything you want to keep.",
    local: "Stored only in this browser. Clearing browser data removes it, so back up anything you want to keep.",
  },
  account: {
    saved: "Saved to your account, so it's the same on every device where you sign in.",
    saving: "Saving to your account…",
    connecting: "Connecting to your account…",
    failed: "Couldn't reach your account just now. Your work is kept in this browser and saved when the connection is back.",
    local: "Stored only in this browser. Clearing browser data removes it, so back up anything you want to keep.",
  },
  none: {
    saved: "", saving: "", connecting: "", failed: "",
    local: "Stored only in this browser. Clearing browser data removes it, so back up anything you want to keep.",
  },
};
/** One line on where the reader's data is being kept right now. */
export function SyncLine({ sync, target }: { sync: SyncState; target: SyncTarget | null }) {
  const text = SYNC_TEXT[target ?? "none"][sync] || SYNC_TEXT.none.local;
  return <p className={`sync-state${sync === "failed" ? " is-failed" : ""}`}>{text}</p>;
}

export function LibraryPage() {
  const { prefs, notebook, notes, highlights, bookmarks, figures, guides } = useData();
  const [tab, setTab] = useState<"notes" | "marks" | "settings" | "about">("notes");
  const file = useRef<HTMLInputElement | null>(null);
  const [ai, setAi] = useState<AiMode | null>(null);
  const sync = useSyncState();
  const offline = useOfflineStatus();
  const offlineTranslation = localTranslation(prefs.translation);
  const target = useSyncTarget();
  const acct = useAccount();
  const [incoming, setIncoming] = useState<{ data: UserData; name: string } | null>(null);
  useEffect(() => { detectAi().then(setAi); }, []);
  useAsync(ensureFigures, []);
  const noteCount = notebook.length + Object.keys(notes).length;
  const hlList = Object.entries(highlights);

  const backup = () => saveFile("veritas-logos-backup.json", JSON.stringify({ ...getData(), prefs: { ...getData().prefs, apiKey: "" } }, null, 1), "application/json");
  const readBackup = async (f: File) => {
    try { setIncoming({ data: mergeData(JSON.parse(await f.text())), name: f.name }); } catch { toast("That file couldn't be read."); }
  };
  // Adding keeps everything here and brings in what the backup has, keeping the later version of anything in both.
  // Replacing makes this copy exactly the backup, which is how to go back to an earlier state.
  const restore = (how: "add" | "replace") => {
    if (!incoming) return;
    const data = incoming.data;
    update((d) => {
      const next = how === "add" ? combineData(d, data) : data;
      return { ...next, prefs: { ...next.prefs, apiKey: d.prefs.apiKey, apiBase: d.prefs.apiBase } };
    });
    setIncoming(null);
    toast(how === "add" ? "Backup added" : "Backup restored");
  };

  return (
    <div className="page prose library-page">
      <h1 className="page-title">Library</h1>
      <div className="library-shortcuts" aria-label="Your study work">
        <a className="btn" href="#guides">Study guides</a>
        <a className="btn" href="#sources-list">My sources</a>
      </div>
      <div className="segmented" role="tablist">
        {(["notes", "marks", "settings", "about"] as const).map((t) => <button type="button" key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "notes" ? "Notebook" : t === "marks" ? "Saved" : t === "settings" ? "Settings" : "About"}</button>)}
      </div>

      {tab === "notes" && <NotebookCollectionView />}

      {tab === "marks" && (
        <>
          <h3>Bookmarks</h3>
          {bookmarks.length ? <ul className="link-list">{bookmarks.map((k) => <li key={k}><RefLink refText={passageMarkReference(k) ?? k} /></li>)}</ul> : <Empty>No bookmarks yet.</Empty>}
          <h3>Highlights</h3>
          {hlList.length ? <ul className="link-list">{hlList.map(([k, c]) => <li key={k}><span className={`swatch inline hl-${c}`} /><RefLink refText={passageMarkReference(k) ?? k} /></li>)}</ul> : <Empty>No highlights yet.</Empty>}
          <h3>Saved people</h3>
          {figures.length ? <ul className="link-list">{figures.map((id) => <li key={id}><a href={`#person-${id}`}>{getFigure(id)?.name ?? id}</a></li>)}</ul> : <Empty>No saved people yet.</Empty>}
        </>
      )}

      {tab === "settings" && (
        <div className="form">
          <h3>Reading</h3>
          <div><label className="label" htmlFor="set-translation">Bible translation</label><TranslationSelect id="set-translation" value={prefs.translation} onChange={(t) => setPref("translation", t)} /></div>
          <details className="bg-key">
            <summary>About the {OFFERED.length} translations</summary>
            {(Object.keys(GROUP_NAMES) as TranslationGroup[]).map((g) => (
              <div key={g}>
                <h4>{GROUP_NAMES[g]}</h4>
                <ul className="fine-list">{OFFERED.filter((t) => t.group === g).map((t) => <li key={t.id}><strong>{t.id}</strong> {t.name} ({t.year}). {t.style}{t.covers ? `; it has ${t.covers}` : ""}. <span className="fine">{t.notice}</span>{t.link && <> <a href={t.link.url} target="_blank" rel="noopener noreferrer">{t.link.label}</a></>}</li>)}</ul>
              </div>
            ))}
            <p className="fine">The licensed translations are read a chapter at a time through your "{CONNECTOR}" connector, with your own free keys for Crossway's ESV API and API.Bible.{WAITING_NOTE} Their terms allow non-commercial use only, keep only a few hundred verses on the device at a time, and don't allow turning the text into speech, so search, AI tools and read aloud use the built-in translations.</p>
          </details>
          <div><label className="label" htmlFor="set-lens">Theological lens</label><LensSelect id="set-lens" value={prefs.lens} onChange={(l) => setPref("lens", l)} /></div>
          <div><label className="label" htmlFor="set-theme">Appearance</label><ThemeSelect id="set-theme" /></div>
          <div><label className="label" htmlFor="set-voice">Read-aloud voice</label><select id="set-voice" value={prefs.readVoice} onChange={(e) => setPref("readVoice", e.target.value === "builtin" ? "builtin" : "device")}><option value="device">This device's voice, when it has one</option>{BUILT_IN && <option value="builtin">{BUILT_IN.name}, built into Veritas Logos</option>}</select>
            {BUILT_IN && <p className="fine">Where the browser has no voice, such as in the Claude app on Android, {BUILT_IN.name} reads. It downloads {mb(BUILT_IN.downloadBytes)} the first time and is kept in this browser.</p>}</div>
          <div><label className="label" htmlFor="set-rate">Read-aloud speed</label><select id="set-rate" value={prefs.rate} onChange={(e) => setPref("rate", Number(e.target.value))}>{[0.85, 1, 1.15, 1.3].map((r) => <option key={r} value={r}>{r}×</option>)}</select></div>

          {offlineSupported && <>
            <h3>Offline study</h3>
            <p role="status">{offline.state === "ready" && offline.translation === offlineTranslation
              ? `${offlineTranslation} and the core lexicons are ready to use offline on this device.`
              : offline.state === "failed" ? "The offline download didn't finish. Reconnect and try again."
              : `Preparing ${offlineTranslation} and the core lexicons for offline use…`}</p>
            {offline.state === "failed" && <button type="button" className="btn small" onClick={() => prepareOffline(offlineTranslation, true)}>Retry offline download</button>}
          </>}

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
          <p>{guides.length} guides, {noteCount} notes, {hlList.length} highlights.</p>
          <SyncLine sync={sync} target={target} />
          {ACCOUNTS_ON && acct.status === "signed-out" && <p><a href="#account">Sign in</a> to keep your guides, notes and settings the same on every device.</p>}
          {ACCOUNTS_ON && acct.status === "signed-in" && <p className="fine">Signed in as {acct.user?.email}. <a href="#account">Account settings</a></p>}
          <div className="action-row">
            <button type="button" className="btn small primary" onClick={backup}>Back up</button>
            <button type="button" className="btn small" onClick={() => file.current?.click()}>Restore or import</button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readBackup(f); e.target.value = ""; }} />
          </div>
          {incoming && (
            <div className="restore-choice" role="group" aria-label="Restore or import">
              <p><strong>{incoming.name}</strong> has {incoming.data.guides.length} guides, {Object.keys(incoming.data.notes).length + incoming.data.notebook.length} notes and {Object.keys(incoming.data.highlights).length} highlights.</p>
              <div className="action-row">
                <button type="button" className="btn small primary" onClick={() => restore("add")}>Add to what's here</button>
                <button type="button" className="btn small" onClick={() => restore("replace")}>Replace what's here</button>
                <button type="button" className="btn small" onClick={() => setIncoming(null)}>Cancel</button>
              </div>
              <p className="fine">Adding keeps everything you have and brings in the backup, with the later version of anything in both. Replacing makes {target ? "your account" : "this browser"} match the backup exactly.</p>
            </div>
          )}
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
      {!IN_CLAUDE && <p className="fine"><a href="privacy.html">Privacy</a>: what the site keeps about you, and how to remove it.</p>}
      <h3>How to weigh what you read</h3>
      <dl className="facts">
        <dt>From cited sources</dt><dd>Looked up from the datasets below, chosen by rule.</dd>
        <dt>AI draft</dt><dd>Written on request by an AI model. It isn't stored as reference data, it can be wrong, and it stays labeled until you mark it checked.</dd>
        <dt>Your writing</dt><dd>What you add yourself.</dd>
      </dl>
      <h3>Sources and licenses</h3>
      <ul className="fine-list">
        <li><strong>Bible text:</strong> BSB (CC0), NHEB, KJV (Crown rights apply in the UK), ASV and YLT (public domain), and the LEB (© 2012 Logos Bible Software, free to share with its notice) with 17 more public-domain Bibles, via scrollmapper/bible_databases. The {ONLINE_OFFERED} aren't stored: the reader shows them a chapter at a time through the owner's connector, with each publisher's notice, under their free non-commercial terms.{WAITING_NOTE} “About the translations” below lists every notice.</li>
        <li><strong>Hebrew, Greek and lexicons:</strong> TAHOT, TAGNT, TBESH and TBESG from STEP Bible (Tyndale House, Cambridge), CC BY 4.0.</li>
        <li><strong>YLT word alignment:</strong> <a href="https://github.com/Clear-Bible/Alignments">Clear Bible</a>, CC BY 4.0.</li>
        <li><strong>Strong's dictionaries:</strong> Open Scriptures, CC BY-SA.</li>
        <li><strong>Cross-references:</strong> OpenBible.info, CC BY. Quotations are detected from these by matching wording.</li>
        <li><strong>Places and maps:</strong> <a href="https://www.openbible.info/geo/">OpenBible.info Geocoding</a> (CC BY 4.0) and <a href="https://www.naturalearthdata.com/">Natural Earth</a> (public domain).</li>
        <li><strong>Bible dictionary:</strong> Adapted from <a href="https://tyndaleopenresources.com/">Tyndale Open Bible Dictionary</a>, copyright © 2023 Tyndale House Publishers, CC BY-SA 4.0.</li>
        <li><strong>Study notes:</strong> Adapted from <a href="https://tyndaleopenresources.com/">Tyndale Open Study Notes</a>, copyright © 2022 Tyndale House Publishers, CC BY-SA 4.0.</li>
        <li><strong>Topics:</strong> Nave's Topical Bible (public domain), via BibleData by Brady Stephenson, CC BY 4.0.</li>
        <li><strong>People:</strong> TIPNR from STEPBible (Tyndale House), CC BY 4.0, with BibleData, CC BY 4.0. Family claims from these, Theographic and ACAI (both CC BY-SA 4.0) were tested against the tagged Hebrew and Greek, and the Bible decides. The people data is shared under CC BY-SA 4.0. <a href="#people-data">See what was kept, changed and dropped</a>.</li>
        <li><strong>Book names and chronology:</strong> BibleData, CC BY 4.0.</li>
        <li><strong>Confessions:</strong> public-domain texts and proof lists via Creeds.json.</li>
        <li><strong>Church Fathers:</strong> public-domain translations, chiefly the Ante-Nicene and Nicene and Post-Nicene Fathers and Newman's Catena Aurea, via HistoricalChristianFaith's Commentaries and Writings databases. Each quote was matched word for word against the named edition, and quotes that failed were dropped.</li>
        <li><strong>Citations and Calvin's commentaries:</strong> Public-domain excerpts and Scripture references credited to the <a href="https://www.ccel.org/">Christian Classics Ethereal Library</a>. <a href="https://give.calvin.edu/give/583548/#!/donation/checkout">Donate to CCEL</a>.</li>
        <li><strong>Theological terms:</strong> Easton's Bible Dictionary (1897), Schaff's Dictionary of the Bible (1880) and Smith's Bible Dictionary from CCEL's files via the NEUU dataset (CC BY 4.0), the catechisms above, Schaff's History of the Christian Church, Hodge's Systematic Theology and Watson's A Body of Divinity. Terms those don't cover use Webster's Unabridged, The Catholic Encyclopedia (1911), Encyclopædia Britannica (1911), Murray's New English Dictionary (1919), and short quotations from Merriam-Webster and Hardon's Modern Catholic Dictionary, which are copyrighted and tagged as such.</li>
        <li><strong>Ancient texts:</strong> Swete's Septuagint from the First Thousand Years of Greek (CC BY-SA 4.0), the Clementine Vulgate, and the Open Apostolic Fathers Greek (CC BY-SA 4.0).</li>
        <li><strong>Creeds and church history:</strong> Schaff's The Creeds of Christendom and History of the Christian Church from CCEL, public domain. Later events name the web page each was checked against.</li>
        <li><strong>Other books:</strong> Douay-Rheims (1899), King James (1611) and Whiston's Josephus, public domain.</li>
        <li><strong>Synopsis and editions:</strong> section order from Aland's Synopsis through aland-gospel-synopsis (MIT), and Greek edition differences from STEP Bible (CC BY 4.0).</li>
        <li><strong>Your glossary:</strong> your Theological Terms document, labeled as yours. It names no sources, so it isn't treated as a cited source. Entries tagged “Corrected” were reworded by Claude at your request and show your original wording. The rest are word for word.</li>
        <li><strong>Later teachers:</strong> Matthew Henry and Spurgeon's Treasury of David via LyteWord (CC0); Wesley's Explanatory Notes (public domain, structured by History of Methodism, CC BY 4.0); Calvin's Institutes, Luther on Galatians (Graebner's 1949 abridgment) and Edwards's sermons via Project Gutenberg. Spurgeon's sermons are an index that links out.</li>
        <li><strong>Built-in read-aloud voice:</strong> Norman, a Piper voice by Bryce Beattie trained on LibriVox recordings (public domain), from rhasspy/piper-voices (MIT) via k2-fsa/sherpa-onnx. It's run by ONNX Runtime Web (MIT), with eSpeak NG turning text into phonemes, built from rhasspy/espeak-ng. eSpeak NG is GPL-3.0-or-later, so the voice worker that carries it is too: <a href="licenses/GPL-3.0.txt" target="_blank" rel="noopener">license</a>, <a href="https://github.com/gunterfrazier/Apps/tree/claude/veritas-logos/veritas-logos" target="_blank" rel="noopener">source</a>.</li>
        <li><strong>New Testament dates:</strong> the years in Ussher's Annals of the World (1650), via BibleData. The captions are plain labels for the cited passages.</li>
      </ul>
      <p className="fine">A source can still contain errors, and its chronology and family links reflect its editors' judgment. Citations let you check them against the verses.</p>
      <p className="fine">Licenses named above: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>, <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>, MIT and the <a href="licenses/GPL-3.0.txt" target="_blank" rel="noopener">GNU GPL 3.0</a>. The app reformats these sources, links them to verses and filters them by rule; <a href="https://github.com/gunterfrazier/Apps/blob/claude/veritas-logos/veritas-logos/DATA-LICENSES.md" target="_blank" rel="noopener">DATA-LICENSES.md</a> says what was changed in each. Material adapted from CC BY-SA sources, such as the people data, is shared under CC BY-SA 4.0.</p>
      <p className="fine">The NASB and CJB are under copyright and aren't offered.</p>
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
