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

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini-api-key");
    if (savedKey) setGeminiKey(savedKey);
  }, []);

  const handleSaveKey = () => {
    localStorage.setItem("gemini-api-key", geminiKey);
    toast.success("API Key saved successfully!", {
      description: "Your Gemini API key has been stored locally.",
    });
    setOpen(false);
  };

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
            <Button variant="outline" size="sm" className="gap-2 border-border hover:border-primary/50 hover:bg-primary/10">
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">API Settings</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground">API Configuration</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Enter your API keys for external services.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="gemini-key" className="text-foreground">Google Gemini API Key</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  placeholder="AIza..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="bg-secondary border-border focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Required for Vision Guide feature. Get your key from{" "}
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
              <Button 
                onClick={handleSaveKey} 
                className="w-full cyber-button text-primary-foreground"
              >
                Save Configuration
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Button variant="ghost" size="icon" className="hover:bg-secondary">
          <Settings className="w-5 h-5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
}
