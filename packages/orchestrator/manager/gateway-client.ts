/**
 * packages/orchestrator/manager/gateway-client.ts
 *
 * `JsonCompletionClient` implementation that routes through the Vercel
 * AI Gateway. Implements the same structural interface as
 * `OpenRouterClient` so it can be substituted at composition-root time
 * when `AI_GATEWAY_API_KEY` is configured. Retries, fallback between
 * models, caching, and rate-limit handling are delegated to the
 * gateway itself — this class is a thin adapter.
 */
import { gatewayChatJson } from "../ai-gateway.js";
import type {
  ChatMessage,
  JsonCompletionClient,
  JsonCompletionRequest,
  JsonCompletionResult,
} from "./openrouter-client.js";

export interface GatewayJsonClientOptions {
  /** Primary model id. Falls back to the gateway default when unset. */
  model?: string;
  /** Optional default temperature override (caller can still pass per-request). */
  defaultTemperature?: number;
  /** Optional max tokens (caller can still pass per-request). */
  defaultMaxTokens?: number;
  /** Per-call timeout in ms; defaults to AI_GATEWAY_TIMEOUT_MS / 20s. */
  timeoutMs?: number;
}

export class GatewayJsonClient implements JsonCompletionClient {
  private readonly model?: string;
  private readonly defaultTemperature?: number;
  private readonly defaultMaxTokens?: number;

  constructor(opts: GatewayJsonClientOptions = {}) {
    this.model = opts.model;
    this.defaultTemperature = opts.defaultTemperature;
    this.defaultMaxTokens = opts.defaultMaxTokens;
  }

  async completeJson(req: JsonCompletionRequest): Promise<JsonCompletionResult> {
    // Collapse the message list into a single system+user pair expected by
    // our gatewayChatJson helper. We preserve system role ordering (first
    // system, everything else flattened into the user turn with role
    // prefixes so multi-turn planning is not lost).
    let systemPrompt = "";
    const userParts: string[] = [];
    for (const m of req.messages) {
      if (m.role === "system" && !systemPrompt) {
        systemPrompt = m.content;
      } else {
        userParts.push(`[${m.role}] ${m.content}`);
      }
    }

    const started = Date.now();
    const result = await gatewayChatJson({
      systemPrompt: systemPrompt || "You are a precise, JSON-only assistant.",
      userPrompt: userParts.join("\n\n"),
      temperature: req.temperature ?? this.defaultTemperature ?? 0.4,
      maxTokens: req.maxTokens ?? this.defaultMaxTokens ?? 4096,
      deadlineMs: 20_000,
    });

    return {
      content: result.text,
      // Echo the model that actually served the response when the gateway
      // surfaces it; otherwise fall back to the requested primary model.
      model: result.model || this.model || "gateway",
      keyIndex: 0,
      attempts: 1,
      latencyMs: result.latencyMs,
      usage: result.usage
        ? {
            promptTokens: result.usage.inputTokens,
            completionTokens: result.usage.outputTokens,
            totalTokens: result.usage.totalTokens,
          }
        : undefined,
    };
  }
}

// Re-export ChatMessage so callers using the gateway path still get typed.
export type { ChatMessage };
