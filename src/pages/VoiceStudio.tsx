import { useState, useRef, useEffect } from "react";
import { Mic, Play, Pause, Volume2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Voice {
  name: string;
  lang: string;
  gender: "male" | "female";
}

export default function VoiceStudio() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      const formattedVoices: Voice[] = availableVoices
        .filter((v) => v.lang.startsWith("en"))
        .map((v) => ({
          name: v.name,
          lang: v.lang,
          gender: v.name.toLowerCase().includes("female") || 
                  v.name.toLowerCase().includes("samantha") ||
                  v.name.toLowerCase().includes("victoria") ||
                  v.name.toLowerCase().includes("karen")
            ? "female" 
            : "male",
        }));
      
      setVoices(formattedVoices);
      if (formattedVoices.length > 0 && !selectedVoice) {
        setSelectedVoice(formattedVoices[0].name);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.cancel();
    };
  }, [selectedVoice]);

  const handlePlay = () => {
    if (!text.trim()) {
      toast.error("Please enter some text");
      return;
    }

    if (isPaused) {
      speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = speechSynthesis.getVoices().find((v) => v.name === selectedVoice);
    
    if (voice) utterance.voice = voice;
    utterance.rate = rate[0];
    utterance.pitch = pitch[0];

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
      toast.error("Speech synthesis error");
    };

    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setIsPlaying(true);
  };

  const handlePause = () => {
    if (isPlaying) {
      speechSynthesis.pause();
      setIsPaused(true);
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleExport = () => {
    toast.info("Audio export requires MediaRecorder API with Web Audio.", {
      description: "This feature is coming soon. For now, use a screen recorder.",
    });
  };

  const sampleTexts = [
    "Hey everyone, welcome back to my channel! Today we're going to explore something absolutely incredible.",
    "What's up YouTube! In this video, I'm going to show you the secrets that nobody talks about.",
    "If you've ever wondered how to level up your content game, you're in the right place. Let's dive in!",
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Mic className="w-7 h-7 text-orange-400" />
          Voiceover Studio
        </h1>
        <p className="text-muted-foreground mt-1">
          Generate natural voiceovers for your videos using text-to-speech.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Controls */}
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-display text-lg text-foreground">Voice Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Voice Selector */}
            <div className="space-y-2">
              <Label className="text-foreground">Voice</Label>
              <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {voices.map((voice) => (
                    <SelectItem key={voice.name} value={voice.name}>
                      <span className="flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          voice.gender === "female" ? "bg-pink-400" : "bg-blue-400"
                        )} />
                        {voice.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speed Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">Speed</Label>
                <span className="text-sm text-muted-foreground">{rate[0].toFixed(1)}x</span>
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-foreground">Pitch</Label>
                <span className="text-sm text-muted-foreground">{pitch[0].toFixed(1)}</span>
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

            {/* Quick Samples */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Sample scripts</Label>
              <div className="space-y-2">
                {sampleTexts.map((sample, index) => (
                  <button
                    key={index}
                    onClick={() => setText(sample)}
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
          <CardHeader>
            <CardTitle className="font-display text-lg text-foreground">Script Editor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter your voiceover script here..."
              className="min-h-[250px] bg-secondary border-border focus:border-primary resize-none"
            />

            {/* Character Count */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{text.length} characters</span>
              <span>~{Math.ceil(text.split(/\s+/).filter(Boolean).length / 150)} min read</span>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4 p-6 bg-secondary/50 rounded-xl">
              <Button
                variant="outline"
                size="icon"
                onClick={handleStop}
                disabled={!isPlaying && !isPaused}
                className="w-12 h-12 rounded-full border-border hover:border-primary/50"
              >
                <RefreshCw className="w-5 h-5" />
              </Button>

              <Button
                onClick={isPlaying ? handlePause : handlePlay}
                className={cn(
                  "w-16 h-16 rounded-full",
                  isPlaying ? "cyber-button-secondary" : "cyber-button"
                )}
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-accent-foreground" />
                ) : (
                  <Play className="w-6 h-6 text-primary-foreground ml-1" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleExport}
                className="w-12 h-12 rounded-full border-border hover:border-primary/50"
              >
                <Download className="w-5 h-5" />
              </Button>
            </div>

            {/* Visualizer (Decorative) */}
            <div className="flex items-center justify-center gap-1 h-16">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-full transition-all duration-100",
                    isPlaying
                      ? "bg-gradient-to-t from-neon-purple to-neon-cyan animate-pulse"
                      : "bg-border"
                  )}
                  style={{
                    height: isPlaying
                      ? `${Math.random() * 100}%`
                      : "20%",
                    animationDelay: `${i * 50}ms`,
                  }}
                />
              ))}
            </div>

            {/* Status */}
            <div className="text-center">
              <span className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                isPlaying 
                  ? "bg-green-500/20 text-green-400" 
                  : isPaused 
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-secondary text-muted-foreground"
              )}>
                <Volume2 className="w-4 h-4" />
                {isPlaying ? "Playing..." : isPaused ? "Paused" : "Ready to play"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
