import { useState, useCallback } from "react";
import { Eye, Upload, Loader2, FileText, Trash2, AlertCircle, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageFile {
  id: string;
  file: File;
  preview: string;
}

export default function VisionGuide() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini-api-key") || "");
  const [images, setImages] = useState<ImageFile[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [guide, setGuide] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleApiKeySave = () => {
    localStorage.setItem("gemini-api-key", apiKey);
    toast.success("API Key saved!");
  };

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
    if (!apiKey) {
      toast.error("Please enter your Gemini API key");
      return;
    }

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

      // Prepare the request for Gemini API
      const parts = [
        {
          text: "Analyze these screenshots and write a clear, step-by-step tutorial guide. Format it in Markdown with proper headings, numbered steps, and helpful tips. Be detailed and user-friendly."
        },
        ...imageData.map((data) => ({
          inline_data: {
            mime_type: "image/png",
            data: data.split(",")[1],
          },
        })),
      ];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{ parts }],
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "API request failed");
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No guide generated";
      
      setGuide(text);
      toast.success("Guide generated successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate guide");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Eye className="w-7 h-7 text-green-400" />
          SnapGuide Vision
        </h1>
        <p className="text-muted-foreground mt-1">
          Turn your screenshots into professional step-by-step tutorials with AI.
        </p>
      </div>

      {/* API Key Warning */}
      {!apiKey && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-foreground font-medium">API Key Required</p>
              <p className="text-sm text-muted-foreground">
                You need a Google Gemini API key to use this feature.{" "}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Get your free key here
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <div className="space-y-4">
          {/* API Key Input */}
          <Card className="cyber-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-sm text-foreground flex items-center gap-2">
                <Key className="w-4 h-4" />
                Gemini API Key
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="bg-secondary border-border focus:border-primary"
                />
                <Button
                  variant="outline"
                  onClick={handleApiKeySave}
                  className="border-border hover:border-primary/50 shrink-0"
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Drop Zone */}
          <Card className="cyber-card border-border">
            <CardHeader>
              <CardTitle className="font-display text-lg text-foreground">Upload Screenshots</CardTitle>
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
                  "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 cursor-pointer",
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
                  "w-10 h-10 mx-auto mb-3",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )} />
                <p className="text-foreground font-medium">
                  {isDragging ? "Drop images here" : "Drag & drop screenshots"}
                </p>
                <p className="text-muted-foreground text-sm mt-1">
                  or click to browse files
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
                disabled={isGenerating || !apiKey || images.length === 0}
                className="w-full cyber-button-secondary text-accent-foreground h-12"
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
          <CardHeader>
            <CardTitle className="font-display text-lg text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Generated Guide
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] scrollbar-cyber">
              {guide ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-foreground bg-secondary/50 rounded-lg p-4 font-sans">
                    {guide}
                  </pre>
                </div>
              ) : (
                <div className="h-full min-h-[400px] flex items-center justify-center text-center p-8">
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                      <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">No guide yet</p>
                      <p className="text-muted-foreground text-sm">
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
