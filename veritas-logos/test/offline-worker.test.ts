import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const scope = "https://example.test/veritas/";
const worker = readFileSync("public/sw.js", "utf8").replace("/* OFFLINE_CONFIG */ null",
  JSON.stringify({ shell: ["index.html", "app.js"], data: [], version: "test", dataVersion: "test", watch: false }));

function loadWorker(read: (key: Request | string) => Promise<Response | undefined> = async () => undefined) {
  const listeners = new Map<string, (event: any) => void>();
  const precached: Request[] = [];
  const network: string[] = [];
  runInNewContext(worker, {
    URL, Request,
    self: {
      registration: { scope },
      addEventListener: (type: string, listener: (event: any) => void) => listeners.set(type, listener),
      skipWaiting: async () => {},
    },
    caches: {
      open: async () => ({ addAll: async (requests: Request[]) => precached.push(...requests) }),
      match: read,
    },
    fetch: async (request: Request) => {
      network.push(request.url);
      return new Response("network");
    },
  });

  const navigate = (path = "") => {
    let response: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { url: new URL(path, scope).href, method: "GET", mode: "navigate" },
      respondWith: (value: Promise<Response>) => { response = value; },
    });
    return response;
  };
  return { listeners, precached, network, navigate };
}

test("offline shell precaches the canonical directory and serves it on navigation", async () => {
  const worker = loadWorker(async (key) => key === scope ? new Response("cached") : undefined);
  await new Promise((resolve, reject) => {
    worker.listeners.get("install")!({ waitUntil: (result: Promise<void>) => result.then(resolve, reject) });
  });
  assert.deepEqual(worker.precached.map((request) => request.url), [scope, scope + "app.js"]);
  assert.equal(worker.precached[0].redirect, "error");
  assert.equal(await (await worker.navigate())?.text(), "cached");
  assert.equal(await (await worker.navigate("index.html"))?.text(), "cached");
  assert.equal(worker.navigate("?code=callback"), undefined);
  assert.deepEqual(worker.network, []);
});

test("offline navigation falls back to the network after a cached redirect or cache failure", async () => {
  const redirect = Object.defineProperty(new Response("redirected content"), "redirected", { value: true });
  const worker = loadWorker(async () => redirect);
  assert.equal(await (await worker.navigate())?.text(), "network");
  assert.deepEqual(worker.network, [scope]);

  const unavailable = loadWorker(async () => { throw new Error("cache unavailable"); });
  assert.equal(await (await unavailable.navigate())?.text(), "network");
  assert.deepEqual(unavailable.network, [scope]);
});
