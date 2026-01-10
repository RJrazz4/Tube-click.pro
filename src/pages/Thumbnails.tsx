import { useState } from "react";
import { Image as ImageIcon, Download, Loader2, Wand2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AspectRatio = "16:9" | "9:16";

export default function Thumbnails() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  const getDimensions = (ratio: AspectRatio) => {
    return ratio === "16:9" ? { width: 1280, height: 720 } : { width: 720, height: 1280 };
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    setIsGenerating(true);
    const { width, height } = getDimensions(aspectRatio);

    try {
      // Using Pollinations API
      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;
      
      // Preload the image
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });

      setGeneratedImage(imageUrl);
      setHistory((prev) => [imageUrl, ...prev.slice(0, 5)]);
      toast.success("Thumbnail generated successfully!");
    } catch (error) {
      toast.error("Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedImage) return;

    try {
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `thumbnail-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("Image downloaded!");
    } catch (error) {
      toast.error("Failed to download image");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <ImageIcon className="w-7 h-7 text-accent" />
          Thumbnail Architect
        </h1>
        <p className="text-muted-foreground mt-1">
          Create eye-catching thumbnails with AI. Powered by Pollinations.ai
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Controls */}
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader>
            <CardTitle className="font-display text-lg text-foreground">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-foreground">Describe your thumbnail</Label>
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A dramatic sunset over mountains with bold text overlay..."
                className="bg-secondary border-border focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-foreground">Aspect Ratio</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAspectRatio("16:9")}
                  className={cn(
                    "p-4 rounded-xl border transition-all duration-300",
                    aspectRatio === "16:9"
                      ? "border-primary bg-primary/20 neon-glow-purple"
                      : "border-border bg-secondary hover:border-primary/50"
                  )}
                >
                  <div className="w-full aspect-video bg-foreground/10 rounded mb-2" />
                  <span className="text-sm text-foreground font-medium">16:9</span>
                  <p className="text-xs text-muted-foreground">YouTube</p>
                </button>
                <button
                  onClick={() => setAspectRatio("9:16")}
                  className={cn(
                    "p-4 rounded-xl border transition-all duration-300",
                    aspectRatio === "9:16"
                      ? "border-accent bg-accent/20 neon-glow-cyan"
                      : "border-border bg-secondary hover:border-accent/50"
                  )}
                >
                  <div className="w-1/2 mx-auto aspect-[9/16] bg-foreground/10 rounded mb-2" />
                  <span className="text-sm text-foreground font-medium">9:16</span>
                  <p className="text-xs text-muted-foreground">Shorts</p>
                </button>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full cyber-button text-primary-foreground h-12"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Thumbnail
                </>
              )}
            </Button>

            {/* Quick Prompts */}
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Quick prompts</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  "Shocked face reaction",
                  "Gaming highlight moment",
                  "Before and after split",
                  "Mystery dark aesthetic",
                ].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPrompt(p)}
                    className="px-2 py-1 rounded-lg bg-secondary text-xs text-muted-foreground hover:text-foreground hover:bg-primary/20 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg text-foreground">Preview</CardTitle>
              {generatedImage && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    className="gap-2 border-border hover:border-primary/50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-2 border-border hover:border-accent/50"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "w-full rounded-xl border border-border overflow-hidden bg-secondary/50 flex items-center justify-center",
                aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[500px] mx-auto"
              )}
            >
              {isGenerating ? (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center animate-pulse">
                    <Wand2 className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground">Creating your thumbnail...</p>
                </div>
              ) : generatedImage ? (
                <img
                  src={generatedImage}
                  alt="Generated thumbnail"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center space-y-4 p-8">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">No thumbnail yet</p>
                    <p className="text-muted-foreground text-sm">
                      Enter a prompt and click generate to create your thumbnail
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="mt-6">
                <Label className="text-muted-foreground text-xs mb-2 block">Recent generations</Label>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-cyber">
                  {history.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setGeneratedImage(img)}
                      className={cn(
                        "shrink-0 w-20 h-12 rounded-lg border overflow-hidden transition-all",
                        generatedImage === img
                          ? "border-primary ring-2 ring-primary/50"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
