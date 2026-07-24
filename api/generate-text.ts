/**
 * Vercel Edge Function — /api/generate-text
 * TubeBot AI Agent text generation.
 *
 * Phase F3 (Master Plan): the SINGLE, authoritative chat-text path. Backed by
 * api/_ai.ts → packages/orchestrator OpenRouterClient (KeyPool rotation +
 * per-attempt timeouts + retry budget + model failover). Server keys only,
 * read from process.env; runtime edge (fastest for the US audience).
 *
 * maxDuration 25s (approved budget). The internal AI deadline (17s) sits well
 * inside it so the function always returns a typed response — never a dropped
 * connection ("Ghost tunnel interference").
 */

export const config = {
  runtime: "edge",
  // Approved hard cap. Keeps the edge function from being severed mid-flight,
  // which previously surfaced to users as a transport-level failure.
  maxDuration: 25,
};

import {
  jsonResponse,
  cleanupJson,
  corsHeaders,
  safeJsonBody,
  sanitizeThrownError,
} from "./_shared.js";
import { generateChatJson, ChatGenerationError } from "./_ai.js";

function normalize(arr: unknown, fallback: string[]) {
  if (!Array.isArray(arr)) return fallback;
  const n = arr.filter((v): v is string => typeof v === "string").map(v => v.trim()).filter(Boolean);
  return n.length ? n : fallback;
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // Parse request body with explicit error handling
    const body = await safeJsonBody(req);
    if (body.error) return jsonResponse({ error: body.error }, 400);
    const { topic, platform, style, language = "hinglish", context } = body.data;

    if (!topic || topic.trim().length < 3) return jsonResponse({ error: "Topic min 3 chars" }, 400);
    if (topic.length > 500) return jsonResponse({ error: "Topic max 500 chars" }, 400);

    const sanitized = topic.trim().slice(0, 500);

    let langInstr = "";
    switch (language.toLowerCase()) {
      case "hindi": langInstr = "Write EVERYTHING in pure Hindi (Devanagari)."; break;
      case "english": langInstr = "Write everything in fluent English."; break;
      default: langInstr = "Write EVERYTHING in Cinematic Hinglish (Romanized Hindi + English blend)."; break;
    }

    const systemPrompt = `You are a viral YouTube content strategist.\n${langInstr}\nRespond in exact JSON: { "titles": [...5], "hooks": [...10], "script": "60s script narration only", "hashtags": [...10], "description": "SEO desc" }`;

    // Optional Chain-Loop handoff context (free-text): when present, instruct
    // the model to BUILD ON the supplied intel rather than start from scratch.
    const contextBlock =
      typeof context === "string" && context.trim().length > 0
        ? `\n\nIncoming intel from a completed Chain-Loop package — use this as the creative foundation. Expand and rework it into fresh, original assets; do not merely repeat it:\n"""${context.trim().slice(0, 4000)}"""`
        : "";

    const userPrompt = `Topic: ${sanitized}\nPlatform: ${platform}\nStyle: ${style}\nLanguage: ${language}\nGenerate viral content as specified.${contextBlock}`;

    const outcome = await generateChatJson({ systemPrompt, userPrompt });

    let parsed: any;
    try {
      parsed = JSON.parse(cleanupJson(outcome.content));
    } catch {
      parsed = { titles: [`🔥 ${sanitized}`], hooks: ["Start with truth"], script: outcome.content, hashtags: ["#viral"], description: sanitized };
    }

    return jsonResponse({
      model: outcome.model,
      ...(outcome.failedOver ? { modelFailover: outcome.modelsAttempted } : {}),
      titles: normalize(parsed.titles, [`🔥 ${sanitized}`]).slice(0, 5),
      hooks: normalize(parsed.hooks, ["Hook"]).slice(0, 10),
      script: typeof parsed.script === "string" ? parsed.script.trim() : outcome.content,
      hashtags: normalize(parsed.hashtags, ["#viral"]).slice(0, 10),
      description: typeof parsed.description === "string" ? parsed.description.trim() : sanitized,
    });
  } catch (e: unknown) {
    console.error("[generate-text] error:", e);
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
