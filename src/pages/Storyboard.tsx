import { useState, useEffect, useRef, useMemo } from "react";
import { 
   Film,
   X,
   Trash2, 
  Sparkles, 
  Download, 
  RefreshCw, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  Clapperboard,
  Eye,
  MapPin,
  Camera,
  Heart,
  Video,
  Clock,
  Crown,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { toastFriendlyError } from "@/lib/errorToast";
import { EdgeFunctionError, fetchEdgeFunctionJson } from "@/api/client/secureClient";
import { cn } from "@/lib/utils";
import { incrementStat, saveContent } from "@/lib/stats";
import JSZip from "jszip";
import { IMAGE_MODEL_MAP, type ImageModelBrand } from "@/api/server/imageRouter";
import { useJson2Video } from "@/hooks/useJson2Video";
import { useTierConfig } from "@/hooks/useTierConfig";
import { TierAlertBanner } from "@/components/storyboard/TierAlertBanner";
import { FileJson } from "lucide-react";

interface Scene {
  beat_type: string;
  scene_number: number;
  who: string;
  what: string;
  emotion: string;
  location: string;
  camera_angle: string;
  visual_prompt: string;
  motion_prompt?: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'complete' | 'error' | 'retrying' | 'timeout';
  retryCount?: number;
  startTime?: number;
}

const BEAT_COLORS: Record<string, string> = {
  'Opening Hook': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Problem': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Discovery': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Method': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Proof': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  'Transformation': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Call to Action': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const SCENE_TIMEOUT = 45000; // 45 seconds timeout per scene

export default function Storyboard() {
  const [script, setScript] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGeneratingScene, setCurrentGeneratingScene] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [retryingScene, setRetryingScene] = useState<number | null>(null);
  const [brand, setBrand] = useState<ImageModelBrand>("Tube.Cinematic");
  const [aspectRatioJ2V, setAspectRatioJ2V] = useState<"9:16" | "16:9">("9:16");
  const { isBuilding: isBuildingJ2V, buildPayload: buildJ2VPayload, downloadJson: downloadJ2VJson, sendToJson2Video: sendJ2V } = useJson2Video();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { rawTier, isPremium, maxScenes, exceedsSceneLimit } = useTierConfig();

  // Load saved storyboard from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tubegenius_storyboard');
    if (saved) {
      try {
        const { script: savedScript, scenes: savedScenes } = JSON.parse(saved);
        if (savedScript) setScript(savedScript);
        if (savedScenes) setScenes(savedScenes);
      } catch (e) {
        console.error('Failed to load saved storyboard:', e);
      }
    }
  }, []);

  // Save to localStorage whenever scenes change (without base64 images to avoid quota)
  useEffect(() => {
    if (scenes.length > 0) {
      try {
        const lightScenes = scenes.map(s => ({
          ...s,
          imageUrl: s.imageUrl?.startsWith('data:') ? undefined : s.imageUrl,
        }));
        localStorage.setItem('tubegenius_storyboard', JSON.stringify({ script, scenes: lightScenes }));
      } catch (e) {
        console.warn('Could not save storyboard to localStorage:', e);
      }
    }
  }, [scenes, script]);

  /**
   * Create a simplified fallback prompt when the main prompt fails
   */
  const createFallbackPrompt = (scene: Scene, attempt: number): string => {
    if (attempt === 1) {
      // First retry: simplify the prompt
      return `Professional cinematic photo, ${scene.location}, ${scene.who}, ${scene.emotion} expression, ${scene.camera_angle}, high quality, no text, no watermark`;
    } else if (attempt === 2) {
      // Second retry: even simpler
      return `Portrait photo of ${scene.who.split(' ').slice(0, 4).join(' ')}, ${scene.emotion}, professional lighting, cinematic`;
    } else {
      // Final retry: ultra-simple
      return `Professional photo, person with ${scene.emotion} expression, cinematic lighting`;
    }
  };

  const analyzeScript = async () => {
    if (!script.trim()) {
      toast.error("Please enter a script to analyze");
      return;
    }

    if (script.trim().length < 100) {
      toast.error("Script too short. Please provide at least 100 characters for meaningful analysis.");
      return;
    }

    setIsAnalyzing(true);
    setScenes([]);

    try {
      const data = await fetchEdgeFunctionJson<{ scenes: Scene[] }>("analyze-storyboard", {
        script,
      });
      
      // Dynamic scene count (4-10)
      const analyzedScenes = (data.scenes || []).slice(0, 10).map((scene: Scene) => ({
        ...scene,
        status: 'pending' as const,
        retryCount: 0
      }));

      setScenes(analyzedScenes);
      toast.success(`Identified ${analyzedScenes.length} story-critical scenes!`);

    } catch (error) {
      if (error instanceof EdgeFunctionError && (error.status === 401 || error.status === 403)) {
        toast.error("Session could not be verified. Please refresh and try again.");
      } else {
        toastFriendlyError(error, "Failed to analyze script");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Generate image for a single scene with retry logic and timeout
   */
  const generateImage = async (sceneIndex: number, isRetry: boolean = false): Promise<boolean> => {
    const scene = scenes[sceneIndex];
    const currentRetryCount = scene.retryCount || 0;
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    const startTime = Date.now();
    
    // Update status
    setScenes(prev => prev.map((s, i) => 
      i === sceneIndex ? { 
        ...s, 
        status: isRetry ? 'retrying' : 'generating',
        retryCount: currentRetryCount,
        startTime
      } : s
    ));
    setCurrentGeneratingScene(scene.scene_number);
    if (isRetry) setRetryingScene(scene.scene_number);

    // Determine which prompt to use based on retry count
    const promptToUse = currentRetryCount === 0 
      ? scene.visual_prompt 
      : createFallbackPrompt(scene, currentRetryCount);

    try {
      const timeoutId = window.setTimeout(() => {
        abortControllerRef.current?.abort();
      }, SCENE_TIMEOUT);

      const data = await fetchEdgeFunctionJson<{ imageUrl: string }>(
        "generate-storyboard-image",
        {
          prompt: promptToUse,
          sceneNumber: scene.scene_number,
          brand,
        },
        abortControllerRef.current.signal,
      );

      clearTimeout(timeoutId);
      
      if (!data.imageUrl) {
        throw new Error('No image returned from API');
      }
      
      setScenes(prev => prev.map((s, i) => 
        i === sceneIndex ? { ...s, imageUrl: data.imageUrl, status: 'complete', retryCount: 0 } : s
      ));
      setRetryingScene(null);

      return true;

    } catch (error) {
      const isAbortError = error instanceof DOMException && error.name === "AbortError";
      const errorMessage = isAbortError
        ? 'Scene generation timed out'
        : error instanceof Error
          ? error.message
          : 'Unknown error';
      const isTimeout = errorMessage.includes('timed out');
      
      // Check if we should retry
      if (currentRetryCount < MAX_RETRIES) {
        // Update retry count and status
        setScenes(prev => prev.map((s, i) => 
          i === sceneIndex ? { 
            ...s, 
            retryCount: currentRetryCount + 1, 
            status: isTimeout ? 'timeout' : 'retrying' 
          } : s
        ));
        
        // Wait before retry (longer wait for timeout)
        await new Promise(resolve => setTimeout(resolve, isTimeout ? RETRY_DELAY * 2 : RETRY_DELAY));
        
        // Recursive retry with incremented count
        return generateImage(sceneIndex, true);
      }
      
      // All retries exhausted
      setScenes(prev => prev.map((s, i) => 
        i === sceneIndex ? { ...s, status: 'error', retryCount: currentRetryCount } : s
      ));
      setRetryingScene(null);
      return false;
    }
  };

  /**
   * Generate all images sequentially with auto-recovery
   */
  const generateAllImages = async () => {
    if (scenes.length === 0) {
      toast.error("Analyze a script first");
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    let successCount = 0;
    let failedScenes: number[] = [];
    
    // Sequential generation to avoid rate limits
    for (let i = 0; i < scenes.length; i++) {
      // Skip already completed scenes
      if (scenes[i].status === 'complete' && scenes[i].imageUrl) {
        successCount++;
        setProgress(((i + 1) / scenes.length) * 100);
        continue;
      }

      // Reset retry count for fresh generation
      setScenes(prev => prev.map((s, idx) => 
        idx === i ? { ...s, retryCount: 0 } : s
      ));

      const success = await generateImage(i);
      if (success) {
        successCount++;
      } else {
        failedScenes.push(i + 1);
      }
      
      setProgress(((i + 1) / scenes.length) * 100);
      
      // Delay between scenes to avoid rate limits
      if (i < scenes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    setIsGenerating(false);
    setCurrentGeneratingScene(null);
    
    // Track stats
    if (successCount > 0) {
      incrementStat('thumbnailsCreated');
      saveContent({
        type: 'storyboard',
        title: `Storyboard - ${scenes.length} scenes`,
        content: script.substring(0, 200)
      });
    }

    // Final status toast
    if (successCount === scenes.length) {
      toast.success(`All ${scenes.length} cinematic frames generated successfully!`);
    } else if (successCount > 0) {
      toast.warning(`Generated ${successCount}/${scenes.length} scenes. Scenes ${failedScenes.join(', ')} failed after ${MAX_RETRIES + 1} attempts. Click Retry to try again.`);
    } else {
      toast.error(`All scenes failed. Please check your connection and try again.`);
    }
  };

  /**
   * Regenerate a single failed scene
   */
  const regenerateScene = async (index: number) => {
    setIsGenerating(true);
    
    // Reset retry count
    setScenes(prev => prev.map((s, i) => 
      i === index ? { ...s, retryCount: 0, status: 'pending' } : s
    ));
    
    const success = await generateImage(index);
    setIsGenerating(false);
    setCurrentGeneratingScene(null);
    
    if (success) {
      toast.success(`Scene ${index + 1} regenerated successfully!`);
    } else {
      toast.error(`Scene ${index + 1} failed after ${MAX_RETRIES + 1} attempts. Try again later.`);
    }
  };

  const downloadAllAsZip = async () => {
    const completedScenes = scenes.filter(s => s.imageUrl);
    if (completedScenes.length === 0) {
      toast.error("No images to download. Generate scenes first.");
      return;
    }

    try {
      const zip = new JSZip();
      const folder = zip.folder("storyboard");

      for (const scene of completedScenes) {
        if (scene.imageUrl && folder) {
          try {
            if (scene.imageUrl.startsWith('data:')) {
              // Base64 image
              const base64Data = scene.imageUrl.split(',')[1];
              const byteCharacters = atob(base64Data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              folder.file(
                `scene_${String(scene.scene_number).padStart(2, '0')}_${scene.beat_type.replace(/\s+/g, '_')}.png`,
                byteArray,
                { binary: true }
              );
            } else if (scene.imageUrl.startsWith('http')) {
              // URL-based image (from Fal.ai)
              const response = await fetch(scene.imageUrl);
              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();
              folder.file(
                `scene_${String(scene.scene_number).padStart(2, '0')}_${scene.beat_type.replace(/\s+/g, '_')}.png`,
                new Uint8Array(arrayBuffer),
                { binary: true }
              );
            }
          } catch (e) {
            console.error('Failed to add image to zip:', e);
          }
        }
      }

      // Add script file
      folder?.file('script.txt', script);

      // Add scene descriptions with motion prompts
      const descriptions = scenes.map(s => 
        `Scene ${s.scene_number} - ${s.beat_type}\n` +
        `Who: ${s.who}\n` +
        `What: ${s.what}\n` +
        `Emotion: ${s.emotion}\n` +
        `Location: ${s.location}\n` +
        `Camera: ${s.camera_angle}\n` +
        `Motion: ${s.motion_prompt || 'Standard cinematic movement'}\n` +
        `Visual Prompt: ${s.visual_prompt}\n\n`
      ).join('---\n\n');
      folder?.file('scene_descriptions.txt', descriptions);

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storyboard_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Storyboard downloaded with ${completedScenes.length} images!`);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to create download. Please try again.');
    }
  };

 
   const handleClearWorkspace = () => {
     if (isGenerating) return;
     setScenes([]);
     setScript("");
     setProgress(0);
     localStorage.removeItem('tubegenius_storyboard');
     toast.success("Workspace cleared");
   };
 
   const handleRemoveScene = (index: number) => {
     if (isGenerating) return;
     setScenes((prev) => prev.filter((_, i) => i !== index));
     toast.success("Scene removed");
   };
 
  const completedCount = scenes.filter(s => s.status === 'complete').length;
  const errorCount = scenes.filter(s => s.status === 'error').length;
  const pendingCount = scenes.filter(s => s.status === 'pending').length;

  // Tier banner variant — Phase 5
  const bannerVariant = useMemo(() => {
    if (isPremium) return "premium" as const;
    if (scenes.length > maxScenes) return "limit" as const;
    return "free" as const;
  }, [isPremium, scenes.length, maxScenes]);

  const getStatusText = (scene: Scene): string => {
    if (scene.status === 'timeout') {
      return `Timeout - Retrying...`;
    }
    if (scene.status === 'retrying') {
      return `Retry ${(scene.retryCount || 0) + 1}/${MAX_RETRIES + 1}...`;
    }
    if (scene.status === 'generating') return 'Generating...';
    if (scene.status === 'error') return `Failed (${MAX_RETRIES + 1} attempts)`;
    if (scene.status === 'complete') return 'Complete';
    return 'Pending';
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Film className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
          Visual Storyboard AI
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate 4-10 cinematic frames with auto-retry &amp; timeout recovery
        </p>
      </div>

      {/* Phase 5 — Tier alert banner */}
      <TierAlertBanner
        variant={bannerVariant}
        sceneCount={scenes.length}
        maxScenes={maxScenes}
        onUpgrade={() => {
          toast.info("Upgrade flow — redirect to pricing page");
        }}
      />

      <div className="grid lg:grid-cols-5 gap-4 md:gap-6">
        {/* Script Input */}
        <Card className="cyber-card border-border lg:col-span-2">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-primary" />
              Your Script
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={"Paste your video script here...\n\nThe AI will analyze it and identify 4-10 powerful visual moments based on script complexity.\n\nEach scene includes image + motion prompts."}
              className="min-h-[300px] md:min-h-[400px] bg-secondary border-border focus:border-primary resize-none text-sm"
              disabled={isAnalyzing || isGenerating}
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{script.length} characters {script.length < 100 && script.length > 0 && '(min 100)'}</span>
              <span>~{Math.ceil(script.split(/\s+/).filter(Boolean).length / 150)} min read</span>
            </div>

            <div className="space-y-3">
              <Button
                onClick={analyzeScript}
                disabled={isAnalyzing || isGenerating || !script.trim() || script.trim().length < 100}
                className="w-full cyber-button h-12"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Story Beats...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Analyze Script
                  </>
                )}
              </Button>

              {scenes.length > 0 && (
                <>
                  <Button
                    onClick={generateAllImages}
                    disabled={isGenerating || isAnalyzing}
                    className="w-full cyber-button-secondary h-12"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {retryingScene 
                          ? `Retrying Scene ${retryingScene}...`
                          : `Generating Scene ${currentGeneratingScene}...`
                        }
                      </>
                    ) : (
                      <>
                        <Film className="w-4 h-4 mr-2" />
                        Generate All {scenes.length} Visuals
                      </>
                    )}
                  </Button>

                  {isGenerating && (
                    <div className="space-y-2">
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-center text-muted-foreground">
                        {completedCount}/{scenes.length} scenes complete
                        {retryingScene && ` • Retrying scene ${retryingScene}`}
                      </p>
                    </div>
                  )}

                  {completedCount > 0 && (
                    <>
                      <Button
                        variant="outline"
                        onClick={downloadAllAsZip}
                        disabled={isGenerating || isAnalyzing}
                        className="w-full border-border hover:border-green-500/50 hover:text-green-400"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Storyboard ZIP ({completedCount} images)
                      </Button>

                      {/* JSON2Video Payload Export — Phase D2 */}
                      <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 space-y-2">
                        <Label className="text-xs flex items-center gap-1.5"><FileJson className="w-3.5 h-3.5 text-purple-400" />JSON2Video Assembly — {aspectRatioJ2V} Shorts/Reels</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setAspectRatioJ2V("9:16")} disabled={isGenerating} className={cn("p-2 rounded-lg border text-xs", aspectRatioJ2V === "9:16" ? "border-purple-500 bg-purple-500/20 text-purple-300" : "border-border bg-secondary")}>9:16 Shorts</button>
                          <button onClick={() => setAspectRatioJ2V("16:9")} disabled={isGenerating} className={cn("p-2 rounded-lg border text-xs", aspectRatioJ2V === "16:9" ? "border-purple-500 bg-purple-500/20 text-purple-300" : "border-border bg-secondary")}>16:9 YouTube</button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const completed = scenes.filter(s => s.imageUrl);
                              if (completed.length === 0) { toast.error("Generate images first"); return; }
                              const payload = buildJ2VPayload({
                                storyboardScenes: completed.map(s => ({ imageUrl: s.imageUrl!, visual_prompt: s.visual_prompt, motion_prompt: s.motion_prompt, scene_number: s.scene_number, beat_type: s.beat_type })),
                                voiceoverText: script.slice(0, 2000),
                                topic: script.slice(0, 60) || "TubeGenius Storyboard",
                                aspectRatio: aspectRatioJ2V,
                                tier: "pro",
                              });
                              if (payload) downloadJ2VJson(payload, "api");
                            }}
                            disabled={isBuildingJ2V || isGenerating}
                            className="h-9 text-xs gap-1 border-purple-500/30 hover:border-purple-500/50"
                          >
                            {isBuildingJ2V ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileJson className="w-3.5 h-3.5" />}Export JSON2Video
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const completed = scenes.filter(s => s.imageUrl);
                              if (completed.length === 0) { toast.error("Generate images first"); return; }
                              const payload = buildJ2VPayload({
                                storyboardScenes: completed.map(s => ({ imageUrl: s.imageUrl!, visual_prompt: s.visual_prompt, motion_prompt: s.motion_prompt, scene_number: s.scene_number, beat_type: s.beat_type })),
                                voiceoverText: script.slice(0, 2000),
                                topic: script.slice(0, 60) || "TubeGenius Storyboard",
                                aspectRatio: aspectRatioJ2V,
                                tier: "pro",
                              });
                              if (payload) {
                                const res = await sendJ2V(payload);
                                if (res && (res as any).blueprint) {
                                  toast.info("JSON2VIDEO_API_KEY not set — payload blueprint ready, download JSON above");
                                }
                              }
                            }}
                            disabled={isBuildingJ2V || isGenerating}
                            className="h-9 text-xs gap-1 border-border"
                          >
                            {isBuildingJ2V ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}Render via JSON2Video
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70">Secure: JSON2VIDEO_API_KEY server-only (process.env). Frontend builds internal payload, server forwards to https://api.json2video.com/v2/movies. Free tier watermark, pro no watermark. Webhook at /api/webhook/json2video receives {"{url}"} when done.</p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* Brand Selector — Phase C2 White-Label */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                Visual Engine (Storyboard) — {brand}
              </Label>
              <div className="grid grid-cols-1 gap-1.5">
                {(Object.keys(IMAGE_MODEL_MAP) as ImageModelBrand[]).map((b) => {
                  const cfg = IMAGE_MODEL_MAP[b];
                  const Icon = b === "Tube.Flash" ? Zap : b === "Tube.Pro" ? Crown : Film;
                  return (
                    <button
                      key={b}
                      onClick={() => setBrand(b)}
                      disabled={isGenerating || isAnalyzing}
                      className={cn(
                        "p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all text-xs disabled:opacity-50",
                        brand === b ? "border-primary bg-primary/10 ring-1 ring-primary/20" : "border-border bg-secondary/50 hover:border-primary/30"
                      )}
                    >
                      <Icon className={cn("w-4 h-4", brand === b ? "text-primary" : "text-muted-foreground")} />
                      <div className="flex-1">
                        <p className="font-semibold text-foreground flex items-center gap-1">{b} <span className={cn("px-1 py-0 rounded text-[9px]", cfg.costTier === "free" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400")}>{cfg.costTier.toUpperCase()}</span></p>
                        <p className="text-[10px] text-muted-foreground truncate">{cfg.provider} • {cfg.quality}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground/70">White-label: client sends brand, server maps to {IMAGE_MODEL_MAP[brand].provider} — no keys exposed.</p>
            </div>

            {/* Status summary */}
            {scenes.length > 0 && (
              <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {completedCount} complete
                  </span>
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1.5 text-red-400">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {errorCount} failed
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="text-muted-foreground">
                      {pendingCount} pending
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">Brand: {brand} • {IMAGE_MODEL_MAP[brand].provider} • {IMAGE_MODEL_MAP[brand].costTier}</p>
              </div>
            )}

            {/* Info box */}
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-1">
              <p className="text-xs text-green-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Auto-retry with {MAX_RETRIES + 1} attempts per scene
              </p>
              <p className="text-xs text-green-400/70 flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                45s timeout detection with auto-recovery
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Storyboard Grid */}
        <Card className="cyber-card border-border lg:col-span-3">
           <CardHeader className="pb-3 md:pb-4">
             <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center justify-between gap-2">
               <span className="flex items-center gap-2">
                 <Film className="w-4 h-4 text-primary" />
                 Cinematic Frames
               </span>
               <div className="flex items-center gap-2">
                 {scenes.length > 0 && (
                   <>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={handleClearWorkspace}
                       disabled={isGenerating}
                       className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 h-9 px-3 text-xs touch-manipulation"
                     >
                       <Trash2 className="w-4 h-4" />
                       <span className="hidden sm:inline">Clear</span>
                     </Button>
                     <Badge variant="outline" className="border-primary/30 text-primary">
                       {completedCount}/{scenes.length} Ready
                     </Badge>
                   </>
                 )}
               </div>
             </CardTitle>
           </CardHeader>
          <CardContent>
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <Film className="w-16 h-16 text-muted-foreground/30 mb-4" />
                 <p className="text-muted-foreground text-sm">
                  Paste your script and click &quot;Analyze Script&quot; to identify story-critical scenes
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                 {scenes.map((scene, index) => (
                   <div 
                     key={index}
                     className={cn(
                       "group relative rounded-xl border overflow-hidden transition-all backdrop-blur-sm",
                       "bg-card/80 shadow-lg hover:shadow-xl",
                       scene.status === 'complete' ? "border-green-500/30" : 
                       scene.status === 'error' ? "border-red-500/30" :
                       scene.status === 'retrying' || scene.status === 'timeout' ? "border-yellow-500/30" : "border-border/50"
                     )}
                   >
                     {/* X Close button for each scene */}
                     {!isGenerating && (
                       <button
                         onClick={() => handleRemoveScene(index)}
                         className="close-button opacity-0 group-hover:opacity-100 top-1 right-1 z-20"
                         aria-label="Remove scene"
                       >
                         <X className="w-3.5 h-3.5" />
                       </button>
                     )}
                    {/* Scene Image */}
                    <div className="aspect-video bg-secondary/50 relative">
                      {scene.imageUrl ? (
                        <img 
                          src={scene.imageUrl} 
                          alt={scene.visual_prompt || `Scene ${scene.scene_number}: ${scene.what}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {scene.status === 'generating' || scene.status === 'retrying' || scene.status === 'timeout' ? (
                            <div className="text-center">
                              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                              <p className="text-xs text-muted-foreground">{getStatusText(scene)}</p>
                            </div>
                          ) : scene.status === 'error' ? (
                            <div className="text-center p-4">
                              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                              <p className="text-xs text-red-400 mb-2">{getStatusText(scene)}</p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => regenerateScene(index)}
                                disabled={isGenerating}
                                className="text-xs border-red-500/30 hover:border-red-500"
                              >
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                            </div>
                          ) : (
                            <div className="text-center">
                              <Camera className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                              <p className="text-xs text-muted-foreground">Pending</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Scene Number Badge */}
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-black/70 text-white border-0">
                          Scene {scene.scene_number}
                        </Badge>
                      </div>

                      {/* Beat Type Badge */}
                      <div className="absolute top-2 right-2">
                        <Badge className={cn("border", BEAT_COLORS[scene.beat_type] || "bg-secondary")}>
                          {scene.beat_type}
                        </Badge>
                      </div>

                      {/* Regenerate Button */}
                      {scene.status === 'complete' && (
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={() => regenerateScene(index)}
                          disabled={isGenerating}
                          className="absolute bottom-2 right-2 w-8 h-8 bg-black/70 hover:bg-black/90"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {/* Scene Details */}
                    <div className="p-3 space-y-2 bg-card">
                      <p className="text-sm font-medium text-foreground line-clamp-2">
                        {scene.what}
                      </p>
                      
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Eye className="w-3 h-3" />
                          {scene.who.substring(0, 30)}...
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Heart className="w-3 h-3 text-red-400" />
                          {scene.emotion}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3 text-blue-400" />
                          {scene.location.substring(0, 40)}...
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Camera className="w-3 h-3 text-purple-400" />
                        {scene.camera_angle}
                      </div>

                      {scene.motion_prompt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground border-t border-border/50 pt-2 mt-2">
                          <Video className="w-3 h-3 text-cyan-400" />
                          <span className="line-clamp-1">{scene.motion_prompt}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
