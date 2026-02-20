import { BookOpen, Copy, ListChecks, Settings2, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const promptCategories = [
  { name: "Social Media Content", count: "200+" },
  { name: "Email Marketing", count: "150+" },
  { name: "Sales Copywriting", count: "150+" },
  { name: "SEO", count: "100+" },
];

const fillInFrameworks = [
  "Act as an expert copywriter and write a 5-email sequence for my product [Product Name] targeted at [Audience].",
  "Create 30 days of social media post ideas for [Niche] in [Tone] tone with hooks and CTAs.",
  "Write a high-converting landing page copy for [Offer] focused on [Primary Pain Point].",
  "Generate an SEO blog outline for keyword [Primary Keyword] targeting [Audience] with search intent [Intent Type].",
  "Create 10 ad headlines and 5 primary texts for [Product] aimed at [Audience] with [Desired Outcome].",
];

const customInstructionCheatSheet = [
  {
    title: "About you",
    content:
      "I am a [role/business type] serving [target audience]. My goals are [goal 1], [goal 2]. I prefer Hinglish/Hindi/English responses.",
  },
  {
    title: "How ChatGPT should respond",
    content:
      "Always give actionable, structured output with headings, bullets, and examples. Start with a quick summary, then detailed steps.",
  },
  {
    title: "Quality guardrails",
    content:
      "Use simple language, avoid fluff, include CTA suggestions, and provide 2-3 alternate versions when writing copy.",
  },
  {
    title: "Formatting defaults",
    content:
      "Use copy-paste ready blocks, include placeholders in [brackets], and add a checklist at the end for implementation.",
  },
];

const aiTools = [
  { name: "Perplexity", useCase: "Research + quick factual summaries" },
  { name: "Claude", useCase: "Long-form writing and editing" },
  { name: "Canva Magic Write", useCase: "Design + social caption creation" },
  { name: "Notion AI", useCase: "Notes, docs, workflow drafting" },
  { name: "Copy.ai", useCase: "Marketing copy and campaign ideation" },
  { name: "Leonardo AI", useCase: "Free image generation for creatives" },
];

export default function PromptToolkit() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/15 via-card to-accent/15 p-6">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Wrench className="w-7 h-7 text-primary" />
          AI Prompt Toolkit
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl">
          Sirf prompts ki list nahi — yeh ek complete toolkit hai jisme ready-to-use library, fill-in frameworks,
          ChatGPT custom instructions cheat sheet, aur top free AI tools directory included hai.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="cyber-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              The Master Prompt Library
            </CardTitle>
            <CardDescription>500+ copy-paste prompts (expandable to 1000+ pack format)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {promptCategories.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="text-sm text-foreground">{item.name}</span>
                <Badge variant="secondary">{item.count}</Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Bundle structure: Starter (500+) and Pro (1000+) with category-wise indexing.
            </p>
          </CardContent>
        </Card>

        <Card className="cyber-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="w-5 h-5 text-primary" />
              Fill-in-the-Blanks Frameworks
            </CardTitle>
            <CardDescription>Topic daaliye, prompt copy kijiye, output lijiye.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {fillInFrameworks.map((prompt, index) => (
              <div key={prompt} className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
                <span className="text-primary mr-2">#{index + 1}</span>
                {prompt}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="cyber-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Custom Instructions Cheat Sheet
            </CardTitle>
            <CardDescription>ChatGPT output ko consistent aur high-quality banane ke liye ready template.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {customInstructionCheatSheet.map((item) => (
              <div key={item.title} className="rounded-lg border border-border p-3">
                <p className="font-medium text-sm text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.content}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="cyber-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-primary" />
              Top AI Tools Directory
            </CardTitle>
            <CardDescription>ChatGPT ke alawa free/low-cost tools ki quick list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {aiTools.map((tool) => (
              <div key={tool.name} className="rounded-lg border border-border px-3 py-2">
                <p className="text-sm font-medium text-foreground">{tool.name}</p>
                <p className="text-xs text-muted-foreground">{tool.useCase}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
