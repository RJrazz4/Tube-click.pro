import { useState, useCallback } from "react";
import { Eye, Upload, Loader2, FileText, Trash2, Download, Copy, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateVisionGuide } from "@/lib/localAiServices";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsText } from "@/lib/export";

interface ImageFile {
  id: string;
  file: File;
  preview: string;
}

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per image

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
    // Reset input to allow selecting same file again
    e.target.value = '';
  };

  const addImages = (files: File[]) => {
    // Validate file count
    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      toast.error(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }
    
    const filesToAdd = files.slice(0, remainingSlots);
    const oversizedFiles: string[] = [];
    
    const validFiles = filesToAdd.filter(file => {
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(file.name);
        return false;
      }
      return true;
    });
    
    if (oversizedFiles.length > 0) {
      toast.warning(`${oversizedFiles.length} file(s) too large (max 5MB): ${oversizedFiles.slice(0, 2).join(', ')}${oversizedFiles.length > 2 ? '...' : ''}`);
    }
    
    if (validFiles.length === 0) {
      return;
    }

    const newImages: ImageFile[] = validFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...newImages]);
    toast.success(`Added ${validFiles.length} image(s)`);
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
    setGuide("");

    try {
      // Convert images to base64 with progress
      const imageData: string[] = [];
      
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        try {
          const response = await fetch(img.preview);
          const blob = await response.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('Failed to read image'));
            reader.readAsDataURL(blob);
          });
          imageData.push(base64);
        } catch (e) {
          console.error(`Failed to process image ${i + 1}:`, e);
          toast.warning(`Skipped image ${i + 1} due to processing error`);
        }
      }
      
      if (imageData.length === 0) {
        throw new Error('Failed to process any images');
      }

      const generatedGuide = await generateVisionGuide(imageData);
      
      if (!generatedGuide.trim()) {
        throw new Error('No guide content was generated');
      }

      setGuide(generatedGuide);
      incrementStat('guidesCreated');
      
      // Save to local storage
      saveContent({
        type: 'guide',
        title: `Tutorial Guide - ${new Date().toLocaleDateString()}`,
        content: generatedGuide
      });

      toast.success("Guide generated successfully!");
    } catch (error: unknown) {
      console.error("Vision guide error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate guide";
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!guide) {
      toast.error("No guide to copy");
      return;
    }
    
    try {
      await navigator.clipboard.writeText(guide);
      setCopied(true);
      toast.success("Guide copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDownload = () => {
    if (!guide) {
      toast.error("No guide to download");
      return;
    }
    
    try {
      downloadAsText(guide, `tutorial-guide-${Date.now()}.md`);
      toast.success("Guide downloaded as Markdown!");
    } catch (error) {
      toast.error("Failed to download guide");
    }
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
              <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center justify-between">
                <span>Upload Screenshots</span>
                <span className="text-sm font-normal text-muted-foreground">
                  {images.length}/{MAX_IMAGES}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!isGenerating) setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={isGenerating ? undefined : handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 md:p-8 text-center transition-all duration-300",
                  isGenerating 
                    ? "opacity-50 cursor-not-allowed border-border"
                    : isDragging
                    ? "border-primary bg-primary/10 cursor-copy"
                    : "border-border hover:border-primary/50 cursor-pointer"
                )}
                onClick={() => !isGenerating && document.getElementById("file-input")?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={isGenerating}
                />
                <Upload className={cn(
                  "w-8 h-8 md:w-10 md:h-10 mx-auto mb-3",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )} />
                <p className="text-foreground font-medium text-sm md:text-base">
                  {isDragging ? "Drop images here" : "Drag & drop screenshots"}
                </p>
                <p className="text-muted-foreground text-xs md:text-sm mt-1">
                  or tap to browse (max {MAX_IMAGES} images, 5MB each)
                </p>
              </div>

              {/* Image Preview Grid */}
              {images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img, index) => (
                    <div key={img.id} className="relative group">
                      <div className="relative">
                        <img
                          src={img.preview}
                          alt={`Screenshot ${index + 1}`}
                          className="w-full aspect-video object-cover rounded-lg border border-border"
                        />
                        <span className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {index + 1}
                        </span>
                      </div>
                      <button
                        onClick={() => removeImage(img.id)}
                        disabled={isGenerating}
                        className="absolute top-1 right-1 w-6 h-6 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
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
                    Analyzing {images.length} Screenshot{images.length > 1 ? 's' : ''}...
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Generate Tutorial Guide
                  </>
                )}
              </Button>
              
              {images.length === 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  <AlertCircle className="w-3 h-3 inline mr-1" />
                  Add at least one screenshot to generate a guide
                </p>
              )}
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
                    disabled={isGenerating}
                    className="gap-1.5 border-border hover:border-primary/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={isGenerating}
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
