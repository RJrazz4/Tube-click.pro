/**
 * src/lib/p2p/voiceMesh.ts — peer-to-peer voiceover generation mesh.
 *
 * Idea (Hero, 2026-11-06): the Voiceover page's TTS load is shared
 * between the browsers that are online at the same time. A script is
 * split into sentence chunks; chunks are generated in parallel — some
 * on peers' devices over WebRTC data channels, the rest locally — and
 * stitched back into one WAV.
 *
 * Honest architecture notes:
 * - A tiny signaling server introduces peers (WebRTC cannot connect
 *   strangers without one). It never sees audio, and script text only
 *   ever travels on the encrypted peer-to-peer data channel itself.
 * - The local engine is a first-class worker: with zero peers online
 *   the mesh degrades to pure local generation and never blocks.
 * - A worker only receives chunks while its owner keeps this page's
 *   "share this device" toggle on.
 */
import { audioBufferToWavBlob } from "@/lib/audio/engine";
import type { TtsEngine } from "./kokoroEngine";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const JOB_TIMEOUT_MS = 45_000;
const MAX_CHUNK_CHARS = 280;

type ControlMsg =
  | { type: "job"; jobId: string; text: string; voice: string }
  | { type: "accept"; jobId: string }
  | { type: "busy"; jobId: string }
  | { type: "audio-meta"; jobId: string; size: number }
  | { type: "done"; jobId: string }
  | { type: "error"; jobId: string; message: string };

interface PendingJob {
  resolve: (blob: Blob) => void;
  reject: (err: Error) => void;
  parts: ArrayBuffer[];
  expectedSize: number;
  received: number;
  timer: ReturnType<typeof setTimeout>;
}

interface PeerLink {
  peerId: string;
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  open: boolean;
  busy: boolean;
  pending: Map<string, PendingJob>;
}

export interface MeshProgress {
  done: number;
  total: number;
  viaPeers: number;
  viaLocal: number;
}

export interface MeshEvents {
  onPeers?: (workerCount: number) => void;
  onStatus?: (status: string) => void;
}

function splitIntoChunks(script: string): string[] {
  const sentences = script
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (s.length > MAX_CHUNK_CHARS) {
      if (current) chunks.push(current);
      current = "";
      // Hard-split an over-long sentence on commas/spaces.
      let rest = s;
      while (rest.length > MAX_CHUNK_CHARS) {
        const cut = rest.lastIndexOf(" ", MAX_CHUNK_CHARS);
        chunks.push(rest.slice(0, cut > 40 ? cut : MAX_CHUNK_CHARS));
        rest = rest.slice(cut > 40 ? cut + 1 : MAX_CHUNK_CHARS);
      }
      current = rest;
      continue;
    }
    if ((current + " " + s).trim().length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      current = s;
    } else {
      current = (current + " " + s).trim();
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [script.trim()];
}

let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

async function stitchWavs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];
  const ctx = getAudioCtx();
  const buffers: AudioBuffer[] = [];
  for (const b of blobs) buffers.push(await ctx.decodeAudioData(await b.arrayBuffer()));
  const rate = buffers[0].sampleRate;
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const joined = ctx.createBuffer(1, total, rate);
  const out = joined.getChannelData(0);
  let offset = 0;
  for (const b of buffers) {
    out.set(b.getChannelData(0), offset);
    offset += b.length;
  }
  return audioBufferToWavBlob(joined);
}

export class VoiceMesh {
  private engine: TtsEngine;
  private signalingUrl: string;
  private events: MeshEvents;
  private ws: WebSocket | null = null;
  private peerId = `peer-${Math.random().toString(36).slice(2, 10)}`;
  private workerEnabled = false;
  private workers = new Set<string>();
  private links = new Map<string, PeerLink>();
  private workerBusy = false;
  private closed = false;

  constructor(engine: TtsEngine, opts: { signalingUrl?: string; events?: MeshEvents } = {}) {
    this.engine = engine;
    this.signalingUrl = opts.signalingUrl || "";
    this.events = opts.events || {};
  }

  get id() {
    return this.peerId;
  }

  /** Connect to the signaling server. Failure = local-only mode. */
  connect(): Promise<void> {
    if (!this.signalingUrl) {
      this.events.onStatus?.("local-only");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      try {
        const ws = new WebSocket(this.signalingUrl);
        this.ws = ws;
        const giveUp = setTimeout(() => {
          this.events.onStatus?.("local-only");
          done();
        }, 4000);
        ws.onopen = () => {
          clearTimeout(giveUp);
          this.sendSignal({ type: "register", peerId: this.peerId, worker: this.workerEnabled });
          this.events.onStatus?.("connected");
          done();
        };
        ws.onmessage = (ev) => this.onSignal(String(ev.data));
        ws.onerror = () => {
          clearTimeout(giveUp);
          this.events.onStatus?.("local-only");
          done();
        };
        ws.onclose = () => {
          this.ws = null;
          if (!this.closed) this.events.onStatus?.("local-only");
        };
      } catch {
        this.events.onStatus?.("local-only");
        done();
      }
    });
  }

  setWorkerEnabled(enabled: boolean) {
    this.workerEnabled = enabled;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSignal({ type: "register", peerId: this.peerId, worker: enabled });
    }
  }

  close() {
    this.closed = true;
    for (const link of this.links.values()) {
      try {
        link.pc.close();
      } catch {
        /* already closed */
      }
    }
    this.links.clear();
    this.ws?.close();
    this.ws = null;
  }

  // ------------------------------------------------------------ signaling
  private sendSignal(msg: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private onSignal(raw: string) {
    let msg: { type?: string; workers?: string[]; peerId?: string; from?: string; data?: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "workers" && Array.isArray(msg.workers)) {
      this.workers = new Set(msg.workers.filter((id) => id !== this.peerId));
      this.events.onPeers?.(this.workers.size);
      return;
    }
    if (msg.type === "relay" && msg.from && msg.data) {
      void this.onRelay(msg.from, msg.data as { kind: string; payload: unknown });
    }
  }

  private relay(to: string, data: unknown) {
    this.sendSignal({ type: "relay", to, data });
  }

  // ------------------------------------------------------------ WebRTC
  private async onRelay(from: string, data: { kind: string; payload: unknown }) {
    let link = this.links.get(from);
    if (!link) {
      link = this.createLink(from);
      this.links.set(from, link);
    }
    const pc = link.pc;
    try {
      if (data.kind === "offer") {
        await pc.setRemoteDescription(data.payload as RTCSessionDescriptionInit);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.relay(from, { kind: "answer", payload: answer });
      } else if (data.kind === "answer") {
        await pc.setRemoteDescription(data.payload as RTCSessionDescriptionInit);
      } else if (data.kind === "ice") {
        await pc.addIceCandidate(data.payload as RTCIceCandidateInit);
      }
    } catch {
      /* a failed negotiation just means this peer is unusable */
    }
  }

  private createLink(peerId: string): PeerLink {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const link: PeerLink = { peerId, pc, dc: null, open: false, busy: false, pending: new Map() };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.relay(peerId, { kind: "ice", payload: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        link.open = false;
        this.failAllPending(link, new Error("peer disconnected"));
      }
    };
    pc.ondatachannel = (ev) => this.attachChannel(link, ev.channel);
    return link;
  }

  private attachChannel(link: PeerLink, dc: RTCDataChannel) {
    link.dc = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => {
      link.open = true;
    };
    dc.onclose = () => {
      link.open = false;
      this.failAllPending(link, new Error("channel closed"));
    };
    dc.onmessage = (ev) => this.onChannelMessage(link, ev.data);
  }

  private async ensureChannel(peerId: string): Promise<PeerLink | null> {
    let link = this.links.get(peerId);
    if (link?.open && link.dc) return link;
    if (!link) {
      link = this.createLink(peerId);
      this.links.set(peerId, link);
    }
    const dc = link.pc.createDataChannel("voicemesh");
    this.attachChannel(link, dc);
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    this.relay(peerId, { kind: "offer", payload: offer });
    const started = Date.now();
    while (!link.open && Date.now() - started < 8000) {
      await new Promise((r) => setTimeout(r, 150));
    }
    return link.open ? link : null;
  }

  private failAllPending(link: PeerLink, err: Error) {
    for (const job of link.pending.values()) {
      clearTimeout(job.timer);
      job.reject(err);
    }
    link.pending.clear();
    link.busy = false;
  }

  // ------------------------------------------------------------ worker side
  private onChannelMessage(link: PeerLink, data: string | ArrayBuffer) {
    if (typeof data !== "string") {
      // Binary slice of the currently-arriving job result on this link.
      const job = [...link.pending.values()][0];
      if (job) {
        job.parts.push(data);
        job.received += data.byteLength;
      }
      return;
    }
    let msg: ControlMsg;
    try {
      msg = JSON.parse(data) as ControlMsg;
    } catch {
      return;
    }
    if (msg.type === "job") {
      void this.handleIncomingJob(link, msg);
      return;
    }
    const job = link.pending.get(msg.type === "accept" || msg.type === "busy" || msg.type === "error" || msg.type === "audio-meta" || msg.type === "done" ? msg.jobId : "");
    if (msg.type === "busy" || msg.type === "error") {
      const j = link.pending.get(msg.jobId);
      if (j) {
        clearTimeout(j.timer);
        link.pending.delete(msg.jobId);
        link.busy = false;
        j.reject(new Error(msg.type === "busy" ? "peer busy" : "peer error"));
      }
      return;
    }
    if (msg.type === "audio-meta" && job) {
      job.expectedSize = msg.size;
      return;
    }
    if (msg.type === "done" && job) {
      clearTimeout(job.timer);
      link.pending.delete(msg.jobId);
      link.busy = false;
      const blob = new Blob(job.parts, { type: "audio/wav" });
      job.resolve(blob);
    }
  }

  private async handleIncomingJob(link: PeerLink, msg: { jobId: string; text: string; voice: string }) {
    const dc = link.dc;
    if (!dc || dc.readyState !== "open") return;
    if (!this.workerEnabled || this.workerBusy) {
      dc.send(JSON.stringify({ type: "busy", jobId: msg.jobId } satisfies ControlMsg));
      return;
    }
    this.workerBusy = true;
    try {
      const blob = await this.engine.generate(msg.text, msg.voice);
      const buf = await blob.arrayBuffer();
      dc.send(JSON.stringify({ type: "audio-meta", jobId: msg.jobId, size: buf.byteLength } satisfies ControlMsg));
      const SLICE = 64 * 1024;
      for (let off = 0; off < buf.byteLength; off += SLICE) {
        dc.send(buf.slice(off, off + SLICE));
      }
      dc.send(JSON.stringify({ type: "done", jobId: msg.jobId } satisfies ControlMsg));
    } catch (e) {
      try {
        dc.send(
          JSON.stringify({
            type: "error",
            jobId: msg.jobId,
            message: e instanceof Error ? e.message : "generation failed",
          } satisfies ControlMsg),
        );
      } catch {
        /* channel already gone */
      }
    } finally {
      this.workerBusy = false;
    }
  }

  // ------------------------------------------------------------ requester side
  private dispatchToPeer(link: PeerLink, text: string, voice: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const dc = link.dc;
      if (!dc || dc.readyState !== "open") {
        reject(new Error("channel not open"));
        return;
      }
      const jobId = `job-${Math.random().toString(36).slice(2, 10)}`;
      const timer = setTimeout(() => {
        link.pending.delete(jobId);
        link.busy = false;
        reject(new Error("peer timed out"));
      }, JOB_TIMEOUT_MS);
      link.pending.set(jobId, { resolve, reject, parts: [], expectedSize: 0, received: 0, timer });
      link.busy = true;
      dc.send(JSON.stringify({ type: "job", jobId, text, voice } satisfies ControlMsg));
    });
  }

  /**
   * Generate a full script. Chunks run in parallel across ready peers
   * and the local device; anything a peer cannot finish falls back to
   * local generation. The result is one stitched WAV.
   */
  async generate(
    script: string,
    voice: string,
    onProgress?: (p: MeshProgress) => void,
  ): Promise<Blob> {
    const chunks = splitIntoChunks(script);
    const results: (Blob | null)[] = chunks.map(() => null);
    const progress: MeshProgress = { done: 0, total: chunks.length, viaPeers: 0, viaLocal: 0 };
    const queue = chunks.map((text, index) => ({ text, index }));

    const runLocal = async (item: { text: string; index: number }) => {
      results[item.index] = await this.engine.generate(item.text, voice);
      progress.done++;
      progress.viaLocal++;
      onProgress?.({ ...progress });
    };

    // Open channels to as many workers as we have chunks for.
    const workerIds = [...this.workers].slice(0, Math.max(0, chunks.length - 1));
    const readyLinks: PeerLink[] = [];
    for (const id of workerIds) {
      const link = await this.ensureChannel(id);
      if (link) readyLinks.push(link);
    }

    const peerRunner = async (link: PeerLink) => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) return;
        try {
          results[item.index] = await this.dispatchToPeer(link, item.text, voice);
          progress.done++;
          progress.viaPeers++;
          onProgress?.({ ...progress });
        } catch {
          await runLocal(item);
        }
      }
    };

    await Promise.all([runLocalQueue(queue, runLocal), ...readyLinks.map((l) => peerRunner(l))]);
    async function runLocalQueue(
      q: { text: string; index: number }[],
      run: (item: { text: string; index: number }) => Promise<void>,
    ) {
      while (q.length) {
        const item = q.shift();
        if (!item) return;
        await run(item);
      }
    }

    const blobs = results.filter((b): b is Blob => b !== null);
    if (blobs.length !== chunks.length) throw new Error("Some parts of the script could not be generated.");
    return stitchWavs(blobs);
  }
}
