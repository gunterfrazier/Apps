"""Extract BSB headings from the publisher's USJ download at berean.bible/downloads.htm.

Run from veritas-logos: python3 scripts/build_reader_headings.py path/to/bsb_usj.zip
"""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

BOOKS = (
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB "
    "PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL "
    "MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS "
    "1PE 2PE 1JN 2JN 3JN JUD REV"
).split()


def markers(nodes):
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if node.get("marker") in {"c", "v", "s1", "s2", "s3", "s4"}:
            yield node
        else:
            yield from markers(node.get("content", []))


def headings(book):
    chapter = 0
    pending = []
    result = {}
    for node in markers(book["content"]):
        marker = node["marker"]
        if marker == "c":
            chapter = int(node["number"])
        elif marker == "v" and pending:
            verse = int(node["number"].split("-", 1)[0])
            result.setdefault(chapter, {}).setdefault(verse, []).extend(pending)
            pending = []
        elif marker.startswith("s"):
            pending.append("".join(node["content"]).strip())
    if pending:
        raise ValueError(f"Unanchored heading after chapter {chapter}: {pending}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    with ZipFile(args.archive) as source:
        paths = {Path(name).stem: name for name in source.namelist() if name.endswith(".usj")}
        all_headings = [headings(json.loads(source.read(paths[book]))) for book in BOOKS]
    output = Path("public/data/bible/BSB-headings.json")
    output.write_text("[\n" + ",\n".join(json.dumps(book, ensure_ascii=False, separators=(",", ":")) for book in all_headings) + "\n]\n", encoding="utf-8")


if __name__ == "__main__":
    main()
