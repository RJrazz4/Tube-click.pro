/**
 * Settings Dashboard
 * Central hub for user account, preferences, licensing, and data management
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  RefreshCw,
  ChevronRight,
  Sparkles,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  useAuthStore,
  useLicense,
  useUser,
  useFeatures,
  useDailyUsage,
} from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

// Section components
function GeneralSection() {
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = () => {
    setUser({
      id: user?.id || crypto.randomUUID(),
      name,
      email,
      createdAt: user?.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
    });
    setIsEditing(false);
    toast.success("Profile updated successfully!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">General Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account preferences</p>
      </div>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">Profile Information</CardTitle>
          <CardDescription className="text-xs">Your public profile details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Display Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="bg-secondary/50 border-border"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email Address</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                type="email"
                className="bg-secondary/50 border-border"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="cyber-button">
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

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
  const features = useFeatures();
  const dailyUsage = useDailyUsage();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">Account & Licensing</h2>
        <p className="text-sm text-muted-foreground">Manage your subscription and account</p>
      </div>

      {/* Current Plan */}
      <Card className={cn("cyber-card border-border", license.tier === "pro" && "neon-glow-purple")}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-display flex items-center gap-2">
                Current Plan: <span className="text-primary capitalize">{license.tier}</span>
              </CardTitle>
              <CardDescription className="text-xs">Your active subscription</CardDescription>
            </div>
            <Badge
              variant={license.status === "active" ? "default" : "destructive"}
              className="capitalize"
            >
              {license.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Generations Today</p>
              <p className="text-2xl font-display font-bold text-foreground">
                {dailyUsage.generationsUsed}
                <span className="text-sm text-muted-foreground ml-1">
                  / {features.maxGenerationsPerDay === Infinity ? "∞" : features.maxGenerationsPerDay}
                </span>
              </p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Max Thumbnails</p>
              <p className="text-2xl font-display font-bold text-foreground">
                {features.maxThumbnails}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <p className="text-xs text-muted-foreground">Max Scenes</p>
              <p className="text-2xl font-display font-bold text-foreground">
                {features.maxScenes === Infinity ? "∞" : features.maxScenes}
              </p>
            </div>
          </div>
          
          {license.tier === "free" && (
            <Button onClick={() => navigate("/rewards")} className="w-full cyber-button" size="lg">
              <Crown className="w-4 h-4 mr-2" />
              Unlock Pro for Free
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
  const features = useFeatures();
  const dailyUsage = useDailyUsage();

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
          <CardTitle className="text-base font-display">Generation Limits</CardTitle>
          <CardDescription className="text-xs">Your current tier limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-sm text-foreground">Daily Generations</span>
              <Badge variant="secondary">
                {dailyUsage.generationsUsed} / {features.maxGenerationsPerDay === Infinity ? "∞" : features.maxGenerationsPerDay}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-sm text-foreground">Max AI Thumbnail Prompts per Batch</span>
              <Badge variant="secondary">{features.maxThumbnails}</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <span className="text-sm text-foreground">Max Storyboard Scenes</span>
              <Badge variant="secondary">{features.maxScenes === Infinity ? "Unlimited" : features.maxScenes}</Badge>
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
      // Export all user data
      const data = {
        exportDate: new Date().toISOString(),
        license: useAuthStore.getState().license,
        user: useAuthStore.getState().user,
        content: JSON.parse(localStorage.getItem("tubegenius-content-store") || "{}"),
        preferences: JSON.parse(localStorage.getItem("tubegenius-app-store") || "{}"),
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
    if (confirm("Are you sure you want to delete all your data? This cannot be undone.")) {
      setIsClearing(true);
      localStorage.clear();
      toast.success("All data cleared!");
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
          <CardDescription className="text-xs">Export or delete your data</CardDescription>
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
              <span className="text-sm">Delete All Data</span>
              <span className="text-xs text-muted-foreground">Permanent removal</span>
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
        <h2 className="font-display text-2xl font-black text-foreground md:text-3xl">Unlock Pro for Free</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          TubeClick Pro has no paid checkout. Complete the qualified referral loop to activate your 7-Day Pro Pass.
        </p>
      </div>

      <Card className="cyber-card mx-auto max-w-3xl overflow-hidden border-primary/30 bg-gradient-to-br from-card via-primary/[0.06] to-cyan-400/[0.04] shadow-[0_0_55px_rgba(139,92,246,0.14)]">
        <CardContent className="grid gap-4 p-6 md:grid-cols-2 md:p-8">
          <div className="rounded-2xl border border-primary/20 bg-background/35 p-5">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-primary">Condition 1</p>
            <p className="mt-2 font-display text-lg font-bold">Invite 3 Friends</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">They must create verified accounts through your unique referral link.</p>
          </div>
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.04] p-5">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-cyan-300">Condition 2</p>
            <p className="mt-2 font-display text-lg font-bold">Help 1 Friend Unlock Pro</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">When one invited friend completes their own loop, your pass activates automatically.</p>
          </div>
          <Button onClick={() => navigate("/rewards")} className="cyber-button h-12 gap-2 md:col-span-2">
            <Gift className="h-4 w-4" /> Unlock Pro for Free <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// Main Settings Page Component
export default function Settings() {
  const [activeTab, setActiveTab] = useState("general");

  const tabs = [
    { value: "general", label: "General", icon: User },
    { value: "account", label: "Account", icon: Shield },
    { value: "dashboard", label: "Dashboard", icon: Palette },
    { value: "data", label: "Data & Privacy", icon: Database },
    { value: "rewards", label: "Referral Rewards", icon: Gift },
    { value: "about", label: "About", icon: Info },
  ];

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
