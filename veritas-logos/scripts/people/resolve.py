"""Works out which record in each dataset is the same person, by the verses they share. Names alone can't do it: there are 30 Zechariahs."""
import collections, re


def norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())


def similar(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    if a == b or a in b or b in a:
        return True
    return a[:3] == b[:3]


def match(records, spine, names_of):
    """records and spine are dicts with a "verses" set. Returns record key -> spine key."""
    by_verse = collections.defaultdict(list)
    for k, p in spine.items():
        for c in p["verses"]:
            by_verse[c].append(k)
    out = {}
    for k, r in records.items():
        counts = collections.Counter()
        for c in r["verses"]:
            counts.update(by_verse.get(c, ()))
        best, score = None, 0
        names = names_of(r)
        for s, n in counts.most_common(60):
            sp = spine[s]
            inter = n / max(1, min(len(r["verses"]), len(sp["verses"])))
            union = n / max(1, len(r["verses"] | sp["verses"]))
            named = any(similar(x, y) for x in names for y in [sp["name"], *sp["forms"]])
            val = union + inter * 0.5 + (1 if named else 0)
            if (named and (inter >= 0.34 or n >= 3)) or inter >= 0.8 and n >= 3:
                if val > score:
                    best, score = s, val
        if best:
            out[k] = best
    return out
