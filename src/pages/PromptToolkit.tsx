import { useMemo, useState, type ComponentType } from "react";
import { BookCopy, Copy, Check, Wrench, Settings2, AppWindow, Search, Mail, Megaphone, BadgeDollarSign } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type PromptCategory = "Social media content" | "Email marketing" | "Sales copywriting" | "SEO";

interface PromptItem {
  id: string;
  category: PromptCategory;
  text: string;
}

const categoryConfig: Array<{ category: PromptCategory; icon: ComponentType<{ className?: string }>; role: string; }> = [
  { category: "Social media content", icon: Megaphone, role: "social media strategist" },
  { category: "Email marketing", icon: Mail, role: "email marketing specialist" },
  { category: "Sales copywriting", icon: BadgeDollarSign, role: "direct-response copywriter" },
  { category: "SEO", icon: Search, role: "SEO growth expert" },
];

const goals = [
  "educate beginners",
  "increase engagement",
  "boost CTR",
  "drive qualified leads",
  "improve retention",
  "increase conversions",
  "build authority",
  "generate UGC",
  "improve watch time",
  "raise product awareness",
];

const audiences = [
  "students", "working professionals", "founders", "small business owners", "coaches",
  "creators", "agency owners", "freelancers", "ecommerce brands", "local businesses",
];

const tones = [
  "bold and punchy", "friendly and simple", "premium and confident", "story-led and emotional", "data-backed and practical",
];

const formats = [
  "carousel", "short-form script", "long-form post", "ad copy", "campaign brief",
];

const frameworks = [
  "Act as an expert copywriter and write a 5-email sequence for my product [Product Name] targeted at [Audience]. Goal: [Goal]. Tone: [Tone]. CTA: [CTA].",
  "Create 30 days of social media content ideas for [Niche] targeting [Audience] in [Language]. Include hook, caption, and CTA for each.",
  "Write a high-converting landing page for [Product/Service] using PAS framework. Pain: [Pain Point], Promise: [Desired Outcome], Proof: [Proof].",
  "Generate 10 SEO blog titles for [Topic] targeting keyword [Primary Keyword]. Also include search intent and suggested meta title.",
  "Draft a WhatsApp sales script for [Offer] for leads who are [Lead Type]. Objection to handle: [Objection].",
  "Write 3 versions of Facebook ad copy for [Offer] targeting [Audience]. Keep it under [Word Count] words.",
  "Create a YouTube script outline on [Topic] for [Audience] in [Style]. Include hook, 5 key points, CTA, and retention boosters.",
  "Design a lead magnet outline for [Business Type] on [Topic] to attract [Audience]. Include title, sections, and CTA.",
];

const customInstructions = {
  aboutYou: [
    "I run [Business Type] for [Audience].",
    "My primary goals are [Leads/Sales/Traffic/Authority].",
    "Preferred language: [Hindi/Hinglish/English].",
    "Brand voice: [Friendly/Professional/Bold].",
    "Avoid: [Buzzwords, jargon, overpromises].",
  ],
  responseStyle: [
    "Start with a short summary, then actionable steps.",
    "Always provide 3 options with different angles.",
    "Use tables/checklists when useful.",
    "End with CTA suggestions and next action.",
    "Ask follow-up questions only if critical information is missing.",
  ],
};

const aiTools = [
  { name: "Perplexity", useCase: "Research + citations", pricing: "Free plan available" },
  { name: "Claude", useCase: "Long-form writing and analysis", pricing: "Free plan available" },
  { name: "Gemini", useCase: "Idea generation + multimodal", pricing: "Free tier" },
  { name: "Canva Magic Write", useCase: "Design + captions + creatives", pricing: "Free features" },
  { name: "Copy.ai", useCase: "Marketing copy templates", pricing: "Free plan" },
  { name: "Notion AI", useCase: "Docs, summaries, workflows", pricing: "Limited free AI responses" },
  { name: "Leonardo AI", useCase: "AI image generation", pricing: "Free tokens" },
  { name: "ElevenLabs", useCase: "Text-to-speech voiceovers", pricing: "Free tier" },
];

export default function PromptToolkit() {
  const [copied, setCopied] = useState<string | null>(null);

  const promptLibrary = useMemo<PromptItem[]>(() => {
    const library: PromptItem[] = [];

    categoryConfig.forEach(({ category, role }) => {
      const categoryPrompts: PromptItem[] = [];

      goals.forEach((goal) => {
        audiences.forEach((audience) => {
          tones.forEach((tone) => {
            formats.forEach((format) => {
              categoryPrompts.push({
                id: `${category}-${categoryPrompts.length + 1}`,
                category,
                text: `Act as a ${role}. Create a ${format} about [Topic] for ${audience} to ${goal}. Tone: ${tone}. Include a clear CTA and 2 A/B hook variations.`,
              });
            });
          });
        });
      });

      library.push(...categoryPrompts.slice(0, 125));
    });

    return library;
  }, []);

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy. Please try again.");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="border-border bg-card/60 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" /> Prompt Growth Toolkit
          </CardTitle>
          <CardDescription>
            Sirf prompts ki list nahi — ek complete toolkit: 500+ master prompt library, ready-made frameworks, custom instructions cheat sheet, aur top free AI tools directory.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="library" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 gap-2 h-auto bg-transparent p-0">
          <TabsTrigger value="library">Master Prompt Library</TabsTrigger>
          <TabsTrigger value="frameworks">Fill-in-the-Blanks</TabsTrigger>
          <TabsTrigger value="instructions">Custom Instructions</TabsTrigger>
          <TabsTrigger value="tools">Top AI Tools</TabsTrigger>
        </TabsList>

        <TabsContent value="library">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <BookCopy className="w-5 h-5 text-primary" /> The Master Prompt Library (500 Prompts)
              </CardTitle>
              <CardDescription>
                4 core categories × 125 prompts each = 500 copy-paste prompts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {categoryConfig.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Badge key={item.category} variant="secondary" className="gap-1.5">
                      <Icon className="w-3.5 h-3.5" /> {item.category}
                    </Badge>
                  );
                })}
              </div>

              <div className="grid md:grid-cols-2 gap-3 max-h-[420px] overflow-auto pr-1">
                {promptLibrary.slice(0, 24).map((prompt) => (
                  <div key={prompt.id} className="rounded-lg border border-border p-3 bg-secondary/40">
                    <p className="text-xs text-primary mb-1">{prompt.category}</p>
                    <p className="text-sm text-foreground leading-relaxed">{prompt.text}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={() => handleCopy(promptLibrary.map((p, i) => `${i + 1}. [${p.category}] ${p.text}`).join("\n"), "all-prompts")} className="gap-2">
                  {copied === "all-prompts" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy all 500 prompts
                </Button>
                <Button variant="outline" onClick={() => handleCopy(promptLibrary.filter((p) => p.category === "SEO").map((p) => p.text).join("\n"), "seo-prompts")} className="gap-2">
                  {copied === "seo-prompts" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy SEO block
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="frameworks">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display">The Fill-in-the-Blanks Frameworks</CardTitle>
              <CardDescription>Topic/offer/audience daaliye, prompt ready hai.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {frameworks.map((framework, idx) => (
                <div key={framework} className="rounded-lg border border-border bg-secondary/30 p-3">
                  <p className="text-sm leading-relaxed">{idx + 1}. {framework}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="instructions">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" /> Custom Instructions Cheat Sheet
              </CardTitle>
              <CardDescription>ChatGPT ke "Custom Instructions" me yeh points daal kar output consistently better banaiye.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4 bg-secondary/30">
                <h3 className="font-semibold mb-2">What should ChatGPT know about you?</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                  {customInstructions.aboutYou.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-border p-4 bg-secondary/30">
                <h3 className="font-semibold mb-2">How should ChatGPT respond?</h3>
                <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
                  {customInstructions.responseStyle.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-display flex items-center gap-2">
                <AppWindow className="w-5 h-5 text-primary" /> Top AI Tools Directory (Free Options)
              </CardTitle>
              <CardDescription>ChatGPT ke alawa useful tools ka quick shortlist.</CardDescription>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              {aiTools.map((tool) => (
                <div key={tool.name} className="rounded-lg border border-border p-3 bg-secondary/20">
                  <p className="font-medium">{tool.name}</p>
                  <p className="text-sm text-muted-foreground">Use case: {tool.useCase}</p>
                  <p className="text-xs text-primary mt-1">{tool.pricing}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
