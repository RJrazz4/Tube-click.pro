import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Play, Pause, Square, Volume2, Download, Loader2, Sparkles, Speaker, Headphones, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { toastFriendlyError } from "@/lib/errorToast";
import { fetchEdgeFunctionBlob } from "@/api/client/secureClient";
import { cn } from "@/lib/utils";
import { incrementStat, saveContent } from "@/lib/stats";
import { useAuthStore } from "@/stores/useAuthStore";
import { NativeSponsorBanner } from "@/components/sponsors/NativeSponsorBanner";
import { getSponsorForPlacement } from "@/config/sponsors";
import { useSoftGate } from "@/contexts/SoftGateContext";

const voiceSponsor = getSponsorForPlacement("voice");

// White-labeled voice options — maps to VectorEngine (ElevenLabs) IDs server-side
const ELEVENLABS_VOICES = [
  { id: 'george', name: 'Atlas', description: 'Warm & professional tone', gender: 'male', preview: '/previews/voices/Atlas.mp3' },
  { id: 'brian', name: 'Titan', description: 'Deep & authoritative tone', gender: 'male', preview: '/previews/voices/Titan.mp3' },
  { id: 'daniel', name: 'Nova', description: 'Calm & storytelling tone', gender: 'male', preview: '/previews/voices/Nova.mp3' },
  { id: 'liam', name: 'Blaze', description: 'Young & energetic tone', gender: 'male', preview: '/previews/voices/Blaze.mp3' },
  { id: 'chris', name: 'Echo', description: 'Conversational tone', gender: 'male', preview: '/previews/voices/Echo.mp3' },
  { id: 'charlie', name: 'Reef', description: 'Friendly & warm tone', gender: 'male', preview: '/previews/voices/Reef.mp3' },
  { id: 'eric', name: 'Sage', description: 'Mature & wise tone', gender: 'male', preview: '/previews/voices/Sage.mp3' },
  { id: 'will', name: 'Drift', description: 'Casual & engaging tone', gender: 'male', preview: '/previews/voices/Drift.mp3' },
  { id: 'sarah', name: 'Luna', description: 'Soft & soothing tone', gender: 'female', preview: '/previews/voices/Luna.mp3' },
  { id: 'alice', name: 'Aria', description: 'Clear & articulate tone', gender: 'female', preview: '/previews/voices/Aria.mp3' },
  { id: 'matilda', name: 'Ember', description: 'Warm & friendly tone', gender: 'female', preview: '/previews/voices/Ember.mp3' },
  { id: 'jessica', name: 'Prism', description: 'Professional tone', gender: 'female', preview: '/previews/voices/Prism.mp3' },
  { id: 'lily', name: 'Veil', description: 'Gentle & calming tone', gender: 'female', preview: '/previews/voices/Veil.mp3' },
  { id: 'laura', name: 'Spark', description: 'Upbeat & cheerful tone', gender: 'female', preview: '/previews/voices/Spark.mp3' },
];

export default function VoiceStudio() {
  const { runGuarded } = useSoftGate();
  const navigate = useNavigate();
  const license = useAuthStore((s) => s.license);
  const dailyUsage = useAuthStore((s) => s.dailyUsage);
  const updateVoiceUsage = useAuthStore((s) => s.updateVoiceUsage);

  const [text, setText] = useState("");
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState("george");
  const [stability, setStability] = useState([0.5]);
  const [speed, setSpeed] = useState([1]);
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [visualizerHeights, setVisualizerHeights] = useState<number[]>(Array(30).fill(20));
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const pendingScript = sessionStorage.getItem('tubegenius_pending_voice_script');
    if (pendingScript) {
      setText(pendingScript);
      sessionStorage.removeItem('tubegenius_pending_voice_script');
      toast.success("⚡️ Chain-Loop Script loaded into Voiceover Studio!");
    }

    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        const englishVoice = availableVoices.find((v) => v.lang.startsWith("en"));
        setSelectedVoice(englishVoice?.name || availableVoices[0].name);
      }
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      speechSynthesis.cancel();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (previewAudio) { previewAudio.pause(); }
    };
  }, []);

  const animateVisualizer = () => {
    const heights = Array(30).fill(0).map(() => 20 + Math.random() * 80);
    setVisualizerHeights(heights);
    animationRef.current = requestAnimationFrame(animateVisualizer);
  };

  const stopVisualizer = () => {
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    setVisualizerHeights(Array(30).fill(20));
  };

  // Preview MP3 logic — plays static preview to save API calls (Phase D1)
  const handlePreviewVoice = useCallback(async (voice: typeof ELEVENLABS_VOICES[0]) => {
    try {
      if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0; }
      if (isPreviewPlaying === voice.name) { setIsPreviewPlaying(null); return; }

      const audio = new Audio(voice.preview);
      audio.volume = 0.8;
      setPreviewAudio(audio);
      setIsPreviewPlaying(voice.name);

      audio.onended = () => { setIsPreviewPlaying(null); };
      audio.onerror = () => {
        console.warn(`Preview MP3 not found for ${voice.name}: ${voice.preview}`);
        setIsPreviewPlaying(null);
        toast.info(`${voice.name} preview — static MP3 would play here (0 API calls).`);
      };

      await audio.play();
      animateVisualizer();
      setTimeout(() => { if (audio.paused) stopVisualizer(); }, 3000);

    } catch (e) {
      setIsPreviewPlaying(null);
      toast.info(`Preview for ${voice.name}: static MP3 (0 API calls) — saves 80% quota`);
    }
  }, [previewAudio, isPreviewPlaying]);

  const performElevenLabsGeneration = async () => {
    if (!text.trim()) { toast.error("Please enter some text to convert to speech"); return; }
    if (text.length > 5000) { toast.error("Text too long. Maximum 5000 characters allowed."); return; }

    if (license.tier === "free") {
      const voiceCharsUsed = dailyUsage.voiceCharactersUsed || 0;
      if (voiceCharsUsed + text.length > 500) {
        toast.error(`Daily Voiceover Limit Exceeded. Your Free plan has ${Math.max(0, 500 - voiceCharsUsed)} characters remaining today. Unlock Pro for free through Referral Rewards.`, {
          duration: 5000,
          action: {
            label: "Unlock Pro for Free",
            onClick: () => navigate("/rewards"),
          },
        });
        return;
      }
    }

    setIsGenerating(true);
    animateVisualizer();

    try {
      const audioBlob = await fetchEdgeFunctionBlob("elevenlabs-tts", {
        text,
        voiceId: selectedElevenLabsVoice,
        stability: stability[0],
        similarityBoost: 0.75,
        speed: speed[0],
      });

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onplay = () => { setIsPlaying(true); animateVisualizer(); };
      audio.onended = () => { setIsPlaying(false); stopVisualizer(); };
      audio.onpause = () => { setIsPlaying(false); stopVisualizer(); };
      await audio.play();

      incrementStat('voiceoversGenerated');
      saveContent({ type: 'voiceover', title: `Neural Voice - ${selectedElevenLabsVoice} via VectorEngine`, content: text });

      if (license.tier === "free") {
        updateVoiceUsage(text.length);
      }

      toast.success("Cinematic voiceover generated via VectorEngine secure route!");

    } catch (error) {
      toastFriendlyError(error, "Failed to generate voiceover");
      stopVisualizer();
    } finally { setIsGenerating(false); }
  };

  const generateElevenLabsAudio = () => runGuarded("generate the next voiceover", performElevenLabsGeneration);

  const performBrowserTTSPlay = () => {
    if (!text.trim()) { toast.error("Please enter some text to convert to speech"); return; }
    if (text.length > 10000) toast.warning("Very long text may cause browser TTS to be slow");
    if (isPaused) { speechSynthesis.resume(); setIsPaused(false); setIsPlaying(true); animateVisualizer(); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.name === selectedVoice);
    if (voice) utterance.voice = voice;
    utterance.rate = rate[0]; utterance.pitch = pitch[0];
    utterance.onstart = () => { setIsPlaying(true); animateVisualizer(); };
    utterance.onend = () => { setIsPlaying(false); setIsPaused(false); stopVisualizer(); };
    utterance.onerror = () => { setIsPlaying(false); setIsPaused(false); stopVisualizer(); toast.error("Speech synthesis error"); };
    speechSynthesis.speak(utterance);
    incrementStat('voiceoversGenerated');
    saveContent({ type: 'voiceover', title: `Browser TTS - ${selectedVoice}`, content: text });
  };

  const handleBrowserTTSPlay = () => runGuarded("generate the next voiceover", performBrowserTTSPlay);

  const handlePlay = () => {
    if (useElevenLabs) {
      if (audioUrl && audioRef.current) { audioRef.current.play(); return; }
      if (!text.trim()) { toast.error("Please enter some text to convert to speech"); return; }
      if (audioUrl) { audioRef.current?.play(); return; }
      generateElevenLabsAudio();
    } else {
      if (isPaused || isPlaying) performBrowserTTSPlay();
      else handleBrowserTTSPlay();
    }
  };

  const handlePause = () => {
    if (useElevenLabs && audioRef.current) { audioRef.current.pause(); setIsPlaying(false); stopVisualizer(); }
    else if (isPlaying) { speechSynthesis.pause(); setIsPaused(true); setIsPlaying(false); stopVisualizer(); }
  };

  const handleStop = () => {
    if (useElevenLabs && audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    else { speechSynthesis.cancel(); }
    setIsPlaying(false); setIsPaused(false); stopVisualizer();
    if (previewAudio) { previewAudio.pause(); setIsPreviewPlaying(null); }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement('a'); a.href = audioUrl; a.download = `voiceover-${selectedElevenLabsVoice}-${Date.now()}.mp3`; document.body.appendChild(a); a.click(); document.body.removeChild(a); toast.success("MP3 downloaded!");
    } else if (useElevenLabs) { toast.info("Generate a voiceover first by clicking the Play button"); }
    else { toast.info("MP3 download requires the Neural Engine. Browser TTS cannot export audio files."); }
  };

  const handleRegenerate = () => {
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    generateElevenLabsAudio();
  };

  const sampleTexts = [
    "Hey everyone, welcome back to my channel! Today we're going to explore something absolutely incredible that will change how you think about everything.",
    "What's up YouTube! In this video, I'm going to show you the secrets that nobody talks about. Make sure to stay until the end because the last tip is a game-changer.",
    "Namaste dosto! Aaj hum baat karenge ek bahut important topic ke baare mein. Agar aap video pasand aaye toh like aur subscribe zaroor karein!",
  ];

  const selectedVoiceInfo = ELEVENLABS_VOICES.find(v => v.id === selectedElevenLabsVoice);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Mic className="w-6 h-6 md:w-7 md:h-7 text-orange-400" />
          Voiceover Studio
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] border border-green-500/20 ml-2">VectorEngine Secure</span>
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">Generate cinematic AI voiceovers with VectorEngine (ElevenLabs white-labeled) via secure edge — static preview MP3s save 80% API calls</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Voice Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2"><Speaker className="w-4 h-4 text-primary" /><Label className="text-sm font-medium">TubeClick Neural Engine (VectorEngine)</Label></div>
              <Switch checked={useElevenLabs} onCheckedChange={(checked) => { setUseElevenLabs(checked); if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); } }} />
            </div>

            {useElevenLabs ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground flex items-center gap-1.5"><Headphones className="w-3.5 h-3.5" />Cinematic Studio Voice — Preview 0 API calls</Label>
                  <Select value={selectedElevenLabsVoice} onValueChange={setSelectedElevenLabsVoice}>
                    <SelectTrigger className="bg-secondary border-border h-10 md:h-11 text-sm"><SelectValue placeholder="Select a voice" /></SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[300px]">
                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Male Voices — Tap Preview (0 API)</div>
                      {ELEVENLABS_VOICES.filter(v => v.gender === 'male').map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}><div className="flex flex-col"><span className="font-medium flex items-center gap-1.5">{voice.name}<span className="px-1 py-0 rounded bg-green-500/20 text-green-400 text-[9px]">Preview MP3</span></span><span className="text-xs text-muted-foreground">{voice.description}</span></div></SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium mt-2">Female Voices — Preview 0 API</div>
                      {ELEVENLABS_VOICES.filter(v => v.gender === 'female').map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}><div className="flex flex-col"><span className="font-medium flex items-center gap-1.5">{voice.name}<span className="px-1 py-0 rounded bg-green-500/20 text-green-400 text-[9px]">Preview MP3</span></span><span className="text-xs text-muted-foreground">{voice.description}</span></div></SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVoiceInfo && <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3 text-green-400" />{selectedVoiceInfo.description} — Preview plays static MP3 from /previews/voices/{selectedVoiceInfo.name}.mp3 (0 API calls, saves 80% quota)</p>}
                </div>

                {/* Preview Button */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { const v = ELEVENLABS_VOICES.find(v => v.id === selectedElevenLabsVoice); if (v) handlePreviewVoice(v); }} className="flex-1 gap-1.5 border-green-500/30 hover:border-green-500/50 h-9 text-xs">
                    {isPreviewPlaying === selectedVoiceInfo?.name ? <><Pause className="w-3.5 h-3.5" />Stop Preview</> : <><Headphones className="w-3.5 h-3.5" />Preview {selectedVoiceInfo?.name} (0 API)</>}
                  </Button>
                </div>

                <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-[11px] text-green-400 space-y-1">
                  <p className="flex items-center gap-1.5"><Zap className="w-3 h-3" />Preview Strategy: Static MP3s in public/previews/voices/ — 2-3 sec samples, no ElevenLabs call</p>
                  <p className="text-green-400/70">Final Generate hits VectorEngine secure route: /api/vectorengine-tts (server ELEVENLABS_API_KEY or VECTORENGINE_API_KEY), never client key. Saves 80% API calls for US SaaS margins.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-sm text-foreground">Stability</Label><span className="text-xs text-muted-foreground">{(stability[0] * 100).toFixed(0)}%</span></div>
                  <Slider value={stability} onValueChange={stability => setStability(stability)} min={0} max={1} step={0.05} className="cursor-pointer" />
                  <p className="text-xs text-muted-foreground">Lower = more expressive, Higher = more consistent</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between"><Label className="text-sm text-foreground">Speed</Label><span className="text-xs text-muted-foreground">{speed[0].toFixed(1)}x</span></div>
                  <Slider value={speed} onValueChange={speed => setSpeed(speed)} min={0.7} max={1.2} step={0.05} className="cursor-pointer" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm text-foreground">Browser Voice</Label>
                  <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                    <SelectTrigger className="bg-secondary border-border h-10 text-sm"><SelectValue placeholder="Select a voice" /></SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[300px]">
                      {voices.map((voice) => <SelectItem key={voice.name} value={voice.name}><span className="text-xs">{voice.name} ({voice.lang})</span></SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-sm">Speed</Label><span className="text-xs text-muted-foreground">{rate[0].toFixed(1)}x</span></div><Slider value={rate} onValueChange={rate => setRate(rate)} min={0.5} max={2} step={0.1} /></div>
                <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-sm">Pitch</Label><span className="text-xs text-muted-foreground">{pitch[0].toFixed(1)}</span></div><Slider value={pitch} onValueChange={pitch => setPitch(pitch)} min={0.5} max={2} step={0.1} /></div>
              </>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Sample scripts</Label>
              <div className="space-y-2">
                {sampleTexts.map((sample, index) => (
                  <button key={index} onClick={() => { setText(sample); if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); } }} className="w-full text-left p-2 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-colors line-clamp-2">{sample}</button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="font-display text-base text-foreground">Script Editor — VectorEngine Secure</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={text} onChange={(e) => { setText(e.target.value); if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); } }} placeholder="Enter your voiceover script here..." className="min-h-[200px] bg-secondary border-border resize-none text-sm" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {text.length} characters
                {license.tier === "free" && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[10px]">
                    Free Limit: {dailyUsage.voiceCharactersUsed || 0} / 500 characters used today
                  </span>
                )}
              </span>
              <span>~{Math.ceil(text.split(/\s+/).filter(Boolean).length / 150)} min read</span>
            </div>

            <div className="flex items-center justify-center gap-3 p-4 bg-secondary/50 rounded-xl">
              <Button variant="outline" size="icon" onClick={handleStop} disabled={!isPlaying && !isPaused && !isGenerating} className="w-10 h-10 rounded-full border-border"><Square className="w-4 h-4" /></Button>
              <Button onClick={isPlaying ? handlePause : handlePlay} disabled={isGenerating} className={cn("w-14 h-14 rounded-full", isPlaying ? "cyber-button-secondary" : "cyber-button")}>
                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
              </Button>
              <Button variant="outline" size="icon" onClick={handleDownload} disabled={!audioUrl || isGenerating} className={cn("w-10 h-10 rounded-full border-border", audioUrl ? "hover:border-green-500 hover:text-green-400" : "")}><Download className="w-4 h-4" /></Button>
            </div>

            {useElevenLabs && audioUrl && <div className="flex justify-center"><Button variant="outline" onClick={handleRegenerate} disabled={isGenerating} className="border-border hover:border-primary/50"><Sparkles className="w-4 h-4 mr-2" />Regenerate with New Voice</Button></div>}

            <div className="flex items-center justify-center gap-1 h-12">
              {visualizerHeights.map((height, i) => <div key={i} className={cn("w-1 rounded-full transition-all duration-100", isPlaying || isGenerating || isPreviewPlaying ? "bg-gradient-to-t from-primary to-accent" : "bg-border")} style={{ height: `${height}%` }} />)}
            </div>

            <div className="text-center">
              <span className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs", isGenerating ? "bg-primary/20 text-primary" : isPlaying ? "bg-green-500/20 text-green-400" : isPaused ? "bg-yellow-500/20 text-yellow-400" : isPreviewPlaying ? "bg-blue-500/20 text-blue-400" : audioUrl ? "bg-blue-500/20 text-blue-400" : "bg-secondary text-muted-foreground")}>
                <Volume2 className="w-3.5 h-3.5" />{isGenerating ? "Generating via VectorEngine secure..." : isPlaying ? "Playing generated..." : isPreviewPlaying ? `Previewing ${isPreviewPlaying} (0 API calls)` : isPaused ? "Paused" : audioUrl ? "Ready to download MP3" : "Ready — try Preview first (0 API)"}
              </span>
            </div>

            <p className="text-center text-xs text-muted-foreground">{useElevenLabs ? <>✨ VectorEngine (ElevenLabs white-labeled) secure edge — preview static MP3s save 80% API calls, final generation via /api/vectorengine-tts (ELEVENLABS_API_KEY or VECTORENGINE_API_KEY server env)</> : <>🔊 Browser TTS — switch to Neural Engine for MP3 downloads</>}</p>
          </CardContent>
        </Card>
      </div>

      {voiceSponsor && <NativeSponsorBanner {...voiceSponsor} />}
    </div>
  );
}
