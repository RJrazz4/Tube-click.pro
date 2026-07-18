import { useState, useEffect } from "react";
import { Image as ImageIcon, Download, Loader2, RefreshCw, Grid3X3, AlertCircle, X, Trash2, Zap, Crown, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendlyError";
import { EdgeFunctionError, fetchEdgeFunctionJson } from "@/api/client/secureClient";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsImage } from "@/lib/export";
import { IMAGE_MODEL_MAP, type ImageModelBrand } from "@/api/server/imageRouter";
import { useQueryClient } from "@tanstack/react-query";
import { QK } from "@/api/client/queryKeys";
import { useTierConfig } from "@/hooks/useTierConfig";
import { ThumbnailCountRadioGroup } from "@/components/thumbnail/ThumbnailCountRadioGroup";

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
  const [brand, setBrand] = useState<ImageModelBrand>("Tube.Pro");
  const [isGenerating, setIsGenerating] = useState(false);
  const [thumbnailStates, setThumbnailStates] = useState<ThumbnailState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [useAI, setUseAI] = useState(true);
  const [progress, setProgress] = useState(0);
  const [thumbnailCount, setThumbnailCount] = useState(4);
  const queryClient = useQueryClient();
  const { isPremium, maxThumbnails, rawTier } = useTierConfig();

  useEffect(() => {
    const titleFromParams = searchParams.get('title');
    if (titleFromParams) setTitle(titleFromParams);
  }, [searchParams]);

  const getDimensions = (ratio: AspectRatio) => {
    return ratio === "16:9" ? { width: 1280, height: 720 } : { width: 1080, height: 1920 };
  };

  const handleGenerate = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { toast.error("Please enter a title"); return; }
    if (trimmedTitle.length < 3) { toast.error("Title too short"); return; }
    if (trimmedTitle.length > 200) { toast.error("Title too long"); return; }

    setIsGenerating(true);
    setProgress(0);
    const initialStates: ThumbnailState[] = [
      { url: null, status: 'generating' },
      ...Array.from({ length: Math.max(0, thumbnailCount - 1) }, () => ({
        url: null as string | null,
        status: 'pending' as const,
      })),
    ];
    setThumbnailStates(initialStates);

    try {
      const cacheKey = QK.thumbnail(trimmedTitle, emotion, style, aspectRatio, brand);
      const cached = queryClient.getQueryData<{ thumbnails: string[] }>(cacheKey);
      if (cached?.thumbnails && cached.thumbnails.filter(Boolean).length > 0) {
        const cachedStates: ThumbnailState[] = cached.thumbnails.map((url: string | null) => ({
          url,
          status: url ? 'complete' as const : 'error' as const,
        }));
        setThumbnailStates(cachedStates);
        setProgress(100);
        toast.success(`Served from cache — ${brand} instant! (React Query)`);
        return;
      }

      if (useAI) {
        const data = await fetchEdgeFunctionJson<{ thumbnails: Array<string | null>; brand: string; providerMap: any }>("generate-thumbnail", {
          title: trimmedTitle,
          emotion,
          style,
          aspectRatio,
          count: thumbnailCount,
          brand,
        });

        if (data.thumbnails && Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
          const newStates: ThumbnailState[] = data.thumbnails.map((url: string | null) => ({
            url,
            status: url ? 'complete' as const : 'error' as const,
            error: url ? undefined : 'Failed to generate'
          }));
          while (newStates.length < thumbnailCount) newStates.push({ url: null, status: 'error', error: 'Not generated' });
          setThumbnailStates(newStates);
          setProgress(100);
          queryClient.setQueryData(cacheKey, { thumbnails: data.thumbnails });
          const successCount = newStates.filter(s => s.status === 'complete').length;
          if (successCount > 0) {
            incrementStat('thumbnailsCreated');
            const firstSuccess = newStates.find(s => s.url);
            if (firstSuccess?.url) saveContent({ type: 'thumbnail', title: trimmedTitle, content: firstSuccess.url });
            if (successCount === thumbnailCount) toast.success(`All ${thumbnailCount} thumbnails via ${brand} (${IMAGE_MODEL_MAP[brand].provider})!`);
            else toast.warning(`Generated ${successCount}/${thumbnailCount} via ${brand}`);
          } else throw new Error("No thumbnails were generated");
        } else throw new Error("No thumbnails returned from API");
      } else {
        const { width, height } = getDimensions(aspectRatio);
        const variations = Array.from({ length: thumbnailCount }, (_, i) => {
          const prompts = [
            `${trimmedTitle}, ${emotion}, ${style}, YouTube thumbnail, professional, vibrant, eye-catching`,
            `${trimmedTitle}, dramatic lighting, ${style}, thumbnail design, high quality`,
            `${trimmedTitle}, ${emotion}, bold colors, viral thumbnail, engaging`,
            `${trimmedTitle}, cinematic, ${style}, social media, attention grabbing`,
            `${trimmedTitle}, ${emotion}, modern design, thumbnail, 4k, detailed`,
            `${trimmedTitle}, ${style}, minimalist, clean, professional thumbnail`,
          ];
          return prompts[i % prompts.length];
        });
        const results: ThumbnailState[] = [];
        for (let i = 0; i < variations.length; i++) {
          setThumbnailStates(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'generating' } : s));
          setProgress(((i + 0.5) / thumbnailCount) * 100);
          try {
            const encodedPrompt = encodeURIComponent(variations[i]);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Date.now() + i}`;
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Image load timeout')), 30000);
              img.onload = () => { clearTimeout(timeout); resolve(); };
              img.onerror = () => { clearTimeout(timeout); reject(new Error('Image load failed')); };
              img.src = imageUrl;
            });
            results.push({ url: imageUrl, status: 'complete' });
            setThumbnailStates(prev => prev.map((s, idx) => idx === i ? { url: imageUrl, status: 'complete' } : s));
          } catch (e) {
            results.push({ url: null, status: 'error', error: 'Failed to load' });
            setThumbnailStates(prev => prev.map((s, idx) => idx === i ? { url: null, status: 'error', error: 'Failed to load' } : s));
          }
          setProgress(((i + 1) / thumbnailCount) * 100);
        }
        const successCount = results.filter(r => r.status === 'complete').length;
        if (successCount > 0) { incrementStat('thumbnailsCreated'); toast.success(`Generated ${successCount}/${thumbnailCount} thumbnails!`); }
        else throw new Error("All thumbnails failed to generate");
      }
    } catch (error: unknown) {
      const friendly = friendlyError(error, "Failed to generate thumbnails");
      toast.error(friendly.title, { description: friendly.message });
      setThumbnailStates(prev => prev.map(s => s.status !== 'complete' ? { url: null, status: 'error', error: friendly.message } : s));
    } finally { setIsGenerating(false); }
  };

  const handleDownload = async (imageUrl: string, index: number) => {
    if (!imageUrl) { toast.error("No image to download"); return; }
    try { await downloadAsImage(imageUrl, `thumbnail-${index + 1}-${Date.now()}.png`); toast.success("Thumbnail downloaded!"); }
    catch { toast.error("Failed to download. Try right-click > Save Image."); }
  };

  const handleDownloadAll = async () => {
    const completed = thumbnailStates.filter(s => s.url);
    if (completed.length === 0) { toast.error("No thumbnails to download"); return; }
    let downloaded = 0;
    for (let i = 0; i < thumbnailStates.length; i++) {
      if (thumbnailStates[i].url) {
        try { await handleDownload(thumbnailStates[i].url!, i); downloaded++; await new Promise(r => setTimeout(r, 500)); } catch {}
      }
    }
    if (downloaded > 0) toast.success(`Downloaded ${downloaded} thumbnails!`);
  };

  const handleClearThumbnails = () => { setThumbnailStates([]); setSelectedIndex(0); setProgress(0); toast.success("Thumbnails cleared"); };
  const handleRemoveThumbnail = (index: number) => {
    setThumbnailStates(prev => prev.filter((_, i) => i !== index));
    if (selectedIndex >= index && selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
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
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] border border-primary/20 ml-2">{brand} • {IMAGE_MODEL_MAP[brand].provider}</span>
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">Generate 4 AI thumbnails at once via white-label engine — {brand} maps to {IMAGE_MODEL_MAP[brand].provider} server-side (no client keys). Cached per brand for instant revisit.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="cyber-card border-border lg:col-span-1">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">Title / Description</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Enter video title or describe thumbnail..." className="bg-secondary border-border h-10 md:h-11 text-sm" disabled={isGenerating} maxLength={200} />
              {title.length > 0 && <p className="text-xs text-muted-foreground text-right">{title.length}/200</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-foreground">Emotion</Label>
                <Select value={emotion} onValueChange={setEmotion} disabled={isGenerating}>
                  <SelectTrigger className="bg-secondary border-border h-9 text-sm"><SelectValue /></SelectTrigger>
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
                <Label className="text-xs text-foreground">Style</Label>
                <Select value={style} onValueChange={setStyle} disabled={isGenerating}>
                  <SelectTrigger className="bg-secondary border-border h-9 text-sm"><SelectValue /></SelectTrigger>
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

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground">Aspect Ratio</Label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setAspectRatio("16:9")} disabled={isGenerating} className={cn("p-3 rounded-xl border transition-all disabled:opacity-50", aspectRatio === "16:9" ? "border-primary bg-primary/20" : "border-border bg-secondary hover:border-primary/50")}>
                  <div className="w-full aspect-video bg-foreground/10 rounded mb-2" />
                  <span className="text-xs font-medium text-foreground">16:9</span>
                  <p className="text-xs text-muted-foreground">YouTube</p>
                </button>
                <button onClick={() => setAspectRatio("9:16")} disabled={isGenerating} className={cn("p-3 rounded-xl border transition-all disabled:opacity-50", aspectRatio === "9:16" ? "border-accent bg-accent/20" : "border-border bg-secondary hover:border-accent/50")}>
                  <div className="w-1/2 mx-auto aspect-[9/16] bg-foreground/10 rounded mb-2" />
                  <span className="text-xs font-medium text-foreground">9:16</span>
                  <p className="text-xs text-muted-foreground">Shorts</p>
                </button>
              </div>
            </div>

            {/* Phase 5 — Thumbnail count radio group */}
            <ThumbnailCountRadioGroup
              value={thumbnailCount}
              onChange={(count) => {
                setThumbnailCount(count);
                // Reset states when count changes
                setThumbnailStates([]);
                setSelectedIndex(0);
              }}
              disabled={isGenerating}
            />

            {/* Brand Selector — Phase C1/C2 */}
            <div className="space-y-2">
              <Label className="text-sm text-foreground flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-amber-400" />Visual Engine (White-Label)</Label>
              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(IMAGE_MODEL_MAP) as ImageModelBrand[]).map((b) => {
                  const cfg = IMAGE_MODEL_MAP[b];
                  const Icon = b === "Tube.Flash" ? Zap : b === "Tube.Pro" ? Crown : Film;
                  return (
                    <button key={b} onClick={() => setBrand(b)} disabled={isGenerating} className={cn("p-3 rounded-xl border text-left transition-all flex items-center gap-3 disabled:opacity-50", brand === b ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border bg-secondary hover:border-primary/30")}>
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", brand === b ? "bg-primary/20" : "bg-secondary")}>
                        <Icon className={cn("w-4 h-4", brand === b ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">{b}<span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", cfg.costTier === "free" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400")}>{cfg.costTier.toUpperCase()}</span></p>
                        <p className="text-[11px] text-muted-foreground truncate">{cfg.description.split("—")[0]}</p>
                        <p className="text-[10px] text-muted-foreground/70">{cfg.provider} • {cfg.quality} • {cfg.avgLatencyMs}ms</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground/70">Server maps brand to provider — client never knows Pollinations/SnapGen/Fal. Free tier Flash/Pro (no key), Pro Cinematic (server FAL_API_KEY).</p>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="useAI" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} disabled={isGenerating} className="rounded border-border" />
              <Label htmlFor="useAI" className="text-xs text-muted-foreground cursor-pointer">Use AI Generation ({brand} {IMAGE_MODEL_MAP[brand].provider})</Label>
            </div>

            <Button onClick={handleGenerate} disabled={isGenerating || !title.trim() || title.trim().length < 3} className="w-full cyber-button h-11">
              {isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating via {brand}...</> : <><Grid3X3 className="w-4 h-4 mr-2" />Generate {thumbnailCount} via {brand}</>}
            </Button>

            {isGenerating && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">{completedCount}/{thumbnailCount} complete • {brand}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3 md:pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="font-display text-base md:text-lg text-foreground">Thumbnails {thumbnailStates.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">({completedCount}/{thumbnailCount} ready • {brand})</span>}</CardTitle>
              {thumbnails.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleClearThumbnails} disabled={isGenerating} className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 h-9 px-3 text-xs"><Trash2 className="w-4 h-4" /><span className="hidden sm:inline">Clear</span></Button>
                  <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating} className="gap-1.5 border-border h-9 px-3 text-xs"><RefreshCw className="w-4 h-4" /><span className="hidden sm:inline">Regenerate</span></Button>
                  <Button variant="outline" size="sm" onClick={handleDownloadAll} disabled={isGenerating || thumbnails.length === 0} className="gap-1.5 border-border h-9 px-3 text-xs"><Download className="w-4 h-4" /><span className="hidden sm:inline">Download All</span></Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isGenerating || thumbnailStates.length > 0 ? (
              <div className="space-y-4">
                {thumbnails.length > 0 && (
                  <div className={cn("w-full rounded-xl border-2 border-primary overflow-hidden bg-secondary/50", aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[400px] mx-auto")}>
                    <img src={thumbnails[selectedIndex] || thumbnails[0]} alt={`Thumbnail ${selectedIndex + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {thumbnailStates.map((state, index) => (
                    <div key={index} className="relative group">
                      {state.status === 'complete' && !isGenerating && (
                        <button onClick={() => handleRemoveThumbnail(index)} className="close-button opacity-0 group-hover:opacity-100 z-20" aria-label="Remove"><X className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => state.url && setSelectedIndex(thumbnails.indexOf(state.url))} disabled={!state.url} className={cn("w-full rounded-xl overflow-hidden border-2 transition-all bg-card/80", state.status === 'complete' && selectedIndex === thumbnails.indexOf(state.url!) ? "border-primary ring-2 ring-primary/50" : state.status === 'complete' ? "border-border/50 hover:border-primary/50" : state.status === 'error' ? "border-destructive/30" : "border-border/30")}>
                        {state.status === 'complete' && state.url ? <img src={state.url} alt={`Thumbnail ${index + 1}`} className={cn("w-full object-cover", aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]")} loading="lazy" /> : <div className={cn("w-full flex items-center justify-center bg-secondary/50", aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16]")}>{state.status === 'generating' ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : state.status === 'error' ? <div className="text-center"><AlertCircle className="w-6 h-6 text-destructive mx-auto" /><p className="text-xs text-destructive mt-1">Failed</p></div> : <span className="text-sm text-muted-foreground">{index + 1}</span>}</div>}
                      </button>
                      {state.status === 'complete' && state.url && <Button variant="secondary" size="icon" onClick={() => handleDownload(state.url!, index)} disabled={isGenerating} className="absolute bottom-2 right-2 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"><Download className="w-4 h-4" /></Button>}
                    </div>
                  ))}
                </div>
                {errorCount > 0 && !isGenerating && <p className="text-xs text-center text-muted-foreground">{errorCount} failed. Regenerate or try {brand === "Tube.Cinematic" ? "Tube.Pro" : "Tube.Flash"} faster.</p>}
              </div>
            ) : (
              <div className={cn("w-full rounded-xl border border-border bg-secondary/50 flex items-center justify-center", aspectRatio === "16:9" ? "aspect-video" : "aspect-[9/16] max-h-[400px] mx-auto")}>
                <div className="text-center space-y-4 p-6">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-secondary flex items-center justify-center"><ImageIcon className="w-7 h-7 text-muted-foreground" /></div>
                  <div><p className="text-foreground font-medium text-sm">No thumbnails yet — try {brand}</p><p className="text-muted-foreground text-xs">Enter title and generate 4 via {IMAGE_MODEL_MAP[brand].provider} (white-label {brand})</p></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
