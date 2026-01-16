import { useState, useEffect } from "react";
import { 
  Film, 
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
  Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { incrementStat, saveContent } from "@/lib/stats";
import JSZip from "jszip";

interface Scene {
  beat_type: string;
  scene_number: number;
  who: string;
  what: string;
  emotion: string;
  location: string;
  camera_angle: string;
  visual_prompt: string;
  imageUrl?: string;
  status?: 'pending' | 'generating' | 'complete' | 'error';
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

export default function Storyboard() {
  const [script, setScript] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGeneratingScene, setCurrentGeneratingScene] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);

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

  // Save to localStorage whenever scenes change
  useEffect(() => {
    if (scenes.length > 0) {
      localStorage.setItem('tubegenius_storyboard', JSON.stringify({ script, scenes }));
    }
  }, [scenes, script]);

  const analyzeScript = async () => {
    if (!script.trim()) {
      toast.error("Please enter a script to analyze");
      return;
    }

    // Validate minimum script length
    if (script.trim().length < 100) {
      toast.error("Script too short. Please provide at least 100 characters for meaningful analysis.");
      return;
    }

    setIsAnalyzing(true);
    setScenes([]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-storyboard`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ script }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to analyze script');
      }

      const data = await response.json();
      
      // Enforce maximum 6 scenes client-side as well
      const limitedScenes = (data.scenes || []).slice(0, 6);
      const analyzedScenes = limitedScenes.map((scene: Scene) => ({
        ...scene,
        status: 'pending' as const
      }));

      setScenes(analyzedScenes);
      toast.success(`Identified ${analyzedScenes.length} story-critical scenes (max 6)!`);

    } catch (error) {
      console.error("Analysis error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze script");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateImage = async (sceneIndex: number): Promise<boolean> => {
    const scene = scenes[sceneIndex];
    
    setScenes(prev => prev.map((s, i) => 
      i === sceneIndex ? { ...s, status: 'generating' } : s
    ));
    setCurrentGeneratingScene(scene.scene_number);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-storyboard-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            prompt: scene.visual_prompt,
            sceneNumber: scene.scene_number
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate image');
      }

      const data = await response.json();
      
      setScenes(prev => prev.map((s, i) => 
        i === sceneIndex ? { ...s, imageUrl: data.imageUrl, status: 'complete' } : s
      ));

      return true;

    } catch (error) {
      console.error(`Error generating scene ${scene.scene_number}:`, error);
      setScenes(prev => prev.map((s, i) => 
        i === sceneIndex ? { ...s, status: 'error' } : s
      ));
      return false;
    }
  };

  const generateAllImages = async () => {
    if (scenes.length === 0) {
      toast.error("Analyze a script first");
      return;
    }

    setIsGenerating(true);
    setProgress(0);

    let successCount = 0;
    
    for (let i = 0; i < scenes.length; i++) {
      // Skip already completed scenes
      if (scenes[i].status === 'complete' && scenes[i].imageUrl) {
        successCount++;
        setProgress(((i + 1) / scenes.length) * 100);
        continue;
      }

      const success = await generateImage(i);
      if (success) successCount++;
      
      setProgress(((i + 1) / scenes.length) * 100);
      
      // Small delay between generations to avoid rate limits
      if (i < scenes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    setIsGenerating(false);
    setCurrentGeneratingScene(null);
    
    // Track stats
    incrementStat('thumbnailsCreated');
    saveContent({
      type: 'storyboard',
      title: `Storyboard - ${scenes.length} scenes`,
      content: script.substring(0, 200)
    });

    if (successCount === scenes.length) {
      toast.success(`All ${scenes.length} cinematic frames generated!`);
    } else {
      toast.warning(`Generated ${successCount}/${scenes.length} scenes. Some failed.`);
    }
  };

  const regenerateScene = async (index: number) => {
    setIsGenerating(true);
    await generateImage(index);
    setIsGenerating(false);
    setCurrentGeneratingScene(null);
    toast.success(`Scene ${index + 1} regenerated!`);
  };

  const downloadAllAsZip = async () => {
    const completedScenes = scenes.filter(s => s.imageUrl);
    if (completedScenes.length === 0) {
      toast.error("No images to download");
      return;
    }

    const zip = new JSZip();
    const folder = zip.folder("storyboard");

    for (const scene of completedScenes) {
      if (scene.imageUrl && folder) {
        try {
          // Convert base64 to blob
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
        } catch (e) {
          console.error('Failed to add image to zip:', e);
        }
      }
    }

    // Add script file
    folder?.file('script.txt', script);

    // Add scene descriptions
    const descriptions = scenes.map(s => 
      `Scene ${s.scene_number} - ${s.beat_type}\n` +
      `Who: ${s.who}\n` +
      `What: ${s.what}\n` +
      `Emotion: ${s.emotion}\n` +
      `Location: ${s.location}\n` +
      `Camera: ${s.camera_angle}\n\n`
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

    toast.success("Storyboard downloaded!");
  };

  const completedCount = scenes.filter(s => s.status === 'complete').length;

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Film className="w-6 h-6 md:w-7 md:h-7 text-purple-400" />
          Visual Storyboard AI
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate only story-critical cinematic frames from your script
        </p>
      </div>

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
              placeholder="Paste your video script here...

The AI will analyze it and identify the most powerful visual moments:
• Opening Hook
• Problem
• Discovery  
• Method
• Proof
• Transformation
• Call to Action

Only 6-10 story-critical scenes will be generated."
              className="min-h-[300px] md:min-h-[400px] bg-secondary border-border focus:border-primary resize-none text-sm"
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{script.length} characters</span>
              <span>~{Math.ceil(script.split(/\s+/).filter(Boolean).length / 150)} min read</span>
            </div>

            <div className="space-y-3">
              <Button
                onClick={analyzeScript}
                disabled={isAnalyzing || !script.trim()}
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
                    disabled={isGenerating}
                    className="w-full cyber-button-secondary h-12"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating Scene {currentGeneratingScene}...
                      </>
                    ) : (
                      <>
                        <Film className="w-4 h-4 mr-2" />
                        Generate {scenes.length} Visuals
                      </>
                    )}
                  </Button>

                  {isGenerating && (
                    <div className="space-y-2">
                      <Progress value={progress} className="h-2" />
                      <p className="text-xs text-center text-muted-foreground">
                        {completedCount}/{scenes.length} scenes complete
                      </p>
                    </div>
                  )}

                  {completedCount > 0 && (
                    <Button
                      variant="outline"
                      onClick={downloadAllAsZip}
                      disabled={isGenerating}
                      className="w-full border-border hover:border-green-500/50 hover:text-green-400"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download Storyboard ZIP
                    </Button>
                  )}
                </>
              )}
            </div>

            {/* Credit-saving info */}
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Smart analysis generates only 6-10 critical scenes, saving credits
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Storyboard Grid */}
        <Card className="cyber-card border-border lg:col-span-3">
          <CardHeader className="pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Film className="w-4 h-4 text-primary" />
                Cinematic Frames
              </span>
              {scenes.length > 0 && (
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {completedCount}/{scenes.length} Ready
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-center">
                <Film className="w-16 h-16 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm">
                  Paste your script and click "Analyze Script" to identify story-critical scenes
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {scenes.map((scene, index) => (
                  <div 
                    key={index}
                    className={cn(
                      "rounded-xl border overflow-hidden transition-all",
                      scene.status === 'complete' ? "border-green-500/30" : "border-border"
                    )}
                  >
                    {/* Scene Image */}
                    <div className="aspect-video bg-secondary/50 relative">
                      {scene.imageUrl ? (
                        <img 
                          src={scene.imageUrl} 
                          alt={`Scene ${scene.scene_number}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {scene.status === 'generating' ? (
                            <div className="text-center">
                              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                              <p className="text-xs text-muted-foreground">Generating...</p>
                            </div>
                          ) : scene.status === 'error' ? (
                            <div className="text-center">
                              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                              <p className="text-xs text-red-400">Failed</p>
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
