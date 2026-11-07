/**
 * packages/orchestrator/ai-gateway.ts — LLM text generation client.
 *
 * Single server-side entry point for all LLM text generation. Wraps the
 * Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) pointed at
 * OpenRouter (https://openrouter.ai/api/v1).
 *
 * ROUTE DECISION (2026-11-07, Hero): Vercel AI Gateway requires a credit
 * card on file — Hero declined to add one. All generation therefore goes
 * through OpenRouter directly, using the keys already present in the
 * Vercel project env. Do NOT point this back at ai-gateway.vercel.sh
 * unless a card is added AND Hero approves the switch.
 *
 * Env:
 *   OPENROUTER_API_KEY     (primary) OpenRouter bearer token.
 *   OPENROUTER_API_KEY2    (optional) Second key, used when the primary
 *                          key is rejected with an auth error (rotation).
 *   AI_GATEWAY_API_KEY     (legacy fallback) Used only if no OpenRouter
 *                          key is present.
 *   AI_GATEWAY_BASE_URL    (optional) Endpoint override; defaults to the
 *                          public OpenRouter URL.
 *   AI_GATEWAY_PRIMARY     (optional) Primary model id.
 *   AI_GATEWAY_FALLBACKS   (optional) Comma-separated fallback model ids.
 *   AI_GATEWAY_TIMEOUT_MS  (optional) Per-call AbortController timeout.
 *
 * The approved fallback chain is:
 *   google/gemini-2.5-flash → meta-llama/llama-3.3-70b-instruct → openai/gpt-4o-mini
 *
 * OpenRouter has no server-side fallback header, so fallback is executed
 * here in code: the primary model is tried first; on failure each
 * fallback model is tried in order. An auth failure (401/403) on a key
 * rotates to the next configured key before moving to the next model.
 *
 * Export surface is intentionally small: `gatewayChatJson()` for JSON
 * calls and `gatewayChatText()` for free-text calls.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { compressHeadroom, headroomTelemetrySnapshot } from "./headroom/headroom.js";

export { headroomTelemetrySnapshot, type HeadroomReport } from "./headroom/headroom.js";

/** Approved default fallback chain (primary injected separately). */
const DEFAULT_FALLBACKS = [
  "meta-llama/llama-3.3-70b-instruct",
  "openai/gpt-4o-mini",
];

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_PRIMARY = "google/gemini-2.5-flash";
// Raised from 20s to 40s so primary + 2 fallbacks have enough wall-clock
// to complete before our AbortController severs the call. Clone-crush /
// Chain-Loop callers pass an explicit higher deadline (48s) that overrides
// this default, but the generic content-generation path was getting
// aborted mid-fallback producing "Provider hiccup" UPSTREAM_ERRORs.
const DEFAULT_TIMEOUT_MS = 40_000;

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  // Accept only the documented CSV format. A JSON array here would be sent
  // as one malformed model identifier and produce misleading MODEL_NOT_FOUND
  // errors from the gateway.
  if (raw.startsWith("[") || raw.endsWith("]")) {
    console.warn(`[ai-gateway] Ignoring invalid ${name}: expected comma-separated model IDs`);
    return fallback;
  }

  const values = raw
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter((s) => /^[a-z0-9][a-z0-9._/-]*$/i.test(s));
  return [...new Set(values)].length ? [...new Set(values)] : fallback;
}

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
  }
}

/**
 * Resolve the API keys to try, in order. OpenRouter keys come first; the
 * legacy gateway key is a last resort so an old env can never shadow a
 * working OpenRouter key.
 */
function resolveApiKeys(): string[] {
  const names = ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY2", "AI_GATEWAY_API_KEY"];
  const keys: string[] = [];
  for (const name of names) {
    const v = process.env[name]?.trim();
    if (v && !keys.includes(v)) keys.push(v);
  }
  return keys;
}

function requireApiKeys(): string[] {
  const keys = resolveApiKeys();
  if (!keys.length) {
    throw new GatewayConfigError(
      "No LLM API key configured. Set OPENROUTER_API_KEY in the Vercel project environment variables.",
    );
  }
  return keys;
}

/** True when an upstream error looks like a rejected key (rotate, don't retry same key). */
function isAuthError(e: unknown): boolean {
  const status = (e as { statusCode?: number; status?: number })?.statusCode ??
    (e as { status?: number })?.status;
  if (status === 401 || status === 403) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(401|403)\b|unauthori[sz]ed|invalid[^\n]{0,24}api[^\n]{0,4}key/i.test(msg);
}

let _model: ReturnType<ReturnType<typeof createOpenAICompatible>> | null = null;
let _bootLog: string | null = null;

/**
 * Build (and cache, for the default primary/key) the AI SDK language
 * model instance. Throws a clean 500-ready message if no key is set.
 */
export function gatewayModel(customFetch?: typeof fetch, modelId?: string, apiKey?: string) {
  const isDefault = !customFetch && !modelId && !apiKey;
  if (isDefault && _model) return _model;

  const keys = requireApiKeys();
  const baseURL = process.env.AI_GATEWAY_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const primary = process.env.AI_GATEWAY_PRIMARY?.trim() || DEFAULT_PRIMARY;
  const fallbacks = readList("AI_GATEWAY_FALLBACKS", DEFAULT_FALLBACKS);

  // Note: the provider's `headers` option accepts a static record (typed
  // Record<string,string> in this release), so we read env at build time.
  // Runtime overrides are uncommon and env-changes require a cold start.
  const staticHeaders: Record<string, string> = {
    // OpenRouter attribution headers (used for their public rankings).
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://tubeclickpro.in",
    "X-Title": process.env.OPENROUTER_SITE_TITLE || "TubeClick Pro",
  };

  const provider = createOpenAICompatible({
    name: "openrouter",
    apiKey: apiKey ?? keys[0],
    baseURL,
    fetch: customFetch as any,
    headers: staticHeaders,
  });

  const built = provider(modelId ?? primary);
  if (isDefault) {
    _model = built;
    _bootLog = `[ai-gateway] ready primary=${primary} base=${baseURL} fallbacks=${fallbacks.join(
      " -> ",
    )} keys=${keys.length} timeout=${readNumber("AI_GATEWAY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)}ms`;
  }
  return built;
}

/** Emit the boot log once. */
export function logBootConfig(): void {
  if (!_bootLog) gatewayModel();
  if (_bootLog) {
    console.log(_bootLog);
    _bootLog = null;
  }
}

export interface GatewayChatImage {
  /** data: URL (data:image/<mime>;base64,<...>) or https:// URL. */
  url: string;
  /** Optional mime type hint (derived from url when possible). */
  mimeType?: string;
  /** Optional short detail hint: 'low' | 'high' | 'auto' — passed through to the provider. */
  detail?: "low" | "high" | "auto";
}

export interface GatewayChatOptions {
  systemPrompt: string;
  userPrompt: string;
  /** Default 0.9 (creative). */
  temperature?: number;
  /** Default 8192. */
  maxTokens?: number;
  /** Per-call deadline in ms. Defaults to AI_GATEWAY_TIMEOUT_MS or 20s. */
  deadlineMs?: number;
  /** AbortSignal from the caller; combined with internal timeout. */
  signal?: AbortSignal;
  /**
   * Custom fetch implementation — used by tests to stub the upstream
   * call. In production the native global fetch is used.
   */
  fetchImpl?: typeof fetch;
  /** When true, skip Headroom compression on this call. */
  skipHeadroom?: boolean;
  /** Headroom budget cap for the user prompt in chars. */
  headroomMaxUserChars?: number;
  /** Relevance hint terms for SmartCrush. */
  headroomHints?: string[];
  /**
   * Multimodal image inputs attached to the user turn. Each entry is
   * either a data: URL (preferred; base64 inlined) or an https:// URL the
   * provider can fetch. Used by Visual Recon to caption thumbnails.
   * Text-only callers leave this undefined.
   */
  images?: GatewayChatImage[];
}

export interface GatewayChatResult {
  /** Trimmed textual content. */
  text: string;
  /** Canonical model id that produced the response (post-fallback). */
  model: string;
  /** Wall-clock latency in ms. */
  latencyMs: number;
  /** Distinct models attempted, primary first. */
  modelsAttempted: string[];
  /** True when fallback served the response. */
  failedOver: boolean;
  /** Token usage, when surfaced by the provider. */
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  /** Headroom compression report — how much context was optimized pre-call. */
  headroom?: {
    strategiesApplied: string[];
    tokensSavedEstimate: number;
    compressionRatio: number;
    originalChars: number;
    compressedChars: number;
  };
}

/**
 * Call OpenRouter for a free-text chat completion, walking the model
 * fallback chain (and rotating keys on auth errors) until one attempt
 * succeeds or every option is exhausted.
 */
export async function gatewayChatText(opts: GatewayChatOptions): Promise<GatewayChatResult> {
  // A key is always required. Tests that stub fetch still set a key env
  // to a placeholder so the config path is exercised.
  const apiKeys = requireApiKeys();
  if (!opts.fetchImpl) logBootConfig();

  const timeoutMs =
    opts.deadlineMs ?? readNumber("AI_GATEWAY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("gateway-timeout"), timeoutMs);
  const onExternalAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal) opts.signal.addEventListener("abort", onExternalAbort, { once: true });

  const started = Date.now();
  const primary = process.env.AI_GATEWAY_PRIMARY?.trim() || DEFAULT_PRIMARY;
  const fallbacks = readList("AI_GATEWAY_FALLBACKS", DEFAULT_FALLBACKS);
  const chain = [primary, ...fallbacks.filter((m) => m !== primary)];
  const modelsAttempted: string[] = [];

  // ---- HEADROOM GHOST LAYER ----
  // Transparent pre-call compression. Opt-out via `skipHeadroom: true`.
  // Any internal error is swallowed and we fall through to the original
  // prompts — compression is best-effort, never a failure mode.
  let headroomReport: GatewayChatResult["headroom"] = undefined;
  let effectiveSystem = opts.systemPrompt;
  let effectiveUser = opts.userPrompt;
  try {
    if (!opts.skipHeadroom) {
      const compressed = compressHeadroom({
        systemPrompt: opts.systemPrompt,
        userPrompt: opts.userPrompt,
        relevanceHints: opts.headroomHints,
        maxUserChars: opts.headroomMaxUserChars,
      });
      effectiveSystem = compressed.systemPrompt;
      effectiveUser = compressed.userPrompt;
      if (compressed.report.strategiesApplied.length > 0 && compressed.report.compressionRatio > 0) {
        headroomReport = {
          strategiesApplied: compressed.report.strategiesApplied,
          tokensSavedEstimate: compressed.report.tokensSavedEstimate,
          compressionRatio: compressed.report.compressionRatio,
          originalChars: compressed.report.originalChars,
          compressedChars: compressed.report.compressedChars,
        };
        if (compressed.report.tokensSavedEstimate > 0) {
          console.log(
            `[headroom] ratio=${(compressed.report.compressionRatio * 100).toFixed(1)}% tokens_saved~${compressed.report.tokensSavedEstimate} strategies=${compressed.report.strategiesApplied.join(",")}`,
          );
        }
      }
    }
  } catch (hrErr) {
    console.warn("[headroom] compression error, passthrough:", hrErr);
    effectiveSystem = opts.systemPrompt;
    effectiveUser = opts.userPrompt;
  }
  // ---- /HEADROOM ----

  // Build the user turn as a multi-part message when images are attached.
  // AI SDK v6 accepts [{type:'text',text:'...'},{type:'image',image:new URL(...) | data:...}].
  const promptParts: Array<{ type: "text"; text: string } | { type: "image"; image: URL | string; mimeType?: string; }> = [];
  if (Array.isArray(opts.images) && opts.images.length > 0) {
    for (const img of opts.images) {
      if (!img?.url) continue;
      if (img.url.startsWith("data:")) {
        promptParts.push({ type: "image", image: img.url, mimeType: img.mimeType });
      } else {
        try {
          promptParts.push({ type: "image", image: new URL(img.url), mimeType: img.mimeType });
        } catch {
          promptParts.push({ type: "image", image: img.url, mimeType: img.mimeType });
        }
      }
    }
  }
  promptParts.push({ type: "text", text: effectiveUser });

  let lastError: unknown = null;
  let keyIndex = 0;
  try {
    for (const modelId of chain) {
      if (!modelsAttempted.includes(modelId)) modelsAttempted.push(modelId);
      // One model may be retried with the next key after an auth failure;
      // non-auth failures move straight to the next model.
      for (;;) {
        const model = opts.fetchImpl
          ? gatewayModel(opts.fetchImpl)
          : gatewayModel(undefined, modelId, apiKeys[keyIndex]);
        try {
          const result = await generateText({
            model,
            system: effectiveSystem,
            messages: [{ role: "user", content: promptParts }],
            temperature: opts.temperature ?? 0.9,
            maxOutputTokens: opts.maxTokens ?? 8192,
            abortSignal: controller.signal,
            maxRetries: 0,
          });

          // AI SDK v6 exposes the serving model via `result.response.modelId`.
          const responseModel = result.response?.modelId ?? (result as any).responses?.[0]?.response?.model ?? modelId;
          const failedOver = responseModel !== primary || modelId !== primary || keyIndex > 0;

          const text = (result.text ?? "").trim();
          const usage = result.usage
            ? {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens ?? (
                  Number.isFinite((result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0))
                    ? (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0)
                    : undefined
                ),
              }
            : undefined;

          console.log(
            `[ai-gateway] OK model=${responseModel} latency=${Date.now() - started}ms${
              usage?.totalTokens ? ` tokens=${usage.totalTokens}` : ""
            }${failedOver ? " (fallback)" : ""}`,
          );

          return {
            text,
            model: responseModel,
            latencyMs: Date.now() - started,
            modelsAttempted,
            failedOver,
            usage,
            headroom: headroomReport,
          };
        } catch (e) {
          lastError = e;
          // Our own deadline fired — no further attempt can succeed.
          if (controller.signal.aborted) throw e;
          console.error(
            `[ai-gateway] attempt failed model=${modelId} key#${keyIndex + 1} after ${Date.now() - started}ms:`,
            e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          );
          if (!opts.fetchImpl && isAuthError(e) && keyIndex < apiKeys.length - 1) {
            keyIndex += 1;
            continue; // same model, next key
          }
          break; // next model in the chain
        }
      }
    }
    // Every model (and key rotation) exhausted — surface the last failure.
    console.error(
      `[ai-gateway] FAIL after ${Date.now() - started}ms:`,
      lastError instanceof Error ? `${lastError.name}: ${lastError.message}` : String(lastError),
    );
    throw lastError ?? new Error("ai-gateway: no model attempt was made");
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * JSON-mode variant. We append a strict-JSON instruction to the system
 * prompt and return the raw text; callers run their own parse with
 * fallback exactly as they do today.
 */
export async function gatewayChatJson(opts: GatewayChatOptions): Promise<GatewayChatResult> {
  const jsonSystem =
    "Respond with valid JSON only — no markdown, no prose, no code fences, no commentary.";
  const systemPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n${jsonSystem}`
    : jsonSystem;
  return gatewayChatText({ ...opts, systemPrompt });
}
