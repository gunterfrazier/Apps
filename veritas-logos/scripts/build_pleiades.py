"""Index Pleiades descriptions for the locations in the shipped passage map."""
import argparse
import csv
import gzip
import json
from pathlib import Path

from build_study_resources import DATA, rows, write

# Reviewed against the gazetteer title, description and coordinates. Keys are
# OpenBible modern location IDs, so namesakes and alternative sites stay distinct.
REVIEWED_LINKS = {
    "m93f901": "609307",  # Antioch in Pisidia
    "mbe432b": "658381",  # Antioch on the Orontes
    "md70ac9": "579885",  # Athens
    "m9b8daa": "687856",  # Bethlehem in Judea
    "me0518f": "570182",  # Corinth
    "m878978": "678106",  # Damascus
    "m84025e": "599612",  # Ephesus
    "m66c5b8": "687928",  # Jerusalem
    "mb3f688": "678299",  # Nazareth
    "mb083bc": "423025",  # Rome
    "mc9df1a": "648789",  # Tarsus
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("modern", type=Path, help="OpenBible modern.jsonl")
    parser.add_argument("pleiades", type=Path, help="Pleiades places CSV gzip export")
    args = parser.parse_args()

    places = json.loads((DATA / "study/places.json").read_text(encoding="utf-8"))
    candidates = {candidate["id"] for place in places for candidate in place["candidates"]}
    links = {}
    for row in rows(args.modern):
        location = row["id"]
        if location not in candidates:
            continue
        ids = [str(source["id"]) for source in row.get("secondary_sources", [])
               if source["type"] == "pleiades"]
        if location in REVIEWED_LINKS:
            ids.insert(0, REVIEWED_LINKS[location])
        if ids:
            links[location] = list(dict.fromkeys(ids))

    wanted = {record for ids in links.values() for record in ids}
    records = {}
    with gzip.open(args.pleiades, "rt", encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream):
            if row["id"] in wanted and row["title"] and row["description"]:
                records[row["id"]] = {key: row[key] for key in ("title", "description", "authors")}
    locations = {
        location: [record for record in ids if record in records]
        for location, ids in links.items()
    }
    locations = {location: ids for location, ids in sorted(locations.items()) if ids}
    write("pleiades.json", {"locations": locations, "records": dict(sorted(records.items()))})
    print(f"{len(records)} Pleiades records linked to {len(locations)} map locations")


if __name__ == "__main__":
    main()
