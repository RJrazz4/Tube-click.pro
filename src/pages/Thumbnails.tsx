import { useState, useEffect } from "react";
import { Image as ImageIcon, Download, Loader2, Wand2, RefreshCw, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsImage } from "@/lib/export";

type AspectRatio = "16:9" | "9:16";

export default function Thumbnails() {
  const [searchParams] = useSearchParams();
  const [title, setTitle] = useState(searchParams.get('title') || "");
  const [emotion, setEmotion] = useState("Exciting");
  const [style, setStyle] = useState("Modern");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [useAI, setUseAI] = useState(true);

  useEffect(() => {
    const titleFromParams = searchParams.get('title');
    if (titleFromParams) {
      setTitle(titleFromParams);
    }
  }, [searchParams]);

  const getDimensions = (ratio: AspectRatio) => {
    return ratio === "16:9" ? { width: 1280, height: 720 } : { width: 1080, height: 1920 };
  };

  const handleGenerate = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title or description");
      return;
    }

    setIsGenerating(true);
    setThumbnails([]);

    try {
      if (useAI) {
        // Use AI image generation via edge function
        const { data, error } = await supabase.functions.invoke('generate-thumbnail', {
          body: { 
            title: title.trim(), 
            emotion, 
            style, 
            aspectRatio,
            count: 4
          }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        if (data.thumbnails && data.thumbnails.length > 0) {
          setThumbnails(data.thumbnails);
          incrementStat('thumbnailsCreated');
          
          // Save first thumbnail
          saveContent({
            type: 'thumbnail',
            title: title,
            content: data.thumbnails[0]
          });

          toast.success(`Generated ${data.thumbnails.length} thumbnails!`);
        } else {
          throw new Error("No thumbnails generated");
        }
      } else {
        // Use Pollinations API (free, no auth needed)
        const { width, height } = getDimensions(aspectRatio);
        const variations = [
          `${title}, ${emotion}, ${style}, YouTube thumbnail, professional, vibrant, eye-catching`,
          `${title}, dramatic lighting, ${style}, thumbnail design, high quality`,
          `${title}, ${emotion}, bold colors, viral thumbnail, engaging`,
          `${title}, cinematic, ${style}, social media, attention grabbing`
        ];

        const promises = variations.map(async (prompt) => {
          const encodedPrompt = encodeURIComponent(prompt);
          const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now()}`;
          
          // Preload image
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imageUrl;
          });
          
          return imageUrl;
        });

        const results = await Promise.all(promises);
        setThumbnails(results);
        incrementStat('thumbnailsCreated');
        toast.success("Thumbnails generated successfully!");
      }
    } catch (error: any) {
      console.error("Thumbnail generation error:", error);
      toast.error(error.message || "Failed to generate thumbnails. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (imageUrl: string, index: number) => {
    try {
      await downloadAsImage(imageUrl, `thumbnail-${index + 1}-${Date.now()}.png`);
      toast.success("Thumbnail downloaded!");
    } catch (error) {
      toast.error("Failed to download thumbnail");
    }
  };

  const handleDownloadAll = async () => {
    for (let i = 0; i < thumbnails.length; i++) {
      await handleDownload(thumbnails[i], i);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <ImageIcon className="w-6 h-6 md:w-7 md:h-7 text-accent" />
          Thumbnail Architect
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate 4 AI thumbnails at once. Download your favorites.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Controls */}
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6">
            <div className="space-y-1.5 md:space-y-2">
              <Label className="text-sm text-foreground">Title / Description</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter video title or describe thumbnail..."
                className="bg-secondary border-border focus:border-primary h-10 md:h-11 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm text-foreground">Emotion</Label>
                <Select value={emotion} onValueChange={setEmotion}>
                  <SelectTrigger className="bg-secondary border-border h-9 md:h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Exciting">Exciting</SelectItem>
                    <SelectItem value="Mysterious">Mysterious</SelectItem>
                    <SelectItem value="Shocking">Shocking</SelectItem>
                    <SelectItem value="Happy">Happy</SelectItem>
                    <SelectItem value="Dramatic">Dramatic</SelectItem>
                    <SelectItem value="Professional">Professional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm text-foreground">Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="bg-secondary border-border h-9 md:h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Modern">Modern</SelectItem>
                    <SelectItem value="Minimalist">Minimalist</SelectItem>
                    <SelectItem value="Cinematic">Cinematic</SelectItem>
                    <SelectItem value="Gaming">Gaming</SelectItem>
                    <SelectItem value="Vlog">Vlog</SelectItem>
                    <SelectItem value="Educational">Educational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 md:space-y-2">
              <Label className="text-sm text-foreground">Aspect Ratio</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAspectRatio("16:9")}
                  className={cn(
                    "p-3 md:p-4 rounded-xl border transition-all duration-300",
                    aspectRatio === "16:9"
                      ? "border-primary bg-primary/20 neon-glow-purple"
                      : "border-border bg-secondary hover:border-primary/50"
                  )}
                >
                  <div className="w-full aspect-video bg-foreground/10 rounded mb-2" />
                  <span className="text-xs md:text-sm text-foreground font-medium">16:9</span>
                  <p className="text-xs text-muted-foreground">YouTube</p>
                </button>
                <button
                  onClick={() => setAspectRatio("9:16")}
                  className={cn(
                    "p-3 md:p-4 rounded-xl border transition-all duration-300",
                    aspectRatio === "9:16"
                      ? "border-accent bg-accent/20 neon-glow-cyan"
                      : "border-border bg-secondary hover:border-accent/50"
                  )}
                >
                  <div className="w-1/2 mx-auto aspect-[9/16] bg-foreground/10 rounded mb-2" />
                  <span className="text-xs md:text-sm text-foreground font-medium">9:16</span>
                  <p className="text-xs text-muted-foreground">Shorts</p>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useAI"
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="useAI" className="text-xs md:text-sm text-muted-foreground cursor-pointer">
                Use AI Generation (higher quality)
              </Label>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !title.trim()}
              className="w-full cyber-button text-primary-foreground h-11 md:h-12"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating 4 Thumbnails...
                </>
              ) : (
                <>
                  <Grid3X3 className="w-4 h-4 mr-2" />
                  Generate 4 Thumbnails
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3 md:pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="font-display text-base md:text-lg text-foreground">Thumbnails</CardTitle>
              {thumbnails.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    className="gap-1.5 border-border hover:border-primary/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Regenerate</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadAll}
                    className="gap-1.5 border-border hover:border-accent/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Download All</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-xl border border-border overflow-hidden bg-secondary/50 flex items-center justify-center",
                      aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"
                    )}
                  >
                    <div className="text-center space-y-2">
                      <Loader2 className="w-6 h-6 md:w-8 md:h-8 mx-auto text-primary animate-spin" />
                      <p className="text-xs md:text-sm text-muted-foreground">Generating {i}/4...</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : thumbnails.length > 0 ? (
              <div className="space-y-4">
                {/* Selected thumbnail preview */}
                <div
                  className={cn(
                    "w-full rounded-xl border-2 border-primary overflow-hidden bg-secondary/50",
                    aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[400px] mx-auto"
                  )}
                >
                  <img
                    src={thumbnails[selectedIndex]}
                    alt={`Thumbnail ${selectedIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Thumbnail grid */}
                <div className="grid grid-cols-4 gap-2 md:gap-3">
                  {thumbnails.map((thumb, index) => (
                    <div key={index} className="relative group">
                      <button
                        onClick={() => setSelectedIndex(index)}
                        className={cn(
                          "w-full rounded-lg overflow-hidden border-2 transition-all",
                          selectedIndex === index
                            ? "border-primary ring-2 ring-primary/50"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <img
                          src={thumb}
                          alt={`Thumbnail ${index + 1}`}
                          className={cn(
                            "w-full object-cover",
                            aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"
                          )}
                        />
                      </button>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => handleDownload(thumb, index)}
                        className="absolute bottom-1 right-1 w-6 h-6 md:w-7 md:h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "w-full rounded-xl border border-border overflow-hidden bg-secondary/50 flex items-center justify-center",
                  aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[400px] mx-auto"
                )}
              >
                <div className="text-center space-y-4 p-6 md:p-8">
                  <div className="w-14 h-14 md:w-16 md:h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                    <ImageIcon className="w-7 h-7 md:w-8 md:h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium text-sm md:text-base">No thumbnails yet</p>
                    <p className="text-muted-foreground text-xs md:text-sm">
                      Enter a title and click generate to create 4 thumbnails
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
