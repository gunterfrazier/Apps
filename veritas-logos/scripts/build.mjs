/**
 * Builds the site into dist/ and the API server into dist-server/.
 *   node scripts/build.mjs            full build
 *   node scripts/build.mjs --watch    rebuild the app on change and serve it at localhost:5173
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&family=Noto+Serif+Hebrew:wght@400;600&family=Noto+Serif:wght@400&display=swap">`;
const shell = (title, script, extraHead = "") => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="Bible study guides, Hebrew and Greek tools, cultural and theological insights, and biblical people.">
<meta name="theme-color" content="#1c1917">
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
// Every data file is stored gzip-compressed under its own name: the published app has to fit the host's 256 MB, and
// compressed it is about a third of the size. The app unpacks a file when it loads it (src/core/data.ts), and keeps
// reading plain JSON too, so the repo's public/data stays readable and a half-uploaded version still works.
// Fixed settings and no timestamp, so the same data always gives the same bytes.
const gzipAll = (dir) => {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { gzipAll(p); continue; }
    if (!p.endsWith(".json")) continue;
    const raw = fs.readFileSync(p);
    const gz = zlib.gzipSync(raw, { level: 9 });
    if (gz.length >= raw.length) continue;
    if (!zlib.gunzipSync(gz).equals(raw)) throw new Error(`${p} doesn't unpack to its original bytes`);
    fs.writeFileSync(p, gz);
  }
};
if (!watch) gzipAll("dist/data");
fs.writeFileSync("dist/index.html", shell("Veritas Logos", "app"));
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
  define: { "process.env.NODE_ENV": watch ? '"development"' : '"production"' },
  logLevel: "warning",
};
const cssEntry = 'import "../app/styles.css";\n';
fs.mkdirSync("src/.gen", { recursive: true });
fs.writeFileSync("src/.gen/app-entry.ts", 'import "../app/styles.css";\nimport "../app/main";\n');
fs.writeFileSync("src/.gen/embed-entry.ts", `${cssEntry}import "../embed/embed-styles.css";\nimport "../embed/embed";\n`);
options.entryPoints = { app: "src/.gen/app-entry.ts", embed: "src/.gen/embed-entry.ts" };

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
  console.log(`dist: ${count("dist")} files, ${(size("dist") / 1e6).toFixed(1)} MB. app.js ${(fs.statSync("dist/app.js").size / 1e3).toFixed(0)} KB, embed.js ${(fs.statSync("dist/embed.js").size / 1e3).toFixed(0)} KB`);
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
