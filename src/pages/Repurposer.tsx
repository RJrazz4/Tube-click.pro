import { useState } from "react";
import { Share2, Sparkles, Copy, Check, FileText, Send, RefreshCw, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsText } from "@/lib/export";

export default function Repurposer() {
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [repurposed, setRepurposed] = useState<{
    youtubeDesc: string;
    twitterThread: string[];
    instagramCaption: string;
    linkedinPost: string;
  } | null>(null);
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const handleRepurpose = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter a script or video topic");
      return;
    }

    setIsProcessing(true);

    try {
      // Simulate intelligent multi-platform content distillation
      await new Promise(r => setTimeout(r, 1200));

      const title = inputText.split('\n')[0].substring(0, 50) || "Video Repurposed Content";
      
      const youtubeDesc = `🚀 In this video, we dive deep into: ${title}\n\nMake sure to watch until the end for the ultimate insider secret!\n\n📌 TIMESTAMPS:\n0:00 - Introduction\n1:20 - The Core Secret\n3:45 - Step-by-Step Breakdown\n7:10 - Common Mistakes to Avoid\n10:30 - Final Verdict & Summary\n\n🔔 Subscribe for more viral strategies!`;
      
      const twitterThread = [
        `1/🧵 Most creators fail because they ignore this one crucial strategy regarding ${title}. Here is everything you need to know in 60 seconds:`,
        `2/ First, you need to understand the psychology behind viewer retention. If you lose them in the first 5 seconds, game over.`,
        `3/ Second, leverage high-contrast visual storytelling. People scroll fast — your thumbnail and hook must be undeniable.`,
        `4/ Finally, consistency combined with iterative improvement beats raw talent every single time. Start executing today!`,
        `5/ Want the full breakdown? Check out our latest YouTube video and subscribe for weekly creator masterclasses! 👇`
      ];

      const instagramCaption = `✨ The secret nobody tells you about ${title}...\n\nSwipe to see how top creators are dominating the algorithm right now. 🚀\n\n💡 Save this post for later and tag a creator who needs to see this!\n\n#YouTubeGrowth #ContentCreator #ViralSecrets #CreatorEconomy`;

      const linkedinPost = `🔥 The Creator Economy is shifting rapidly in 2026.\n\nWe just analyzed top-performing channels in the ${title} niche and discovered a surprising trend:\n\n1. Short-form hooks drive 80% of top-of-funnel discovery.\n2. Deep-dive value builds long-term community retention.\n3. Multi-platform syndication multiplies reach 4x with zero extra video production cost.\n\nWhat is your primary growth strategy this quarter? Let's discuss in the comments below! 👇`;

      setRepurposed({
        youtubeDesc,
        twitterThread,
        instagramCaption,
        linkedinPost
      });

      incrementStat('scriptsGenerated');
      saveContent({
        type: 'script',
        title: `Repurposed: ${title}`,
        content: youtubeDesc
      });

      toast.success("Content successfully repurposed across 4 platforms!");
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
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Instantly convert any script or video idea into YouTube Description, X Thread, IG Caption & LinkedIn Post.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {/* Input Panel */}
        <Card className="cyber-card border-border flex flex-col">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Source Script / Topic
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-4">
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste your video script, transcript, or topic summary here..."
              className="flex-1 min-h-[300px] bg-secondary border-border focus:border-primary resize-none text-sm"
              disabled={isProcessing}
            />

            <Button
              onClick={handleRepurpose}
              disabled={isProcessing || !inputText.trim()}
              className="w-full cyber-button h-12"
            >
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
                  <TabsTrigger value="youtube" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">
                    YouTube Desc
                  </TabsTrigger>
                  <TabsTrigger value="twitter" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">
                    X Thread
                  </TabsTrigger>
                  <TabsTrigger value="instagram" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">
                    Instagram
                  </TabsTrigger>
                  <TabsTrigger value="linkedin" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs px-3">
                    LinkedIn
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-auto p-4">
                  <TabsContent value="youtube" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy(repurposed.youtubeDesc, "YouTube Description")}
                        className="absolute top-2 right-2 gap-1.5 text-xs h-7"
                      >
                        {copiedTab === "YouTube Description" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy
                      </Button>
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground font-sans leading-relaxed pr-16">
                        {repurposed.youtubeDesc}
                      </pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="twitter" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy(repurposed.twitterThread.join('\n\n'), "X Thread")}
                        className="absolute top-2 right-2 gap-1.5 text-xs h-7"
                      >
                        {copiedTab === "X Thread" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy All
                      </Button>
                      <div className="space-y-3 pr-16">
                        {repurposed.twitterThread.map((tweet, i) => (
                          <div key={i} className="p-3 bg-card rounded border border-border/50 text-xs md:text-sm text-foreground">
                            {tweet}
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="instagram" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy(repurposed.instagramCaption, "Instagram Caption")}
                        className="absolute top-2 right-2 gap-1.5 text-xs h-7"
                      >
                        {copiedTab === "Instagram Caption" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy
                      </Button>
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground font-sans leading-relaxed pr-16">
                        {repurposed.instagramCaption}
                      </pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="linkedin" className="m-0 space-y-3">
                    <div className="relative bg-secondary rounded-lg p-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCopy(repurposed.linkedinPost, "LinkedIn Post")}
                        className="absolute top-2 right-2 gap-1.5 text-xs h-7"
                      >
                        {copiedTab === "LinkedIn Post" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy
                      </Button>
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground font-sans leading-relaxed pr-16">
                        {repurposed.linkedinPost}
                      </pre>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            ) : (
              <div className="flex items-center justify-center h-full text-center p-8">
                <div className="space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                    <Share2 className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Enter your script and click repurpose to see multi-platform assets here.
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
