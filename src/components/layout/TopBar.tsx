import { Settings, Key } from "lucide-react";
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
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function TopBar() {
  const [geminiKey, setGeminiKey] = useState("");
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const savedGeminiKey = localStorage.getItem("gemini-api-key");
    if (savedGeminiKey) setGeminiKey(savedGeminiKey);
  }, [open]);

  const handleSaveKeys = () => {
    setIsSaving(true);
    
    // Save keys locally in the browser.
    if (geminiKey.trim()) {
      localStorage.setItem("gemini-api-key", geminiKey.trim());
    } else {
      localStorage.removeItem("gemini-api-key");
    }
    
    toast.success("Settings saved successfully!", {
      description: "Your API key has been stored securely in your browser.",
    });
    
    setIsSaving(false);
    setOpen(false);
  };

  const hasGeminiKey = !!localStorage.getItem("gemini-api-key");

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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 border-border hover:border-primary/50 hover:bg-primary/10" 
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                API Configuration
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Configure local AI settings. Voice Studio uses Puter.js and does not require an API key.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 pt-4">
              {/* Gemini API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gemini-key" className="text-foreground font-medium">
                    Google Gemini API Key
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
                  Required for upcoming Gemini-powered content, vision, and storyboard features. Get your key from{" "}
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

              {/* Info Box */}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <p className="text-xs text-primary">
                  <strong>Note:</strong> Voice Studio works without API keys through Puter.js. Gemini configuration is only for upcoming non-voice AI integrations.
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
