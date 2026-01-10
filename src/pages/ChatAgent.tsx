import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Copy, Check, Sparkles, Download, ArrowRight, Hash, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { incrementStat, saveContent } from "@/lib/stats";
import { downloadAsText } from "@/lib/export";
import { useNavigate } from "react-router-dom";

interface GeneratedContent {
  titles: string[];
  hooks: string[];
  script: string;
  hashtags: string[];
  description: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState("YouTube");
  const [style, setStyle] = useState("Engaging");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || isGenerating) return;

    setIsGenerating(true);
    setGeneratedContent(null);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: `Generate content for: ${topic} (${platform}, ${style} style)` }]);

    try {
      setMessages((prev) => [...prev, { role: "assistant", content: "🎯 Analyzing your topic and generating viral content..." }]);

      const { data, error } = await supabase.functions.invoke('generate-content', {
        body: { topic: topic.trim(), platform, style }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedContent(data);
      incrementStat('scriptsGenerated');
      
      // Save to local storage
      const fullContent = `
TOPIC: ${topic}
PLATFORM: ${platform}
STYLE: ${style}

--- TITLES ---
${data.titles?.join('\n') || ''}

--- HOOKS ---
${data.hooks?.join('\n') || ''}

--- SCRIPT ---
${data.script || ''}

--- HASHTAGS ---
${data.hashtags?.join(' ') || ''}

--- DESCRIPTION ---
${data.description || ''}
      `.trim();
      
      saveContent({
        type: 'script',
        title: topic,
        content: fullContent
      });

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { 
          role: "assistant", 
          content: "✅ Content generated successfully! Check the tabs on the right to see your viral titles, hooks, script, hashtags, and description." 
        };
        return updated;
      });

      toast.success("Content generated successfully!");
      setTopic("");

    } catch (error: any) {
      console.error("Generation error:", error);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { 
          role: "assistant", 
          content: `❌ Error: ${error.message || "Failed to generate content. Please try again."}` 
        };
        return updated;
      });
      toast.error(error.message || "Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = () => {
    if (!generatedContent) return;
    const content = `
TOPIC: ${topic || "Generated Content"}
PLATFORM: ${platform}
STYLE: ${style}

=== VIRAL TITLES ===
${generatedContent.titles?.join('\n') || 'N/A'}

=== HOOKS FOR SHORTS ===
${generatedContent.hooks?.join('\n\n') || 'N/A'}

=== FULL SCRIPT ===
${generatedContent.script || 'N/A'}

=== HASHTAGS ===
${generatedContent.hashtags?.join(' ') || 'N/A'}

=== VIDEO DESCRIPTION ===
${generatedContent.description || 'N/A'}
    `.trim();
    downloadAsText(content, `tubegenius-script-${Date.now()}.txt`);
    toast.success("Script downloaded!");
  };

  const handleSendToThumbnail = () => {
    if (generatedContent?.titles?.[0]) {
      navigate(`/thumbnails?title=${encodeURIComponent(generatedContent.titles[0])}`);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] animate-fade-in">
      <div className="mb-4 md:mb-6">
        <h1 className="font-display text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
          <Bot className="w-6 h-6 md:w-7 md:h-7 text-primary" />
          TubeBot AI Agent
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          Generate viral titles, hooks, scripts, hashtags & descriptions with AI
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 md:gap-6 h-[calc(100%-4rem)]">
        {/* Input Panel */}
        <Card className="cyber-card border-border flex flex-col">
          <CardHeader className="border-b border-border pb-3 md:pb-4">
            <CardTitle className="font-display text-base md:text-lg text-foreground flex items-center gap-2">
              <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-primary" />
              Content Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-3 md:p-4 overflow-hidden">
            {/* Settings */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm text-foreground">Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="bg-secondary border-border h-10 md:h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YouTube">YouTube</SelectItem>
                    <SelectItem value="YouTube Shorts">YouTube Shorts</SelectItem>
                    <SelectItem value="Instagram Reels">Instagram Reels</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs md:text-sm text-foreground">Style</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="bg-secondary border-border h-10 md:h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engaging">Engaging</SelectItem>
                    <SelectItem value="Educational">Educational</SelectItem>
                    <SelectItem value="Entertainment">Entertainment</SelectItem>
                    <SelectItem value="Dramatic">Dramatic</SelectItem>
                    <SelectItem value="Funny">Funny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea className="flex-1 mb-4 scrollbar-cyber" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center p-4 md:p-8">
                  <div className="space-y-4">
                    <div className="w-14 h-14 md:w-16 md:h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center animate-float">
                      <Bot className="w-7 h-7 md:w-8 md:h-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-foreground font-semibold text-sm md:text-base">Ready to create viral content?</p>
                      <p className="text-muted-foreground text-xs md:text-sm mt-1">
                        Enter a topic and I'll generate titles, hooks, script, hashtags & description.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {["Horror Story", "Tech Review", "Cooking Recipe", "Fitness Tips"].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTopic(t)}
                          className="px-3 py-1.5 rounded-full bg-secondary text-xs md:text-sm text-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex gap-2 md:gap-3 animate-fade-in",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5 md:w-4 md:h-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 md:px-4 md:py-3",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground"
                        )}
                      >
                        <p className="text-xs md:text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "user" && (
                        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 md:w-4 md:h-4 text-accent" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter your video topic..."
                className="flex-1 bg-secondary border-border focus:border-primary h-11 md:h-12 text-sm md:text-base"
                disabled={isGenerating}
              />
              <Button 
                type="submit" 
                disabled={isGenerating || !topic.trim()}
                className="cyber-button text-primary-foreground h-11 md:h-12 px-4 md:px-6"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 md:w-5 md:h-5" />
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Output Panel */}
        <Card className="cyber-card border-border flex flex-col overflow-hidden">
          <CardHeader className="border-b border-border pb-3 md:pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="font-display text-base md:text-lg text-foreground">Generated Content</CardTitle>
              {generatedContent && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    className="gap-1.5 border-border hover:border-primary/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSendToThumbnail}
                    className="gap-1.5 border-border hover:border-accent/50 h-8 md:h-9 text-xs md:text-sm"
                  >
                    <ArrowRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">Thumbnail</span>
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            {generatedContent ? (
              <Tabs defaultValue="titles" className="h-full flex flex-col">
                <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-10 md:h-11 overflow-x-auto">
                  <TabsTrigger value="titles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs md:text-sm px-3 md:px-4">
                    Titles
                  </TabsTrigger>
                  <TabsTrigger value="hooks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs md:text-sm px-3 md:px-4">
                    Hooks
                  </TabsTrigger>
                  <TabsTrigger value="script" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs md:text-sm px-3 md:px-4">
                    Script
                  </TabsTrigger>
                  <TabsTrigger value="hashtags" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs md:text-sm px-3 md:px-4">
                    Tags
                  </TabsTrigger>
                  <TabsTrigger value="description" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs md:text-sm px-3 md:px-4">
                    Desc
                  </TabsTrigger>
                </TabsList>
                
                <div className="flex-1 overflow-hidden">
                  <TabsContent value="titles" className="h-full m-0 p-3 md:p-4 overflow-auto">
                    <div className="space-y-2">
                      {generatedContent.titles?.map((title, index) => (
                        <div key={index} className="flex items-start gap-2 p-2 md:p-3 bg-secondary rounded-lg group">
                          <span className="text-primary font-bold text-xs md:text-sm">{index + 1}.</span>
                          <p className="flex-1 text-foreground text-xs md:text-sm">{title}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(title, `Title ${index + 1}`)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 md:h-8 md:w-8"
                          >
                            {copied === `Title ${index + 1}` ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="hooks" className="h-full m-0 p-3 md:p-4 overflow-auto">
                    <div className="space-y-2">
                      {generatedContent.hooks?.map((hook, index) => (
                        <div key={index} className="flex items-start gap-2 p-2 md:p-3 bg-secondary rounded-lg group">
                          <span className="text-accent font-bold text-xs md:text-sm">{index + 1}.</span>
                          <p className="flex-1 text-foreground text-xs md:text-sm">{hook}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(hook, `Hook ${index + 1}`)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 md:h-8 md:w-8"
                          >
                            {copied === `Hook ${index + 1}` ? (
                              <Check className="w-3.5 h-3.5 text-green-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="script" className="h-full m-0 p-3 md:p-4 overflow-auto">
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(generatedContent.script || '', 'Script')}
                        className="absolute top-2 right-2 gap-1.5 border-border h-7 md:h-8 text-xs"
                      >
                        {copied === 'Script' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy
                      </Button>
                      <pre className="text-xs md:text-sm text-foreground whitespace-pre-wrap font-mono bg-secondary/50 rounded-lg p-3 md:p-4 pr-20">
                        {generatedContent.script}
                      </pre>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="hashtags" className="h-full m-0 p-3 md:p-4 overflow-auto">
                    <div className="flex flex-wrap gap-2 mb-4">
                      {generatedContent.hashtags?.map((tag, index) => (
                        <button
                          key={index}
                          onClick={() => handleCopy(tag, tag)}
                          className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 bg-primary/20 text-primary rounded-full text-xs md:text-sm hover:bg-primary/30 transition-colors"
                        >
                          <Hash className="w-3 h-3" />
                          {tag.replace('#', '')}
                        </button>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(generatedContent.hashtags?.join(' ') || '', 'All hashtags')}
                      className="gap-1.5 border-border h-8 md:h-9 text-xs md:text-sm"
                    >
                      {copied === 'All hashtags' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy All
                    </Button>
                  </TabsContent>
                  
                  <TabsContent value="description" className="h-full m-0 p-3 md:p-4 overflow-auto">
                    <div className="relative">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(generatedContent.description || '', 'Description')}
                        className="absolute top-2 right-2 gap-1.5 border-border h-7 md:h-8 text-xs"
                      >
                        {copied === 'Description' ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                        Copy
                      </Button>
                      <div className="text-xs md:text-sm text-foreground whitespace-pre-wrap bg-secondary/50 rounded-lg p-3 md:p-4 pr-20">
                        {generatedContent.description}
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            ) : (
              <div className="h-full flex items-center justify-center text-center p-4 md:p-8">
                <div className="space-y-4">
                  <div className="w-14 h-14 md:w-16 md:h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                    <FileText className="w-7 h-7 md:w-8 md:h-8 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm md:text-base">
                      Your generated content will appear here
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
