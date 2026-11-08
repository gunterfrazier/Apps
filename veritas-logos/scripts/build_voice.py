"""Builds the read-aloud voice that runs in the page when a browser has no speech engine of its own.

    python3 -I scripts/build_voice.py --model ../sources/vits-piper-en_US-norman-medium/en_US-norman-medium.onnx

The model is a Piper voice (VITS, exported to ONNX). Its config is read from the file beside it (model + ".json").
The build writes two files to public/voice:

  <id>.bin   the model in a compact form: the graph without its weights, then the large weights as 16-bit floats
  <id>.json  the voice's settings (sample rate, phoneme ids, inference scales) and where each part of <id>.bin goes

Half-precision storage halves the download. The page widens the weights back to 32 bits before it starts the model
(src/voice/model.ts), so the model runs exactly as published apart from that rounding. This script rebuilds the model
the same way the page does and stops if its speech moves away from the original's by more than a rounding error.
The published build splits <id>.bin into packed JSON pieces (scripts/build.mjs), because the host turns away binary
files other than .wasm.

Needs: pip install onnx onnxruntime numpy
"""
import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper
from onnx.external_data_helper import set_external_data

ALIGN = 16
MIN_EXTERNAL = 1024  # tensors with fewer values stay inside the graph, at full precision


def pad(n: int) -> int:
    return (n + ALIGN - 1) // ALIGN * ALIGN


def build(model_path: Path, voice_id: str, name: str, out_dir: Path) -> dict:
    config = json.loads(Path(str(model_path) + ".json").read_text(encoding="utf-8"))
    model = onnx.load(str(model_path))
    weights_name = f"{voice_id}.weights"

    # Lay out the large float tensors as external data, at 16-byte boundaries in the widened buffer.
    segments, chunks = [], []
    blob_size = out_size = 0
    for t in model.graph.initializer:
        if t.data_type != onnx.TensorProto.FLOAT:
            continue
        a = numpy_helper.to_array(t).astype(np.float32)
        if a.size < MIN_EXTERNAL:
            continue
        finite = np.isfinite(a).all() and np.abs(a).max() < 65000
        stored = a.astype(np.float16) if finite else a
        data = stored.tobytes()
        out_size = pad(out_size)
        blob_size = pad(blob_size)
        segments.append([blob_size, a.size, out_size, "f16" if finite else "f32"])
        chunks.append((blob_size, data))
        t.CopyFrom(numpy_helper.from_array(a, t.name))  # puts the values in raw_data, which set_external_data needs
        set_external_data(t, location=weights_name, offset=out_size, length=a.size * 4)
        t.ClearField("raw_data")
        blob_size += len(data)
        out_size += a.size * 4

    graph = model.SerializeToString()
    graph_at = 0
    shift = pad(len(graph))
    blob = bytearray(shift + blob_size)
    blob[graph_at:len(graph)] = graph
    for at, data in chunks:
        blob[shift + at:shift + at + len(data)] = data
    for s in segments:
        s[0] += shift

    idmap = config["phoneme_id_map"]
    inf = config.get("inference", {})
    voice = {
        "id": voice_id,
        "name": name,
        "engine": "piper-vits",
        "sampleRate": config["audio"]["sample_rate"],
        "espeakVoice": config["espeak"]["voice"],
        "noiseScale": inf.get("noise_scale", 0.667),
        "lengthScale": inf.get("length_scale", 1),
        "noiseW": inf.get("noise_w", 0.8),
        "phonemeIds": {k: v for k, v in idmap.items()},
        "graph": [graph_at, len(graph)],
        "weightsName": weights_name,
        "weightsBytes": out_size,
        "segments": segments,
        "bytes": len(blob),
        "sha256": hashlib.sha256(blob).hexdigest(),
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{voice_id}.bin").write_bytes(bytes(blob))
    (out_dir / f"{voice_id}.json").write_text(json.dumps(voice, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    return voice


def widen(voice: dict, blob: bytes):
    """What the page does: the graph, and the weights widened back to 32-bit floats."""
    g0, glen = voice["graph"]
    weights = np.zeros(voice["weightsBytes"] // 4, np.float32)
    for at, count, out, kind in voice["segments"]:
        dtype = np.float16 if kind == "f16" else np.float32
        weights[out // 4:out // 4 + count] = np.frombuffer(blob, dtype=dtype, count=count, offset=at).astype(np.float32)
    return blob[g0:g0 + glen], weights.tobytes()


def check(model_path: Path, voice: dict, out_dir: Path) -> None:
    import onnxruntime as ort
    blob = (out_dir / f"{voice['id']}.bin").read_bytes()
    assert hashlib.sha256(blob).hexdigest() == voice["sha256"]
    graph, weights = widen(voice, blob)
    ids = voice["phonemeIds"]
    # "The Lord is my shepherd; I shall not want." as Piper phonemizes it.
    phon = "ðə lˈɔːɹd ɪz maɪ ʃˈɛpɚd; aɪʃˌæl nˌɑːt wˈɑːnt."
    seq = [ids["^"][0], ids["_"][0]]
    for ch in phon:
        if ch in ids:
            seq += ids[ch] + ids["_"]
    seq += ids["$"]
    feeds = {"input": np.array([seq], np.int64), "input_lengths": np.array([len(seq)], np.int64), "scales": np.array([0, 1, 0], np.float32)}
    ref = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"]).run(None, feeds)[0].reshape(-1)
    with tempfile.TemporaryDirectory() as d:
        Path(d, "model.onnx").write_bytes(graph)
        Path(d, voice["weightsName"]).write_bytes(weights)
        got = ort.InferenceSession(os.path.join(d, "model.onnx"), providers=["CPUExecutionProvider"]).run(None, feeds)[0].reshape(-1)
    if len(got) != len(ref):
        raise SystemExit(f"Rebuilt voice speaks for a different length ({len(got)} samples, not {len(ref)})")
    snr = 10 * np.log10((ref ** 2).sum() / max(1e-12, ((ref - got) ** 2).sum()))
    print(f"Rebuilt voice matches the original within {snr:.1f} dB")
    if snr < 25:
        raise SystemExit("The rebuilt voice differs from the original by more than rounding")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True, type=Path, help="Piper .onnx file; its .onnx.json must sit beside it")
    p.add_argument("--id", default="norman")
    p.add_argument("--name", default="Norman")
    p.add_argument("--out", default=Path("public/voice"), type=Path)
    a = p.parse_args()
    voice = build(a.model, a.id, a.name, a.out)
    print(f"{a.out}/{a.id}.bin: {voice['bytes'] / 1e6:.1f} MB, {len(voice['segments'])} weight tensors, graph {voice['graph'][1] / 1e3:.0f} KB")
    check(a.model, voice, a.out)


if __name__ == "__main__":
    main()
