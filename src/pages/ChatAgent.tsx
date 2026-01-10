import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  type?: "title" | "hook" | "script";
}

const generateContent = async (topic: string): Promise<{ title: string; hook: string; script: string }> => {
  // Simulated AI generation with realistic delays
  await new Promise((r) => setTimeout(r, 1500));
  
  const titles = [
    `🔥 ${topic} - You Won't BELIEVE What Happened Next!`,
    `I Tried ${topic} for 30 Days... Here's What Happened`,
    `The TRUTH About ${topic} Nobody Tells You`,
    `${topic}: The Ultimate Guide (2024 Edition)`,
  ];

  const hooks = [
    `What if I told you that everything you knew about ${topic} was completely wrong? In the next 10 minutes, I'm going to show you something that will change your perspective forever...`,
    `Hey everyone! So yesterday I discovered something insane about ${topic}, and I just HAD to share it with you guys. But before we dive in, let me tell you a quick story...`,
    `Stop scrolling. Seriously. If you've ever been curious about ${topic}, this video is going to blow your mind. I spent weeks researching this, and what I found shocked me...`,
  ];

  const script = `# Video Script: ${topic}

## INTRO (0:00 - 0:30)
[HOOK - Start with high energy]
"${hooks[Math.floor(Math.random() * hooks.length)]}"

## SECTION 1: The Setup (0:30 - 3:00)
- Introduce the main topic
- Share a personal anecdote or case study
- Build curiosity with a teaser of what's coming

## SECTION 2: The Core Content (3:00 - 8:00)
### Point 1: The Foundation
- Explain the basics of ${topic}
- Use simple analogies
- Show visual examples (B-roll suggestion: relevant imagery)

### Point 2: The Deep Dive
- Get into the specifics
- Share expert insights or research
- Address common misconceptions

### Point 3: The Application
- How viewers can apply this knowledge
- Step-by-step breakdown
- Real-world examples

## SECTION 3: The Twist/Reveal (8:00 - 10:00)
- Share the unexpected insight about ${topic}
- Connect back to the hook
- Deliver on the promise made at the start

## OUTRO (10:00 - 11:00)
- Summarize key takeaways
- Call-to-action: "If you found this valuable, smash that like button!"
- Tease next video
- Encourage comments and subscription

## THUMBNAIL IDEAS:
1. Your face with shocked expression + bold text
2. Before/after split image
3. Mysterious dark aesthetic with glowing text

## TAGS SUGGESTION:
${topic}, ${topic} tutorial, ${topic} explained, ${topic} tips, how to ${topic}, ${topic} 2024
`;

  return {
    title: titles[Math.floor(Math.random() * titles.length)],
    hook: hooks[Math.floor(Math.random() * hooks.length)],
    script,
  };
};

export default function ChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState("");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const topic = input.trim();
    setInput("");
    setIsGenerating(true);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: topic }]);

    try {
      // Simulate typing indicator
      setMessages((prev) => [...prev, { role: "assistant", content: "🎯 Analyzing your topic..." }]);
      await new Promise((r) => setTimeout(r, 800));

      // Generate title
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "📝 Generating viral title...", type: "title" };
        return updated;
      });
      
      const { title, hook, script } = await generateContent(topic);

      // Update with title
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { 
          role: "assistant", 
          content: `**🎬 Title Generated:**\n\n${title}`, 
          type: "title" 
        };
        return updated;
      });

      await new Promise((r) => setTimeout(r, 1000));

      // Add hook
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `**🎣 Hook Generated:**\n\n"${hook}"`, 
        type: "hook" 
      }]);

      await new Promise((r) => setTimeout(r, 1000));

      // Add script notification
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: "**📜 Full Script Generated!**\n\nCheck the script panel on the right to view and copy your complete video script.", 
        type: "script" 
      }]);

      setGeneratedScript(script);
      toast.success("Content generated successfully!");

    } catch (error) {
      toast.error("Failed to generate content");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    toast.success("Script copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-[calc(100vh-8rem)] animate-fade-in">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
          <Bot className="w-7 h-7 text-primary" />
          TubeBot AI Agent
        </h1>
        <p className="text-muted-foreground mt-1">
          Your AI-powered content strategist. Enter a topic to generate titles, hooks, and scripts.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 h-[calc(100%-5rem)]">
        {/* Chat Panel */}
        <Card className="cyber-card border-border flex flex-col">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="font-display text-lg text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Chat Interface
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4 scrollbar-cyber" ref={scrollRef}>
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center p-8">
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center animate-float">
                      <Bot className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-foreground font-semibold">Ready to create viral content?</p>
                      <p className="text-muted-foreground text-sm mt-1">
                        Enter a video topic below and I'll generate a complete content package for you.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {["Horror Story Video", "Tech Review", "Day in My Life", "Tutorial Guide"].map((topic) => (
                        <button
                          key={topic}
                          onClick={() => setInput(topic)}
                          className="px-3 py-1.5 rounded-full bg-secondary text-sm text-foreground hover:bg-primary/20 hover:text-primary transition-colors"
                        >
                          {topic}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex gap-3 animate-fade-in",
                        message.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-3",
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      </div>
                      {message.role === "user" && (
                        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-accent" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isGenerating && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <form onSubmit={handleSubmit} className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Enter your video topic..."
                  className="flex-1 bg-secondary border-border focus:border-primary"
                  disabled={isGenerating}
                />
                <Button 
                  type="submit" 
                  disabled={isGenerating || !input.trim()}
                  className="cyber-button text-primary-foreground"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Script Panel */}
        <Card className="cyber-card border-border flex flex-col">
          <CardHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-lg text-foreground">Generated Script</CardTitle>
              {generatedScript && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-2 border-border hover:border-primary/50"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Script
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden">
            <ScrollArea className="h-full p-4 scrollbar-cyber">
              {generatedScript ? (
                <pre className="text-sm text-foreground whitespace-pre-wrap font-mono bg-secondary/50 rounded-lg p-4">
                  {generatedScript}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-center p-8">
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-secondary flex items-center justify-center">
                      <Copy className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-muted-foreground">
                        Your generated script will appear here
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
