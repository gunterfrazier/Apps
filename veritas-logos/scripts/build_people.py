#!/usr/bin/env python3
"""Builds the people database, with the Bible as the final authority.

1. Every source's family claims are gathered: TIPNR, BibleData, Theographic, ACAI and the old BibliaTree file.
2. Each claim is tested against the tagged Hebrew and Greek text (see people/evidence.py).
3. A claim that Scripture states is kept and cites the verse, whichever source made it.
4. A claim Scripture contradicts is dropped and logged.
5. A claim Scripture doesn't address is kept only if named open sources back it, and is marked as secondary.

Writes people.json (the master record) and people-report.json (every decision worth reviewing).
"""
import argparse, collections, glob, json, os, re, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "people"))
from sources import Bible, NAMES, code, csv_rows, load_acai, load_bibledata, load_theographic, load_tipnr, nice, osis, sid
from resolve import match, similar
from evidence import Evidence, english_confirms

ap = argparse.ArgumentParser()
ap.add_argument("--sources", default="/home/claude/sources")
ap.add_argument("--data", default="public/data")
ap.add_argument("--old", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "people", "old-bibliatree-figures.json"))
ap.add_argument("--out", default="build/people")
args = ap.parse_args()
os.makedirs(args.out, exist_ok=True)
S = args.sources

bible = Bible(args.data)
all_tip = load_tipnr(glob.glob(f"{S}/STEPBible-Data/Proper Nouns/TIPNR*.txt")[0])
tip = {k: p for k, p in all_tip.items() if p["type"] in ("Male", "Female") and not re.search(r"\bgod(dess)?\b", p["desc"], re.I)}
bd, bd_rels = load_bibledata(f"{S}/bible-data")
bd = {k: p for k, p in bd.items() if k != "YHVH_1"}
th = load_theographic(f"{S}/extra3/theographic-bible-metadata")
ac = load_acai(f"{S}/extra3/ACAI")
old = json.load(open(args.old, encoding="utf-8"))  # The hand-entered file from the original app, kept as one more set of claims to test.

for p in tip.values():
    p["unnamed"] = bool(re.search(r"_of_|^(a|an|the|unnamed)_", p["name"].replace(" ", "_"), re.I)) or p["name"][:1].islower()

# Jesus is listed from Isaiah 7:14 in TIPNR. Applying Old Testament verses to him is an interpretation, so his verse list starts in the Gospels.
JESUS = "Jesus@Isa.7.14-Rev"
tip[JESUS]["verses"] = {c for c in tip[JESUS]["verses"] if c >= 40000000}

for p in bd.values():
    p["forms"] = list(p["labels"])
bd_map = match(bd, tip, lambda r: [r["name"], *r["labels"]])
th_map = match(th, tip, lambda r: [r["name"], r["also"]])
ac_map = {}
for k, a in ac.items():
    key = next((t for t in a["tipnr"] if t in tip), None)
    if key:
        ac_map[k] = key
for k, a in ac.items():
    if k not in ac_map and a["primary"] in ac_map:
        ac_map[k] = ac_map[a["primary"]]


def refs_of(text):
    """Expands simple references from the old file, such as "1 Samuel 16:1, 10–13; Isaiah 11:1", into verse codes."""
    out, book, chap = set(), None, None
    for part in re.split(r"[;,]", (text or "").replace("–", "-").replace("—", "-")):
        part = part.strip()
        m = re.match(r"^((?:[1-3] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)?)\s+(.*)$", part)
        if m:
            name = {"Psalms": "Psalm", "Song": "Song of Solomon"}.get(m[1], m[1])
            book = NAMES.index(name) + 1 if name in NAMES else None
            part = m[2]
            chap = None
        if not book:
            continue
        m = re.match(r"^(\d+):(\d+)(?:-(\d+)(?::(\d+))?)?", part)
        if m:
            chap = int(m[1])
            start = int(m[2])
            end = int(m[4]) if m[4] else int(m[3]) if m[3] else start
            if not m[4]:
                out.update(code(book, chap, v) for v in range(start, end + 1))
            continue
        m = re.match(r"^(\d+)-(\d+)$", part)
        if m:
            if chap:
                out.update(code(book, chap, v) for v in range(int(m[1]), int(m[2]) + 1))
            else:
                out.update(code(book, c, v) for c in range(int(m[1]), int(m[2]) + 1) for v in range(1, 177))
            continue
        m = re.match(r"^(\d+)$", part)
        if m:
            if chap:
                out.add(code(book, chap, int(m[1])))
            else:
                out.update(code(book, int(m[1]), v) for v in range(1, 177))
            continue
    return out


old_recs = {}
for f in old:
    vs = set()
    for s in f["scriptures"]:
        vs |= refs_of(s["ref"])
    for link in (f.get("parentLinks") or {}).values():
        for r in link.get("refs") or []:
            vs |= refs_of(r)
    old_recs[f["id"]] = {"key": f["id"], "name": re.sub(r"\b(King|Queen|Prophet|Prophetess|Apostle|High Priest|Priest|Judge|Pharaoh|Emperor)\b", "", re.sub(r"\(.*?\)", "", f["name"])).strip(), "also": f.get("altNames") or "", "verses": vs}


def old_match():
    out = {}
    by_name = collections.defaultdict(list)
    for k, p in tip.items():
        for n in {p["name"], *p["forms"]}:
            by_name[re.sub(r"[^a-z]", "", n.lower())].append(k)
    for k, r in old_recs.items():
        names = [r["name"], *re.split(r"[,/]", r["also"])]
        cands = {c for n in names for c in by_name.get(re.sub(r"[^a-z]", "", n.split(" ")[0].lower()), [])}
        cands |= {c for n in names for c in by_name.get(re.sub(r"[^a-z]", "", n.lower()), [])}
        best, score = None, 0
        for c in cands:
            n = len(r["verses"] & tip[c]["verses"])
            if n > score or (n == score and n and len(tip[c]["verses"]) > len(tip[best]["verses"])):
                best, score = c, n
        if best:
            out[k] = best
    return out


old_map = old_match()
old_map.update({"jesus": JESUS, "lots_wife": "a_wife_of_Lot@Gen.19.15-", "mary_magdalene": "Mary_Magdalene@Mat.27.56-Jhn", "mary_clopas": "Mary@Mat.27.56-Jhn", "obadiah_prophet": "Obadiah@Oba.1.1", "micah": "Micah@Jer.26.18-Mic", "habakkuk": "Habakkuk@Hab.1.1-", "jeremiah": "Jeremiah@2Ch.35.25-Mat", "herod_agrippa2": "Agrippa@Act.25.13-"})
old_map = {k: v for k, v in old_map.items() if v in tip}

report = {"counts": {}, "overridden": [], "scripture_differs": [], "secondary": [], "unsupported": [], "identity": [], "bio_removed": [], "old_changes": []}

# ---------- Gather every claim ----------
claims = collections.defaultdict(lambda: collections.defaultdict(set))  # (kind, a, b) -> source -> set of notes
def claim(kind, a, b, source, note=""):
    if a and b and a != b and a in tip and b in tip:
        claims[(kind, a, b)][source].add(note)

for k, p in tip.items():
    for par, flag in p["parents"]:
        claim("parent", k, par, "TIPNR", flag)
    for child, flag in p["offspring"]:
        claim("parent", child, k, "TIPNR", flag)
    for sp, flag in p["partners"]:
        claim("spouse", *sorted((k, sp)), "TIPNR", flag)
    for sb, flag in p["siblings"]:
        claim("sibling", *sorted((k, sb)), "TIPNR", flag)
for r in bd_rels:
    a, b = bd_map.get(r["a"]), bd_map.get(r["b"])
    t = r["type"]
    if t in ("father", "mother"):
        claim("parent", b, a, "BibleData", r["cat"])
    elif t in ("son", "daughter"):
        claim("parent", a, b, "BibleData", r["cat"])
    elif t in ("husband", "wife", "concubine", "concubinator") and a and b:
        claim("spouse", *sorted((a, b)), "BibleData", r["cat"])
    elif t in ("brother", "sister", "half-brother", "half-sister") and a and b:
        claim("sibling", *sorted((a, b)), "BibleData", r["cat"])
for k, p in th.items():
    a = th_map.get(k)
    for f in p["father"] + p["mother"]:
        claim("parent", a, th_map.get(f), "Theographic")
    for f in p["children"]:
        claim("parent", th_map.get(f), a, "Theographic")
    for f in p["partners"]:
        b = th_map.get(f)
        if a and b:
            claim("spouse", *sorted((a, b)), "Theographic")
for k, p in ac.items():
    a = ac_map.get(k)
    if p["primary"] != k:
        continue
    for f in (p["father"], p["mother"]):
        claim("parent", a, ac_map.get(f), "ACAI")
    for f in p["offspring"]:
        claim("parent", ac_map.get(f), a, "ACAI")
    for f in p["partners"]:
        b = ac_map.get(f)
        if a and b:
            claim("spouse", *sorted((a, b)), "ACAI")
for f in old:
    a = old_map.get(f["id"])
    for par in f["parents"]:
        note = "descendant" if ((f.get("parentLinks") or {}).get(par) or {}).get("kind") == "descendant" else ""
        claim("parent", a, old_map.get(par), "Old BibliaTree", note)
    for sp in f["spouses"]:
        b = old_map.get(sp)
        if a and b:
            claim("spouse", *sorted((a, b)), "Old BibliaTree")
    for sb in f.get("siblings") or []:
        b = old_map.get(sb)
        if a and b:
            claim("sibling", *sorted((a, b)), "Old BibliaTree")

# ---------- Test every claim against Scripture ----------
E = Evidence(bible, tip)
def reads_as_child(child, parent, c):
    """True only if the verse reads word for word that child is the son or daughter of parent, or parent the father of child."""
    forms = lambda p: "|".join(sorted({re.escape(x) for x in [p["name"], *p["forms"]] if x and x[0].isupper()}, key=len, reverse=True)) or "$^"
    C, P = forms(child), forms(parent)
    return any(re.search(rf"\b(?:{C}),? (?:the )?(?:son|daughter) of (?:{P})\b", bible.verse(c, t)) or re.search(rf"\b(?:{P}) (?:was )?(?:the )?(?:father of|fathered|begat) (?:{C})\b", bible.verse(c, t)) for t in ("BSB", "KJV"))


# The text can also add what every source missed. Matthew 1:8 says Joram was the father of Uzziah, skipping generations.
# This is limited to the two New Testament genealogies, whose wording is regular enough to read reliably.
def literal(child, parent, c):
    forms = lambda p: "|".join(sorted({re.escape(x) for x in [p["name"], *p["forms"]] if x and x[0].isupper()}, key=len, reverse=True)) or "$^"
    return bool(re.search(rf"\b(?:{forms(parent)}) (?:was )?(?:the )?(?:father of|fathered) (?:{forms(child)})\b", bible.verse(c)))


by_verse = collections.defaultdict(list)
for k, p in tip.items():
    if not p.get("unnamed"):
        for c in p["verses"]:
            by_verse[c].append(k)
for c in [code(40, 1, v) for v in range(2, 17)]:
    keys = by_verse.get(c, [])
    for a in keys:
        for b in keys:
            if a != b and ("parent", a, b) not in claims and E.stated_in_verse(E.at(tip[a], c), E.at(tip[b], c), c) == "fathered" and literal(tip[a], tip[b], c):
                claims[("parent", a, b)]["Bible"].add("")
for (a, b), c in E.luke.items():
    if ("parent", a, b) not in claims:
        claims[("parent", a, b)]["Bible"].add("")
report["counts_text_found"] = sum(1 for k, v in claims.items() if set(v) == {"Bible"})

tested = {}
for key in claims:
    kind, a, b = key
    tested[key] = E.parent(tip[a], tip[b]) if kind == "parent" else E.spouse(tip[a], tip[b]) if kind == "spouse" else E.sibling(tip[a], tip[b])

# 1 Kings 11:20: "the sister of Tahpenes bore Hadad a son named Genubath. Tahpenes herself weaned him." Naming Tahpenes beside the verb doesn't make her the mother.
for key in [k for k in tested if k[0] == "parent" and k[1].startswith("Genubath@") and k[2].startswith("Tahpenes@")]:
    tested[key] = ("none", None, "")
for k in tip:
    if k.startswith("Genubath@"):
        for s_ in tip:
            if s_.startswith("sister_of_Tahpenes@") and ("parent", k, s_) in tested:
                tested[("parent", k, s_)] = ("stated", code(11, 11, 20), "named")

OPEN = {"TIPNR", "BibleData", "Theographic", "ACAI"}
FIRST = {"TIPNR", "BibleData"}


def independent(src):
    """ACAI is built from TIPNR, so together they count once."""
    return len({"TIPNR" if s == "ACAI" else s for s in src} & {"TIPNR", "BibleData", "Theographic"})


def verse_label(c, how):
    """A list runs from its heading to the verse naming the child."""
    if how.startswith("list:"):
        end = int(how[5:])
        if end != c % 1000:
            return f"{nice(c)}-{end}"
    return nice(c)
stated_parents = collections.defaultdict(list)
for (kind, a, b), (lvl, c, how) in list(tested.items()):
    if kind == "parent" and lvl == "stated":
        stated_parents[a].append(b)


def label(p):
    ref = p["key"].split("@")[1]
    return f"{p['name']} ({ref})"


links = {"parent": {}, "spouse": {}, "sibling": {}}
for key, sources in claims.items():
    kind, a, b = key
    lvl, c, how = tested[key]
    src = sorted(sources)
    flags = {f for notes in sources.values() for f in notes}
    rec = {"level": lvl, "ref": verse_label(c, how) if c else None, "code": c, "how": how.split(":")[0], "sources": src}
    open_src = OPEN & set(src)
    anon = tip[a].get("unnamed") or tip[b].get("unnamed")
    if kind == "parent":
        text = f"{label(tip[b])} is a parent of {label(tip[a])}"
        if flags & {"d", "f"} and lvl != "stated":
            continue
        # An in-law isn't a parent, whatever the record's field says.
        if re.search(r"in.?law", tip[b]["name"], re.I):
            continue
        # A claim made by only one source needs the English to agree before it counts as stated.
        if lvl == "stated" and not {"TIPNR", "BibleData"} & set(src) and how != "Luke's line" and not english_confirms(bible, tip[a], tip[b], c):
            lvl = "together"
            rec["level"] = lvl
            rec["how"] = "same verse"
        if "a" in flags or "descendant" in flags:
            rec["ancestor"] = True
        reversed_ = tested.get(("parent", b, a)) or E.parent(tip[b], tip[a])
        if reversed_[0] == "stated" and lvl != "stated" and reads_as_child(tip[b], tip[a], reversed_[1]):
            report["overridden"].append({"claim": text, "sources": src, "scripture": f"Scripture has it the other way round ({nice(reversed_[1])})"})
            continue
        if lvl in ("stated", "implied"):
            links["parent"][(a, b)] = rec
            continue
        others = [x for x in stated_parents[a] if x != b and tip[x]["type"] == tip[b]["type"]]
        if others and not rec.get("ancestor"):
            who = others[0]
            luke_same = any(tip[x]["name"] == tip[a]["name"] and y == b for x, y in E.luke)
            if tip[who]["name"] == tip[b]["name"] or luke_same:
                report["identity"].append({"claim": text, "sources": src, "note": f"Scripture names {tip[who]['name']} here ({nice(tested[('parent', a, who)][1])}), and the source seems to mean another person of the same name"})
            else:
                report["overridden"].append({"claim": text, "sources": src, "scripture": f"Scripture names {tip[who]['name']} ({nice(tested[('parent', a, who)][1])})"})
            continue
        if "?" in flags:
            report["unsupported"].append({"claim": text, "sources": src, "level": lvl, "why": "The source itself marks this as uncertain"})
        elif independent(src) >= 2 or (not (tip[b]["type"] == "Female" and not anon) and lvl == "together" and FIRST & set(src)) or (anon and FIRST & set(src)):
            rec["secondary"] = True
            links["parent"][(a, b)] = rec
            report["secondary"].append({"claim": text, "sources": src, "basis": "Named in the same passage, but not stated word for word" if lvl == "together" else "Scripture doesn't name them together"})
        else:
            report["unsupported"].append({"claim": text, "sources": src, "level": lvl, "why": "Only one source, and Scripture doesn't support it"})
    elif kind == "spouse":
        text = f"{label(tip[a])} and {label(tip[b])} were married"
        if lvl in ("stated", "implied"):
            links["spouse"][(a, b)] = rec
        elif (lvl == "together" and FIRST & set(src)) or independent(src) >= 2 or (anon and FIRST & set(src)):
            rec["secondary"] = True
            links["spouse"][(a, b)] = rec
            report["secondary"].append({"claim": text, "sources": src, "basis": "Scripture doesn't state it word for word"})
        else:
            report["unsupported"].append({"claim": text, "sources": src, "level": lvl, "why": "Only one source, and Scripture doesn't support it"})
    elif lvl == "stated":
        links["sibling"][(a, b)] = rec

# Two people named as parents of one child, with the child's verse as the evidence.
for (c, p), r in list(links["parent"].items()):
    if r["level"] != "stated" or r.get("kind"):
        continue
    for (c2, q), r2 in links["parent"].items():
        pass
by_child = collections.defaultdict(list)
for (c, p), r in links["parent"].items():
    if r["level"] == "stated" and not r.get("ancestor"):
        by_child[c].append(p)
for c, ps in by_child.items():
    moms = [p for p in ps if tip[p]["type"] == "Female"]
    dads = [p for p in ps if tip[p]["type"] == "Male"]
    if len(moms) == 1 and len(dads) == 1:
        pair = tuple(sorted((moms[0], dads[0])))
        cur = links["spouse"].get(pair)
        if not cur or cur.get("secondary"):
            ref = links["parent"][(c, moms[0])]["ref"]
            links["spouse"][pair] = {"level": "implied", "ref": ref, "how": "child together", "sources": (cur or {}).get("sources", ["Bible"])}

# Matthew 13:55 and Mark 6:3 name Jesus's brothers. They aren't named beside "Jesus" in those verses, so this is read from the sentence.
for sib_key, _ in all_tip[JESUS]["siblings"]:
    if sib_key in tip:
        links["sibling"][tuple(sorted((JESUS, sib_key)))] = {"level": "stated", "ref": "Matthew 13:55", "how": "named", "sources": ["Bible", "TIPNR"]}

# Jesus: the Gospels are careful here, so the link to Joseph is marked as they mark it.
PINS = {(JESUS, k): {"kind": "legal", "note": "Matthew 1:16 calls Joseph the husband of Mary, of whom Jesus was born, and Luke 3:23 says he was \"as was supposed\" the son of Joseph."} for k in tip if k.startswith("Joseph@Mat.1.16")}
for pair, pin in PINS.items():
    if pair in links["parent"]:
        links["parent"][pair].update(pin)
    else:
        links["parent"][pair] = {"level": "stated", "ref": "Matthew 1:16", "how": "pin", "sources": ["Bible"], **pin}

# Mordecai raised Esther, and the text says so.
for k in tip:
    if k.startswith("Esther@"):
        for m in tip:
            if m.startswith("Mordecai@Est") and (k, m) in links["parent"]:
                links["parent"][(k, m)].update({"kind": "legal", "note": "Mordecai adopted Esther when her parents died (Esther 2:7). Her father was Abihail (Esther 2:15)."})

# Two children of one parent with one name usually means a source matched the wrong record. TIPNR tells such people apart person by person, so its link stands.
siblings_by_name = collections.defaultdict(list)
for (c, p) in links["parent"]:
    siblings_by_name[(p, tip[c]["name"])].append(c)
for (p, n), cs in siblings_by_name.items():
    if len(cs) < 2:
        continue
    with_tipnr = [c for c in cs if "TIPNR" in links["parent"][(c, p)]["sources"]]
    if with_tipnr:
        for c in cs:
            if c not in with_tipnr:
                report["identity"].append({"claim": f"{label(tip[p])} is a parent of {label(tip[c])}", "sources": links["parent"][(c, p)]["sources"], "note": f"Same name as {label(tip[with_tipnr[0]])}, who is the child TIPNR identifies"})
                del links["parent"][(c, p)]

# ---------- When one verse skips generations ----------
parents_of = collections.defaultdict(set)
for (c, p) in links["parent"]:
    parents_of[c].add(p)


def path_up(start, target, skip_edge):
    """The shortest line from start up to target that doesn't use the direct link."""
    queue, seen = collections.deque([(start, [])]), {start}
    while queue:
        node, path = queue.popleft()
        for par in parents_of[node]:
            if (node, par) == skip_edge:
                continue
            if links["parent"].get((node, par), {}).get("kind") == "legal" and start != node:
                pass
            if par == target:
                return path + [node]
            if par not in seen and len(path) < 90:
                seen.add(par)
                queue.append((par, path + [node]))
    return None


for (c, p), rec in links["parent"].items():
    line = path_up(c, p, (c, p))
    if line:
        rec["kind"] = rec.get("kind") if rec.get("kind") == "legal" else "descendant"
        rec["generations"] = len(line)
        rec["via"] = [tip[x]["name"] for x in reversed(line[1:])]
    elif rec.get("ancestor"):
        rec["kind"] = "descendant"

# Cycles can't be real. Remove the weakest link in any that appear.
RANK = {"stated": 3, "implied": 2, "together": 1, "none": 0}
active = {k for k, r in links["parent"].items() if r.get("kind") != "descendant"}
up = collections.defaultdict(set)
for c, p in active:
    up[c].add(p)


def find_cycle():
    color, stack = {}, []
    def visit(n):
        color[n] = 1
        stack.append(n)
        for m in list(up[n]):
            if color.get(m) == 1:
                return stack[stack.index(m):] + [m]
            if m not in color:
                r = visit(m)
                if r:
                    return r
        stack.pop()
        color[n] = 2
        return None
    sys.setrecursionlimit(20000)
    for n in list(up):
        if n not in color:
            r = visit(n)
            if r:
                return r
    return None


while True:
    cyc = find_cycle()
    if not cyc:
        break
    edges = list(zip(cyc, cyc[1:]))
    worst = min(edges, key=lambda e: (RANK[links["parent"][e]["level"]], len(links["parent"][e]["sources"])))
    report.setdefault("cycles", []).append({"people": [tip[x]["name"] for x in cyc], "removed": f"{tip[worst[1]]['name']} as parent of {tip[worst[0]]['name']}", "note": links["parent"][worst]})
    up[worst[0]].discard(worst[1])
    del links["parent"][worst]

# Where Scripture itself gives two fathers, both stay, and the difference is shown instead of being settled quietly.
direct = collections.defaultdict(list)
for (c, p), r in links["parent"].items():
    if r.get("kind") not in ("descendant", "legal") and r["level"] == "stated" and tip[p]["type"] == "Male":
        direct[c].append(p)
for c, ps in direct.items():
    # Two fathers with one name means two sources meant the same man but matched different records. Keep the better attested.
    by_name = collections.defaultdict(list)
    for p in ps:
        by_name[tip[p]["name"]].append(p)
    for name, same in by_name.items():
        if len(same) > 1:
            same.sort(key=lambda p: -len(links["parent"][(c, p)]["sources"]))
            for p in same[1:]:
                report["identity"].append({"claim": f"{label(tip[p])} is a parent of {label(tip[c])}", "sources": links["parent"][(c, p)]["sources"], "note": f"Same name as {label(tip[same[0]])}, who is better attested"})
                del links["parent"][(c, p)]
                ps.remove(p)
    if len(ps) > 1:
        note = "Scripture names more than one father here: " + "; ".join(f"{tip[p]['name']} ({links['parent'][(c, p)]['ref']})" for p in ps) + "."
        for p in ps:
            links["parent"][(c, p)]["note"] = note
        report["scripture_differs"].append({"person": label(tip[c]), "fathers": [{"name": tip[p]["name"], "ref": links["parent"][(c, p)]["ref"], "how": links["parent"][(c, p)]["how"]} for p in ps]})

json.dump({"tested": {f"{k[0]}|{k[1]}|{k[2]}": [v[0], nice(v[1]) if v[1] else None, v[2], sorted(claims[k])] for k, v in tested.items()}}, open(f"{args.out}/claims.json", "w", encoding="utf-8"), ensure_ascii=False)
report["counts"] = {
    "tipnr_people": len(tip), "bibledata_matched": f"{len(bd_map)}/{len(bd)}", "theographic_matched": f"{len(th_map)}/{len(th)}", "acai_matched": f"{len(ac_map)}/{len(ac)}", "old_matched": f"{len(old_map)}/{len(old)}",
    "old_unmatched": [k for k in old_recs if k not in old_map],
    "parent_claims": sum(1 for k in claims if k[0] == "parent"), "spouse_claims": sum(1 for k in claims if k[0] == "spouse"), "sibling_claims": sum(1 for k in claims if k[0] == "sibling"),
    "levels": {kind: collections.Counter(v[0] for k, v in tested.items() if k[0] == kind).most_common() for kind in ("parent", "spouse", "sibling")},
    "kept": {k: len(v) for k, v in links.items()},
    "overridden": len(report["overridden"]), "identity": len(report["identity"]), "secondary": len(report["secondary"]), "unsupported": len(report["unsupported"]), "scripture_differs": len(report["scripture_differs"]), "cycles": len(report.get("cycles", [])),
}
json.dump(report, open(f"{args.out}/people-report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps(report["counts"], ensure_ascii=False)[:1500])

# ---------- Build each person's record ----------
NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100}


def number(s):
    s = s.strip().lower().replace(",", "")
    if s.isdigit():
        return int(s)
    total = 0
    for w in re.split(r"[\s-]+", s):
        if w in ("and", "a"):
            continue
        if w not in NUM:
            return None
        total = total * 100 if w == "hundred" and total else total + NUM[w]
    return total or None


NUMBER = r"((?:\d[\d,]*)|(?:[a-z]+(?:[- ](?:and )?[a-z]+){0,3}))"


def text_facts(p):
    """Facts read straight from the verses that name a person, each with its verse."""
    facts = []
    if p.get("unnamed"):
        return facts
    names = sorted({x for x in [p["name"], *p["forms"]] if x and x[0].isupper()}, key=len, reverse=True)
    if not names:
        return facts
    name = "|".join(re.escape(x) for x in names)
    for c in sorted(p["verses"]):
        t = bible.verse(c)
        for sent in re.split(r"(?<=[.;])\s+", t):
            if not re.match(rf"^(?:[A-Z][a-z]+ )?(?:Now |So |And |Then )?(?:{name})\b", sent) and not re.search(rf"\b(?:{name}) (?:was|lived)\b", sent):
                continue
            m = (re.search(rf"\b(?:{name})\b[^.;]*?\blived a total of {NUMBER} years", sent)
                 or re.search(rf"\b(?:{name})\b[^.;]*?length of (?:his|her) life was {NUMBER} years", sent)
                 or (not re.search(r"\bafter\b", sent, re.I) and re.search(rf"\b(?:{name})\b lived {NUMBER} years(?! and| longer)\b", sent))
                 or re.search(rf"\b(?:{name})\b was {NUMBER} years old when (?:he|she) died", sent)
                 or re.search(rf"\b(?:{name})\b[^.;]*?\bdied at the age of {NUMBER}", sent)
                 or re.search(rf"\b(?:{name})\b[^.;]*?\bat the age of {NUMBER}\b[^.;]*\bdied", sent)
                 or re.search(rf"\b(?:{name})\b[^.;]*?\blived to the age of {NUMBER}", sent))
            if m and number(m[1]):
                facts.append({"kind": "lifespan", "years": number(m[1]), "text": f"Lived {number(m[1])} years", "ref": nice(c)})
            m = re.search(rf"\b(?:{name})\b was {NUMBER} years old when he became king", sent)
            if m and number(m[1]):
                facts.append({"kind": "accession", "years": number(m[1]), "text": f"Became king at age {number(m[1])}", "ref": nice(c)})
            m = re.search(rf"\b(?:{name})\b was {NUMBER} years old when he became the father of", sent)
            if m and number(m[1]):
                facts.append({"kind": "fathered", "years": number(m[1]), "text": sent.rstrip(".") , "ref": nice(c)})
        # "He reigned" belongs to the king named earlier in the same verse.
        m = re.search(rf"\b(?:{name})\b[^.]*?\breigned\b(?: in [A-Z][a-z]+)? {NUMBER} years", t) or re.search(rf"\b(?:{name})\b[^.]*\.\s*He reigned\b(?: in [A-Z][a-z]+)? {NUMBER} years", t)
        if m and number(m[1]) and "became king" in t:
            facts.append({"kind": "reign", "years": number(m[1]), "text": f"Reigned {number(m[1])} years", "ref": nice(c)})
    seen, out = set(), []
    for f in facts:
        key = (f["kind"], f["years"])
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def era_of(p, parents_keys):
    d = p["desc"]
    if "before the Flood" in d:
        return "Creation & Flood"
    if "the Patriarchs" in d:
        return "Twelve Tribes" if min(p["verses"], default=0) >= code(1, 29, 1) else "Patriarchs"
    if "Egypt and Wilderness" in d:
        return "Exodus & Levites"
    if "Conquest" in d or "before Israel's Monarchy" in d:
        return "Judges & Royal Roots"
    if "United Monarchy" in d:
        return "United Monarchy"
    if "Divided Monarchy" in d or "Exile and Return" in d:
        return "Kings of Judah & Exile"
    if "New Testament" in d:
        return "New Testament"
    first = min(p["verses"], default=0)
    for limit, era in ((code(1, 12, 1), "Creation & Flood"), (code(1, 29, 1), "Patriarchs"), (code(2, 1, 1), "Twelve Tribes"), (code(6, 1, 1), "Exodus & Levites"), (code(9, 1, 1), "Judges & Royal Roots"), (code(11, 12, 1), "United Monarchy"), (code(40, 1, 1), "Kings of Judah & Exile")):
        if first < limit:
            return era
    return "New Testament"


def roles_of(p):
    d = f"{p['desc']} {p['brief']}"
    out = []
    female = p["type"] == "Female"
    if re.search(r"\b(King|Queen)\b", d) and not re.search(r"\bKing's|of king|of the king", d):
        out.append("queen" if female else "king")
    if re.search(r"\b[Pp]rophet(ess)?\b", d) and not re.search(r"false prophet|prophet'?s? (son|father|wife|servant)", d, re.I):
        out.append("prophet")
    if re.search(r"\b(High )?[Pp]riest\b", d):
        out.append("priest")
    if re.search(r"\bJudge\b", p["desc"]) or re.search(r"\bjudge of Israel\b", d, re.I):
        out.append("judge")
    if re.search(r"\b[Aa]postle\b", d):
        out.append("apostle")
    if re.search(r"\b(Pharaoh|Emperor|Governor|Roman governor|[Oo]fficial|Tetrarch|Ruler)\b", d) and "king" not in out and "queen" not in out:
        out.append("ruler")
    return out


def clean_bio(p, family):
    """TIPNR's summary, with its citations in plain form. A sentence that gives this person a family Scripture doesn't support is removed."""
    text = p["article"] if len(p["verses"]) >= 4 else (p["short"] or p["article"])
    text = re.sub(r"<ref=\"([^\"]+)\">[^<]*</ref>", lambda m: nice(osis(m[1])) if osis(m[1]) else m[1], text)
    text = re.sub(r"<BR\s*/?>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text).strip()
    names = "|".join(re.escape(x) for x in {p["name"], *p["forms"]} if x and x[0].isupper()) or "$^"
    kept = []
    for para in text.split("\n\n"):
        out = []
        for sent in re.split(r"(?<=[.!?])\s+(?=[A-Z])", para):
            m = re.match(rf"^(?:{names}|He|She),?(?: also known as [^,]+,)? (?:was |is )?(?:the |a |an |one of the )?(?:[a-z]+ )?(son|daughter|wife|husband|father|mother)s? of (?:King |Queen |Prophet |Priest |the )?([A-Z][a-z]+)", sent)
            if m:
                ok = family.get({"son": "up", "daughter": "up", "wife": "spouse", "husband": "spouse", "father": "down", "mother": "down"}[m[1]], set())
                if m[2] not in ok:
                    report["bio_removed"].append({"person": label(p), "sentence": sent[:220], "why": f"Scripture's links here don't show {m[1]} of {m[2]}"})
                    continue
            out.append(sent)
        if out:
            kept.append(" ".join(out))
    return "\n\n".join(kept)


meaning = {}
for k, r in bd.items():
    t = bd_map.get(k)
    if t and r["meanings"] and t not in meaning:
        meaning[t] = r["meanings"][0]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


veritas_id, aliases = {}, {}
for k, t in sorted(bd_map.items(), key=lambda kv: (kv[1], -len(bd[kv[0]]["verses"]))):
    i = slug(k)
    if t not in veritas_id:
        veritas_id[t] = i
    aliases[i] = veritas_id[t]
veritas_id[JESUS] = "jesus-christ"
mobile_id = {t: k for k, t in sorted(old_map.items(), key=lambda kv: -len(kv[0]))}
mobile_aliases = {k: mobile_id[t] for k, t in old_map.items() if mobile_id[t] != k}


def vid(k):
    if k not in veritas_id:
        base = slug(k.split("@")[0]) or "person"
        ref = slug(k.split("@")[1].split("-")[0])
        veritas_id[k] = f"{base}-{ref}"[:58]
    return veritas_id[k]


def children_of():
    out = collections.defaultdict(list)
    for (c, p), r in links["parent"].items():
        out[p].append(c)
    return out


kids = children_of()
direct_parents = collections.defaultdict(list)
spouses_of = collections.defaultdict(list)
for (c, p), r in links["parent"].items():
    direct_parents[c].append(p)
for (a, b), r in links["spouse"].items():
    spouses_of[a].append(b)
    spouses_of[b].append(a)

# Who stands in the line to Jesus, read from the links themselves.
line = set()
queue = [JESUS]
while queue:
    n = queue.pop()
    for par in direct_parents[n]:
        if par not in line:
            line.add(par)
            queue.append(par)
line.add(JESUS)

# Lifespans on BibleData's reckoning of years, which cites a verse for each step. Where a verse gives a different total, the verse wins.
epochs = collections.defaultdict(list)
for r in csv_rows(f"{S}/bible-data/BibleData-Epoch.csv"):
    t = bd_map.get(r["person_id"])
    if t and r["epoch_type"] in ("Life", "Reign") and r["start_year_ah"]:
        epochs[t].append(r)

people = {}
for k, p in tip.items():
    up = direct_parents[k]
    ancestors, q, seen = set(), list(up), set()
    while q:
        n = q.pop()
        if n in seen:
            continue
        seen.add(n)
        ancestors |= {tip[n]["name"], *tip[n]["forms"]}
        q.extend(direct_parents[n])
    fam = {"named": True, "up": ancestors, "spouse": {x for s in spouses_of[k] for x in (tip[s]["name"], *tip[s]["forms"])}, "down": {x for c in kids[k] for x in (tip[c]["name"], *tip[c]["forms"])}}
    facts = text_facts(p)
    lifespan = next((f for f in facts if f["kind"] == "lifespan"), None)
    am, dates = None, None
    life = next((e for e in epochs[k] if e["epoch_type"] == "Life"), None)
    if life and life["end_year_ah"]:
        a, b = int(life["start_year_ah"]), int(life["end_year_ah"])
        if lifespan and b - a != lifespan["years"]:
            report.setdefault("dates_overridden", []).append({"person": label(p), "source": f"BibleData's reckoning gives {b - a} years", "scripture": f"{lifespan['ref']} gives {lifespan['years']}"})
            a2 = a - 1
            if a < 2400:
                am = {"from": a2, "to": a2 + lifespan["years"]}
        elif a < 2400:
            am = {"from": a - 1, "to": b - 1}
    # Scripture gives no BC dates, so these are one named chronology's reckoning (Floyd Nolen Jones, via Theographic).
    tk = [t for t, m in th_map.items() if m == k]
    for t in tk:
        r = th[t]
        if r["birth"] and r["death"]:
            f, to = int(r["birth"]), int(r["death"])
            if lifespan and to - f != lifespan["years"]:
                report.setdefault("dates_overridden", []).append({"person": label(p), "source": f"Theographic's dates give {to - f} years", "scripture": f"{lifespan['ref']} gives {lifespan['years']}"})
                to = f + lifespan["years"]
            dates = {"from": f, "to": to, "kind": "life", "approx": True}
            break
    gender = "female" if p["type"] == "Female" else "male"
    display = p["name"]
    if re.match(r"unnamed", display, re.I):
        display = p["brief"] or "Unnamed person"
    elif p["unnamed"]:
        display = re.sub(r"^a ", "", display, flags=re.I)
        display = display[0].upper() + display[1:]
    parents = []
    for par in up:
        r = links["parent"][(k, par)]
        item = {"key": par, "level": r["level"], "ref": r["ref"], "sources": r["sources"]}
        for f in ("kind", "generations", "via", "note", "secondary"):
            if r.get(f):
                item[f] = r[f]
        parents.append(item)
    people[k] = {
        "key": k, "veritas": vid(k), "mobile": mobile_id.get(k) or vid(k), "name": display, "unnamed": p["unnamed"], "alt": [x for x in p["forms"] if x != p["name"]],
        "title": p["brief"] or p["desc"], "gender": gender, "era": era_of(p, up), "tribe": p["tribe"], "meaning": meaning.get(k, ""), "roles": roles_of(p), "messianic": k in line,
        "bio": clean_bio(p, fam), "facts": facts, "lifespan": f"{lifespan['years']} years ({lifespan['ref']})" if lifespan else "", "am": am, "dates": dates, "parents": parents,
        "spouses": [{"key": s, "level": links["spouse"].get(tuple(sorted((k, s))), {}).get("level"), "ref": links["spouse"].get(tuple(sorted((k, s))), {}).get("ref"), "secondary": links["spouse"].get(tuple(sorted((k, s))), {}).get("secondary", False)} for s in spouses_of[k]],
        "children": kids[k], "verses": sorted(p["verses"]),
    }

# Siblings: two people who share a parent are siblings, and Scripture's explicit statements add the rest.
sib = collections.defaultdict(set)
for (a, b) in links["sibling"]:
    sib[a].add(b)
    sib[b].add(a)
for k in people:
    people[k]["siblings"] = sorted(s for s in sib[k] if not (set(direct_parents[k]) & set(direct_parents[s])))

# Places from the old file stay only where a verse naming the person also names the place.
for f in old:
    k = old_map.get(f["id"])
    if not k or not f.get("places"):
        continue
    text = " ".join(bible.verse(c) for c in tip[k]["verses"])
    people[k]["places"] = [pl for pl in f["places"] if re.search(rf"\b{re.escape(re.split(r' \(| of ', pl)[0].replace('Mount ', ''))}\b", text)]

# Who worked beside whom: BibleData's explicit links, kept when the cited verse names both.
ASSOCIATE = {"master", "servant", "rabbi", "disciple", "apostle", "ally", "lady", "friend", "advisor", "counselor", "companion", "king"}
assoc = collections.defaultdict(set)
for r in bd_rels:
    if r["type"] in ASSOCIATE and r["cat"] == "explicit" and r["ref"]:
        a, b = bd_map.get(r["a"]), bd_map.get(r["b"])
        if a and b and r["ref"] in tip[a]["verses"] and r["ref"] in tip[b]["verses"]:
            assoc[a].add(b)
            assoc[b].add(a)
for k, s_ in assoc.items():
    people[k]["associates"] = sorted(s_)

# NT figures with no birth year still have a span in Theographic's reckoning of Acts and the letters.
for t, k in th_map.items():
    r = people[k]
    if r["era"] == "New Testament" and not r["dates"] and len(r["verses"]) >= 5:
        row = next((x for x in csv_rows(f"{S}/extra3/theographic-bible-metadata/CSV/People.csv") if x["personLookup"] == t), None) if False else None

th_rows = {r["personLookup"]: r for r in csv_rows(f"{S}/extra3/theographic-bible-metadata/CSV/People.csv")}
for t, k in th_map.items():
    r = people[k]
    row = th_rows.get(t)
    if r["era"] == "New Testament" and not r["dates"] and len(r["verses"]) >= 5 and row and row["minYear"] and row["maxYear"]:
        lo, hi = int(row["minYear"]), int(row["maxYear"])
        if 25 <= lo < hi <= 100:
            r["dates"] = {"from": lo, "to": hi, "kind": "active", "approx": True}

# ---------- People only BibleData lists ----------
def pretty_refs(text):
    def fix(m):
        c = None
        from sources import _bd_ref
        c = _bd_ref(f"{m[1]} {m[2]}:{m[3]}")
        return nice(c) if c else m[0]
    return re.sub(r"\b([1-3]?[A-Z]{2,3}) (\d+):(\d+)", fix, text).replace("G-d", "God").replace("L-RD", "LORD")


SKIP_BD = re.compile(r"angel|captain of the host|YHVH", re.I)
extra_keys = {}
for k, r in bd.items():
    if k in bd_map or not r["verses"] or SKIP_BD.search(k):
        continue
    key = f"bd:{k}"
    extra_keys[k] = key
    vid_ = slug(k)
    people[key] = {"key": key, "veritas": vid_, "mobile": vid_, "name": pretty_refs(r["name"]), "unnamed": r["name"].startswith(("King of", "Firstborn", "Younger")), "alt": [x for x in r["labels"] if x != r["name"]], "title": pretty_refs(r["title"]), "gender": "female" if r["sex"] == "female" else "male", "era": "", "tribe": r["tribe"], "meaning": r["meanings"][0] if r["meanings"] else "", "roles": ["king"] if r["name"].startswith("King of") else [], "messianic": False, "bio": pretty_refs(r["notes"] or ""), "facts": [], "lifespan": "", "am": None, "dates": None, "parents": [], "spouses": [], "children": [], "verses": sorted(r["verses"]), "siblings": []}
    first = min(r["verses"])
    for limit, era in ((code(1, 12, 1), "Creation & Flood"), (code(1, 29, 1), "Patriarchs"), (code(2, 1, 1), "Twelve Tribes"), (code(6, 1, 1), "Exodus & Levites"), (code(9, 1, 1), "Judges & Royal Roots"), (code(11, 12, 1), "United Monarchy"), (code(40, 1, 1), "Kings of Judah & Exile"), (10**9, "New Testament")):
        if first < limit:
            people[key]["era"] = era
            break
for r in bd_rels:
    if r["type"] not in ("father", "mother", "son", "daughter", "husband", "wife") or r["cat"] != "explicit" or not r["ref"]:
        continue
    a = extra_keys.get(r["a"]) or bd_map.get(r["a"])
    b = extra_keys.get(r["b"]) or bd_map.get(r["b"])
    if not a or not b or not (a.startswith("bd:") or b.startswith("bd:")):
        continue
    name = lambda x, raw: bd[raw]["name"].split(" ")[0]
    text = bible.verse(r["ref"]) + bible.verse(r["ref"], "KJV")
    if not (name(a, r["a"]) in text and name(b, r["b"]) in text):
        continue
    if r["type"] in ("father", "mother", "son", "daughter"):
        parent, child = (a, b) if r["type"] in ("father", "mother") else (b, a)
        if not any(x["key"] == parent for x in people[child]["parents"]):
            people[child]["parents"].append({"key": parent, "level": "implied", "ref": nice(r["ref"]), "sources": ["BibleData"]})
            people[parent]["children"].append(child)
    elif not any(x["key"] == b for x in people[a]["spouses"]):
        people[a]["spouses"].append({"key": b, "level": "implied", "ref": nice(r["ref"]), "secondary": False})
        people[b]["spouses"].append({"key": a, "level": "implied", "ref": nice(r["ref"]), "secondary": False})

# Well-known people Scripture leaves unnamed, whom the datasets don't list. Each is read directly from the verses given.
def span(book, chapter, a, b):
    return [code(book, chapter, v) for v in range(a, b + 1)]


UNNAMED = [
    ("shunammite", "The Shunammite woman", "female", "Kings of Judah & Exile", "Woman of Shunem who hosted Elisha, and whose son he raised (2 Kings 4:8-37)", span(12, 4, 8, 37) + span(12, 8, 1, 6), None),
    ("widow-of-nain", "The widow of Nain", "female", "New Testament", "Widow whose son Jesus raised at Nain (Luke 7:11-15)", span(42, 7, 11, 15), None),
    ("daughter-of-jairus", "Daughter of Jairus", "female", "New Testament", "Twelve-year-old girl Jesus raised (Mark 5:22-43)", span(40, 9, 18, 25) + span(41, 5, 22, 43) + span(42, 8, 41, 56), "Jairus@Mrk.5.22-Luk"),
]
for sid_, name_, sex, era, title, vs, parent in UNNAMED:
    key = f"bible:{sid_}"
    people[key] = {"key": key, "veritas": sid_, "mobile": sid_, "name": name_, "unnamed": True, "alt": [], "title": title, "gender": sex, "era": era, "tribe": "", "meaning": "", "roles": [], "messianic": False, "bio": "", "facts": [], "lifespan": "", "am": None, "dates": None, "parents": [], "spouses": [], "children": [], "verses": sorted(vs), "siblings": []}
    if parent:
        match_ = parent if parent in people else next((k for k in people if k.startswith(parent.split("@")[0] + "@")), None)
        if match_:
            people[key]["parents"].append({"key": match_, "level": "stated", "ref": "Mark 5:23", "sources": ["Bible"]})
            people[match_]["children"].append(key)

report["counts"]["people_final"] = len(people)
report["counts"]["kept"] = {k: len(v) for k, v in links.items()}
report["counts"]["messianic_line"] = len(line)
report["counts"]["bio_sentences_removed"] = len(report["bio_removed"])
report["counts"]["dates_overridden"] = len(report.get("dates_overridden", []))
json.dump(report, open(f"{args.out}/people-report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump({"people": people, "aliases": aliases, "mobile_aliases": mobile_aliases}, open(f"{args.out}/people.json", "w", encoding="utf-8"), ensure_ascii=False)
print(json.dumps(report["counts"], ensure_ascii=False)[:1000])
