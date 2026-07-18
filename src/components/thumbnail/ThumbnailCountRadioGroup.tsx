/**
 * Phase 5 — ThumbnailCountRadioGroup
 *
 * A radio-group UI for selecting how many thumbnails to generate.
 * Tier-aware: free users see max 2 options (1 or 2), premium users
 * see up to 4 (1, 2, 3, 4).
 *
 * Integrates with:
 *   - Phase 4: tier config (maxThumbnailsPerGeneration)
 *   - Phase 5: useTierConfig hook
 *   - Existing: shadcn/ui RadioGroup component
 */

import { Crown, Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useTierConfig } from "@/hooks/useTierConfig";

export interface ThumbnailCountRadioGroupProps {
  /** Currently selected count. */
  value: number;
  /** Called when the user selects a new count. */
  onChange: (count: number) => void;
  /** Disable all options (e.g. during generation). */
  disabled?: boolean;
  /** Optional class name. */
  className?: string;
  /** Whether to show the label. */
  showLabel?: boolean;
}

/**
 * Renders a row of selectable thumbnail count options.
 * Free users: 1, 2 (limited)
 * Premium users: 1, 2, 3, 4
 */
export function ThumbnailCountRadioGroup({
  value,
  onChange,
  disabled = false,
  className,
  showLabel = true,
}: ThumbnailCountRadioGroupProps) {
  const { rawTier, maxThumbnails, isPremium } = useTierConfig();
  const maxCount = maxThumbnails;
  const options = Array.from({ length: maxCount }, (_, i) => i + 1);

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <Label className="flex items-center gap-1.5 text-sm text-foreground">
          <Crown
            className={cn(
              "h-3.5 w-3.5",
              isPremium ? "text-amber-400" : "text-muted-foreground"
            )}
          />
          Thumbnails to generate
          {!isPremium && (
            <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              Free: max {maxCount}
            </span>
          )}
        </Label>
      )}

      <RadioGroup
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        className="flex gap-2"
        disabled={disabled}
      >
        {options.map((count) => (
          <div key={count} className="relative">
            <RadioGroupItem
              value={String(count)}
              id={`thumb-count-${count}`}
              className="peer sr-only"
            />
            <Label
              htmlFor={`thumb-count-${count}`}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all",
                "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 peer-data-[state=checked]:text-primary",
                "peer-data-[state=unchecked]:border-border peer-data-[state=unchecked]:bg-secondary/50 peer-data-[state=unchecked]:text-muted-foreground",
                "hover:border-primary/50 hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "min-w-[48px]"
              )}
              // Free users can only select 1 or 2; clicking 3/4 for premium is fine
            >
              {count}
              {/* Premium lock icon not needed — the radio group already limits counts */}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {!isPremium && value > maxCount && (
        <p className="text-xs text-amber-400">
          Free plan limited to {maxCount} thumbnails. Upgrade to Premium for up to 4.
        </p>
      )}
    </div>
  );
}
