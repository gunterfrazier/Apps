/**
 * Builds the site into dist/ and the API server into dist-server/.
 *   node scripts/build.mjs            full build
 *   node scripts/build.mjs --watch    rebuild the app on change and serve it at localhost:5173
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Inter:wght@400;500;600;700&family=Noto+Serif+Hebrew:wght@400;600&family=Noto+Serif:wght@400&display=swap">`;
const shell = (title, script, extraHead = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="Bible study guides, Hebrew and Greek tools, cultural and theological insights, and biblical people.">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0e1015" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
${FONTS}
<link rel="stylesheet" href="${script}.css">
${extraHead}
</head>
<body><div id="root"></div><script type="module" src="${script}.js"></script></body>
</html>
`;
fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
fs.cpSync("public", "dist", { recursive: true });
// Every data file is packed under its own name: gzip-compressed, then base64-encoded into a JSON string, because the
// host serves .json files only as text and turns away binary ones. The published app has to fit the host's 256 MB,
// and packed the data is under half its size. The app unpacks a file when it loads it (src/core/data.ts), and keeps
// reading plain JSON too, so the repo's public/data stays readable and a half-uploaded version still works.
// Fixed settings and no timestamp, so the same data always gives the same bytes.
const packAll = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { packAll(p); continue; }
    if (!p.endsWith(".json")) continue;
    const raw = fs.readFileSync(p);
    const packed = Buffer.from(JSON.stringify(zlib.gzipSync(raw, { level: 9 }).toString("base64")));
    if (packed.length >= raw.length) continue;
    if (!packed.toString().startsWith('"H4sI') || !zlib.gunzipSync(Buffer.from(JSON.parse(packed.toString()), "base64")).equals(raw))
      throw new Error(`${p} doesn't unpack to its original bytes`);
    fs.writeFileSync(p, packed);
  }
};
if (!watch) packAll("dist/data");

// The host holds at most 512 files per version, so folders of small per-book files go out as one packed file each,
// "<folder>.bundle.json", an object keyed by file name. src/core/data.ts reads a bundle where there is one and the
// separate files where there isn't (public/data). Keep this list the same as BUNDLED_DIRS there.
const BUNDLED_DIRS = ["links", "xref"];
const bundleDir = (dir) => {
  const src = path.join("public/data", dir);
  const files = fs.readdirSync(src).filter((f) => f.endsWith(".json")).sort();
  const all = Object.fromEntries(files.map((f) => [f, JSON.parse(fs.readFileSync(path.join(src, f), "utf8"))]));
  const raw = Buffer.from(JSON.stringify(all));
  const packed = Buffer.from(JSON.stringify(zlib.gzipSync(raw, { level: 9 }).toString("base64")));
  const back = JSON.parse(zlib.gunzipSync(Buffer.from(JSON.parse(packed.toString()), "base64")).toString());
  for (const f of files) {
    if (JSON.stringify(back[f]) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(src, f), "utf8")))) throw new Error(`${dir}/${f} doesn't come back from its bundle`);
  }
  fs.rmSync(path.join("dist/data", dir), { recursive: true, force: true });
  fs.writeFileSync(path.join("dist/data", `${dir}.bundle.json`), packed);
};
if (!watch) BUNDLED_DIRS.forEach(bundleDir);

// The built-in read-aloud voice, for browsers without a speech engine (Android's in-app viewer). It's stored in
// public/voice as one compact binary file (scripts/build_voice.py), which the host would turn away, so it's split
// into pieces packed the same way as the data files, each well under the host's 16 MB limit for a text file.
// ONNX Runtime's engine is a .wasm file, which the host serves as it is. src/voice/model.ts reverses the packing.
const VOICE = "norman";
const MAX_RAW_PIECE = 10_800_000;
const packVoice = () => {
  const manifest = JSON.parse(fs.readFileSync(`public/voice/${VOICE}.json`, "utf8"));
  const raw = fs.readFileSync(`public/voice/${VOICE}.bin`);
  fs.rmSync(`dist/voice/${VOICE}.bin`);
  const pieces = [];
  const step = Math.ceil(raw.length / Math.ceil(raw.length / MAX_RAW_PIECE));
  for (let at = 0, n = 1; at < raw.length; at += step, n++) {
    const part = raw.subarray(at, at + step);
    const packed = Buffer.from(JSON.stringify(zlib.gzipSync(part, { level: 9 }).toString("base64")));
    if (packed.length > 15_000_000) throw new Error(`voice piece ${n} is ${packed.length} bytes, over the host's limit`);
    if (!zlib.gunzipSync(Buffer.from(JSON.parse(packed.toString()), "base64")).equals(part)) throw new Error(`voice piece ${n} doesn't unpack to its bytes`);
    const file = `${VOICE}-${n}.json`;
    fs.writeFileSync(`dist/voice/${file}`, packed);
    pieces.push({ file, bytes: packed.length });
  }
  const engineFile = "ort-wasm-simd-threaded.wasm";
  fs.copyFileSync(`node_modules/onnxruntime-web/dist/${engineFile}`, `dist/voice/${engineFile}`);
  const engineVersion = JSON.parse(fs.readFileSync("node_modules/onnxruntime-web/package.json", "utf8")).version;
  const engineBytes = fs.statSync(`dist/voice/${engineFile}`).size;
  Object.assign(manifest, { pieces, engineFile, engineBytes, engineVersion });
  fs.writeFileSync(`dist/voice/${VOICE}.json`, JSON.stringify(manifest));
  const downloadBytes = engineBytes + pieces.reduce((a, p) => a + p.bytes, 0);
  return { id: manifest.id, name: manifest.name, sha256: manifest.sha256, engineVersion, manifest: `voice/${VOICE}.json`, downloadBytes };
};
const voice = packVoice();
// The website's settings (site.config.json): where the reader fetches the licensed Bibles, and the Claude version to
// point to for AI. The page published to Claude doesn't use them (see dist-artifact below).
const site = fs.existsSync("site.config.json") ? JSON.parse(fs.readFileSync("site.config.json", "utf8")) : {};
const siteConfig = `<script>window.VERITAS_CONFIG = ${JSON.stringify({ bibleTextsUrl: site.bibleTextsUrl || undefined, claudeUrl: site.claudeUrl || undefined })};</script>`;
fs.writeFileSync("dist/index.html", shell("Veritas Logos", "app", siteConfig));
fs.writeFileSync("dist/embed.html", shell("Veritas Logos", "embed"));

const options = {
  entryPoints: { app: "src/app/main.tsx", embed: "src/embed/embed.tsx" },
  bundle: true,
  minify: !watch,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  outdir: "dist",
  inject: [],
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"', __VOICE__: JSON.stringify(voice) },
  // The voice's phoneme engine and its data (scripts/build_espeak.sh), bundled into voice-worker.js as bytes.
  loader: { ".wasm": "binary", ".bin": "binary" },
  legalComments: "inline",
  logLevel: "warning",
};
const cssEntry = 'import "../app/styles.css";\n';
fs.mkdirSync("src/.gen", { recursive: true });
fs.writeFileSync("src/.gen/app-entry.ts", 'import "../app/styles.css";\nimport "../app/main";\n');
fs.writeFileSync("src/.gen/embed-entry.ts", `${cssEntry}import "../embed/embed-styles.css";\nimport "../embed/embed";\n`);
options.entryPoints = { app: "src/.gen/app-entry.ts", embed: "src/.gen/embed-entry.ts", "voice-worker": "src/voice/worker.ts" };

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: "dist", port: 5173 });
  console.log(`Serving at http://localhost:${port}`);
} else {
  await esbuild.build(options);
  await esbuild.build({ entryPoints: ["server/server.ts"], bundle: true, platform: "node", format: "esm", target: "node22", outfile: "dist-server/server.js", external: ["node:*"], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: "warning" });
  const size = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((a, f) => a + size(path.join(p, f)), 0) : fs.statSync(p).size);
  const count = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).reduce((a, f) => a + count(path.join(p, f)), 0) : 1);
  // The offline cache is named after what's in this build, so visitors get new data after each deploy.
  const hash = crypto.createHash("sha256");
  const feed = (p) => { for (const f of fs.readdirSync(p).sort()) { const q = path.join(p, f); if (fs.statSync(q).isDirectory()) feed(q); else hash.update(q).update(fs.readFileSync(q)); } };
  ["dist/app.js", "dist/app.css"].forEach((f) => hash.update(fs.readFileSync(f)));
  feed("dist/data");
  const sw = fs.readFileSync("dist/sw.js", "utf8").replace('const VERSION = "veritas-v1";', `const VERSION = "veritas-${hash.digest("hex").slice(0, 12)}";`);
  fs.writeFileSync("dist/sw.js", sw);
  console.log(`dist: ${count("dist")} files, ${(size("dist") / 1e6).toFixed(1)} MB. app.js ${(fs.statSync("dist/app.js").size / 1e3).toFixed(0)} KB, embed.js ${(fs.statSync("dist/embed.js").size / 1e3).toFixed(0)} KB, voice ${(size("dist/voice") / 1e6).toFixed(1)} MB + voice-worker.js ${(fs.statSync("dist/voice-worker.js").size / 1e3).toFixed(0)} KB`);
}

// The private preview page published to Claude: no document skeleton of its own, and hosted features switched off.
if (!watch) {
  fs.mkdirSync("dist-artifact", { recursive: true });
  fs.writeFileSync("dist-artifact/index.html", `<title>Veritas Logos</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}
<link rel="stylesheet" href="app.css">
<script>window.VERITAS_CONFIG = { artifact: true };</script>
<div id="root"></div>
<script type="module" src="app.js"></script>
`);
}
