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
ap.add_argument("--books", default="41,62,63,64", help="Book numbers to build")
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
def self_refs(b):
    refs = ["1:1"]
    for c, v, toks in verse_tokens(b):
        has_first = any(re.search(r"-1[SP]$", t[4] or "") for t in toks)
        for t in toks:
            if base_id(t[3]) != "G1125":
                continue
            m = t[4] or ""
            finite_first = bool(re.search(r"-1[SP]$", m))
            nonfinite = bool(re.match(r"^V-\w+-(N|P)", m) or re.match(r"^V-\w+N$", m) or re.search(r"-(PAN|AAN|PAP|AAP)", m))
            if finite_first or (nonfinite and has_first):
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

def links(b):
    r = load(f"refs/{b:02d}.json")
    quotes, allusions, parallels, by = [], [], [], []
    for cv, x in sorted(r.get("i", {}).items(), key=lambda kv: tuple(map(int, kv[0].split(":")))):
        for ref, shared in x.get("q", []):
            quotes.append({"at": cv, "ref": ref, "shared": shared})
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
    return {"quotes": quotes, "quotedBy": by, "allusions": allusions[:15], "allusionCount": len(allusions), "parallels": parallels if len(parallels) <= 60 else [], "parallelCount": len(parallels)}, plist, r.get("p", {})

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
                m = re.match(r"^(.*?) \(\w=([^)]*)\) (.*?) - [GH]\d+\w*=\S+(?: \+ [GH]\d+\w*=\S+)* in: (.+)$", meaning)
                if not m:
                    fail(f"{name} {c}:{v}: can't read the other reading “{meaning}”")
                    continue
                gw = lambda x: unicodedata.normalize("NFC", re.sub(r"[^\w\s\u1fbd\u2019'-]", "", x)).strip()   # keeps the elision mark in ἐπ᾽
                en = lambda x: re.sub(r"^[\s,.;:·]+|[\s,.;:·]+$", "", x)
                readings.append({"at": app_cv(b, c, v), "greek": gw(greek), "english": en(eng), "editions": eds, "other": {"greek": gw(m.group(1)), "translit": m.group(2), "english": en(m.group(3)), "editions": m.group(4)}})
    readings.sort(key=lambda x: tuple(map(int, x["at"].split(":"))))
    for c, v, toks in verse_tokens(b):
        for t in toks:
            if "[[" in t[0]: bracketed.append([f"{c}:{v}", None])
            if "]]" in t[0] and bracketed: bracketed[-1][1] = f"{c}:{v}"
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
    "anf05": ("Ante-Nicene Fathers, vol. 5, ed. Roberts and Donaldson (1885–96)", ""),
}
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
for b in map(int, a.books.split(",")):
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
        "self": self_refs(b),
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
    br = guide["textual"]["doubleBrackets"]
    if br:
        inside = 0
        for (s, e) in br:
            (c1, v1), (c2, v2) = map(int, s.split(":")), map(int, e.split(":"))
            for c, v, toks in verse_tokens(b):
                if (c, v) >= (c1, v1) and (c, v) <= (c2, v2):
                    inside += len(toks)
        guide["glance"]["wordsInBrackets"] = inside
    texts = []
    for w in spec.get("witnesses", []):
        got = witness(b, w)
        if got:
            guide["witnesses"].append(got[0]); texts.append(got[1])
    for k, note in spec.get("notes", {}).items():
        for q in note.get("quoted", []):
            if not any(q in t for t in texts):
                fail(f"{name}: the {k} note relies on “{q}”, which isn't in the quoted chapters")
        if note.get("notInBook") and any(note["notInBook"] in t[0] for _, _, toks in verse_tokens(b) for t in toks):
            fail(f"{name}: the {k} note says the book doesn't name {note['notInBook']}, but it does")
        guide["notes"][k] = note["text"]
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
p = os.path.join(D, "scholar/bookguides.json")
json.dump(out, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"bookguides.json: {os.path.getsize(p) // 1000} KB")
