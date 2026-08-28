import { useMemo, useState } from "react";
import { CalendarDays, Clipboard, Download, FileText, Filter, Image as ImageIcon, Search, Trash2, BookOpen, Sparkles, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VerificationModal } from "@/components/VerificationModal";
import { useContentStore, type SavedContent } from "@/stores/useContentStore";
import { getLockerUrl } from "@/lib/monetization/locker";

const FILTERS = [
  { value: "all", label: "All saved work" },
  { value: "script", label: "Scripts" },
  { value: "thumbnail", label: "Thumbnail prompts" },
  { value: "voiceover", label: "Voiceovers" },
  { value: "guide", label: "Editing guides" },
  { value: "storyboard", label: "Storyboards" },
  { value: "repurposed", label: "Repurposed content" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

type SortValue = "newest" | "oldest";

function contentIcon(type: SavedContent["type"]) {
  switch (type) {
    case "thumbnail": return ImageIcon;
    case "voiceover": return Volume2;
    case "guide": return BookOpen;
    case "storyboard": return Sparkles;
    default: return FileText;
  }
}

function contentLabel(type: SavedContent["type"]): string {
  if (type === "voiceover") return "Voiceover";
  if (type === "thumbnail") return "Thumbnail prompt";
  if (type === "storyboard") return "Storyboard";
  if (type === "repurposed") return "Repurposed content";
  if (type === "guide") return "Editing guide";
  return "Script";
}

function safeFilename(title: string): string {
  return title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "tubeclick-content";
}

export default function Library() {
  const contents = useContentStore((state) => state.contents);
  const deleteContent = useContentStore((state) => state.deleteContent);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("newest");
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const visibleContents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contents
      .filter((item) => filter === "all" || item.type === filter)
      .filter((item) => !normalized || `${item.title} ${item.content}`.toLowerCase().includes(normalized))
      .sort((a, b) => {
        const left = new Date(a.createdAt).getTime();
        const right = new Date(b.createdAt).getTime();
        return sort === "newest" ? right - left : left - right;
      });
  }, [contents, filter, query, sort]);

  const copyItem = async (item: SavedContent) => {
    try {
      await navigator.clipboard.writeText(item.content);
      toast.success("Saved content copied");
    } catch {
      toast.error("Copy failed — please select the content manually");
    }
  };

  const downloadItem = async (item: SavedContent) => {
    try {
      const { downloadAsText } = await import("@/lib/export");
      downloadAsText(item.content, `${safeFilename(item.title)}.txt`);
      toast.success("Saved content downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  const exportAll = async () => {
    setIsExporting(true);
    try {
      const { exportAllAsZip } = await import("@/lib/export");
      await exportAllAsZip();
      toast.success("Library export complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Library export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const removeItem = (item: SavedContent) => {
    if (!window.confirm(`Delete “${item.title}” from your library?`)) return;
    deleteContent(item.id);
    toast.success("Saved item deleted");
  };

  const requestExport = () => {
    if (getLockerUrl()) setVerificationOpen(true);
    else void exportAll();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <VerificationModal open={verificationOpen} onOpenChange={setVerificationOpen} onVerified={exportAll} />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-primary">Your workspace</p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-bold text-foreground md:text-3xl">
            <BookOpen className="h-7 w-7 text-primary" aria-hidden="true" /> Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Find, copy, download, or remove the content you have saved in this browser.</p>
        </div>
        <Button onClick={requestExport} disabled={contents.length === 0 || isExporting} className="cyber-button h-11 gap-2">
          <Download className="h-4 w-4" /> {isExporting ? "Exporting…" : "Export all as ZIP"}
        </Button>
      </header>

      <Card className="glass-strong border-border/70">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved titles and content…" aria-label="Search saved content" className="h-11 bg-secondary/40 pl-9" />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Select value={filter} onValueChange={(value) => setFilter(value as FilterValue)}>
                <SelectTrigger aria-label="Filter saved content" className="h-11 w-full bg-secondary/40 sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FILTERS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Select value={sort} onValueChange={(value) => setSort(value as SortValue)}>
              <SelectTrigger aria-label="Sort saved content" className="h-11 w-full bg-secondary/40 sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {visibleContents.length} of {contents.length} saved {contents.length === 1 ? "item" : "items"}
        </p>
        <p className="text-[10px] font-mono text-muted-foreground/70">Stored locally in this browser</p>
      </div>

      {visibleContents.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleContents.map((item) => {
            const Icon = contentIcon(item.type);
            return (
              <Card key={item.id} className="glass-strong border-border/70">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="line-clamp-2 text-base">{item.title}</CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-1.5 text-xs">
                        <span>{contentLabel(item.type)}</span><span>•</span><CalendarDays className="h-3 w-3" aria-hidden="true" />
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <details className="group rounded-xl border border-border/60 bg-secondary/30">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-foreground marker:hidden group-open:border-b group-open:border-border/50">Preview content</summary>
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-3 py-3 text-xs leading-relaxed text-muted-foreground">{item.content}</p>
                  </details>
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={() => void copyItem(item)} variant="outline" size="sm" className="h-10 gap-1.5 text-xs"><Clipboard className="h-3.5 w-3.5" /> Copy</Button>
                    <Button onClick={() => void downloadItem(item)} variant="outline" size="sm" className="h-10 gap-1.5 text-xs"><Download className="h-3.5 w-3.5" /> Download</Button>
                    <Button onClick={() => removeItem(item)} variant="outline" size="sm" className="h-10 gap-1.5 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="glass-strong border-dashed border-border/70">
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10"><FileText className="h-8 w-8 text-primary" aria-hidden="true" /></div>
            <h2 className="font-display text-lg font-semibold text-foreground">{contents.length === 0 ? "Your library is empty" : "No saved items match"}</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {contents.length === 0 ? "Create an analysis or a topic-based package and save it here for easy access later." : "Try a different search or filter to find another saved item."}
            </p>
            {contents.length === 0 && <div className="flex flex-col gap-2 sm:flex-row"><Button asChild className="cyber-button"><Link to="/clone-crush">Analyze a channel</Link></Button><Button asChild variant="outline"><Link to="/create">Create from a topic</Link></Button></div>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
