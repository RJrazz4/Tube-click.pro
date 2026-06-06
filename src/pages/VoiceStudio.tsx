import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Download, FileAudio, Loader2, Mic, Play, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { incrementStat, saveContent } from "@/lib/stats";
import { voiceService } from "@/lib/localAiServices";

const TTS_VOICES = [
  { id: "standard", name: "Standard", description: "Balanced default Puter voice" },
  { id: "Joanna", name: "Joanna", description: "Clear female narration" },
  { id: "Matthew", name: "Matthew", description: "Warm male narration" },
  { id: "Amy", name: "Amy", description: "British female voice" },
  { id: "Brian", name: "Brian", description: "British male voice" },
];

const CONVERSION_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", description: "Calm storytelling voice" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", description: "Deep cinematic male voice" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", description: "Expressive female voice" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", description: "Friendly creator voice" },
];

export default function VoiceStudio() {
  const [text, setText] = useState("");
  const [ttsVoice, setTtsVoice] = useState("standard");
  const [targetVoice, setTargetVoice] = useState(CONVERSION_VOICES[0].id);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState("tts");
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const selectedTtsVoice = useMemo(
    () => TTS_VOICES.find((voice) => voice.id === ttsVoice) ?? TTS_VOICES[0],
    [ttsVoice]
  );
  const selectedConversionVoice = useMemo(
    () => CONVERSION_VOICES.find((voice) => voice.id === targetVoice) ?? CONVERSION_VOICES[0],
    [targetVoice]
  );

  useEffect(() => {
    return () => {
      voiceService.stop();
    };
  }, []);

  const attachAudio = (audio: HTMLAudioElement) => {
    const playableUrl = audio.src || audio.currentSrc || audio.toString();

    if (!playableUrl) {
      throw new Error("The generated audio did not include a playable URL.");
    }

    audio.onplay = () => setIsPlaying(true);
    audio.onpause = () => setIsPlaying(false);
    audio.onended = () => setIsPlaying(false);
    playerRef.current = audio;
    setAudioUrl(playableUrl);
  };

  const handleTextToSpeech = async () => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      toast.error("Please enter text to convert into speech.");
      return;
    }

    setIsProcessing(true);
    setAudioUrl(null);

    try {
      const audio = await voiceService.textToSpeech(trimmedText, ttsVoice);
      attachAudio(audio);
      incrementStat("voiceoversGenerated");
      saveContent({
        type: "voiceover",
        title: `Puter TTS - ${selectedTtsVoice.name}`,
        content: trimmedText,
      });
      toast.success("Puter text-to-speech generated and playing.");
    } catch (error) {
      console.error("Puter TTS error:", error);
      toast.error(error instanceof Error ? error.message : "Audio generation failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoiceConversion = async () => {
    if (!audioFile) {
      toast.error("Please upload an audio file first.");
      return;
    }

    setIsProcessing(true);
    setAudioUrl(null);

    try {
      const audio = await voiceService.convertVoice(audioFile, targetVoice);
      attachAudio(audio);
      incrementStat("voiceoversGenerated");
      saveContent({
        type: "voiceover",
        title: `Voice Conversion - ${selectedConversionVoice.name}`,
        content: `${audioFile.name} converted to ${selectedConversionVoice.name}`,
      });
      toast.success("Voice conversion generated and playing.");
    } catch (error) {
      console.error("Puter voice conversion error:", error);
      toast.error(error instanceof Error ? error.message : "Voice conversion failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStop = () => {
    voiceService.stop();
    setIsPlaying(false);
  };

  const handleDownload = () => {
    if (!audioUrl) {
      toast.error("No generated audio is ready to download.");
      return;
    }

    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `puter-voice-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-gradient-to-r from-orange-500/15 via-card to-primary/15 p-5 md:p-6">
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Mic className="w-6 h-6 md:w-7 md:h-7 text-orange-400" />
          Voice Studio
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2 max-w-3xl">
          Free, serverless AI voice tools powered by Puter.js — generate narration or convert uploaded audio without API keys.
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 md:gap-6">
        <Card className="cyber-card border-border">
          <CardHeader>
            <CardTitle className="font-display text-lg text-foreground">Create Audio</CardTitle>
            <CardDescription>Choose a workflow and Puter.js will handle voice generation locally in the browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeMode} onValueChange={setActiveMode} className="space-y-5">
              <TabsList className="grid w-full grid-cols-2 bg-secondary">
                <TabsTrigger value="tts" className="gap-2">
                  <Volume2 className="w-4 h-4" />
                  Text-to-Speech
                </TabsTrigger>
                <TabsTrigger value="conversion" className="gap-2">
                  <ArrowRightLeft className="w-4 h-4" />
                  Voice Conversion
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tts" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="tts-text">Script</Label>
                  <Textarea
                    id="tts-text"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Paste your narration script here..."
                    className="min-h-[220px] bg-secondary border-border resize-none"
                    maxLength={3000}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Puter TTS supports up to 3000 characters per request.</span>
                    <span>{text.length}/3000</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Voice</Label>
                  <Select value={ttsVoice} onValueChange={setTtsVoice} disabled={isProcessing}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TTS_VOICES.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name} — {voice.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleTextToSpeech}
                  disabled={isProcessing || !text.trim()}
                  className="w-full h-12 bg-gradient-to-r from-orange-500 to-primary hover:opacity-90 text-white font-semibold"
                >
                  {isProcessing && activeMode === "tts" ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 mr-2" />
                  )}
                  Generate & Play Voice
                </Button>
              </TabsContent>

              <TabsContent value="conversion" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="voice-file">Audio Input</Label>
                  <label
                    htmlFor="voice-file"
                    className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-secondary/30 p-6 text-center transition-colors hover:border-primary/60"
                  >
                    <FileAudio className="w-10 h-10 text-primary mb-3" />
                    <span className="text-sm font-medium text-foreground">
                      {audioFile ? audioFile.name : "Upload an audio file"}
                    </span>
                    <span className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A, or other browser-supported audio files</span>
                  </label>
                  <input
                    id="voice-file"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => setAudioFile(event.target.files?.[0] ?? null)}
                    disabled={isProcessing}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Target Voice</Label>
                  <Select value={targetVoice} onValueChange={setTargetVoice} disabled={isProcessing}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONVERSION_VOICES.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name} — {voice.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleVoiceConversion}
                  disabled={isProcessing || !audioFile}
                  className="w-full h-12 bg-gradient-to-r from-primary to-orange-500 hover:opacity-90 text-white font-semibold"
                >
                  {isProcessing && activeMode === "conversion" ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-5 h-5 mr-2" />
                  )}
                  Convert & Play Voice
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="cyber-card border-border">
          <CardHeader>
            <CardTitle className="font-display text-lg text-foreground flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary" />
              Playback
            </CardTitle>
            <CardDescription>Generated audio plays automatically and can be replayed or downloaded.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-border bg-secondary/30 p-5">
              <div className="flex h-24 items-end justify-center gap-1">
                {Array.from({ length: 28 }).map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "w-1.5 rounded-full bg-gradient-to-t from-orange-500 to-primary transition-all duration-300",
                      isPlaying ? "animate-pulse" : "opacity-40"
                    )}
                    style={{ height: isPlaying ? `${24 + ((index * 11) % 64)}px` : "24px" }}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Mode</span>
                <span className="font-medium text-foreground">{activeMode === "tts" ? "Text-to-Speech" : "Voice Conversion"}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Voice</span>
                <span className="font-medium text-foreground">
                  {activeMode === "tts" ? selectedTtsVoice.name : selectedConversionVoice.name}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-muted-foreground">Status</span>
                <span className={cn("font-medium", isProcessing ? "text-primary" : audioUrl ? "text-green-400" : "text-muted-foreground")}>
                  {isProcessing ? "Processing" : audioUrl ? "Ready" : "Waiting"}
                </span>
              </div>
            </div>

            {audioUrl && <audio src={audioUrl} controls className="w-full" />}

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleStop} disabled={!audioUrl && !isPlaying}>
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
              <Button variant="outline" onClick={handleDownload} disabled={!audioUrl}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Puter.js runs in the browser and does not require API keys. If generation fails, check network availability and try a shorter script or a different audio file.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
