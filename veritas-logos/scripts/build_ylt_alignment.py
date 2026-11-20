"""Compile Clear Bible's manual YLT alignments for verses matching the bundled edition."""
import argparse
from collections import defaultdict
import csv
import json
from pathlib import Path
import re
import unicodedata

DATA = Path("public/data")
WORD = re.compile(r"[^\W_]+(?:['’][^\W_]+)*")
STRONG = re.compile(r"([HG])0*(\d+)[A-Za-z]?")


def words(text):
    return WORD.findall(unicodedata.normalize("NFC", text).lower().replace("’", "'"))


def tsv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        yield from csv.DictReader(stream, delimiter="\t")


def verse_rows(alignment, source, target, bible, first_book):
    original = {}
    for row in tsv(source):
        match = STRONG.fullmatch(row.get("strongs", ""))
        original[row["id"]] = "".join(match.groups()) if match else None
    links = defaultdict(set)
    for row in json.loads(alignment.read_text(encoding="utf-8"))["records"]:
        if row["meta"].get("process") == "manual":
            strongs = {original.get(word_id) for word_id in row["source"]}
            for target_id in row["target"]:
                links[target_id].update(strongs)
    verses = defaultdict(list)
    for row in tsv(target):
        row_words = words(row["text"])
        tags = links.get(row["id"], set())
        strong = next(iter(tags)) if len(tags) == 1 else None
        verses[row["id"][:8]].extend((word, strong or "") for word in row_words)
    for key, tokens in verses.items():
        book, chapter, verse = int(key[:2]), int(key[2:5]), int(key[5:])
        if not first_book <= book < first_book + len(bible) or chapter < 1 or verse < 1:
            continue
        try:
            current = bible[book - first_book][chapter - 1][verse - 1]
        except IndexError:
            continue
        anchored = [word for word, _ in tokens]
        if anchored and anchored == words(current) and any(tag for _, tag in tokens):
            yield book, f"{chapter}:{verse}", [" ".join(anchored), " ".join(tag for _, tag in tokens)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ot", nargs=3, type=Path, metavar=("ALIGNMENT", "SOURCE", "TARGET"), required=True)
    parser.add_argument("--nt", nargs=3, type=Path, metavar=("ALIGNMENT", "SOURCE", "TARGET"), required=True)
    args = parser.parse_args()
    groups = [{} for _ in range(9)]
    for part, first, inputs in [("ot", 1, args.ot), ("nt", 40, args.nt)]:
        bible = json.loads((DATA / "bible" / f"YLT-{part}.json").read_text(encoding="utf-8"))
        result = list(verse_rows(*inputs, bible, first))
        print(f"{part.upper()}: {len(result)} matched verses")
        for book, verse, record in result:
            groups[(book - 1) // 8].setdefault(book, {})[verse] = record
    folder = DATA / "aligned"
    folder.mkdir(exist_ok=True)
    for group, records in enumerate(groups):
        (folder / f"YLT-{group}.json").write_text(json.dumps(records, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
