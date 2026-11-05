#!/usr/bin/env python3
"""Works out which Greek words usually render which Hebrew words, from data the app already holds.

For each Greek word in the New Testament, it finds the verses of the Septuagint (Swete) that use it, then
compares them with the verses of the tagged Hebrew. A pair that shares many verses is a likely rendering.
Nothing is written by hand. Psalms and Jeremiah are left out of the counts because their Greek numbering differs.

Writes scholar/echo-bridge.json:
  b: id -> [[other id, Dice score x 100, shared verses], ...]
  s: Greek id -> common stem of its forms (empty if the forms share none long enough)
  f: Greek id -> its forms, kept only where the stem is too short to match safely
"""
import argparse, collections, json, os, re, unicodedata

ap = argparse.ArgumentParser()
ap.add_argument("--out", default="public/data")
ap.add_argument("--sources", default="")
args = ap.parse_args()
D = args.out

SKIP = {19, 24}
MAX_NT = 300      # A word in more New Testament verses than this says little about a link.
MAX_OT = 1200


def norm(s):
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("ς", "σ")
    return re.sub(r"[^Ͱ-Ͽ]", "", s)


def sid(x):
    m = re.match(r"([HG])0*(\d+)", x)
    return f"{m[1]}{m[2]}" if m else None


def greek_content(code):
    return code.split("-")[0] in ("N", "V", "A")


def hebrew_content(code):
    pieces = re.split(r"[/\\]", code[1:])
    return any(p[:1] in ("N", "V", "A") for p in pieces)


def words(b):
    return json.load(open(f"{D}/words/{b:02d}.json", encoding="utf-8"))


# The New Testament's forms of each Greek word.
forms = collections.defaultdict(set)
nt_df = collections.Counter()
for b in range(40, 67):
    for ch in words(b):
        for v in ch:
            seen = set()
            for t in v or []:
                i = sid(t[3])
                if i and greek_content(t[4]):
                    forms[i].add(norm(t[0]))
                    seen.add(i)
            nt_df.update(seen)

lemmas = {}
lex_dir = f"{D}/lex"
for name in os.listdir(lex_dir):
    if name.startswith("G") and name.endswith(".json"):
        for k, e in json.load(open(f"{lex_dir}/{name}", encoding="utf-8")).items():
            if e.get("l"):
                lemmas[k] = norm(e["l"])


def common_prefix(items):
    items = sorted(i for i in items if i)
    if not items:
        return ""
    a, b = items[0], items[-1]
    n = 0
    while n < len(a) and n < len(b) and a[n] == b[n]:
        n += 1
    return a[:n]


stems, short = {}, {}
for i, fs in forms.items():
    if nt_df[i] > MAX_NT:
        continue
    all_forms = set(fs)
    if i in lemmas:
        all_forms.add(lemmas[i])
    p = common_prefix(all_forms)
    if len(p) >= 4:
        stems[i] = p
    else:
        # A short stem can't be matched safely on its own, so only its forms count. The New Testament
        # doesn't use every form, so the regular endings are added for ordinary nouns.
        lemma = lemmas.get(i, "")
        extra = set()
        if len(p) == 3 and lemma.endswith(("οσ", "ον")):
            extra = {p + e for e in ("οσ", "ου", "ω", "ον", "οι", "ων", "οισ", "ουσ", "ε", "α")}
        elif len(p) == 3 and lemma.endswith(("α", "η")):
            extra = {p + e for e in ("α", "ασ", "αν", "αι", "ων", "αισ", "η", "ησ", "ην")}
        stems[i] = ""
        short[i] = sorted(all_forms | extra)

by_stem = collections.defaultdict(list)
for i, p in stems.items():
    if p:
        by_stem[p].append(i)
by_form = collections.defaultdict(list)
for i, fs in short.items():
    for f in fs:
        by_form[f].append(i)
lengths = sorted({len(p) for p in by_stem})


def token_ids(tok):
    out = set(by_form.get(tok, ()))
    for n in lengths:
        if n > len(tok):
            break
        if len(tok) - n <= 6:
            out.update(by_stem.get(tok[:n], ()))
    return out


# The Septuagint and the tagged Hebrew, verse by verse.
lxx = {}
for g in ("law", "history", "wisdom", "prophets"):
    lxx.update(json.load(open(f"{D}/scholar/lxx-{g}.json", encoding="utf-8")))

g_verses = collections.defaultdict(set)
h_verses = collections.defaultdict(set)
cache = {}
for b, chapters in lxx.items():
    bn = int(b)
    if bn in SKIP or bn > 39:
        continue
    heb = words(bn)
    for c, verses in chapters.items():
        if not c.isdigit():
            continue
        ci = int(c) - 1
        if ci >= len(heb):
            continue
        for v, text in verses.items():
            if not v.isdigit():
                continue
            vi = int(v) - 1
            if vi >= len(heb[ci]) or not heb[ci][vi]:
                continue
            key = (bn, ci, vi)
            for raw in text.split():
                tok = norm(raw)
                if len(tok) < 3:
                    continue
                if tok not in cache:
                    cache[tok] = token_ids(tok)
                for i in cache[tok]:
                    g_verses[i].add(key)
            for t in heb[ci][vi]:
                i = sid(t[3])
                if i and hebrew_content(t[4]):
                    h_verses[i].add(key)

h_verses = {k: v for k, v in h_verses.items() if len(v) <= MAX_OT}
inverted = collections.defaultdict(set)
for h, vs in h_verses.items():
    for k in vs:
        inverted[k].add(h)

bridge = collections.defaultdict(list)
for g, gv in g_verses.items():
    shared = collections.Counter()
    for k in gv:
        shared.update(inverted.get(k, ()))
    rows = []
    for h, n in shared.items():
        dice = 2 * n / (len(gv) + len(h_verses[h]))
        if (n >= 3 and dice >= 0.1) or (n >= 2 and dice >= 0.4):
            rows.append((h, round(dice * 100), n))
    rows.sort(key=lambda r: -r[1])
    for h, d, n in rows[:4]:
        bridge[g].append([h, d, n])
        bridge[h].append([g, d, n])
for k in bridge:
    bridge[k] = sorted(bridge[k], key=lambda r: -r[1])[:4]

keep_g = {k for k in bridge if k.startswith("G")} | set(stems)
out = {
    "b": bridge,
    "s": {k: v for k, v in stems.items() if k in keep_g and v},
    "f": {k: v for k, v in short.items() if k in keep_g},
}
path = f"{D}/scholar/echo-bridge.json"
with open(path, "w", encoding="utf-8") as fh:
    json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
print(f"echo-bridge: {len(bridge)} words linked, {os.path.getsize(path)//1024} KB")
