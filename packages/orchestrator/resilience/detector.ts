/**
 * Phase D2 — 429/Quota Detector: normalize ANY failure into a cascade verdict.
 *
 * Every error type that can escape the system's seams is translated into
 * one Detection: the A3 ProviderErrorKind plus the action the fallback
 * cascade (D3) should take:
 *
 *   rotate-key        → transient key issue; same provider, next key
 *   exhaust-key       → key is dead (quota/auth); mark + next key
 *   cooldown-provider → provider needs a timed backoff (429/5xx/timeout);
 *                       D4's breaker listens for this
 *   next-provider     → skip the provider NOW without blaming its health:
 *                       saturated local queue (the 10k silent-overflow
 *                       trigger) or a pool already fully exhausted
 *   abort             → invalid_request/unknown; nothing will help
 *
 * Detection is the ONLY place vendor-specific guessing lives; everything
 * downstream consumes verdicts, never raw errors.
 */
import { AllKeysExhaustedError } from "../keys/index.js";
import { OpenRouterError } from "../manager/index.js";
import {
  NormalizedProviderError,
  QueueOverflowError,
} from "../providers/index.js";
import type { ProviderErrorKind, ProviderId } from "../types/index.js";

export const DETECTOR_ACTIONS = [
  "rotate-key",
  "exhaust-key",
  "cooldown-provider",
  "next-provider",
  "abort",
] as const;
export type DetectorAction = (typeof DETECTOR_ACTIONS)[number];

export type DetectionSource =
  | "normalized" // NormalizedProviderError / OpenRouterError (already classified)
  | "pool-exhausted" // AllKeysExhaustedError from an A2 pool
  | "queue-overflow" // C1 RequestQueue saturation
  | "http-like" // structural {status}/{statusCode}/{retryAfterMs}
  | "vendor-signature" // message sniffing (last resort)
  | "unknown";

export interface Detection {
  kind: ProviderErrorKind;
  action: DetectorAction;
  retryAfterMs?: number;
  /** Which classifier claimed this error. */
  source: DetectionSource;
  provider?: ProviderId;
  /** Sanitized, length-capped, key-redacted message. */
  message: string;
}

/** Mistake to wait genuinely long for a cooled provider when fallbacks exist. */
export const DEFAULT_PROVIDER_COOLDOWN_MS = 20_000;

const MESSAGE_LIMIT = 200;

/** Defense in depth: scrub anything key-shaped from propagated messages. */
export function sanitizeMessage(raw: string): string {
  return raw
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1***")
    .replace(/\bsk-[A-Za-z0-9_-]{3,}\b/g, "sk-***")
    .replace(/\bkey=[^\s&"']+/gi, "key=***")
    .slice(0, MESSAGE_LIMIT);
}

/** Kinds where waiting and retrying the provider later is meaningful. */
export function isProviderRetryable(kind: ProviderErrorKind): boolean {
  return kind === "rate_limit" || kind === "provider_unavailable" || kind === "timeout";
}

/** Cascade-level action for an already-classified kind. */
export function actionForKind(kind: ProviderErrorKind): DetectorAction {
  switch (kind) {
    case "rate_limit":
    case "provider_unavailable":
    case "timeout":
      return "cooldown-provider";
    case "quota_exceeded":
    case "auth":
      return "next-provider";
    case "invalid_request":
    case "unknown":
    default:
      return "abort";
  }
}

function fromKind(
  kind: ProviderErrorKind,
  source: DetectionSource,
  message: string,
  options: { retryAfterMs?: number; provider?: ProviderId } = {},
): Detection {
  const detection: Detection = {
    kind,
    action: actionForKind(kind),
    source,
    message: sanitizeMessage(message),
  };
  if (options.retryAfterMs !== undefined) detection.retryAfterMs = options.retryAfterMs;
  if (options.provider !== undefined) detection.provider = options.provider;
  return detection;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** Vendor message signatures — the last-resort classifier. */
const SIGNATURES: ReadonlyArray<{ pattern: RegExp; kind: ProviderErrorKind }> = [
  { pattern: /quota|insufficient[\s_-]?credit|billing|payment required/i, kind: "quota_exceeded" },
  { pattern: /rate[\s_-]?limit|too many requests|\b429\b/i, kind: "rate_limit" },
  { pattern: /unauthorized|invalid api key|forbidden|\b40[13]\b/i, kind: "auth" },
  { pattern: /timed?[\s_-]?out|\b408\b/i, kind: "timeout" },
  { pattern: /unavailable|overloaded|loading|\b5\d\d\b/i, kind: "provider_unavailable" },
];

/**
 * Normalize anything throwable into a Detection. Never throws.
 */
export function detect(err: unknown, provider?: ProviderId): Detection {
  if (err instanceof NormalizedProviderError) {
    return fromKind(err.kind, "normalized", err.message, {
      retryAfterMs: err.retryAfterMs,
      provider: err.provider,
    });
  }
  if (err instanceof OpenRouterError) {
    return fromKind(err.kind, "normalized", err.message, {
      retryAfterMs: err.retryAfterMs,
      provider: provider,
    });
  }
  if (err instanceof AllKeysExhaustedError) {
    // Whole pool dead: cooldown if keys are merely cooling (timed), else
    // genuinely exhausted for the cycle → hop to the next provider.
    if (err.retryAfterMs !== undefined) {
      return fromKind("rate_limit", "pool-exhausted", err.message, {
        retryAfterMs: err.retryAfterMs,
        provider: provider ?? (err.provider as ProviderId | undefined),
      });
    }
    return {
      kind: "quota_exceeded",
      action: "next-provider",
      source: "pool-exhausted",
      message: sanitizeMessage(err.message),
      ...(provider !== undefined || err.provider !== undefined
        ? { provider: (provider ?? err.provider) as ProviderId }
        : {}),
    };
  }
  if (err instanceof QueueOverflowError) {
    // Local lane saturated: NOT the provider's fault — hop immediately.
    // This is the 10k silent-overflow trigger into URL-only Pollinations.
    return {
      kind: "rate_limit",
      action: "next-provider",
      source: "queue-overflow",
      message: sanitizeMessage(err.message),
      ...(provider !== undefined ? { provider } : {}),
    };
  }

  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);

  // Structural HTTP-looking values: {status}/{statusCode}/retryAfterMs.
  if (isRecord(err)) {
    const status =
      typeof err.status === "number"
        ? err.status
        : typeof err.statusCode === "number"
          ? err.statusCode
          : undefined;
    if (status !== undefined) {
      const kind: ProviderErrorKind =
        status === 429
          ? "rate_limit"
          : status === 402
            ? "quota_exceeded"
            : status === 401 || status === 403
              ? "auth"
              : status === 408
                ? "timeout"
                : status >= 500
                  ? "provider_unavailable"
                  : "invalid_request";
      const retryAfterMs =
        typeof err.retryAfterMs === "number" && err.retryAfterMs >= 0
          ? err.retryAfterMs
          : undefined;
      return fromKind(kind, "http-like", message || `HTTP ${status}`, {
        retryAfterMs,
        provider,
      });
    }
  }

  // Last resort: sniff the message for vendor signatures.
  for (const signature of SIGNATURES) {
    if (signature.pattern.test(message)) {
      return fromKind(signature.kind, "vendor-signature", message, { provider });
    }
  }

  return {
    kind: "unknown",
    action: "abort",
    source: "unknown",
    message: sanitizeMessage(message || "unrecognized failure"),
    ...(provider !== undefined ? { provider } : {}),
  };
}
