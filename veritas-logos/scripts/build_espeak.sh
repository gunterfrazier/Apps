#!/usr/bin/env bash
# Builds the phoneme engine of the built-in voice: eSpeak NG compiled to WebAssembly, with only the English data.
#
# SPDX-License-Identifier: GPL-3.0-or-later
#
# The engine is built from rhasspy/espeak-ng, the eSpeak NG fork that Piper's voices were trained with, at the commit
# pinned below, so the voice hears the phonemes it learned from. eSpeak NG is GPL-3.0-or-later, so voice-worker.js,
# which carries this engine, is offered under the same license. Its complete source is this script, src/voice and
# that commit of rhasspy/espeak-ng (see README.md, "The built-in voice and its license").
#
# Needs: git, cmake and a C compiler (for eSpeak NG's own tools, which compile its data), and Zig for the
# WebAssembly build (pip install ziglang). Run from the repository folder:
#   npm run data:espeak
# It writes src/voice/espeak/espeak-ng.wasm and src/voice/espeak/espeak-ng-data.bin, which the app bundles into
# voice-worker.js.
set -euo pipefail

REPO=https://github.com/rhasspy/espeak-ng
COMMIT=8593723f10cfd9befd50de447f14bf0a9d2a14a4
OUT="$(pwd)/src/voice/espeak"
WORK="${ESPEAK_WORK:-$(mktemp -d)}"
ZIG=(python3 -m ziglang)

if [ ! -d "$WORK/espeak-ng/.git" ]; then
  git clone --quiet "$REPO" "$WORK/espeak-ng"
fi
git -C "$WORK/espeak-ng" checkout --quiet "$COMMIT"
SRC="$WORK/espeak-ng/src"

# 1. A native build, only to compile eSpeak NG's phoneme tables and English dictionary.
cmake -S "$WORK/espeak-ng" -B "$WORK/native" -DCMAKE_BUILD_TYPE=Release -DUSE_ASYNC=OFF -DUSE_MBROLA=OFF \
  -DUSE_LIBSONIC=OFF -DUSE_LIBPCAUDIO=OFF -DUSE_SPEECHPLAYER=OFF -DUSE_KLATT=ON -DCOMPILE_INTONATIONS=ON >/dev/null
cmake --build "$WORK/native" -j"$(nproc)" >/dev/null
DATA="$WORK/native/espeak-ng-data"

# 2. The library, with the same settings, compiled to WebAssembly (WASI) with a small front of our own.
LIB="$SRC/libespeak-ng"
FILES=()
for f in common mnemonics error ieee80 compiledata compiledict dictionary encoding intonation langopts numbers phoneme \
  phonemelist readclause setlengths soundicon spect ssml synthdata synthesize tr_languages translate translateword \
  voices wavegen speech espeak_api klatt; do FILES+=("$LIB/$f.c"); done
for f in case categories ctype proplist scripts tostring; do FILES+=("$SRC/ucd-tools/src/$f.c"); done
"${ZIG[@]}" cc -target wasm32-wasi -Os -flto -mexec-model=reactor -fwrapv -fno-exceptions \
  -include "$OUT/wasm_compat.h" -I "$SRC/include" -I "$SRC/ucd-tools/src/include" \
  -I "$WORK/native/src/libespeak-ng/include" -I "$LIB" \
  -DLIBESPEAK_NG_EXPORT=1 -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS \
  -lwasi-emulated-signal -lwasi-emulated-process-clocks -Wl,--strip-all \
  "${FILES[@]}" "$OUT/veritas_glue.c" -o "$OUT/espeak-ng.wasm"

# 3. The English data the engine reads, in one file: "VLES1", then for each file its path length (2 bytes), its
#    path, its size (4 bytes) and its bytes. src/voice/espeak.ts reads it into a small in-memory file system.
python3 -I - "$DATA" "$OUT/espeak-ng-data.bin" <<'PY'
import struct, sys
from pathlib import Path
data, out = Path(sys.argv[1]), Path(sys.argv[2])
files = ["phontab", "phonindex", "phondata", "intonations", "en_dict", "lang/gmw/en", "lang/gmw/en-US"]
blob = bytearray(b"VLES1")
for name in files:
    body = (data / name).read_bytes()
    path = name.encode()
    blob += struct.pack("<H", len(path)) + path + struct.pack("<I", len(body)) + body
out.write_bytes(bytes(blob))
print(f"{out.name}: {len(blob)} bytes, {len(files)} files")
PY
echo "espeak-ng.wasm: $(stat -c %s "$OUT/espeak-ng.wasm") bytes, from rhasspy/espeak-ng $COMMIT"
