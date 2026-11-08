#!/usr/bin/env python3
"""Builds the book guides: one file, public/data/scholar/bookguides.json.

Nothing in it is written by hand or by AI. There are two kinds of content:
  Counted   - figures worked out here from the app's own data (the tagged Greek, the lexicon,
              cross-references, people, edition differences).
  Quoted    - passages taken word for word from public-domain editions. The passages to take are
              listed in scripts/book_guides.json by their first and last words, and the text between
              them is copied from the source file, so it can't drift from the edition.

Run after build-data.mjs and build_scholar.py (they write the files this reads):
  npm run data:books -- --sources ../sources
  (python3 -I scripts/build_bookguides.py --out public/data --sources ../sources)
"""
import argparse, html, json, math, os, re, sys, unicodedata
from collections import Counter, defaultdict

ap = argparse.ArgumentParser()
ap.add_argument("--sources", required=True)
ap.add_argument("--out", required=True, help="The app's data folder, public/data")
ap.add_argument("--books", default="", help="Book numbers to build (default: every book in book_guides.json)")
a = ap.parse_args()
S, D = a.sources, a.out
HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = json.load(open(os.path.join(HERE, "book_guides.json"), encoding="utf-8"))["books"]
CCEL = os.path.join(S, "extra/ccel-copy/references/ccel/authors/schaff")
HENRY = os.path.join(S, "extra/mhenry-complete")
problems = []
def fail(msg):
    problems.append(msg)
    print("  PROBLEM:", msg)

def load(rel):
    return json.load(open(os.path.join(D, rel), encoding="utf-8"))

BOOKS = load("books.json")
NAME = {i + 1: b["name"] for i, b in enumerate(BOOKS)}
NO = {b["name"]: i + 1 for i, b in enumerate(BOOKS)}
NT = range(40, 67)

# ---------- The Greek text ----------
# words/NN.json follows STEPBible's TAGNT, which takes the Nestle-Aland wording where it exists.
# A verse found only in the traditional editions (Mark 7:16) has only those words, so it's left out of
# every count here. The edition data says which verses those are.
def base_id(s):
    m = re.match(r"^([HG])0*(\d+)", s or "")
    return f"{m.group(1)}{m.group(2)}" if m else ""

VARIANTS = {}
for f in ("variants-gospels.json", "variants-acts-paul.json", "variants-general.json"):
    VARIANTS.update(load(f"scholar/{f}"))

words = {b: load(f"words/{b:02d}.json") for b in NT}
# The app's Bibles follow the KJV's verse numbers; the Greek follows the editions'. Where the Greek has a verse
# the English joins to the one before (3 John 15 is part of 3 John 14 in the KJV), references point to that verse.
VC = load("verse-counts.json")
renumbered = defaultdict(list)
def app_cv(b, c, v):
    last = VC[b - 1][c - 1] if c - 1 < len(VC[b - 1]) else 0
    if v > last and last:
        if [f"{c}:{v}", f"{c}:{last}"] not in renumbered[b]:
            renumbered[b].append([f"{c}:{v}", f"{c}:{last}"])
        return f"{c}:{last}"
    return f"{c}:{v}"
def verse_tokens(b):
    for c, vv in enumerate(words[b], 1):
        for v, toks in enumerate(vv, 1):
            yield c, v, toks

def gk(w):
    return re.sub(r"[^\w]", "", unicodedata.normalize("NFC", w)).lower()

def outside_critical(b, c, v, toks):
    """True when every word of the verse is one that NA28 doesn't have (Mark 7:16), matched word by word."""
    var = VARIANTS.get(f"{b}.{c}.{v}")
    if not toks or not var:
        return False
    missing = Counter(gk(w[1]) for w in var if "NA28" not in w[3].split("+"))
    for t in toks:
        k = gk(t[0])
        if missing[k] <= 0:
            return False
        missing[k] -= 1
    return True

PRONOUN = re.compile(r"^(?:he|she|it|they|we|you|i|him|them|us|<the>|the|a|an|to|of|having|being|was|were|is|are|be|been|do|does|did|will|shall|have|has|had)\s+", re.I)
def rendering(g):
    g = re.sub(r"[\[\]<>(){}.,;:!?“”‘’\"']", "", (g or "").lower()).strip()
    while True:
        h = PRONOUN.sub("", g)
        if h == g: return g
        g = h

CONTENT = re.compile(r"^(N-|V-|A-|ADV)")  # nouns, verbs, adjectives and adverbs; names are nouns too
# Words so common that a high count says more about style than subject.
COMMON = {"G1510", "G3004", "G2036", "G5346", "G3956"}  # be, say, said, say, all
counts = {b: Counter() for b in NT}           # lemma -> occurrences
forms = {b: defaultdict(Counter) for b in NT}  # lemma -> spellings in this book
senses = {b: defaultdict(Counter) for b in NT} # lemma -> STEP's sense letters (G863G, G863H) in this book
renderings = {b: defaultdict(Counter) for b in NT}  # lemma -> STEP's English gloss for each use
where = {b: defaultdict(list) for b in NT}    # lemma -> ["c:v", ...]
total = Counter()                             # every word, for the size of each book
content_total = Counter()
excluded = defaultdict(list)
morph_of = {}
for b in NT:
    for c, v, toks in verse_tokens(b):
        if outside_critical(b, c, v, toks):
            excluded[b].append(f"{c}:{v}")
            continue
        total[b] += len(toks)
        for t in toks:
            i = base_id(t[3])
            if not i or not CONTENT.match(t[4] or ""):
                continue
            counts[b][i] += 1
            content_total[b] += 1
            where[b][i].append(app_cv(b, c, v))
            morph_of.setdefault(i, t[4])
            forms[b][i][(gk(t[0]), t[1])] += 1
            senses[b][i][re.sub(r"^[HG]\d+", "", t[3] or "")] += 1
            renderings[b][i][rendering(t[2])] += 1
nt_counts = Counter()
for b in NT:
    nt_counts.update(counts[b])
nt_content = sum(content_total.values())

# ---------- Lexicon ----------
lex_cache = {}
def lex(i):
    shard = f"{i[0]}{int(i[1:]) // 1000}"
    if shard not in lex_cache:
        lex_cache[shard] = load(f"lex/{shard}.json")
    return lex_cache[shard].get(i)
def plain(w):
    return "".join(ch for ch in unicodedata.normalize("NFD", gk(w)) if not unicodedata.combining(ch))

def same_word(here, gloss):
    """True when the book's usual rendering is just an inflection of the lexicon's gloss (scribes, scribe)."""
    for core in re.split(r"[/:;,]", gloss.lower()):
        core = re.sub(r"^\s*(to|be)\s+", "", core).strip()
        if not core or len(core.split()) != len(here.split()):
            continue
        stem = core if len(core) <= 4 else core[: max(4, len(core) - 3)]
        if here.startswith(stem):
            return True
    return False

def word_info(i, b=None):
    e = lex(i) or {}
    ms = e.get("m") or [{}]
    letter = senses[b][i].most_common(1)[0][0] if b and senses[b][i] else ""
    sense = next((m for m in ms if m.get("a") == letter), ms[0])
    gloss = (sense.get("g") or e.get("k") or "").strip()
    info = {"id": i, "lemma": unicodedata.normalize("NFC", e.get("l") or sense.get("l") or ""), "translit": sense.get("x") or e.get("x") or "", "gloss": gloss}
    if b and renderings[b][i]:
        (top, k), = renderings[b][i].most_common(1)
        used = sum(renderings[b][i].values())
        if top and used >= 4 and k / used >= 0.4 and not same_word(top, gloss):
            info["here"] = top
    # Strong's files some words under a related headword: Mark's εὐθύς is tagged G2112, εὐθέως.
    # An adverb doesn't inflect, so when the book spells it another way, show the spelling it uses.
    if b and morph_of.get(i, "").startswith("ADV") and forms[b][i]:
        (form, translit), _ = forms[b][i].most_common(1)[0]
        if plain(form) != plain(info["lemma"]):
            info["tagged"] = info["lemma"]
            info["lemma"] = unicodedata.normalize("NFC", unicodedata.normalize("NFD", form).replace("\u0300", "\u0301"))
            info["translit"] = translit
    return info

def is_name(i):
    """People, places and peoples: STEP marks them -P, -L and -PG. Titles (-T), such as Christ and God, stay in."""
    return bool(re.search(r"-(P|L|PG|LI|LG|OI)$", morph_of.get(i, "")))

def keyness(a, b_, c, d):
    """Dunning's log-likelihood for a word used a times in c words here and b_ times in d words elsewhere."""
    e1, e2 = c * (a + b_) / (c + d), d * (a + b_) / (c + d)
    g = 0.0
    if a: g += a * math.log(a / e1)
    if b_: g += b_ * math.log(b_ / e2)
    return 2 * g

def key_words(b):
    here, n_here = counts[b], content_total[b]
    n_else = nt_content - n_here
    min_n = 2 if n_here < 600 else 3
    want = 6 if n_here < 600 else 12 if n_here > 5000 else 10
    rows = []
    for i, n in here.items():
        if n < min_n or is_name(i) or i in COMMON:
            continue
        elsewhere = nt_counts[i] - n
        ratio = (n / n_here) / ((elsewhere + 0.5) / n_else)
        if ratio < 2:
            continue
        rows.append((keyness(n, elsewhere, n_here, n_else), i, n, ratio))
    rows.sort(reverse=True)
    out = []
    for g, i, n, ratio in rows[:want]:
        refs = where[b][i]
        by_ch = Counter(int(r.split(":")[0]) for r in refs)
        out.append({**word_info(i, b), "n": n, "nt": nt_counts[i], "times": round(ratio, 1), "refs": sorted(set(refs), key=lambda r: tuple(map(int, r.split(":")))), "byChapter": [by_ch.get(c, 0) for c in range(1, len(words[b]) + 1)]})
    return out

def only_here(b):
    out = []
    for i, n in counts[b].items():
        if nt_counts[i] == n:
            out.append({**word_info(i, b), "n": n, "refs": sorted(set(where[b][i]), key=lambda r: tuple(map(int, r.split(":")))), "name": is_name(i)})
    out.sort(key=lambda w: tuple(map(int, w["refs"][0].split(":"))))
    return out

# ---------- Where the writer speaks of writing ----------
FIRST_PERSON = re.compile(r"-1[SP]$|^P-1")   # a first-person verb, or I, me, we, us
def self_refs(b, listed=None):
    """In a letter the writer is the speaker, so: the opening, and every verse where he says "I write" or "we write".
    In a narrative book the speaker is usually someone else (Pilate's "What I have written"), so the passages where
    the writer speaks about his book are listed in book_guides.json, and each is checked for a first-person word or
    a word for writing or a book."""
    if listed:
        refs = []
        for item in listed:
            c, a_, z = re.match(r"^(\d+):(\d+)(?:-(\d+))?$", item).groups()
            c, a_, z = int(c), int(a_), int(z or a_)
            vs = [(c, v) for v in range(a_, z + 1)]
            toks = [t for (cc, vv) in vs for t in words[b][cc - 1][vv - 1]]
            if item != "1:1" and not any(FIRST_PERSON.search(t[4] or "") or base_id(t[3]) in ("G1125", "G1989", "G975", "G976") for t in toks):
                fail(f"{NAME[b]} {item}: listed as the writer speaking about his book, but has no first-person word or word for writing")
            refs += [app_cv(b, cc, vv) for cc, vv in vs]
        return list(dict.fromkeys(refs))
    refs = ["1:1"]
    if not 45 <= b <= 65:
        return refs
    for c, v, toks in verse_tokens(b):
        has_first = any(FIRST_PERSON.search(t[4] or "") for t in toks)   # a first-person verb, or "me", "us": "for me to write" (2 Corinthians 9:1)
        for t in toks:
            if base_id(t[3]) not in ("G1125", "G1989"):   # write; write a letter (Hebrews 13:22)
                continue
            m = t[4] or ""
            finite_first = bool(re.search(r"-1[SP]$", m))
            active = bool(re.match(r"^V-[PA]A[NP]", m))   # "writing", "to write"; not "written"
            if finite_first or (active and has_first):
                r = app_cv(b, c, v)
                if r not in refs:
                    refs.append(r)
    return refs

# ---------- Cross-references, people, edition differences ----------
FIG = {f["id"]: f for f in load("figures.json")}
figures = {i: f["name"] for i, f in FIG.items()}
def short_title(i):
    """The first clause of the people database's title, to tell apart people with the same name."""
    t = re.split(r"[,;.(]", (FIG.get(i) or {}).get("title") or "")[0].strip()
    return t if len(t) <= 60 else ""
DISPUTED = load("scholar/disputed.json")
def ref_key(r):
    return tuple(map(int, re.findall(r"\d+", r.split(" ", 1)[1] if r[0].isdigit() and " " in r else r.split(" ")[-1])))

short_quotes = {}
STOCK = defaultdict(set)   # matched wording -> the passages it's matched to
for bb in NT:
    for cv, x in load(f"links/{bb:02d}.json").get("i", {}).items():
        for ref, shared in x.get("q", []):
            STOCK[shared].add(ref)
# How many Old Testament verses use a wording, in any of the four Bibles the matches were made from. A phrase found in
# eight or more ("in the name of the LORD", "as surely as I live") is a stock phrase of the Old Testament, so sharing
# it doesn't show which passage a verse quotes. Deuteronomy 5:16's "that it may go well with you" (seven) stays.
OT_TEXT = []
_bibles = [load(f"bible/{t}-ot.json") for t in ("BSB", "ASV", "KJV", "NHEB")]
for _bk in range(39):
    for _c in range(len(_bibles[0][_bk])):
        for _v in range(len(_bibles[0][_bk][_c])):
            OT_TEXT.append("|".join(" " + " ".join(re.sub(r"[^a-z\s]", " ", bib[_bk][_c][_v].lower()).split()) + " " for bib in _bibles if _bk < len(bib) and _c < len(bib[_bk]) and _v < len(bib[_bk][_c])))
del _bibles
_ot_count = {}
def ot_count(shared):
    if shared not in _ot_count:
        s = " " + shared + " "
        _ot_count[shared] = sum(1 for t in OT_TEXT if s in t)
    return _ot_count[shared]

def links(b):
    r = load(f"links/{b:02d}.json")
    quotes, allusions, parallels, by = [], [], [], []
    for cv, x in sorted(r.get("i", {}).items(), key=lambda kv: tuple(map(int, kv[0].split(":")))):
        # A verse can share a stock phrase ("and it shall come to pass") with many passages besides the one it
        # quotes. Keep matches of five words or more ("name s sake" is three) whose wording isn't matched to three or
        # more different passages (two, for six words or fewer): Isaiah 40:3 quoted in all four Gospels stays;
        # "and it shall come to pass", matched to Joel 2:32 and Isaiah 66:23 at Acts 2:17, goes.
        for ref, shared in x.get("q", []):
            n_words = len([w for w in shared.split() if w != "s"])
            if n_words >= 5 and len(STOCK[shared]) < (2 if n_words <= 6 else 3) and ot_count(shared) < 8:
                quotes.append({"at": cv, "ref": ref, "shared": shared})
            else:
                short_quotes[b] = short_quotes.get(b, 0) + 1
        for ref, shared in x.get("by", []):
            by.append({"at": cv, "ref": ref, "shared": shared})
        for ref, shared in x.get("p", []):
            parallels.append({"at": cv, "ref": ref, "shared": shared})
        for ref, votes in x.get("a", []):
            allusions.append({"at": cv, "ref": ref, "votes": votes})
    allusions.sort(key=lambda x: -x["votes"])
    people = Counter()
    first = {}
    for cv, ids in sorted(r.get("p", {}).items(), key=lambda kv: tuple(map(int, kv[0].split(":")))):
        for i in ids:
            people[i] += 1
            first.setdefault(i, cv)
    plist = [{"id": i, "name": figures.get(i, i), "verses": n, "first": first[i]} for i, n in people.most_common()]
    same = Counter(p["name"] for p in plist)
    for p in plist:
        if same[p["name"]] > 1 and short_title(p["id"]):
            p["title"] = short_title(p["id"])
    for p in plist:
        if p["id"] not in figures:
            fail(f"{NAME[b]}: person {p['id']} isn't in figures.json")
    # Shared wording inside the same book is listed once per pair.
    parallels = [p for p in parallels if not (p["ref"].startswith(NAME[b] + " ") and tuple(map(int, re.findall(r"\d+", p["ref"][len(NAME[b]):])[:2])) <= tuple(map(int, p["at"].split(":"))))]
    return {"quotes": quotes, "shortQuotes": short_quotes.get(b, 0), "quotedBy": by, "allusions": allusions[:15], "allusionCount": len(allusions), "parallels": parallels if len(parallels) <= 60 else [], "parallelCount": len(parallels)}, plist, r.get("p", {})

words_in_brackets = {}
def textual(b):
    name = NAME[b]
    disputed = [d for d in DISPUTED if d["ref"].startswith(name + " ")]
    verses, readings = Counter(), []
    crit_only = trad_only = 0
    bracketed = []
    for key, entries in VARIANTS.items():
        bb, c, v = map(int, key.split("."))
        if bb != b:
            continue
        verses[c] += 1
        for pos, greek, eng, eds, meaning in entries:
            e = set(eds.split("+"))
            # A word one edition adds and the other lacks. (Where they use different words, the other word is in meaning.)
            if not meaning and "NA28" in e and "TR" not in e: crit_only += 1
            if not meaning and "TR" in e and "NA28" not in e: trad_only += 1
            if meaning:
                # "παραβαίνων (T=parabainōn) is transgressing - G3845=V-PAP-NSM in: TR+Byz"
                # A tag may name alternatives, as "G0846|G3165«G3450=P-1GS" at Hebrews 10:34.
                m = re.match(r"^(.*?) \(\w=([^)]*)\) (.*?) - [GH]\d+[^=\s]*=\S+(?: \+ [GH]\d+[^=\s]*=\S+)* in: (.+)$", meaning)
                if not m:
                    fail(f"{name} {c}:{v}: can't read the other reading “{meaning}”")
                    continue
                gw = lambda x: unicodedata.normalize("NFC", re.sub(r"[^\w\s\u1fbd\u2019'-]", "", x)).strip()   # keeps the elision mark in ἐπ᾽
                en = lambda x: re.sub(r"^[\s,.;:·]+|[\s,.;:·]+$", "", x)
                readings.append({"at": app_cv(b, c, v), "greek": gw(greek), "english": en(eng), "editions": eds, "other": {"greek": gw(m.group(1)), "translit": m.group(2), "english": en(m.group(3)), "editions": m.group(4)}})
    readings.sort(key=lambda x: tuple(map(int, x["at"].split(":"))))
    inside, in_br = 0, False
    for c, v, toks in verse_tokens(b):
        for t in toks:
            if "[[" in t[0]:
                bracketed.append([app_cv(b, c, v), None]); in_br = True
            if in_br:
                inside += 1
            if "]]" in t[0] and bracketed:
                bracketed[-1][1] = app_cv(b, c, v); in_br = False
    words_in_brackets[b] = inside
    return {"disputed": disputed, "outsideCritical": excluded[b], "versesDiffer": sum(verses.values()), "byChapter": [verses.get(c, 0) for c in range(1, len(words[b]) + 1)], "criticalOnly": crit_only, "traditionalOnly": trad_only, "readings": readings, "doubleBrackets": [x for x in bracketed if x[1]]}

# ---------- Quoted passages from CCEL ----------
def norm(s):
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s).lower())
def clean(x):
    x = re.sub(r"<note\b.*?</note>", "", x, flags=re.S)
    x = html.unescape(re.sub(r"<[^>]+>", "", x)).replace("�", "").replace("\xa0", " ")
    x = re.sub(r"\s+", " ", x)
    return re.sub(r" ([,.;:?!])", r"\1", x).strip()
VOL_LABEL = {
    "npnf201": ("Nicene and Post-Nicene Fathers, Series 2, vol. 1, ed. Schaff and Wace (1890–1900)", "trans. Arthur Cushman McGiffert"),
    "npnf203": ("Nicene and Post-Nicene Fathers, Series 2, vol. 3, ed. Schaff and Wace (1890–1900)", "trans. Ernest Cushing Richardson"),
    "anf01": ("Ante-Nicene Fathers, vol. 1, ed. Roberts and Donaldson (1885–96)", ""),
    "anf02": ("Ante-Nicene Fathers, vol. 2, ed. Roberts and Donaldson (1885–96)", ""),
    "anf04": ("Ante-Nicene Fathers, vol. 4, ed. Roberts and Donaldson (1885–96)", ""),
    "anf05": ("Ante-Nicene Fathers, vol. 5, ed. Roberts and Donaldson (1885–96)", ""),
    "anf09": ("Ante-Nicene Fathers, vol. 9, ed. Allan Menzies", ""),
}
# Translators of single works in the Ante-Nicene volumes: (volume, the work's chapter id, credit, the words in the
# edition that give it). The words are checked in that work's own text, so a credit is never typed in unseen.
WORK_TRANSLATOR = [
    ("anf01", "ii", "trans. Alexander Roberts and James Donaldson", "the original editors and translators, Drs. Roberts and Donaldson"),
    ("anf02", "vi.iv", "trans. William Wilson", "Translated by Rev. William Wilson"),
    ("anf04", "iii.iii", "trans. S. Thelwall", "Translated by the Rev. S. Thelwall"),
    ("anf04", "iii.viii", "trans. S. Thelwall", "Translated by the Rev. S. Thelwall"),
    ("anf04", "vi", "trans. Frederick Crombie", "Translated by the Rev. Frederick Crombie"),
    ("anf09", "xvi", "trans. John Patrick", "Origen’s Commentary on the Gospel of Matthew. by John Patrick"),
]
def work_translator(v, div):
    for vol, work, credit, words in WORK_TRANSLATOR:
        if vol == v and (div == work or div.startswith(work + ".")):
            raw, divs, _ = volume(v)
            inside = [s for s, i in divs if i == work or i.startswith(work + ".")]
            after = [s for s, i in divs if s > inside[-1] and not (i == work or i.startswith(work + "."))] if inside else []
            text = clean(raw[inside[0]: after[0] if after else len(raw)]) if inside else ""
            if words not in text:
                fail(f"{v} {work} doesn't say “{words}”")
            return credit
    return ""
vols = {}
def volume(v):
    if v not in vols:
        raw = open(os.path.join(CCEL, f"{v}.xml"), encoding="utf-8", errors="replace").read()
        head = re.search(r"<ThML\.head>.*?</ThML\.head>", raw, re.S).group(0)
        rights = re.search(r"<DC\.Rights[^>]*>([^<]*)", head)
        assert rights and "public domain" in rights.group(1).lower(), f"{v} isn't marked public domain"
        title = re.search(r"<DC\.Title[^>]*>([^<]*)", head)
        divs = [(m.start(), re.search(r'\bid="([^"]+)"', m.group(2)).group(1)) for m in re.finditer(r"<(div\d)\b([^>]*\bid=\"[^\"]+\"[^>]*)>", raw)]
        vols[v] = (raw, divs, re.sub(r"\s+", " ", title.group(1)).strip() if title else v)
    return vols[v]

def chapter(v, div):
    raw, divs, _ = volume(v)
    for k, (start, i) in enumerate(divs):
        if i == div:
            end = divs[k + 1][0] if k + 1 < len(divs) else len(raw)
            before = re.findall(r'<pb\b[^>]*?\bn="(\w+)"', raw[:start])
            return raw[start:end], (before[-1] if before else "")
    return None, ""

SECTION = re.compile(r"(?:(?<=^)|(?<=[.”’:;?!)\]] ))(\d{1,3})\. (?=[A-Z“‘\[(])")
WHO = {}
idx = load("writings/index.json")
for w in idx["authors"]:
    WHO[w["id"]] = w["name"]

def witness(b, w):
    raw, page_before = chapter(w["vol"], w["div"])
    if raw is None:
        fail(f"{NAME[b]}: {w['vol']} has no chapter {w['div']}")
        return None
    text = clean(raw)
    i = text.find(w["from"])
    j = text.find(w["to"], i + 1) if i >= 0 else -1
    if i < 0 or j < 0:
        fail(f"{NAME[b]}: couldn't find the passage from “{w['from']}” to “{w['to']}” in {w['vol']} {w['div']}")
        return None
    passage = text[i: j + len(w["to"])]
    if len(passage) > 2600:
        fail(f"{NAME[b]}: passage from “{w['from']}” is {len(passage)} letters, too long to quote")
    # The section number the passage starts in, as this edition prints it.
    nums = [m for m in SECTION.finditer(text[: i + 1])]
    sec = nums[-1].group(1) if nums else ""
    nums_in = [m.group(1) for m in SECTION.finditer(passage)]
    passage = SECTION.sub("", passage).strip()
    if passage[0].islower():
        passage = "…" + passage
    if not re.search(r"[.?!”’]$", passage):
        passage += " …"
    # The print page: the last page break before the passage starts.
    pages = re.split(r'<pb\b[^>]*?\bn="(\w+)"[^>]*?/>', raw)
    page, seen, target = page_before, "", norm(w["from"])
    acc = norm(clean(pages[0]))
    if target not in acc:
        for k in range(1, len(pages), 2):
            acc += norm(clean(pages[k + 1]))
            page = pages[k]
            if target in acc:
                break
    # Check: the passage is in the source, letter for letter.
    if norm(passage.replace("…", "")) not in norm(text):
        fail(f"{NAME[b]}: passage from “{w['from']}” didn't survive cleaning")
    at = w.get("at", "")
    first = f"{at}.{sec}" if at and sec and at.count(".") < 2 else at
    last = nums_in[-1] if nums_in else ""
    cite = f"{w['work']} {first}" + (f"–{last}" if last and last != sec else "") if at else w["work"]
    label, translator = VOL_LABEL[w["vol"]]
    translator = translator or work_translator(w["vol"], w["div"])
    if w["vol"] == "anf01" and w["work"] == "Against Heresies":
        # The volume's introductory notice: Books 1 and 2 are Roberts's; Rambaut furnished the groundwork of Book 3.
        translator = "trans. Alexander Roberts" if at.split(".")[0] in ("1", "2") else "trans. W. H. Rambaut" if at.split(".")[0] == "3" else ""
    who = WHO.get(w["writer"], w.get("name", "")) if w["writer"] else w.get("name", "")
    if w["writer"] and w["writer"] not in WHO:
        fail(f"{NAME[b]}: writer {w['writer']} isn't in the writings index")
    out = {"topic": w["topic"], "writer": w["writer"], "name": who, "work": w["work"], "cite": cite.strip(), "edition": label, "translator": translator, "page": page, "url": f"https://ccel.org/ccel/schaff/{w['vol']}.{w['div']}.html", "text": passage}
    if w.get("via"):
        out["via"] = w["via"]; out["viaName"] = WHO.get(w["via"], w["via"])
    return out, text

# ---------- Matthew Henry's introduction ----------
def henry(b, h):
    path = os.path.join(HENRY, h["path"])
    md = open(path, encoding="utf-8").read()
    m = re.search(r"^## Introduction\s*\n(.*?)(?=^## |\Z)", md, re.S | re.M)
    if not m:
        fail(f"{NAME[b]}: no introduction in {h['path']}")
        return None
    body = m.group(1).strip()
    body = re.sub(r"\*\*?([^*]+)\*\*?", r"\1", body)       # italics carry no meaning we keep
    body = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", body)
    body = re.sub(r"\\([\\`*_{}\[\]()#+\-.!])", r"\1", body)  # markdown escapes, as in "I\. Concerning"
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    if norm(body) not in norm(re.sub(r"[*_]", "", md)):
        fail(f"{NAME[b]}: Henry introduction changed in cleaning")
    out = {"text": body, "source": "Matthew Henry, Commentary on the Whole Bible (1706–21), markdown edition by LyteWord (CC0)"}
    if h.get("completedBy"):
        pre = open(os.path.join(HENRY, "volume-6/preface.md"), encoding="utf-8").read()
        if norm(h["completedBy"]) not in norm(pre):
            fail(f"{NAME[b]}: the volume 6 preface doesn't name {h['completedBy']}")
        out["completedBy"] = h["completedBy"]
    return out

# ---------- Build ----------
easton, smith = load("scholar/dictionary-easton.json"), load("scholar/dictionary-smith.json")
DICTS = {"easton": easton, "smith": smith}
chron = {x["book"]: x for x in load("scholar/chronology.json")["books"]}
out = {"about": "Counted from the app's data, or quoted word for word from the named editions. Built by scripts/build_bookguides.py.", "books": {}}
for b in sorted(map(int, a.books.split(",") if a.books else SPEC.keys())):
    name = NAME[b]
    print(name)
    spec = SPEC.get(str(b), {})
    chapters = words[b]
    link, people, people_at = links(b)
    guide = {
        "book": b, "name": name,
        "glance": {
            "chapters": len(chapters),
            "verses": sum(VC[b - 1]),
            "greekVerses": sum(len(vv) for vv in chapters),
            "versesCounted": sum(len(vv) for vv in chapters) - len(excluded[b]),
            "words": total[b],
            "distinct": len(counts[b]),
            "ntWords": sum(total.values()),
        },
        "keywords": key_words(b),
        "onlyHere": only_here(b),
        "self": self_refs(b, spec.get("self")),
        "selfKind": "listed" if spec.get("self") else "writing" if 45 <= b <= 65 else "opening",
        "people": people,
        "links": link,
        "textual": textual(b),
        "witnesses": [],
        "notes": {},
        "dictionaries": [],
        "dating": name in chron,
        "chapters": [],
        "renumbered": [],
    }
    if guide["textual"]["doubleBrackets"]:
        guide["glance"]["wordsInBrackets"] = words_in_brackets[b]
    for w in spec.get("witnesses", []):
        got = witness(b, w)
        if got:
            guide["witnesses"].append(got[0])
    book_words = [t[0] for _, _, toks in verse_tokens(b) for t in toks]
    for k, note in spec.get("notes", {}).items():
        # A note may only say what the passages shown under it say, and what the Greek text itself shows.
        for q in note.get("quoted", []):
            if not any(q in w["text"] for w in guide["witnesses"]):
                fail(f"{name}: the {k} note relies on “{q}”, which isn't in the passages quoted")
        if note.get("notInBook") and any(note["notInBook"] in t for t in book_words):
            fail(f"{name}: the {k} note says the book doesn't name {note['notInBook']}, but it does")
        for g_ in note.get("inBook", []):
            if not any(g_ in t for t in book_words):
                fail(f"{name}: the {k} note says the book names {g_}, but it doesn't")
        guide["notes"][k] = note["text"]
    guide["titles"] = spec.get("titles", {})
    if spec.get("henry"):
        guide["henry"] = henry(b, spec["henry"])
    for d, head in spec.get("dictionaries", []):
        if head not in DICTS[d]:
            fail(f"{name}: {d} has no entry {head}")
        else:
            guide["dictionaries"].append([d, head])
    kw = {k["id"] for k in guide["keywords"]}
    for c, vv in enumerate(chapters, 1):
        n_words = sum(len(t) for v, t in enumerate(vv, 1) if f"{c}:{v}" not in excluded[b])
        local = Counter()
        for v, toks in enumerate(vv, 1):
            if f"{c}:{v}" in excluded[b]:
                continue
            for t in toks:
                i = base_id(t[3])
                if i in kw: local[i] += 1
        in_ch = Counter()
        for cv, ids in people_at.items():
            if int(cv.split(":")[0]) == c:
                in_ch.update(ids)
        guide["chapters"].append({
            "c": c, "verses": VC[b - 1][c - 1], "words": n_words,
            "keywords": [[i, n] for i, n in local.most_common(4)],
            "people": [i for i, _ in in_ch.most_common(6)],
            "quotes": [q["ref"] for q in link["quotes"] if int(q["at"].split(":")[0]) == c],
        })
    guide["renumbered"] = renumbered[b]
    g = guide["glance"]
    print(f"  {g['chapters']} chapters, {g['verses']} verses ({g['versesCounted']} counted), {g['words']} Greek words, {g['distinct']} distinct content words")
    print("  key words:", ", ".join(f"{k['translit']} {k['n']}" for k in guide["keywords"]))
    print("  only here:", len(guide["onlyHere"]), " self:", guide["self"], " people:", len(people), " witnesses:", len(guide["witnesses"]), " left out:", excluded[b])
    out["books"][str(b)] = guide

if problems:
    print(f"\n{len(problems)} problem(s). Nothing written.")
    sys.exit(1)
# One file per group of books, so a page loads only its group, plus an index of which books have a guide.
# The long books get a file each; the short letters share. (The artifact holds at most 511 files.)
GROUPS = [("matthew", [40]), ("mark", [41]), ("luke", [42]), ("john", [43]), ("acts", [44]), ("romans", [45]), ("corinthians", [46, 47]),
          ("galatians-philemon", range(48, 58)), ("hebrews-jude", range(58, 66)), ("revelation", [66])]
folder = os.path.join(D, "scholar/bookguides")
os.makedirs(folder, exist_ok=True)
for f in os.listdir(folder):
    os.remove(os.path.join(folder, f))
stale = os.path.join(D, "scholar/bookguides.json")
if os.path.exists(stale):
    os.remove(stale)
index = {}
for g, books in GROUPS:
    part = {k: v for k, v in out["books"].items() if int(k) in books}
    if not part:
        continue
    p = os.path.join(folder, f"{g}.json")
    json.dump({"about": out["about"], "books": part}, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"bookguides/{g}.json: {', '.join(NAME[int(k)] for k in part)}, {os.path.getsize(p) // 1000} KB")
    index.update({k: g for k in part})
json.dump(index, open(os.path.join(folder, "index.json"), "w", encoding="utf-8"), separators=(",", ":"))
