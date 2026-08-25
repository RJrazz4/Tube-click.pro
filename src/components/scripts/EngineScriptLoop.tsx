import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award, CheckCircle2, Copy, Download, Link2, Loader2, Mic, Sparkles, XCircle, Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { engineConfigured, engineFetch } from "@/lib/engine/client";
import type { AudienceHunger, EngineScriptDetail, EngineScriptListItem } from "@/lib/engine/types";
import {
  useAudienceProfile,
  useEngineScriptDetail,
  useEngineScripts,
  useGenerateScript,
  usePublishScript,
  useScriptVoiceover,
} from "@/hooks/useEngineData";

/**
 * F‑3: the engine-backed action loop on CloneCrush.
 * hunger cards → generate → critic badge → voiceover / copy / download / publish.
 */

function criticBadge(script: EngineScriptListItem): { label: string; tone: "good" | "bad" | "neutral" } {
  if (script.status === "rejected") return { label: "rejected — see fixes", tone: "bad" };
  if (script.critic?.weighted_total && script.critic.weighted_total >= 85) {
    return { label: `critic ${script.critic.weighted_total}/100`, tone: "good" };
  }
  if (script.critic?.error) return { label: "generation error", tone: "bad" };
  return { label: script.kind === "outline" ? "outline" : "package", tone: "neutral" };
}

function scriptToMarkdown(script: EngineScriptDetail): string {
  const pkg = script.package ?? {};
  const lines: string[] = [];
  lines.push(`# ${script.hunger_topic ?? "Script"}`);
  lines.push(`_${script.kind === "outline" ? "Outline" : "Script Package"} • critic ${script.critic?.weighted_total ?? "—"}/100 • ${script.prompt_version ?? ""}_`);
  if (pkg.hook?.text) lines.push(`\n## Hook (${pkg.hook.seconds}s)`, pkg.hook.text, ...(pkg.hook.variants ?? []).map((v) => `> alt: ${v}`));
  if (pkg.hook_angle) lines.push(`\n## Hook angle`, pkg.hook_angle);
  if (pkg.why_it_works?.length) lines.push(`\n**Why it works**`, ...pkg.why_it_works.map((w) => `- ${w}`));
  if (pkg.beats?.length) lines.push(`\n## Beats`, ...pkg.beats.map((b) => `- **${b.title}** (${b}s) — ${b.purpose}`));
  if (pkg.sections?.length) {
    lines.push(`\n## Script`);
    for (const s of pkg.sections) {
      lines.push(`\n### ${s.heading}`, s.voiceover);
      if (s.b_roll_cues?.length) lines.push(`_B-roll: ${s.b_roll_cues.join(", ")}_`);
    }
  }
  if (pkg.title_variants?.length) lines.push(`\n## Titles`, ...pkg.title_variants.map((t, i) => `${i + 1}. ${t}`));
  if (pkg.thumbnail_texts?.length) lines.push(`\n## Thumbnail text`, pkg.thumbnail_texts.map((t) => `[${t}]`).join(" · "));
  if (pkg.description) lines.push(`\n## Description`, pkg.description);
  if (pkg.tags?.length) lines.push(`\n**Tags:** ${pkg.tags.join(", ")}`);
  if (pkg.posting_window?.note) lines.push(`\n**Post at:** ${pkg.posting_window.note}`);
  return lines.join("\n");
}

export function EngineScriptLoop() {
  const configured = engineConfigured();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishUrl, setPublishUrl] = useState("");

  const audience = useAudienceProfile(configured);
  const scripts = useEngineScripts(configured);
  const generate = useGenerateScript();
  const publish = usePublishScript();
  const voiceover = useScriptVoiceover();
  const detail = useEngineScriptDetail(selectedId);

  const hungers: AudienceHunger[] = useMemo(() => audience.data?.hungers ?? [], [audience.data]);

  if (!configured) return null;

  const list = scripts.data?.scripts ?? [];

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Copy failed");
    }
  };

  const download = (script: EngineScriptDetail) => {
    const blob = new Blob([scriptToMarkdown(script)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tubeclick-${(script.hunger_topic ?? "script").replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Topic picker = real hunger cards */}
      {hungers.length > 0 && (
        <Card className="glass-strong border-primary/30 bracket">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-display font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Data-Driven Scripts
              </p>
              <span className="text-[9px] font-mono text-primary/60">ENGINE • CRITIC-GATED 85/100</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {hungers.map((h) => (
                <button
                  key={h.topic}
                  disabled={generate.isPending}
                  onClick={() => generate.mutate(h.topic)}
                  className="rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/60 hover:text-primary transition-colors disabled:opacity-50"
                  title={`watch share ${h.evidence?.watch_share_pct ?? "?"}% • score ${(h.score * 100).toFixed(0)}`}
                >
                  {h.topic} <span className="font-mono text-[10px] text-primary/70">{(h.score * 100).toFixed(0)}</span>
                </button>
              ))}
              <button
                disabled={generate.isPending}
                onClick={() => generate.mutate(undefined)}
                className="rounded-full border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {generate.isPending ? "Generating…" : "Today's drop"}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Free: 1 outline/day (your challenge check-in). Pro: full ScriptPackage — hook, beats, voiceover script, titles, thumbnails.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Script list with critic badges */}
      {list.length > 0 && (
        <Card className="glass border-border/60">
          <CardContent className="p-4 space-y-2">
            <p className="text-[9px] font-mono text-muted-foreground">GENERATED • NEWEST FIRST</p>
            <div className="space-y-2">
              {list.map((s) => {
                const badge = criticBadge(s);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "rounded-lg border p-3 flex flex-wrap items-center gap-3 cursor-pointer transition-colors",
                      selectedId === s.id ? "border-primary/60 bg-primary/5" : "border-border/60 hover:border-primary/30",
                    )}
                    onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{s.hunger_topic ?? "Script"}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">
                        {new Date(s.created_at).toLocaleString()} • {s.tier}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono",
                        badge.tone === "good" && "border-emerald-400/40 bg-emerald-500/10 text-emerald-300",
                        badge.tone === "bad" && "border-red-400/40 bg-red-500/10 text-red-300",
                        badge.tone === "neutral" && "border-border/60 text-muted-foreground",
                      )}
                    >
                      {badge.tone === "good" ? <Award className="w-3 h-3" /> : badge.tone === "bad" ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      {badge.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected script: the action loop */}
      {selectedId && detail.data && (
        <Card className="glass-strong border-primary/30 bracket">
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display font-semibold flex-1">{detail.data.hunger_topic}</p>
              <Button size="sm" variant="outline" onClick={() => detail.data && copy(scriptToMarkdown(detail.data), "Script")}>
                <Copy className="w-4 h-4" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={() => detail.data && download(detail.data)}>
                <Download className="w-4 h-4" /> .md
              </Button>
              {detail.data.kind === "package" && (
                <Button size="sm" variant="outline" disabled={voiceover.isPending} onClick={() => voiceover.mutate({ scriptId: selectedId })}>
                  {voiceover.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />} Voiceover
                </Button>
              )}
            </div>

            {detail.data.package?.hook?.text && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-[9px] font-mono text-primary/70">HOOK • {detail.data.package.hook.seconds}s BUDGET</p>
                <p className="text-sm mt-1">{detail.data.package.hook.text}</p>
              </div>
            )}
            {detail.data.package?.sections?.map((s) => (
              <div key={s.heading} className="space-y-1">
                <p className="text-xs font-semibold text-primary">{s.heading}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.voiceover}</p>
              </div>
            ))}
            {detail.data.package?.title_variants?.length ? (
              <div>
                <p className="text-[9px] font-mono text-muted-foreground mb-1">TITLES</p>
                <ul className="text-sm space-y-0.5">
                  {detail.data.package.title_variants.map((t) => (
                    <li key={t}>• {t}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Publish: manual paste (closes the loop) */}
            {detail.data.status === "draft" || detail.data.status === "in_production" ? (
              <div className="flex flex-wrap gap-2 items-center border-t border-border/50 pt-3">
                <Youtube className="w-4 h-4 text-red-500" />
                <Input
                  placeholder="https://youtube.com/watch?v=… (paste after you publish)"
                  value={publishUrl}
                  onChange={(e) => setPublishUrl(e.target.value)}
                  className="flex-1 min-w-[220px]"
                />
                <Button
                  size="sm"
                  disabled={!publishUrl.trim() || publish.isPending}
                  onClick={() => publish.mutate({ scriptId: selectedId, videoUrl: publishUrl.trim() })}
                >
                  {publish.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />} I published this
                </Button>
              </div>
            ) : (
              <p className="text-[11px] font-mono text-emerald-400 border-t border-border/50 pt-3">
                STATUS: {detail.data.status.toUpperCase()} {detail.data.status === "measured" ? "• REAL NUMBERS FEEDING THE HUNGER MODEL" : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
