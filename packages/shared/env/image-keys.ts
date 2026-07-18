/**
 * Phase A1 — Pooled image-provider API keys.
 *
 * IMAGE_API_KEYS carries every image-provider key in ONE env var so the
 * orchestrator can rotate/fallback without redeploys:
 *
 *   IMAGE_API_KEYS="agnes:ak_live_1,ak_live_2;gemini:gk_1;hf:hf_tok;together:tk_1;replicate:rp_1"
 *
 *   - groups separated by ";"
 *   - each group is "<provider>:<key1,key2,...>"
 *   - key order within a pool is preserved (Phase A2 KeyPool rotates round-robin)
 *   - duplicate keys are dropped (first occurrence wins)
 *
 * Zero-Cost Hydra Router support:
 *   - hf: HuggingFace Inference (free tier)
 *   - together: Together AI (free tier)
 *   - replicate: Replicate (free tier)
 *
 * Pollinations is NOT pooled here — it needs no key (see POLLINATIONS_ENABLED).
 *
 * SECURITY: issue messages never echo key material — only provider names
 * and group positions.
 */
import { z } from "zod";

export const IMAGE_PROVIDER_IDS = ["agnes", "gemini", "hf", "together", "replicate"] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

/** Every pool always exists — an empty pool means "provider not configured". */
export interface ImageKeyPools {
  agnes: string[];
  gemini: string[];
  hf: string[];
  together: string[];
  replicate: string[];
}

export function emptyImageKeyPools(): ImageKeyPools {
  return { agnes: [], gemini: [], hf: [], together: [], replicate: [] };
}

/** Report sink for validation problems (wired to Zod ctx.addIssue by the field). */
export type IssueSink = (message: string) => void;

const PROVIDER_ALIASES: Readonly<Record<string, ImageProviderId>> = {
  agnes: "agnes",
  "agnes-flash": "agnes",
  gemini: "gemini",
  "gemini-flash": "gemini",
  hf: "hf",
  huggingface: "hf",
  together: "together",
  togetherai: "together",
  replicate: "replicate",
};

/**
 * Pure parser — never throws. Reports problems through `addIssue` and
 * returns null when any group is malformed.
 *
 * FIX: Now normalizes line endings (CRLF → LF) before parsing to handle
 * env vars that may contain Windows-style line endings from dashboards.
 */
export function parseImageKeyPools(
  raw: string | undefined | null,
  addIssue: IssueSink,
): ImageKeyPools | null {
  const pools = emptyImageKeyPools();
  if (raw === undefined || raw === null || raw.trim() === "") return pools;

  const seen = new Map<ImageProviderId, Set<string>>();

  // FIX: Normalize CRLF to LF before splitting — env vars from dashboards
  // often have \r\n line endings that would silently break the regex match.
  const normalized = raw.replace(/\r\n?/g, "\n");

  const groups = normalized
    .split(";")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);

  let valid = true;
  groups.forEach((group, i) => {
    // FIX: Added \r to the character classes to handle trailing \r from
    // Windows line endings in case any \r slipped through the normalization.
    const match = /^([A-Za-z][A-Za-z0-9-]*)\s*:(.*)$/.exec(group);
    if (!match) {
      // Position only — the group itself may contain secrets.
      addIssue(`group #${i + 1} must use "<provider>:<key1,key2>" format`);
      valid = false;
      return;
    }
    const provider = PROVIDER_ALIASES[match[1].toLowerCase()];
    if (!provider) {
      addIssue(
        `group #${i + 1}: "${match[1].toLowerCase()}" is not a known image provider` +
          ` — expected one of: ${IMAGE_PROVIDER_IDS.join(", ")}`,
      );
      valid = false;
      return;
    }
    const keys = match[2]
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    if (keys.length === 0) {
      addIssue(`pool "${provider}" declares no keys`);
      valid = false;
      return;
    }
    const bucket = seen.get(provider) ?? new Set<string>();
    seen.set(provider, bucket);
    for (const key of keys) bucket.add(key);
  });

  if (!valid) return null;
  for (const [provider, bucket] of seen) pools[provider] = [...bucket];
  return pools;
}

/** Zod field for IMAGE_API_KEYS — a missing var is valid and yields empty pools. */
export const imageKeyPoolsField = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    const pools = parseImageKeyPools(raw, (message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message }),
    );
    return pools ?? z.NEVER;
  });

/**
 * Debug helper: parse and return a detailed report of what was parsed.
 * Used for logging in production to diagnose key configuration issues.
 */
export interface KeyParseReport {
  rawLength: number;
  groupsFound: number;
  parsed: ImageKeyPools;
  errors: string[];
  warnings: string[];
}

export function parseImageKeyPoolsWithReport(raw: string | undefined | null): KeyParseReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const pools = parseImageKeyPools(raw, (msg) => errors.push(msg));

  if (raw === undefined || raw === null || raw.trim() === "") {
    warnings.push("IMAGE_API_KEYS is empty or not set");
  } else if (pools && Object.values(pools).every((arr) => arr.length === 0)) {
    warnings.push("IMAGE_API_KEYS was parsed but all pools are empty");
  }

  // Count groups for report
  const normalized = (raw ?? "").replace(/\r\n?/g, "\n");
  const groupsFound = normalized.split(";").filter((g) => g.trim().length > 0).length;

  return {
    rawLength: (raw ?? "").length,
    groupsFound,
    parsed: pools ?? emptyImageKeyPools(),
    errors,
    warnings,
  };
}
