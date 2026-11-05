// Bundles the TypeScript tests with esbuild, then runs them with Node's test runner.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import * as esbuild from "esbuild";
const files = fs.readdirSync("test").filter((f) => f.endsWith(".test.ts")).map((f) => `test/${f}`);
fs.rmSync(".test-build", { recursive: true, force: true });
await esbuild.build({ entryPoints: files, bundle: true, platform: "node", format: "esm", target: "node22", outdir: ".test-build", outExtension: { ".js": ".mjs" }, external: ["node:*"], logLevel: "warning" });
const out = fs.readdirSync(".test-build").map((f) => `.test-build/${f}`);
const r = spawnSync(process.execPath, ["--no-warnings", "--test", "--test-reporter=dot", ...out], { stdio: "inherit" });
fs.rmSync(".test-build", { recursive: true, force: true });
process.exit(r.status ?? 1);
