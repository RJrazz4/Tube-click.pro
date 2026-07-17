/**
 * Phase E3 — one-liner rich error toast.
 * Sonner title + description rendering for any thrown value.
 * Kept separate from friendlyError.ts so the mapper stays dependency-free/testable.
 */
import { toast } from "sonner";
import { friendlyError, type FriendlyError } from "./friendlyError";

/** Show a rich error toast for any thrown error; returns the mapped FriendlyError. */
export function toastFriendlyError(err: unknown, fallback?: string): FriendlyError {
  const f = friendlyError(err, fallback);
  toast.error(f.title, {
    description: f.retryAfter ? `${f.message} (≈${f.retryAfter}s)` : f.message,
  });
  return f;
}
