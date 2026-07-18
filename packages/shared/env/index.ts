/**
 * Phase A1 — Zod-validated server environment (fail-fast at boot).
 *
 *   const env = loadEnv();            // throws EnvValidationError on bad config
 *   console.log(summarizeEnv(env));   // counts + flags only — zero key material
 *
 * Variables:
 *   IMAGE_API_KEYS          pooled provider keys: "agnes:k1,k2;gemini:k3;hf:k4"
 *   OPENROUTER_API_KEYS     manager-brain keys, comma-separated (preferred)
 *   OPENROUTER_API_KEY      legacy singular alias (used when plural absent)
 *   POLLINATIONS_ENABLED    "true"/"false"/"1"/"0" — default true
 *   TIER_LIMITS             JSON override deep-merged onto tier defaults
 *
 * SERVER-ONLY: never import this module from src/ — Vite would inline it
 * into the client bundle. Consumers: api/* edge functions and
 * packages/orchestrator (Phase B onward).
 */
import { z } from "zod";

import {
  imageKeyPoolsField,
  type ImageKeyPools,
} from "./image-keys.js";
import {
  tierLimitsField,
  type ResolvedTierLimits,
} from "./tier-limits.js";

export * from "./image-keys.js";
export * from "./tier-limits.js";

/** Fully-parsed, fail-fast validated server configuration. */
export interface AppEnv {
  imageKeyPools: ImageKeyPools;
  /** Manager-brain credential pool (Phase B); [] when unconfigured. */
  openrouterKeys: string[];
  /** Override for the manager model ID; undefined = code-pinned default. */
  openrouterModel?: string;
  pollinationsEnabled: boolean;
  tierLimits: ResolvedTierLimits;
}

export type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      `[env] invalid server environment (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n` +
        issues.map((i) => `  - ${i}`).join("\n"),
    );
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

const openrouterKeysField = z
  .string()
  .optional()
  .transform((raw, ctx) => {
    if (raw === undefined || raw.trim() === "") return [];
    const keys = [
      ...new Set(
        raw
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0),
      ),
    ];
    if (keys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "is set but contains no usable keys",
      });
      return z.NEVER;
    }
    return keys;
  });

const TRUE_VALUES = new Set(["true", "1"]);
const FALSE_VALUES = new Set(["false", "0"]);

const booleanField = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === "") return defaultValue;
      const normalized = raw.trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) return true;
      if (FALSE_VALUES.has(normalized)) return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `must be "true"/"false"/"1"/"0" — got "${raw.trim()}"`,
      });
      return z.NEVER;
    });

const appEnvInputSchema = z.object({
  IMAGE_API_KEYS: imageKeyPoolsField,
  OPENROUTER_KEYS: openrouterKeysField,
  OPENROUTER_MODEL: z.string().trim().min(1).optional(),
  POLLINATIONS_ENABLED: booleanField(true),
  TIER_LIMITS: tierLimitsField,
});

/**
 * Validate a raw environment source. Throws {@link EnvValidationError}
 * listing every problem (paths labelled with the real variable names).
 */
export function parseEnv(source: EnvSource): AppEnv {
  // Plural (pooled) form wins; legacy singular is the fallback.
  const openrouterRaw = source.OPENROUTER_API_KEYS ?? source.OPENROUTER_API_KEY;

  const result = appEnvInputSchema.safeParse({
    IMAGE_API_KEYS: source.IMAGE_API_KEYS,
    OPENROUTER_KEYS: openrouterRaw,
    OPENROUTER_MODEL: source.OPENROUTER_MODEL,
    POLLINATIONS_ENABLED: source.POLLINATIONS_ENABLED,
    TIER_LIMITS: source.TIER_LIMITS,
  });

  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => {
        const field = issue.path.join(".") || "(env)";
        const label =
          field === "OPENROUTER_KEYS" ? "OPENROUTER_API_KEYS/OPENROUTER_API_KEY" : field;
        return `${label}: ${issue.message}`;
      }),
    );
  }

  const env: AppEnv = {
    imageKeyPools: result.data.IMAGE_API_KEYS,
    openrouterKeys: result.data.OPENROUTER_KEYS,
    pollinationsEnabled: result.data.POLLINATIONS_ENABLED,
    tierLimits: result.data.TIER_LIMITS,
  };
  if (result.data.OPENROUTER_MODEL !== undefined) {
    env.openrouterModel = result.data.OPENROUTER_MODEL;
  }
  return env;
}

/** Validate `process.env` (or an injected source) — fail-fast at boot. */
export function loadEnv(source: EnvSource = process.env): AppEnv {
  return parseEnv(source);
}

/** Mask a credential for logs; never exposes more than 6 original chars. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-2)}`;
}

/** Boot-log snapshot — counts/flags only, zero key material. */
export function summarizeEnv(env: AppEnv): Record<string, number | boolean | string> {
  return {
    agnesKeys: env.imageKeyPools.agnes.length,
    geminiKeys: env.imageKeyPools.gemini.length,
    hfKeys: env.imageKeyPools.hf.length,
    openrouterKeys: env.openrouterKeys.length,
    pollinationsEnabled: env.pollinationsEnabled,
    freeMaxScenes: env.tierLimits.free.maxScenes ?? "unlimited",
    proMaxScenes: env.tierLimits.pro.maxScenes ?? "unlimited",
    cinematicMaxScenes: env.tierLimits.cinematic.maxScenes ?? "unlimited",
  };
}
