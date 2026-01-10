import { useState, useRef, useEffect } from "react";
import { Mic, Play, Pause, Square, Volume2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { incrementStat, saveContent } from "@/lib/stats";

interface Voice {
  name: string;
  lang: string;
}

export default function VoiceStudio() {
  const [text, setText] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [rate, setRate] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoice) {
        // Prefer English voices
        const englishVoice = availableVoices.find((v) => v.lang.startsWith("en"));
        setSelectedVoice(englishVoice?.name || availableVoices[0].name);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      speechSynthesis.cancel();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

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
    const voice = voices.find((v) => v.name === selectedVoice);
    
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

    speechSynthesis.speak(utterance);
    setIsPlaying(true);
    
    // Track voiceover
    incrementStat('voiceoversGenerated');
    saveContent({
      type: 'voiceover',
      title: text.substring(0, 50) + '...',
      content: text
    });
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

  const startRecording = async () => {
    if (!text.trim()) {
      toast.error("Please enter some text first");
      return;
    }

    try {
      // Create audio context for recording system audio
      audioContextRef.current = new AudioContext();
      destinationRef.current = audioContextRef.current.createMediaStreamDestination();

      const mediaRecorder = new MediaRecorder(destinationRef.current.stream, {
        mimeType: 'audio/webm'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        setIsRecording(false);
        toast.success("Recording saved! Click Download to save as audio file.");
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Start speech
      handlePlay();

      // Auto-stop when speech ends
      const checkSpeech = setInterval(() => {
        if (!speechSynthesis.speaking) {
          clearInterval(checkSpeech);
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
      }, 100);

    } catch (error) {
      console.error("Recording error:", error);
      toast.error("Recording not supported on this browser. Use a screen recorder instead.");
    }
  };

  const handleDownload = () => {
    if (audioUrl) {
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `voiceover-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Audio downloaded!");
    } else {
      toast.info("Record your voiceover first by clicking the Record & Export button, or use a screen recorder to capture the audio.", {
        duration: 5000
      });
    }
  };

  const sampleTexts = [
    "Hey everyone, welcome back to my channel! Today we're going to explore something absolutely incredible that will change how you think about everything.",
    "What's up YouTube! In this video, I'm going to show you the secrets that nobody talks about. Make sure to stay until the end because the last tip is a game-changer.",
    "Namaste dosto! Aaj hum baat karenge ek bahut important topic ke baare mein. Agar aap video pasand aaye toh like aur subscribe zaroor karein!",
  ];

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Mic className="w-6 h-6 md:w-7 md:h-7 text-orange-400" />
          Voiceover Studio
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate voiceovers using browser's text-to-speech. Adjust speed and pitch.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Controls */}
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Voice Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            {/* Voice Selector */}
            <div className="space-y-1.5 md:space-y-2">
              <Label className="text-sm text-foreground">Voice</Label>
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

            {/* Speed Slider */}
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

            {/* Quick Samples */}
            <div className="space-y-2">
              <Label className="text-xs md:text-sm text-muted-foreground">Sample scripts</Label>
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
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Script Editor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
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
                disabled={!isPlaying && !isPaused}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full border-border hover:border-primary/50"
              >
                <Square className="w-4 h-4 md:w-5 md:h-5" />
              </Button>

              <Button
                onClick={isPlaying ? handlePause : handlePlay}
                className={cn(
                  "w-14 h-14 md:w-16 md:h-16 rounded-full",
                  isPlaying ? "cyber-button-secondary" : "cyber-button"
                )}
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 md:w-6 md:h-6 text-accent-foreground" />
                ) : (
                  <Play className="w-5 h-5 md:w-6 md:h-6 text-primary-foreground ml-1" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleDownload}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full border-border hover:border-primary/50"
              >
                <Download className="w-4 h-4 md:w-5 md:h-5" />
              </Button>
            </div>

            {/* Visualizer (Decorative) */}
            <div className="flex items-center justify-center gap-1 h-12 md:h-16">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-1 rounded-full transition-all duration-100",
                    isPlaying
                      ? "bg-gradient-to-t from-neon-purple to-neon-cyan"
                      : "bg-border"
                  )}
                  style={{
                    height: isPlaying
                      ? `${20 + Math.random() * 80}%`
                      : "20%",
                    animationDelay: `${i * 50}ms`,
                    transition: isPlaying ? 'height 0.1s ease' : 'height 0.3s ease'
                  }}
                />
              ))}
            </div>

            {/* Status */}
            <div className="text-center">
              <span className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs md:text-sm",
                isPlaying 
                  ? "bg-green-500/20 text-green-400" 
                  : isPaused 
                  ? "bg-yellow-500/20 text-yellow-400"
                  : "bg-secondary text-muted-foreground"
              )}>
                <Volume2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {isPlaying ? "Playing..." : isPaused ? "Paused" : "Ready to play"}
              </span>
            </div>

            {/* Download tip */}
            <p className="text-center text-xs text-muted-foreground">
              💡 Tip: Use a screen recorder to capture the audio as MP3
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
