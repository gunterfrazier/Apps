// The engine and its data are bundled into voice-worker.js as bytes (esbuild's binary loader; see scripts/build.mjs).
declare module "*.wasm" {
  const bytes: Uint8Array;
  export default bytes;
}
declare module "*.bin" {
  const bytes: Uint8Array;
  export default bytes;
}
