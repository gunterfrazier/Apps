// Builds dist/: one self-contained index.html (styles and scripts inlined) plus the files in public/
// and the public-domain Bible text (BSB, KJV) from Veritas Logos. No dependencies. Run: node build.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const out = join(root, "dist");

// design.css (the design system and each church's Appearance settings) comes after styles.css, so it sets the look.
const css = readFileSync(join(src, "styles.css"), "utf8") + "\n" + readFileSync(join(src, "design.css"), "utf8");
const vendor = readdirSync(join(src, "vendor")).filter((f) => f.endsWith(".js")).sort().map((f) => readFileSync(join(src, "vendor", f), "utf8")).join("\n");
const js = readdirSync(join(src, "js")).filter((f) => f.endsWith(".js")).sort()
  .map((f) => `// ===== ${f} =====\n${readFileSync(join(src, "js", f), "utf8")}`).join("\n");
const page = readFileSync(join(src, "index.html"), "utf8")
  .replace("/*STYLES*/", () => css)
  .replace("/*SCRIPTS*/", () => `(function () {\n"use strict";\n${vendor}\n${js}\n})();`);

if (/<\/script/i.test(js + vendor)) throw new Error("A script contains </script>, which would end the inline script early.");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });
writeFileSync(join(out, "index.html"), page);

// Bible text for "Fill from the Bible" and Scripture slides. Shared with Veritas Logos rather than copied into this folder.
const bible = join(root, "..", "veritas-logos", "public", "data", "bible");
if (existsSync(bible)) {
  mkdirSync(join(out, "bible"), { recursive: true });
  for (const t of ["BSB", "KJV"]) for (const p of ["ot", "nt"]) cpSync(join(bible, `${t}-${p}.json`), join(out, "bible", `${t}-${p}.json`));
} else console.warn("Bible text not found next to this folder; Scripture fill will ask people to paste text.");
// The Veritas Logos Family Library (stories, crafts, games and pictures) for the lesson builder's "Start from a Bible story".
// Exported there by npm run family:export, and shared rather than copied into this folder.
const family = join(root, "..", "veritas-logos", "public", "family", "lessons");
if (existsSync(join(family, "lessons.json"))) cpSync(family, join(out, "family-lib"), { recursive: true });
else console.warn("Family Library not found next to this folder; Start from a Bible story will be unavailable.");
console.log(`dist/index.html ${(page.length / 1024).toFixed(1)} KB`);
