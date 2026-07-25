/**
 * Vercel Edge Function — POST /api/generate-text
 *
 * TubeBot text generation powered by the Multi-Agent Adversarial Pipeline
 * (WriterAgent + CriticAgent with automated self-correction).
 * Runtime: Edge (low-latency global POPs).
 */

export const config = {
  runtime: "edge",
  maxDuration: 25,
};

import {
  jsonResponse,
  corsHeaders,
  safeJsonBody,
  sanitizeThrownError,
} from "./_shared.js";
import { runAgenticPipeline } from "./_agenticEngine.js";
import { ChatGenerationError } from "./_ai.js";

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { topic, platform, style, language = "hinglish", context, channelMemory } = body.data;

    if (!topic || topic.trim().length < 3) return jsonResponse({ error: "Topic min 3 chars" }, 400);
    if (topic.length > 500) return jsonResponse({ error: "Topic max 500 chars" }, 400);

    const sanitized = topic.trim().slice(0, 500);

    const agentResult = await runAgenticPipeline({
      topic: sanitized,
      platform: platform || "YouTube",
      style: style || "Dramatic",
      language,
      context,
      channelMemory,
    });

    return jsonResponse({
      model: agentResult.model,
      modelsAttempted: agentResult.modelsAttempted,
      agentAudit: agentResult.agentAudit,
      titles: agentResult.titles,
      hooks: agentResult.hooks,
      script: agentResult.script,
      hashtags: agentResult.hashtags,
      description: agentResult.description,
      strategyBrief: agentResult.strategyBrief,
      experimentPlan: agentResult.experimentPlan,
    });
  } catch (e: unknown) {
    console.error("[generate-text:agentic] error:", e);
    if (e instanceof ChatGenerationError) {
      return jsonResponse(
        {
          error: e.message,
          code: e.code,
          service: "generate-text",
          ...(e.retryAfter !== undefined ? { retryAfter: e.retryAfter } : {}),
          ...(e.action ? { action: e.action } : {}),
          ...(e.modelsAttempted.length ? { modelsAttempted: e.modelsAttempted } : {}),
        },
        e.status,
      );
    }
    return jsonResponse(
      { error: sanitizeThrownError(e, "generate-text"), code: "INTERNAL", service: "generate-text" },
      500,
    );
  }
}
