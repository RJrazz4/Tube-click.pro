/**
 * src/components/ghost/GhostInterrogationDrawer.tsx
 *
 * Right-side terminal-styled drawer for the Ghost Interrogation feature.
 * Mounted once from CloneCrush.tsx; opens when the user clicks the
 * 🔍 INTERROGATE chip on any conveyor tile.
 *
 * Flow:
 *   1. Chip clicked → openDrawer(videoId).
 *   2. If session.indexed is false → POST /api/ghost/interrogate-index
 *      (server checks credit RPC internally).
 *   3. User types question → POST /api/ghost/interrogate-chat → append
 *      assistant message with [MM:SS] citations.
 *
 * Free/unauthorized users clicking the chip are routed client-side to
 * /rewards?upsell=interrogate&tier=pro (see Chip on the tile).
 */
import { useEffect, useRef, useState } from "react";
import { X, Send, Lock, Zap, Loader2, AlertTriangle, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInterrogateStore, newUserMessage, newAssistantMessage } from "@/stores/useInterrogateStore";
import { useGhostCredits } from "@/hooks/useGhostCredits";
import { useIsPro } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

function extractVideoId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (url.length === 11 ? url : null);
}

function youTubeTsLink(videoId: string, seconds: number | null): string | null {
  if (!videoId || seconds == null || !Number.isFinite(seconds)) return null;
  return `https://youtu.be/${videoId}?t=${Math.max(0, Math.floor(seconds))}`;
}

function formatTime(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(mm)}:${pad(r)}`;
  return `${pad(mm)}:${pad(r)}`;
}

/** Render answer text, converting [MM:SS] references into clickable YT links. */
function renderAnswerWithCitations(text: string, videoId: string | null) {
  if (!text) return null;
  const parts: Array<{ type: "text"; value: string } | { type: "ts"; value: number }> = [];
  const re = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const mm = parseInt(m[1], 10);
    const ss = parseInt(m[2], 10);
    const hh = m[3] ? parseInt(m[3], 10) : 0;
    const totalSec = hh * 3600 + mm * 60 + ss;
    parts.push({ type: "ts", value: totalSec });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return (
    <span>
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const href = videoId ? youTubeTsLink(videoId, p.value) : null;
        const label = `[${formatTime(p.value)}]`;
        if (href) {
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline decoration-dotted underline-offset-2 hover:text-cyan-300"
            >
              {label}
            </a>
          );
        }
        return <span key={i} className="text-cyan-400">{label}</span>;
      })}
    </span>
  );
}

export function GhostInterrogationDrawer() {
  const drawerOpen = useInterrogateStore((s) => s.drawerOpen);
  const session = useInterrogateStore((s) => s.session);
  const closeDrawer = useInterrogateStore((s) => s.closeDrawer);
  const setIndexing = useInterrogateStore((s) => s.setIndexing);
  const setIndexed = useInterrogateStore((s) => s.setIndexed);
  const appendMessage = useInterrogateStore((s) => s.appendMessage);
  const setStreaming = useInterrogateStore((s) => s.setStreaming);
  const setError = useInterrogateStore((s) => s.setError);

  const isPro = useIsPro();
  const { refresh: refreshCredits } = useGhostCredits();

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages.length, session.streaming, session.indexing, session.error]);

  // On open, ensure indexing for the current video.
  useEffect(() => {
    if (!drawerOpen || !session.videoId || session.indexed || session.indexing) return;
    if (!isPro) return; // paywall is handled by the chip; safety guard
    const url = session.url || `https://youtu.be/${session.videoId}`;
    const slotId = 0; // default; caller overrides via openDrawer() when wired later
    setIndexing(true);
    fetch("/api/ghost/interrogate-index", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, slotId }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        setIndexed(true, !!data.ghostReconstructed);
        if (data.alreadyIndexed) {
          appendMessage(newAssistantMessage(
            `// TRANSCRIPT LOCKED IN — ${data.chunksIndexed} chunks indexed. What's your query, operator?`,
            { ghostReconstructed: !!data.ghostReconstructed },
          ));
        } else {
          appendMessage(newAssistantMessage(
            `// GHOST INTERROGATION ONLINE — ${data.chunksIndexed} chunks indexed. Ask anything about this competitor's script, hooks, or monetization.`,
            { ghostReconstructed: !!data.ghostReconstructed },
          ));
        }
        void refreshCredits(true);
      })
      .catch((e) => {
        setError(e.message || "Indexing failed");
      });
  }, [drawerOpen, session.videoId, session.indexed, session.indexing, session.url, isPro, setIndexing, setIndexed, appendMessage, refreshCredits, setError]);

  async function sendMessage() {
    const q = input.trim();
    if (!q || session.streaming || !session.videoId) return;
    setInput("");
    appendMessage(newUserMessage(q));
    setStreaming(true);
    try {
      const res = await fetch("/api/ghost/interrogate-chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: session.videoId, query: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        appendMessage(newAssistantMessage(data.error || "Interrogation failed", { error: data.code || "error" }));
      } else {
        appendMessage(newAssistantMessage(data.answer || "// no intel", {
          citations: data.citations,
          ghostReconstructed: !!data.ghostReconstructed,
          model: data.model,
        }));
        void refreshCredits(true);
      }
    } catch (e) {
      appendMessage(newAssistantMessage(e instanceof Error ? e.message : "Network error", { error: "network" }));
    } finally {
      setStreaming(false);
    }
  }

  const videoId = extractVideoId(session.url || undefined) || session.videoId;
  const paywalled = !isPro;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        onClick={closeDrawer}
        aria-hidden
      />
      {/* Drawer */}
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] border-l border-cyan-500/20 bg-background/95",
          "flex flex-col transition-transform duration-300",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-black/60">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em]">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-cyan-400">Ask about this video</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-fuchsia-400">Ghost Interrogation</span>
          </div>
          <Button variant="ghost" size="icon" onClick={closeDrawer} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Status bar */}
        <div className="border-b border-border px-4 py-2 text-[11px] font-mono flex items-center gap-3 bg-secondary/30">
          {session.ghostReconstructed && (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" /> scaffold transcript
            </span>
          )}
          {isPro ? (
            <span className="inline-flex items-center gap-1 text-cyan-400">
              <Zap className="w-3 h-3" /> pro tier
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Lock className="w-3 h-3" /> paywall
            </span>
          )}
          {session.videoId && (
            <span className="ml-auto text-muted-foreground truncate">id: {session.videoId}</span>
          )}
        </div>

        {paywalled ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
            <Lock className="w-10 h-10 text-muted-foreground" />
            <p className="font-mono text-sm text-muted-foreground">
              // ASK ABOUT THIS VIDEO LOCKED
            </p>
            <p className="text-xs text-muted-foreground max-w-[300px]">
              Ask questions about a competitor&apos;s hooks, retention patterns, and monetization. This Pro feature returns grounded answers with timestamp citations.
            </p>
            <Button asChild className="cyber-button mt-2">
              <a href="/rewards?upsell=interrogate&tier=pro">See Pro options</a>
            </Button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <ScrollArea ref={scrollRef} className="flex-1 p-4 font-mono text-sm">
              <div className="space-y-4">
                <div className="text-muted-foreground text-[11px] leading-relaxed">
                  // GHOST INTERROGATION v1.0<br />
                  // Grounded answers from transcript memory only. [MM:SS] citations are clickable deep-links.
                </div>

                {session.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-md border px-3 py-2 leading-relaxed",
                      m.role === "user" && "border-cyan-500/30 bg-cyan-500/5",
                      m.role === "assistant" && "border-border bg-secondary/30",
                      m.error && "border-red-500/30 bg-red-500/5",
                    )}
                  >
                    <div className="text-[10px] uppercase tracking-widest mb-1 flex items-center gap-2">
                      {m.role === "user" ? (
                        <span className="text-cyan-400">[operator]</span>
                      ) : (
                        <span className="text-fuchsia-400">[ghost]</span>
                      )}
                      {m.ghostReconstructed && (
                        <span className="text-amber-400">⚠ scaffold</span>
                      )}
                      {m.model && <span className="text-muted-foreground ml-auto">{m.model}</span>}
                    </div>
                    <div className="whitespace-pre-wrap break-words text-foreground/90">
                      {renderAnswerWithCitations(m.content, videoId)}
                    </div>
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                        {m.citations.slice(0, 6).map((c, i) => {
                          const href = youTubeTsLink(videoId || "", c.startTs);
                          const label = formatTime(c.startTs);
                          return href ? (
                            <a
                              key={i}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/10"
                            >
                              {label}
                            </a>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ))}

                {session.indexing && (
                  <div className="flex items-center gap-2 text-cyan-400 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    extracting transcript DNA + indexing chunks…
                  </div>
                )}
                {session.error && (
                  <div className="text-red-400 text-xs border border-red-500/30 bg-red-500/5 rounded p-2">
                    // ERROR: {session.error}
                  </div>
                )}
                {session.streaming && (
                  <div className="flex items-center gap-2 text-fuchsia-400 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    ghost analyzing…
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="border-t border-border p-3 bg-black/40">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
                }}
                className="flex gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about hooks, retention, monetization…"
                  className="bg-secondary/70 border-border font-mono text-sm h-10"
                  disabled={session.indexing || session.streaming || !session.indexed}
                />
                <Button
                  type="submit"
                  size="icon"
                  className="h-10 w-10 cyber-button"
                  disabled={session.indexing || session.streaming || !session.indexed || !input.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <div className="mt-2 text-[10px] text-muted-foreground font-mono flex items-center justify-between">
                <span>enter to transmit • citations are clickable</span>
                <span className="text-cyan-500/60">30 msgs/day · rolling 24h</span>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
