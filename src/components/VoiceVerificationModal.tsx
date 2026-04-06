import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface VoiceVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}

export function VoiceVerificationModal({ open, onOpenChange, onVerified }: VoiceVerificationModalProps) {
  const handleVerify = () => {
    window.open("https://optilinklock.com/1888553", "_blank", "noopener,noreferrer");
    onVerified();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-pink-400" />
            </div>
            <DialogTitle className="font-display text-lg">Unlock Premium Generation</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            To keep this neural voice free, please complete one quick sponsor verification.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <Button
            onClick={handleVerify}
            className="w-full cyber-button text-primary-foreground h-12 text-base font-semibold"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Verify &amp; Generate
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            Or paste your own free API key in Settings to skip this forever.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
