/**
 * The player's screens, in the style of Spotify: a mini player above the tabs while something plays, and a dark
 * full-screen "now playing" tinted with the book's color. Chapters show a cover for their book, a verse-by-verse
 * transcript that follows along, and the chapters that come next; videos play in the frame at the top, with the
 * story's other videos as Up next. The full screen stays mounted while minimized, so a video keeps playing.
 */
import { useEffect, useRef, useState } from "react";
import { bookName } from "../core/references";
import {
  closePlayer, cycleSpeed, fmtMinutes, minutesLeft, nextChapterOf, nudgeVideo, openPlayer, playChapter, playVideo, registerFrame,
  seekVerse, seekVideo, setSleep, skipChapter, skipVerse, togglePlay, upNextVideos, usePlayer, type PlayerState, type PlayerVideo,
} from "./player";
import { navigate, setPref, useData } from "./store";
import { readHash } from "./routes";

// ----- Each book's color, by its part of the Bible -----
const PARTS: [number, string, string][] = [
  [5, "Law", "#8a5a2b"], [17, "History", "#2f6b57"], [22, "Wisdom and poetry", "#6d3f86"], [39, "Prophets", "#9a3d2f"],
  [43, "Gospels", "#2457a3"], [44, "History", "#22677f"], [65, "Letters", "#3f4b9c"], [66, "Prophecy", "#8a2c58"],
];
const partOf = (book: number) => PARTS.find(([last]) => book <= last) ?? PARTS[PARTS.length - 1];
export const bookTint = (book: number) => partOf(book)[2];

/** A cover for a book, the way an album has one. */
export function BookCover({ book, chapter, size }: { book: number; chapter?: number; size?: number }) {
  const [, part, tint] = partOf(book);
  return (
    <div className="pl-cover" style={{ ["--tint" as string]: tint, ...(size ? { width: size, height: size } : {}) }} aria-hidden="true">
      <span className="pl-cover-k">{part}</span>
      <span className="pl-cover-t">{bookName(book)}</span>
      {chapter !== undefined && <span className="pl-cover-c">{chapter}</span>}
    </div>
  );
}
const ytThumb = (v: PlayerVideo) => { const m = v.embed?.match(/youtube-nocookie\.com\/embed\/([\w-]{11})/); return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : ""; };
function VideoThumb({ v, tint }: { v: PlayerVideo; tint: string }) {
  const src = ytThumb(v);
  return <div className="pl-thumb" style={{ ["--tint" as string]: tint }} aria-hidden="true"><Icon d={ICONS.play} size={18} />{src && <img src={src} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} />}</div>;
}

// ----- Icons -----
const ICONS = {
  play: "M7 4.5v15l12-7.5z", pause: "M7 4h3.5v16H7zM13.5 4H17v16h-3.5z", down: "m6 9 6 6 6-6", x: "M6 6l12 12M18 6 6 18",
  prev: "M6 5v14M19 5 9 12l10 7z", next: "M18 5v14M5 5l10 7-10 7z", moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7", back: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4", fwd: "M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};
const FILLED = new Set([ICONS.play, ICONS.pause, ICONS.prev, ICONS.next]);
function Icon({ d, size = 24 }: { d: string; size?: number }) {
  const fill = FILLED.has(d);
  return <svg viewBox="0 0 24 24" width={size} height={size} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={fill ? 0 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

const titleOf = (s: PlayerState) => (s.kind === "video" ? s.video?.title ?? "" : `${bookName(s.book)} ${s.chapter}`);
const bylineOf = (s: PlayerState) => (s.kind === "video" ? [s.video?.creator, s.video?.format].filter(Boolean).join(" · ")
  : s.note || `Verse ${s.verse} of ${s.lines[s.lines.length - 1]?.verse ?? "…"} · ${s.translation}`);
const tintOf = (s: PlayerState) => (s.kind === "video" ? "#7a3f8f" : bookTint(s.book));
const progressOf = (s: PlayerState) => {
  if (s.kind === "video") return s.duration ? s.time / s.duration : 0;
  const first = s.lines[0]?.verse ?? 1, last = s.lines[s.lines.length - 1]?.verse ?? 1;
  return last > first ? (s.verse - first) / (last - first) : 0;
};
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** The player: a mini bar while minimized and the full screen while open. Mounted once, in the app shell. */
export function Player() {
  const s = usePlayer();
  useEffect(() => {
    document.documentElement.classList.toggle("has-mini-player", Boolean(s.kind) && !s.open);
    document.documentElement.classList.toggle("player-open", Boolean(s.kind) && s.open);
  }, [s.kind, s.open]);
  if (!s.kind) return null;
  return <>
    {!s.open && <MiniPlayer s={s} />}
    <NowPlaying s={s} />
  </>;
}

function MiniPlayer({ s }: { s: PlayerState }) {
  const playing = s.status === "playing" || s.status === "loading";
  return (
    <div className="mini-player" style={{ ["--tint" as string]: tintOf(s) }} role="region" aria-label="Now playing">
      <button type="button" className="mp-open" onClick={() => openPlayer()} aria-label={`Open the player: ${titleOf(s)}`}>
        {s.kind === "video" && s.video ? <VideoThumb v={s.video} tint={tintOf(s)} /> : <BookCover book={s.book} size={42} />}
        <span className="mp-text"><b>{titleOf(s)}</b><small>{bylineOf(s)}</small></span>
      </button>
      <button type="button" className="mp-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}><Icon d={playing ? ICONS.pause : ICONS.play} size={22} /></button>
      <button type="button" className="mp-btn ghost" onClick={closePlayer} aria-label="Stop and close the player"><Icon d={ICONS.x} size={20} /></button>
      <span className="mp-progress" aria-hidden="true"><i style={{ width: `${Math.round(progressOf(s) * 100)}%` }} /></span>
    </div>
  );
}

function NowPlaying({ s }: { s: PlayerState }) {
  const { prefs } = useData();
  const [sleepMenu, setSleepMenu] = useState(false);
  const [, tick] = useState(0);
  const minimize = useRef<HTMLButtonElement>(null);
  const playing = s.status === "playing" || s.status === "loading";
  useEffect(() => {
    if (!s.open) return;
    minimize.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") openPlayer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s.open]);
  // The sleep timer's countdown.
  useEffect(() => { if (!s.sleepAt) return; const t = setInterval(() => tick((n) => n + 1), 15e3); return () => clearInterval(t); }, [s.sleepAt]);
  const sleepLeft = s.sleepAt ? `${Math.max(1, Math.round((s.sleepAt - Date.now()) / 60e3))}m` : s.sleepEndOfChapter ? "End" : "";
  const video = s.kind === "video";
  const first = s.lines[0]?.verse ?? 1, last = s.lines[s.lines.length - 1]?.verse ?? 1;
  const pct = `${Math.round(progressOf(s) * 100)}%`;

  return (
    <div id="now-playing" className={s.open ? "open" : "closed"} style={{ ["--tint" as string]: tintOf(s) }} role="dialog" aria-modal={s.open} aria-label="Now playing" aria-hidden={!s.open} inert={!s.open ? true : undefined}>
      <div className="np-shell">
        <div className="np-head">
          <button type="button" ref={minimize} className="np-icon" onClick={() => openPlayer(false)} aria-label="Minimize the player"><Icon d={ICONS.down} size={26} /></button>
          <div className="np-from"><span className="np-from-k">Playing from</span><span className="np-from-t">{video ? s.from || "Family Library" : `${bookName(s.book)} · ${s.translation}`}</span></div>
          <button type="button" className="np-icon" onClick={closePlayer} aria-label="Stop and close the player"><Icon d={ICONS.x} /></button>
        </div>

        <div className={`np-art ${video ? "video" : ""}`}>
          {video && s.video?.embed
            ? <iframe key={s.video.id} ref={registerFrame} src={s.video.embed} title={s.video.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
            : <BookCover book={s.book} chapter={s.chapter} />}
        </div>

        <div className="np-info">
          <div className="np-titles"><h2>{titleOf(s)}</h2><p className="np-byline">{bylineOf(s)}</p></div>
          {!video && <button type="button" className="np-round" aria-label={`Open ${titleOf(s)} in the reader`}
            onClick={() => { openPlayer(false); navigate(readHash({ book: s.book, chapter: s.chapter, verse: s.verse })); }}><Icon d={ICONS.book} size={20} /></button>}
        </div>

        <div className="np-scrub">
          {video
            ? <input type="range" className="np-range" min={0} max={Math.max(1, Math.round(s.duration))} step={1} value={Math.round(s.time)} disabled={!s.duration}
                style={{ ["--pct" as string]: pct }} aria-label="Position in the video" aria-valuetext={`${clock(s.time)} of ${clock(s.duration)}`}
                onChange={(e) => seekVideo(+e.target.value)} />
            : <input type="range" className="np-range" min={first} max={last} step={1} value={s.verse} disabled={!s.lines.length}
                style={{ ["--pct" as string]: pct }} aria-label="Verse" aria-valuetext={`Verse ${s.verse} of ${last}`}
                onChange={(e) => seekVerse(+e.target.value)} />}
          <div className="np-times">
            <span>{video ? clock(s.time) : `Verse ${s.verse}`}</span>
            <span>{video ? (s.duration ? `-${clock(Math.max(0, s.duration - s.time))}` : "") : `about ${fmtMinutes(minutesLeft(s))} left`}</span>
          </div>
        </div>

        <div className="np-transport">
          <button type="button" className="np-side" onClick={() => cycleSpeed()} aria-label={`Speed ${prefs.rate} times. Change speed`}>{prefs.rate}×</button>
          <button type="button" className="np-skip" onClick={() => (video ? nudgeVideo(-15) : skipVerse(-1))} aria-label={video ? "Back 15 seconds" : "Previous verse"}>
            <Icon d={ICONS.back} size={32} /><span>{video ? "15" : "−1"}</span></button>
          <button type="button" className="np-play" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}><Icon d={playing ? ICONS.pause : ICONS.play} size={30} /></button>
          <button type="button" className="np-skip" onClick={() => (video ? nudgeVideo(30) : skipVerse(1))} aria-label={video ? "Forward 30 seconds" : "Next verse"}>
            <Icon d={ICONS.fwd} size={32} /><span>{video ? "30" : "+1"}</span></button>
          <button type="button" className={`np-side ${sleepLeft ? "on" : ""}`} onClick={() => setSleepMenu(!sleepMenu)} aria-expanded={sleepMenu} aria-label={sleepLeft ? `Sleep timer, ${sleepLeft === "End" ? `at the end of the ${video ? "video" : "chapter"}` : `${sleepLeft} left`}` : "Sleep timer"}>
            <Icon d={ICONS.moon} size={22} />{sleepLeft && <small>{sleepLeft}</small>}</button>
        </div>
        {s.note && <p className="np-status" role="status">{s.note}</p>}

        {sleepMenu && <div className="np-sleep-menu" role="group" aria-label="Sleep timer">
          <span className="np-sleep-k">Stop {video ? "playing" : "reading"} in</span>
          {[15, 30, 45, 60].map((m) => <button key={m} type="button" className="np-pill" onClick={() => { setSleep(m); setSleepMenu(false); }}>{m} min</button>)}
          <button type="button" className="np-pill" onClick={() => { setSleep("chapter"); setSleepMenu(false); }}>End of {video ? "video" : "chapter"}</button>
          {sleepLeft && <button type="button" className="np-pill" onClick={() => { setSleep(null); setSleepMenu(false); }}>Turn off</button>}
        </div>}

        <div className="np-row">
          <button type="button" className="np-pill" onClick={() => void skipChapter(-1)}><Icon d={ICONS.prev} size={14} />{video ? "Previous" : "Previous chapter"}</button>
          <button type="button" className="np-pill" onClick={() => void skipChapter(1)}>{video ? "Next" : "Next chapter"}<Icon d={ICONS.next} size={14} /></button>
          {video && s.video && <a className="np-pill" href={s.video.url} target="_blank" rel="noopener noreferrer"><Icon d={ICONS.ext} size={14} />Open on {s.video.embed?.includes("vimeo") ? "Vimeo" : "YouTube"}</a>}
        </div>

        {!video && <Transcript s={s} />}
        <UpNext s={s} keepGoing={prefs.listenContinue} />
        {video && s.video?.creator === "BibleProject" && <p className="np-fine">BibleProject is the author and owner of this video.</p>}
      </div>
    </div>
  );
}

/** The chapter, verse by verse, following the voice. Tap a verse to read from there. */
function Transcript({ s }: { s: PlayerState }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-verse="${s.verse}"]`);
    if (el && box.current && s.open) box.current.scrollTo({ top: Math.max(0, el.offsetTop - 60), behavior: "smooth" });
  }, [s.verse, s.open]);
  if (!s.lines.length) return null;
  return (
    <section className="np-card" aria-label="The chapter">
      <h3>The chapter</h3>
      <div className="np-tx" ref={box}>
        {s.lines.filter((l) => l.text).map((l) => (
          <button key={l.verse} type="button" data-verse={l.verse} className={`np-tx-line ${l.verse === s.verse ? "now" : l.verse < s.verse ? "past" : ""}`}
            aria-current={l.verse === s.verse ? "true" : undefined} onClick={() => seekVerse(l.verse)}>
            <sup>{l.verse}</sup> {l.text}
          </button>
        ))}
      </div>
    </section>
  );
}

function UpNext({ s, keepGoing }: { s: PlayerState; keepGoing: boolean }) {
  const [chapters, setChapters] = useState<{ book: number; chapter: number }[]>([]);
  useEffect(() => {
    if (s.kind !== "chapter") return;
    let live = true;
    (async () => {
      const out: { book: number; chapter: number }[] = [];
      let at = { book: s.book, chapter: s.chapter };
      for (let i = 0; i < 3; i++) { const n = await nextChapterOf(at.book, at.chapter); if (!n) break; out.push(n); at = n; }
      if (live) setChapters(out);
    })();
    return () => { live = false; };
  }, [s.kind, s.book, s.chapter]);
  const videos = s.kind === "video" ? upNextVideos() : [];
  if (s.kind === "chapter" ? !chapters.length : !videos.length) return null;
  return (
    <section className="np-card np-next" aria-label="Up next">
      <div className="np-next-head"><h3>Up next</h3>
        <label className="np-switch"><input type="checkbox" checked={keepGoing} onChange={(e) => setPref("listenContinue", e.target.checked)} /><span>Keep going</span></label></div>
      {s.kind === "chapter"
        ? chapters.map((c) => (
          <button key={`${c.book}:${c.chapter}`} type="button" className="np-next-row" onClick={() => void playChapter(s.translation!, c.book, c.chapter, 1)}>
            <BookCover book={c.book} size={44} /><span className="np-next-meta"><b>{bookName(c.book)} {c.chapter}</b><small>{s.translation}</small></span>
          </button>))
        : videos.map((v) => (
          <button key={v.id} type="button" className="np-next-row" onClick={() => playVideo(v, s.queue, s.from)}>
            <VideoThumb v={v} tint={tintOf(s)} /><span className="np-next-meta"><b>{v.title}</b><small>{v.creator}</small></span>
          </button>))}
    </section>
  );
}
