#!/usr/bin/env python3
"""Writes the people database out for each app: Veritas Logos's data folder and, if given, the BibliaTree mobile app."""
import argparse, collections, json, os, re, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "people"))
from sources import nice

ap = argparse.ArgumentParser()
ap.add_argument("--people", required=True)
ap.add_argument("--data", default="public/data")
ap.add_argument("--mobile", default="")
args = ap.parse_args()
d = json.load(open(f"{args.people}/people.json", encoding="utf-8"))
P, aliases = d["people"], d["aliases"]
report = json.load(open(f"{args.people}/people-report.json", encoding="utf-8"))
ERA_ORDER = ["Creation & Flood", "Patriarchs", "Twelve Tribes", "Exodus & Levites", "Judges & Royal Roots", "United Monarchy", "Kings of Judah & Exile", "New Testament"]


def scriptures(p):
    """The verses to show first: where they first appear, what proves the family links, and where they feature most."""
    out, seen = [], set()
    def add(ref, note):
        if ref and ref not in seen:
            seen.add(ref)
            out.append({"ref": ref, "note": note})
    if p["verses"]:
        add(nice(p["verses"][0]), "First named")
    for x in p["parents"]:
        if x.get("ref") and x["level"] == "stated":
            add(x["ref"], f"Parent: {P[x['key']]['name']}")
    for f in p["facts"]:
        add(f["ref"], f["text"])
    chap = collections.Counter(c // 1000 for c in p["verses"])
    for ch, n in sorted(chap.most_common(8), key=lambda kv: kv[0]):
        if n >= 2:
            from sources import NAMES
            add(f"{NAMES[ch // 1000 - 1]} {ch % 1000}", f"Named in {n} verses")
    return out


def facts_text(p):
    out = []
    for f in p["facts"]:
        out.append(f"{f['text']} ({f['ref']})." if f["kind"] != "fathered" else f"{f['text']} ({f['ref']}).")
    return out


def link_note(x):
    if x.get("note"):
        return x["note"]
    if x["level"] == "together":
        return "Named in the same passage, but Scripture doesn't state this word for word."
    if x["level"] == "none":
        return f"Scripture doesn't state this. It comes from {', '.join(s for s in x['sources'] if s != 'Old BibliaTree')}."
    if x["level"] == "implied":
        return "Read from the wording of the verse, which doesn't fix the relationship exactly."
    return ""


def figure(p, idk):
    id_of = lambda k: P[k][idk]
    links = {}
    for x in p["parents"]:
        link = {"refs": [x["ref"]] if x.get("ref") else []}
        if x.get("kind"):
            link["kind"] = x["kind"]
        if x.get("generations"):
            link["generations"] = x["generations"]
        if x.get("via"):
            link["via"] = x["via"]
        note = link_note(x)
        if note:
            link["note"] = note
        if x.get("secondary"):
            link["tradition"] = True
        if x["level"] == "stated":
            link["explicit"] = True
        links[id_of(x["key"])] = link
    f = {
        "id": p[idk], "name": p["name"], "title": p["title"], "era": p["era"] or "New Testament", "gender": p["gender"], "messianic": bool(p["messianic"]),
        "parents": [id_of(x["key"]) for x in p["parents"]], "parentLinks": links, "spouses": [id_of(x["key"]) for x in p["spouses"]], "children": [id_of(k) for k in p["children"]], "siblings": [id_of(k) for k in p["siblings"]],
        "bio": p["bio"], "facts": facts_text(p), "scriptures": scriptures(p),
    }
    if p["alt"]:
        f["altNames"] = ", ".join(p["alt"])
    for key, val in (("tribe", p["tribe"]), ("meaning", p["meaning"]), ("lifespan", p["lifespan"]), ("am", p["am"]), ("dates", p["dates"])):
        if val:
            f[key] = val
    if p["roles"]:
        f["roles"] = p["roles"]
    if p.get("places"):
        f["places"] = p["places"]
    if p.get("associates"):
        f["associates"] = [id_of(k) for k in p["associates"]]
    if not p["parents"]:
        f["unrecordedGenealogy"] = True
    if p["unnamed"]:
        f["unnamed"] = True
    return f


order = sorted(P.values(), key=lambda p: (ERA_ORDER.index(p["era"] or "New Testament"), p["verses"][0] if p["verses"] else 0))

# ---------- Veritas Logos ----------
figures = []
for p in order:
    f = figure(p, "veritas")
    f["spouseRefs"] = {P[x["key"]]["veritas"]: x["ref"] for x in p["spouses"] if x.get("ref")}
    figures.append(f)
ids = [f["id"] for f in figures]
assert len(ids) == len(set(ids)), [i for i, n in collections.Counter(ids).items() if n > 1][:9]
D = args.data
json.dump(figures, open(f"{D}/figures.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump({k: v for k, v in aliases.items() if k != v}, open(f"{D}/person-aliases.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

verses = {}
for p in order:
    vs = sorted(set(p["verses"]))
    if vs:
        verses[p["veritas"]] = [c if i == 0 else c - vs[i - 1] for i, c in enumerate(vs)]
json.dump(verses, open(f"{D}/person-verses-all.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
by_book = collections.defaultdict(lambda: collections.defaultdict(list))
for p in order:
    for c in p["verses"]:
        by_book[c // 1000000][f"{(c // 1000) % 1000}:{c % 1000}"].append(p["veritas"])
for b in range(1, 67):
    path = f"{D}/refs/{b:02d}.json"
    r = json.load(open(path, encoding="utf-8"))
    r["p"] = by_book[b]
    json.dump(r, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
tl = json.load(open(f"{D}/timeline.json", encoding="utf-8"))
known = set(ids)
for row in tl["rows"]:
    if row.get("id") in aliases:
        row["id"] = aliases[row["id"]]
tl["rows"] = [r for r in tl["rows"] if r.get("id") in known or r.get("kind") == "period" or not r.get("id")]
json.dump(tl, open(f"{D}/timeline.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

name = lambda s: s
short = {k: report[k] for k in ("counts", "overridden", "scripture_differs", "identity", "dates_overridden", "bio_removed") if k in report}
short["secondary_count"] = len(report["secondary"])
short["secondary"] = report["secondary"]
short["unsupported"] = report["unsupported"]
json.dump(short, open(f"{D}/people-report.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("veritas", len(figures), "people;", sum(len(f["parents"]) for f in figures), "parent links;", os.path.getsize(f"{D}/figures.json") // 1024, "KB")

# ---------- BibliaTree mobile ----------
if args.mobile:
    out = [figure(p, "mobile") for p in order]
    ids = [f["id"] for f in out]
    assert len(ids) == len(set(ids)), [i for i, n in collections.Counter(ids).items() if n > 1][:9]
    json.dump(out, open(f"{args.mobile}/src/data/figures.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(d["mobile_aliases"], open(f"{args.mobile}/src/data/figure-aliases.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(short, open(f"{args.mobile}/reference/people-report.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("mobile", len(out), "people;", os.path.getsize(f"{args.mobile}/src/data/figures.json") // 1024, "KB; aliases", len(d["mobile_aliases"]))
