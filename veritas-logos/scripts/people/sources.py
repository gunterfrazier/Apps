"""Reads the Bible text and each people dataset into one plain form."""
import csv, glob, json, os, re, collections

BOOKS = ["Gen","Exo","Lev","Num","Deu","Jos","Jdg","Rut","1Sa","2Sa","1Ki","2Ki","1Ch","2Ch","Ezr","Neh","Est","Job","Psa","Pro","Ecc","Sng","Isa","Jer","Lam","Ezk","Dan","Hos","Jol","Amo","Oba","Jon","Mic","Nam","Hab","Zep","Hag","Zec","Mal","Mat","Mrk","Luk","Jhn","Act","Rom","1Co","2Co","Gal","Eph","Php","Col","1Th","2Th","1Ti","2Ti","Tit","Phm","Heb","Jas","1Pe","2Pe","1Jn","2Jn","3Jn","Jud","Rev"]
BOOK_NUM = {b: i + 1 for i, b in enumerate(BOOKS)}
ALT = {"Ezek":"Ezk","Joel":"Jol","Obad":"Oba","Jonah":"Jon","Nah":"Nam","Zech":"Zec","Mark":"Mrk","John":"Jhn","1Chr":"1Ch","2Chr":"2Ch","1Kgs":"1Ki","2Kgs":"2Ki","1Sam":"1Sa","2Sam":"2Sa","Deut":"Deu","Exod":"Exo","Josh":"Jos","Judg":"Jdg","Ruth":"Rut","Song":"Sng","Eccl":"Ecc","Prov":"Pro","Ps":"Psa","Isa":"Isa","Phil":"Php","Phlm":"Phm","Matt":"Mat","Luke":"Luk","Jas":"Jas","1Pet":"1Pe","2Pet":"2Pe","1John":"1Jn","2John":"2Jn","3John":"3Jn","Jude":"Jud","1Thess":"1Th","2Thess":"2Th","1Tim":"1Ti","2Tim":"2Ti","Titus":"Tit","1Cor":"1Co","2Cor":"2Co","Acts":"Act","Rom":"Rom","Gal":"Gal","Eph":"Eph","Col":"Col","Heb":"Heb","Rev":"Rev","Gen":"Gen","Lev":"Lev","Num":"Num","Neh":"Neh","Ezra":"Ezr","Esth":"Est","Job":"Job","Jer":"Jer","Lam":"Lam","Dan":"Dan","Hos":"Hos","Amos":"Amo","Mic":"Mic","Hab":"Hab","Zeph":"Zep","Hag":"Hag","Mal":"Mal"}
NAMES = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalm","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]


def code(b, c, v):
    return b * 1000000 + c * 1000 + v


def nice(c):
    return f"{NAMES[c // 1000000 - 1]} {(c // 1000) % 1000}:{c % 1000}"


def osis(ref):
    """Turns Rut.4.17 or 1Chr.6.30 into a verse code. Part letters like 17a are ignored."""
    m = re.match(r"^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)", ref.strip())
    if not m:
        return None
    b = m[1] if m[1] in BOOK_NUM else ALT.get(m[1])
    if not b:
        return None
    return code(BOOK_NUM[b], int(m[2]), int(m[3]))


def sid(x):
    """H0175, H1121G and G5207 all reduce to a plain Strong's number."""
    m = re.match(r"([HG])0*(\d+)", x)
    return f"{m[1]}{m[2]}" if m else None


class Bible:
    """The Hebrew and Greek tagged word by word, with the English of the bundled translations (BSB and KJV for most checks)."""

    def __init__(self, data_dir):
        self.words = {}
        for b in range(1, 67):
            self.words[b] = json.load(open(f"{data_dir}/words/{b:02d}.json", encoding="utf-8"))
        self.text = {}
        for t in ("BSB", "KJV", "ASV", "NHEB", "YLT"):
            ot = json.load(open(f"{data_dir}/bible/{t}-ot.json", encoding="utf-8"))
            nt = json.load(open(f"{data_dir}/bible/{t}-nt.json", encoding="utf-8"))
            self.text[t] = {**_books(ot), **_books(nt)}

    def tokens(self, c):
        b, ch, v = c // 1000000, (c // 1000) % 1000, c % 1000
        try:
            return self.words[b][ch - 1][v - 1] or []
        except IndexError:
            return []

    def verse(self, c, t="BSB"):
        b, ch, v = c // 1000000, (c // 1000) % 1000, c % 1000
        try:
            return self.text[t][b][ch - 1][v - 1] or ""
        except (IndexError, KeyError):
            return ""


def _books(d):
    if isinstance(d, dict):
        return {int(k): v for k, v in d.items()}
    return {i + 1 + (39 if len(d) == 27 else 0): v for i, v in enumerate(d)}


def ref_list(field):
    """Tribe, parent and child fields hold items like Jesse@Rut.4.17-Rom(a)."""
    out = []
    for raw in re.split(r"[,+]\s*", field or ""):
        raw = raw.strip()
        if "@" not in raw:
            continue
        m = re.match(r"(.+?@[^()\s=]+)(?:=\S+)?\s*(?:\(([^)]*)\))?", raw)
        if m:
            out.append((m[1], (m[2] or "")))
    return out


# Form lines that name a different person. Isaiah 20:1's Sargon is a king of Assyria in his own right, not another
# name for Sennacherib.
NOT_SAME = {("Sennacherib@2Ki.18.13-Isa", "Sargon")}


def _close(a, b):
    a, b = re.sub(r"[^a-z]", "", a.lower()), re.sub(r"[^a-z]", "", b.lower())
    if a == b or (len(a) >= 4 and a[:4] == b[:4]):
        return True
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1] <= 2


def load_tipnr(path):
    text = open(path, encoding="utf-8").read()
    people = {}
    parts = re.split(r"(?m)^\$==========\s*([^\t\n]*)[^\n]*\n", text)
    for kind, block in zip(parts[1::2], parts[2::2]):
        if "PERSON" not in kind:
            continue
        lines = [l for l in block.split("\n") if l.strip()]
        if not lines or "@" not in lines[0].split("\t")[0] or lines[0].startswith(("–", "$", "UnifiedName")):
            continue
        h = [x.strip() for x in lines[0].split("\t")]
        key = h[0].split("=")[0].strip()
        p = {"key": key, "name": key.split("@")[0].replace("_", " "), "desc": h[1] if len(h) > 1 else "",
             "parents": ref_list(h[2] if len(h) > 2 else ""), "siblings": ref_list(h[3] if len(h) > 3 else ""),
             "partners": ref_list(h[4] if len(h) > 4 else ""), "offspring": ref_list(h[5] if len(h) > 5 else ""),
             "tribe": h[6] if len(h) > 6 else "", "summary": h[7].lstrip("#").strip() if len(h) > 7 else "", "type": h[8] if len(h) > 8 else "",
             "forms": [], "strongs": set(), "verses": set(), "group_verses": set(), "inst": {}, "brief": "", "briefest": "", "short": "", "article": ""}
        # A form line can be about someone else. "David|Judah" is a manuscript reading with another name, and
        # "Shallum|Jehoiachin(?)" an identification TIPNR itself marks as uncertain: those verses are left out.
        # "Jews|Judah" is the nation named after Judah. A clan name can stand for its founder in a genealogy ("the
        # Iezerite clan from Iezer", Numbers 26:30), so those verses count as evidence, but aren't listed as the person's.
        forms_lines = [l.split("\t") for l in lines[1:] if l.startswith("–") and not l.startswith("– Total")]
        groups = {f[1].split("|")[0] for f in forms_lines if len(f) > 1 and "|" in f[1] and re.match(r"– (Group|Form \(verb\))", f[0])}
        plain = {f[1].split("|")[0] if "|" in f[1] else "" for f in forms_lines if len(f) > 1 and not f[0].startswith("– (same")}
        p["skipped"] = 0
        own = set()
        for l in lines[1:]:
            f = l.split("\t")
            group = False
            if l.startswith("–") and not l.startswith("– Total") and len(f) >= 5:
                kind, ident = f[0].lstrip("– ").strip(), f[1]
                prefix = ident.split("|")[0] if "|" in ident else ""
                english = f[3]
                variant = kind.startswith("(same")
                # A variant spelling of the same name, such as Shelomith for Shelomoth (1 Chronicles 23:9), is kept.
                same = not prefix or any(_close(prefix, x) for x in plain | {key.split("@")[0]} if x)
                if ("(?)" in ident or (variant and not same and prefix not in groups) or (key, prefix) in NOT_SAME
                        or (variant and re.search(r"\[ \] =[^;]*\bESV\b", english) and re.search(r"\[ \] =[^;]*\bNIV\b", english))):
                    p["skipped"] += 1
                    continue
                group = kind.startswith("Group") or kind.startswith("Form (verb)") or bool(prefix and prefix in groups)
            if l.startswith("@Briefest="):
                p["briefest"] = l[10:].strip()
            elif l.startswith("@Brief="):
                p["brief"] = l[7:].strip()
            elif l.startswith("@Short="):
                p["short"] = l[7:].strip()
            elif l.startswith("@Article="):
                p["article"] = l[9:].strip()
            elif l.startswith("–") and len(f) >= 5 and not f[0].startswith("– Total"):
                sig = f[0].lstrip("– ").strip()
                sids = sid(f[2].split("«")[0]) if f[2] else None
                if sids:
                    p["strongs"].add(sids)
                for part in (f[2] or "").split("«")[1:]:
                    s = sid(part)
                    if s:
                        p["strongs"].add(s)
                # "Egypt =ESV,NIV; Mizraim =KJV" names the same person two ways.
                # A spelling only one modern paraphrase uses, such as NIV's "Judea" for Judah, isn't a name for the person.
                for part in ([] if group else f[3].split(";")):
                    tags = part.split("=")[1] if "=" in part else ""
                    if tags and not re.search(r"\b(ESV|KJV|NA|TR|MT|LC)\b", tags):
                        continue
                    for name in re.sub(r"\s*=.*$", "", part).split(","):
                        name = name.strip()
                        if name and name not in p["forms"] and not name.startswith("[") and name[:1].isupper():
                            p["forms"].append(name)
                refs = f[5] if len(f) > 5 and f[5].strip() else f[4]
                for r in refs.split(";"):
                    c = osis(r)
                    if c:
                        p["verses"].add(c)
                        (p["group_verses"] if group else own).add(c)
                        # 1Sa.17.37b means the second time this name occurs in the verse.
                        m = re.search(r"\.\d+([a-e])\s*$", r.strip())
                        if m:
                            p["inst"].setdefault(c, set()).add(ord(m[1]) - 97)
                        else:
                            p["inst"].setdefault(c, set()).add(-1)
        # Verses that only the nation or clan form names. Someone known only that way, like "the Aramean" concubine
        # of 1 Chronicles 7:14, keeps them.
        p["group_verses"] -= own
        if not own:
            p["group_verses"] = set()
        people[key] = p
    return people


def csv_rows(path):
    return list(csv.DictReader(open(path, encoding="utf-8-sig")))


def load_bibledata(d):
    ref = lambda r: _bd_ref(r)
    people = {}
    for r in csv_rows(f"{d}/BibleData-Person.csv"):
        people[r["person_id"]] = {"key": r["person_id"], "name": " ".join(x for x in (r["person_name"], r["surname"]) if x), "title": r["unique_attribute"], "sex": r["sex"], "tribe": r["tribe"], "notes": r["person_notes"], "verses": set(), "labels": set(), "meanings": []}
    for r in csv_rows(f"{d}/BibleData-PersonLabel.csv"):
        p = people.get(r["person_id"])
        if p and r["label_type"] == "proper name":
            p["labels"].add(r["english_label"])
            m = r.get("hebrew_label_meaning") or r.get("greek_label_meaning")
            if m:
                p["meanings"].append(m)
    for r in csv_rows(f"{d}/BibleData-PersonVerse.csv"):
        p = people.get(r["person_id"])
        c = ref(r["reference_id"])
        if p and c:
            p["verses"].add(c)
    rels = [{"a": r["person_id_1"], "type": r["relationship_type"], "b": r["person_id_2"], "cat": r["relationship_category"], "ref": ref(r["reference_id"])} for r in csv_rows(f"{d}/BibleData-PersonRelationship.csv")]
    return people, rels


_BD = {"GEN":"Gen","EXO":"Exo","LEV":"Lev","NUM":"Num","DEU":"Deu","JOS":"Jos","JDG":"Jdg","RUT":"Rut","1SA":"1Sa","2SA":"2Sa","1KI":"1Ki","2KI":"2Ki","1CH":"1Ch","2CH":"2Ch","EZR":"Ezr","NEH":"Neh","EST":"Est","JOB":"Job","PSA":"Psa","PRO":"Pro","ECC":"Ecc","SNG":"Sng","ISA":"Isa","JER":"Jer","LAM":"Lam","EZK":"Ezk","DAN":"Dan","HOS":"Hos","JOL":"Jol","AMO":"Amo","OBA":"Oba","JON":"Jon","MIC":"Mic","NAM":"Nam","HAB":"Hab","ZEP":"Zep","HAG":"Hag","ZEC":"Zec","MAL":"Mal","MAT":"Mat","MRK":"Mrk","LUK":"Luk","JHN":"Jhn","ACT":"Act","ROM":"Rom","1CO":"1Co","2CO":"2Co","GAL":"Gal","EPH":"Eph","PHP":"Php","COL":"Col","1TH":"1Th","2TH":"2Th","1TI":"1Ti","2TI":"2Ti","TIT":"Tit","PHM":"Phm","HEB":"Heb","JAS":"Jas","1PE":"1Pe","2PE":"2Pe","1JN":"1Jn","2JN":"2Jn","3JN":"3Jn","JUD":"Jud","REV":"Rev"}


def _bd_ref(r):
    m = re.match(r"([1-3]?[A-Z]+) (\d+):(\d+)", r or "")
    if not m or m[1] not in _BD:
        return None
    return code(BOOK_NUM[_BD[m[1]]], int(m[2]), int(m[3]))


def load_theographic(d):
    people = {}
    for r in csv_rows(f"{d}/CSV/People.csv"):
        vs = {osis(x) for x in (r["verses"] or "").split(",")}
        vs.discard(None)
        people[r["personLookup"]] = {"key": r["personLookup"], "name": r["name"], "gender": r["gender"], "verses": vs, "father": _sp(r["father"]), "mother": _sp(r["mother"]), "partners": _sp(r["partners"]), "children": _sp(r["children"]), "birth": r["birthYear"], "death": r["deathYear"], "also": r["alsoCalled"], "member": r["memberOf"]}
    return people


def _sp(x):
    return [i.strip() for i in (x or "").split(",") if i.strip()]


def load_acai(d):
    people = {}
    for name in os.listdir(f"{d}/people/json"):
        j = json.load(open(f"{d}/people/json/{name}", encoding="utf-8"))
        tip = (j.get("alternate_sources") or {}).get("tipnr") or []
        people[j["id"]] = {"key": j["id"], "primary": j.get("primary_id") or j["id"], "gender": j.get("gender"), "father": j.get("father"), "mother": j.get("mother"), "partners": j.get("partners") or [], "offspring": j.get("offspring") or [], "roles": j.get("roles") or [], "tipnr": [t.split("|")[-1] for t in tip], "label": ((j.get("localizations") or {}).get("eng") or {}).get("preferred_label", "")}
    return people
