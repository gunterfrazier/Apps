// The Verse of the Day card on the Study page. Its reference comes from the Bible service (the website asks its /votd
// address; inside Claude, the "Veritas Bible Texts" connector's verse_of_the_day tool), and the words from the app's
// own Bible, in the reader's translation when it's built in, otherwise the BSB.
import { getVerseIn, localTranslation, refOf } from "../core/bible";
import { dayOf } from "../core/practice";
import { fallbackVerse, fromService, withoutPsalmTitle, type DailyVerse } from "../core/votd";
import { readHash } from "./routes";
import { useData } from "./store";
import { useAsync } from "./ui";
import { CONNECTOR } from "./online-bible";

const cache = new Map<string, Promise<DailyVerse>>();

async function askService(date: string): Promise<DailyVerse | null> {
  const claude = (window as any).claude;
  const web: string | undefined = (window as any).VERITAS_CONFIG?.bibleTextsUrl;
  try {
    if (!claude?.use && web) {
      const r = await fetch(`${web.replace(/\/web\/?$/, "/votd")}?date=${date}`);
      return r.ok ? fromService(date, await r.json()) : null;
    }
    if (!claude?.use) return null;
    const mcp = await claude.use("mcp");
    if (!mcp) return null;
    const out = await mcp.callTool(CONNECTOR, "verse_of_the_day", { date }, { cache: true });
    return fromService(date, out?.payload);
  } catch {
    return null;
  }
}

export function verseForToday(date = dayOf()): Promise<DailyVerse> {
  if (!cache.has(date)) cache.set(date, askService(date).then((v) => v ?? fallbackVerse(date)));
  return cache.get(date)!;
}

export function VerseOfTheDay() {
  const { prefs } = useData();
  const t = localTranslation(prefs.translation);
  const { data } = useAsync(async () => {
    const v = await verseForToday();
    const parts: string[] = [];
    let from = t;
    for (let n = v.verse; n <= v.end; n++) { const r = await getVerseIn(t, v.book, v.chapter, n); from = r.translation; parts.push(withoutPsalmTitle(v.book, v.chapter, n, r.text)); }
    return { v, text: parts.join(" ").replace(/\s+/g, " ").trim(), translation: from };
  }, [t]);
  if (!data?.text) return null;
  const { v } = data;
  return (
    <section className="votd-card" aria-labelledby="votd-title">
      <p className="fine" id="votd-title">Verse of the Day</p>
      <blockquote className="votd-text">{data.text}</blockquote>
      <p className="votd-ref">
        <a href={`#${readHash({ book: v.book, chapter: v.chapter, verse: v.verse, verseEnd: v.end })}`}>{refOf(v.book, v.chapter, v.verse, v.end)}</a>
        <span className="fine"> · {data.translation}{v.source === "youversion" ? " · Chosen by YouVersion" : ""}</span>
      </p>
    </section>
  );
}
