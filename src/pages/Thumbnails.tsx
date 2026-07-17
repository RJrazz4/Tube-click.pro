import { useState, useEffect } from "react";
 import { Image as ImageIcon, Download, Loader2, RefreshCw, Grid3X3, AlertCircle, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { EdgeFunctionError, fetchEdgeFunctionJson } from "@/api/client/secureClient";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsImage } from "@/lib/export";

type AspectRatio = "16:9" | "9:16";

interface ThumbnailState {
  url: string | null;
  status: 'pending' | 'generating' | 'complete' | 'error';
  error?: string;
}

export default function Thumbnails() {
  const [searchParams] = useSearchParams();
  const [title, setTitle] = useState(searchParams.get('title') || "");
  const [emotion, setEmotion] = useState("Exciting");
  const [style, setStyle] = useState("Modern");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [thumbnailStates, setThumbnailStates] = useState<ThumbnailState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [useAI, setUseAI] = useState(true);
  const [progress, setProgress] = useState(0);

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
    const trimmedTitle = title.trim();
    
    if (!trimmedTitle) {
      toast.error("Please enter a title or description for the thumbnail");
      return;
    }
    
    if (trimmedTitle.length < 3) {
      toast.error("Title too short. Please provide at least 3 characters.");
      return;
    }
    
    if (trimmedTitle.length > 200) {
      toast.error("Title too long. Maximum 200 characters for best results.");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    
    // Initialize 4 pending states
    setThumbnailStates([
      { url: null, status: 'generating' },
      { url: null, status: 'pending' },
      { url: null, status: 'pending' },
      { url: null, status: 'pending' },
    ]);

    try {
      if (useAI) {
        const data = await fetchEdgeFunctionJson<{ thumbnails: Array<string | null> }>("generate-thumbnail", {
          title: trimmedTitle,
          emotion,
          style,
          aspectRatio,
          count: 4,
        });

        if (data.thumbnails && Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
          const newStates: ThumbnailState[] = data.thumbnails.map((url: string | null) => ({
            url,
            status: url ? 'complete' as const : 'error' as const,
            error: url ? undefined : 'Failed to generate'
          }));
          
          // Pad with error states if fewer than 4 returned
          while (newStates.length < 4) {
            newStates.push({ url: null, status: 'error', error: 'Not generated' });
          }
          
          setThumbnailStates(newStates);
          setProgress(100);
          
          const successCount = newStates.filter(s => s.status === 'complete').length;
          
          if (successCount > 0) {
            incrementStat('thumbnailsCreated');
            
            // Save first successful thumbnail
            const firstSuccess = newStates.find(s => s.url);
            if (firstSuccess?.url) {
              saveContent({
                type: 'thumbnail',
                title: trimmedTitle,
                content: firstSuccess.url
              });
            }
            
            if (successCount === 4) {
              toast.success("All 4 thumbnails generated successfully!");
            } else {
              toast.warning(`Generated ${successCount}/4 thumbnails.`);
            }
          } else {
            throw new Error("No thumbnails were generated");
          }
        } else {
          throw new Error("No thumbnails returned from API");
        }
      } else {
        // Use Pollinations API (free, no auth needed)
        const { width, height } = getDimensions(aspectRatio);
        const variations = [
          `${trimmedTitle}, ${emotion}, ${style}, YouTube thumbnail, professional, vibrant, eye-catching`,
          `${trimmedTitle}, dramatic lighting, ${style}, thumbnail design, high quality`,
          `${trimmedTitle}, ${emotion}, bold colors, viral thumbnail, engaging`,
          `${trimmedTitle}, cinematic, ${style}, social media, attention grabbing`
        ];

        const results: ThumbnailState[] = [];
        
        for (let i = 0; i < variations.length; i++) {
          setThumbnailStates(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'generating' } : s
          ));
          setProgress(((i + 0.5) / 4) * 100);
          
          try {
            const encodedPrompt = encodeURIComponent(variations[i]);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now() + i}`;
            
            // Preload image
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Image load timeout')), 30000);
              img.onload = () => {
                clearTimeout(timeout);
                resolve();
              };
              img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Image load failed'));
              };
              img.src = imageUrl;
            });
            
            results.push({ url: imageUrl, status: 'complete' });
            setThumbnailStates(prev => prev.map((s, idx) => 
              idx === i ? { url: imageUrl, status: 'complete' } : s
            ));
          } catch (e) {
            results.push({ url: null, status: 'error', error: 'Failed to load' });
            setThumbnailStates(prev => prev.map((s, idx) => 
              idx === i ? { url: null, status: 'error', error: 'Failed to load' } : s
            ));
          }
          
          setProgress(((i + 1) / 4) * 100);
        }
        
        const successCount = results.filter(r => r.status === 'complete').length;
        if (successCount > 0) {
          incrementStat('thumbnailsCreated');
          toast.success(`Generated ${successCount}/4 thumbnails!`);
        } else {
          throw new Error("All thumbnails failed to generate");
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to generate thumbnails";
      const errorStatus = error instanceof EdgeFunctionError ? error.status : 0;

      if (errorStatus === 401 || errorStatus === 403) {
        toast.error("Your Fal.ai API key is invalid or unauthorized. Update it in Settings.");
      } else if (errorStatus === 429) {
        toast.error("Fal.ai rate limit reached. Please wait a moment and try again.");
      } else {
        toast.error(errorMessage);
      }
      
      // Mark all as error
      setThumbnailStates(prev => prev.map(s => 
        s.status !== 'complete' ? { url: null, status: 'error', error: errorMessage } : s
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (imageUrl: string, index: number) => {
    if (!imageUrl) {
      toast.error("No image to download");
      return;
    }
    
    try {
      await downloadAsImage(imageUrl, `thumbnail-${index + 1}-${Date.now()}.png`);
      toast.success("Thumbnail downloaded!");
    } catch (error) {
      console.error('Download error:', error);
      toast.error("Failed to download thumbnail. Try right-click > Save Image.");
    }
  };

  const handleDownloadAll = async () => {
    const completedThumbnails = thumbnailStates.filter(s => s.url);
    if (completedThumbnails.length === 0) {
      toast.error("No thumbnails to download");
      return;
    }
    
    let downloaded = 0;
    for (let i = 0; i < thumbnailStates.length; i++) {
      if (thumbnailStates[i].url) {
        try {
          await handleDownload(thumbnailStates[i].url!, i);
          downloaded++;
          // Small delay between downloads
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          console.error(`Failed to download thumbnail ${i + 1}`);
        }
      }
    }
    
    if (downloaded > 0) {
      toast.success(`Downloaded ${downloaded} thumbnails!`);
    }
  };

 
   const handleClearThumbnails = () => {
     setThumbnailStates([]);
     setSelectedIndex(0);
     setProgress(0);
     toast.success("Thumbnails cleared");
   };
 
   const handleRemoveThumbnail = (index: number) => {
     setThumbnailStates((prev) => prev.filter((_, i) => i !== index));
     if (selectedIndex >= index && selectedIndex > 0) {
       setSelectedIndex(selectedIndex - 1);
     }
   };
 
   const thumbnails = thumbnailStates.map(s => s.url).filter(Boolean) as string[];
   const completedCount = thumbnailStates.filter(s => s.status === 'complete').length;
   const errorCount = thumbnailStates.filter(s => s.status === 'error').length;

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
                disabled={isGenerating}
                maxLength={200}
              />
              {title.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm text-foreground">Emotion</Label>
                <Select value={emotion} onValueChange={setEmotion} disabled={isGenerating}>
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
                <Select value={style} onValueChange={setStyle} disabled={isGenerating}>
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
                  disabled={isGenerating}
                  className={cn(
                    "p-3 md:p-4 rounded-xl border transition-all duration-300 disabled:opacity-50",
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
                  disabled={isGenerating}
                  className={cn(
                    "p-3 md:p-4 rounded-xl border transition-all duration-300 disabled:opacity-50",
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
                disabled={isGenerating}
                className="rounded border-border"
              />
              <Label htmlFor="useAI" className="text-xs md:text-sm text-muted-foreground cursor-pointer">
                Use AI Generation (higher quality)
              </Label>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !title.trim() || title.trim().length < 3}
              className="w-full cyber-button text-primary-foreground h-11 md:h-12"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Grid3X3 className="w-4 h-4 mr-2" />
                  Generate 4 Thumbnails
                </>
              )}
            </Button>
            
            {/* Progress bar */}
            {isGenerating && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">
                  {completedCount}/4 complete
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3 md:pb-4">
               <div className="flex items-center justify-between flex-wrap gap-2">
               <CardTitle className="font-display text-base md:text-lg text-foreground">
                 Thumbnails
                 {thumbnailStates.length > 0 && (
                   <span className="ml-2 text-sm font-normal text-muted-foreground">
                     ({completedCount}/4 ready)
                   </span>
                 )}
               </CardTitle>
               {thumbnails.length > 0 && (
                 <div className="flex gap-2">
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={handleClearThumbnails}
                     disabled={isGenerating}
                     className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 h-9 md:h-10 px-3 text-xs md:text-sm touch-manipulation"
                   >
                     <Trash2 className="w-4 h-4" />
                     <span className="hidden sm:inline">Clear</span>
                   </Button>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={handleGenerate}
                     disabled={isGenerating}
                     className="gap-1.5 border-border hover:border-primary/50 h-9 md:h-10 px-3 text-xs md:text-sm touch-manipulation"
                   >
                     <RefreshCw className="w-4 h-4" />
                     <span className="hidden sm:inline">Regenerate</span>
                   </Button>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={handleDownloadAll}
                     disabled={isGenerating || thumbnails.length === 0}
                     className="gap-1.5 border-border hover:border-accent/50 h-9 md:h-10 px-3 text-xs md:text-sm touch-manipulation"
                   >
                     <Download className="w-4 h-4" />
                     <span className="hidden sm:inline">Download All</span>
                   </Button>
                 </div>
               )}
             </div>
          </CardHeader>
          <CardContent>
            {isGenerating || thumbnailStates.length > 0 ? (
              <div className="space-y-4">
                {/* Selected thumbnail preview */}
                {thumbnails.length > 0 && (
                  <div
                    className={cn(
                      "w-full rounded-xl border-2 border-primary overflow-hidden bg-secondary/50",
                      aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[400px] mx-auto"
                    )}
                  >
                    <img
                      src={thumbnails[selectedIndex] || thumbnails[0]}
                      alt={`Thumbnail ${selectedIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                 {/* Thumbnail grid with X buttons */}
                 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
                   {thumbnailStates.map((state, index) => (
                     <div key={index} className="relative group">
                       {/* X Close button - visible on hover */}
                       {state.status === 'complete' && !isGenerating && (
                         <button
                           onClick={() => handleRemoveThumbnail(index)}
                           className="close-button opacity-0 group-hover:opacity-100 z-20"
                           aria-label="Remove thumbnail"
                         >
                           <X className="w-3.5 h-3.5" />
                         </button>
                       )}
                       
                       <button
                         onClick={() => state.url && setSelectedIndex(thumbnails.indexOf(state.url))}
                         disabled={!state.url}
                         className={cn(
                           "w-full rounded-xl overflow-hidden border-2 transition-all backdrop-blur-sm",
                           "bg-card/80 shadow-md hover:shadow-lg touch-manipulation",
                           state.status === 'complete' && selectedIndex === thumbnails.indexOf(state.url!)
                             ? "border-primary ring-2 ring-primary/50"
                             : state.status === 'complete'
                             ? "border-border/50 hover:border-primary/50"
                             : state.status === 'error'
                             ? "border-destructive/30"
                             : "border-border/30"
                         )}
                       >
                         {state.status === 'complete' && state.url ? (
                           <img
                             src={state.url}
                             alt={`Thumbnail ${index + 1}`}
                             className={cn(
                               "w-full object-cover",
                               aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"
                             )}
                           />
                         ) : (
                           <div className={cn(
                             "w-full flex items-center justify-center bg-secondary/50",
                             aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]"
                           )}>
                             {state.status === 'generating' ? (
                               <Loader2 className="w-6 h-6 animate-spin text-primary" />
                             ) : state.status === 'error' ? (
                               <div className="text-center">
                                 <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
                                 <p className="text-xs text-destructive mt-1">Failed</p>
                               </div>
                             ) : (
                               <span className="text-sm text-muted-foreground font-medium">{index + 1}</span>
                             )}
                           </div>
                         )}
                       </button>
                       {state.status === 'complete' && state.url && (
                         <Button
                           variant="secondary"
                           size="icon"
                           onClick={() => handleDownload(state.url!, index)}
                           disabled={isGenerating}
                           className="absolute bottom-2 right-2 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
                         >
                           <Download className="w-4 h-4" />
                         </Button>
                       )}
                     </div>
                   ))}
                 </div>
                
                {/* Error summary */}
                {errorCount > 0 && !isGenerating && (
                  <p className="text-xs text-center text-muted-foreground">
                    {errorCount} thumbnail{errorCount > 1 ? 's' : ''} failed. Click Regenerate to try again.
                  </p>
                )}
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
