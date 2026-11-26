// A stand-in for OBS Studio's WebSocket server (obs-websocket 5) for the smoke test, with no extra packages: the
// WebSocket handshake and text frames by hand, the Hello/Identify exchange with a password, scenes, the stream and
// the recording, and the events OBS sends when they change.
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const b64sha = (s) => createHash("sha256").update(s).digest("base64");
const frame = (text) => {
  const body = Buffer.from(text), n = body.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : Buffer.from([0x81, 126, n >> 8, n & 255]);
  return Buffer.concat([head, body]);
};
function* frames(buf) {   // client frames are masked
  let i = 0;
  while (i + 2 <= buf.length) {
    const op = buf[i] & 15; let n = buf[i + 1] & 127, p = i + 2;
    if (n === 126) { n = buf.readUInt16BE(p); p += 2; } else if (n === 127) { n = Number(buf.readBigUInt64BE(p)); p += 8; }
    const mask = buf.subarray(p, p + 4); p += 4;
    if (p + n > buf.length) return;
    const data = Buffer.from(buf.subarray(p, p + n).map((b, k) => b ^ mask[k % 4]));
    yield { op, text: data.toString() }; i = p + n;
  }
}

export function fakeObs({ password = "", scenes = ["Pre-service", "Worship", "Sermon"] } = {}) {
  const state = { scene: scenes[0], streaming: false, recording: false, requests: [], sockets: new Set() };
  const salt = "c2FsdA==", challenge = "Y2hhbGxlbmdl";
  const server = createServer();
  server.on("upgrade", (req, sock) => {
    const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    state.sockets.add(sock); sock.on("close", () => state.sockets.delete(sock)); sock.on("error", () => {});
    const send = (o) => sock.write(frame(JSON.stringify(o)));
    const close = (code) => { sock.write(Buffer.from([0x88, 2, code >> 8, code & 255])); sock.end(); };
    send({ op: 0, d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1, ...(password ? { authentication: { salt, challenge } } : {}) } });
    sock.on("data", (buf) => {
      for (const { op, text } of frames(buf)) {
        if (op === 8) { sock.end(); return; }
        if (op !== 1) continue;
        const m = JSON.parse(text);
        if (m.op === 1) {
          if (password && m.d.authentication !== b64sha(b64sha(password + salt) + challenge)) return close(4009);
          send({ op: 2, d: { negotiatedRpcVersion: 1 } });
        } else if (m.op === 6) {
          const { requestType: t, requestId, requestData: q = {} } = m.d; state.requests.push(t);
          const ok = (responseData = {}) => send({ op: 7, d: { requestType: t, requestId, requestStatus: { result: true, code: 100 }, responseData } });
          const event = (eventType, eventData) => { for (const s of state.sockets) s.write(frame(JSON.stringify({ op: 5, d: { eventType, eventData } }))); };
          if (t === "GetSceneList") ok({ currentProgramSceneName: state.scene, scenes: scenes.map((sceneName, k) => ({ sceneName, sceneIndex: scenes.length - 1 - k })) });
          else if (t === "GetStreamStatus") ok({ outputActive: state.streaming });
          else if (t === "GetRecordStatus") ok({ outputActive: state.recording });
          else if (t === "SetCurrentProgramScene") {
            if (!scenes.includes(q.sceneName)) { send({ op: 7, d: { requestType: t, requestId, requestStatus: { result: false, code: 600, comment: "No source was found" } } }); continue; }
            state.scene = q.sceneName; ok(); event("CurrentProgramSceneChanged", { sceneName: q.sceneName });
          } else if (/^(Start|Stop)(Stream|Record)$/.test(t)) {
            const on = t.startsWith("Start"), key = t.endsWith("Stream") ? "streaming" : "recording";
            state[key] = on; ok(); event(key === "streaming" ? "StreamStateChanged" : "RecordStateChanged", { outputActive: on, outputState: on ? "OBS_WEBSOCKET_OUTPUT_STARTED" : "OBS_WEBSOCKET_OUTPUT_STOPPED" });
          } else ok();
        }
      }
    });
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done({
    port: server.address().port, state,
    drop: () => { for (const s of state.sockets) s.destroy(); },   // as if OBS restarted
    close: () => new Promise((r) => { for (const s of state.sockets) s.destroy(); server.close(r); }),
  })));
}
