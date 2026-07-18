/**
 * Phase B1 — OpenRouter client for the Manager Agent brain.
 *
 * Typed, JSON-mode wrapper over OpenRouter's OpenAI-compatible
 * /chat/completions, with A2 KeyPool rotation baked in:
 *
 *   402 / 401 / 403 → markExhausted (quota/auth)  → next key this cycle
 *   429             → cooldown (Retry-After wins) → next key
 *   5xx / timeout   → short cooldown              → next key
 *   400 / 4xx other → invalid_request, thrown immediately (rotating won't help)
 *
 * Budget guards: timeoutMs per attempt, retryBudgetMs across attempts,
 * maxAttempts cap (defaults to one rotation through the pool).
 *
 * MODEL NOTE: the Master Plan named "xiaomi/mimo-v2.5-free". Live registry
 * check 2026-07-18: that ID does not exist — xiaomi/mimo-v2.5 is paid-only.
 * The real free tier is xiaomi/mimo-v2-flash:free (309B MoE / 15B active,
 * 256K context), so it is the default; override via OPENROUTER_MODEL.
 */
import { AllKeysExhaustedError, KeyPool, type KeyLease } from "../keys/index.js";
import type { ProviderErrorKind } from "../types/index.js";

/** Live-verified 2026-07-18 (see module docblock). Override: OPENROUTER_MODEL. */
export const DEFAULT_MANAGER_MODEL = "xiaomi/mimo-v2-flash:free";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface JsonCompletionRequest {
  messages: ChatMessage[];
  /** Sampling temperature; default 0.4 (deterministic-leaning planning). */
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface JsonCompletionResult {
  /** Raw model text (JSON-mode; caller parses). */
  content: string;
  /** Model ID echoed by OpenRouter (fallback: requested model). */
  model: string;
  /** Which pool key succeeded — useful for rotation analytics. */
  keyIndex: number;
  /** Attempts consumed (1 = first key worked). */
  attempts: number;
  usage?: CompletionUsage;
  latencyMs: number;
}

/** Structural interface — B4 depends on this, not the concrete client (mockable). */
export interface JsonCompletionClient {
  completeJson(req: JsonCompletionRequest): Promise<JsonCompletionResult>;
}

export interface OpenRouterClientOptions {
  /** Manager-brain keys (AppEnv.openrouterKeys); at least one required. */
  keys: string[];
  model?: string;
  siteUrl?: string;
  siteTitle?: string;
  baseUrl?: string;
  /** Per-attempt timeout; default 15_000. */
  timeoutMs?: number;
  /** Total rotation budget across attempts; default 12_000 (legacy AI_RETRY_BUDGET_MS). */
  retryBudgetMs?: number;
  /** Hard attempt cap; default = key count (one full rotation). */
  maxAttempts?: number;
  /** Cooldown applied to a key after a 429 without Retry-After; default 20_000. */
  rateLimitCooldownMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class OpenRouterError extends Error {
  readonly kind: ProviderErrorKind;
  readonly statusCode?: number;
  readonly retryAfterMs?: number;
  readonly attemptsMade: number;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { statusCode?: number; retryAfterMs?: number; attemptsMade?: number } = {},
  ) {
    super(message);
    this.name = "OpenRouterError";
    this.kind = kind;
    this.attemptsMade = options.attemptsMade ?? 0;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function kindForStatus(status: number): ProviderErrorKind {
  if (status === 429) return "rate_limit";
  if (status === 402) return "quota_exceeded";
  if (status === 401 || status === 403) return "auth";
  if (status === 408) return "timeout";
  if (status >= 500) return "provider_unavailable";
  return "invalid_request";
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number.parseFloat(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  return undefined;
}

function extractApiErrorMessage(data: unknown): string | undefined {
  if (!isRecord(data) || !isRecord(data.error)) return undefined;
  const message = data.error.message;
  return typeof message === "string" ? message : undefined;
}

function extractContent(data: unknown): string | undefined {
  if (!isRecord(data) || !Array.isArray(data.choices)) return undefined;
  const first: unknown = data.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) return undefined;
  const content: unknown = first.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .filter(isRecord)
      .map((part) => part.text)
      .filter((t): t is string => typeof t === "string");
    if (parts.length > 0) return parts.join("");
  }
  return undefined;
}

export class OpenRouterClient implements JsonCompletionClient {
  private readonly pool: KeyPool;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly siteUrl?: string;
  private readonly siteTitle?: string;
  private readonly timeoutMs: number;
  private readonly retryBudgetMs: number;
  private readonly maxAttempts: number;
  private readonly rateLimitCooldownMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: OpenRouterClientOptions) {
    if (!options.keys.length) {
      throw new Error('OpenRouterClient: at least one key is required (set OPENROUTER_API_KEYS)');
    }
    this.pool = new KeyPool(options.keys, { provider: "openrouter", now: options.now });
    this.model = options.model ?? DEFAULT_MANAGER_MODEL;
    this.baseUrl = options.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL;
    if (options.siteUrl !== undefined) this.siteUrl = options.siteUrl;
    if (options.siteTitle !== undefined) this.siteTitle = options.siteTitle;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retryBudgetMs = options.retryBudgetMs ?? 12_000;
    this.maxAttempts = options.maxAttempts ?? options.keys.length;
    this.rateLimitCooldownMs = options.rateLimitCooldownMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async completeJson(req: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const started = this.now();
    let attempts = 0;
    let lastError: OpenRouterError | undefined;

    while (attempts < this.maxAttempts) {
      if (attempts > 0 && this.now() - started >= this.retryBudgetMs) break;

      let lease: KeyLease;
      try {
        lease = this.pool.getNextKey();
      } catch (err) {
        if (err instanceof AllKeysExhaustedError) {
          const kind: ProviderErrorKind =
            err.retryAfterMs !== undefined
              ? "rate_limit"
              : (lastError?.kind ?? "quota_exceeded");
          throw new OpenRouterError(
            kind,
            `No usable OpenRouter keys after ${attempts} attempt(s)`,
            { retryAfterMs: err.retryAfterMs, attemptsMade: attempts, statusCode: lastError?.statusCode },
          );
        }
        throw err;
      }

      attempts += 1;
      try {
        const result = await this.attempt(lease, req);
        this.pool.recordSuccess(lease.key);
        return { ...result, attempts, latencyMs: this.now() - started };
      } catch (err) {
        const mapped =
          err instanceof OpenRouterError
            ? err
            : new OpenRouterError(
                "provider_unavailable",
                err instanceof Error ? err.message : String(err),
                { attemptsMade: attempts },
              );
        lastError = mapped;
        this.applyFailure(lease.key, mapped);
        if (mapped.kind === "invalid_request") throw mapped;
      }
    }

    throw new OpenRouterError(
      lastError?.kind ?? "unknown",
      `OpenRouter request failed after ${attempts} attempt(s): ${lastError?.message ?? "no attempt possible"}`,
      { statusCode: lastError?.statusCode, retryAfterMs: lastError?.retryAfterMs, attemptsMade: attempts },
    );
  }

  private applyFailure(key: string, error: OpenRouterError): void {
    switch (error.kind) {
      case "rate_limit":
        this.pool.recordFailure(key, { cooldownMs: error.retryAfterMs ?? this.rateLimitCooldownMs });
        return;
      case "quota_exceeded":
      case "auth":
        this.pool.markExhausted(key, error.kind);
        return;
      case "timeout":
      case "provider_unavailable":
        this.pool.recordFailure(key, { cooldownMs: 2_000 });
        return;
      default:
        return; // invalid_request / unknown: no rotation value
    }
  }

  private async attempt(
    lease: KeyLease,
    req: JsonCompletionRequest,
  ): Promise<Omit<JsonCompletionResult, "attempts" | "latencyMs">> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lease.key}`,
          "Content-Type": "application/json",
          ...(this.siteUrl ? { "HTTP-Referer": this.siteUrl } : {}),
          ...(this.siteTitle ? { "X-Title": this.siteTitle } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.4,
          max_tokens: req.maxTokens ?? 4096,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
      const data: unknown = await res.json().catch(() => undefined);

      if (!res.ok) {
        const apiMsg = extractApiErrorMessage(data);
        throw new OpenRouterError(
          kindForStatus(res.status),
          `OpenRouter HTTP ${res.status}${apiMsg ? `: ${apiMsg}` : ""}`,
          { statusCode: res.status, retryAfterMs },
        );
      }

      const content = extractContent(data);
      if (content === undefined) {
        const apiMsg = extractApiErrorMessage(data);
        throw new OpenRouterError(
          "provider_unavailable",
          apiMsg ?? "OpenRouter returned no message content",
          { statusCode: res.status },
        );
      }

      const usage = isRecord(data) && isRecord(data.usage) ? data.usage : undefined;
      return {
        content,
        model: isRecord(data) && typeof data.model === "string" ? data.model : this.model,
        keyIndex: lease.index,
        ...(usage
          ? {
              usage: {
                ...(typeof usage.prompt_tokens === "number" ? { promptTokens: usage.prompt_tokens } : {}),
                ...(typeof usage.completion_tokens === "number" ? { completionTokens: usage.completion_tokens } : {}),
                ...(typeof usage.total_tokens === "number" ? { totalTokens: usage.total_tokens } : {}),
              },
            }
          : {}),
      };
    } catch (err) {
      if (err instanceof OpenRouterError) throw err;
      if (isRecord(err) && err.name === "AbortError") {
        throw new OpenRouterError("timeout", `OpenRouter request timed out after ${this.timeoutMs}ms`);
      }
      throw new OpenRouterError(
        "provider_unavailable",
        `OpenRouter network failure: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
