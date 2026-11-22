/**
 * Exports the Family Library as lesson material for other apps (Our Faithful Church App's lesson builder).
 *   node scripts/export-family-lessons.mjs
 * Writes public/family/lessons/lessons.json: every story with its three age editions, scenes, questions, quiz, craft,
 * game, videos and publisher resources, plus the people each story mentions and a small index of other Bible people
 * for search. It also cuts each story's picture, coloring page and craft picture out of the art sheets into their own
 * files (needs Python 3 with Pillow), so an app can show one without loading the whole sheet.
 * Run it again whenever stories are added; both outputs are committed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "public/family/lessons");
fs.mkdirSync(out, { recursive: true });

// Bundle the TypeScript story modules into one ES module and load it.
const entry = `
export { FAMILY_STORIES } from "./src/core/family-stories";
export { STORY_COLLECTIONS } from "./src/core/family-collections";
export { getFamilyResources } from "./src/core/family-resources";
export { familyStoryVideos, familyVideoUrl } from "./src/core/family-videos";
export { AGE_GROUPS } from "./src/core/family";
`;
const built = await esbuild.build({ stdin: { contents: entry, resolveDir: root, loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false });
const tmp = path.join(out, ".export.mjs");
fs.writeFileSync(tmp, built.outputFiles[0].text);
const lib = await import(tmp + "?" + Date.now());
fs.rmSync(tmp);

// Which picture on the art sheets belongs to which story (the same order as src/app/pages/family-art.tsx).
const artSource = fs.readFileSync(path.join(root, "src/app/pages/family-art.tsx"), "utf8");
const artIndex = Object.fromEntries([...artSource.matchAll(/^\s*"?([a-z-]+)"?: \[(\d+), "([^"]+)"\]/gm)].map((m) => [m[1], { tile: +m[2], alt: m[3] }]));

// People: every person named in a story, and the best-known people for search.
const figures = JSON.parse(fs.readFileSync(path.join(root, "public/data/figures.json"), "utf8"));
const verseCount = (f) => (f.scriptures || []).reduce((n, s) => n + (+(/Named in (\d+) verses/.exec(s.note || "")?.[1] || 1)), 0);
const known = figures.map((f) => ({ f, n: verseCount(f) })).filter((x) => x.n >= 3).sort((a, b) => b.n - a.n);
const byName = new Map();
for (const { f, n } of known) if (!byName.has(f.name)) byName.set(f.name, { f, n }); // The best-known person of each name.
const ages = lib.AGE_GROUPS.map((a) => a.id);

const stories = lib.FAMILY_STORIES.map((s) => {
  const text = [s.title, ...ages.flatMap((a) => s.editions[a]?.paragraphs || [])].join(" ");
  const people = [...byName.keys()].filter((name) => name.length > 2 && !["Mark", "Matthew", "Luke"].includes(name) && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?!\\s*\\d)`).test(text));
  const col = lib.STORY_COLLECTIONS[s.id];
  const art = artIndex[s.id];
  return {
    id: s.id, title: s.title, testament: s.testament, reference: s.reference, reading: s.reading, teenReading: s.teenReading || "",
    topic: s.topic, scenes: s.sceneTitles, drawPrompt: s.drawPrompt, activity: s.activity,
    editions: s.editions,
    craft: col?.craft ? { title: col.craft.title, minutes: col.craft.minutes, supplies: col.craft.supplies, steps: col.craft.steps, picture: `${s.id}-craft.webp`, pictureAlt: col.craft.artAlt } : null,
    game: col?.play || null,
    videos: lib.familyStoryVideos(s.id).map((v) => ({ title: v.title, url: lib.familyVideoUrl(v), creator: v.creator, format: v.format })),
    resources: Object.fromEntries(ages.map((a) => [a, lib.getFamilyResources(s.id, a, true).map(({ title, provider, format, url, detail, adultOnly }) => ({ title, provider, format, url, detail: detail || "", forTeachers: !!adultOnly }))])),
    picture: art ? { young: `${s.id}.webp`, older: `${s.id}-older.webp`, coloring: `${s.id}-coloring.webp`, alt: art.alt } : null,
    people,
  };
});

const storyPeople = new Set(stories.flatMap((s) => s.people));
const people = known.slice(0, 500).filter(({ f }) => byName.get(f.name)?.f === f).map(({ f }) => ({
  id: f.id, name: f.name, title: f.title || "",
  passages: (f.scriptures || []).filter((x) => x.ref).sort((a, b) => (+(/Named in (\d+)/.exec(b.note || "")?.[1] || 0)) - (+(/Named in (\d+)/.exec(a.note || "")?.[1] || 0))).slice(0, 3).map((x) => x.ref),
  inStories: storyPeople.has(f.name),
}));

const data = {
  source: "Veritas Logos Family Library",
  credit: "Stories, questions, games and crafts from the Veritas Logos Family Library. Outside resources link to their publishers.",
  ages: lib.AGE_GROUPS,
  stories, people,
};
fs.writeFileSync(path.join(out, "lessons.json"), JSON.stringify(data));
console.log(`lessons.json: ${stories.length} stories, ${people.length} people, ${(fs.statSync(path.join(out, "lessons.json")).size / 1024).toFixed(0)} KB`);

// Cut the pictures out of the art sheets.
const rows = Math.ceil(Object.keys(artIndex).length / 4);
const jobs = stories.filter((s) => s.picture).map((s) => ({ id: s.id, tile: artIndex[s.id].tile, craft: lib.STORY_COLLECTIONS[s.id]?.craft?.artTile ?? null }));
const py = `
import json, sys
from PIL import Image
src, out, rows, jobs = sys.argv[1], sys.argv[2], int(sys.argv[3]), json.loads(sys.argv[4])
color = Image.open(src + "/story-color.webp"); ink = Image.open(src + "/story-ink.webp"); crafts = Image.open(src + "/crafts.webp")
def tile(im, i, row_offset, size):
    w = im.width // 4; h = im.height // (rows * (2 if im is color else 1))
    x, y = (i % 4) * w, (i // 4 + row_offset) * h
    return im.crop((x, y, x + w, y + h)).resize((size, size), Image.LANCZOS)
for j in jobs:
    tile(color, j["tile"], 0, 360).save(f'{out}/{j["id"]}.webp', quality=78, method=6)
    tile(color, j["tile"], rows, 360).save(f'{out}/{j["id"]}-older.webp', quality=78, method=6)
    tile(ink, j["tile"], 0, 800).convert("L").save(f'{out}/{j["id"]}-coloring.webp', quality=82, method=6)
    if j["craft"] is not None: tile(crafts, j["craft"], 0, 360).save(f'{out}/{j["id"]}-craft.webp', quality=78, method=6)
`;
execFileSync("python3", ["-I", "-c", py, path.join(root, "public/family"), out, String(rows), JSON.stringify(jobs)], { stdio: "inherit" });
console.log(`pictures: ${fs.readdirSync(out).filter((f) => f.endsWith(".webp")).length} files`);
