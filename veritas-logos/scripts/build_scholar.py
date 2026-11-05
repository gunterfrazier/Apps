#!/usr/bin/env python3
"""Builds the scholarly data: ancient texts, the deuterocanon, creeds, edition differences, word tags, synopsis and Josephus.
Every file records where it comes from. Run with: python3 -I scripts/build_scholar.py --sources ../sources --out public/data"""
import argparse, glob, html, json, os, re, sys

ap = argparse.ArgumentParser(); ap.add_argument("--sources", required=True); ap.add_argument("--out", required=True); a = ap.parse_args()
S, OUT, DATA = a.sources, os.path.join(a.out, "scholar"), a.out
X2 = os.path.join(S, "extra2"); CCEL = os.path.join(S, "extra/ccel-copy/references/ccel/authors")
os.makedirs(OUT, exist_ok=True)
def dump(name, obj):
    p = os.path.join(OUT, name); os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(obj, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"  {name}: {os.path.getsize(p)//1000} KB")
def clean(x):
    x = re.sub(r"<note\b.*?</note>", "", x, flags=re.S)
    x = html.unescape(re.sub(r"<[^>]+>", "", x)).replace("�", "").replace("\xa0", " ")
    x = re.sub(r"\s+", " ", x)
    return re.sub(r" ([,.;:?!])", r"\1", x).strip()

BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
NO = {n: i + 1 for i, n in enumerate(BOOKS)}
GROUPS = [("law", 1, 5), ("history", 6, 17), ("wisdom", 18, 22), ("prophets", 23, 39)]
def group_of(b):
    return next(g for g, x, y in GROUPS if x <= b <= y)

# ---------- Swete's Septuagint ----------
print("Septuagint")
LXX_NAMES = {"Genesis":1,"Exodus":2,"Leviticus":3,"Numeri":4,"Deuteronomium":5,"Josue":6,"Judices":7,"Ruth":8,"Regnorum_I":9,"Regnorum_II":10,"Regnorum_III":11,"Regnorum_IV":12,"Paralipomenon_I":13,"Paralipomenon_II":14,"Esdras_II":15,"Esther":17,"Job":18,"Psalmi":19,"Proverbia":20,"Ecclesiastes":21,"Canticum":22,"Isaias":23,"Hieremias":24,"Threni_seu_Lamentationes":25,"Ezechiel":26,"Osee":28,"Amos":30,"Michaeas":33,"Joel":29,"Abdias":31,"Jonas":32,"Nahum":34,"Habacuc":35,"Sophonias":36,"Aggaeus":37,"Zacharias":38,"Malachias":39}
lxx_files = sorted(glob.glob(os.path.join(X2, "lxx-swete/data/*.txt")))
print("  files:", [os.path.basename(f)[3:-4] for f in lxx_files])
def read_lxx(f):
    ch = {}
    for line in open(f, encoding="utf-8"):
        m = re.match(r"(\d+)\.(\w+)\.(\w+) (.+)", line.strip())
        if not m: continue
        c, v, w = m.group(2), m.group(3), m.group(4)
        ch.setdefault(c, {}).setdefault(v, []).append(w)
    return {c: {v: " ".join(ws) for v, ws in d.items()} for c, d in ch.items()}
lxx = {g: {} for g, _, _ in GROUPS}; lxx_extra = {}; nameless = []
for f in lxx_files:
    nm = os.path.basename(f)[3:-4]
    data = read_lxx(f)
    b = next((LXX_NAMES[k] for k in LXX_NAMES if nm == k or nm.lower() == k.lower()), None)
    if nm.startswith("Daniel"):
        lxx_extra.setdefault("Daniel", {})[nm] = data
        if "Theodotion" in nm or "TH" in nm or "Th" in nm: lxx["prophets"]["27"] = data
        elif "27" not in lxx["prophets"]: lxx["prophets"]["27"] = data
    elif b: lxx[group_of(b)][str(b)] = data
    else:
        lxx_extra[nm] = data; nameless.append(nm)
print("  not one of the 66:", nameless)
for g, d in lxx.items(): dump(f"lxx-{g}.json", d)
json.dump(lxx_extra, open("/tmp/lxx_extra.json", "w", encoding="utf-8"), ensure_ascii=False)

# Books whose numbering in Swete differs get mapped here; the rest of the Greek goes with the deuterocanon.
x = lxx_extra
lxx["prophets"]["24"] = x.pop("Jeremias")
dan = x.pop("Daniel"); lxx["prophets"]["27"] = dan["Daniel_Theodotionis_versio"]; dan_og = dan["Daniel_translatio_Graeca"]
ezr = x.pop("Esdras_B")
lxx["history"]["15"] = {c: ezr[c] for c in ezr if int(c) <= 10}
lxx["history"]["16"] = {str(int(c) - 10): ezr[c] for c in ezr if int(c) > 10}
missing = [n for n in range(1, 40) if not any(str(n) in lxx[g] for g in lxx)]
print("  books of the 39 with no Greek:", missing)
assert missing == [21], missing  # This digital Swete has no Ecclesiastes. The app says so.
for g, d in lxx.items(): dump(f"lxx-{g}.json", d)

# ---------- The Clementine Vulgate ----------
print("Vulgate")
t = open(os.path.join(X2, "vulg/lat-clementine-vul.usfx.xml"), encoding="utf-8").read()
USFX = {"GEN":1,"EXO":2,"LEV":3,"NUM":4,"DEU":5,"JOS":6,"JDG":7,"RUT":8,"1SA":9,"2SA":10,"1KI":11,"2KI":12,"1CH":13,"2CH":14,"EZR":15,"NEH":16,"EST":17,"JOB":18,"PSA":19,"PRO":20,"ECC":21,"SNG":22,"ISA":23,"JER":24,"LAM":25,"EZK":26,"DAN":27,"HOS":28,"JOL":29,"AMO":30,"OBA":31,"JON":32,"MIC":33,"NAM":34,"HAB":35,"ZEP":36,"HAG":37,"ZEC":38,"MAL":39,"MAT":40,"MRK":41,"LUK":42,"JHN":43,"ACT":44,"ROM":45,"1CO":46,"2CO":47,"GAL":48,"EPH":49,"PHP":50,"COL":51,"1TH":52,"2TH":53,"1TI":54,"2TI":55,"TIT":56,"PHM":57,"HEB":58,"JAS":59,"1PE":60,"2PE":61,"1JN":62,"2JN":63,"3JN":64,"JUD":65,"REV":66}
vul = {}; vul_dc = {}
for bk, body in re.findall(r'<book id="(\w+)">(.*?)</book>', t, re.S):
    book = {}
    for c, cb in re.findall(r'<c id="(\d+)"/>(.*?)(?=<c id=|\Z)', body, re.S):
        vs = {}
        for v, tx in re.findall(r'<v id="(\d+)"/>(.*?)(?:<ve/>|(?=<v id=)|\Z)', cb, re.S):
            vs[v] = re.sub(r"\s+([:;,.?!])", r"\1", clean(tx))
        book[c] = vs
    if bk in USFX: vul[USFX[bk]] = book
    else: vul_dc[bk] = book
vg = {"ot": {str(b): vul[b] for b in vul if b < 40}, "nt": {str(b): vul[b] for b in vul if b >= 40}}
dump("vulgate-ot.json", vg["ot"]); dump("vulgate-nt.json", vg["nt"])

# ---------- Deuterocanon and related books ----------
print("Deuterocanon")
def dr(name):
    d = json.load(open(glob.glob(os.path.join(X2, f"douayrheimsbible/douayrheims-json/*_{name}.json"))[0], encoding="utf-8"))
    return {c: {v: clean(s) for v, s in vs.items()} for c, vs in d.items() if isinstance(vs, dict)}
DC = [
 ("tobit","Tobit","Tobit","Tobit","Tobias","Tobias"),
 ("judith","Judith","Judith","Judith","Judith","Judith"),
 ("wisdom","Wisdom of Solomon","Wisdom","WisdomofSolomon","Sapientia_Salomonis","Sapientia"),
 ("sirach","Sirach (Ecclesiasticus)","Sirach","Ecclesiasticus","Ecclesiasticus","Sir"),
 ("baruch","Baruch","Baruch","Baruch","Baruch","Bar"),
 ("letter-of-jeremiah","Letter of Jeremiah",None,"LetterofJeremiah","Epistula_Jeremiae",None),
 ("1-maccabees","1 Maccabees","1-Maccabees","1Maccabees","Machabaeorum_i","1MA"),
 ("2-maccabees","2 Maccabees","2-Maccabees","2Maccabees","Machabaeorum_ii","2MA"),
 ("3-maccabees","3 Maccabees",None,None,"Machabaeorum_iii",None),
 ("4-maccabees","4 Maccabees",None,None,"Machabaeorum_iv",None),
 ("1-esdras","1 Esdras",None,"1Esdras","Esdras_A",None),
 ("2-esdras","2 Esdras",None,"2Esdras",None,None),
 ("additions-esther","Additions to Esther",None,"AdditionstoEsther",None,None),
 ("susanna","Susanna",None,"Susanna","Susanna_Theodotionis_versio",None),
 ("bel","Bel and the Dragon",None,"BelandtheDragon","Bel_et_Draco_Theodotionis_versio",None),
 ("song-of-three","Prayer of Azariah and Song of the Three",None,"PrayerofAzariah",None,None),
 ("prayer-of-manasseh","Prayer of Manasseh",None,"PrayerofManasseh",None,None),
 ("psalms-of-solomon","Psalms of Solomon",None,None,"Psalmi_Salomonis",None),
 ("odes","Odes",None,None,"Odae",None),
]
KJV_FILES = {os.path.basename(f)[:-5].lower().replace(" ", "").replace("_", ""): f for f in glob.glob(os.path.join(X2, "kjv1611/books/*.json"))}
def kjvf(n):
    if not n: return None
    k = n.lower()
    hit = KJV_FILES[k]
    d = json.load(open(hit, encoding="utf-8"))
    return {str(c["chapter"]): {str(v["verse"]): clean(v["text"]) for v in c["verses"]} for c in d["chapters"]}
dc = {}
for id_, name, drn, kj, gr, _ in DC:
    e = {"id": id_, "name": name, "dra": dr(drn) if drn else None, "kjv": kjvf(kj), "lxx": x.get(gr) if gr else None}
    dc[id_] = e
    print(f"   {id_}: DRA {len(e['dra'] or {})}, KJV {len(e['kjv'] or {})}, Greek {len(e['lxx'] or {})}")
dump("deuterocanon.json", {"books": list(dc.values()), "danielOG": dan_og})

# ---------- BSB with Strong's numbers ----------
print("BSB word tags")
BSB_GROUPS = [("tags-law", 1, 5), ("tags-history", 6, 17), ("tags-wisdom", 18, 22), ("tags-prophets", 23, 39), ("tags-gospels", 40, 44), ("tags-letters", 45, 66)]
bsb_nt = json.load(open(os.path.join(DATA, "bible/BSB-nt.json"), encoding="utf-8")); bsb_ot = json.load(open(os.path.join(DATA, "bible/BSB-ot.json"), encoding="utf-8"))
def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower().replace("[", "").replace("]", ""))
tags = {g: {} for g, _, _ in BSB_GROUPS}; total = same = 0; nofile = []
for bno, name in enumerate(BOOKS, 1):
    ds = glob.glob(os.path.join(X2, f"bsbs/bible/{bno:02d} - *"))
    if not ds: nofile.append(name); continue
    g = next(x_ for x_, a_, b_ in BSB_GROUPS if a_ <= bno <= b_)
    rows = {}
    for f in glob.glob(os.path.join(ds[0], "*.md")):
        hit = re.search(r" (\d+)\.md$", f)
        if not hit: continue
        c = int(hit.group(1))
        vs = {}
        for v, body in re.findall(r"^###### (\d+)\n(.*?)(?=^###### |\Z)", open(f, encoding="utf-8").read(), re.S | re.M):
            toks = []
            for chunk, st in re.findall(r"([^\[]*(?:\[(?!\[)[^\]]*\][^\[]*)*)(?:\[\[([HG]\d+[a-zA-Z]?)\]\])?", body.strip()):
                chunk = chunk.strip()
                if chunk or st: toks.append((chunk, st[1:] if st else ""))
            toks = [t for t in toks if t[0]]
            vs[v] = "|".join(f"{w}~{s}" if s else w for w, s in toks)
            total += 1
            src = (bsb_ot if bno < 40 else bsb_nt)[bno - 1 if bno < 40 else bno - 40]
            try: real = src[c - 1][int(v) - 1]
            except Exception: real = ""
            if norm(" ".join(w for w, _ in toks)) == norm(real or ""): same += 1
        rows[c] = vs
    tags[g][str(bno)] = {str(c): rows[c] for c in sorted(rows)}
print("  books with no tag file:", nofile, "verses", total, "matching the app's BSB exactly", same, f"{same/max(1,total):.1%}")
for g, d in tags.items(): dump(f"{g}.json", d)

# ---------- Where the Greek editions differ, and the Hebrew Qere and Ketiv ----------
print("Edition differences")
TA = os.path.join(S, "STEPBible-Data/Translators Amalgamated OT+NT")
ABBR = {"Mat":40,"Mrk":41,"Luk":42,"Jhn":43,"Act":44,"Rom":45,"1Co":46,"2Co":47,"Gal":48,"Eph":49,"Php":50,"Col":51,"1Th":52,"2Th":53,"1Ti":54,"2Ti":55,"Tit":56,"Phm":57,"Heb":58,"Jas":59,"1Pe":60,"2Pe":61,"1Jn":62,"2Jn":63,"3Jn":64,"Jud":65,"Rev":66}
FULL = "NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz"
var = {}; nwords = 0
for f in sorted(glob.glob(os.path.join(TA, "TAGNT *"))):
    for line in open(f, encoding="utf-8"):
        m = re.match(r"([1-3A-Z][a-zA-Z0-9]{2})\.(\d+)\.(\d+)#(\d+)=(\S+)\t", line)
        if not m or m.group(1) not in ABBR: continue
        p = line.rstrip("\n").split("\t")
        if len(p) < 7: continue
        word, eng, ed, mv = p[1], p[2], p[5].strip(), p[6].strip()
        word = re.sub(r"\s*\(.*\)$", "", word)
        nwords += 1
        if ed == FULL and not mv: continue
        k = f"{ABBR[m.group(1)]}.{m.group(2)}.{m.group(3)}"
        var.setdefault(k, []).append([int(m.group(4)), word, eng, ed, mv])
print("  words", nwords, "verses with a difference", len(var))
VGROUPS = [("gospels", 40, 43), ("acts-paul", 44, 57), ("general", 58, 66)]
for g, x1, x2 in VGROUPS:
    dump(f"variants-{g}.json", {k: v for k, v in var.items() if x1 <= int(k.split(".")[0]) <= x2})
OTABBR = {"Gen":1,"Exo":2,"Lev":3,"Num":4,"Deu":5,"Jos":6,"Jdg":7,"Rut":8,"1Sa":9,"2Sa":10,"1Ki":11,"2Ki":12,"1Ch":13,"2Ch":14,"Ezr":15,"Neh":16,"Est":17,"Job":18,"Psa":19,"Pro":20,"Ecc":21,"Sng":22,"Isa":23,"Jer":24,"Lam":25,"Ezk":26,"Dan":27,"Hos":28,"Jol":29,"Amo":30,"Oba":31,"Jon":32,"Mic":33,"Nam":34,"Hab":35,"Zep":36,"Hag":37,"Zec":38,"Mal":39}
qk = {}
for f in sorted(glob.glob(os.path.join(TA, "TAHOT *"))):
    for line in open(f, encoding="utf-8"):
        m = re.match(r"([1-3A-Z][a-zA-Z0-9]{2})\.(\d+)\.(\d+)(?:\(\S*?\))?#(\d+)=([^\t]+)\t", line)
        if not m or m.group(1) not in OTABBR or m.group(5).strip() == "L": continue
        p = line.rstrip("\n").split("\t")
        k = f"{OTABBR[m.group(1)]}.{m.group(2)}.{m.group(3)}"
        if not re.match(r"[QKRX]", m.group(5).strip()): continue
        qk.setdefault(k, []).append([int(m.group(4)), p[1], p[3], m.group(5).strip(), (p[6] if len(p) > 6 else "").strip()])
print("  Hebrew verses with a marked reading", len(qk))
dump("variants-ot.json", qk)

# ---------- Gospel synopsis (Aland's sections) ----------
print("Synopsis")
import subprocess, tempfile
js = open(os.path.join(X2, "aland-gospel-synopsis/src/alandSections.js"), encoding="utf-8").read()
js = re.sub(r"^import .*$", "", js, flags=re.M).replace("export const alandSynopsis =", "const alandSynopsis =")
js = re.sub(r"^export .*$", "", js, flags=re.M)
with tempfile.NamedTemporaryFile("w", suffix=".cjs", delete=False, encoding="utf-8") as tf:
    tf.write(js + "\nconsole.log(JSON.stringify(alandSynopsis));")
syn = json.loads(subprocess.run(["node", tf.name], capture_output=True, text=True, check=True).stdout)
os.unlink(tf.name)
sec = [{"n": s["section"], "title": s["title"], "from": int(str(s["pericopes"]).split("-")[0]), "to": int(str(s["pericopes"]).split("-")[-1])} for s in syn["sections"]]
rows = []
for p in syn["pericopes"]:
    r = {"n": p["pericope"], "title": p["title"]}
    for g in ("Matt", "Mark", "Luke", "John"):
        e = p.get(g) or {}
        if e.get("ref"): r[g] = [e["ref"], 1 if e.get("primary") else 0]
        if e.get("secondary"): r[g + "2"] = e["secondary"]
    rows.append(r)
dump("synopsis.json", {"sections": sec, "pericopes": rows})

# ---------- Apostolic Fathers: Greek with an older English, by chapter ----------
print("Apostolic Fathers")
def ccel(rel): return open(os.path.join(CCEL, rel + ".xml"), encoding="utf-8", errors="replace").read()
def divs_under(raw, parent):
    out = []
    for m in re.finditer(r"<div(\d)\b([^>]*)>", raw):
        i = re.search(r'\bid="([^"]*)"', m.group(2)); ti = re.search(r'\btitle="([^"]*)"', m.group(2))
        if i and i.group(1).startswith(parent + ".") and i.group(1).count(".") == parent.count(".") + 1:
            out.append((i.group(1), html.unescape(ti.group(1)) if ti else "", m.start(), m.group(1)))
    return out
def div_text(raw, start, lv):
    end = raw.find(f"</div{lv}>", start)
    body = re.sub(r"<note\b.*?</note>", "", raw[start:end], flags=re.S)
    body = re.sub(r"<h\d\b.*?</h\d>", "", body, flags=re.S)
    ps = [clean(p) for p in re.findall(r"<p\b[^>]*>(.*?)</p>", body, re.S)]
    pages = re.findall(r'<pb\b[^>]*\bn="(\w+)"', raw[:start][-4000:])
    return "\n\n".join(p for p in ps if p), (pages[-1] if pages else "")
ROMAN = {"i":1,"v":5,"x":10,"l":50,"c":100}
def roman(s):
    n = 0; s = s.lower()
    for i, ch in enumerate(s):
        v = ROMAN.get(ch, 0); n += -v if i + 1 < len(s) and ROMAN.get(s[i + 1], 0) > v else v
    return n
AF = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "apostolic_map.json"), encoding="utf-8")) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "apostolic_map.json")) else []
works = []
for w in AF:
    gk = {}
    for line in open(os.path.join(X2, "apostolic-fathers/texts", w["greek"]), encoding="utf-8"):
        m = re.match(r"(\S+?)\.(\S+) (.*)", line.strip())
        if m: gk.setdefault(m.group(1), []).append([m.group(2), m.group(3)])
    raw = ccel(w["rel"]) if w.get("rel") else None
    eng = {}
    if raw:
        for did, title, start, lv in divs_under(raw, w["div"]):
            hit = re.match(r"Chapter ([IVXLC]+)", title)
            if hit:
                text, page = div_text(raw, start, lv)
                eng[str(roman(hit.group(1)))] = [text, page]
    chapters = [{"n": c, "greek": gk[c], "eng": eng.get(c, ["", ""])[0], "page": eng.get(c, ["", ""])[1]} for c in gk]
    works.append({"id": w["id"], "name": w["name"], "writer": w.get("writer", ""), "engSource": w.get("source", ""), "url": w.get("url", ""), "chapters": chapters})
    print(f"   {w['id']}: Greek chapters {len(gk)}, English found {sum(1 for c in chapters if c['eng'])}")
if works: dump("apostolic.json", {"works": works})

# ---------- Josephus, Whiston's translation ----------
print("Josephus")
def gut(path):
    t = open(path, encoding="utf-8", errors="replace").read().replace("\r\n", "\n")
    m = re.search(r"\*\*\* ?START OF[^\n]*\n", t); t = t[m.end():] if m else t
    m = re.search(r"\*\*\* ?END OF", t); t = t[:m.start()] if m else t
    m = re.search(r"\n(?:ENDNOTES|FOOTNOTES|Footnotes|\*\*\*\*\*)\b", t)
    if m and m.start() > len(t) * 0.5: t = t[:m.start()]
    return re.sub(r"\s*End of (?:the )?Project Gutenberg[^\n]*(?:\n[^\n]+)*", "", t)
def paras(block):
    out = []
    for p in re.split(r"\n\s*\n", block):
        s = re.sub(r"\s+", " ", re.sub(r"\[\d+\]", "", p)).strip()
        if not s: continue
        m = re.match(r"(\d+)\. (.*)", s)
        if m: out.append([int(m.group(1)), m.group(2)])
        elif out: out[-1][1] += " " + s
    return out
def jos_books(t):
    books = []
    for bm in re.finditer(r"^BOOK ([IVXLC\d]+)\.?([^\n]*(?:\n[^\n]+)*?)\n\n(.*?)(?=^BOOK [IVXLC\d]+\.|\Z)", t, re.S | re.M):
        n = bm.group(1); num = int(n) if n.isdigit() else roman(n)
        chs = []
        parts = re.split(r"^CHAPTER (\d+)\.?([^\n]*(?:\n[^\n]+)*?)\n\n", bm.group(3), flags=re.M)
        if len(parts) == 1:
            chs.append({"n": 1, "title": "", "paras": paras(parts[0])})
        else:
            for i in range(1, len(parts), 3):
                chs.append({"n": int(parts[i]), "title": re.sub(r"\s+", " ", parts[i + 1]).strip(" ."), "paras": paras(parts[i + 2])})
        books.append({"n": num, "chapters": [c for c in chs if c["paras"]]})
    return [b for b in books if b["chapters"]]
jw = []
for id_, name, f in (("antiquities", "Antiquities of the Jews", "Antiquities-of-the-Jews_2848/2848.txt"), ("war", "The Wars of the Jews", "wars/2850.txt"), ("apion", "Against Apion", "apion/2849.txt"), ("life", "The Life of Flavius Josephus", "life/2846.txt")):
    t = gut(os.path.join(X2, f))
    if id_ == "life":
        i = re.search(r"\n1\. The family", t).start()
        bk = [{"n": 1, "chapters": [{"n": 1, "title": "", "paras": paras(t[i:])}]}]
    else:
        bk = jos_books(t)
    jw.append({"id": id_, "name": name, "books": bk})
    print(f"   {id_}: books {len(bk)}, chapters {sum(len(b['chapters']) for b in bk)}, paragraphs {sum(len(c['paras']) for b in bk for c in b['chapters'])}")
for w in jw:
    pass
dump("josephus.json", {"works": jw})

# ---------- Schaff, The Creeds of Christendom ----------
print("Creeds")
DOCS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "creed_docs.json"), encoding="utf-8"))
OSIS = {"Gen":1,"Exod":2,"Lev":3,"Num":4,"Deut":5,"Josh":6,"Judg":7,"Ruth":8,"1Sam":9,"2Sam":10,"1Kgs":11,"2Kgs":12,"1Chr":13,"2Chr":14,"Ezra":15,"Neh":16,"Esth":17,"Job":18,"Ps":19,"Prov":20,"Eccl":21,"Song":22,"Isa":23,"Jer":24,"Lam":25,"Ezek":26,"Dan":27,"Hos":28,"Joel":29,"Amos":30,"Obad":31,"Jonah":32,"Mic":33,"Nah":34,"Hab":35,"Zeph":36,"Hag":37,"Zech":38,"Mal":39,"Matt":40,"Mark":41,"Luke":42,"John":43,"Acts":44,"Rom":45,"1Cor":46,"2Cor":47,"Gal":48,"Eph":49,"Phil":50,"Col":51,"1Thess":52,"2Thess":53,"1Tim":54,"2Tim":55,"Titus":56,"Phlm":57,"Heb":58,"Jas":59,"1Pet":60,"2Pet":61,"1John":62,"2John":63,"3John":64,"Jude":65,"Rev":66}
creed_raw = {v: ccel(f"schaff/creeds{v}") for v in (2, 3)}
for v, r in creed_raw.items():
    assert "public domain" in re.search(r"<DC\.Rights[^>]*>([^<]*)", r).group(1).lower()
def div_span(raw, id_):
    m = re.search(r'<div(\d)\b[^>]*\bid="' + re.escape(id_) + r'"[^>]*>', raw)
    assert m, id_
    lv = m.group(1); depth = 1; pos = m.end()
    for t2 in re.finditer(rf"<(/?)div{lv}\b", raw[pos:]):
        depth += -1 if t2.group(1) else 1
        if depth == 0:
            return m.end(), pos + t2.start()
    return m.end(), len(raw)
TOKEN = re.compile(r"<(table|p|h[1-6]|pb|div\d)\b([^>]*?)(/?)>|<(/)(table)>", re.S)
def blocks(chunk):
    """Paragraphs, headings and page marks in order. A two-column table row is original and English side by side."""
    chunk = re.sub(r"<note\b.*?</note>", "", chunk, flags=re.S)
    out, refs = [], []
    pos = 0
    for tm in re.finditer(r"<table\b.*?</table>|<pb\b[^>]*?/>|<h[1-6]\b.*?</h[1-6]>|<p\b[^>]*>.*?</p>", chunk, re.S):
        x = tm.group(0)
        if x.startswith("<pb"):
            n = re.search(r'\bn="(\w+)"', x)
            if n: out.append(["pg", n.group(1)])
        elif x.startswith("<table"):
            for row in re.findall(r"<tr\b.*?</tr>", x, re.S):
                cells = [clean(c) for c in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)]
                cells = [c for c in cells if c]
                if len(cells) == 2: out.append(["2", cells[0], cells[1]])
                elif cells: out.append(["p", " ".join(cells)])
        elif x.startswith("<h"):
            s = clean(x)
            if s: out.append(["h", s])
        else:
            s = clean(x)
            if s and not s.startswith("["): out.append(["p", s])
            elif s: out.append(["p", s])
    return out
docs_out = {}; refsidx = {}
for d in DOCS:
    raw = creed_raw[d["vol"]]
    a, b = div_span(raw, d["div"])
    chunk = raw[a:b]
    blk = blocks(chunk)
    # A leading page mark for where the document starts.
    prior = re.findall(r'<pb\b[^>]*\bn="(\w+)"', raw[max(0, a - 3000):a])
    if prior and not (blk and blk[0][0] == "pg"): blk.insert(0, ["pg", prior[-1]])
    sections = [m.group(2) for m in re.finditer(r'<div(\d)\b[^>]*?title="([^"]*)"', chunk)]
    for pr in re.findall(r'parsed="\|([^"]*)"', re.sub(r"<note\b.*?</note>", "", chunk, flags=re.S)):
        q = pr.split("|")
        if len(q) >= 3 and q[0] in OSIS and q[1].isdigit() and q[2].isdigit():
            refsidx.setdefault(f"{OSIS[q[0]]}.{q[1]}.{q[2]}", set()).add(d["id"])
    words = sum(len(" ".join(x[1:]).split()) for x in blk if x[0] != "pg")
    docs_out[d["id"]] = {**{k: d[k] for k in d if k not in ("div",)}, "url": f"https://ccel.org/ccel/schaff/creeds{d['vol']}.{d['div']}.html", "words": words, "blocks": blk}
    print(f"   {d['id']}: {words} words, {sum(1 for x in blk if x[0]=='2')} paired rows")
index = []
for grp in sorted(set(d["group"] for d in DOCS)):
    part = {k: v for k, v in docs_out.items() if v["group"] == grp}
    dump(f"creeds-{grp}.json", part)
for k, v in docs_out.items():
    index.append({x: v[x] for x in ("id", "name", "year", "tradition", "group", "vol", "url", "words")})
dump("creeds-index.json", {"docs": sorted(index, key=lambda d: d["year"]), "refs": {k: sorted(v) for k, v in refsidx.items()}})

# ---------- Church history events ----------
# Each summary is checked against its source: a section of Schaff that must contain the phrase given, or a web page read when this was written.
print("Church history")
events = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "church_events.json"), encoding="utf-8"))
WORKS = {"hcc1": "Philip Schaff, History of the Christian Church, vol. 1", "hcc2": "Philip Schaff, History of the Christian Church, vol. 2", "hcc3": "Philip Schaff, History of the Christian Church, vol. 3", "hcc4": "Philip Schaff, History of the Christian Church, vol. 4", "hcc5": "Philip Schaff, History of the Christian Church, vol. 5", "hcc6": "Philip Schaff, History of the Christian Church, vol. 6", "hcc7": "Philip Schaff, History of the Christian Church, vol. 7", "hcc8": "Philip Schaff, History of the Christian Church, vol. 8", "creeds1": "Philip Schaff, The Creeds of Christendom, vol. 1"}
raws = {w: ccel(f"schaff/{w}") for w in WORKS}
all_divs = {}
for w, r in raws.items():
    all_divs[w] = [(m.start(), m.group(1), re.search(r'\bid="([^"]*)"', m.group(2)).group(1), (re.search(r'\btitle="([^"]*)"', m.group(2)) or [None, ""])[1]) for m in re.finditer(r"<div(\d)\b([^>]*\bid=\"[^\"]*\"[^>]*)>", r)]
BIBLIO = re.compile(r"\b(?:ed\.|edd\.|vol\.|vols\.|pp?\.|tom\.|Lond\.|Oxf\.|Par\.|Berl\.|Leipz|Gotha|Bonn,|Comp\.|comp\.|Opera|sqq?\.|Migne|cf\.)|\b1[5-9]\d\d[,;)]")
def sentences(text):
    return [x.strip() for x in re.split(r"(?<=[.?!])\s+(?=[A-Z“\"])", text)]
def sentence_with(text, phrase):
    """The first real sentence that holds the phrase, skipping headings and book lists. Falls back to the section's first real sentence."""
    if phrase.lower() not in text.lower(): return None
    good = [x for x in sentences(text) if 70 <= len(x) <= 500 and not BIBLIO.search(x) and x.count(":") < 3]
    for x in good:
        if phrase.lower() in x.lower(): return x
    return ""
def section_paras(raw, start):
    lv = raw[start + 4]
    end = raw.find(f"</div{lv}>", start)
    chunk = raw[start:end if end > 0 else start + 60000]
    chunk = re.sub(r"<note\b.*?</note>", "", chunk, flags=re.S)
    return " ".join(clean(p) for p in re.findall(r"<p\b[^>]*>(.*?)</p>", chunk, re.S))
writers = {x["id"] for x in json.load(open(os.path.join(DATA, "writings/index.json"), encoding="utf-8"))["authors"]}
terms = {x["id"] for x in json.load(open(os.path.join(DATA, "glossary.json"), encoding="utf-8"))["terms"]}
creed_ids = {d["id"] for d in DOCS}
ev_ids = {e["id"] for e in events}
# These sections name the event but their nearest sentence doesn't state it well, so only the section is cited.
NOQUOTE = {"jerusalem-council","marcion","rule-of-faith","theodosius","constantinople-1","chalcedon-split","benedict","toledo-filioque","gottschalk","anselm","worms-1122","fourth-crusade","zwingli","marburg","augsburg","institutes","consensus-tigurinus","peace-augsburg","belgic","heidelberg","second-helvetic","thirty-nine","trent","concord","dort","westminster","savoy","dositheus","immaculate","syllabus","nicaea-2","erasmus-nt","islam","henry-supremacy","vatican-1","scots-confession","geneva","charlemagne","aquinas","triumph-orthodoxy","mogila","constance"}
out_ev = []; problems = []
for e in events:
    r = dict(e)
    for t_ in e.get("terms", []):
        if t_ not in terms: problems.append(f"{e['id']}: no term {t_}")
    for w_ in e.get("writers", []):
        if w_ not in writers: problems.append(f"{e['id']}: no writer {w_}")
    for c_ in e.get("creeds", []):
        if c_ not in creed_ids: problems.append(f"{e['id']}: no creed {c_}")
    for x_ in e.get("related", []):
        if x_ not in ev_ids: problems.append(f"{e['id']}: no event {x_}")
    w = e.get("w")
    if w:
        raw = raws[w]; found = None
        cands = [d for d in all_divs[w] if d[2] == e["d"]] if e.get("d") else all_divs[w]
        if e.get("d") and not cands: problems.append(f"{e['id']}: no section {e['d']} in {w}")
        for start, lv, did, title in cands:
            s = section_paras(raw, start)
            q = sentence_with(s, e["find"])
            if q is not None:
                found = (did, title, q, start); break
        if not found and e.get("d"):
            # The phrase may sit in a subsection.
            for start, lv, did, title in all_divs[w]:
                if did.startswith(e["d"] + "."):
                    s = section_paras(raw, start); q = sentence_with(s, e["find"])
                    if q is not None: found = (did, title, q, start); break
        if not found:
            problems.append(f"{e['id']}: phrase '{e['find']}' not in {w} {e.get('d','')}")
            continue
        did, title, q, start = found
        pg = re.findall(r'<pb\b[^>]*\bn="(\w+)"', raw[max(0, start - 6000):start + 800])
        r["source"] = f"{WORKS[w]}, “{html.unescape(title)}”"
        r["page"] = pg[-1] if pg else ""
        if not e.get("url"): r["url"] = f"https://ccel.org/ccel/schaff/{w}.{did}.html"
        if q and e["id"] not in NOQUOTE: r["quote"] = q[:420] + (" …" if len(q) > 420 else "")
        r["sourceKind"] = "local"
    else:
        r["sourceKind"] = "web"
    for k in ("w", "d", "find"): r.pop(k, None)
    out_ev.append(r)
print("  events", len(out_ev), "problems:", *problems, sep="\n    ")
out_ev.sort(key=lambda e: (e["y1"], e.get("y2", e["y1"])))
dump("church.json", {"events": out_ev})

# ---------- Dating and disputed passages ----------
here = os.path.dirname(os.path.abspath(__file__))
dump("chronology.json", {"items": json.load(open(os.path.join(here, "chronology.json"), encoding="utf-8")), "books": json.load(open(os.path.join(here, "book_dating.json"), encoding="utf-8"))})
dump("disputed.json", json.load(open(os.path.join(here, "disputed.json"), encoding="utf-8")))

# ---------- Terms through the centuries ----------
print("Doctrine index")
import collections
W_IX = json.load(open(os.path.join(DATA, "writings/index.json"), encoding="utf-8"))
G = json.load(open(os.path.join(DATA, "glossary.json"), encoding="utf-8"))["terms"]
name_to_term = {}
STOP = {"being","love","glory","word","person","mercy","worship","prayer","grace","sin","faith","law","heaven","hell","god","soul","saints","gospel","sacrifice","holiness","elders","apostle","epistle","creed","bible","scripture","calling","judgment","priest","prophet","king","church","kingdom of god","holy spirit","temple","covenant","trinity"}
for t in G:
    for n in [t["term"], *t.get("aliases", [])]:
        k = re.sub(r"\s*\(.*\)$", "", n.lower().replace("’", "'")).strip()
        k = re.sub(r"^the ", "", k)
        if len(k) >= 5 and k not in STOP and not t.get("see"):
            name_to_term.setdefault(k, t["id"])
rx = re.compile(r"\b(" + "|".join(re.escape(k) for k in sorted(name_to_term, key=len, reverse=True)) + r")\b")
DOUBT = re.compile(r"spurious|pseudo|clementine (homilies|recognitions)|recognitions of clement|homilies of clement|apostolic constitutions|longer (version|recension)|decretals|doubtful|dubious", re.I)
by_c = collections.defaultdict(lambda: collections.Counter()); samples = collections.defaultdict(lambda: collections.defaultdict(list))
for shard in sorted(glob.glob(os.path.join(DATA, "writings/*-*.json"))):
    nm = os.path.basename(shard)[:-5]
    d = json.load(open(shard, encoding="utf-8"))
    for i, row in enumerate(d["q"]):
        au = W_IX["authors"][row[0]]
        y = au.get("year")
        if not y or y < 1 or au.get("flag") == "pseudo": continue
        if DOUBT.search(d["t"][row[1]][0]): continue
        c = (y - 1) // 100 + 1
        hits = set(rx.findall(row[6].lower()))
        for h in hits:
            tid = name_to_term[h]
            by_c[tid][c] += 1
            bucket = samples[tid][c]
            if len(bucket) < 4 and not any(x[2] == row[0] for x in bucket):
                bucket.append([nm, i, row[0]])
doc = {}
for tid, cnt in by_c.items():
    doc[tid] = {"n": dict(sorted(cnt.items())), "s": {str(c): [[x[0], x[1]] for x in samples[tid][c]] for c in sorted(samples[tid])}}
print("  terms with hits", len(doc))
dump("doctrine.json", doc)
