/**
 * Settings Dashboard
 * Central hub for user account, preferences, licensing, and data management
 */
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  User,
  Shield,
  Palette,
  Database,
  Info,
  Gift,
  Check,
  Download,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Globe,
  ChevronRight,
  Sparkles,
  Crown,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PaymentCheckout } from "@/components/subscription/PaymentCheckout";
import { EntitlementStatus } from "@/components/subscription/EntitlementStatus";
import { ReferralApplyForm } from "@/components/referrals/ReferralApplyForm";
import { useProUpgrade } from "@/contexts/ProUpgradeContext";
import { toast } from "sonner";
import {
  useAuthStore,
  useLicense,
  useUser,
  useFeatures,
  isProTier,
} from "@/stores/useAuthStore";
// useDailyUsage removed — legacy 10/day counter replaced by 24h conveyor.
import { useAppStore } from "@/stores/useAppStore";
import { useCloneCrushStore } from "@/stores/useCloneCrushStore";
import { useContentStore } from "@/stores/useContentStore";
import { useWorkflowStore } from "@/stores/useWorkflowStore";
import { useDawnPatrolStore } from "@/stores/useDawnPatrolStore";
import { useGhostCreditsStore } from "@/stores/useGhostCreditsStore";
import { useInterrogateStore } from "@/stores/useInterrogateStore";
import { useReconStore } from "@/stores/useReconStore";
import { useSquadStore } from "@/stores/useSquadStore";

function useFreeCooldownRemaining(): number {
  const freeCooldownUntil = useCloneCrushStore((s) => s.freeCooldownUntil);
  const [remaining, setRemaining] = useState(() =>
    freeCooldownUntil ? Math.max(0, freeCooldownUntil - Date.now()) : 0,
  );
  useEffect(() => {
    const compute = () => setRemaining(freeCooldownUntil ? Math.max(0, freeCooldownUntil - Date.now()) : 0);
    compute();
    if (!freeCooldownUntil || freeCooldownUntil <= Date.now()) return;
    const id = window.setInterval(compute, 1000);
    return () => window.clearInterval(id);
  }, [freeCooldownUntil]);
  return remaining;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// The Supabase token and the auth-store snapshot are deliberately excluded.
// Clearing preferences/content must never become an implicit sign-out; only the
// dedicated sign-out action is allowed to destroy a Supabase session.
const AUTH_STORAGE_KEYS = new Set(["tubegenius-auth-store"]);
const AUTH_NAMESPACED_PREFIX = "tc:u:tubegenius-auth-store";
const APP_STORAGE_PREFIXES = ["tubegenius-", "tubeclick-"];
const APP_STORAGE_EXACT_KEYS = new Set([
  "ghost_base_counter",
  "ghost_intel_last_seen",
  "ghost_mini_banner_dismiss",
  "ghost_streak_v2",
]);

function clearLocalAppData() {
  Object.keys(localStorage)
    .filter((key) => {
      const isNamespacedAppData = key.startsWith("tc:u:") && !key.startsWith(AUTH_NAMESPACED_PREFIX);
      const isLegacyAppData = APP_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)) && !AUTH_STORAGE_KEYS.has(key);
      const isTransientCache = key.startsWith("qc:v2:") || key.startsWith("tc-cache:");
      const isReferralMarker = key.startsWith("tc:free-unlock-used:");
      return isNamespacedAppData || isLegacyAppData || isTransientCache || isReferralMarker || APP_STORAGE_EXACT_KEYS.has(key);
    })
    .forEach((key) => localStorage.removeItem(key));
}

// Section components
function GeneralSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">General Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account preferences</p>
      </div>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Language & Region</CardTitle>
          <CardDescription className="text-xs">Customize your experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Language</label>
              <select className="w-full h-10 px-3 bg-secondary/50 border border-border rounded-lg text-foreground">
                <option>English (US)</option>
                <option>English (UK)</option>
                <option>Spanish</option>
                <option>French</option>
                <option>German</option>
                <option>Japanese</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Timezone</label>
              <select className="w-full h-10 px-3 bg-secondary/50 border border-border rounded-lg text-foreground">
                <option>UTC-0 (London)</option>
                <option>UTC-5 (New York)</option>
                <option>UTC-8 (Los Angeles)</option>
                <option>UTC+5:30 (Mumbai)</option>
                <option>UTC+9 (Tokyo)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Appearance</CardTitle>
          <CardDescription className="text-xs">Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Always on for premium feel</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-primary/20 text-primary">Active</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountSection() {
  const license = useLicense();
  const { openProUpgrade } = useProUpgrade();
  const isPro = isProTier(license);
  const cooldownRemaining = useFreeCooldownRemaining();
  const onCooldown = !isPro && cooldownRemaining > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">Account & Licensing</h2>
        <p className="text-sm text-muted-foreground">Manage your Pro access, account, and usage</p>
      </div>

      {/* Current Plan */}
      <Card className={cn("cyber-card border-border", isPro && "neon-glow-purple")}>
        <CardHeader>
          <EntitlementStatus />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 mb-4">
            {/* Daily Chain-Loop conveyor status — replaces legacy
                "Generations Today 0/10" which contradicted the 1-per-24h
                free-tier model. */}
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Content package quota</p>
              <p className="text-2xl font-display font-bold text-foreground">
                {isPro ? (
                  <span className="text-primary">Unlimited</span>
                ) : onCooldown ? (
                  <span className="text-amber-400 font-mono text-xl tracking-wider">{formatCountdown(cooldownRemaining)}</span>
                ) : (
                  <>
                    <span className="text-green-400">Available</span>
                    <span className="text-sm text-muted-foreground ml-1">now</span>
                  </>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {isPro ? "Unlimited packages • no waiting period" : "Free includes 1 content package every 24h"}
              </p>
            </div>
          </div>

          {!isPro && (
            <Button onClick={() => openProUpgrade({ reason: "settings" })} className="w-full cyber-button" size="lg">
              <Crown className="w-4 h-4 mr-2" />
              See Pro options
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="cyber-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base font-display text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/30">
            <div>
              <p className="text-sm font-medium text-foreground">Delete Account</p>
              <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
            </div>
            <Button variant="destructive" size="sm">
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSection() {
  const { tier, setTier } = useAppStore();
  const license = useLicense();
  const isPro = isProTier(license);
  const cooldownRemaining = useFreeCooldownRemaining();
  const onCooldown = !isPro && cooldownRemaining > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">Dashboard Preferences</h2>
        <p className="text-sm text-muted-foreground">Customize your dashboard experience</p>
      </div>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Default Settings</CardTitle>
          <CardDescription className="text-xs">Set your preferred defaults for content generation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Default Aspect Ratio</label>
              <select className="w-full h-10 px-3 bg-secondary/50 border border-border rounded-lg text-foreground">
                <option>16:9 (YouTube)</option>
                <option>9:16 (Shorts/Reels)</option>
                <option>1:1 (Instagram)</option>
                <option>4:3 (Standard)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Default Quality</label>
              <select className="w-full h-10 px-3 bg-secondary/50 border border-border rounded-lg text-foreground">
                <option>Standard (Fast)</option>
                <option>High Quality (Slower)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Notifications</CardTitle>
          <CardDescription className="text-xs">Control what notifications you receive</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "Generation complete", enabled: true },
            { label: "Daily usage summary", enabled: false },
            { label: "New features & updates", enabled: true },
            { label: "Tips & tutorials", enabled: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{item.label}</span>
              <Button
                variant={item.enabled ? "default" : "outline"}
                size="sm"
                className={item.enabled ? "bg-primary/20 text-primary hover:bg-primary/30" : ""}
              >
                {item.enabled ? "On" : "Off"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Content package limits</CardTitle>
          <CardDescription className="text-xs">How many packages your current plan can create</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div>
                <span className="text-sm text-foreground">Free content packages</span>
                <p className="text-[10px] text-muted-foreground">1 package per 24h • 3 opportunity cards</p>
              </div>
              <Badge variant="secondary">
                {isPro ? "Unlimited" : onCooldown ? `Next in ${formatCountdown(cooldownRemaining)}` : "1 Available"}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-sm text-foreground">Niche Targeting</span>
              <Badge variant="secondary" className="bg-primary/20 text-primary">Strict (URL-deduced)</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DataPrivacySection() {
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Export the live Zustand snapshots instead of obsolete unnamespaced
      // localStorage keys. This keeps the download compatible with the
      // current per-user storage adapter while never exposing store actions.
      const authState = useAuthStore.getState();
      const contentState = useContentStore.getState();
      const appState = useAppStore.getState();
      const cloneState = useCloneCrushStore.getState();
      const workflowState = useWorkflowStore.getState();
      const data = {
        exportVersion: 1,
        exportDate: new Date().toISOString(),
        account: {
          user: authState.user,
          license: authState.license,
        },
        content: {
          stats: contentState.stats,
          items: contentState.contents,
        },
        preferences: {
          tier: appState.tier,
          sidebarOpen: appState.sidebarOpen,
        },
        workspace: {
          profile: cloneState.profile,
          savedChannels: cloneState.savedChannels,
          activeSlotIndex: cloneState.activeSlotIndex,
          savedNiche: cloneState.savedNiche,
          outputLanguage: cloneState.outputLanguage,
          rewrites: cloneState.rewrites,
        },
        workflow: workflowState.activeWorkflow,
        ghostIntelligence: {
          credits: {
            tier: useGhostCreditsStore.getState().tier,
            isBlackOps: useGhostCreditsStore.getState().isBlackOps,
            actions: useGhostCreditsStore.getState().actions,
          },
          interrogation: useInterrogateStore.getState().session,
          recon: useReconStore.getState().videos,
          squadBriefs: useSquadStore.getState().briefs,
          dawnPatrol: {
            briefs: useDawnPatrolStore.getState().briefs,
            config: useDawnPatrolStore.getState().config,
          },
        },
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tubeclickpro-data-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success("Data exported successfully!");
    } catch {
      toast.error("Failed to export data");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearData = () => {
    if (confirm("Are you sure you want to delete your local app data? This cannot be undone. You will remain signed in.")) {
      setIsClearing(true);
      clearLocalAppData();
      toast.success("Local app data cleared. Your secure session is still active.");
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">Data &amp; Privacy</h2>
        <p className="text-sm text-muted-foreground">Manage your data and privacy settings</p>
      </div>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Database className="w-4 h-4" />
            Your Data
          </CardTitle>
          <CardDescription className="text-xs">Export or delete your local workspace data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Button
              variant="outline"
              onClick={handleExportData}
              disabled={isExporting}
              className="h-auto py-4 flex-col gap-2"
            >
              <Download className="w-5 h-5" />
              <span className="text-sm">Export All Data</span>
              <span className="text-xs text-muted-foreground">Download as JSON</span>
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearData}
              disabled={isClearing}
              className="h-auto py-4 flex-col gap-2"
            >
              <Trash2 className="w-5 h-5" />
              <span className="text-sm">Delete Local App Data</span>
              <span className="text-xs text-muted-foreground">Session remains signed in</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Privacy Controls
          </CardTitle>
          <CardDescription className="text-xs">Control your privacy settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { label: "Store data locally", description: "Keep your data in browser storage", enabled: true, disabled: true },
            { label: "Analytics tracking", description: "Help us improve by sharing anonymous usage data", enabled: false },
            { label: "Crash reports", description: "Automatically send crash reports", enabled: true },
            { label: "Feature suggestions", description: "Personalized tips based on your usage", enabled: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <Button
                variant={item.enabled ? "default" : "outline"}
                size="sm"
                disabled={item.disabled}
                className={item.enabled ? "bg-primary/20 text-primary hover:bg-primary/30" : ""}
              >
                {item.enabled ? "On" : "Off"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Data Retention</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-muted-foreground">Content history</span>
              <span className="text-foreground">Until deleted</span>
            </div>
            <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-muted-foreground">Usage analytics</span>
              <span className="text-foreground">90 days</span>
            </div>
            <div className="flex justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-muted-foreground">API logs</span>
              <span className="text-foreground">30 days</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Third-Party Services</CardTitle>
          <CardDescription className="text-xs">Services that process your data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-secondary/50 p-3">
            <p className="text-sm font-medium text-foreground">Managed AI processing services</p>
            <p className="mt-1 text-xs text-muted-foreground">Approved providers process generation requests only when you use an AI feature. See the Privacy Policy for the current processor list.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">About</h2>
        <p className="text-sm text-muted-foreground">Learn more about TubeClick Pro</p>
      </div>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">About TubeClick Pro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-primary/20 to-accent/20">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center neon-glow-purple">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-display font-bold text-foreground">TubeClick Pro</h3>
              <p className="text-sm text-muted-foreground">Version 2.0.0</p>
              <p className="text-xs text-muted-foreground mt-1">Powered by Zero-Cost Hydra AI Router</p>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">
            TubeClick Pro is a Psychological Warfare Dashboard for YouTube creators. Reverse-engineer competitors, deploy AI-powered Glitch Protocols, and clone viral formulas with the power of multiple AI providers running in parallel through our proprietary architecture.
          </p>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Technology Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: "React 18", desc: "UI Framework" },
              { name: "TypeScript", desc: "Type Safety" },
              { name: "Tailwind CSS", desc: "Styling" },
              { name: "Zustand", desc: "State Management" },
              { name: "React Query", desc: "Server State" },
              { name: "Vercel", desc: "Deployment" },
              { name: "Zero-Cost Hydra", desc: "Multi-Provider AI Router" },
              { name: "Managed Image Services", desc: "Image Generation" },
            ].map((tech, i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{tech.name}</p>
                  <p className="text-xs text-muted-foreground">{tech.desc}</p>
                </div>
                <Check className="w-4 h-4 text-green-400" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Support</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="https://github.com/RJrazz4/Tube-click.pro" target="_blank" rel="noopener noreferrer">
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Documentation
              </span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="https://github.com/RJrazz4/Tube-click.pro/issues" target="_blank" rel="noopener noreferrer">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Report an Issue
              </span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="outline" className="w-full justify-between" asChild>
            <a href="https://github.com/RJrazz4/Tube-click.pro/discussions" target="_blank" rel="noopener noreferrer">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Community Forum
              </span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Legal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href="/terms">Terms of Service</a>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href="/privacy">Privacy Policy</a>
          </Button>
          <Button variant="ghost" className="w-full justify-start" asChild>
            <a href="/about">About Us</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ReferralRewardsSection() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 py-4">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <Crown className="h-7 w-7 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-black text-foreground md:text-3xl">Referral reward path</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Earn time-limited Pro access through qualified referrals. Paid plans are shown separately in the Subscription tab.
        </p>
      </div>

      <Card className="cyber-card mx-auto max-w-3xl overflow-hidden border-primary/30 bg-gradient-to-br from-card via-primary/[0.06] to-cyan-400/[0.04] shadow-[0_0_55px_rgba(139,92,246,0.14)]">
        <CardContent className="grid gap-4 p-6 md:grid-cols-2 md:p-8">
          <div className="rounded-2xl border border-primary/20 bg-background/35 p-5">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Step 1</p>
            <p className="mt-2 font-display text-lg font-bold">Share your referral link</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Share it with creators who will genuinely use TubeClick Pro.</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">Step 2</p>
            <p className="mt-2 font-display text-lg font-bold">Earn qualified referrals</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">When two invited creators complete a real product action, your 21-day Pro reward activates automatically.</p>
          </div>
          <Button onClick={() => navigate("/rewards")} className="cyber-button h-12 gap-2 md:col-span-2">
            <Gift className="h-4 w-4" /> Open referral dashboard <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Manual referral code application (event-driven → AI Manager bot). */}
      <Card className="cyber-card mx-auto max-w-3xl border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Have a referral code?</CardTitle>
          <CardDescription className="text-xs">
            Paste a friend's code to credit them toward their Pro trial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReferralApplyForm />
        </CardContent>
      </Card>
    </div>
  );
}

// Main Settings Page Component
export default function Settings() {
  const tabs = [
    { value: "general", label: "General", icon: User },
    { value: "account", label: "Account", icon: Shield },
    { value: "subscription", label: "Subscription", icon: CreditCard },
    { value: "dashboard", label: "Dashboard", icon: Palette },
    { value: "data", label: "Data & Privacy", icon: Database },
    { value: "rewards", label: "Referral Rewards", icon: Gift },
    { value: "about", label: "About", icon: Info },
  ];

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get("tab");
    return requested && tabs.some((t) => t.value === requested) ? requested : "general";
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, preferences, and referral rewards</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Tab Navigation */}
        <div className="overflow-x-auto pb-2 scrollbar-cyber">
          <TabsList className="bg-secondary/50 border border-border">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    "data-[state=active]:bg-primary/20 data-[state=active]:text-primary",
                    "flex items-center gap-2 px-4"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab Content */}
        <TabsContent value="general">
          <GeneralSection />
        </TabsContent>
        
        <TabsContent value="account">
          <AccountSection />
        </TabsContent>

        <TabsContent value="subscription">
          <PaymentCheckout />
        </TabsContent>
        
        <TabsContent value="dashboard">
          <DashboardSection />
        </TabsContent>
        
        <TabsContent value="data">
          <DataPrivacySection />
        </TabsContent>
        
        <TabsContent value="rewards">
          <ReferralRewardsSection />
        </TabsContent>
        
        <TabsContent value="about">
          <AboutSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
