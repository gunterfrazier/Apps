"""Works out which record in each dataset is the same person, by the verses they share. Names alone can't do it: there are 30 Zechariahs."""
import collections, re


def norm(s):
    return re.sub(r"[^a-z]", "", (s or "").lower())


def lev(a, b):
    if abs(len(a) - len(b)) > 2:
        return 3
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def similar(a, b):
    """Loose: the same name, one inside the other, a spelling a letter or two apart, or the same first four letters."""
    a, b = norm(a), norm(b)
    if not a or not b:
        return False
    if a == b or (min(len(a), len(b)) >= 4 and (a in b or b in a)):
        return True
    if min(len(a), len(b)) >= 5 and lev(a, b) <= 2:
        return True
    return len(a) >= 4 and len(b) >= 4 and a[:4] == b[:4]


def name_weight(primary, labels, names):
    """How well a record's names fit a candidate's. The record's own main name counts most, so a label a dataset adds
    from an identification (BibleData lists "Levi" for James son of Alphaeus) can't outweigh it."""
    P, S = norm(primary), {norm(x) for x in names if x}
    L = {norm(x) for x in labels if x} - {P}
    if P and P in S:
        return 2.5
    if P and len(P) >= 5 and any(len(s) >= 5 and lev(P, s) <= 2 for s in S):
        return 1.5
    if L & S:
        return 1.2
    if any(similar(x, y) for x in L | {P} for y in S):
        return 0.5
    return 0


def match(records, spine, names_of):
    """records and spine are dicts with a "verses" set. names_of returns the record's main name first. Returns record key -> spine key."""
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
        names = [x for x in names_of(r) if x]
        if not names:
            continue
        for s, n in counts.most_common(80):
            sp = spine[s]
            inter = n / max(1, min(len(r["verses"]), len(sp["verses"])))
            union = n / max(1, len(r["verses"] | sp["verses"]))
            w = name_weight(names[0], names[1:], [sp["name"], *sp["forms"]])
            val = union + inter * 0.5 + w
            if (w and (inter >= 0.34 or n >= 3)) or (inter >= 0.8 and n >= 3):
                if val > score:
                    best, score = s, val
        if best:
            out[k] = best
    return out
