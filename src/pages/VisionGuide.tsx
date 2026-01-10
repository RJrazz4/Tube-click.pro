import { useState, useCallback } from "react";
import { Eye, Upload, Loader2, FileText, Trash2, Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsText } from "@/lib/export";

interface ImageFile {
  id: string;
  file: File;
  preview: string;
}

export default function VisionGuide() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [guide, setGuide] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith("image/")
    );

    addImages(files);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addImages(files);
  };

  const addImages = (files: File[]) => {
    const newImages: ImageFile[] = files.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...newImages]);
    toast.success(`Added ${files.length} image(s)`);
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const generateGuide = async () => {
    if (images.length === 0) {
      toast.error("Please add at least one screenshot");
      return;
    }

    setIsGenerating(true);

    try {
      // Convert images to base64
      const imageData = await Promise.all(
        images.map(async (img) => {
          const response = await fetch(img.preview);
          const blob = await response.blob();
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        })
      );

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('vision-guide', {
        body: { images: imageData }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setGuide(data.guide);
      incrementStat('guidesCreated');
      
      // Save to local storage
      saveContent({
        type: 'guide',
        title: `Tutorial Guide - ${new Date().toLocaleDateString()}`,
        content: data.guide
      });

      toast.success("Guide generated successfully!");
    } catch (error: any) {
      console.error("Vision guide error:", error);
      toast.error(error.message || "Failed to generate guide");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(guide);
    setCopied(true);
    toast.success("Guide copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadAsText(guide, `tutorial-guide-${Date.now()}.md`);
    toast.success("Guide downloaded as Markdown!");
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Eye className="w-6 h-6 md:w-7 md:h-7 text-green-400" />
          SnapGuide Vision
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Upload screenshots and let AI create step-by-step tutorials automatically.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6">
        {/* Upload Section */}
        <div className="space-y-4">
          {/* Drop Zone */}
          <Card className="cyber-card border-border">
            <CardHeader className="pb-3 md:pb-4">
              <CardTitle className="font-display text-base md:text-lg text-foreground">Upload Screenshots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 md:p-8 text-center transition-all duration-300 cursor-pointer",
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Upload className={cn(
                  "w-8 h-8 md:w-10 md:h-10 mx-auto mb-3",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )} />
                <p className="text-foreground font-medium text-sm md:text-base">
                  {isDragging ? "Drop images here" : "Drag & drop screenshots"}
                </p>
                <p className="text-muted-foreground text-xs md:text-sm mt-1">
                  or tap to browse files
                </p>
              </div>

              {/* Image Preview Grid */}
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative group">
                      <img
                        src={img.preview}
                        alt=""
                        className="w-full aspect-video object-cover rounded-lg border border-border"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute top-1 right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3 text-destructive-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Button
                onClick={generateGuide}
                disabled={isGenerating || images.length === 0}
                className="w-full cyber-button-secondary text-accent-foreground h-11 md:h-12"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Screenshots...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Generate Tutorial Guide
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output Section */}
        <Card className="cyber-card border-border h-fit">
          <CardHeader className="pb-3 md:pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 md:w-5 md:h-5" />
                Generated Guide
              </CardTitle>
              {guide && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="gap-1.5 border-border hover:border-primary/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-1.5 border-border hover:border-accent/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Download MD</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] md:h-[500px] scrollbar-cyber">
              {guide ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-xs md:text-sm text-foreground bg-secondary/50 rounded-lg p-3 md:p-4 font-sans leading-relaxed">
                    {guide}
                  </pre>
                </div>
              ) : (
                <div className="h-full min-h-[350px] md:min-h-[400px] flex items-center justify-center text-center p-6 md:p-8">
                  <div className="space-y-4">
                    <div className="w-14 h-14 md:w-16 md:h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                      <FileText className="w-7 h-7 md:w-8 md:h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium text-sm md:text-base">No guide yet</p>
                      <p className="text-muted-foreground text-xs md:text-sm">
                        Upload screenshots and click generate to create your tutorial
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
