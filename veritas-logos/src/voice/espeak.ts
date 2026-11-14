/*!
 * Veritas Logos voice worker: phonemes from eSpeak NG.
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This file and voice-worker.js, which carries it, are free software under the GNU General Public License, version 3
 * or later, because they include eSpeak NG (GPL-3.0-or-later), built from rhasspy/espeak-ng at commit
 * 8593723f10cfd9befd50de447f14bf0a9d2a14a4 by scripts/build_espeak.sh. The complete source is at
 * https://github.com/gunterfrazier/Apps (folder veritas-logos: src/voice and scripts/build_espeak.sh) and
 * https://github.com/rhasspy/espeak-ng. The license is at licenses/GPL-3.0.txt next to this app. No warranty.
 */
/**
 * Turns text into the IPA phonemes Piper's voices were trained on, the way phonemizer.js did: eSpeak NG runs a
 * synthesis with its phoneme trace on, one clause per line. The engine is a small WebAssembly build (see
 * scripts/build_espeak.sh) that reads its English data from a file system kept in memory here, through the few WASI
 * calls it makes. Nothing is fetched: both files are bundled into voice-worker.js.
 */
import wasmBytes from "./espeak/espeak-ng.wasm";
import dataBytes from "./espeak/espeak-ng-data.bin";

type Node = { kind: "file"; bytes: Uint8Array } | { kind: "dir"; entries: Map<string, Node> };
interface Open { node: Node; pos: number }

/** Reads espeak-ng-data.bin: "VLES1", then path length (2 bytes), path, size (4 bytes) and bytes for each file. */
function unpack(bytes: Uint8Array): Node {
  const root: Node = { kind: "dir", entries: new Map() };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "VLES1") throw new Error("The voice's phoneme data is damaged.");
  let at = 5;
  while (at < bytes.length) {
    const n = view.getUint16(at, true);
    const path = new TextDecoder().decode(bytes.subarray(at + 2, at + 2 + n));
    const size = view.getUint32(at + 2 + n, true);
    const body = bytes.subarray(at + 6 + n, at + 6 + n + size);
    at += 6 + n + size;
    let dir = root as Extract<Node, { kind: "dir" }>;
    const parts = path.split("/");
    for (const p of parts.slice(0, -1)) {
      let next = dir.entries.get(p);
      if (!next) { next = { kind: "dir", entries: new Map() }; dir.entries.set(p, next); }
      dir = next as Extract<Node, { kind: "dir" }>;
    }
    dir.entries.set(parts[parts.length - 1], { kind: "file", bytes: body });
  }
  return root;
}

// WASI error numbers used here.
const OK = 0, EBADF = 8, EINVAL = 28, ENOENT = 44, ENOTDIR = 54, EROFS = 69;
const PREOPEN = 3;

interface Engine { ipa(text: string): string[] }
const engines = new Map<string, Promise<Engine>>();

async function start(voice: string): Promise<Engine> {
  const root = unpack(dataBytes);
  const fds = new Map<number, Open>([[PREOPEN, { node: root, pos: 0 }]]);
  let nextFd = PREOPEN + 1;
  let memory: WebAssembly.Memory;
  const u8 = () => new Uint8Array(memory.buffer);
  const dv = () => new DataView(memory.buffer);
  const text = (ptr: number, len: number) => new TextDecoder().decode(u8().subarray(ptr, ptr + len));

  const lookup = (dirFd: number, path: string): Node | null => {
    let node = fds.get(dirFd)?.node ?? null;
    for (const p of path.split("/")) {
      if (!node) return null;
      if (p === "" || p === ".") continue;
      if (node.kind !== "dir") return null;
      node = node.entries.get(p) ?? null;
    }
    return node;
  };
  const filestat = (node: Node, buf: number) => {
    const d = dv();
    for (let i = 0; i < 64; i++) d.setUint8(buf + i, 0);
    d.setUint8(buf + 16, node.kind === "dir" ? 3 : 4);
    d.setBigUint64(buf + 24, 1n, true);
    d.setBigUint64(buf + 32, BigInt(node.kind === "file" ? node.bytes.length : 0), true);
  };

  const wasi = {
    environ_get: () => OK,
    environ_sizes_get: (count: number, size: number) => { dv().setUint32(count, 0, true); dv().setUint32(size, 0, true); return OK; },
    clock_time_get: (_id: number, _precision: bigint, out: number) => { dv().setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return OK; },
    fd_fdstat_get: (fd: number, buf: number) => {
      const d = dv();
      for (let i = 0; i < 24; i++) d.setUint8(buf + i, 0);
      const f = fds.get(fd);
      if (fd <= 2) d.setUint8(buf, 2);
      else if (f) d.setUint8(buf, f.node.kind === "dir" ? 3 : 4);
      else return EBADF;
      d.setBigUint64(buf + 8, 0xffffffffn, true);
      d.setBigUint64(buf + 16, 0xffffffffn, true);
      return OK;
    },
    fd_fdstat_set_flags: () => OK,
    fd_prestat_get: (fd: number, buf: number) => {
      if (fd !== PREOPEN) return EBADF;
      dv().setUint32(buf, 0, true);
      dv().setUint32(buf + 4, 1, true);
      return OK;
    },
    fd_prestat_dir_name: (fd: number, ptr: number, len: number) => {
      if (fd !== PREOPEN || len < 1) return EBADF;
      u8()[ptr] = 47; // "/"
      return OK;
    },
    fd_read: (fd: number, iovs: number, count: number, nread: number) => {
      const f = fds.get(fd);
      if (!f || f.node.kind !== "file") return EBADF;
      const d = dv();
      let total = 0;
      for (let i = 0; i < count; i++) {
        const ptr = d.getUint32(iovs + i * 8, true), len = d.getUint32(iovs + i * 8 + 4, true);
        const chunk = f.node.bytes.subarray(f.pos, f.pos + len);
        u8().set(chunk, ptr);
        f.pos += chunk.length;
        total += chunk.length;
        if (chunk.length < len) break;
      }
      d.setUint32(nread, total, true);
      return OK;
    },
    fd_readdir: (fd: number, buf: number, len: number, cookie: bigint, used: number) => {
      const f = fds.get(fd);
      if (!f || f.node.kind !== "dir") return ENOTDIR;
      const names = [".", "..", ...f.node.entries.keys()];
      const out: number[] = [];
      for (let i = Number(cookie); i < names.length; i++) {
        const name = new TextEncoder().encode(names[i]);
        const child = i < 2 ? f.node : f.node.entries.get(names[i])!;
        const head = new DataView(new ArrayBuffer(24));
        head.setBigUint64(0, BigInt(i + 1), true);
        head.setBigUint64(8, BigInt(i + 1), true);
        head.setUint32(16, name.length, true);
        head.setUint8(20, child.kind === "dir" ? 3 : 4);
        out.push(...new Uint8Array(head.buffer), ...name);
        if (out.length >= len) break;
      }
      const n = Math.min(len, out.length);
      u8().set(out.slice(0, n), buf);
      dv().setUint32(used, n, true);
      return OK;
    },
    fd_seek: (fd: number, offset: bigint, whence: number, out: number) => {
      const f = fds.get(fd);
      if (!f || f.node.kind !== "file") return EBADF;
      const base = whence === 0 ? 0 : whence === 1 ? f.pos : f.node.bytes.length;
      const pos = base + Number(offset);
      if (pos < 0) return EINVAL;
      f.pos = pos;
      dv().setBigUint64(out, BigInt(pos), true);
      return OK;
    },
    fd_write: (fd: number, iovs: number, count: number, written: number) => {
      // Only eSpeak NG's messages go to stdout or stderr; they're dropped.
      const d = dv();
      let total = 0;
      for (let i = 0; i < count; i++) total += d.getUint32(iovs + i * 8 + 4, true);
      d.setUint32(written, total, true);
      return fd <= 2 ? OK : EBADF;
    },
    fd_close: (fd: number) => (fds.delete(fd) ? OK : EBADF),
    path_filestat_get: (fd: number, _flags: number, ptr: number, len: number, buf: number) => {
      const node = lookup(fd, text(ptr, len));
      if (!node) return ENOENT;
      filestat(node, buf);
      return OK;
    },
    path_open: (fd: number, _dirflags: number, ptr: number, len: number, oflags: number, _rb: bigint, _ri: bigint, _fdflags: number, out: number) => {
      if (oflags & (1 | 4 | 8)) return EROFS; // create, exclusive or truncate: the data is read-only
      const node = lookup(fd, text(ptr, len));
      if (!node) return ENOENT;
      if (oflags & 2 && node.kind !== "dir") return ENOTDIR;
      const n = nextFd++;
      fds.set(n, { node, pos: 0 });
      dv().setUint32(out, n, true);
      return OK;
    },
    path_remove_directory: () => EROFS,
    path_unlink_file: () => EROFS,
    proc_exit: (code: number) => { throw new Error(`eSpeak NG stopped (${code})`); },
  };

  const module = await WebAssembly.compile(wasmBytes as unknown as BufferSource);
  const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi });
  const ex = instance.exports as unknown as {
    memory: WebAssembly.Memory; _initialize(): void;
    ve_init(data: number, voice: number): number; ve_ipa(text: number): number; ve_alloc(n: number): number; ve_free(p: number): void;
  };
  memory = ex.memory;
  ex._initialize();
  const put = (s: string) => {
    const b = new TextEncoder().encode(s + "\0");
    const p = ex.ve_alloc(b.length);
    u8().set(b, p);
    return p;
  };
  const read = (p: number) => {
    const m = u8();
    let e = p;
    while (m[e]) e++;
    return new TextDecoder().decode(m.subarray(p, e));
  };
  const dataPath = put("/"), voicePath = put(voice);
  const rate = ex.ve_init(dataPath, voicePath);
  if (rate <= 0) throw new Error(`The voice's phoneme engine didn't start (${rate}).`);
  return {
    ipa(t: string) {
      const p = put(t);
      try {
        return read(ex.ve_ipa(p)).split("\n").map((x) => x.trim()).filter((x) => x.length > 0);
      } finally {
        ex.ve_free(p);
      }
    },
  };
}

/** The phonemes of text, one string per clause, as phonemizer.js's phonemize() gave them. Each voice gets its own engine. */
export async function phonemize(text: string, voice = "en-us"): Promise<string[]> {
  let engine = engines.get(voice);
  if (!engine) {
    engine = start(voice);
    engines.set(voice, engine);
    engine.catch(() => engines.delete(voice));
  }
  return (await engine).ipa(text);
}
