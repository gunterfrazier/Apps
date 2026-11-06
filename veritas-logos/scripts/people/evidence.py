"""Tests a family claim against the Bible itself.

Every person is located in a verse through the tagged Hebrew and Greek, so two people who share a name stay apart.
The levels, strongest first:
  stated    a verse says it: "C son of P", "P fathered C", "the sons of P: C", "C's mother P"
  implied   both are named in a verse that uses a family word, but its wording doesn't fix who is who
  together  both are named in one verse or chapter, with no family word
  none      the text never brings them together
"""
import re
from sources import code, nice, sid

CHILD = {"H1121", "H1247", "H1248", "H1323", "H1324", "G5207", "G2364", "G5043", "G3816"}
BEGET = {"H3205", "H3206", "G1080", "G5088"}
FATHER = {"H1", "H2", "G3962"}
MOTHER = {"H517", "H5121", "G3384"}
WIFE = {"H802", "H5389", "H6370", "H1166", "H376", "H7694", "G1135", "G435", "G3423", "G1060"}
SIBLING = {"H251", "H269", "H252", "G80", "G79"}
FAMILY = CHILD | BEGET | FATHER | MOTHER | WIFE | SIBLING


def ids(tok):
    return {f"{a}{int(b)}" for a, b in re.findall(r"([HG])0*(\d+)", tok[3])}


def is_name(tok):
    m = tok[4]
    return "Np" in m or bool(re.match(r"N-.*-[PLT]$|N-PRI", m))


def is_verb(tok):
    m = tok[4]
    if m.startswith("H") or m.startswith("A"):
        if "-" not in m:
            return any(x.startswith("V") for x in re.split(r"[/\\\\]", m[1:]))
    return m.startswith("V-")


class Evidence:
    def __init__(self, bible, people):
        self.b = bible
        self.people = people
        self.cache = {}
        self.luke = self._luke_chain()

    def toks(self, c):
        if c not in self.cache:
            self.cache[c] = [(ids(t), is_name(t), t) for t in self.b.tokens(c)]
        return self.cache[c]

    def at(self, p, c):
        if c not in p["verses"]:
            return []
        found = [i for i, (s, _, _) in enumerate(self.toks(c)) if s & p["strongs"]]
        inst = p.get("inst", {}).get(c)
        if inst and -1 not in inst:
            return [found[n] for n in sorted(inst) if n < len(found)]
        return found

    def _luke_chain(self):
        """Luke 3:23-38 gives one line of descent, name after name, joined by the Greek article alone."""
        order = []
        for v in range(23, 39):
            c = code(42, 3, v)
            for i, (s, _, _) in enumerate(self.toks(c)):
                for key, p in self.people.items():
                    if c in p["verses"] and s & p["strongs"] and (not order or order[-1][0] != key):
                        order.append((key, c, i))
        return {(order[k][0], order[k + 1][0]): order[k + 1][1] for k in range(len(order) - 1)}

    def _names_between(self, t, a, b, skip=()):
        return any(t[i][1] and i not in skip for i in range(a + 1, b))

    def stated_in_verse(self, cp, pp, c):
        """Returns how a verse states that the person at cp is a child of the person at pp, or None."""
        t = self.toks(c)
        kids = [k for k, x in enumerate(t) if x[0] & CHILD]
        begets = [k for k, x in enumerate(t) if x[0] & BEGET]
        for i in cp:
            for j in pp:
                # C son of P
                for k in kids:
                    if i < k < j and j - k <= 3 and k - i <= 5 and not self._has_pronoun(t, k) and not self._names_between(t, k, j) and not self._names_between(t, i, k):
                        return "son of"
                # The sons of P: C
                for k in kids:
                    if k < j < i and j - k <= 2 and not self._has_pronoun(t, k) and not self._names_between(t, k, j) and not self._verb_between(t, j, i):
                        if not [x for x in kids if j < x < i and any(t[n][1] for n in range(x + 1, min(x + 3, len(t))))]:
                            return "sons of"
                # P fathered C. The nearest such verb before C must have P as its nearest name.
                before = [k for k in begets if k < i]
                if before and j < before[-1] and before[-1] - j <= 8 and not self._verb_between(t, before[-1], i):
                    names = [n for n in range(0, before[-1]) if t[n][1]]
                    if names and names[-1] == j:
                        return "fathered"
                # C was born to P: the child follows the verb, both are close to it, and no one else is between them
                for b in begets:
                    if b < i and i - b <= 8 and abs(b - j) <= 8 and not self._names_between(t, min(i, j), max(i, j)) and not self._verb_between(t, min(i, j, b), max(i, j, b)):
                        return "born"
                # C his son, with P the last name before them
                for k in kids:
                    if abs(k - i) == 1 and j < min(i, k) and self._has_pronoun(t, k) and not self._names_between(t, j, min(i, k)):
                        return "his son"
                # P the father of C, or C ... his father P
                for k, x in enumerate(t):
                    if x[0] & (FATHER | MOTHER):
                        if j < k < i and k - j <= 3 and i - k <= 4 and not self._names_between(t, j, k) and not self._names_between(t, k, i):
                            return "father of"
                        if i < k < j and j - k <= 2 and not self._names_between(t, k, j) and self._has_pronoun(t, k):
                            return "his father" if x[0] & FATHER else "his mother"
                        if j < k and k - j == 1 and i < j and self._has_pronoun(t, k) and not self._names_between(t, i, j):
                            return "his father" if x[0] & FATHER else "his mother"
        return None

    def _verb_between(self, t, a, b):
        for n in range(a + 1, b):
            if t[n][0] & BEGET:
                continue
            if is_verb(t[n][2]):
                return True
        return False

    def _has_pronoun(self, t, k):
        if "Sp" in t[k][2][4]:
            return True
        return k + 1 < len(t) and "G846" in t[k + 1][0]

    def list_header(self, child, parent, c):
        """1 Chronicles 2:13-15: "Jesse fathered Eliab ... Nethanel the fourth" runs across verses that are only names."""
        t = self.toks(c)
        if any(is_verb(x[2]) and not x[0] & BEGET for x in t):
            return None
        pos = self.at(child, c)
        if not pos:
            return None
        # A list verse holds names and numbers, not other relationships.
        if any(x[0] & (WIFE | FATHER | MOTHER | SIBLING | CHILD) for x in t[: pos[0] + 2]):
            return None
        b, ch, v = c // 1000000, (c // 1000) % 1000, c % 1000
        for back in range(1, 7):
            if v - back < 1:
                return None
            h = code(b, ch, v - back)
            th = self.toks(h)
            where = self.at(parent, h)
            if where:
                # The heading's list has to run on to its end, so its last words are names.
                if not any(x[1] for x in th[-3:]):
                    return None
                for j in where:
                    for k, x in enumerate(th):
                        if x[0] & CHILD and 0 < j - k <= 2 and not self._has_pronoun(th, k) and not self._names_between(th, k, j):
                            return h
                        if x[0] & BEGET and 0 < k - j <= 3:
                            return h
                return None
            if any(is_verb(x[2]) and not x[0] & BEGET for x in th):
                return None
            if any(x[0] & (CHILD | BEGET) and any(th[n][1] for n in range(max(0, k - 3), min(len(th), k + 4))) for k, x in enumerate(th)):
                return None
        return None

    def parent(self, child, parent):
        """Returns (level, verse, how) for "parent is a parent of child"."""
        pair = (child["key"], parent["key"])
        if child.get("unnamed") or parent.get("unnamed"):
            # An unnamed person has no name to locate in the verse, so the source's reading stands as an inference.
            shared = child["verses"] & parent["verses"]
            return ("implied", min(shared), "unnamed person") if shared else ("together", min(child["verses"] | parent["verses"]), "unnamed person")
        if pair in self.luke:
            return "stated", self.luke[pair], "Luke's line"
        shared = child["verses"] & parent["verses"]
        for c in sorted(shared):
            how = self.stated_in_verse(self.at(child, c), self.at(parent, c), c)
            if how:
                reverse = self.stated_in_verse(self.at(parent, c), self.at(child, c), c)
                if reverse and how == "born" and reverse != "born":
                    continue
                return "stated", c, how
        for c in sorted(child["verses"]):
            h = self.list_header(child, parent, c)
            if h:
                return "stated", h, f"list:{c % 1000}"
        implied = [c for c in sorted(shared) if any(x[0] & (CHILD | BEGET | FATHER | MOTHER) for x in self.toks(c))]
        if implied:
            return "implied", implied[0], "family word"
        if shared:
            return "together", min(shared), "same verse"
        chap = lambda s: {c // 1000 for c in s}
        common = chap(child["verses"]) & chap(parent["verses"])
        if common:
            return "together", min(c for c in child["verses"] if c // 1000 in common), "same chapter"
        return "none", None, ""

    def spouse(self, a, b):
        shared = a["verses"] & b["verses"]
        for c in sorted(shared):
            t = self.toks(c)
            wives = [k for k, x in enumerate(t) if x[0] & WIFE]
            for i in self.at(a, c):
                for j in self.at(b, c):
                    if any(min(abs(k - i), abs(k - j)) <= 5 for k in wives):
                        return "stated", c, "spouse word"
        # "A bore a child to B" also shows a union.
        for c in sorted(shared):
            if any(x[0] & BEGET for x in self.toks(c)):
                return "implied", c, "child together"
        if shared:
            return "together", min(shared), "same verse"
        return "none", None, ""

    def sibling(self, a, b):
        shared = a["verses"] & b["verses"]
        for c in sorted(shared):
            t = self.toks(c)
            sib = [k for k, x in enumerate(t) if x[0] & SIBLING]
            for i in self.at(a, c):
                for j in self.at(b, c):
                    if any(min(abs(k - i), abs(k - j)) <= 4 for k in sib):
                        return "stated", c, "sibling word"
        if shared:
            return "together", min(shared), "same verse"
        return "none", None, ""


def english_confirms(bible, child, parent, c):
    """A second reading, from the English of two translations: does the verse put these two people in this relationship?"""
    forms = lambda p: "|".join(sorted({re.escape(x) for x in [p["name"], *p["forms"]] if x and x[0].isupper()}, key=len, reverse=True)) or "$^"
    C, P = forms(child), forms(parent)
    pats = [
        rf"\b(?:{C})\b[^.;]{{0,60}}\b(?:son|daughter|sons|daughters|children|child|offspring|firstborn|descendants?)\b[^.;]{{0,12}}\b(?:of\s+)?(?:{P})\b",
        rf"\b(?:{P})(?:’s|'s)?\b[^.;]{{0,80}}\b(?:father of|fathered|begat|bore|mother of|gave birth|had|son|sons|daughter|daughters)\b[^.]{{0,120}}\b(?:{C})\b",
        rf"\b(?:sons?|daughters?|children|descendants)\s+of\s+(?:{P})\b[^.]{{0,200}}\b(?:{C})\b",
        rf"\b(?:{C})\b[^.;]{{0,30}}\bhis (?:son|father|mother)\b",
    ]
    for t in ("BSB", "KJV"):
        text = bible.verse(c, t)
        if any(re.search(x, text) for x in pats):
            return True
    return False
