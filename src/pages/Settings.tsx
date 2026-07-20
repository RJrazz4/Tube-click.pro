/**
 * Settings Dashboard
 * Central hub for user account, preferences, licensing, and data management
 */
import { useState } from "react";
import {
  User,
  Shield,
  Palette,
  Database,
  Info,
  CreditCard,
  Check,
  Copy,
  Download,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Key,
  Eye,
  EyeOff,
  Globe,
  Lock,
  RefreshCw,
  ChevronRight,
  Sparkles,
  Zap,
  Crown,
  Building2,
  CheckCircle2,
  XCircle,
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
  type SubscriptionTier,
} from "@/stores/useAuthStore";
import { useAppStore } from "@/stores/useAppStore";

// Pricing tiers configuration
const PRICING_TIERS = [
  {
    tier: "free" as SubscriptionTier,
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started",
    icon: Sparkles,
    gradient: "from-gray-500 to-gray-600",
    features: [
      "10 generations/day",
      "2 AI Thumbnail Prompts (Text) per batch",
      "4 storyboard scenes",
      "60% Glitch Protocol (Vibe-Extract)",
      "Zero-Cost Hydra Router",
      "Community support",
    ],
    limitations: [
      "No voiceovers",
      "No exports",
      "No 99% Glitch Protocol",
      "Watermark on exports",
    ],
    popular: false,
  },
  {
    tier: "pro" as SubscriptionTier,
    name: "Pro",
    price: "$19",
    period: "/month",
    description: "For serious content creators",
    icon: Zap,
    gradient: "from-neon-purple to-pink-500",
    features: [
      "100 generations/day",
      "4 AI Thumbnail Prompts (Text) per batch (Midjourney/DALL-E ready)",
      "8 storyboard scenes",
      "99% Glitch Protocol (Structure Clone)",
      "Voiceover Studio",
      "Full export (ZIP, video)",
      "Advanced analytics",
      "Priority support",
    ],
    limitations: [],
    popular: true,
  },
  {
    tier: "enterprise" as SubscriptionTier,
    name: "Enterprise",
    price: "$99",
    period: "/month",
    description: "For teams and agencies",
    icon: Building2,
    gradient: "from-neon-cyan to-blue-500",
    features: [
      "Unlimited generations",
      "10 AI Thumbnail Prompts (Text) per batch",
      "Unlimited scenes",
      "99% Glitch Protocol + Priority Queue",
      "Voiceover Studio",
      "Full export (ZIP, video)",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
      "Team collaboration",
      "API access",
    ],
    limitations: [],
    popular: false,
  },
];

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
  const { upgradeTier } = useAuthStore();
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleCopyKey = (name: string) => {
    navigator.clipboard.writeText(apiKeys[name] || "");
    toast.success(`${name} key copied!`);
  };

  const handleUpgrade = (tier: SubscriptionTier) => {
    upgradeTier(tier);
    toast.success(`Upgraded to ${tier}!`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-display font-semibold text-foreground mb-2">Account & Licensing</h2>
        <p className="text-sm text-muted-foreground">Manage your subscription and API keys</p>
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
            <Button onClick={() => handleUpgrade("pro")} className="w-full cyber-button" size="lg">
              <Crown className="w-4 h-4 mr-2" />
              Upgrade to Pro - $19/month
            </Button>
          )}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Key className="w-4 h-4" />
            API Keys
          </CardTitle>
          <CardDescription className="text-xs">Configure your AI provider keys (stored locally)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { name: "Agnes", key: "agnes", placeholder: "sk-agnes_..." },
            { name: "HuggingFace", key: "hf", placeholder: "hf_..." },
            { name: "Together AI", key: "together", placeholder: "tk_..." },
            { name: "Gemini", key: "gemini", placeholder: "gk_..." },
          ].map((provider) => (
            <div key={provider.key} className="space-y-2">
              <label className="text-sm font-medium text-foreground">{provider.name}</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKeys[provider.key] ? "text" : "password"}
                    value={apiKeys[provider.key] || ""}
                    onChange={(e) => setApiKeys({ ...apiKeys, [provider.key]: e.target.value })}
                    placeholder={provider.placeholder}
                    className="bg-secondary/50 border-border pr-10 font-mono text-xs"
                  />
                  <button
                    onClick={() => setShowKeys({ ...showKeys, [provider.key]: !showKeys[provider.key] })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKeys[provider.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button variant="outline" size="icon" onClick={() => handleCopyKey(provider.key)}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
          
          <div className="p-3 rounded-lg bg-secondary/50 border border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Lock className="w-3 h-3" />
              Keys are encrypted and stored locally in your browser. They never leave your device.
            </p>
          </div>
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
      a.download = `tubegenius-data-${new Date().toISOString().split("T")[0]}.json`;
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
        <CardContent className="space-y-3">
          {[
            { name: "OpenRouter", purpose: "AI text generation", url: "https://openrouter.ai" },
            { name: "Pollinations.ai", purpose: "Free image generation", url: "https://pollinations.ai" },
            { name: "HuggingFace", purpose: "Free image generation", url: "https://huggingface.co" },
            { name: "Together AI", purpose: "Free image generation", url: "https://together.ai" },
          ].map((service, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div>
                <p className="text-sm font-medium text-foreground">{service.name}</p>
                <p className="text-xs text-muted-foreground">{service.purpose}</p>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <a href={service.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
          ))}
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
        <p className="text-sm text-muted-foreground">Learn more about TubeGenius Pro</p>
      </div>

      <Card className="cyber-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-display">About TubeGenius Pro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-primary/20 to-accent/20">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-neon-purple to-neon-cyan flex items-center justify-center neon-glow-purple">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-display font-bold text-foreground">TubeGenius Pro</h3>
              <p className="text-sm text-muted-foreground">Version 2.0.0</p>
              <p className="text-xs text-muted-foreground mt-1">Powered by Zero-Cost Hydra Router</p>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">
            TubeGenius Pro is an AI-powered content creation platform designed for YouTube creators.
            Generate viral titles, scripts, thumbnails, and storyboards with the power of multiple
            AI providers running in parallel through our proprietary Zero-Cost Hydra Router architecture.
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
              { name: "Zero-Cost Hydra", desc: "Multi-Provider Router" },
              { name: "Pollinations.ai", desc: "Free Image AI" },
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

function PricingSection() {
  const license = useLicense();
  const { upgradeTier, setUpgradeModalOpen } = useAuthStore();

  const handleUpgradeClick = () => {
    setUpgradeModalOpen(true);
  };

  return (
    <div className="space-y-6 md:space-y-8 py-4">
      <div className="text-center max-w-lg mx-auto">
        <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-2 flex items-center justify-center gap-2">
          <Zap className="w-6 h-6 text-primary fill-primary animate-pulse" />
          Choose Your Plan
        </h2>
        <p className="text-sm text-muted-foreground">
          Enforce your content creation with zero-loophole hard limits. Upgrade to deploy our full stealth viral capability and AI thumbnail prompt generation.
        </p>
      </div>

      {/* 2-Tier Side-by-Side Comparison with Dominant Right Card */}
      <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto items-stretch pt-4">
        
        {/* LEFT CARD: FREE PLAN ($0) - Scaled Down & Muted */}
        <Card className={cn(
          "cyber-card bg-card/30 border-border/50 p-6 md:p-8 flex flex-col justify-between transition-all duration-300 relative overflow-hidden scale-95 opacity-85 hover:opacity-100",
          license.tier === "free" && "ring-1 ring-border border-border/80 bg-card/20"
        )}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-display font-bold text-foreground">Free Plan</h3>
                <p className="text-xs text-muted-foreground">Perfect to test the waters</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-bold text-foreground">$0</p>
                <p className="text-[10px] text-muted-foreground uppercase font-mono">Forever</p>
              </div>
            </div>

            <div className="h-px bg-border/40 my-4" />

            <div className="space-y-3.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Features Included:</p>
              <ul className="space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span>10 generations per day</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span>2 AI Thumbnail Prompts (Text) per batch (Copy-paste to Midjourney/DALL-E)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span>4 storyboard scenes</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-foreground font-medium">Voiceover: 500 characters per day</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                  <span className="text-foreground font-medium">60% Clone &amp; Crush Loophole</span>
                </li>
              </ul>

              <div className="h-px bg-border/20 my-4" />

              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Limitations:</p>
              <ul className="space-y-2.5 text-xs text-muted-foreground/60">
                <li className="flex items-center gap-2.5">
                  <XCircle className="w-4 h-4 text-destructive/60 shrink-0" />
                  <span>No Unlimited Voiceovers (Limit: 500 chars)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <XCircle className="w-4 h-4 text-destructive/60 shrink-0" />
                  <span>No 99% Glitch Protocol (Structure Clone)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <XCircle className="w-4 h-4 text-destructive/60 shrink-0" />
                  <span>Watermarked exports</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8">
            {license.tier === "free" ? (
              <Button disabled className="w-full bg-secondary/80 text-muted-foreground text-xs font-semibold uppercase tracking-wider h-11">
                Current Plan Active
              </Button>
            ) : (
              <Button onClick={() => upgradeTier("free")} variant="outline" className="w-full border-border hover:bg-secondary/40 text-xs font-semibold uppercase tracking-wider h-11">
                Downgrade to Free
              </Button>
            )}
          </div>
        </Card>

        {/* RIGHT CARD: PREMIUM PLAN ($19) - Visually Dominant, Scaled Up & Heavy Glowing Drop-Shadow */}
        <Card className={cn(
          "cyber-card bg-card/95 border-2 border-primary/80 p-6 md:p-8 flex flex-col justify-between transition-all duration-300 relative overflow-hidden scale-105 md:scale-[1.08] shadow-[0_0_50px_rgba(var(--primary),0.4)] ring-2 ring-primary/60 z-10"
        )}>
          {/* Most Popular Ribbon */}
          <div className="absolute top-0 right-0 bg-gradient-to-l from-primary via-indigo-600 to-pink-500 text-white text-[9px] font-bold tracking-widest px-4 py-1.5 rounded-bl-xl uppercase shadow-md">
            Most Popular
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xl font-display font-bold text-foreground">Premium Plan</h3>
                  <Sparkles className="w-4 h-4 text-primary fill-primary animate-pulse" />
                </div>
                <p className="text-xs text-muted-foreground">Deploy full stealth viral mastery</p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline justify-end">
                  <span className="text-3xl font-display font-bold text-foreground">$19</span>
                  <span className="text-xs text-muted-foreground font-mono">/mo</span>
                </div>
                <p className="text-[9px] text-primary uppercase font-mono font-bold tracking-wider">Stealth Activated</p>
              </div>
            </div>

            <div className="h-px bg-primary/30 my-4" />

            <div className="space-y-3.5">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Unlimited Premium Cues:</p>
              <ul className="space-y-2.5 text-xs text-foreground/95">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                  <span className="font-semibold text-foreground">Unlimited Cinematic Voiceovers (VectorEngine)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                  <span className="font-semibold text-foreground">99% Glitch Protocol (Extreme Structure Clone)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                  <span className="font-semibold text-foreground">4 High-Converting AI Thumbnail Prompts (Text) per batch (Midjourney/DALL-E ready)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                  <span>100 generations per day (Priority queues)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                  <span>8 storyboard scenes (Uncapped resolution)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-primary fill-primary/10 shrink-0" />
                  <span>Full secure exports &amp; advanced analytics</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            {license.tier === "pro" || license.tier === "enterprise" ? (
              <Button disabled className="w-full bg-primary/20 border border-primary/30 text-primary text-xs font-semibold uppercase tracking-wider h-11">
                Active Premium Creator
              </Button>
            ) : (
              <>
                <Button 
                  onClick={handleUpgradeClick} 
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-95 text-primary-foreground font-display font-bold uppercase tracking-wider text-xs h-12 flex items-center justify-center gap-1.5 shadow-lg active:scale-98 transition-all"
                >
                  <Zap className="w-4 h-4 fill-primary-foreground text-primary-foreground" />
                  Upgrade to Premium
                </Button>

                {/* Highly visible secondary God Mode trigger button */}
                <div 
                  onClick={handleUpgradeClick}
                  className="relative overflow-hidden rounded-xl border border-dashed border-primary bg-primary/10 hover:bg-primary/20 transition-all duration-300 p-3 text-center cursor-pointer select-none"
                >
                  <p className="text-[10px] font-bold text-foreground flex items-center justify-center gap-1">
                    ⚡️ UNLOCK GOD MODE — JUST ₹99 / $1.19
                  </p>
                  <p className="text-[9px] font-semibold text-primary">
                    🔥 7 Days. FULL POWER. ONE-TIME ACCESS.
                  </p>
                  <p className="text-[8px] text-muted-foreground mt-0.5 leading-none">
                    No auto-pay. Experience the full 90% Stealth Disguise engine for a week.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

      </div>
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
    { value: "pricing", label: "Pricing", icon: CreditCard },
    { value: "about", label: "About", icon: Info },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, preferences, and subscription</p>
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
        
        <TabsContent value="pricing">
          <PricingSection />
        </TabsContent>
        
        <TabsContent value="about">
          <AboutSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
