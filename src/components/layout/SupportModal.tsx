/**
 * SupportModal Component
 * Professional customer support UI with contact email addresses
 */
import { useState } from "react";
import { Mail, X, HelpCircle, MessageSquare, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUPPORT_EMAILS = [
  { email: "tubeclick.support@gmail.com", label: "Primary Support" },
  { email: "support@tubeclickpro.in", label: "Official Domain" },
];

export function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const copyToClipboard = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      toast.success(`Copied ${email} to clipboard!`);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch {
      toast.error("Failed to copy email");
    }
  };

  const handleEmailClick = (email: string) => {
    window.location.href = `mailto:${email}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md cyber-card border-border bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl font-display">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-gradient-to-br from-neon-purple to-neon-cyan neon-glow-purple">
              <HelpCircle className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <span>Contact Support</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Reach out to us for assistance with TubeClick Pro
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-xl border border-primary/20 bg-secondary/30 p-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Official Support Channels
            </p>
            <div className="space-y-3">
              {SUPPORT_EMAILS.map((item) => (
                <div
                  key={item.email}
                  className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 border border-border/50 hover:border-primary/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 border border-primary/20">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.email}</p>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      onClick={() => copyToClipboard(item.email)}
                      aria-label={`Copy ${item.email}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                      onClick={() => handleEmailClick(item.email)}
                      aria-label={`Email ${item.email}`}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Response Time
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                <span className="text-sm text-muted-foreground">Business Days</span>
                <span className="text-sm font-medium text-green-400">24-48 hours</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                <span className="text-sm text-muted-foreground">Priority (Pro Users)</span>
                <span className="text-sm font-medium text-cyan-400">12-24 hours</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-secondary/20 p-4">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-3">
              What to Include
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
                <span className="text-muted-foreground">Your account email</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
                <span className="text-muted-foreground">Description of the issue</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
                <span className="text-muted-foreground">Screenshots or error messages</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex h-1.5 w-1.5 shrink-0 rounded-full bg-primary/30" />
                <span className="text-muted-foreground">Steps to reproduce the problem</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="cyber-button-secondary">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
