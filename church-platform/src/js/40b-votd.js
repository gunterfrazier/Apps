// ---------- Verse of the Day ----------
// A card on Home. The reference is YouVersion's Verse of the Day, asked of the Veritas Logos Bible service
// (bible-texts/votd in this Supabase project), which gives only the reference; the words come from the public-domain
// BSB already shipped with the app. With no answer (offline, the Claude preview, or before the service is updated),
// the app picks from its own list, the same verse for everyone that day.

const VOTD_FALLBACK = [
  "John 3:16", "Psalm 23:1-3", "Proverbs 3:5-6", "Romans 8:28", "Philippians 4:6-7", "Isaiah 40:31", "Jeremiah 29:11", "Matthew 11:28-30",
  "Joshua 1:9", "Romans 12:2", "Ephesians 2:8-9", "Hebrews 11:1", "Psalm 46:1", "1 John 4:19", "John 14:6", "Romans 5:8",
  "Philippians 4:13", "Matthew 6:33", "Psalm 119:105", "Lamentations 3:22-23", "2 Corinthians 5:17", "Galatians 2:20", "2 Timothy 1:7", "Titus 3:5",
  "1 Peter 5:7", "Micah 6:8", "Isaiah 41:10", "Psalm 27:1", "Psalm 37:4", "Psalm 91:1-2", "Psalm 139:14", "Numbers 6:24-26",
  "Deuteronomy 31:6", "Genesis 1:1", "John 1:1", "John 11:25-26", "John 15:5", "John 16:33", "Romans 15:13", "1 Corinthians 13:4-7",
  "2 Corinthians 12:9", "Colossians 3:23-24", "1 Thessalonians 5:16-18", "James 1:5", "1 John 1:9", "Revelation 21:4", "Luke 1:37", "Matthew 5:14-16",
  "Matthew 28:19-20", "Mark 10:27", "Acts 1:8", "Ecclesiastes 3:1", "Job 19:25", "2 Chronicles 7:14", "Ezekiel 36:26", "Daniel 9:19",
  "Zephaniah 3:17", "Habakkuk 3:17-18", "Zechariah 4:6", "Hebrews 12:1-2", "Hebrews 4:16", "1 John 4:7-8", "Psalm 103:1-2", "Isaiah 26:3",
];
const votd = { date: "", ref: "", text: "", fromYV: false, loading: false };
/** Verse 1 of a Psalm in the BSB starts with the Psalm's title ("A Psalm of David. The LORD is my shepherd..."): the
 * card leaves it off, sentence by sentence, while each sentence reads like a title. */
const PSALM_TITLE = /^(?:For the (?:choirmaster|director)|To the choirmaster|A (?:Psalm|psalm|Song|song|Maskil|Miktam|Shiggaion|prayer|Prayer|Petition|petition)|Of (?:David|Asaph|Solomon|Heman|Ethan|Moses|the sons of Korah)|According to|With stringed|On the |Set to|To the tune|When |Concerning|For the dedication|For remembrance|To bring to remembrance|For the Sabbath|Of thanksgiving)\b/;
function withoutPsalmTitle(ref, text) {
  const r = parseRef(ref);
  if (r?.book !== "Psalms" || r.verse !== 1) return text;
  let rest = text.trim();
  for (let i = 0; i < 5; i++) {
    const m = rest.match(/^([^.?!]*[.?!][”"’]?)\s+(\S[\s\S]*)$/);
    if (!m || !PSALM_TITLE.test(m[1])) break;
    rest = m[2];
  }
  return rest;
}
function votdDayOfYear(date) { const [y, m, d] = date.split("-").map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1; }
function votdFallback(date) { return VOTD_FALLBACK[(votdDayOfYear(date) - 1 + +date.slice(0, 4)) % VOTD_FALLBACK.length]; }
async function loadVotd(date) {
  votd.loading = true;
  let ref = "", fromYV = false;
  if (PLATFORM.supabaseUrl && !IN_PREVIEW) {
    try {
      const r = await fetch(`${PLATFORM.supabaseUrl}/functions/v1/bible-texts/votd?date=${date}`);
      const d = r.ok ? await r.json() : null;
      if (d?.book >= 1 && d.book <= 66 && d.chapter > 0 && d.verse > 0) {
        ref = `${BOOKS[d.book - 1]} ${d.chapter}:${d.verse}${d.end > d.verse ? `-${d.end}` : ""}`;
        fromYV = true;
      }
    } catch { /* the app's own list */ }
  }
  if (!ref) ref = votdFallback(date);
  let text = "";
  try { text = withoutPsalmTitle(ref, await Bible.text(ref, "BSB", false)); }
  catch { if (fromYV) { ref = votdFallback(date); fromYV = false; try { text = await Bible.text(ref, "BSB", false); } catch { /* nothing to show */ } } }
  Object.assign(votd, { date, ref: text ? ref : "", text, fromYV, loading: false });
  render();
}
function votdCard() {
  const today = isoDay(new Date());
  if (votd.date !== today && !votd.loading) { votd.date = today; loadVotd(today); }
  if (!votd.text) return "";
  return html`<section class="sec"><h2 class="sec-head">Verse of the Day</h2>
    <div class="panel votd"><p class="votd-text">${votd.text}</p>
      <p class="votd-ref"><a href="#bible-${refSlug(parseRef(votd.ref))}">${votd.ref}</a> <span class="faint">· BSB${votd.fromYV ? " · Chosen by YouVersion" : ""}</span></p></div></section>`;
}
