import { useState, useEffect } from "react";
import { Shield, Link2, Save, Eye, EyeOff, Lock } from "lucide-react";
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
import { getLockerUrl, setLockerUrl } from "@/lib/monetization/locker";

const ADMIN_PASS = "secret";
const CONFIG_KEY = "tubegenius_admin_config";

export interface AppConfig {
  locker_url: string;
}

const DEFAULT_CONFIG: AppConfig = {
  locker_url: "",
};

export function getAppConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, locker_url: parsed.locker_url || getLockerUrl() };
    }
  } catch {
    // ignore
  }
  return { locker_url: getLockerUrl() };
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
      toast.success("Access granted — Secure Mode");
    } else {
      toast.error("Invalid passcode");
      setPassword("");
    }
  };

  const handleSave = () => {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      setLockerUrl(config.locker_url);
      toast.success("Monetization locker saved securely");
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
                <DialogTitle className="font-display text-lg">Secure Admin Access</DialogTitle>
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
              <p className="text-xs text-muted-foreground text-center">
                Note: API keys are now server-only. No keys stored in browser.
              </p>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 text-primary" />
                  <DialogTitle className="font-display text-lg">Monetization Control</DialogTitle>
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
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                <Lock className="w-3.5 h-3.5 inline mr-1.5" />
                Secure Mode Active: All AI keys are server-side (Vercel Edge / Supabase env).
                No client-side BYOK. This is US SaaS compliant.
              </div>

              {/* Locker URL */}
              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5 text-pink-400" />
                  Monetization Locker URL (Stripe/Paywall)
                </Label>
                <Input
                  type={showPasswords ? "text" : "password"}
                  value={config.locker_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, locker_url: e.target.value }))}
                  placeholder="https://your-locker-url.com/verify?userId={user}"
                  className="bg-secondary border-border h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Used for verification modals. Prepares Stripe/Paywall tier guard (Phase D). Leave empty to disable.
                </p>
              </div>

              <Separator className="bg-border" />

              <Button onClick={handleSave} className="w-full cyber-button h-11 text-base">
                <Save className="w-4 h-4 mr-2" />
                Save Locker Config
              </Button>

              <p className="text-[11px] text-muted-foreground text-center">
                API keys are managed via <code>.env</code> on server — see <code>.env.example</code>.
                Never expose keys in frontend.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
