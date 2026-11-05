#!/usr/bin/env python3
"""Builds public/data/writings and public/data/comm from public-domain sources.

Run with:  python3 -I scripts/build_writings.py --sources /home/claude/sources --out public/data

The rule, set by the app's owner: nothing goes in unless it can be traced to a
named, checkable source. So every Church Father quote must:
  1. come from a work on the WORKS list below, which names the published
     public-domain translation (Ante-Nicene Fathers, Nicene and Post-Nicene
     Fathers, Newman's Catena Aurea and a few other dated editions);
  2. appear word for word in that translation's text in the Writings-Database;
  3. not come from a file marked as machine translated.
Everything else in the Commentaries-Database is left out, including excerpts of
copyrighted modern series, modern and AI translations, and modern authors.
"""
import argparse, collections, html, json, os, re, shutil, tomllib, unicodedata, urllib.parse

ap = argparse.ArgumentParser()
ap.add_argument("--sources", required=True)
ap.add_argument("--out", required=True)
args = ap.parse_args()
CDB = os.path.join(args.sources, "cdb")
WDB = os.path.join(args.sources, "wdb")
X = os.path.join(args.sources, "extra")
OUT_W = os.path.join(args.out, "writings")
OUT_C = os.path.join(args.out, "comm")

BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
BOOK_NO = {b: i + 1 for i, b in enumerate(BOOKS)}
BOOK_NO["Song of Songs"] = 22

ANF = lambda v: f"Ante-Nicene Fathers, vol. {v}, ed. Roberts and Donaldson (1885–96)"
NPNF1 = lambda v: f"Nicene and Post-Nicene Fathers, Series 1, vol. {v}, ed. Schaff (1886–89)"
NPNF2 = lambda v: f"Nicene and Post-Nicene Fathers, Series 2, vol. {v}, ed. Schaff and Wace (1890–1900)"
CATENA = "Aquinas, Catena Aurea, trans. J. H. Newman and others (Oxford, 1841–45)"

# Works in a named public-domain edition. Order matters: first match wins.
WORKS = [
    (r"Thomas Aquinas/Catena Aurea/", CATENA),
    (r"Tertullian/", ANF("3–4")),
    (r"Irenaeus/Irenaeus Against Heresies|Irenaeus/Fragments", ANF(1)),
    (r"Irenaeus/The Proof", "Irenaeus, The Demonstration of the Apostolic Preaching, trans. J. Armitage Robinson (1920)"),
    (r"Justin Martyr/", ANF(1)),
    (r"Clement of Rome/First Epistle", ANF(1)),
    (r"Clement of Rome/Pseudo-Clement", ANF("8–9")),
    (r"Ignatius of Antioch/", ANF(1)),
    (r"Polycarp of Smyrna/", ANF(1)),
    (r"Epistle of Barnabas/", ANF(1)),
    (r"Papias of Hierapolis/", ANF(1)),
    (r"Shepherd of Hermas/Translation-ANF", ANF(2)),
    (r"Clement of Alexandria/", ANF(2)),
    (r"Theophilus of Antioch/", ANF(2)),
    (r"Tatian the Assyrian/Address", ANF(2)),
    (r"Athenagoras of Athens/", ANF(2)),
    (r"Origen of Alexandria/(Against Celsus|De Principiis)", ANF(4)),
    (r"Origen of Alexandria/Commentary on (John|Matthew)", ANF(9)),
    (r"Origen of Alexandria/Philocalia", "The Philocalia of Origen, trans. George Lewis (1911)"),
    (r"Hippolytus of Rome/(Fragments|The Refutation|Dubious)", ANF(5)),
    (r"Cyprian/", ANF(5)),
    (r"Caius Presbyter of Rome/|Novatian/", ANF(5)),
    (r"Gregory of Neocaesarea/|Dionysius of Alexandria/|Julius Africanus/|Alexander of Alexandria/|Peter of Alexandria/|Methodius of Olympus/|Arnobius of Sicca/|Theonas of Alexandria/|Theognostus Of Alexandria/|Archelaus of Carrhae/|Malchion/", ANF(6)),
    (r"Lucius Caecilius Firmianus Lactantius/|Victorinus of Pettau/|Apostolic Constitutions/|Didache/|The Liturgy Of The Blessed Apostles/", ANF(7)),
    (r"Commodian/|Marcus Minucius Felix/", ANF(4)),
    (r"Passion of Saints Perpetua", ANF(3)),
    (r"John Chrysostom/Homilies/On Matthew", NPNF1(10)),
    (r"John Chrysostom/Homilies/On John", NPNF1(14)),
    (r"John Chrysostom/Homilies/On Hebrews", NPNF1(14)),
    (r"John Chrysostom/Homilies/On the Acts", NPNF1(11)),
    (r"John Chrysostom/Homilies/On Romans", NPNF1(11)),
    (r"John Chrysostom/Homilies/On (1|2) Corinthians", NPNF1(12)),
    (r"John Chrysostom/Homilies/On (Galatians|Ephesians|Philippians|Colossians|1 Thessalonians|2 Thessalonians|1 Timothy|2 Timothy|Titus|Philemon)", NPNF1(13)),
    (r"John Chrysostom/Homilies/(Concerning the Statues|On the Paralytic|Concerning the Power)", NPNF1(9)),
    (r"John Chrysostom/(TREATISE ON THE PRIESTHOOD|An Exhortation to Theodore|To Those Who|Letters to Olympias|Letter to a Young Widow|Instructions to Catechumens|Eulogy|A Treatise to Prove)", NPNF1(9)),
    (r"Augustine of Hippo/(TRACTATES ON JOHN|Ten Homilies)", NPNF1(7)),
    (r"Augustine of Hippo/ON THE PSALMS", NPNF1(8)),
    (r"Augustine of Hippo/(OUR LORD'S SERMON|The Harmony of the Gospels)", NPNF1(6)),
    (r"Augustine of Hippo/Sermons on Selected", NPNF1(6)),
    (r"Augustine of Hippo/(On The Trinity|On the Holy Trinity)", NPNF1(3)),
    (r"Augustine of Hippo/Enchiridion|Augustine of Hippo/A Treatise on Faith", NPNF1(3)),
    (r"Augustine of Hippo/The City of God", NPNF1(2)),
    (r"Augustine of Hippo/Letters", NPNF1(1)),
    (r"Augustine of Hippo/(Reply to Faustus|Of the Morals|On the Morals)", NPNF1(4)),
    (r"Augustine of Hippo/(On Baptism|In Answer to the Letters of Petilian|A Treatise Concerning the Correction)", NPNF1(4)),
    (r"Augustine of Hippo/(On the Spirit and the Letter|A Treatise Against Two Letters|On Marriage and Concupiscence|On Nature and Grace|On the Merits and Forgiveness|A Treatise on the Predestination|A Treatise on Grace|On the Soul and Its Origin|A Treatise on the Gift|On Man's Perfection|On the Proceedings|On the Grace of Christ|A Treatise on Rebuke)", NPNF1(5)),
    (r"Augustine of Hippo/(Of the Work of Monks|Of the Good of Marriage|Of Holy Virginity|Of the Good of Widowhood|On Lying|To Consentius|On Care to be Had|On Continence|On Patience|On the Catechising)", NPNF1(3)),
    (r"Eusebius of Caesarea/THE CHURCH HISTORY", NPNF2(1)),
    (r"Eusebius of Caesarea/The Proof", "Eusebius, The Proof of the Gospel, trans. W. J. Ferrar (1920)"),
    (r"Socrates Scholasticus/", NPNF2(2)),
    (r"Theodoret of Cyrus/(The Ecclesiastical History|Dialogues|Demonstrations)", NPNF2(3)),
    (r"Tyrannius Rufinus/", NPNF2(3)),
    (r"Athanasius of Alexandria/", NPNF2(4)),
    (r"Gregory of Nyssa/", NPNF2(5)),
    (r"Jerome/(Letters|Biblical Prefaces|Against the Pelagians|To Pammachius|The Perpetual|The Life of)", NPNF2(6)),
    (r"Jerome/Lives of Illustrious", NPNF2(3)),
    (r"Cyril of Jerusalem/CATECHETICAL", NPNF2(7)),
    (r"Gregory of Nazianzus/", NPNF2(7)),
    (r"Basil of Caesarea/(The Hexaemeron|ON THE SPIRIT|Letters)", NPNF2(8)),
    (r"Hilary of Poitiers/(On the Trinity|Homilies on the Psalms|On the Councils)", NPNF2(9)),
    (r"John Damascene/An Exact", NPNF2(9)),
    (r"Ambrose of Milan/(Letters|On the Holy Spirit|ON THE DUTIES|Exposition of the Christian Faith|Concerning Repentance|On the Decease|Concerning Virgins|Concerning Widows)", NPNF2(10)),
    (r"John Cassian/", NPNF2(11)),
    (r"Sulpicius Severus/|Vincent of L", NPNF2(11)),
    (r"Leo the Great/", NPNF2(12)),
    (r"Gregory the Dialogist/(THE BOOK OF PASTORAL RULE|Register)", NPNF2("12–13")),
    (r"Gregory the Dialogist/Morals", "Gregory the Great, Morals on the Book of Job, Library of the Fathers (Oxford, 1844–50)"),
    (r"Gregory the Dialogist/Dialogues", "The Dialogues of Saint Gregory, English translation of 1608, ed. E. G. Gardner (1911)"),
    (r"Ephrem the Syrian/(Homily|Nineteen Hymns)", NPNF2(13)),
    (r"Council of Carthage of 419/", NPNF2(14)),
    (r"Cyril of Alexandria/Commentary on the Gospel of John", "Cyril of Alexandria, Commentary on John, trans. P. E. Pusey and T. Randell, Library of the Fathers (1874–85)"),
    (r"Cyril of Alexandria/Commentary on the Gospel of Luke", "Cyril of Alexandria, Commentary on Luke, trans. R. Payne Smith (Oxford, 1859)"),
    (r"Theodoret of Cyrus/Commentary on Romans", "Theodoret, Commentary on Romans, in The Christian Remembrancer (1839–40), transcribed by Roger Pearse"),
    (r"Philoxenus of Mabbug/13", "The Discourses of Philoxenus, trans. E. A. Wallis Budge (1894)"),
    (r"Cosmas Indicopleustes/", "Cosmas Indicopleustes, Christian Topography, trans. J. W. McCrindle (1897)"),
    (r"Pacian of Barcelona/", "The Extant Works of S. Pacian, trans. C. H. Collyns, Library of the Fathers (1842)"),
]
WORKS = [(re.compile("^(?:" + p + ")"), s) for p, s in WORKS]
EXCLUDE = re.compile(r"^(Augustine of Hippo/(Sermons/|Exposition of Certain)|John Chrysostom/Against the Jews)")
MACHINE = re.compile(r"chatgpt|gpt-?\d|machine.?translat|openai|released into the public domain|translat\w*[^.]{0,80}\b(claude|gemini)\b", re.I)

def strip_html(s):
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", s))

def norm(s):
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", strip_html(s)).lower())

def clean(s):
    s = strip_html(s).replace("\ufffd", "").replace("\u00a0", " ").replace("\r", "")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" ?\n ?", "\n", s)
    s = re.sub(r"\n{2,}", "\n\n", s)
    return s.strip()

def clip(s, cap=6000):
    if len(s) <= cap:
        return s, 0
    cut = s.rfind(". ", 0, cap)
    return s[: (cut + 1 if cut > cap * 0.6 else cap)].rstrip() + " …", 1

texts, flags = {}, {}
def wdb_text(p):
    if p not in texts:
        try:
            raw = open(os.path.join(WDB, p), encoding="utf-8", errors="replace").read()
        except OSError:
            raw = None
        texts[p] = norm(raw) if raw is not None else None
        flags[p] = bool(raw and MACHINE.search(raw))
    return texts[p]

author_files = {}
def author_edition(folder, quote):
    """Finds which listed work of this author holds a quote that links to New Advent rather than a file."""
    q = norm(quote)
    if len(q) < 40:
        return None
    if folder not in author_files:
        found = []
        base = os.path.join(WDB, folder)
        for d, _, names in os.walk(base):
            for n in names:
                if n.endswith((".html", ".htm")):
                    p = os.path.relpath(os.path.join(d, n), WDB)
                    if work_source(p):
                        found.append(p)
        author_files[folder] = found
    for p in author_files[folder]:
        t = wdb_text(p)
        if t and not flags.get(p) and (q in t or (len(q) > 400 and q[:150] in t and q[-150:] in t)):
            return p
    return None

def work_source(path):
    if EXCLUDE.match(path):
        return None
    for rx, src in WORKS:
        if rx.match(path):
            return src
    return None

# ---------- Author table ----------
NAME_FIX = {"Gregory the Dialogist": "Gregory the Great", "Lucius Caecilius Firmianus Lactantius": "Lactantius", "Gregory of Neocaesarea": "Gregory Thaumaturgus (of Neocaesarea)"}
authors, author_ix = [], {}
def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip("-")
def author(name, meta=None, **kw):
    if name in author_ix:
        return author_ix[name]
    meta = meta or {}
    year = meta.get("default_year")
    cat = meta.get("father_category") or kw.get("cat") or ""
    flag = "condemned" if meta.get("condemned_by_council") else "pseudo" if cat.startswith("Pseudonymous") else "early-doc" if cat.startswith("Apocrypha") else ""
    a = {"id": slug(NAME_FIX.get(name, name)), "name": NAME_FIX.get(name, name), "year": year if year and year < 3000 else None, "cat": cat, "wiki": meta.get("wiki") or kw.get("wiki") or "", "flag": flag, "n": 0, "works": collections.Counter(), "books": collections.Counter(), "dates": kw.get("dates") or ""}
    authors.append(a)
    author_ix[name] = len(authors) - 1
    return author_ix[name]

# Records per book: writings = short excerpts and notes; comm = long commentary sections.
writings = [[] for _ in BOOKS]   # (author, title, url, source, c1, v1, c2, v2, text)
comm = [[] for _ in BOOKS]
sources = []
def src_ix(s):
    if s not in sources:
        sources.append(s)
    return sources.index(s)
stats = collections.Counter()

def parse_key(name):
    m = re.match(r"^(.+?) (\d+)_(\d+)(?:-(?:(\d+)_)?(\d+))?$", name)
    if not m:
        return None
    b = BOOK_NO.get(m.group(1))
    if not b:
        return None
    c1, v1 = int(m.group(2)), int(m.group(3))
    c2 = int(m.group(4)) if m.group(4) else c1
    v2 = int(m.group(5)) if m.group(5) else v1
    return b, c1, v1, c2, v2

SMALL = {"of", "on", "the", "and", "to", "in", "a", "an", "for", "from"}
def tidy_caps(s):
    """Source titles in capitals become ordinary title case."""
    if re.sub(r"[^A-Za-z]", "", s).isupper():
        words = s.lower().split(" ")
        return " ".join(w if i and w in SMALL else w[:1].upper() + w[1:] for i, w in enumerate(words))
    return s

def work_label(path, author_name):
    parts = path.split("/")[1:]
    parts[-1] = re.sub(r"\.html?$", "", parts[-1])
    keep = [p for p in parts if not re.match(r"^(book|homily|chapter|letter|epistle|psalm|sermon|tractate|discourse|letters? \d|translation|english|gregorymoralia|homilies$|\d)", p, re.I) or (p == parts[0] and not p.lower().startswith("translation"))]
    label = " · ".join(tidy_caps(p) for p in (keep or parts[:1])[:2])
    label = re.sub(r"^Irenaeus ", "", label)
    return label[:80]

# ---------- 1. Church Fathers ----------
per_author_sources = collections.defaultdict(list)
meta_by_folder = {}
folders = sorted(d for d in os.listdir(CDB) if os.path.isdir(os.path.join(CDB, d)) and not d.startswith("."))
for folder in folders:
    mp = os.path.join(CDB, folder, "metadata.toml")
    if os.path.exists(mp):
        meta_by_folder[folder] = tomllib.load(open(mp, "rb"))

seen = set()
for folder in folders:
    base = os.path.join(CDB, folder)
    meta = meta_by_folder.get(folder, {})
    if meta.get("father_category") in ("Canonical Scriptures", "Reformation & Modern"):
        continue
    for fn in sorted(os.listdir(base)):
        if not fn.endswith(".toml") or fn == "metadata.toml":
            continue
        key = parse_key(fn[:-5])
        doc = tomllib.load(open(os.path.join(base, fn), "rb"))
        for c in doc.get("commentary", []):
            stats["seen"] += 1
            url = c.get("source_url") or ""
            m = re.search(r"historicalchristian\.faith.*?file=([^&]+)", url)
            if not key:
                stats["not a book of the 66"] += 1
                continue
            if not m and "newadvent.org/fathers" in url:
                hit = author_edition(folder, c.get("quote", ""))
                if not hit:
                    stats["no checkable source file"] += 1
                    continue
                path = hit
            elif not m:
                stats["no checkable source file"] += 1
                continue
            else:
                path = None
            path = path or urllib.parse.unquote(urllib.parse.unquote(m.group(1))).split("#")[0]
            src = work_source(path)
            if not src:
                stats["work not in a named public-domain edition"] += 1
                continue
            t = wdb_text(path)
            if t is None:
                stats["source file missing"] += 1
                continue
            if flags.get(path):
                stats["source file marked machine translated"] += 1
                continue
            q = norm(c.get("quote", ""))
            if len(q) < 40 or not (q in t or (len(q) > 400 and q[:150] in t and q[-150:] in t)):
                stats["wording not found in the cited edition"] += 1
                continue
            b, c1, v1, c2, v2 = key
            dedupe = (folder, b, c1, v1, q[:200])
            if dedupe in seen:
                stats["duplicate"] += 1
                continue
            seen.add(dedupe)
            text, cut = clip(clean(c["quote"]))
            stats["clipped"] += cut
            a = author(folder, meta)
            title = tidy_caps(re.sub(r"\s+", " ", c.get("source_title") or "").strip()) or work_label(path, folder)
            extra = c.get("append_to_author_name") or ""
            if "as quoted by" in extra:
                title = title if "Catena" in title else f"{title} ({extra.strip(' ()')})"
            writings[b - 1].append((a, title, url, src_ix(src), c1, v1, c2, v2, text))
            A = authors[a]
            A["n"] += 1
            A["books"][b] += 1
            A["works"]["Catena Aurea (excerpts collected by Aquinas)" if src == CATENA else work_label(path, folder)] += 1
            stats["kept"] += 1

print("fathers", dict(stats))
print("machine marked files hit", sum(1 for p, f in flags.items() if f))

# ---------- 2. Wesley's Explanatory Notes (whole Bible) ----------
WIKI = "https://en.wikipedia.org/wiki/"
RM = "Reformation & Modern"
wesley = author("John Wesley", meta_by_folder.get("John Wesley", {}), cat=RM, wiki=WIKI + "John_Wesley", dates="1703–1791")
src_w = src_ix("John Wesley, Explanatory Notes upon the Old and New Testaments (1755–66), as structured by History of Methodism (kjv-wesley)")
SLUG = {re.sub(r"[^a-z0-9]", "", b.lower()): i + 1 for i, b in enumerate(BOOKS)}
SLUG["songofsongs"] = 22
n_w = 0
notes_dir = os.path.join(X, "kjv-wesley/web/data/notes")
for fn in sorted(os.listdir(notes_dir)):
    d = json.load(open(os.path.join(notes_dir, fn)))
    if not isinstance(d, dict) or "notes" not in d:
        continue
    b = SLUG.get(d.get("slug", "").replace("-", ""))
    if not b:
        continue
    notes = d["notes"]
    # The parser this edition used also read each book's outline as notes on chapter 1. The real notes restart at verse 1.
    restart = [i for i, n in enumerate(notes) if i and n["chapter"] == 1 and n["verse_start"] == 1]
    if restart:
        notes = notes[restart[-1]:]
    for n in notes:
        lemma, comment = n["lemma"].strip(), clean(n["comment"])
        # A note with no lead-in words may be a numbered point the parser took for a verse number, so its verse can't be trusted.
        if not lemma or len(comment) < 8:
            stats["wesley notes with no clear verse"] += 1
            continue
        c1, v1, v2 = n["chapter"], n["verse_start"], n["verse_end"]
        writings[b - 1].append((wesley, f"Explanatory Notes on {BOOKS[b-1]}", "https://www.ccel.org/ccel/wesley/notes", src_w, c1, v1, c1, max(v1, v2), f"{lemma} — {comment}"))
        authors[wesley]["n"] += 1
        authors[wesley]["books"][b] += 1
        authors[wesley]["works"]["Explanatory Notes"] += 1
        n_w += 1
print("wesley notes", n_w)

# ---------- 3. Matthew Henry and the Treasury of David (long commentary) ----------
SUP = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
def md_clean(s):
    s = re.sub(r"\\([.\[\]()*_-])", r"\1", s)
    s = re.sub(r"\*+", "", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", s)
    return clean(s)

henry_url = lambda b, ch: f"https://ccel.org/h/henry/mhc2/MHC{b:02d}{ch:03d}.HTM"
henry = author("Matthew Henry", cat=RM, wiki=WIKI + "Matthew_Henry", dates="1662–1714")
authors[henry]["year"] = 1714
src_h = src_ix("Matthew Henry, Commentary on the Whole Bible (1706–21), markdown edition by LyteWord (CC0)")
n_h = 0
root = os.path.join(X, "mhenry-complete")
for vol in sorted(os.listdir(root)):
    vp = os.path.join(root, vol)
    if not vol.startswith("volume-") or not os.path.isdir(vp):
        continue
    for slugdir in sorted(os.listdir(vp)):
        bp = os.path.join(vp, slugdir)
        if not os.path.isdir(bp):
            continue
        b = SLUG.get(slugdir.replace("-", ""))
        if not b:
            print("henry: unknown book", slugdir)
            continue
        for fn in os.listdir(bp):
            m = re.match(r"chapter-(\d+)\.md$", fn)
            if not m:
                continue
            ch = int(m.group(1))
            body = open(os.path.join(bp, fn), encoding="utf-8").read()
            body = re.sub(r"^---.*?\n---\n", "", body, flags=re.S)
            sections = re.split(r"(?m)^## +", body)
            head = re.sub(r"(?m)^# .*$", "", sections[0]).strip()
            if head:
                comm[b - 1].append((henry, f"Introduction to {BOOKS[b-1]} {ch}", henry_url(b, ch), src_h, ch, 0, ch, 0, md_clean(head)))
                n_h += 1
            for sec in sections[1:]:
                title, _, rest = sec.partition("\n")
                nums = [int(x.translate(SUP)) for x in re.findall(r"(?m)^> *\*\*([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\*\*", rest)]
                prose = "\n".join(l for l in rest.split("\n") if not l.startswith(">"))
                prose = md_clean(prose)
                if not prose:
                    continue
                v1, v2 = (min(nums), max(nums)) if nums else (0, 0)
                comm[b - 1].append((henry, md_clean(title), henry_url(b, ch), src_h, ch, v1, ch, v2, prose))
                n_h += 1
print("henry sections", n_h)

tod_url = lambda vol, ch: f"https://github.com/lyteword/chspurgeon-tod/blob/main/{vol}/psalm-{ch}.md"
spurgeon = author("Charles Spurgeon", cat=RM, wiki=WIKI + "Charles_Spurgeon", dates="1834–1892")
authors[spurgeon]["year"] = 1892
src_t = src_ix("C. H. Spurgeon, The Treasury of David (1869–85), markdown edition by LyteWord (CC0)")
n_t = 0
root = os.path.join(X, "chspurgeon-tod")
for vol in sorted(os.listdir(root)):
    vp = os.path.join(root, vol)
    if not vol.startswith("volume-") or not os.path.isdir(vp):
        continue
    for fn in os.listdir(vp):
        m = re.match(r"psalm-(\d+)\.md$", fn)
        if not m:
            continue
        ch = int(m.group(1))
        body = re.sub(r"^---.*?\n---\n", "", open(os.path.join(vp, fn), encoding="utf-8").read(), flags=re.S)
        sections = re.split(r"(?m)^## +", body)
        intro = re.sub(r"(?m)^# .*$", "", sections[0]).strip()
        if intro:
            comm[18].append((spurgeon, f"Treasury of David, on Psalm {ch}", tod_url(vol, ch), src_t, ch, 0, ch, 0, md_clean(intro)))
            n_t += 1
        for sec in sections[1:]:
            name, _, rest = sec.partition("\n")
            if not name.strip().lower().startswith("exposition"):
                continue
            for part in re.split(r"(?m)^### +", rest)[1:]:
                vh, _, text = part.partition("\n")
                mv = re.search(r"(\d+)(?:\D+(\d+))?", vh)
                if not mv:
                    continue
                prose = md_clean("\n".join(l for l in text.split("\n") if not l.startswith(">")))
                if prose:
                    comm[18].append((spurgeon, f"Treasury of David, Psalm {ch}", tod_url(vol, ch), src_t, ch, int(mv.group(1)), ch, int(mv.group(2) or mv.group(1)), prose))
                    authors[spurgeon]["n"] += 1
                    n_t += 1
print("treasury sections", n_t)

# ---------- 4. Luther on Galatians ----------
luther = author("Martin Luther", meta_by_folder.get("Martin Luther", {}), cat=RM, wiki=WIKI + "Martin_Luther", dates="1483–1546")
src_l = src_ix("Martin Luther, Commentary on Galatians (1535), abridged and modernized by Theodore Graebner (1949), Project Gutenberg no. 1549")
url_l = "https://www.gutenberg.org/ebooks/1549"
raw = open(os.path.join(X, "Commentary-on-the-Epistle-to-the-Galatians_1549/1549.txt"), encoding="utf-8", errors="replace").read().replace("\r", "")
raw = raw[raw.index("CHAPTER 1\n"):]
end = raw.find("End of the Project Gutenberg")
raw = raw[: end if end > 0 else None]
n_l = 0
for chap in re.split(r"(?m)^CHAPTER (?=\d+\n)", "CHAPTER " + raw)[1:]:
    ch = int(chap.split("\n", 1)[0])
    if ch < 1 or ch > 6:
        continue
    for part in re.split(r"(?m)^\s*(?=VERSES? \d)", chap)[1:]:
        m = re.match(r"VERSES? (\d+)(?:\s*(?:-|–|,|AND|TO)\s*(\d+))?", part)
        if not m:
            continue
        lines = part.split("\n\n", 1)
        body = clean(lines[1] if len(lines) > 1 else "")
        body = re.sub(r"(?<!\n)\n(?!\n)", " ", body)
        if len(body) < 20:
            continue
        v1, v2 = int(m.group(1)), int(m.group(2) or m.group(1))
        comm[47].append((luther, f"Commentary on Galatians {ch}", url_l, src_l, ch, v1, ch, v2, body))
        authors[luther]["n"] += 1
        n_l += 1
authors[luther]["books"][48] += n_l
authors[luther]["works"]["Commentary on Galatians (Graebner's abridgment)"] += n_l
print("luther sections", n_l)

# ---------- 5. Jonathan Edwards, seven sermons ----------
edwards = author("Jonathan Edwards", cat=RM, wiki=WIKI + "Jonathan_Edwards_(theologian)", dates="1703–1758")
authors[edwards]["year"] = 1758
src_e = src_ix("Selected Sermons of Jonathan Edwards, ed. H. N. Gardiner (Macmillan, 1904), Project Gutenberg no. 34632")
url_e = "https://www.gutenberg.org/ebooks/34632"
EDW = [("I", "God Glorified in Man's Dependence (1731)", 46, 1, 29, 31, "1 Cor. i. 29"),
       ("II", "A Divine and Supernatural Light (1733)", 40, 16, 17, 17, "Blessed art thou, Simon Barjona"),
       ("III", "Ruth's Resolution (1735)", 8, 1, 16, 16, "Ruth i. 16"),
       ("IV", "The Many Mansions (1737)", 43, 14, 2, 2, "John xiv. 2"),
       ("V", "Sinners in the Hands of an Angry God (1741)", 5, 32, 35, 35, "Deuteronomy xxxii. 35"),
       ("VI", "A Strong Rod Broken and Withered (1748)", 26, 19, 12, 12, "Ezek. xix. 12"),
       ("VII", "Farewell Sermon (1750)", 47, 1, 14, 14, "2 Cor. i. 14")]
ed_dir = os.path.join(X, "Selected-Sermons-of-Jonathan-Edwards_34632")
ed_file = next(f for f in sorted(os.listdir(ed_dir)) if f.endswith(".txt"))
raw = open(os.path.join(ed_dir, ed_file), encoding="latin-1").read().replace("\r", "")
marks = [m for m in re.finditer(r"(?m)^(I|II|III|IV|V|VI|VII)\n\n", raw)]
notes_at = [m.start() for m in re.finditer(r"(?m)^NOTES\s*$", raw)]
stop = notes_at[-1] if notes_at else len(raw)
n_e = 0
for i, (num, title, b, ch, v1, v2, cite) in enumerate(EDW):
    m = next(x for x in marks if x.group(1) == num)
    nxt = next((x.start() for x in marks if x.start() > m.start() and x.group(1) != num), stop)
    body = clean(raw[m.end():min(nxt, stop)])
    body = re.sub(r"(?<!\n)\n(?!\n)", " ", body).replace("°", "")
    head = re.sub(r"[^a-z0-9]", "", body[:900].lower())
    want = re.sub(r"[^a-z0-9]", "", cite.lower())
    if want not in head:
        print("edwards: text reference not found for", title, repr(body[:300]))
    comm[b - 1].append((edwards, title, url_e, src_e, ch, v1, ch, v2, body))
    authors[edwards]["n"] += 1
    authors[edwards]["books"][b] += 1
    authors[edwards]["works"]["Selected Sermons (1904)"] += 1
    n_e += 1
print("edwards sermons", n_e)

# ---------- 6. Calvin's Institutes: passages he cites ----------
calvin = author("John Calvin", meta_by_folder.get("John Calvin", {}), cat=RM, wiki=WIKI + "John_Calvin", dates="1509–1564")
src_c = src_ix("John Calvin, Institutes of the Christian Religion (1559), trans. John Allen (1813; 6th American ed., 1921), Project Gutenberg nos. 45001 and 64392")
ABBR = {"gen":1,"genesis":1,"exod":2,"exodus":2,"ex":2,"lev":3,"leviticus":3,"num":4,"numb":4,"numbers":4,"deut":5,"deuteronomy":5,"josh":6,"joshua":6,"judg":7,"judges":7,"ruth":8,"1 sam":9,"2 sam":10,"1 kings":11,"2 kings":12,"1 chron":13,"2 chron":14,"ezra":15,"neh":16,"nehemiah":16,"esther":17,"job":18,"psalm":19,"psalms":19,"ps":19,"prov":20,"proverbs":20,"eccl":21,"eccles":21,"ecclesiastes":21,"cant":22,"isaiah":23,"isa":23,"jer":24,"jeremiah":24,"lam":25,"lamentations":25,"ezek":26,"ezekiel":26,"dan":27,"daniel":27,"hosea":28,"hos":28,"joel":29,"amos":30,"obad":31,"jonah":32,"micah":33,"mic":33,"nahum":34,"hab":35,"habakkuk":35,"zeph":36,"haggai":37,"hag":37,"zech":38,"zechariah":38,"mal":39,"malachi":39,"matt":40,"matthew":40,"mark":41,"luke":42,"john":43,"acts":44,"rom":45,"romans":45,"1 cor":46,"2 cor":47,"gal":48,"galatians":48,"eph":49,"ephesians":49,"phil":50,"philippians":50,"col":51,"colossians":51,"1 thess":52,"2 thess":53,"1 tim":54,"2 tim":55,"titus":56,"tit":56,"philem":57,"heb":58,"hebrews":58,"james":59,"1 pet":60,"2 pet":61,"1 peter":60,"2 peter":61,"1 john":62,"2 john":63,"3 john":64,"jude":65,"rev":66,"revelation":66}
ROM = {"i":1,"v":5,"x":10,"l":50,"c":100}
def roman(s):
    t = 0
    s = s.lower()
    for i, ch in enumerate(s):
        v = ROM[ch]
        t += -v if i + 1 < len(s) and ROM[s[i + 1]] > v else v
    return t
CITE = re.compile(r"\b((?:[123] )?[A-Z][a-z]+)\.? ([ivxlc]+)\. (\d+)(?:[-‐–](\d+))?")
counts = json.load(open(os.path.join(args.out, "verse-counts.json")))

def cites(text):
    out = []
    for m in CITE.finditer(text):
        b = ABBR.get(m.group(1).lower())
        if not b:
            continue
        ch, v1 = roman(m.group(2)), int(m.group(3))
        v2 = int(m.group(4)) if m.group(4) else v1
        chs = counts[b - 1]
        if ch < 1 or ch > len(chs) or v1 < 1 or v1 > chs[ch - 1]:
            continue
        out.append((b, ch, v1, max(v1, min(v2, chs[ch - 1]))))
    return out

def sentences_around(text, pos):
    """The sentence holding the citation mark and one on each side."""
    bounds = [m.end() for m in re.finditer(r"[.?!][”\"’)]*\s+(?=[A-Z“\"])", text)]
    starts = [0] + bounds
    i = 0
    for j, s in enumerate(starts):
        if s <= pos:
            i = j
    a = starts[max(0, i - 1)]
    b = starts[i + 2] if i + 2 < len(starts) else len(text)
    return ("… " if a > 0 else "") + text[a:b].strip() + (" …" if b < len(text) else "")

BK_ROM = {"I": 1, "II": 2, "III": 3, "IV": 4}
n_c = 0
seen_c = set()
for rep, gid in (("Institutes-of-the-Christian-Religion--Vol.-1-of-2-_45001/45001-0.txt", 45001), ("Institutes-of-the-Christian-Religion-Vol-2-of-2_64392/64392-0.txt", 64392)):
    raw = open(os.path.join(X, rep), encoding="utf-8", errors="replace").read().replace("\r", "")
    notes = {}
    if gid == 45001:
        # Volume 1: numbered marks like (133) with one list of notes at the end.
        fn_at = raw.rfind("\nFOOTNOTES\n")
        end = raw.find("End of the Project Gutenberg", fn_at)
        for m in re.finditer(r"(?ms)^ {1,5}(\d+) (.*?)(?=^ {1,5}\d+ |\Z)", raw[fn_at: end if end > 0 else None]):
            notes.setdefault(int(m.group(1)), re.sub(r"\s+", " ", m.group(2)).strip())
        body = raw[:fn_at]
        body = body[list(re.finditer(r"(?m)^BOOK I\. ", body))[-1].start():]
        mark = re.compile(r"\((\d{1,4})\)")
    else:
        # Volume 2: numbered marks like [219] with "Footnote 219:" blocks after each chapter.
        end = raw.find("End of the Project Gutenberg")
        body = raw[raw.index("BOOK III."): end if end > 0 else None]
        for m in re.finditer(r"(?m)^Footnote (\d+):\s*\n\s*\n((?:.+\n)+)", body):
            notes.setdefault(int(m.group(1)), re.sub(r"\s+", " ", m.group(2)).strip())
        body = re.sub(r"(?m)^Footnote \d+:\s*\n\s*\n(?:.+\n)+", "", body)
        mark = re.compile(r"\[(\d{1,4})\]")
    bk, chap = (1 if gid == 45001 else 3), 0
    for para in re.split(r"\n\s*\n", body):
        p = re.sub(r"\s+", " ", para).strip()
        mb = re.match(r"BOOK (I|II|III|IV)\b", p)
        if mb:
            bk = BK_ROM[mb.group(1)]
            continue
        mc = re.match(r"(?:Chapter|CHAPTER) ([IVXLC]+)\.", p)
        if mc and len(p) < 240:
            chap = roman(mc.group(1))
            sec = 0
            continue
        ms = re.match(r"([IVXLC]+)\. (?=\S)", p)
        if ms and chap:
            sec = roman(ms.group(1))
        if not chap or len(p) < 80:
            continue
        plain = mark.sub("", p)
        found = []
        for mk in mark.finditer(p):
            pos = len(mark.sub("", p[: mk.start()]))
            for c in cites(notes.get(int(mk.group(1)), "")):
                found.append((c, pos))
        for m in CITE.finditer(plain):
            for c in cites(m.group(0)):
                found.append((c, m.start()))
        for (b, c1, v1, v2), pos in found:
            label = f"Institutes, Book {['I','II','III','IV'][bk-1]}, ch. {chap}" + (f", sec. {sec}" if sec else "")
            key = (b, c1, v1, label)
            if key in seen_c:
                continue
            seen_c.add(key)
            text, _ = clip(sentences_around(plain, pos), 1400)
            writings[b - 1].append((calvin, label, f"https://www.gutenberg.org/ebooks/{gid}", src_c, c1, v1, c1, v2, text))
            authors[calvin]["n"] += 1
            authors[calvin]["books"][b] += 1
            authors[calvin]["works"]["Institutes of the Christian Religion"] += 1
            n_c += 1
print("calvin citations", n_c)

# ---------- 7. Spurgeon's sermons: an index only ----------
# The markdown text is a copyrighted modern edition, so only the facts are kept: number, title, verse.
# The link goes to the Spurgeon Library at Midwestern Seminary, which has the original wording.
root = os.path.join(X, "chspurgeon-sermons")
FULL = {b.lower(): i + 1 for i, b in enumerate(BOOKS)}
FULL.update({"song of songs": 22, "psalm": 19, "canticles": 22, "revelations": 66, "acts of the apostles": 44})
sermons = [[] for _ in BOOKS]
n_s = bad = 0
for vol in sorted(os.listdir(root)):
    vp = os.path.join(root, vol)
    if not vol.startswith("volume-") or not os.path.isdir(vp):
        continue
    for fn in os.listdir(vp):
        if not fn.endswith(".md") or fn.startswith("_"):
            continue
        head = open(os.path.join(vp, fn), encoding="utf-8").read(3000)
        m = re.search(r"(?m)^# Sermon (\d+)[a-z]? *\| *(.+?)\s*$", head)
        if not m:
            bad += 1
            continue
        num, title = int(m.group(1)), m.group(2).strip()
        block = re.findall(r"(?m)^> *(.+?)\s*$", head[m.end():m.end() + 1500])
        ref = None
        for line in reversed(block[:6]):
            r = re.match(r"^((?:[123] )?[A-Za-z ]+?)\.? (\d+):(\d+)(?:[-–,] ?(\d+))?\.?$", line.strip())
            if r and r.group(1).lower() in FULL:
                ref = r
                break
        if not ref:
            bad += 1
            continue
        b = FULL[ref.group(1).lower()]
        c, v1 = int(ref.group(2)), int(ref.group(3))
        v2 = int(ref.group(4) or v1)
        sermons[b - 1].append([num, title, c, v1, max(v1, v2), int(vol.split("-")[1])])
        authors[spurgeon]["books"][b] += 1
        n_s += 1
authors[spurgeon]["works"]["Sermons (index only)"] += n_s
authors[spurgeon]["works"]["The Treasury of David"] += n_t
print("spurgeon sermons indexed", n_s, "without a clear text", bad)

# ---------- Output ----------
for d in (OUT_W, OUT_C):
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
PART_BYTES = 1_600_000

def write_shards(records, outdir):
    parts = {}
    total = 0
    for i, recs in enumerate(records):
        b = i + 1
        if not recs:
            continue
        recs.sort(key=lambda r: (r[4], r[5], authors[r[0]]["year"] or 9999, r[0]))
        by_ch = collections.defaultdict(list)
        for r in recs:
            by_ch[r[4]].append(r)
        groups, cur, size = [], [], 0
        for ch in sorted(by_ch):
            sz = sum(len(r[8].encode()) + 60 for r in by_ch[ch])
            if cur and size + sz > PART_BYTES:
                groups.append(cur)
                cur, size = [], 0
            cur.append(ch)
            size += sz
        if cur:
            groups.append(cur)
        parts[b] = []
        for k, chs in enumerate(groups):
            titles, tix, rows = [], {}, []
            for ch in chs:
                for a, title, url, src, c1, v1, c2, v2, text in by_ch[ch]:
                    tk = (title, url, src)
                    if tk not in tix:
                        tix[tk] = len(titles)
                        titles.append([title, url, src])
                    rows.append([a, tix[tk], c1, v1, c2, v2, text])
            name = f"{b:02d}-{k}.json"
            s = json.dumps({"t": titles, "q": rows}, ensure_ascii=False, separators=(",", ":"))
            assert "�" not in s, name
            open(os.path.join(outdir, name), "w", encoding="utf-8").write(s)
            total += len(s.encode())
            parts[b].append([chs[0], chs[-1], k])
    return parts, total

for i, recs in enumerate(comm):
    for r in recs:
        if r[0] == henry:
            authors[henry]["n"] += 1
            authors[henry]["books"][i + 1] += 1
        elif r[0] == spurgeon:
            authors[spurgeon]["books"][i + 1] += 1
authors[henry]["works"]["Commentary on the Whole Bible"] = authors[henry]["n"]

w_parts, w_total = write_shards(writings, OUT_W)
c_parts, c_total = write_shards(comm, OUT_C)
out_authors = []
for a in authors:
    out_authors.append({**a, "works": a["works"].most_common(), "books": sorted(a["books"].items())})
index = {"authors": out_authors, "sources": sources, "writings": w_parts, "comm": c_parts, "sermons": None}
json.dump(index, open(os.path.join(OUT_W, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(sermons, open(os.path.join(OUT_W, "sermons.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump({"stats": stats, "kept": stats["kept"]}, open(os.path.join(OUT_W, "stats.json"), "w"), separators=(",", ":"))
print("writings", round(w_total / 1e6, 1), "MB", sum(len(v) for v in w_parts.values()), "files; comm", round(c_total / 1e6, 1), "MB", sum(len(v) for v in c_parts.values()), "files; authors", len(authors))
