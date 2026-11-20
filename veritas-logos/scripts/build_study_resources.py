"""Build the shipped OpenBible atlas and Tyndale note files from local source downloads."""
import argparse
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

DATA = Path("public/data")
USFM = (
    "GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB "
    "PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL "
    "MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS "
    "1PE 2PE 1JN 2JN 3JN JUD REV"
).split()
TYNDALE = (
    "Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job "
    "Ps Pr Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jon Mic Nah Hab Zeph Hagg Zech Mal "
    "Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thes 2Thes 1Tim 2Tim Titus Phlm Heb Jas "
    "1Pet 2Pet 1Jn 2Jn 3Jn Jude Rev"
).split()
BOOK_NUMBER = {code: i for i, code in enumerate(USFM, 1)}
TY_BOOK_NUMBER = dict(zip(TYNDALE, range(1, 67)))


def write(name, data):
    path = DATA / "study" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def rows(path):
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line)


def coordinates(value):
    if not isinstance(value, str):
        return None
    try:
        lon, lat = map(float, value.split(","))
    except ValueError:
        return None
    if math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90:
        return [round(lon, 5), round(lat, 5)]
    return None


def build_places(ancient_path, modern_path, counts):
    modern = {row["id"]: row for row in rows(modern_path)}
    places = []
    for row in rows(ancient_path):
        mentions = set()
        for verse in row.get("verses", []):
            match = re.fullmatch(r"([A-Z1-3]+) (\d+):(\d+)", verse.get("usx", ""))
            if not match:
                continue
            code, chapter, number = match.groups()
            book, chapter, number = BOOK_NUMBER[code], int(chapter), int(number)
            if 0 < chapter <= len(counts[book - 1]) and 0 < number <= counts[book - 1][chapter - 1]:
                forms = verse.get("instance_types", {})
                name_count = forms.get("name", 0)
                wording = "named" if name_count and name_count == sum(forms.values()) else "varies" if name_count else "context"
                mentions.add((book, chapter, number, wording))
        if not mentions:
            continue

        candidates = {}
        for choice in row.get("identifications", []):
            for resolution in choice.get("resolutions", []):
                # A region's center or an inferred area doesn't describe a point location.
                if resolution.get("ancient_geometry") != "point" or resolution.get("lonlat_type") != "point":
                    continue
                basis = modern.get(resolution.get("modern_basis_id"))
                if not basis or basis["id"] in candidates:
                    continue
                point = coordinates(resolution.get("lonlat"))
                if point:
                    candidates[basis["id"]] = {
                        "id": basis["id"],
                        "name": basis.get("friendly_id") or basis["url_slug"],
                        "slug": basis["url_slug"],
                        "point": point,
                    }
        names = row.get("translation_name_counts") or {}
        name = max(names, key=names.get) if names else row["friendly_id"]
        places.append({
            "id": row["id"],
            "name": name,
            "slug": row["url_slug"],
            "types": row.get("types", []),
            "mentions": sorted(mentions),
            "candidates": list(candidates.values()),
        })
    write("places.json", sorted(places, key=lambda place: (place["name"].casefold(), place["id"])))
    print(f"{len(places)} biblical places indexed")


def land_rings(path):
    for feature in json.loads(path.read_text(encoding="utf-8"))["features"]:
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        for polygon in polygons:
            # Use exterior rings. Draw Natural Earth's lake outlines as a separate layer.
            yield [[round(lon, 3), round(lat, 3)] for lon, lat in polygon[0]]


def build_notes(archive_path, counts):
    with ZipFile(archive_path) as archive:
        path = next(name for name in archive.namelist() if name.endswith("/StudyNotes.xml"))
        root = ET.fromstring(archive.read(path))
    groups = [{} for _ in range(9)]
    previous = set()
    for item in root.findall("item"):
        reference = item.findtext("refs")
        match = re.fullmatch(r"([a-zA-Z0-9]+)\.(\d+)\.(\d+)(?:-(?:(\d+)\.)?(\d+))?", reference)
        if not match:
            raise ValueError(f"Unexpected Tyndale reference: {reference}")
        code, c1, v1, c2, v2 = match.groups()
        book = TY_BOOK_NUMBER[code]
        c1, v1, c2, v2 = int(c1), int(v1), int(c2 or c1), int(v2 or v1)
        # The app's verse numbering includes the final greeting in 3 John 14.
        if code == "3Jn":
            v1, v2 = min(v1, 14), min(v2, 14)
        for chapter, verse in [(c1, v1), (c2, v2)]:
            if not 0 < chapter <= len(counts[book - 1]) or not 0 < verse <= counts[book - 1][chapter - 1]:
                raise ValueError(f"Reference outside bundled verse numbering: {reference}")
        paragraphs = ["".join(node.itertext()).strip() for node in item.findall("body/p")]
        paragraphs = tuple(p for p in paragraphs if p)
        key = (reference, paragraphs)
        if not paragraphs or key in previous:
            continue
        previous.add(key)
        groups[(book - 1) // 8].setdefault(book, []).append([c1, v1, c2, v2, reference, paragraphs])
    for group, notes in enumerate(groups):
        write(f"tyndale-{group}.json", notes)
    print(f"{len(previous)} Tyndale notes indexed (release {root.attrib.get('release')})")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ancient", type=Path, required=True)
    parser.add_argument("--modern", type=Path, required=True)
    parser.add_argument("--land", type=Path, required=True)
    parser.add_argument("--lakes", type=Path, required=True)
    parser.add_argument("--tyndale", type=Path, required=True)
    args = parser.parse_args()
    counts = json.loads((DATA / "verse-counts.json").read_text(encoding="utf-8"))
    build_places(args.ancient, args.modern, counts)
    write("basemap.json", {"land": list(land_rings(args.land)), "lakes": list(land_rings(args.lakes))})
    build_notes(args.tyndale, counts)


if __name__ == "__main__":
    main()
