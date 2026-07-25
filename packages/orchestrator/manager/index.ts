/**
 * Manager package public surface.
 *
 * Exposes the LLM planner (`ManagerService`) and two JSON-completion
 * clients: `OpenRouterClient` (legacy pooled-OpenRouter) and
 * `GatewayJsonClient` (Vercel AI Gateway adapter). Composition roots
 * choose the appropriate client based on environment configuration.
 */
export * from "./openrouter-client.js";
export * from "./director-schema.js";
export * from "./system-prompt.js";
export * from "./json-extract.js";
export * from "./complexity.js";
export * from "./manager-service.js";
export { GatewayJsonClient } from "./gateway-client.js";
