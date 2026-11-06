import { useMemo, useRef, useState } from "react";
import {
  AudioWaveform,
  Download,
  FileAudio,
  Loader2,
  Play,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import {
  audioBufferToWavBlob,
  decodeAudioFile,
  downloadBlob,
  renderProcessed,
  reverseBuffer,
  withReverb,
  type GraphBuilder,
} from "@/lib/audio/engine";

/**
 * /audio-tools — free, unlimited audio tools that run 100% in the
 * visitor's browser (Web Audio API). No uploads, no server, no cost.
 * Launch magnet for USA creators; every tool from the menu is listed
 * from day one — Phase 1 tools are live, later phases carry a badge.
 */

type Slider = { key: string; label: string; min: number; max: number; step: number; def: number; unit?: string };
type Params = Record<string, number>;

type ToolDef = {
  id: string;
  name: string;
  group: "Effects" | "Voice & AI" | "Edit & Convert" | "Create & Analyze";
  desc: string;
  live: boolean;
  phase?: 2 | 3;
  sliders?: Slider[];
  reverse?: boolean;
  rate?: (p: Params) => number;
  build?: (p: Params) => GraphBuilder;
};

const gainChain = (amount: number): GraphBuilder => (ctx, source) => {
  const g = ctx.createGain();
  g.gain.value = amount;
  source.connect(g);
  return g;
};

const TOOLS: ToolDef[] = [
  // ---------------------------------------------------------- Effects
  {
    id: "volume-booster", name: "Volume Booster", group: "Effects", live: true,
    desc: "Make any quiet audio louder — up to 3x.",
    sliders: [{ key: "gain", label: "Volume", min: 0.1, max: 3, step: 0.05, def: 1.5, unit: "x" }],
    build: (p) => gainChain(p.gain),
  },
  {
    id: "bass-boost", name: "Bass Boost", group: "Effects", live: true,
    desc: "Heavy low-end punch for music and voice.",
    sliders: [{ key: "db", label: "Bass", min: 0, max: 24, step: 1, def: 12, unit: "dB" }],
    build: (p) => (ctx, source) => {
      const shelf = ctx.createBiquadFilter();
      shelf.type = "lowshelf"; shelf.frequency.value = 180; shelf.gain.value = p.db;
      source.connect(shelf);
      return shelf;
    },
  },
  {
    id: "eq", name: "EQ", group: "Effects", live: true,
    desc: "Three-band equalizer: lows, mids, highs.",
    sliders: [
      { key: "low", label: "Low", min: -15, max: 15, step: 1, def: 0, unit: "dB" },
      { key: "mid", label: "Mid", min: -15, max: 15, step: 1, def: 0, unit: "dB" },
      { key: "high", label: "High", min: -15, max: 15, step: 1, def: 0, unit: "dB" },
    ],
    build: (p) => (ctx, source) => {
      const low = ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 250; low.gain.value = p.low;
      const mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 1; mid.gain.value = p.mid;
      const high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 4000; high.gain.value = p.high;
      source.connect(low); low.connect(mid); mid.connect(high);
      return high;
    },
  },
  {
    id: "8d-audio", name: "8D Audio", group: "Effects", live: true,
    desc: "Sound circles around your head (headphones on).",
    sliders: [{ key: "speed", label: "Circle speed", min: 0.05, max: 0.6, step: 0.01, def: 0.18, unit: "Hz" }],
    build: (p) => (ctx, source) => {
      const panner = ctx.createStereoPanner();
      const osc = ctx.createOscillator();
      osc.frequency.value = p.speed;
      const depth = ctx.createGain(); depth.gain.value = 0.85;
      osc.connect(depth); depth.connect(panner.pan);
      osc.start(0);
      source.connect(panner);
      return panner;
    },
  },
  {
    id: "add-reverb", name: "Add Reverb", group: "Effects", live: true,
    desc: "Room and hall echo for any recording.",
    sliders: [
      { key: "wet", label: "Reverb amount", min: 0, max: 1, step: 0.05, def: 0.4 },
      { key: "decay", label: "Room size", min: 0.5, max: 5, step: 0.1, def: 2.2, unit: "s" },
    ],
    build: (p) => (ctx, source) => withReverb(ctx, source, p.wet, p.decay),
  },
  {
    id: "slowed-reverb", name: "Slowed + Reverb", group: "Effects", live: true,
    desc: "The classic slowed-and-reverb edit.",
    sliders: [
      { key: "speed", label: "Speed", min: 0.5, max: 1, step: 0.01, def: 0.8, unit: "x" },
      { key: "wet", label: "Reverb amount", min: 0, max: 1, step: 0.05, def: 0.45 },
    ],
    rate: (p) => p.speed,
    build: (p) => (ctx, source) => withReverb(ctx, source, p.wet, 2.6),
  },
  {
    id: "tiktok-slowed", name: "TikTok Slowed", group: "Effects", live: true,
    desc: "Deep slow + dreamy reverb, TikTok style.",
    sliders: [
      { key: "speed", label: "Speed", min: 0.5, max: 1, step: 0.01, def: 0.72, unit: "x" },
      { key: "wet", label: "Reverb amount", min: 0, max: 1, step: 0.05, def: 0.55 },
    ],
    rate: (p) => p.speed,
    build: (p) => (ctx, source) => withReverb(ctx, source, p.wet, 3),
  },
  {
    id: "sped-up", name: "Sped Up Audio", group: "Effects", live: true,
    desc: "Speed any song or voice up to 2x.",
    sliders: [{ key: "speed", label: "Speed", min: 1, max: 2, step: 0.01, def: 1.25, unit: "x" }],
    rate: (p) => p.speed,
    build: () => (ctx, source) => { const g = ctx.createGain(); source.connect(g); return g; },
  },
  {
    id: "nightcore", name: "Nightcore", group: "Effects", live: true,
    desc: "Faster + brighter — the anime-edit sound.",
    sliders: [{ key: "speed", label: "Speed", min: 1.1, max: 1.45, step: 0.01, def: 1.25, unit: "x" }],
    rate: (p) => p.speed,
    build: () => (ctx, source) => {
      const shelf = ctx.createBiquadFilter();
      shelf.type = "highshelf"; shelf.frequency.value = 3500; shelf.gain.value = 4;
      source.connect(shelf);
      return shelf;
    },
  },
  {
    id: "nightcore-reverse", name: "Nightcore Reverse", group: "Effects", live: true,
    desc: "Reversed audio with the nightcore lift.",
    reverse: true,
    sliders: [{ key: "speed", label: "Speed", min: 1.1, max: 1.45, step: 0.01, def: 1.25, unit: "x" }],
    rate: (p) => p.speed,
    build: () => (ctx, source) => { const g = ctx.createGain(); source.connect(g); return g; },
  },
  {
    id: "vaporwave", name: "Vaporwave", group: "Effects", live: true,
    desc: "Slow, smooth and nostalgic.",
    sliders: [{ key: "speed", label: "Speed", min: 0.6, max: 1, step: 0.01, def: 0.85, unit: "x" }],
    rate: (p) => p.speed,
    build: () => (ctx, source) => {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 2800;
      source.connect(lp);
      return withReverb(ctx, lp, 0.25, 2);
    },
  },
  // --------------------------------------------------- Voice & AI (later)
  { id: "text-to-speech", name: "Text to Speech", group: "Voice & AI", live: false, phase: 2, desc: "Unlimited AI voiceover (Kokoro) — runs in your browser." },
  { id: "speech-to-text", name: "Speech to Text", group: "Voice & AI", live: false, phase: 2, desc: "Transcribe audio with Whisper, on-device." },
  { id: "vocal-remover", name: "Vocal Remover", group: "Voice & AI", live: false, phase: 3, desc: "Separate vocals from any song." },
  { id: "stem-splitter", name: "Stem Splitter", group: "Voice & AI", live: false, phase: 3, desc: "Split a song into vocals, drums, bass and more." },
  { id: "voice-cloning", name: "Voice Cloning", group: "Voice & AI", live: false, phase: 3, desc: "Clone a voice from a short sample." },
  { id: "voice-changer", name: "Voice Changer", group: "Voice & AI", live: false, phase: 3, desc: "Reshape a voice with formant shifting." },
  { id: "vocal-tuner", name: "Vocal Tuner", group: "Voice & AI", live: false, phase: 3, desc: "Pitch-correct vocals." },
  { id: "voice-to-instrument", name: "Voice to Instrument", group: "Voice & AI", live: false, phase: 3, desc: "Turn humming into instruments." },
  { id: "speech-to-song", name: "Speech to Song", group: "Voice & AI", live: false, phase: 3, desc: "Make speech sing." },
  { id: "noise-remover", name: "Noise Remover", group: "Voice & AI", live: false, phase: 3, desc: "Clean background noise from recordings." },
  // -------------------------------------------------- Edit & Convert
  {
    id: "pitch-shifter", name: "Pitch Shifter", group: "Edit & Convert", live: true,
    desc: "Shift pitch by semitones (length changes too — classic style).",
    sliders: [{ key: "semi", label: "Semitones", min: -12, max: 12, step: 1, def: 4 }],
    rate: (p) => Math.pow(2, p.semi / 12),
    build: () => (ctx, source) => { const g = ctx.createGain(); source.connect(g); return g; },
  },
  {
    id: "tempo-changer", name: "Tempo Changer", group: "Edit & Convert", live: true,
    desc: "Change speed from half to double (pitch follows, like classic tools).",
    sliders: [{ key: "speed", label: "Tempo", min: 0.5, max: 2, step: 0.01, def: 1.1, unit: "x" }],
    rate: (p) => p.speed,
    build: () => (ctx, source) => { const g = ctx.createGain(); source.connect(g); return g; },
  },
  {
    id: "reverse-audio", name: "Reverse Audio", group: "Edit & Convert", live: true,
    desc: "Play any audio backwards.",
    reverse: true,
    build: () => (ctx, source) => { const g = ctx.createGain(); source.connect(g); return g; },
  },
  { id: "audio-converter", name: "Audio Converter", group: "Edit & Convert", live: false, phase: 2, desc: "Convert between MP3, WAV, FLAC and more." },
  { id: "audio-trimmer", name: "Audio Trimmer", group: "Edit & Convert", live: false, phase: 2, desc: "Cut the exact part you need." },
  { id: "audio-joiner", name: "Audio Joiner", group: "Edit & Convert", live: false, phase: 2, desc: "Merge multiple files into one." },
  { id: "video-to-audio", name: "Video to Audio", group: "Edit & Convert", live: false, phase: 2, desc: "Extract the audio track from a video." },
  { id: "metadata-editor", name: "Metadata Editor", group: "Edit & Convert", live: false, phase: 2, desc: "Edit title, artist and tags." },
  { id: "flac-cover-art", name: "FLAC Cover Art", group: "Edit & Convert", live: false, phase: 3, desc: "Add or change cover art." },
  // ------------------------------------------------- Create & Analyze
  { id: "bpm-detector", name: "BPM Detector", group: "Create & Analyze", live: false, phase: 2, desc: "Find the tempo of any track." },
  { id: "music-visualizer", name: "Music Visualizer", group: "Create & Analyze", live: false, phase: 2, desc: "Turn audio into animated visuals." },
  { id: "soundboard", name: "Soundboard", group: "Create & Analyze", live: false, phase: 2, desc: "Your sounds, one tap away." },
  { id: "hearing-test", name: "Hearing Test", group: "Create & Analyze", live: false, phase: 2, desc: "Check your hearing range." },
  { id: "beat-maker", name: "Beat Maker", group: "Create & Analyze", live: false, phase: 3, desc: "Make beats in the browser." },
  { id: "granular-synthesizer", name: "Granular Synthesizer", group: "Create & Analyze", live: false, phase: 3, desc: "Stretch audio into textures." },
];

const GROUPS: ToolDef["group"][] = ["Effects", "Voice & AI", "Edit & Convert", "Create & Analyze"];

export default function AudioTools() {
  const [selectedId, setSelectedId] = useState<string>("volume-booster");
  const tool = useMemo(() => TOOLS.find((t) => t.id === selectedId) || TOOLS[0], [selectedId]);
  const [params, setParams] = useState<Params>({});
  const [fileName, setFileName] = useState<string>("");
  const [srcBuffer, setSrcBuffer] = useState<AudioBuffer | null>(null);
  const [srcUrl, setSrcUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [resultUrl, setResultUrl] = useState<string>("");
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const effectiveParams: Params = useMemo(() => {
    const out: Params = {};
    for (const s of tool.sliders || []) out[s.key] = params[s.key] ?? s.def;
    return out;
  }, [tool, params]);

  const pickTool = (t: ToolDef) => {
    setSelectedId(t.id);
    setParams({});
    setResultUrl("");
    setResultBlob(null);
    setError("");
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setError("");
    setResultUrl("");
    setResultBlob(null);
    try {
      const buf = await decodeAudioFile(file);
      setSrcBuffer(buf);
      setFileName(file.name);
      setSrcUrl(URL.createObjectURL(file));
    } catch {
      setError("This file could not be read as audio. Try an MP3 or WAV file.");
    }
  };

  const process = async () => {
    if (!srcBuffer || !tool.build) return;
    setBusy(true);
    setError("");
    setResultUrl("");
    setResultBlob(null);
    try {
      const input = tool.reverse ? reverseBuffer(srcBuffer) : srcBuffer;
      const rendered = await renderProcessed(input, tool.build(effectiveParams), {
        playbackRate: tool.rate ? tool.rate(effectiveParams) : 1,
      });
      const blob = audioBufferToWavBlob(rendered);
      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
    } catch {
      setError("Processing failed on this device. Try a shorter file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 text-zinc-100">
      {/* Banner — Hero's positioning line */}
      <div className="rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-600/20 via-zinc-900 to-zinc-900 p-6">
        <div className="flex items-center gap-2 text-fuchsia-300">
          <AudioWaveform className="h-6 w-6" />
          <span className="text-sm font-semibold uppercase tracking-widest">Free Audio Tools</span>
        </div>
        <h1 className="mt-2 text-3xl font-bold leading-tight">
          Only for USA Creators — Unlimited Voice &amp; Audio Tools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-300">
          100% free. Everything runs in <strong>your browser</strong> — your files never upload to
          any server. No sign-up, no limits, no watermarks.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Tool catalogue — every tool listed from day one */}
        <div className="space-y-8">
          {GROUPS.map((group) => (
            <section key={group}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-400">{group}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {TOOLS.filter((t) => t.group === group).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => t.live && pickTool(t)}
                    className={`rounded-xl border p-4 text-left transition ${
                      t.live
                        ? selectedId === t.id
                          ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                          : "border-white/10 bg-white/5 hover:border-fuchsia-500/40"
                        : "cursor-default border-white/5 bg-white/[0.02] opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{t.name}</span>
                      {t.live ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">LIVE</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                          PHASE {t.phase}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{t.desc}</p>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Workspace for the selected live tool */}
        <aside className="h-fit rounded-2xl border border-white/10 bg-white/5 p-5 lg:sticky lg:top-6">
          <div className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-fuchsia-300" />
            <h3 className="text-lg font-semibold">{tool.name}</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{tool.desc}</p>

          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-6 text-sm text-zinc-300 transition hover:border-fuchsia-500/50 hover:text-white"
          >
            {fileName ? <FileAudio className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
            {fileName || "Choose an audio file (MP3, WAV…)"}
          </button>

          {srcUrl && (
            <div className="mt-4">
              <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Original</p>
              <audio controls src={srcUrl} className="w-full" />
            </div>
          )}

          {(tool.sliders || []).map((s) => (
            <label key={s.key} className="mt-4 block">
              <span className="flex justify-between text-sm text-zinc-300">
                <span>{s.label}</span>
                <span className="text-zinc-500">
                  {effectiveParams[s.key]}
                  {s.unit || ""}
                </span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={effectiveParams[s.key]}
                onChange={(e) => setParams((p) => ({ ...p, [s.key]: Number(e.target.value) }))}
                className="mt-1 w-full accent-fuchsia-500"
              />
            </label>
          ))}

          <button
            onClick={process}
            disabled={!srcBuffer || busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-3 font-semibold text-white transition hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
            {busy ? "Processing on your device…" : "Process audio"}
          </button>

          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

          {resultUrl && (
            <div className="mt-4">
              <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-wider text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" /> Result
              </p>
              <audio controls src={resultUrl} className="w-full" />
              <button
                onClick={() => resultBlob && downloadBlob(resultBlob, `${tool.id}-output.wav`)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white transition hover:bg-emerald-500"
              >
                <Download className="h-4 w-4" /> Download WAV
              </button>
            </div>
          )}

          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            Your file is processed entirely on this device and is never uploaded anywhere.
          </p>
        </aside>
      </div>
    </div>
  );
}
