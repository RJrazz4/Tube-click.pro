/**
 * TubeClick P2P signaling server — the tiny "meeting point" for the
 * Voiceover page's peer-to-peer voice mesh.
 *
 * What it does (and only this):
 * - Tracks which browsers are online and which of them are willing
 *   workers (their owners turned on "share this device").
 * - Broadcasts the worker list so requesters know who can help.
 * - Relays WebRTC offer/answer/ICE messages between two browsers so
 *   they can open a direct, encrypted data channel.
 *
 * What it NEVER does: it never receives script text or audio. Those
 * travel only on the peer-to-peer data channel between the two
 * browsers. This server is a phone book, not a post office.
 *
 * Run: npm install && npm start   (PORT from env, default 8787)
 */
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8787;
const STALE_MS = 20_000;

const wss = new WebSocketServer({ port: PORT });
/** peerId -> { ws, worker, lastSeen } */
const peers = new Map();

function workerList() {
  return [...peers.entries()].filter(([, p]) => p.worker).map(([id]) => id);
}

function broadcastWorkers() {
  const msg = JSON.stringify({ type: "workers", workers: workerList() });
  for (const p of peers.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(msg);
  }
}

wss.on("connection", (ws) => {
  let myId = null;
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "register" && typeof msg.peerId === "string") {
      myId = msg.peerId;
      peers.set(myId, { ws, worker: !!msg.worker, lastSeen: Date.now() });
      ws.send(JSON.stringify({ type: "workers", workers: workerList() }));
      broadcastWorkers();
      return;
    }
    if (msg.type === "ping" && myId) {
      const p = peers.get(myId);
      if (p) p.lastSeen = Date.now();
      return;
    }
    if (msg.type === "relay" && typeof msg.to === "string") {
      const target = peers.get(msg.to);
      if (target && target.ws.readyState === target.ws.OPEN) {
        target.ws.send(JSON.stringify({ type: "relay", from: myId, data: msg.data }));
      }
      return;
    }
    if (myId) {
      const p = peers.get(myId);
      if (p) p.lastSeen = Date.now();
    }
  });
  const cleanup = () => {
    if (myId && peers.get(myId)?.ws === ws) {
      peers.delete(myId);
      broadcastWorkers();
    }
  };
  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

// Drop peers that stopped checking in (closed laptops, dead tabs).
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, p] of peers.entries()) {
    if (now - p.lastSeen > STALE_MS) {
      peers.delete(id);
      changed = true;
      try {
        p.ws.terminate();
      } catch {
        /* already gone */
      }
    }
  }
  if (changed) broadcastWorkers();
}, 5000);

console.log(`tubeclick-p2p-signaling listening on :${PORT}`);
