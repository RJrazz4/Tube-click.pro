/**
 * packages/orchestrator/ai-gateway.ts — Vercel AI Gateway client.
 *
 * Single server-side entry point for all LLM text generation. Wraps the
 * Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) pointed at the
 * Vercel AI Gateway so that retries, key rotation, model fallback,
 * rate-limit handling, caching, and observability are managed by the
 * gateway rather than bespoke code.
 *
 * Env:
 *   AI_GATEWAY_API_KEY     (required) Gateway bearer token.
 *   AI_GATEWAY_BASE_URL    (optional) Gateway endpoint; defaults to the
 *                          public Vercel AI Gateway URL.
 *   AI_GATEWAY_PRIMARY     (optional) Primary model id.
 *   AI_GATEWAY_FALLBACKS   (optional) Comma-separated fallback model ids.
 *   AI_GATEWAY_TIMEOUT_MS  (optional) Per-call AbortController timeout.
 *
 * The fallback chain approved in the product brief is:
 *   google/gemini-2.5-flash → meta-llama/llama-3.3-70b-instruct → openai/gpt-4o-mini
 *
 * Fallback is executed by the gateway itself via the
 * `x-vercel-ai-gateway-fallbacks` header; our code only sends the
 * primary model and the gateway replays failed calls against the
 * fallbacks.
 *
 * Export surface is intentionally small: `gatewayChatJson()` for JSON
 * calls and `gatewayChatText()` for free-text calls.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

/** Approved default fallback chain (primary injected separately). */
const DEFAULT_FALLBACKS = [
  "meta-llama/llama-3.3-70b-instruct",
  "openai/gpt-4o-mini",
];

const DEFAULT_BASE_URL = "https://gateway.vercel.sh/v1";
const DEFAULT_PRIMARY = "google/gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 20_000;

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new GatewayConfigError(
      `${name} not configured. Set it in the Vercel project environment variables.`,
    );
  }
  return v;
}

let _model: ReturnType<ReturnType<typeof createOpenAICompatible>> | null = null;
let _bootLog: string | null = null;

/**
 * Build (and cache) the AI SDK language model instance for the gateway.
 * Throws a clean 500-ready message if the key is missing.
 */
export function gatewayModel(customFetch?: typeof fetch) {
  if (_model && !customFetch) return _model;

  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim() ?? "";
  const baseURL = process.env.AI_GATEWAY_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const primary = process.env.AI_GATEWAY_PRIMARY?.trim() || DEFAULT_PRIMARY;
  const fallbacks = readList("AI_GATEWAY_FALLBACKS", DEFAULT_FALLBACKS);

  // Note: the provider's `headers` option accepts a static record (typed
  // Record<string,string> in this release), so we read env at build time.
  // Runtime overrides are uncommon and env-changes require a cold start.
  const staticHeaders: Record<string, string> = {
    "x-vercel-ai-gateway-fallbacks": JSON.stringify(fallbacks),
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://tubeclickpro.in",
    "X-Title": process.env.OPENROUTER_SITE_TITLE || "TubeClick Pro",
  };

  const provider = createOpenAICompatible({
    name: "vercel-ai-gateway",
    apiKey,
    baseURL,
    fetch: customFetch as any,
    headers: staticHeaders,
  });

  const built = provider(primary);
  if (!customFetch) {
    _model = built;
    _bootLog = `[ai-gateway] ready primary=${primary} base=${baseURL} fallbacks=${fallbacks.join(
      " -> ",
    )} timeout=${readNumber("AI_GATEWAY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS)}ms`;
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
   * gateway call. In production the native global fetch is used.
   */
  fetchImpl?: typeof fetch;
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
  /** Token usage, when surfaced by the gateway. */
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

/**
 * Call the gateway for a free-text chat completion.
 */
export async function gatewayChatText(opts: GatewayChatOptions): Promise<GatewayChatResult> {
  // The gateway key is always required. Tests that stub fetch still set
  // AI_GATEWAY_API_KEY to a placeholder so the config path is exercised.
  requireEnv("AI_GATEWAY_API_KEY");
  const model = gatewayModel(opts.fetchImpl);
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
  const modelsAttempted = [primary];

  try {
    const result = await generateText({
      model,
      system: opts.systemPrompt,
      prompt: opts.userPrompt,
      temperature: opts.temperature ?? 0.9,
      maxOutputTokens: opts.maxTokens ?? 8192,
      abortSignal: controller.signal,
      // Retries and model fallback are owned by the Vercel AI Gateway
      // (via the x-vercel-ai-gateway-fallbacks header). The SDK's own
      // retry loop is disabled so errors propagate immediately and our
      // deadline/AbortController governs wall time.
      maxRetries: 0,
    });

    // AI SDK v6 exposes responses via `result.responses[0]` when the gateway
    // served the request; fallbacks are transparent but the model id from
    // the final response tells us which model answered.
    const responseModel = result.response?.modelId ?? (result as any).responses?.[0]?.response?.model ?? primary;
    const failedOver = responseModel !== primary;
    if (failedOver && !modelsAttempted.includes(responseModel)) modelsAttempted.push(responseModel);

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
    };
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * JSON-mode variant. We append a strict-JSON instruction to the system
 * prompt (the gateway handles response_format internally for providers
 * that support it) and return the raw text; callers run their own parse
 * with fallback exactly as they do today.
 */
export async function gatewayChatJson(opts: GatewayChatOptions): Promise<GatewayChatResult> {
  const jsonSystem =
    "Respond with valid JSON only — no markdown, no prose, no code fences, no commentary.";
  const systemPrompt = opts.systemPrompt
    ? `${opts.systemPrompt}\n\n${jsonSystem}`
    : jsonSystem;
  return gatewayChatText({ ...opts, systemPrompt });
}
