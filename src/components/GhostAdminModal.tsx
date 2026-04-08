import { useState, useEffect } from "react";
import { Shield, Key, Link2, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const ADMIN_PASS = "secret";
const CONFIG_KEY = "tubegenius_admin_config";

export interface AppConfig {
  locker_url: string;
  image_api_key: string;
  text_api_key: string;
  voice_api_key: string;
}

const DEFAULT_CONFIG: AppConfig = {
  locker_url: "",
  image_api_key: "",
  text_api_key: "",
  voice_api_key: "",
};

export function getAppConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return DEFAULT_CONFIG;
}

export function getLockerUrl(): string {
  const config = getAppConfig();
  return config.locker_url || "";
}

interface GhostAdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GhostAdminModal({ open, onOpenChange }: GhostAdminModalProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    if (open) {
      const isAuth = sessionStorage.getItem("admin_auth") === "true";
      if (isAuth) {
        setAuthenticated(true);
        setConfig(getAppConfig());
      } else {
        setAuthenticated(false);
        setPassword("");
      }
    }
  }, [open]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASS) {
      setAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      setConfig(getAppConfig());
      toast.success("Access granted");
    } else {
      toast.error("Invalid passcode");
      setPassword("");
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

      // Also sync individual keys so existing BYOK logic works
      if (config.voice_api_key) {
        localStorage.setItem("elevenlabs-api-key", config.voice_api_key);
      }
      if (config.text_api_key) {
        localStorage.setItem("gemini-api-key", config.text_api_key);
      }

      toast.success("Configuration saved and applied instantly");
    } catch {
      toast.error("Failed to save configuration");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto">
        {!authenticated ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <DialogTitle className="font-display text-lg">Admin Access</DialogTitle>
              </div>
            </DialogHeader>
            <form onSubmit={handleLogin} className="space-y-4 mt-4">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter passcode"
                className="bg-secondary border-border h-12 text-center text-lg tracking-widest"
                autoFocus
              />
              <Button type="submit" className="w-full cyber-button h-12">
                <Shield className="w-4 h-4 mr-2" />
                Authenticate
              </Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-primary" />
                  <DialogTitle className="font-display text-lg">Control Panel</DialogTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="gap-1.5"
                >
                  {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showPasswords ? "Hide" : "Show"}
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-5 mt-4">
              {/* Locker URL */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-pink-400" />
                  Monetization Locker URL
                </Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={config.locker_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, locker_url: e.target.value }))}
                  placeholder="https://your-locker-url.com/..."
                  className="bg-secondary border-border h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Used for verification modals. Leave empty to disable.
                </p>
              </div>

              <Separator className="bg-border" />

              {/* API Keys */}
              <div className="space-y-4">
                <Label className="text-sm flex items-center gap-2 font-semibold">
                  <Key className="w-3.5 h-3.5 text-accent" />
                  API Keys
                </Label>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Image Generation (Fal.ai)</Label>
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={config.image_api_key}
                    onChange={(e) => setConfig(prev => ({ ...prev, image_api_key: e.target.value }))}
                    placeholder="Fal.ai key..."
                    className="bg-secondary border-border h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Text/Script Engine (Gemini)</Label>
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={config.text_api_key}
                    onChange={(e) => setConfig(prev => ({ ...prev, text_api_key: e.target.value }))}
                    placeholder="Gemini key..."
                    className="bg-secondary border-border h-10"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Voice Engine (ElevenLabs)</Label>
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={config.voice_api_key}
                    onChange={(e) => setConfig(prev => ({ ...prev, voice_api_key: e.target.value }))}
                    placeholder="ElevenLabs key..."
                    className="bg-secondary border-border h-10"
                  />
                </div>
              </div>

              <Button onClick={handleSave} className="w-full cyber-button h-11 text-base">
                <Save className="w-4 h-4 mr-2" />
                Save & Apply
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
