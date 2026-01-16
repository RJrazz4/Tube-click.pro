import { useState, useRef, useEffect } from "react";
import { Mic, Play, Pause, Square, Volume2, Download, Loader2, Sparkles, Speaker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { incrementStat, saveContent } from "@/lib/stats";

// ElevenLabs voice options with descriptions
const ELEVENLABS_VOICES = [
  { id: 'george', name: 'George', description: 'British male, warm & professional', gender: 'male' },
  { id: 'brian', name: 'Brian', description: 'American male, deep & authoritative', gender: 'male' },
  { id: 'daniel', name: 'Daniel', description: 'British male, calm & storytelling', gender: 'male' },
  { id: 'liam', name: 'Liam', description: 'American male, young & energetic', gender: 'male' },
  { id: 'chris', name: 'Chris', description: 'American male, conversational', gender: 'male' },
  { id: 'charlie', name: 'Charlie', description: 'Australian male, friendly', gender: 'male' },
  { id: 'eric', name: 'Eric', description: 'American male, mature & wise', gender: 'male' },
  { id: 'will', name: 'Will', description: 'American male, casual & engaging', gender: 'male' },
  { id: 'sarah', name: 'Sarah', description: 'American female, soft & soothing', gender: 'female' },
  { id: 'alice', name: 'Alice', description: 'British female, clear & articulate', gender: 'female' },
  { id: 'matilda', name: 'Matilda', description: 'American female, warm & friendly', gender: 'female' },
  { id: 'jessica', name: 'Jessica', description: 'American female, professional', gender: 'female' },
  { id: 'lily', name: 'Lily', description: 'British female, gentle & calming', gender: 'female' },
  { id: 'laura', name: 'Laura', description: 'American female, upbeat & cheerful', gender: 'female' },
];

export default function VoiceStudio() {
  const [text, setText] = useState("");
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const [selectedElevenLabsVoice, setSelectedElevenLabsVoice] = useState("george");
  const [stability, setStability] = useState([0.5]);
  const [speed, setSpeed] = useState([1]);
  
  // Browser TTS state
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [visualizerHeights, setVisualizerHeights] = useState<number[]>(Array(30).fill(20));
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
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
    };
  }, []);

  const animateVisualizer = () => {
    const heights = Array(30).fill(0).map(() => 20 + Math.random() * 80);
    setVisualizerHeights(heights);
    animationRef.current = requestAnimationFrame(animateVisualizer);
  };

  const stopVisualizer = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setVisualizerHeights(Array(30).fill(20));
  };

  const generateElevenLabsAudio = async () => {
    if (!text.trim()) {
      toast.error("Please enter some text to convert to speech");
      return;
    }

    // Validate text length to prevent API overuse
    if (text.length > 5000) {
      toast.error("Text too long. Maximum 5000 characters allowed.");
      return;
    }

    setIsGenerating(true);
    animateVisualizer();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            text,
            voiceId: selectedElevenLabsVoice,
            stability: stability[0],
            similarityBoost: 0.75,
            speed: speed[0],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate audio');
      }

      const audioBlob = await response.blob();
      
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);

      // Auto-play
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onplay = () => {
        setIsPlaying(true);
        animateVisualizer();
      };
      
      audio.onended = () => {
        setIsPlaying(false);
        stopVisualizer();
      };
      
      audio.onpause = () => {
        setIsPlaying(false);
        stopVisualizer();
      };

      await audio.play();

      // Track stats
      incrementStat('voiceoversGenerated');
      saveContent({
        type: 'voiceover',
        title: `ElevenLabs - ${selectedElevenLabsVoice}`,
        content: text
      });

      toast.success("Professional voiceover generated!");

    } catch (error) {
      console.error("ElevenLabs error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate voiceover");
      stopVisualizer();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBrowserTTSPlay = () => {
    if (!text.trim()) {
      toast.error("Please enter some text to convert to speech");
      return;
    }

    // Browser TTS has no text length limit but warn for very long text
    if (text.length > 10000) {
      toast.warning("Very long text may cause browser TTS to be slow or unstable");
    }

    if (isPaused) {
      speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      animateVisualizer();
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = voices.find((v) => v.name === selectedVoice);
    
    if (voice) utterance.voice = voice;
    utterance.rate = rate[0];
    utterance.pitch = pitch[0];

    utterance.onstart = () => {
      setIsPlaying(true);
      animateVisualizer();
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      stopVisualizer();
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
      stopVisualizer();
      toast.error("Speech synthesis error");
    };

    speechSynthesis.speak(utterance);
    
    incrementStat('voiceoversGenerated');
    saveContent({
      type: 'voiceover',
      title: `Browser TTS - ${selectedVoice}`,
      content: text
    });
  };

  const handlePlay = () => {
    if (useElevenLabs) {
      if (audioUrl && audioRef.current) {
        audioRef.current.play();
      } else {
        generateElevenLabsAudio();
      }
    } else {
      handleBrowserTTSPlay();
    }
  };

  const handlePause = () => {
    if (useElevenLabs && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      stopVisualizer();
    } else if (isPlaying) {
      speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
      stopVisualizer();
    }
  };

  const handleStop = () => {
    if (useElevenLabs && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    stopVisualizer();
  };

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `voiceover-${selectedElevenLabsVoice}-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("MP3 downloaded!");
    } else if (useElevenLabs) {
      toast.info("Generate a voiceover first by clicking the Play button");
    } else {
      // BROWSER LIMITATION: Web Speech API cannot export audio blobs
      // Only ElevenLabs provides downloadable MP3 files
      toast.info("MP3 download requires ElevenLabs. Browser TTS cannot export audio files.");
    }
  };

  const handleRegenerate = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
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
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate professional AI voiceovers with ElevenLabs or browser TTS
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Controls */}
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Voice Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-5">
            {/* ElevenLabs Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2">
                <Speaker className="w-4 h-4 text-primary" />
                <Label className="text-sm font-medium">ElevenLabs AI</Label>
              </div>
              <Switch
                checked={useElevenLabs}
                onCheckedChange={(checked) => {
                  setUseElevenLabs(checked);
                  if (audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                    setAudioUrl(null);
                  }
                }}
              />
            </div>

            {useElevenLabs ? (
              <>
                {/* ElevenLabs Voice Selector */}
                <div className="space-y-1.5 md:space-y-2">
                  <Label className="text-sm text-foreground">AI Voice</Label>
                  <Select value={selectedElevenLabsVoice} onValueChange={setSelectedElevenLabsVoice}>
                    <SelectTrigger className="bg-secondary border-border h-10 md:h-11 text-sm">
                      <SelectValue placeholder="Select a voice" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[300px]">
                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Male Voices</div>
                      {ELEVENLABS_VOICES.filter(v => v.gender === 'male').map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{voice.name}</span>
                            <span className="text-xs text-muted-foreground">{voice.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                      <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium mt-2">Female Voices</div>
                      {ELEVENLABS_VOICES.filter(v => v.gender === 'female').map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          <div className="flex flex-col">
                            <span className="font-medium">{voice.name}</span>
                            <span className="text-xs text-muted-foreground">{voice.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedVoiceInfo && (
                    <p className="text-xs text-muted-foreground">{selectedVoiceInfo.description}</p>
                  )}
                </div>

                {/* Stability Slider */}
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground">Stability</Label>
                    <span className="text-xs md:text-sm text-muted-foreground">{(stability[0] * 100).toFixed(0)}%</span>
                  </div>
                  <Slider
                    value={stability}
                    onValueChange={setStability}
                    min={0}
                    max={1}
                    step={0.05}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">Lower = more expressive, Higher = more consistent</p>
                </div>

                {/* Speed Slider */}
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground">Speed</Label>
                    <span className="text-xs md:text-sm text-muted-foreground">{speed[0].toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={speed}
                    onValueChange={setSpeed}
                    min={0.7}
                    max={1.2}
                    step={0.05}
                    className="cursor-pointer"
                  />
                </div>
              </>
            ) : (
              <>
                {/* Browser Voice Selector */}
                <div className="space-y-1.5 md:space-y-2">
                  <Label className="text-sm text-foreground">Browser Voice</Label>
                  <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                    <SelectTrigger className="bg-secondary border-border h-10 md:h-11 text-sm">
                      <SelectValue placeholder="Select a voice" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[300px]">
                      {voices.map((voice) => (
                        <SelectItem key={voice.name} value={voice.name}>
                          <span className="text-xs md:text-sm">
                            {voice.name} ({voice.lang})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rate Slider */}
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground">Speed</Label>
                    <span className="text-xs md:text-sm text-muted-foreground">{rate[0].toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={rate}
                    onValueChange={setRate}
                    min={0.5}
                    max={2}
                    step={0.1}
                    className="cursor-pointer"
                  />
                </div>

                {/* Pitch Slider */}
                <div className="space-y-2 md:space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-foreground">Pitch</Label>
                    <span className="text-xs md:text-sm text-muted-foreground">{pitch[0].toFixed(1)}</span>
                  </div>
                  <Slider
                    value={pitch}
                    onValueChange={setPitch}
                    min={0.5}
                    max={2}
                    step={0.1}
                    className="cursor-pointer"
                  />
                </div>
              </>
            )}

            {/* Quick Samples */}
            <div className="space-y-2">
              <Label className="text-xs md:text-sm text-muted-foreground">Sample scripts</Label>
              <div className="space-y-2">
                {sampleTexts.map((sample, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setText(sample);
                      if (audioUrl) {
                        URL.revokeObjectURL(audioUrl);
                        setAudioUrl(null);
                      }
                    }}
                    className="w-full text-left p-2 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-colors line-clamp-2"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Text & Preview */}
        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Script Editor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (audioUrl) {
                  URL.revokeObjectURL(audioUrl);
                  setAudioUrl(null);
                }
              }}
              placeholder="Enter your voiceover script here..."
              className="min-h-[200px] md:min-h-[250px] bg-secondary border-border focus:border-primary resize-none text-sm md:text-base"
            />

            {/* Character Count */}
            <div className="flex items-center justify-between text-xs md:text-sm text-muted-foreground">
              <span>{text.length} characters</span>
              <span>~{Math.ceil(text.split(/\s+/).filter(Boolean).length / 150)} min read</span>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 md:gap-4 p-4 md:p-6 bg-secondary/50 rounded-xl">
              <Button
                variant="outline"
                size="icon"
                onClick={handleStop}
                disabled={!isPlaying && !isPaused && !isGenerating}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full border-border hover:border-primary/50"
              >
                <Square className="w-4 h-4 md:w-5 md:h-5" />
              </Button>

              <Button
                onClick={isPlaying ? handlePause : handlePlay}
                disabled={isGenerating}
                className={cn(
                  "w-14 h-14 md:w-16 md:h-16 rounded-full",
                  isPlaying ? "cyber-button-secondary" : "cyber-button"
                )}
              >
                {isGenerating ? (
                  <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5 md:w-6 md:h-6 text-accent-foreground" />
                ) : (
                  <Play className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground ml-1" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleDownload}
                disabled={!audioUrl || isGenerating}
                className={cn(
                  "w-10 h-10 md:w-12 md:h-12 rounded-full border-border",
                  audioUrl ? "hover:border-green-500 hover:text-green-400" : ""
                )}
              >
                <Download className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            </div>

            {/* Regenerate Button (ElevenLabs only) */}
            {useElevenLabs && audioUrl && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="border-border hover:border-primary/50"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Regenerate with New Voice
                </Button>
              </div>
            )}

            {/* Visualizer */}
            <div className="flex items-center justify-center gap-1 h-12 md:h-16">
              {visualizerHeights.map((height, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-full transition-all duration-100",
                    isPlaying || isGenerating
                      ? "bg-gradient-to-t from-neon-purple to-neon-cyan"
                      : "bg-border"
                  )}
                  style={{
                    height: `${height}%`,
                    transition: isPlaying || isGenerating ? 'height 0.1s ease' : 'height 0.3s ease'
                  }}
                />
              ))}
            </div>

            {/* Status */}
            <div className="text-center">
              <span className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs md:text-sm",
                isGenerating
                  ? "bg-primary/20 text-primary"
                  : isPlaying 
                  ? "bg-green-500/20 text-green-400" 
                  : isPaused 
                  ? "bg-yellow-500/20 text-yellow-400"
                  : audioUrl
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-secondary text-muted-foreground"
              )}>
                <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {isGenerating ? "Generating..." : isPlaying ? "Playing..." : isPaused ? "Paused" : audioUrl ? "Ready to download MP3" : "Ready to generate"}
              </span>
            </div>

            {/* Info */}
            <p className="text-center text-xs text-muted-foreground">
              {useElevenLabs ? (
                <>✨ Using ElevenLabs AI for professional quality voiceovers with MP3 export</>
              ) : (
                <>🔊 Using browser TTS - switch to ElevenLabs for MP3 downloads</>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
