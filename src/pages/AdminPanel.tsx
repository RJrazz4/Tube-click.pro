import { useState, useEffect } from "react";
import { Shield, Key, Link2, Save, Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const ADMIN_PASS_HASH = "a1b2c3d4e5f6"; // Simple check - not SHA256 for localStorage-only system
const ADMIN_PASS = "RJ0761";
const CONFIG_KEY = "tubegenius_admin_config";

interface AppConfig {
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
  } catch {}
  return DEFAULT_CONFIG;
}

export function getLockerUrl(): string {
  const config = getAppConfig();
  return config.locker_url || "";
}

export default function AdminPanel() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const navigate = useNavigate();

  useEffect(() => {
    const isAuth = sessionStorage.getItem("admin_auth") === "true";
    if (isAuth) {
      setAuthenticated(true);
      setConfig(getAppConfig());
    }
  }, []);

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
      toast.success("Configuration saved and applied instantly");
    } catch {
      toast.error("Failed to save configuration");
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center animate-fade-in">
        <Card className="w-full max-w-sm cyber-card border-border">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="font-display text-xl">Admin Access</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Control Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All changes apply instantly across the app
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowPasswords(!showPasswords)}
          className="gap-2"
        >
          {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPasswords ? "Hide" : "Show"}
        </Button>
      </div>

      {/* Locker URL */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Link2 className="w-4 h-4 text-pink-400" />
            Monetization Locker URL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type={showPasswords ? "text" : "password"}
            value={config.locker_url}
            onChange={(e) => setConfig(prev => ({ ...prev, locker_url: e.target.value }))}
            placeholder="https://your-locker-url.com/..."
            className="bg-secondary border-border h-11"
          />
          <p className="text-xs text-muted-foreground">
            Used for verification modals on export/download actions. Leave empty to disable locker.
          </p>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            API Keys (Client-Side Overrides)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Image Generation API Key</Label>
            <Input
              type={showPasswords ? "text" : "password"}
              value={config.image_api_key}
              onChange={(e) => setConfig(prev => ({ ...prev, image_api_key: e.target.value }))}
              placeholder="Fal.ai key..."
              className="bg-secondary border-border h-11"
            />
          </div>

          <Separator className="bg-border" />

          <div className="space-y-2">
            <Label className="text-sm">Text/Script API Key</Label>
            <Input
              type={showPasswords ? "text" : "password"}
              value={config.text_api_key}
              onChange={(e) => setConfig(prev => ({ ...prev, text_api_key: e.target.value }))}
              placeholder="Gemini key..."
              className="bg-secondary border-border h-11"
            />
          </div>

          <Separator className="bg-border" />

          <div className="space-y-2">
            <Label className="text-sm">Voice API Key</Label>
            <Input
              type={showPasswords ? "text" : "password"}
              value={config.voice_api_key}
              onChange={(e) => setConfig(prev => ({ ...prev, voice_api_key: e.target.value }))}
              placeholder="ElevenLabs key..."
              className="bg-secondary border-border h-11"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full cyber-button h-12 text-base">
        <Save className="w-5 h-5 mr-2" />
        Save & Apply Configuration
      </Button>
    </div>
  );
}
