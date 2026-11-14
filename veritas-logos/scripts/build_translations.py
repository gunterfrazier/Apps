"""Adds more freely licensed English Bibles to the reader, from scrollmapper/bible_databases.

    python3 -I scripts/build_translations.py --sources ../sources/sc/formats/json --out public/data

Each Bible is written as bible/<ID>-ot.json and bible/<ID>-nt.json in the same shape as the five core translations:
[book][chapter][verse] text, numbered as the app numbers verses (data/verse-counts.json, the English numbering of the
BSB and KJV).

Most of these Bibles already number their verses that way. Three don't: the JPS Tanakh follows the Hebrew Bible
(a psalm's title is its verse 1, Malachi has three chapters), and the Douay-Rheims, the Catholic Public Domain
Version and Wycliffe follow the Latin Vulgate (Psalms 9 and 10 are one psalm, so most psalms are one number lower).
For any book whose chapters and verses don't line up with the app's, this lines the verses up with the KJV (or the
ASV, for the JPS) by their wording: a monotonic alignment that may join two verses or split one, scored by shared
words. Verses with no counterpart in the app's numbering, such as the Greek additions to Daniel and Esther, are left
out, and the books outside the 66 aren't included.

Leaves out, on purpose: Green's MKJV and LITV and the Jubilee Bible 2000 (copyrighted), and the ACV, RLT and RNKJV
(licensing statements disagree or are missing).
"""
import argparse
import json
import math
import re
from pathlib import Path

BOOKS = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "I Samuel", "II Samuel",
         "I Kings", "II Kings", "I Chronicles", "II Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
         "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
         "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark",
         "Luke", "John", "Acts", "Romans", "I Corinthians", "II Corinthians", "Galatians", "Ephesians", "Philippians",
         "Colossians", "I Thessalonians", "II Thessalonians", "I Timothy", "II Timothy", "Titus", "Philemon", "Hebrews",
         "James", "I Peter", "II Peter", "I John", "II John", "III John", "Jude", "Revelation of John"]


def restore_jps(t: str) -> str:
    """This digital JPS writes HaShem, G-d and L-rd; the 1917 edition prints the LORD, God and Lord."""
    t = t.replace("G-d", "God").replace("L-rd", "Lord")
    t = re.sub(r"\bO HaShem\b", "O LORD", t)
    t = re.sub(r"(^|[.!?:;]\s+|['\"‘“(]\s*)HaShem\b", lambda m: m.group(1) + "The LORD", t)
    return re.sub(r"\bHaShem\b", "the LORD", t)


def tidy(t: str) -> str:
    t = t.replace("¶", "").replace("`", "")
    t = re.sub(r"\[([^\]]*)\]", r"\1", t)  # Webster marks supplied words with brackets
    t = re.sub(r"</?[a-z]+>", " ", t)  # LEB's <block> and </leb> tags
    t = re.sub(r"\\[a-z]+\d*\*?", " ", t)  # USFM paragraph marks ("\p") left in Haweis
    t = re.sub(r"\s[+_](?=\s|$)|\s\*{4}$", " ", t)  # stray marks and section dividers; BBE's *** gaps stay
    return re.sub(r"\s+", " ", t).strip()


def fix_darby(t: str) -> str:
    """This copy of Darby lost the space before every word for Elohim ("ofGod", "othergods", "him,God"), and keeps
    the asterisks that point to its footnotes ("thy *word")."""
    t = re.sub(r"(?<=[A-Za-z,;:.?!)])(God|gods|god)\b", r" \1", t)
    return re.sub(r"\*(?=\w)", "", t)


def fix_anderson(t: str) -> str:
    """The last verse of Revelation carries the edition's glossary of coins and terms."""
    return t.split(" DENARIUS.")[0]


def fix_cpdv(t: str) -> str:
    """One translator's note sits inside Acts 20:7."""
    return re.sub(r"\s*The expression “first Sabbath” refers to .*$", "", t)


# id, scrollmapper file, the app's text to line verses up with, extra cleanup
SOURCES = [
    ("LEB", "LEB", "KJV", None, None),
    ("BBE", "BBE", "KJV", None, None),
    ("UKJV", "UKJV", "KJV", None, None),
    ("AKJV", "AKJV", "KJV", None, None),
    ("OEB", "OEB", "KJV", None, None),
    ("GNV", "Geneva1599", "KJV", None, None),
    ("DBY", "Darby", "KJV", fix_darby, None),
    ("WBT", "Webster", "KJV", None, None),
    ("EBR", "Rotherham", "KJV", None, None),
    ("NOY", "Noyes", "KJV", None, None),
    ("JPS", "JPS", "ASV", restore_jps, "hebrew"),
    ("DRC", "DRC", "KJV", None, "vulgate"),
    ("CPDV", "CPDV", "KJV", fix_cpdv, "vulgate"),
    ("TCNT", "Twenty", "KJV", None, None),
    ("TYN", "Tyndale", "KJV", None, None),
    ("WYC", "Wycliffe", "KJV", None, "vulgate"),
    ("ANDERSON", "Anderson", "KJV", fix_anderson, None),
    ("HAWEIS", "Haweis", "KJV", None, None),
]

STOP = set("""the and of to in that he his him they them for with unto shall will was were be is are not but which a i my me it all
from upon have had has this there their thy thee thou ye you your yea also when then what who whom by as at on or so
if no nor into out up an do did doth hath let us we our said saith say she her its these those one man men""".split())
DIVINE = {"jehovah", "yahweh", "lord", "god", "yhwh"}


def words(t: str) -> frozenset:
    out = set()
    for w in re.findall(r"[a-z]+", t.lower()):
        if w in DIVINE:
            out.add("lord")
            continue
        if w in STOP or len(w) < 3:
            continue
        for suf in ("eth", "est", "ed", "es", "s"):
            if w.endswith(suf) and len(w) - len(suf) >= 3:
                w = w[: -len(suf)]
                break
        out.add(w[:5])
    return frozenset(out)


def sim(a: frozenset, b: frozenset) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / math.sqrt(len(a) * len(b))


def align(src: list, ref: list) -> list:
    """Lines up two verse sequences. Returns, for each ref verse, the src indices that go in it."""
    n, m = len(src), len(ref)
    sw, rw = [words(t) for t in src], [words(t) for t in ref]
    band = max(60, int(0.04 * max(n, m)))
    NEG = -1e9
    best = {}
    back = {}
    best[(0, 0)] = 0.0
    # Steps: (di, dj, kind). Joining two verses or splitting one costs a little; leaving one out costs more.
    steps = [(1, 1, "11"), (2, 1, "21"), (1, 2, "12"), (3, 1, "31"), (1, 0, "skip_src"), (0, 1, "skip_ref")]
    for i in range(n + 1):
        center = i * m / max(1, n)
        lo, hi = max(0, int(center) - band), min(m, int(center) + band)
        for j in range(lo, hi + 1):
            if (i, j) == (0, 0):
                continue
            score, how = NEG, None
            for di, dj, kind in steps:
                pi, pj = i - di, j - dj
                if pi < 0 or pj < 0 or (pi, pj) not in best:
                    continue
                prev = best[(pi, pj)]
                if kind == "11":
                    s = sim(sw[pi], rw[pj])
                elif kind == "21":
                    s = sim(sw[pi] | sw[pi + 1], rw[pj]) - 0.12
                elif kind == "31":
                    s = sim(sw[pi] | sw[pi + 1] | sw[pi + 2], rw[pj]) - 0.3
                elif kind == "12":
                    s = sim(sw[pi], rw[pj] | rw[pj + 1]) - 0.12
                elif kind == "skip_src":
                    s = -0.15
                else:
                    s = -0.25
                if prev + s > score:
                    score, how = prev + s, (pi, pj, kind)
            if how:
                best[(i, j)] = score
                back[(i, j)] = how
    # Verses left over at the end, like the Greek additions closing Esther 10, are dropped at the same cost as any
    # other verse with no counterpart, so they aren't squeezed into the last verses.
    ends = [(best[(i, m)] - 0.15 * (n - i), i) for i in range(n + 1) if (i, m) in best]
    if not ends:
        raise RuntimeError("alignment failed")
    out = [[] for _ in range(m)]
    i, j = max(ends)[1], m
    while (i, j) != (0, 0):
        pi, pj, kind = back[(i, j)]
        if kind in ("11", "21", "31"):
            out[pj].extend(range(pi, i))
        elif kind == "12":
            out[pj].append(pi)
        i, j = pi, pj
    for x in out:
        x.sort()
    return out


def load_source(path: Path, fix) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    books = {}
    for b in data["books"]:
        chapters = {}
        for ch in b["chapters"]:
            vs = {}
            for v in ch["verses"]:
                t = tidy(str(v["text"]))
                if fix:
                    t = fix(t)
                if t:
                    vs[int(v["verse"])] = t
            if vs:
                chapters[int(ch["chapter"])] = vs
        if chapters:
            books[b["name"]] = chapters
    return books


def fill(target, flat_src, mapping, where) -> None:
    for k, idxs in enumerate(mapping):
        if idxs:
            c, v = where[k]
            target[c][v] = " ".join(flat_src[x] for x in idxs)


def book_whole(src, shape, ref_text) -> list:
    """Lines the whole book up, so verses can cross chapters."""
    target = [["" for _ in range(nv)] for nv in shape]
    flat_src = [src[c][v] for c in sorted(src) for v in sorted(src[c])]
    where = [(c, v) for c, nv in enumerate(shape) for v in range(nv)]
    fill(target, flat_src, align(flat_src, [ref_text(c, v) for c, v in where]), where)
    return target


def book_by_chapter(src, shape, ref_text) -> list:
    """Copies each chapter, lining up only those whose verses are split differently. Additions with no English
    counterpart, like the end of Esther 10 in the Vulgate, are dropped."""
    target = [["" for _ in range(nv)] for nv in shape]
    for c, nv in enumerate(shape):
        ch = src.get(c + 1)
        if not ch:
            continue
        if max(ch) == nv and len(ch) == nv:
            for v in range(nv):
                target[c][v] = ch.get(v + 1, "")
            continue
        flat_src = [ch[v] for v in sorted(ch)]
        fill(target, flat_src, align(flat_src, [ref_text(c, v) for v in range(nv)]), [(c, v) for v in range(nv)])
    return target


def chapter_scores(target, ref_text) -> list:
    out = []
    for c, ch in enumerate(target):
        s = [sim(words(t), words(ref_text(c, v))) for v, t in enumerate(ch) if t]
        out.append(sum(s) / len(s) if len(s) >= 3 else None)
    return out


def mean_score(target, ref_text) -> float:
    s = [sim(words(t), words(ref_text(c, v))) for c, ch in enumerate(target) for v, t in enumerate(ch) if t]
    return sum(s) / max(1, len(s))


def build(tid, file, ref_id, fix, renumbered, sources: Path, out: Path, counts, refs) -> dict:
    books = load_source(sources / f"{file}.json", fix)
    result, report = [], {"aligned": [], "verses": 0, "missing_books": 0}
    pending = []
    for bi, name in enumerate(BOOKS):
        shape = counts[bi]
        src = books.get(name)
        ref_book = refs[ref_id][bi]
        ref_text = (lambda rb: lambda c, v: rb[c][v] if c < len(rb) and v < len(rb[c]) else "")(ref_book)
        if not src:
            report["missing_books"] += 1
            result.append([["" for _ in range(nv)] for nv in shape])
            continue
        if renumbered == "hebrew" or (renumbered == "vulgate" and name == "Psalms"):
            same = len(src) == len(shape) and all(len(src.get(c + 1, {})) == nv for c, nv in enumerate(shape))
            target = book_by_chapter(src, shape, ref_text) if same else book_whole(src, shape, ref_text)
            if not same:
                report["aligned"].append(f"{name} (whole book)")
        else:
            target = book_by_chapter(src, shape, ref_text)
            pending.append((bi, name, src, shape, ref_text))
        result.append(target)
    # Some Bibles split a few chapters differently with the same verse counts (the Geneva's Job 39-41). A chapter
    # that matches the English far worse than the rest of the Bible gets its whole book lined up instead, kept
    # only if that matches better.
    scores = [s for bi, _name, _src, _shape, rt in pending for s in chapter_scores(result[bi], rt) if s is not None]
    median = sorted(scores)[len(scores) // 2] if scores else 0
    for bi, name, src, shape, ref_text in pending:
        weak = [c + 1 for c, s in enumerate(chapter_scores(result[bi], ref_text)) if s is not None and s < 0.45 * median]
        if not weak:
            continue
        whole = book_whole(src, shape, ref_text)
        before, after = mean_score(result[bi], ref_text), mean_score(whole, ref_text)
        if after > before + 0.01:
            result[bi] = whole
            report["aligned"].append(f"{name} (whole book: {before:.2f} to {after:.2f})")
    report["verses"] = sum(1 for b in result for ch in b for t in ch if t)
    (out / "bible").mkdir(parents=True, exist_ok=True)
    for part, books_part in (("ot", result[:39]), ("nt", result[39:])):
        (out / "bible" / f"{tid}-{part}.json").write_text(json.dumps(books_part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return report


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--sources", type=Path, default=Path("../sources/sc/formats/json"))
    p.add_argument("--out", type=Path, default=Path("public/data"))
    p.add_argument("--only", default="")
    a = p.parse_args()
    counts = json.loads((a.out / "verse-counts.json").read_text())
    refs = {}
    for rid in ("KJV", "ASV"):
        refs[rid] = json.loads((a.out / "bible" / f"{rid}-ot.json").read_text()) + json.loads((a.out / "bible" / f"{rid}-nt.json").read_text())
    for tid, file, ref_id, fix, renumbered in SOURCES:
        if a.only and tid not in a.only.split(","):
            continue
        r = build(tid, file, ref_id, fix, renumbered, a.sources, a.out, counts, refs)
        print(f"{tid}: {r['verses']} verses, {r['missing_books']} books absent; whole books lined up by wording: {'; '.join(r['aligned']) or 'none'}")


if __name__ == "__main__":
    main()
