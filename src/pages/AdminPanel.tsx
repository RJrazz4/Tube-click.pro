import { useState, useEffect } from "react";
import { Shield, Link2, Save, Eye, EyeOff, Lock, Server, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const ADMIN_PASS = "RJ0761";
const CONFIG_KEY = "tubegenius_admin_config";

interface AppConfig {
  locker_url: string;
}

const DEFAULT_CONFIG: AppConfig = {
  locker_url: "",
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
      toast.success("Access granted — Secure Mode");
    } else {
      toast.error("Invalid passcode");
      setPassword("");
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      // Sync to monetization locker store
      localStorage.setItem("tubegenius_locker_config", JSON.stringify({ locker_url: config.locker_url, tier: "free" }));
      toast.success("Locker configuration saved");
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
            <CardTitle className="font-display text-xl">Secure Admin Access</CardTitle>
            <CardDescription>Server-side keys — no BYOK</CardDescription>
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
              <p className="text-xs text-muted-foreground text-center">
                API keys now live in .env on server (Vercel Edge / Supabase). No browser storage.
              </p>
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
            Secure Control Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Phase A1 — Server-Side Secure Architecture. Zero client keys.
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

      <Card className="cyber-card border-border border-green-500/20 bg-green-500/5">
        <CardContent className="p-4 flex gap-3">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-green-400">Secure Mode Active</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              All external API calls (Gemini, Fal.ai, ElevenLabs) now route through secure
              serverless routes using <code>process.env</code> / <code>Deno.env</code>.
              No <code>localStorage</code> API keys. Ready for US premium subscription model.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Locker URL */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Link2 className="w-4 h-4 text-pink-400" />
            Monetization Locker URL
          </CardTitle>
          <CardDescription>Prepare Stripe/Paywall tier guard (Phase D)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type={showPasswords ? "text" : "password"}
            value={config.locker_url}
            onChange={(e) => setConfig(prev => ({ ...prev, locker_url: e.target.value }))}
            placeholder="https://your-locker-url.com/verify?userId={user}"
            className="bg-secondary border-border h-11"
          />
          <p className="text-xs text-muted-foreground">
            Used for verification modals on export/download. In Pro architecture this will be replaced by Stripe webhook.
          </p>
        </CardContent>
      </Card>

      {/* Server Env Guide */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-base flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            Server Environment Keys (Vercel / Supabase)
          </CardTitle>
          <CardDescription>Set these in dashboard — never in frontend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs font-mono bg-secondary/50 rounded-lg p-4">
          <div className="space-y-1 text-muted-foreground">
            <p><span className="text-foreground">OPENROUTER_API_KEYS</span> = key1,key2,... (rotated on quota) for TubeBot AI Agent + SEO + Transcript</p>
            <p><span className="text-foreground">FAL_API_KEY</span> = for Thumbnail Architect + Storyboard (Tube.Flash / Tube.Pro mapping)</p>
            <p><span className="text-foreground">ELEVENLABS_API_KEY</span> = for Voiceover Studio + preview caching</p>
            <p className="pt-2 text-[11px]">See .env.example for full blueprint. For Supabase: Dashboard → Edge Functions → Secrets</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full cyber-button h-12 text-base">
        <Save className="w-5 h-5 mr-2" />
        Save Locker & Secure Config
      </Button>
    </div>
  );
}
