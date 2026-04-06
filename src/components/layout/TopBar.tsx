import { Settings, Key, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function TopBar() {
  const [geminiKey, setGeminiKey] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const savedGeminiKey = localStorage.getItem("gemini-api-key");
    const savedElevenLabsKey = localStorage.getItem("elevenlabs-api-key");
    if (savedGeminiKey) setGeminiKey(savedGeminiKey);
    if (savedElevenLabsKey) setElevenLabsKey(savedElevenLabsKey);
  }, [open]);

  const handleSaveKeys = () => {
    setIsSaving(true);
    
    if (geminiKey.trim()) {
      localStorage.setItem("gemini-api-key", geminiKey.trim());
    } else {
      localStorage.removeItem("gemini-api-key");
    }
    
    if (elevenLabsKey.trim()) {
      localStorage.setItem("elevenlabs-api-key", elevenLabsKey.trim());
    } else {
      localStorage.removeItem("elevenlabs-api-key");
    }
    
    toast.success("Settings saved successfully!", {
      description: "Your API keys have been stored securely in your browser.",
    });
    
    setIsSaving(false);
    setOpen(false);
  };

  const hasGeminiKey = !!localStorage.getItem("gemini-api-key");
  const hasElevenLabsKey = !!localStorage.getItem("elevenlabs-api-key");

  return (
    <header className="fixed top-0 left-20 right-0 h-16 bg-background/80 backdrop-blur-xl border-b border-border z-40 flex items-center justify-between px-6">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-bold">
          <span className="text-glow-purple text-primary">Tube</span>
          <span className="text-glow-cyan text-accent">Genius</span>
          <span className="text-foreground ml-1">Pro</span>
        </h1>
        <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-display uppercase tracking-wider">
          Beta
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {/* Status indicators */}
        <div className="hidden md:flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1 px-2 py-1 rounded-full ${hasElevenLabsKey ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${hasElevenLabsKey ? 'bg-green-400' : 'bg-yellow-400'}`} />
            Voice Engine
          </span>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 border-border hover:border-primary/50 hover:bg-primary/10 relative pr-4" 
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
              {/* Glowing animated badge */}
              <span className="absolute -top-2.5 -right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 animate-pulse shadow-lg shadow-pink-500/40 whitespace-nowrap">
                🔥 Free!
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                API Configuration
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Configure your API keys for enhanced features. Keys are stored locally in your browser.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 pt-4">
              {/* BYOK Banner */}
              <div className="relative overflow-hidden rounded-xl p-4 bg-gradient-to-r from-purple-600/20 via-pink-500/20 to-rose-500/20 border border-purple-500/30">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 animate-pulse" />
                <div className="relative flex items-start gap-3">
                  <Sparkles className="w-6 h-6 text-pink-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-snug">
                      Want Unlimited, Ad-Free Generations?
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Just paste your own free API keys below and unlock the full power forever!
                    </p>
                  </div>
                </div>
              </div>

              {/* Voice Engine API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="elevenlabs-key" className="text-foreground font-medium">
                    Voice Engine Key
                  </Label>
                  {hasElevenLabsKey && (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Configured
                    </span>
                  )}
                </div>
                <Input
                  id="elevenlabs-key"
                  type="password"
                  placeholder="sk_..."
                  value={elevenLabsKey}
                  onChange={(e) => setElevenLabsKey(e.target.value)}
                  className="bg-secondary border-border focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Required for unlimited premium AI voiceovers. Get a free key from{" "}
                  <a 
                    href="https://elevenlabs.io/app/settings/api-keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    elevenlabs.io
                  </a>
                </p>
              </div>

              <Separator className="bg-border" />

              {/* Vision Engine Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gemini-key" className="text-foreground font-medium">
                    Vision Engine Key
                  </Label>
                  {hasGeminiKey && (
                    <span className="text-xs text-green-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      Configured
                    </span>
                  )}
                </div>
                <Input
                  id="gemini-key"
                  type="password"
                  placeholder="AIza..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="bg-secondary border-border focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Required for Vision Guide feature. Get a free key from{" "}
                  <a 
                    href="https://aistudio.google.com/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>

              <Separator className="bg-border" />

              {/* Info Box */}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-xs text-primary">
                  <strong>Note:</strong> Core features (TubeBot, Thumbnails, Storyboard) work without API keys. 
                  Your own keys unlock unlimited ad-free premium features.
                </p>
              </div>

              <Button 
                onClick={handleSaveKeys}
                disabled={isSaving}
                className="w-full cyber-button text-primary-foreground"
              >
                {isSaving ? "Saving..." : "Save Configuration"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
