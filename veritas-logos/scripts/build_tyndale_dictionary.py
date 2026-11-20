"""Build text-only dictionary shards from Tyndale Open Bible Dictionary's publisher ZIP."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from build_study_resources import DATA, TYNDALE

SLUG = re.compile(r"[^a-z0-9]+")
VERSE = re.compile(r"(\d+)[a-z]?(?:-(?:(\d+)\.)?(\d+)[a-z]?)?", re.I)
SHARD_SIZE = 100


def clean(text):
    return re.sub(r"\s+", " ", text)


def title(text):
    return clean(text.replace("*", "")).strip()


def bible_reference(value, books, counts):
    source, dot, remainder = value.partition(".")
    if not dot or source not in books:
        return ""
    name, index = books[source]
    chapter_string, dot, verses = remainder.partition(".")
    if not chapter_string.isascii() or not chapter_string.isdigit():
        chapters = re.fullmatch(r"(\d+)-(\d+)", chapter_string)
        if not dot and chapters and 1 <= int(chapters[1]) <= int(chapters[2]) <= len(counts[index]):
            return f"{name} {chapter_string}"
        return ""
    chapter = int(chapter_string)
    if not 1 <= chapter <= len(counts[index]):
        return ""
    if not dot:
        return f"{name} {chapter}"
    parts = []
    for fragment in verses.split(","):
        match = VERSE.fullmatch(fragment.strip())
        if not match:
            return ""
        start = int(match[1])
        end_chapter = int(match[2] or chapter)
        end = int(match[3] or start)
        # This edition combines the closing greeting of 3 John with verse 14.
        if source == "3Jn":
            start = 14 if start == 15 else start
            end = 14 if end == 15 else end
        if not (chapter <= end_chapter <= len(counts[index]) and 1 <= start <= counts[index][chapter - 1]
                and 1 <= end <= counts[index][end_chapter - 1] and (chapter, start) <= (end_chapter, end)):
            return ""
        suffix = f"-{end_chapter}:{end}" if chapter != end_chapter else f"-{end}" if start != end else ""
        parts.append(f"{name} {chapter}:{start}{suffix}")
    return "; ".join(parts)


def item_target(value):
    return value.split("_Article_TyndaleOpenBibleDictionary", 1)[0]


def link(href, ids, books, counts):
    parts = urlsplit(href)
    if parts.scheme or parts.netloc or parts.path:
        return []
    query = parse_qs(parts.query)
    if value := query.get("item"):
        if target := ids.get(item_target(value[0])):
            return ["article", target]
    if value := query.get("bref"):
        if target := bible_reference(value[0], books, counts):
            return ["scripture", target]
    if parts.fragment and re.fullmatch(r"[a-zA-Z0-9_-]+", parts.fragment):
        return ["section", parts.fragment]
    return []


def paragraph(element, ids, books, counts):
    runs = []

    def append(text, action=()):
        if not text:
            return
        if not action and runs and len(runs[-1]) == 1:
            runs[-1][0] += clean(text)
        else:
            runs.append([clean(text), *action])

    def visit(node):
        append(node.text)
        for child in node:
            if child.tag == "a" and child.get("href"):
                append("".join(child.itertext()), link(child.get("href"), ids, books, counts))
            else:
                visit(child)
            append(child.tail)

    visit(element)
    return runs


def place_matches():
    indexed = defaultdict(list)
    for entry in json.loads((DATA / "study" / "places.json").read_text(encoding="utf-8")):
        indexed[SLUG.sub("", entry["name"].lower())].append(entry)
    return {name: rows[0]["mentions"] for name, rows in indexed.items() if len(rows) == 1}


def linked_place(mentions, blocks, names):
    for _, _, runs in blocks:
        for run in runs:
            if len(run) != 3 or run[1] != "scripture":
                continue
            for reference in run[2].split("; "):
                book_name, numbers = reference.rsplit(" ", 1)
                if ":" not in numbers:
                    chapter, _, last = numbers.partition("-")
                    first, end = int(chapter) * 1000, int(last or chapter) * 1000 + 999
                else:
                    start, _, last = numbers.partition("-")
                    chapter, verse = map(int, start.split(":"))
                    if ":" in last:
                        end_chapter, end_verse = map(int, last.split(":"))
                    else:
                        end_chapter, end_verse = chapter, int(last or verse)
                    first, end = chapter * 1000 + verse, end_chapter * 1000 + end_verse
                for book, chapter, verse, _ in mentions:
                    if names[book] == book_name and first <= chapter * 1000 + verse <= end:
                        return [book, chapter, verse]
    return None


def write(folder, name, content):
    (folder / f"{name}.json").write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def build(archive, folder):
    books = {code: (book["name"], i) for i, (code, book) in enumerate(zip(
        TYNDALE, json.loads((DATA / "books.json").read_text(encoding="utf-8")), strict=True))}
    books.update({alias: books[official] for alias, official in {"Esther": "Esth", "Jos": "Josh", "Mt": "Matt"}.items()})
    names = {i + 1: name for name, i in books.values()}
    counts = json.loads((DATA / "verse-counts.json").read_text(encoding="utf-8"))
    with ZipFile(archive) as source:
        files = (name for name in source.namelist() if name.startswith("Articles/") and name.endswith(".xml"))
        roots = [ET.fromstring(source.read(name)) for name in files]
    articles = [entry for root in roots for entry in root if entry.get("typename") == "Article"]
    articles.sort(key=lambda entry: (title(entry.findtext("title")).casefold(), entry.get("name")))
    ids = {entry.get("name"): SLUG.sub("-", entry.get("name").lower()).strip("-") for entry in articles}
    if len(set(ids.values())) != len(articles):
        raise ValueError("The dictionary contains duplicate or colliding article IDs.")
    aliases = defaultdict(set)
    for root in roots:
        for toc in root.findall("item[@typename='DictionaryLetter']"):
            for anchor in toc.iter("a"):
                target = item_target(parse_qs(urlsplit(anchor.get("href", "")).query).get("item", [""])[0])
                if target in ids:
                    aliases[ids[target]].add(title("".join(anchor.itertext())))

    places = place_matches()
    shards = defaultdict(dict)
    results = []
    for i, entry in enumerate(articles):
        heading = title(entry.findtext("title"))
        ident = ids[entry.get("name")]
        shard = i // SHARD_SIZE
        blocks = []
        for p in entry.findall("body/p"):
            style = p.get("class", "")
            if style == "h1":
                continue
            runs = paragraph(p, ids, books, counts)
            if not "".join(run[0] for run in runs).strip():
                continue
            section = p.find("a[@name]")
            anchor = section.get("name") if section is not None else p.get("id", "")
            blocks.append([style.startswith(("h2", "h3", "h4", "h5")), anchor, runs])
        # Publisher redirect articles are also searchable aliases of each named destination.
        if len(blocks) == 1 and re.match(r"^see\s+(?!also\b)", "".join(run[0] for run in blocks[0][2]).strip(), re.I):
            for run in blocks[0][2]:
                if len(run) == 3 and run[1] == "article":
                    aliases[run[2]].add(heading)
        if not blocks:
            continue
        shards[shard][ident] = blocks
        mentions = places.get(SLUG.sub("", heading.lower()))
        place = linked_place(mentions, blocks, names) if mentions else None
        results.append((ident, heading, shard, place))
    index = [[ident, heading, shard, sorted(a for a in aliases[ident] if a and a.casefold() != heading.casefold()), place]
             for ident, heading, shard, place in results]
    folder.mkdir(parents=True, exist_ok=True)
    for shard, entries in shards.items():
        write(folder, str(shard), entries)
    write(folder, "index", index)
    print(f"{len(index)} articles, {sum(bool(row[3]) for row in index)} with aliases, {sum(bool(row[4]) for row in index)} map links")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    build(args.archive, DATA / "tyndale-dictionary")
