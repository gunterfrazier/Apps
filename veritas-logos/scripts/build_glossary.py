#!/usr/bin/env python3
"""Builds public/data/glossary.json: theological terms with definitions quoted from named public-domain works.

Nothing here is written by hand except the list of terms and which entries they map to. A term with no definition in
these sources stays in the list marked as such, so the gap is visible rather than filled.
Run after build-data.mjs:  python3 -I scripts/build_glossary.py --sources /home/claude/sources --out public/data
"""
import argparse, glob, html, json, os, re, unicodedata

ap = argparse.ArgumentParser()
ap.add_argument("--sources", required=True)
ap.add_argument("--out", required=True)
args = ap.parse_args()
X = os.path.join(args.sources, "extra")

RAW = os.path.join(X, "easton-smith/data/00_raw/ccel/xml")
# CCEL's own files, each marked public domain. The dataset that holds them calls the second one Hastings, but its title page says otherwise.
DICTS = [
    ("easton", "easton_ebd2.xml", "M. G. Easton, Illustrated Bible Dictionary, 3rd ed. (1897)", "Easton's Bible Dictionary", "https://ccel.org/ccel/easton/ebd2"),
    ("schaff", "hastings_dict_bible.xml", "A Dictionary of the Bible, ed. Philip Schaff (American Sunday-School Union, 1880)", "Schaff's Dictionary of the Bible", ""),
    ("smith", "smith_bibledict.xml", "William Smith, A Dictionary of the Bible (1884 ed.)", "Smith's Bible Dictionary", ""),
]
OSIS = {"Gen":"Genesis","Exod":"Exodus","Lev":"Leviticus","Num":"Numbers","Deut":"Deuteronomy","Josh":"Joshua","Judg":"Judges","Ruth":"Ruth","1Sam":"1 Samuel","2Sam":"2 Samuel","1Kgs":"1 Kings","2Kgs":"2 Kings","1Chr":"1 Chronicles","2Chr":"2 Chronicles","Ezra":"Ezra","Neh":"Nehemiah","Esth":"Esther","Job":"Job","Ps":"Psalm","Prov":"Proverbs","Eccl":"Ecclesiastes","Song":"Song of Solomon","Isa":"Isaiah","Jer":"Jeremiah","Lam":"Lamentations","Ezek":"Ezekiel","Dan":"Daniel","Hos":"Hosea","Joel":"Joel","Amos":"Amos","Obad":"Obadiah","Jonah":"Jonah","Mic":"Micah","Nah":"Nahum","Hab":"Habakkuk","Zeph":"Zephaniah","Hag":"Haggai","Zech":"Zechariah","Mal":"Malachi","Matt":"Matthew","Mark":"Mark","Luke":"Luke","John":"John","Acts":"Acts","Rom":"Romans","1Cor":"1 Corinthians","2Cor":"2 Corinthians","Gal":"Galatians","Eph":"Ephesians","Phil":"Philippians","Col":"Colossians","1Thess":"1 Thessalonians","2Thess":"2 Thessalonians","1Tim":"1 Timothy","2Tim":"2 Timothy","Titus":"Titus","Phlm":"Philemon","Heb":"Hebrews","Jas":"James","1Pet":"1 Peter","2Pet":"2 Peter","1John":"1 John","2John":"2 John","3John":"3 John","Jude":"Jude","Rev":"Revelation"}
counts = json.load(open(os.path.join(args.out, "verse-counts.json")))
BOOKNO = {name: i + 1 for i, name in enumerate(OSIS.values())}

def plain(x):
    x = re.sub(r"<(?:/p|br\s*/?)>", "\n\n", x)
    x = html.unescape(re.sub(r"<[^>]+>", "", x)).replace("\ufffd", "")
    x = re.sub(r" ([,.;:?!])", r"\1", x)
    x = re.sub(r"[ \t\r]*\n\s*\n\s*", "\u0001", x)
    x = re.sub(r"\s+", " ", x)
    return x.replace("\u0001", "\n\n").strip()

def refs_in(xml):
    refs = []
    for pr in re.findall(r'parsed="([^"]*)"', xml):
        for one in pr.split(";"):
            b = one.split("|")
            if len(b) >= 6 and b[0] in ("", "asv") and b[1] in OSIS and b[2].isdigit() and b[3].isdigit() and int(b[3]):
                book, c, v = OSIS[b[1]], int(b[2]), int(b[3])
                chs = counts[BOOKNO[book] - 1]
                if 1 <= c <= len(chs) and 1 <= v <= chs[c - 1]:
                    r = f"{book} {c}:{v}"
                    if r not in refs:
                        refs.append(r)
    return refs

def key_of(name):
    return re.sub(r"[.,:;]+$", "", name.upper().replace("’", "'").strip())

D = {}
for key, fn, *_ in DICTS:
    raw = open(os.path.join(RAW, fn), encoding="utf-8", errors="replace").read()
    assert "public domain" in re.search(r"<DC\.Rights[^>]*>([^<]*)", raw).group(1).lower(), fn
    d = {}
    def add(name, xml):
        e = d.setdefault(key_of(name), {"name": name.strip(" .,:;"), "text": "", "refs": []})
        e["text"] = (e["text"] + "\n\n" + plain(xml)).strip()
        e["refs"] += [r for r in refs_in(xml) if r not in e["refs"]]
    if "<term" in raw:
        for m in re.finditer(r"<term\b[^>]*>(.*?)</term>\s*<def\b[^>]*>(.*?)</def>", raw, re.S):
            add(plain(m.group(1)), m.group(2))
    else:
        # This dictionary marks each headword in bold capitals at the start of a paragraph, sometimes with accent marks.
        heads = list(re.finditer(r"<p\b[^>]*>\s*<strong\b[^>]*>([^<]*[A-Z]{2}[^<]*)</strong>", raw))
        for i, m in enumerate(heads):
            end = heads[i + 1].start() if i + 1 < len(heads) else len(raw)
            chunk = raw[m.start(): min(end, m.start() + 60000)]
            cut = re.search(r"</div\d>", chunk)
            add(plain(m.group(1)).replace("'", ""), chunk[: cut.start()] if cut else chunk)
    D[key] = d
    print(key, len(d), "entries")

# Sections of Schaff's History of the Christian Church (vol. 2, public domain in CCEL's file) for movements the dictionaries skip.
HCC = os.path.join(X, "ccel-copy/references/ccel/authors/schaff/hcc2.xml")
hcc_raw = open(HCC, encoding="utf-8", errors="replace").read()
assert "public domain" in re.search(r"<DC\.Rights[^>]*>([^<]*)", hcc_raw).group(1).lower()
HISTORY = {"Gnosticism": "v.xiii.v", "Montanism": "v.xii.iii", "Ebionites": "v.xiii.ii", "Marcionism": "v.xiii.xvi", "Sabellianism": "v.xiv.xvi", "Manichaeism": "v.xiii.xxiv", "Eucharist": "v.vii.xi", "Creed": "v.xiv.iv"}
WATSON_FILE = os.path.join(X, "ccel-copy/references/ccel/authors/watson/divinity.xml")
watson_raw = open(WATSON_FILE, encoding="utf-8", errors="replace").read()
assert "public domain" in re.search(r"<DC\.Rights[^>]*>([^<]*)", watson_raw).group(1).lower()
WATSON = {"Immutability of God": "vi.iv", "Omniscience": "vi.ii", "Omnipotence": "vi.vi", "Wisdom": "vi.v", "Original sin": "vii.iii"}

def section(raw, did):
    """The title and the first prose of a section. These open with lists of literature, so those paragraphs are skipped."""
    head = re.search(r'<div(\d)\b[^>]*\bid="%s"[^>]*>' % re.escape(did), raw)
    if not head:
        return None, ""
    end = raw.find(f"</div{head.group(1)}>", head.end())
    body = re.sub(r"<note\b.*?</note>", "", raw[head.end():end], flags=re.S)
    title = re.search(r'title="([^"]*)"', head.group(0)).group(1)
    paras = [plain(x) for x in re.findall(r"<p\b[^>]*>(.*?)</p>", body, re.S)]
    prose = [x for x in paras if len(x) > 200 and x.count(",") < len(x) / 22 and not re.search(r"\b(ed\.|pp\.|vol\.|Leipz|Berlin|Lond\.|Adv\.|Apol\b)", x[:300]) and not re.match(r"^[IVX]+\.\s+\w+( \w+\.?)?:", x) and not re.match(r"^(Sources|Literature|Comp\.|II )", x) and "(in Herzog" not in x[:400]]
    text = "\n\n".join(prose[:2])
    return title.strip(), (text[:1600].rsplit(". ", 1)[0] + ". …") if len(text) > 1600 else text

# term -> dictionary headwords that actually treat it. Listed by hand so a place or person of the same name can't slip in.
TERMS = {
    "Adoption": ["ADOPTION"], "Advocate": ["ADVOCATE"], "Angel": ["ANGEL"], "Antichrist": ["ANTICHRIST"], "Apocalypse": ["APOCALYPSE"], "Apocrypha": ["APOCRYPHA"], "Apostasy": [], "Apostle": ["APOSTLE"],
    "Arianism": [], "Arminianism": [], "Ascension": ["ASCENSION"], "Assurance": ["ASSURANCE"], "Atonement": ["ATONEMENT"], "Attributes of God": [], "Baptism": ["BAPTISM", "BAPTISM OF CHRIST"], "Bishop": ["BISHOP"], "Blasphemy": ["BLASPHEMY"],
    "Calling": ["CALLING"], "Calvinism": [], "Canon of Scripture": ["CANON"], "Catechism": [], "Christ": ["CHRIST"], "Christology": [], "Church": ["CHURCH"], "Circumcision": ["CIRCUMCISION"], "Common grace": [], "Communion": ["COMMUNION"], "Confession": ["CONFESSION"], "Conscience": ["CONSCIENCE"], "Consubstantiation": [], "Conversion": ["CONVERSION"], "Covenant": ["COVENANT"], "Creation": ["CREATION"], "Creed": [],
    "Deacon": ["DEACON"], "Decrees of God": ["DECREES OF GOD"], "Deism": [], "Demon": ["DEMON", "DEVILS"], "Devil": ["DEVIL"], "Disciple": ["DISCIPLE"], "Dispensation": ["DISPENSATION"], "Dispensationalism": [], "Docetism": [], "Doctrine": [], "Doxology": [], "Ebionites": [], "Ecclesiology": [], "Effectual calling": [], "Elder": ["ELDER"], "Election": ["ELECTION OF GRACE"], "Eschatology": [], "Eternal life": ["ETERNAL LIFE"], "Eucharist": [], "Evangelist": ["EVANGELIST"], "Exegesis": [], "Expiation": ["EXPIATION"],
    "Faith": ["FAITH"], "The Fall": ["FALL OF MAN"], "Fasting": ["FAST"], "Flesh": ["FLESH"], "Foreknowledge": ["FOREKNOWLEDGE OF GOD"], "Forgiveness": ["FORGIVENESS OF SIN"], "Free will": [], "Glory": ["GLORY"], "Gnosticism": [], "God": ["GOD"], "Godliness": ["GODLINESS"], "Gospel": ["GOSPEL"], "Grace": ["GRACE"], "Guilt": [],
    "Hades": ["HADES"], "Heaven": ["HEAVEN"], "Hell": ["HELL"], "Heresy": ["HERESY"], "Hermeneutics": [], "Holiness": ["HOLINESS"], "Holy Spirit": ["HOLY GHOST", "SPIRIT, HOLY"], "Hope": ["HOPE"], "Humiliation of Christ": [], "Hypostatic union": [], "Idolatry": ["IDOLATRY"], "Illumination": [], "Image of God": [], "Immanence": [], "Immortality": ["IMMORTALITY"], "Immutability of God": [], "Imputation": ["IMPUTATION"], "Incarnation": ["INCARNATION"], "Inerrancy": [], "Inspiration": ["INSPIRATION"], "Intercession": ["INTERCESSION OF CHRIST"], "Intermediate state": [],
    "Judgment": ["JUDGMENT", "JUDGMENT, THE FINAL"], "Justice": ["JUSTICE"], "Justification": ["JUSTIFICATION"], "Kenosis": [], "Kingdom of God": ["KINGDOM OF GOD"], "Law": ["LAW OF MOSES", "LAW"], "Limited atonement": [], "Logos": [], "Lord's Day": ["LORD'S DAY"], "Lord's Supper": ["LORD'S SUPPER"], "Love": ["LOVE"],
    "Marcionism": [], "Manichaeism": [], "Manichaeism": [], "Mediator": ["MEDIATOR"], "Mercy": ["MERCY"], "Messiah": ["MESSIAH"], "Millennium": ["MILLENNIUM"], "Miracle": ["MIRACLES"], "Modalism": [], "Monarchianism": [], "Monophysitism": [], "Monotheism": [], "Montanism": [], "Mortification": [], "Mystery": ["MYSTERY"], "Nestorianism": [], "New birth": ["REGENERATION"], "Obedience": [], "Omnipotence": [], "Omnipresence": [], "Omniscience": [], "Ordination": [], "Original sin": [],
    "Pantheism": [], "Parable": ["PARABLE"], "Paraclete": [], "Paradise": ["PARADISE"], "Parousia": [], "Passover": ["PASSOVER"], "Pelagianism": [], "Perfection": ["SANCTIFICATION"], "Perichoresis": [], "Perseverance": ["PERSEVERANCE OF THE SAINTS"], "Pneumatology": [], "Prayer": ["PRAYER"], "Predestination": ["PREDESTINATION"], "Presbyter": ["ELDER"], "Priest": ["PRIEST"], "Priesthood of believers": [], "Prophecy": ["PROPHECY"], "Prophet": ["PROPHET"], "Propitiation": ["PROPITIATION"], "Providence": ["PROVIDENCE"], "Purgatory": [],
    "Ransom": ["RANSOM"], "Rapture": [], "Reconciliation": ["RECONCILATION", "RECONCILIATION"], "Redemption": ["REDEMPTION"], "Regeneration": ["REGENERATION"], "Remission": [], "Repentance": ["REPENTANCE"], "Reprobation": ["REPROBATE"], "Resurrection": ["RESURRECTION", "RESURRECTION OF CHRIST"], "Revelation": ["REVELATION"], "Righteousness": ["RIGHTEOUSNESS", "JUSTIFICATION"],
    "Sabbath": ["SABBATH"], "Sabellianism": [], "Sacrament": [], "Sacrifice": ["SACRIFICE"], "Saint": ["SAINT", "SAINTS"], "Salvation": ["SALVATION"], "Sanctification": ["SANCTIFICATION"], "Satan": ["SATAN"], "Scripture": ["SCRIPTURE"], "Second Coming": [], "Semi-Pelagianism": [], "Septuagint": ["SEPTUAGINT"], "Sin": ["SIN"], "Soteriology": [], "Soul": [], "Sovereignty of God": [], "Spirit": ["SPIRIT"], "Subordinationism": [], "Supralapsarianism": [], "Tabernacle": ["TABERNACLE"], "Temptation": ["TEMPTATION"], "Theism": [], "Theodicy": [], "Theology": [], "Theophany": [], "Total depravity": [], "Tradition": ["TRADITION"], "Transcendence": [], "Transfiguration": ["TRANSFIGURATION, THE"], "Transubstantiation": [], "Trinity": ["TRINITY"], "Type": ["TYPE"], "Typology": ["TYPE"], "Unction": ["UNCTION"], "Union with Christ": [], "Virgin birth": [], "Vocation": [], "Wisdom": [], "Word of God": ["WORD OF GOD"], "Worship": ["WORSHIP"], "Wrath of God": [],
}
# term -> the exact catechism question that defines it. Quoted from the confession data the app already holds.
QUESTIONS = {
    "Adoption": ["What is adoption?"], "Baptism": ["What is baptism?"], "God": ["What is God?"], "Decrees of God": ["What are the decrees of God?"], "Effectual calling": ["What is effectual calling?"], "Faith": ["What is faith in Jesus Christ?", "What is justifying faith?"], "Justification": ["What is justification?"], "Sanctification": ["What is sanctification?"], "Repentance": ["What is repentance unto life?", "What is the true repentance or conversion of man?"], "Sin": ["What is sin?"], "Lord's Supper": ["What is the Lord's supper?"], "Sacrament": ["What is a sacrament?"], "Prayer": ["What is prayer?"], "Creation": ["What is the work of creation?"], "Providence": ["What are God's works of providence?"], "Word of God": ["What is the word of God?"], "Church": ["What is the visible church?", "What is the invisible church?"], "Humiliation of Christ": ["What was the estate of Christ's humiliation?"], "Incarnation": ["How did Christ, being the Son of God, become man?"], "Union with Christ": ["What is that union which the elect have with Christ?"], "Glorification": ["What is the communion in glory with Christ which the members of the invisible church enjoy immediately after death?", "What is the communion in glory with Christ, which the members of the invisible church shall enjoy at the resurrection and day of judgment?"], "Mediator": ["Who is the Redeemer of God's elect?"],
}
BY_LABEL = {"Original sin": [("WLC", "Q25"), ("WLC", "Q26")], "Glorification": [("WLC", "Q83"), ("WLC", "Q86")]}
HC_TOPIC = {"Faith": "What is true faith?", "Sacrament": "What are the Sacraments?"}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip("-")

conf = json.load(open(os.path.join(args.out, "confession-sections.json"), encoding="utf-8"))
by_q = {}
for doc, label, title, text in conf["sections"]:
    if title:
        by_q.setdefault(re.sub(r"\s+", " ", title).strip().lower(), []).append((doc, label, title, text))
topics = {name.lower(): s for s, name in json.load(open(os.path.join(args.out, "topics/names.json"), encoding="utf-8"))}

def tidy(t):
    t = html.unescape(t).replace("�", "")
    t = re.sub(r"[ \t]+", " ", t).strip()
    return t

missing_heads, out, no_q = [], [], []
for term, heads in sorted(TERMS.items(), key=lambda x: x[0].lower().replace("the ", "")):
    defs, refs = [], []
    for key, fn, full, short, url in DICTS:
        for h in heads:
            e = D[key].get(h)
            if not e or len(e["text"]) < 60:
                continue
            text = e["text"]
            defs.append({"source": full, "short": short, "head": e["name"], "text": text[:6000] + (" …" if len(text) > 6000 else ""), "url": url})
            refs += [r for r in e["refs"] if r not in refs]
            break
    if term in HISTORY:
        title, text = section(hcc_raw, HISTORY[term])
        if text:
            defs.append({"source": f"Philip Schaff, History of the Christian Church, vol. 2, “{html.unescape(title)}”", "short": "Schaff's History of the Christian Church", "head": html.unescape(title), "text": text, "url": f"https://ccel.org/ccel/schaff/hcc2.{HISTORY[term]}.html"})
        else:
            print("history section empty:", term)
    if term in WATSON:
        title, text = section(watson_raw, WATSON[term])
        if text:
            defs.append({"source": f"Thomas Watson, A Body of Divinity (1692), “{re.sub(r'^[0-9. ]+', '', html.unescape(title))}”", "short": "Watson's A Body of Divinity", "head": re.sub(r"^[0-9. ]+", "", html.unescape(title)), "text": text, "url": f"https://ccel.org/ccel/watson/divinity.{WATSON[term]}.html"})
        else:
            print("watson section empty:", term)
    if heads and not defs:
        missing_heads.append(term)
    for q in QUESTIONS.get(term, []) + ([HC_TOPIC[term]] if term in HC_TOPIC else []):
        hits = by_q.get(q.lower())
        if not hits:
            no_q.append(q)
            continue
        for doc, label, title, text in hits:
            meta = conf["docs"][doc]
            defs.append({"source": f"{meta['name']} ({meta['year']}), {label}", "short": meta["name"], "head": title, "text": tidy(text), "url": ""})
    for doc, lab in BY_LABEL.get(term, []):
        for d_, l_, title, text in conf["sections"]:
            if d_ == doc and l_ == lab:
                meta = conf["docs"][doc]
                defs.append({"source": f"{meta['name']} ({meta['year']}), {lab}", "short": meta["name"], "head": title, "text": tidy(text), "url": ""})
    t = term.lower()
    topic = topics.get(t) or topics.get(t.replace("the ", "")) or topics.get(t.rstrip("s"))
    out.append({"id": slug(term), "term": term, "defs": defs, "refs": refs[:8], "topic": topic or ""})

json.dump({"terms": out, "note": "Definitions are quoted from public-domain works named on each entry."}, open(os.path.join(args.out, "glossary.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
have = [x for x in out if x["defs"]]
print("terms", len(out), "with a definition", len(have), "without", len(out) - len(have))
print("no entry found for listed headwords:", missing_heads)
print("catechism questions not found:", no_q)
print("size", os.path.getsize(os.path.join(args.out, "glossary.json")) // 1000, "KB")
print("without:", [x["term"] for x in out if not x["defs"]])
