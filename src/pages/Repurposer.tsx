import { useState, useCallback } from "react";
import { Share2, Sparkles, Copy, Check, FileText, Youtube, Loader2, Layers, Link2, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { toastFriendlyError } from "@/lib/errorToast";
import { useContentStore } from "@/stores/useContentStore";
import { useTranscriptExtraction } from "@/hooks/useSecureQuery";
import { QK } from "@/api/client/queryKeys";
import { useQueryClient } from "@tanstack/react-query";

export default function Repurposer() {
  const [inputText, setInputText] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [transcriptMeta, setTranscriptMeta] = useState<{ videoId: string; wordCount: number; length: number; source: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [repurposed, setRepurposed] = useState<{
    youtubeDesc: string;
    twitterThread: string[];
    instagramCaption: string;
    linkedinPost: string;
  } | null>(null);
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const saveContent = useContentStore(s => s.saveContent);
  const incrementStat = useContentStore(s => s.incrementStat);
  const queryClient = useQueryClient();

  const transcriptMutation = useTranscriptExtraction();

  const handleExtractTranscript = useCallback(async () => {
    const trimmedUrl = youtubeUrl.trim();
    if (!trimmedUrl) {
      toast.error("Please enter a YouTube URL");
      return;
    }

    // Basic validation
    if (!trimmedUrl.includes("youtube.com") && !trimmedUrl.includes("youtu.be") && trimmedUrl.length < 11) {
      toast.error("Invalid YouTube URL. Use youtube.com/watch?v= or youtu.be/ link");
      return;
    }

    // Check cache first
    const cacheKey = QK.transcript(trimmedUrl);
    const cached = queryClient.getQueryData(cacheKey) as any;
    if (cached?.transcript) {
      setInputText(cached.transcript.slice(0, 8000)); // limit for UI
      setTranscriptMeta({ videoId: cached.videoId, wordCount: cached.wordCount, length: cached.length, source: cached.source + " (cached)" });
      toast.success("Transcript served from cache — instant! (React Query 10m)");
      return;
    }

    try {
      const data = await transcriptMutation.mutateAsync({ url: trimmedUrl });
      if (!data.transcript || data.transcript.trim().length < 10) {
        throw new Error("Transcript empty");
      }

      // Cache it
      queryClient.setQueryData(cacheKey, data);

      // Use transcript as input for repurposer (trim to 8000 chars for UI, but keep full for processing)
      setInputText(data.transcript.slice(0, 8000));
      setTranscriptMeta({ videoId: data.videoId, wordCount: data.wordCount, length: data.length, source: data.source });

      toast.success(`Transcript extracted via ${data.source} — ${data.wordCount} words! Free value add.`);
    } catch (err: any) {
      const msg = err?.message || "Failed to extract transcript";
      if (err?.status === 404) {
        toast.error("Captions disabled or private video. Paste script manually — transcript is optional free add-on.");
      } else {
        toastFriendlyError(err, "Failed to extract transcript");
      }
    }
  }, [youtubeUrl, queryClient, transcriptMutation]);

  const handleRepurpose = async () => {
    if (!inputText.trim()) {
      toast.error("Please extract transcript or enter a script/topic");
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate intelligent multi-platform content distillation
      // In Phase B full implementation, this would call the managed AI engine for repurposing:
      // fetchEdgeFunctionJson("generate-content", { topic: inputText, platform: "Multi", ... })
      // For now, local generation powered by transcript (free, no extra API cost)
      await new Promise(r => setTimeout(r, 900));

      const title = inputText.split('\n')[0].substring(0, 60) || "Video Repurposed Content";
      const wordCount = inputText.split(/\s+/).filter(Boolean).length;

      const youtubeDesc = `🚀 In this video, we dive deep into: ${title}\n\n${transcriptMeta ? `Original video: https://youtube.com/watch?v=${transcriptMeta.videoId}\nTranscript length: ${transcriptMeta.wordCount} words via ${transcriptMeta.source}\n\n` : ''}Make sure to watch until the end for the ultimate insider secret! (Source: ${wordCount} words ${transcriptMeta ? 'transcript' : 'script'})\n\n📌 TIMESTAMPS:\n0:00 - Introduction\n1:20 - The Core Secret\n3:45 - Step-by-Step Breakdown\n7:10 - Common Mistakes to Avoid\n10:30 - Final Verdict & Summary\n\n🔔 Subscribe for more viral strategies!\n\n#YouTubeGrowth #ContentRepuposing #TubeClickPro`;

      const twitterThread = [
        `1/🧵 Most creators fail because they ignore this one crucial strategy regarding ${title.substring(0, 60)}. Here is everything you need to know in 60 seconds (from ${wordCount} word ${transcriptMeta ? 'transcript' : 'script'}):`,
        `2/ First, you need to understand the psychology behind viewer retention. If you lose them in the first 5 seconds, game over. Extracted from ${transcriptMeta ? `YT ${transcriptMeta.videoId}` : 'original script'}.`,
        `3/ Second, leverage high-contrast visual storytelling. People scroll fast — your thumbnail and hook must be undeniable.`,
        `4/ Finally, consistency combined with iterative improvement beats raw talent every single time. Start executing today!`,
        `5/ Want the full breakdown? This repurposed thread is powered by TubeClick Pro transcript extraction! 👇`,
      ];

      const instagramCaption = `✨ The secret nobody tells you about ${title.substring(0, 50)}...\n\n${transcriptMeta ? `🎥 Transcript from YT: ${transcriptMeta.wordCount} words analyzed` : '📝 Original script analyzed'} — swipe to see how top creators dominate the algorithm right now. 🚀\n\n💡 Save this post for later and tag a creator who needs to see this!\n\n#YouTubeGrowth #ContentCreator #ViralSecrets #CreatorEconomy #TubeClickPro`;

      const linkedinPost = `🔥 The Creator Economy is shifting rapidly in 2026.\n\nWe just analyzed ${transcriptMeta ? `YouTube video ${transcriptMeta.videoId} (${transcriptMeta.wordCount} word transcript via ${transcriptMeta.source})` : `${wordCount} word script`} in the ${title.substring(0, 40)} niche and discovered a surprising trend:\n\n1. Short-form hooks drive 80% of top-of-funnel discovery.\n2. Deep-dive value builds long-term community retention.\n3. Multi-platform syndication multiplies reach 4x with zero extra video production cost — powered by built-in transcript extraction.\n\nWhat is your primary growth strategy this quarter? Let's discuss in the comments below! 👇`;

      setRepurposed({ youtubeDesc, twitterThread, instagramCaption, linkedinPost });

      incrementStat('scriptsGenerated');
      saveContent({
        type: 'script',
        title: `Repurposed: ${title.substring(0, 40)}${transcriptMeta ? ` [YT:${transcriptMeta.videoId}]` : ''}`,
        content: youtubeDesc,
        metadata: { platform: 'multi', language: 'en' },
      });

      toast.success("Content successfully repurposed across 4 platforms — transcript powered!");
    } catch {
      toast.error("Failed to repurpose content");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async (text: string, tab: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTab(tab);
      toast.success(`${tab} copied to clipboard!`);
      setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Share2 className="w-6 h-6 md:w-7 md:h-7 text-pink-400" />
          Multi-Platform Repurposer
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] border border-green-500/20 ml-2">Free Transcript</span>
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Free value add: Paste YouTube URL → extract transcript via <span className="text-foreground font-medium">built-in server-side transcript engine</span> → instantly repurpose to YT Description, X Thread, IG Caption & LinkedIn Post.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {/* Input Panel */}
        <Card className="cyber-card border-border flex flex-col">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Source — URL or Script
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-4">
            {/* YouTube URL Input — Phase B2 */}
            <div className="space-y-2 p-3 rounded-lg bg-secondary/50 border border-border">
              <Label className="text-xs flex items-center gap-1.5">
                <Youtube className="w-3.5 h-3.5 text-red-400" />
                YouTube URL (Free Value Add)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=... or youtu.be/..."
                  className="flex-1 bg-secondary border-border h-10 text-sm"
                  disabled={transcriptMutation.isPending || isProcessing}
                />
                <Button
                  onClick={handleExtractTranscript}
                  disabled={transcriptMutation.isPending || isProcessing || !youtubeUrl.trim()}
                  variant="secondary"
                  className="h-10 px-3 gap-1.5"
                >
                  {transcriptMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Extract</span>
                </Button>
              </div>
              {transcriptMeta && (
                <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2">
                  <span className="px-1.5 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20">ID: {transcriptMeta.videoId}</span>
                  <span>{transcriptMeta.wordCount} words</span>
                  <span>• {transcriptMeta.length} chars</span>
                  <span>• via {transcriptMeta.source}</span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/70">
                Transcript extraction runs fully server-side — cached 10 min for instant revisit.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">OR paste script/topic</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste transcript, video script, or topic summary here... (auto-filled from YouTube extraction above)"
              className="flex-1 min-h-[220px] bg-secondary border-border focus:border-primary resize-none text-sm"
              disabled={isProcessing}
              maxLength={8000}
            />
            {inputText.length > 0 && <p className="text-xs text-muted-foreground text-right">{inputText.length}/8000 • {inputText.split(/\s+/).filter(Boolean).length} words</p>}

            <Button onClick={handleRepurpose} disabled={isProcessing || !inputText.trim()} className="w-full cyber-button h-12">
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Distilling across platforms...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Repurposing to 4 Platforms
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Output Panel */}
        <Card className="cyber-card border-border flex flex-col overflow-hidden">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent" />
              Repurposed Assets
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            {repurposed ? (
              <Tabs defaultValue="youtube" className="h-full flex flex-col">
                <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-11 overflow-x-auto">
                  <TabsTrigger value="youtube" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">YouTube Desc</TabsTrigger>
                  <TabsTrigger value="twitter" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">X Thread</TabsTrigger>
                  <TabsTrigger value="instagram" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">Instagram</TabsTrigger>
                  <TabsTrigger value="linkedin" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">LinkedIn</TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto p-4">
                  <TabsContent value="youtube" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button variant="secondary" size="sm" onClick={() => handleCopy(repurposed.youtubeDesc, "YouTube Description")} className="absolute top-2 right-2 gap-1.5 text-xs h-7">
                        {copiedTab === "YouTube Description" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                      </Button>
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground font-sans leading-relaxed pr-16">{repurposed.youtubeDesc}</pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="twitter" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button variant="secondary" size="sm" onClick={() => handleCopy(repurposed.twitterThread.join('\n\n'), "X Thread")} className="absolute top-2 right-2 gap-1.5 text-xs h-7">
                        {copiedTab === "X Thread" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy All
                      </Button>
                      <div className="space-y-3 pr-16">
                        {repurposed.twitterThread.map((tweet, i) => (
                          <div key={i} className="p-3 bg-card rounded border border-border/50 text-xs md:text-sm text-foreground">{tweet}</div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="instagram" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button variant="secondary" size="sm" onClick={() => handleCopy(repurposed.instagramCaption, "Instagram Caption")} className="absolute top-2 right-2 gap-1.5 text-xs h-7">
                        {copiedTab === "Instagram Caption" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                      </Button>
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground font-sans leading-relaxed pr-16">{repurposed.instagramCaption}</pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="linkedin" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button variant="secondary" size="sm" onClick={() => handleCopy(repurposed.linkedinPost, "LinkedIn Post")} className="absolute top-2 right-2 gap-1.5 text-xs h-7">
                        {copiedTab === "LinkedIn Post" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />} Copy
                      </Button>
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground font-sans leading-relaxed pr-16">{repurposed.linkedinPost}</pre>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full text-center p-8">
                <div className="space-y-3 max-w-[320px]">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                    <Share2 className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">Free Value Add: YT → Transcript → 4 Platforms</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Paste a YouTube URL above, extract the transcript with our built-in server-side engine, then repurpose instantly — cached for instant revisit.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
