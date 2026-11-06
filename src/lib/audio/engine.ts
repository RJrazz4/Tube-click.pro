/**
 * src/lib/audio/engine.ts — browser-only audio processing core for the
 * free Audio Tools page. Everything runs on the visitor's device with
 * the Web Audio API: no uploads, no server, no cost per use.
 *
 * Pipeline: File -> decodeAudioData -> (optional reverse) ->
 * OfflineAudioContext graph -> rendered AudioBuffer -> WAV download.
 */

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AC();
  }
  return sharedCtx;
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const raw = await file.arrayBuffer();
  return getCtx().decodeAudioData(raw);
}

export function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = getCtx();
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    for (let i = 0, j = buffer.length - 1; i < buffer.length; i++, j--) dst[i] = src[j];
  }
  return out;
}

/** Stereo noise-decay impulse response for the convolver (reverb). */
export function makeImpulse(ctx: BaseAudioContext, durationSec: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * durationSec));
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

export type GraphBuilder = (
  ctx: OfflineAudioContext,
  source: AudioBufferSourceNode,
) => AudioNode;

/**
 * Render `buffer` through the graph the builder returns. The builder
 * receives the source node and must return the last node in the chain
 * (it is connected to the destination). playbackRate changes both the
 * rendered length and the pitch, exactly like classic speed tools.
 */
export async function renderProcessed(
  buffer: AudioBuffer,
  builder: GraphBuilder,
  opts: { playbackRate?: number } = {},
): Promise<AudioBuffer> {
  const rate = opts.playbackRate && opts.playbackRate > 0 ? opts.playbackRate : 1;
  const frames = Math.max(1, Math.ceil((buffer.length / rate) * 1.02));
  const offline = new OfflineAudioContext(buffer.numberOfChannels, frames, buffer.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const tail = builder(offline, source);
  tail.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

/** Dry/wet reverb chain ending in a gain, for graph builders. */
export function withReverb(
  ctx: OfflineAudioContext,
  input: AudioNode,
  wet: number,
  decaySec = 2.2,
): AudioNode {
  const dry = ctx.createGain();
  dry.gain.value = 1 - wet * 0.5;
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, decaySec, 2.4);
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  const out = ctx.createGain();
  input.connect(dry);
  dry.connect(out);
  input.connect(convolver);
  convolver.connect(wetGain);
  wetGain.connect(out);
  return out;
}

/** Encode an AudioBuffer as a 16-bit PCM WAV blob. */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const view = new DataView(ab);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) channelData.push(buffer.getChannelData(ch));
  let off = 44;
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      const s = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
