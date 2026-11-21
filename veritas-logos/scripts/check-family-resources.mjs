import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const reportPath = new URL("../family-resource-register.json", import.meta.url);
const run = promisify(execFile);
const checkedOn = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
}).format();
const { outputFiles } = await build({
  stdin: {
    contents: `
      export { FAMILY_STORIES } from "./src/core/family-stories";
      export { AGE_GROUPS } from "./src/core/family";
      export { FAMILY_HOME_RESOURCES, getFamilyResources } from "./src/core/family-resources";
      export { FAMILY_VIDEO_CHANNELS, familyStoryVideos, familyVideoUrl } from "./src/core/family-videos";
    `,
    resolveDir: appRoot,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { FAMILY_STORIES, AGE_GROUPS, FAMILY_HOME_RESOURCES, getFamilyResources,
  FAMILY_VIDEO_CHANNELS, familyStoryVideos, familyVideoUrl } =
  await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`);

const publisherTerms = {
  BibleProject: "https://bibleproject.com/terms/",
  "Life.Church": "https://open.life.church/legal",
  "Fresh Life Church": "https://open.life.church/legal",
  "Life, Hope & Truth": "https://lifehopeandtruth.com/visitor-agreement/",
  "Purple Curriculum": "https://www.purplecurriculum.com/faq",
  Sermons4Kids: "https://sermons4kids.com/terms",
  "Trueway Kids": "https://truewaykids.com/trueway-kids-resource-use-and-permissions/",
};

const items = new Map();
function add(url, use) {
  if (new URL(url).protocol !== "https:") throw new Error(`Expected an HTTPS resource link: ${url}`);
  if (!items.has(url)) items.set(url, { url, useInApp: "External link only", uses: [] });
  const entry = items.get(url);
  const terms = publisherTerms[use.provider];
  if (terms) entry.publisherTerms = terms;
  if (!entry.uses.some((existing) => JSON.stringify(existing) === JSON.stringify(use))) entry.uses.push(use);
}

for (const story of FAMILY_STORIES) {
  const ages = AGE_GROUPS.filter(({ id }) => story.editions[id]);
  const storyDetails = { story: story.id, storyScripture: story.reference };
  for (const age of ages) {
    for (const resource of getFamilyResources(story.id, age.id, true)) {
      add(resource.url, {
        ...storyDetails, title: resource.title, provider: resource.provider, format: resource.format,
        ages: resource.audience.filter((id) => ages.some((group) => group.id === id)),
        ...(resource.detail ? { detail: resource.detail } : {}),
        ...(resource.adultOnly ? { parentOnly: true } : {}),
      });
    }
  }
  for (const video of familyStoryVideos(story.id)) {
    add(familyVideoUrl(video), {
      ...storyDetails, title: video.title, provider: video.creator, format: video.format,
      ages: ages.map(({ id }) => id),
    });
  }
}

for (const resource of FAMILY_HOME_RESOURCES) {
  add(resource.url, { title: resource.title, provider: resource.provider, format: "Family resource directory" });
}
for (const channel of FAMILY_VIDEO_CHANNELS) {
  add(channel.url, { title: channel.name, provider: channel.name, format: "Video channel or playlist" });
}

const previous = await readFile(reportPath, "utf8")
  .then((json) => new Map(JSON.parse(json).links.map((entry) => [entry.url, entry])))
  .catch((error) => { if (error.code === "ENOENT") return new Map(); throw error; });

async function check(url) {
  const args = ["--silent", "--show-error", "--location", "--max-redirs", "5", "--max-time", "12",
    "--proto", "=https", "--proto-redir", "=https", "--range", "0-0", "--output", "/dev/null",
    "--write-out", "%{http_code} %{http_connect}", "--", url];
  const output = await run("curl", args).then(
    ({ stdout }) => stdout,
    (error) => { if (error.code === "ENOENT") throw error; return error.stdout ?? ""; },
  );
  const [http, proxy] = output.trim().split(" ").map(Number);
  const status = http >= 200 && http < 300 ? "reachable"
    : [401, 403, 429, 451].includes(http) || [401, 403, 407, 429, 451].includes(proxy) ? "blocked"
      : [404, 410].includes(http) ? "not-found" : "inconclusive";
  return { checkedOn, status, ...(http ? { httpStatus: http } : {}), ...(!http && proxy ? { proxyStatus: proxy } : {}) };
}

const links = [...items.values()].sort((a, b) => a.url.localeCompare(b.url));
let cursor = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (cursor < links.length) {
    const item = links[cursor++];
    item.lastCheck = await check(item.url);
    if (item.lastCheck.status === "reachable") item.lastReachableOn = checkedOn;
    else if (previous.get(item.url)?.lastReachableOn) item.lastReachableOn = previous.get(item.url).lastReachableOn;
  }
}));

const output = {
  scope: "Publisher resources and videos in the Family Library, including parent-only links and family directories.",
  rights: "Veritas Logos links to the publisher. Any reproduction or adaptation requires separate rights review.",
  checkMethod: "Public HTTPS response check. Reachable means the URL responded successfully. Playback, download access, and content review are separate checks.",
};
const json = JSON.stringify(output, null, 2).replace(/\n}$/, ',\n  "links": [\n'
  + links.map((item) => "    " + JSON.stringify(item)).join(",\n") + "\n  ]\n}\n");
const tempPath = new URL(`../family-resource-register.${randomUUID()}.tmp`, import.meta.url);
await writeFile(tempPath, json);
await rename(tempPath, reportPath);
const counts = Object.groupBy(links, (entry) => entry.lastCheck.status);
console.log(`Checked ${links.length} Family Library links on ${checkedOn}.`);
for (const [status, entries] of Object.entries(counts)) console.log(`${status}: ${entries.length}`);
