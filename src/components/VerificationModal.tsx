import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { getLockerUrl } from "@/lib/monetization/locker";

interface VerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
}

export function VerificationModal({ open, onOpenChange, onVerified }: VerificationModalProps) {
  const lockerUrl = getLockerUrl();

  const handleVerify = () => {
    if (lockerUrl) {
      window.open(lockerUrl, "_blank", "noopener,noreferrer");
    }
    onVerified();
    onOpenChange(false);
  };

  // If no locker URL configured, skip verification
  if (!lockerUrl && open) {
    onVerified();
    onOpenChange(false);
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="font-display text-lg">Verification Required</DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Please complete one quick free verification task below to unlock your generated AI files.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <Button
            onClick={handleVerify}
            className="w-full cyber-button text-primary-foreground h-12 text-base font-semibold"
          >
            <ShieldCheck className="w-5 h-5 mr-2" />
            Verify &amp; Download Now
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-3">
            This helps us keep TubeGenius Neural Engine free for everyone.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
